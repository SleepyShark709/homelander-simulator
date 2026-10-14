// Offline asset preparation using the unchanged Mesh2Motion MIT retargeter.
// No authored poses, rotation corrections or runtime retargeting.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const commit = fs.readFileSync('scripts/vendor/mesh2motion/UPSTREAM_COMMIT','utf8').trim();
const provenance = JSON.parse(fs.readFileSync('.asset-source/mesh2motion/provenance.json'));
assert.equal(commit, provenance.commit);
const inputs = Object.fromEntries(['base','addon'].map(bundle => {
    const path = `.asset-source/mesh2motion/human-${bundle}-animations.glb`;
    const sha256 = hash(fs.readFileSync(path));
    assert.equal(sha256,provenance.sources.find(s => s.file === path).sha256);
    return [bundle,{path,sha256}];
}));
const coreFiles = ['src/lib/ModalDialog.ts','src/retarget/RetargetUtils.ts',
    ...['ChainTwistAdditive','HumanChainConfig','Joint','Pose','Quat','Retargeter','Rig','RigItem','Transform','Vec3'].map(name => `src/retarget/human-retargeting/${name}.ts`)];
assert.deepEqual(fs.readFileSync('.asset-source/mesh2motion-code/core-files.txt','utf8').trim().split('\n').sort(),[...coreFiles].sort());
const library = Object.fromEntries(coreFiles.map(path => {
    const bytes = fs.readFileSync(`scripts/vendor/mesh2motion/${path}`);
    assert.ok(bytes.equals(fs.readFileSync(`.asset-source/mesh2motion-code/${path}`)),`Modified upstream library: ${path}`);
    return [path,hash(bytes)];
}));
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror',e => errors.push(e.message));
    await page.goto('http://127.0.0.1:5173/?preview=character');
    await page.waitForFunction(() => window.studio?.person);
    const result = await page.evaluate(async () => {
        const T = await import('/node_modules/.vite/deps/three.js');
        const {GLTFLoader} = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
        const {clone} = await import('/node_modules/three/examples/jsm/utils/SkeletonUtils.js');
        const {Rig} = await import('/scripts/vendor/mesh2motion/src/retarget/human-retargeting/Rig.ts');
        const {Retargeter} = await import('/scripts/vendor/mesh2motion/src/retarget/human-retargeting/Retargeter.ts');
        const {HumanChainConfig} = await import('/scripts/vendor/mesh2motion/src/retarget/human-retargeting/HumanChainConfig.ts');
        const {RetargetUtils} = await import('/scripts/vendor/mesh2motion/src/retarget/RetargetUtils.ts');
        window.studio.renderer.setAnimationLoop(null);
        const loader = new GLTFLoader();
        const sourceAsset = await loader.loadAsync('/.asset-source/mesh2motion/human-base-animations.glb');
        const targetAsset = await loader.loadAsync('/.asset-source/mesh2motion/human-addon-animations.glb');
        const config = structuredClone(HumanChainConfig.mesh2motion_config);
        // Include the stock shoulders, toes and terminal joints; all axes and
        // bind-pose corrections are computed by the upstream tool itself.
        for (const side of ['L','R']) {
            const suffix = side.toLowerCase(), ball = sourceAsset.scene.getObjectByName(`ball_${suffix}`);
            config[`arm${side}`].unshift(`clavicle_${suffix}`);
            config[`leg${side}`].push(ball.name,...ball.children.filter(o => o.isBone).map(o => o.name));
        }
        config.head.push('head_leaf');
        const build = scene => {
            RetargetUtils.reset_skinned_mesh_to_rest_pose(scene);
            const bones = []; scene.traverse(o => {if(o.isBone) bones.push(o);});
            const rig = new Rig(new T.Skeleton(bones)).fromConfig(config);
            // The two rigs have the same three spine joints. Use the tool's
            // per-joint chain mapping, retaining parent-before-child order.
            const ordered = {};
            for (const [key,items] of Object.entries(rig.chains)) {
                if (key === 'spine') items.forEach((item,i) => ordered[`spine${i}`] = [item]);
                else ordered[key] = items;
            }
            for (const key of Object.keys(rig.chains)) delete rig.chains[key];
            Object.assign(rig.chains,ordered);
            return rig;
        };
        const mesh = scene => {let found;scene.traverse(o => {if(o.isSkinnedMesh) found = o;});return found;};
        const deformation = (bone,inverse) => new T.Quaternion().setFromRotationMatrix(new T.Matrix4().multiplyMatrices(bone.matrixWorld,inverse)).normalize();
        const clips = [], checks = [];
        for (const [name,sourceName] of [['jog','Jog'],['sprint','Sprint']]) {
            const source = clone(sourceAsset.scene), target = clone(targetAsset.scene);
            const sourceRig = build(source), targetRig = build(target);
            const mapped = new Set(Object.values(targetRig.chains).flat().map(item => targetRig.skel.bones[item.idx].name));
            if (mapped.size !== 65 || mapped.has('root') || targetRig.skel.bones.length !== 66) throw new Error('Incomplete humanoid mapping');
            const sourceRoot = source.getObjectByName('root'), targetRoot = target.getObjectByName('root');
            if (sourceRoot.quaternion.angleTo(targetRoot.quaternion) > 1e-6 || sourceRoot.position.distanceTo(targetRoot.position) > 1e-6) throw new Error('Root bind changed');
            const input = sourceAsset.animations.find(clip => clip.name === sourceName);
            const rootTracks = input.tracks.filter(track => track.name.startsWith('root.'));
            if (rootTracks.length !== 3 || rootTracks.some(track => {
                const size = track.getValueSize();
                return track.values.some((value,i) => Math.abs(value - track.values[i % size]) > 1e-6);
            })) throw new Error('Root motion requires explicit mapping');
            const tool = new Retargeter(sourceRig,targetRig,input);
            tool.action.setLoop(T.LoopOnce,1); tool.action.clampWhenFinished = true;
            const capture = new Map(targetRig.skel.bones.map(bone => [bone.name,{times:[],position:[],quaternion:[],scale:[]}]));
            const sourceMesh = mesh(source), targetMesh = mesh(target);
            let last = 0, maxDeformationRotationError = 0, worst;
            const frames = Math.ceil(input.duration * 120);
            for (let i = 0; i <= frames; i++) {
                const time = Math.min(i / 120,input.duration);
                // Capture actual t=0 and the clamped endpoint, without the
                // upstream bake helper's one-frame advance before its t=0.
                tool.update(time - last); last = time;
                source.updateMatrixWorld(true); target.updateMatrixWorld(true);
                for (let j = 0; j < sourceMesh.skeleton.bones.length; j++) {
                    const a = sourceMesh.skeleton.bones[j], k = targetMesh.skeleton.bones.findIndex(bone => bone.name === a.name);
                    const error = deformation(a,sourceMesh.skeleton.boneInverses[j]).angleTo(deformation(targetMesh.skeleton.bones[k],targetMesh.skeleton.boneInverses[k])) * 180 / Math.PI;
                    if (error > maxDeformationRotationError) {maxDeformationRotationError = error;worst = {time,bone:a.name};}
                }
                for (const bone of targetRig.skel.bones) {
                    const data = capture.get(bone.name); data.times.push(time);
                    for (const property of ['position','quaternion','scale']) data[property].push(...bone[property].toArray());
                }
            }
            if (maxDeformationRotationError > .15) throw new Error(`${name}: reference deformation differs ${maxDeformationRotationError} degrees`);
            const tracks = [];
            for (const [bone,data] of capture) for (const property of ['position','quaternion','scale']) {
                const Track = property === 'quaternion' ? T.QuaternionKeyframeTrack : T.VectorKeyframeTrack;
                tracks.push(new Track(`${bone}.${property}`,data.times,data[property]));
            }
            clips.push({...T.AnimationClip.toJSON(new T.AnimationClip(name,input.duration,tracks)),sourceName,bundle:'base'});
            checks.push({name,sourceName,bones:66,mapped:65,tracks:198,frames:frames+1,maxDeformationRotationError,worst});
        }
        return {clips,checks};
    });
    assert.deepEqual(errors,[]);
    const metadata = {tool:'Mesh2Motion Human Retargeter',license:'MIT',commit,inputs,library,
        adapterSha256:hash(fs.readFileSync('scripts/adapt-native-runs.mjs')),sampleRate:120,
        targetBundle:'addon',keyframesAuthoredHere:false,checks:result.checks,
        outputSha256:hash(Buffer.from(JSON.stringify(result.clips)))};
    const folder = '.asset-source/mesh2motion-adapted-runs';
    fs.mkdirSync(folder,{recursive:true}); fs.mkdirSync('.artifacts',{recursive:true});
    fs.writeFileSync(`${folder}/player.json`,JSON.stringify({metadata,clips:result.clips})+'\n');
    fs.writeFileSync(`${folder}/provenance.json`,JSON.stringify(metadata,null,2)+'\n');
    fs.writeFileSync('.artifacts/run-adaptation.json',JSON.stringify({metadata,errors},null,2)+'\n');
    console.log(JSON.stringify({checks:result.checks,errors},null,2));
} finally {await browser.close();}
