import { chromium } from '@playwright/test';
import fs from 'node:fs';

const label = process.argv[2] ?? 'current';
fs.mkdirSync('.artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://127.0.0.1:5173/?preview=character');
await page.waitForFunction(() => window.studio?.person, { timeout: 20000 });
const report = await page.evaluate(async () => {
    const T = await import('/node_modules/.vite/deps/three.js');
    const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const originals = {};
    for (const bundle of ['base','addon']) originals[bundle] = await new GLTFLoader().loadAsync(`/.asset-source/mesh2motion/human-${bundle}-animations.glb`);
    const s = window.studio, p = s.person;
    s.renderer.setAnimationLoop(null);
    s.camera.position.set(0, 1.6, 3.9);
    s.controls.target.set(0, 1.02, 0);
    s.controls.update();
    const direction = (a, b) => b.getWorldPosition(b.position.clone()).sub(a.getWorldPosition(a.position.clone())).normalize();
    const checks = [];
    for (const [clip, speed] of [['walk', 1.5], ['jog', 4], ['sprint', 12]]) {
        p.mixer.stopAllAction();
        p.current = '';
        p.previousMode = 'ground';
        p.landingTime = 0;
        p.update(0, 0, 'ground', speed);
        const action = p.actions.get(clip);
        action.timeScale = 1;
        const {sourceClip:sourceName,bundle,retargeted} = p.assets.models.get('person').parser.json.animations.find(a => a.name === clip).extras;
        const original = originals[bundle];
        const reference = new T.AnimationMixer(original.scene);
        reference.clipAction(original.animations.find(a => a.name === sourceName)).play();
        const previous = {}, wristBend = [], wristStep = [], leftSwing = [], rightSwing = [], sourceLeftSwing = [], sourceRightSwing = [];
        let maxArmRotationError = 0, maxTorsoLean = 0, maxSourceTorsoLean = 0, maxTorsoLeanDifference = 0;
        let actualMesh, sourceMesh;
        p.model.traverse(o => {if(o.isSkinnedMesh) actualMesh = o;});
        original.scene.traverse(o => {if(o.isSkinnedMesh) sourceMesh = o;});
        const deformation = (root,mesh,name) => {
            const bone = root.getObjectByName(name), index = mesh.skeleton.bones.indexOf(bone);
            return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().multiplyMatrices(bone.matrixWorld,mesh.skeleton.boneInverses[index])).normalize();
        };
        for (let i = 0; i <= 180; i++) {
            const time = action.getClip().duration * i / 180;
            p.mixer.setTime(time); reference.setTime(time);
            p.group.updateMatrixWorld(true);
            original.scene.updateMatrixWorld(true);
            const pelvis = p.model.getObjectByName('pelvis');
            const lean = root => direction(root.getObjectByName('pelvis'),root.getObjectByName('spine_03')).angleTo(new T.Vector3(0,1,0)) * 180 / Math.PI;
            maxTorsoLean = Math.max(maxTorsoLean,lean(p.model));
            maxSourceTorsoLean = Math.max(maxSourceTorsoLean,lean(original.scene));
            maxTorsoLeanDifference = Math.max(maxTorsoLeanDifference,Math.abs(lean(p.model)-lean(original.scene)));
            const rootZ = pelvis.getWorldPosition(new T.Vector3()).z;
            leftSwing.push(p.model.getObjectByName('hand_l').getWorldPosition(new T.Vector3()).z - rootZ);
            rightSwing.push(p.model.getObjectByName('hand_r').getWorldPosition(new T.Vector3()).z - rootZ);
            const sourceZ = original.scene.getObjectByName('pelvis').getWorldPosition(new T.Vector3()).z;
            sourceLeftSwing.push(original.scene.getObjectByName('hand_l').getWorldPosition(new T.Vector3()).z - sourceZ);
            sourceRightSwing.push(original.scene.getObjectByName('hand_r').getWorldPosition(new T.Vector3()).z - sourceZ);
            for (const side of ['l', 'r']) {
                const elbow = p.model.getObjectByName(`lowerarm_${side}`);
                const wrist = p.model.getObjectByName(`hand_${side}`);
                const finger = p.model.getObjectByName(`middle_01_${side}`);
                const bend = direction(elbow, wrist).angleTo(direction(wrist, finger)) * 180 / Math.PI;
                wristBend.push({ frame: i, side, degrees: bend });
                if (previous[side]) wristStep.push(wrist.quaternion.angleTo(previous[side]) * 180 / Math.PI);
                previous[side] = wrist.quaternion.clone();
                for (const part of ['clavicle', 'upperarm', 'lowerarm', 'hand', 'middle_01', 'middle_02', 'middle_03']) {
                    const name = `${part}_${side}`;
                    const actual = retargeted ? deformation(p.model,actualMesh,name) : p.model.getObjectByName(name).quaternion.clone().normalize();
                    const expected = retargeted ? deformation(original.scene,sourceMesh,name) : original.scene.getObjectByName(name).quaternion.clone().normalize();
                    maxArmRotationError = Math.max(maxArmRotationError,actual.angleTo(expected));
                }
            }
        }
        const maxBend = Math.max(...wristBend.map(v => v.degrees));
        const maxStep = Math.max(...wristStep);
        // A fixed wrist angle cannot classify authored running styles. Preserve
        // the source arm/finger rotations and check the actual requested posture.
        checks.push({ name: `${clip}: complete arm and finger deformation matches the original stock clip`, pass: maxArmRotationError < (retargeted ? .002 : 1e-4), sourceName, maxArmRotationError, maxBend });
        checks.push({ name: `${clip}: wrists move continuously`, pass: maxStep < 7, maxStep });
        if (clip !== 'walk') {
            const mean = values => values.reduce((sum,v) => sum+v,0) / values.length;
            const variance = values => values.reduce((sum,v) => sum+(v-mean(values))**2,0);
            const correlation = (left,right) => left.reduce((sum,v,i) => sum+(v-mean(left))*(right[i]-mean(right)),0)/Math.sqrt(variance(left)*variance(right));
            const armCorrelation = correlation(leftSwing,rightSwing), sourceArmCorrelation = correlation(sourceLeftSwing,sourceRightSwing);
            // The user selected the forward-leaning Jog/Sprint audition. Compare
            // against that actual source posture, rather than Run_Female's style.
            checks.push({ name: `${clip}: approved stock posture and alternating arm timing preserved`, pass: maxTorsoLeanDifference < 3 && Math.abs(armCorrelation-sourceArmCorrelation) < .03 && armCorrelation < 0, maxTorsoLean,maxSourceTorsoLean,maxTorsoLeanDifference,armCorrelation,sourceArmCorrelation });
        }
        reference.stopAllAction(); reference.uncacheRoot(original.scene);
    }
    p.mixer.stopAllAction(); p.current = ''; p.previousMode = 'ground'; p.landingTime = 0;
    p.update(0, 0, 'ground', 0);
    let maxWeight = 0, maxPoseStep = 0, previousPose, worstStep;
    const joints = ['head','hand_l','hand_r','foot_l','foot_r'].map(name => p.model.getObjectByName(name));
    const speeds = [0,1.5,4,12,4,1.5,0].flatMap(speed => Array(60).fill(speed));
    // Repeatedly cross the walk/jog threshold while an earlier fade is unfinished.
    speeds.push(...Array.from({length:120},(_,i)=>i%8<4?2.7:2.9));
    for (let i=0; i<speeds.length; i++) {
        p.update(1/120,i/120,'ground',speeds[i]);
        p.group.updateMatrixWorld(true);
        const weight = [...p.actions.values()].reduce((sum,a)=>sum+(a.enabled && a.isRunning()?a.getEffectiveWeight():0),0);
        maxWeight = Math.max(maxWeight,weight);
        const pose = joints.map(j=>j.getWorldPosition(j.position.clone()));
        if(previousPose) {
            const steps=pose.map((point,j)=>point.distanceTo(previousPose[j]));
            const step=Math.max(...steps);
            if(step>maxPoseStep) {maxPoseStep=step;worstStep={frame:i,speed:speeds[i],clip:p.current,time:p.actions.get(p.current).time,modelY:p.model.position.y,joint:joints[steps.indexOf(step)].name};}
        }
        previousPose=pose;
    }
    checks.push({name:'rapid state changes do not accumulate stale action weights',pass:maxWeight<1.02,maxWeight});
    checks.push({name:'idle/walk/run/sprint transitions remain continuous at 120 Hz',pass:maxPoseStep<.12,maxPoseStep,worstStep});
    p.mixer.stopAllAction(); p.current = ''; p.update(0, 0, 'ground', 4);
    p.mixer.setTime(p.actions.get('jog').getClip().duration * .4);
    p.group.updateMatrixWorld(true);
    s.renderer.render(s.scene, s.camera);
    return { checks };
});
await page.screenshot({ path: `.artifacts/character-motion-${label}.png` });
const result = { ...report, errors };
fs.writeFileSync(`.artifacts/character-motion-${label}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (errors.length || report.checks.some(c => !c.pass)) process.exitCode = 1;
