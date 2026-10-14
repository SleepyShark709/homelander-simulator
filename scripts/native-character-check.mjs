import { chromium } from '@playwright/test';
import fs from 'node:fs';
fs.mkdirSync('.artifacts/native-character', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } }), errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://127.0.0.1:5173/?preview=character');
await page.waitForFunction(() => window.studio?.person, { timeout: 30000 });
const report = await page.evaluate(async () => {
    const s = window.studio, p = s.person;
    s.renderer.setAnimationLoop(null);
    const T = await import('/node_modules/.vite/deps/three.js');
    const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const { clone } = await import('/node_modules/three/examples/jsm/utils/SkeletonUtils.js');
    const cache = await (await fetch('/.asset-source/mesh2motion-adapted-runs/player.json')).json();
    const originals = {};
    for (const name of ['base', 'addon']) originals[name] = await new GLTFLoader().loadAsync(`/.asset-source/mesh2motion/human-${name}-animations.glb`);
    const sourceNames = Object.fromEntries(p.assets.models.get('person').parser.json.animations.map(a => [a.name,a.extras]));
    const chains = ['l','r'].flatMap(side => [
        ['clavicle','upperarm'], ['upperarm','lowerarm'], ['lowerarm','hand'], ['hand','middle_01'],
        ['thigh','calf'], ['calf','foot'], ['foot','ball'],
    ].map(pair => pair.map(name => `${name}_${side}`)));
    const checks = [];
    for (const [name, {bundle,sourceClip:sourceName,retargeted}] of Object.entries(sourceNames)) {
        const original = originals[bundle], reference = new T.AnimationMixer(original.scene);
        const raw = original.animations.find(a => a.name === sourceName);
        const referenceAction = reference.clipAction(raw).setLoop(T.LoopOnce, 1);
        referenceAction.clampWhenFinished = true;
        referenceAction.play();
        p.mixer.stopAllAction(); p.current = ''; p.play(name);
        p.actions.get(name).setLoop(T.LoopOnce, 1).clampWhenFinished = true;
        p.model.rotation.set(0,0,0); p.model.position.set(0,0,0);
        let maxJointError = 0, maxVertexError = 0, maxChainLengthError = 0;
        const pairs = raw.tracks.filter(t => t.name.endsWith('.quaternion')).map(t => {
            const bone = t.name.slice(0,-11);
            return [p.model.getObjectByName(bone), original.scene.getObjectByName(bone)];
        });
        let nativeMesh, referenceMesh;
        p.model.traverse(o => { if (o.isSkinnedMesh) nativeMesh = o; });
        original.scene.traverse(o => { if (o.isSkinnedMesh) referenceMesh = o; });
        const adaptedScene = retargeted ? clone(originals.addon.scene) : null;
        const adaptedMixer = adaptedScene ? new T.AnimationMixer(adaptedScene) : null;
        let adaptedMesh, maxDeformationRotationError = 0, finiteSkin = true;
        if (adaptedScene) {
            adaptedScene.traverse(o => {if(o.isSkinnedMesh) adaptedMesh = o;});
            const action = adaptedMixer.clipAction(T.AnimationClip.parse(cache.clips.find(c => c.name === name))).setLoop(T.LoopOnce,1);
            action.clampWhenFinished = true; action.play();
        }
        for (let frame = 0; frame <= 240; frame++) {
            const time = raw.duration * frame / 240;
            p.mixer.setTime(time); reference.setTime(time);
            adaptedMixer?.setTime(time); adaptedScene?.updateMatrixWorld(true);
            p.model.updateMatrixWorld(true); original.scene.updateMatrixWorld(true);
            const inverse = p.model.matrixWorld.clone().invert();
            const referenceInverse = original.scene.matrixWorld.clone().invert();
            const expectedRoot = adaptedScene ?? original.scene;
            const expectedInverse = expectedRoot.matrixWorld.clone().invert();
            for (const [a,b] of pairs) {
                const actual = a.getWorldPosition(new T.Vector3()).applyMatrix4(inverse);
                const expected = expectedRoot.getObjectByName(b.name).getWorldPosition(new T.Vector3()).applyMatrix4(expectedInverse);
                maxJointError = Math.max(maxJointError, actual.distanceTo(expected));
                if (retargeted) {
                    const k = nativeMesh.skeleton.bones.indexOf(a), j = referenceMesh.skeleton.bones.indexOf(b);
                    const q = (bone,bind) => new T.Quaternion().setFromRotationMatrix(new T.Matrix4().multiplyMatrices(bone.matrixWorld,bind)).normalize();
                    maxDeformationRotationError = Math.max(maxDeformationRotationError,q(a,nativeMesh.skeleton.boneInverses[k]).angleTo(q(b,referenceMesh.skeleton.boneInverses[j]))*180/Math.PI);
                }
            }
            for (const [a,b] of chains) {
                const length = (root, inverse) => root.getObjectByName(a).getWorldPosition(new T.Vector3()).applyMatrix4(inverse)
                    .distanceTo(root.getObjectByName(b).getWorldPosition(new T.Vector3()).applyMatrix4(inverse));
                maxChainLengthError = Math.max(maxChainLengthError, Math.abs(length(p.model,inverse) - length(expectedRoot,expectedInverse)));
            }
            const count = nativeMesh.geometry.attributes.position.count;
            for (let i = 0; i < count; i += Math.max(1, Math.floor(count / 80))) {
                const point = (mesh, inverse) => {
                    const v = new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i);
                    return mesh.applyBoneTransform(i,v).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
                };
                const actual = point(nativeMesh,inverse);
                finiteSkin &&= actual.toArray().every(Number.isFinite);
                maxVertexError = Math.max(maxVertexError, actual.distanceTo(point(adaptedMesh ?? referenceMesh,expectedInverse)));
            }
        }
        checks.push({ name: `${name}: complete skeleton and skin match ${retargeted ? 'verified tool output; deformation matches stock source' : 'native stock source'}`, pass: pairs.length === 66 && finiteSkin && maxJointError < 1e-4 && maxChainLengthError < 1e-4 && maxVertexError < 1e-4 && maxDeformationRotationError < .2,
            sourceName,bundle,retargeted,bones: pairs.length, maxJointError, maxChainLengthError, maxVertexError,maxDeformationRotationError });
        reference.stopAllAction(); reference.uncacheRoot(original.scene);
        if (adaptedMixer) {adaptedMixer.stopAllAction();adaptedMixer.uncacheRoot(adaptedScene);}
    }
    p.mixer.stopAllAction(); p.current = ''; p.previousMode = 'ground'; p.landingTime = 0;
    for (let i = 0; i < 90; i++) p.update(1/60,i/60,'fly',0);
    s.camera.position.set(2.2,1.5,3.8); s.controls.target.set(0,1.05,0); s.controls.update();
    s.renderer.render(s.scene,s.camera);
    window.nativePose = name => {
        p.mixer.stopAllAction(); p.current = ''; p.play(name);
        p.model.position.set(0,0,0); p.model.rotation.set(0,0,0);
        p.mixer.setTime(p.actionDuration(name) * .35);
        s.renderer.render(s.scene,s.camera);
    };
    return { checks };
});
await page.screenshot({ path: '.artifacts/native-character/hover-side.png' });
for (const pose of ['walk','jog','sprint','punch','fly','land','slam']) {
    await page.evaluate(pose => window.nativePose(pose), pose);
    await page.screenshot({ path: `.artifacts/native-character/${pose}.png` });
}
const result = { ...report, errors, retargetedClips: ['jog','sprint'] };
fs.writeFileSync('.artifacts/native-character-check.json', JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
await browser.close();
if (errors.length || report.checks.some(c => !c.pass)) process.exitCode = 1;
