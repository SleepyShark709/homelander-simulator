import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const folder = process.argv[2] ?? '.artifacts/homelander';
fs.mkdirSync(folder,{recursive:true});
const reference = JSON.parse(gunzipSync(fs.readFileSync(process.argv[4] ?? '.asset-source/homelander/blender-reference.json.gz')));
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const height = Math.ceil(reference.clips.length / 4) * 400;
const page = await browser.newPage({viewport:{width:1440,height}}), errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto(process.argv[3] ?? 'http://127.0.0.1:5173/?preview=character');
await page.waitForFunction(()=>window.studio?.person,{timeout:45000});
await page.setViewportSize({width:1440,height:Math.ceil(await page.evaluate(()=>window.studio.person.actions.size)/4)*400});
const report = await page.evaluate(async reference=>{
    const T=await import('/node_modules/.vite/deps/three.js');
    const s=window.studio,p=s.person;
    s.renderer.setAnimationLoop(null);
    // Verify the unmodified Blender skin separately from runtime cloth physics.
    if(p.cape){p.cape.enabled=false;p.cape.reset();}
    let mesh; p.model.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});
    const positions=mesh.geometry.attributes.position;
    const indices=reference.vertices.map(point=>{
        let best=-1,distance=Infinity;
        for(let i=0;i<positions.count;i++){
            const d=(positions.getX(i)-point[0])**2+(positions.getY(i)-point[1])**2+(positions.getZ(i)-point[2])**2;
            if(d<distance){distance=d;best=i;}
        }
        if(distance>1e-8)throw new Error(`Blender reference vertex missing: ${point}, distance=${Math.sqrt(distance)}`);
        return best;
    });
    p.group.position.set(0,0,0);
    const checks=[];
    for(const clip of reference.clips){
        const name=({run:'jog',heavy_attack:'punch'})[clip.name]??clip.name;
        p.mixer.stopAllAction();p.current='';p.play(name);
        const action=p.actions.get(name);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;
        p.model.position.set(0,0,0);p.model.rotation.set(0,0,0);
        let maxVertexError=0,finite=true,worst;
        for(const sample of clip.samples){
            p.mixer.setTime(sample.time);p.group.updateMatrixWorld(true);
            for(let j=0;j<indices.length;j++){
                const i=indices[j],point=new T.Vector3().fromBufferAttribute(positions,i);
                mesh.applyBoneTransform(i,point).applyMatrix4(mesh.matrixWorld);
                finite&&=point.toArray().every(Number.isFinite);
                const error=point.distanceTo(new T.Vector3().fromArray(sample.vertices[j]));
                if(error>maxVertexError){maxVertexError=error;worst={time:sample.time,vertex:i};}
            }
        }
        checks.push({name,pass:finite&&maxVertexError<.015,frames:clip.samples.length,vertices:indices.length,maxVertexError,worst});
    }
    for(const clip of reference.turnProofs??[]) {
        p.mixer.stopAllAction();p.current='';p.play(clip.name);
        const action=p.actions.get(clip.name);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;
        p.model.position.set(0,0,0);p.model.rotation.set(0,0,0);
        let maxVertexError=0;
        for(const sample of clip.samples) {
            p.group.rotation.y=sample.yaw;p.mixer.setTime(sample.time);p.group.updateMatrixWorld(true);
            for(let j=0;j<indices.length;j++) {
                const i=indices[j],point=new T.Vector3().fromBufferAttribute(positions,i);
                mesh.applyBoneTransform(i,point).applyMatrix4(mesh.matrixWorld);
                maxVertexError=Math.max(maxVertexError,point.distanceTo(new T.Vector3().fromArray(sample.vertices[j])));
            }
        }
        checks.push({name:clip.name+': separated yaw reconstructs source skin',pass:maxVertexError<.0001,maxVertexError});
    }
    p.group.rotation.y=0;
    const joints=mesh.skeleton.bones;
    p.mixer.stopAllAction();p.current='';
    let previous,maxPoseStep=0,maxWeightError=0,worstStep;
    const speeds=[0,1.5,4,12,4,1.5,0].flatMap(v=>Array(90).fill(v));
    speeds.push(...Array.from({length:120},(_,i)=>i%8<4?2.7:2.9));
    for(let i=0;i<speeds.length;i++){
        p.update(1/120,i/120,'ground',speeds[i]);p.group.updateMatrixWorld(true);
        const pose=joints.map(b=>b.getWorldPosition(new T.Vector3()));
        if(previous)for(let j=0;j<pose.length;j++){
            const step=pose[j].distanceTo(previous[j]);
            if(step>maxPoseStep){maxPoseStep=step;worstStep={frame:i,joint:joints[j].name,clip:p.current,modelY:p.model.position.y};}
        }
        previous=pose;
        const weight=[...p.actions.values()].reduce((sum,a)=>sum+(a.enabled&&a.isScheduled()?a.getEffectiveWeight():0),0);
        maxWeightError=Math.max(maxWeightError,Math.abs(1-weight));
    }
    checks.push({name:'all joints: locomotion transitions at 120 Hz',pass:maxPoseStep<.12&&maxWeightError<.02,maxPoseStep,maxWeightError,worstStep});
    document.querySelectorAll('.studio-controls,.studio-bar').forEach(e=>e.remove());
    const height = Math.ceil(p.actions.size / 4) * 400;
    s.renderer.setPixelRatio(1);s.renderer.setSize(1440,height);s.renderer.autoClear=false;
    s.renderer.setScissorTest(true);
    s.camera.aspect=360/400;s.camera.position.set(2.6,1.7,4);s.controls.target.set(0,.95,0);s.controls.update();s.camera.updateProjectionMatrix();
    const names=[...p.actions.keys()];
    for(let i=0;i<names.length;i++){
        const x=i%4*360,y=height-(Math.floor(i/4)+1)*400;
        p.mixer.stopAllAction();p.current='';p.play(names[i]);p.model.position.set(0,0,0);p.model.rotation.set(0,0,0);
        p.mixer.setTime(p.actionDuration(names[i])*.4);p.group.updateMatrixWorld(true);
        s.renderer.setViewport(x,y,360,400);s.renderer.setScissor(x,y,360,400);s.renderer.clear();s.renderer.render(s.scene,s.camera);
        const label=document.createElement('div');label.textContent=names[i];Object.assign(label.style,{position:'fixed',left:`${x+16}px`,top:`${Math.floor(i/4)*400+14}px`,color:'#d6c197',font:'15px monospace'});document.body.append(label);
    }
    return {checks,bones:joints.length,clips:names};
},reference);
await page.screenshot({path:`${folder}/all-actions.png`});
fs.writeFileSync(`${folder}/check.json`,JSON.stringify({...report,errors},null,2));
console.log(JSON.stringify({...report,errors},null,2));
await browser.close();
if(errors.length||report.checks.some(c=>!c.pass))process.exitCode=1;
