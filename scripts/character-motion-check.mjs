import fs from 'node:fs';
import { chromium } from '@playwright/test';

const label=process.argv[2]??'homelander';
fs.mkdirSync('.artifacts',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto(process.argv[3]??'http://127.0.0.1:5173/?preview=character');
await page.waitForFunction(()=>window.studio?.person,{timeout:45000});
const report=await page.evaluate(async()=>{
    const T=await import('/node_modules/.vite/deps/three.js');
    const {CONFIG}=await import('/src/core/config.ts');
    const s=window.studio,p=s.person;s.renderer.setAnimationLoop(null);
    // This checks source cycles; cape dynamics have a separate physical regression.
    if(p.cape){p.cape.enabled=false;p.cape.reset();}
    const bones=[];let mesh;p.model.traverse(o=>{if(o.isBone)bones.push(o);if(o.isSkinnedMesh)mesh=o;});
    const checks=[];
    for(const name of ['idle','walk','jog','sprint','hover','fly','laser_hip','laser_back','strafe_l','strafe_r','backpedal',...[...p.actions.keys()].filter(name=>name.startsWith('style_') && name!=='style_land_from_back')].filter(name=>p.actions.has(name))){
        p.mixer.stopAllAction();p.current='';p.play(name);
        const action=p.actions.get(name),rate=['strafe_l','strafe_r','backpedal'].includes(name)?CONFIG.playerAimAnimationRateMax:
            ['jog','sprint'].includes(name)?CONFIG.playerRunAnimationRateMax:1;
        action.setEffectiveTimeScale(rate).setLoop(T.LoopRepeat,Infinity);
        p.model.position.set(0,0,0);p.model.rotation.set(0,0,0);
        let previous,maxJointStep=0,maxSkinStep=0,previousSkin,finite=true;
        const frames=Math.max(120,Math.ceil(action.getClip().duration*3/rate*120));
        for(let i=0;i<frames;i++){
            p.mixer.update(1/120);p.group.updateMatrixWorld(true);
            const pose=bones.map(b=>b.getWorldPosition(new T.Vector3()));
            if(previous)maxJointStep=Math.max(maxJointStep,...pose.map((v,j)=>v.distanceTo(previous[j])));
            previous=pose;
            const skin=[];
            for(let k=0;k<mesh.geometry.attributes.position.count;k+=503){
                const point=new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,k);
                mesh.applyBoneTransform(k,point).applyMatrix4(mesh.matrixWorld);skin.push(point);
                finite&&=point.toArray().every(Number.isFinite);
            }
            if(previousSkin)maxSkinStep=Math.max(maxSkinStep,...skin.map((v,j)=>v.distanceTo(previousSkin[j])));
            previousSkin=skin;
        }
        checks.push({name:`${name}: three cycles, complete skeleton and sampled skin`,pass:finite&&maxJointStep<.12&&maxSkinStep<.12,frames,bones:bones.length,maxJointStep,maxSkinStep,rate});
    }
    p.mixer.stopAllAction();p.current='';p.update(0,0,'ground',0);s.renderer.render(s.scene,s.camera);
    return {checks};
});
await page.screenshot({path:`.artifacts/character-motion-${label}.png`});
fs.writeFileSync(`.artifacts/character-motion-${label}.json`,JSON.stringify({...report,errors},null,2));
console.log(JSON.stringify({...report,errors},null,2));
await browser.close();
if(errors.length||report.checks.some(c=>!c.pass))process.exitCode=1;
