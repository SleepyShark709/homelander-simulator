import { chromium } from '@playwright/test';
import fs from 'node:fs';

const label = process.argv[2] ?? 'current';
fs.mkdirSync('.artifacts', {recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const page = await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&/THREE|WebGL|shader/i.test(m.text()))errors.push(m.text());});
await page.goto('http://127.0.0.1:5173/');
await page.waitForFunction(()=>window.game?.player,{timeout:45000});
const report = await page.evaluate(async()=>{
    const T=await import('/node_modules/.vite/deps/three.js');
    const {PersonVisual}=await import('/src/PersonVisual.ts');
    const g=window.game;g.renderer.setAnimationLoop(null);
    const checks=[], transitions=[];
    for(const profile of [60,120,144,'uneven']) for(const [mode,speed] of [['ground',0],['ground',6],['ground',24],['fly',0],['fly',40]]) {
        g.reset();const p=g.player;
        p.flightHull=mode==='fly';p.mode=mode;p.position.set(0,mode==='fly'?20:1.03,35);p.previous.copy(p.position);
        p.visual.group.position.copy(p.position).add(new T.Vector3(0,-1,0));
        p.renderVelocity.set(0,0,-speed);p.velocity.copy(p.renderVelocity);g.input.keys.add('KeyW');
        const joints=[];p.visual.model.traverse(o=>{if(o.isBone)joints.push(o);});
        const reference=new PersonVisual(g.assets,'hero');
        let previous,maxStep=0,worst,spuriousLand=0,groundLift=0,bindingError=0,legError=0,time=0,frame=0;
        const lower=new Set(['root','pelvis']);for(const side of ['l','r'])p.visual.model.getObjectByName(`thigh_${side}`).traverse(o=>lower.add(o.name));
        const duration=p.visual.actionDuration('punch');
        while(time<4) {
            const dt=profile==='uneven'?[1/144,1/120,1/75,1/90,1/60][frame%5]:1/profile;
            time+=dt;
            p.punchTime=time>=1&&time<1+duration?Math.max(0,duration-(time-1)):0;
            p.animate(dt,time);p.visual.group.updateMatrixWorld(true);
            reference.update(dt,time,mode==='fly'?(speed>18?'boost':'fly'):'ground',speed);
            const sums=new Map();
            for(const action of p.visual.mixer._actions) if(action.isScheduled()&&action.enabled&&action.getEffectiveWeight()>0)
                for(const track of action.getClip().tracks)sums.set(track.name,(sums.get(track.name)??0)+action.getEffectiveWeight());
            for(const weight of sums.values())bindingError=Math.max(bindingError,Math.abs(weight-1));
            if(mode==='ground'&&speed>1&&p.punchTime>0)for(const name of lower) {
                const a=p.visual.model.getObjectByName(name),b=reference.model.getObjectByName(name);
                legError=Math.max(legError,a.quaternion.clone().normalize().angleTo(b.quaternion.clone().normalize()),a.position.distanceTo(b.position));
            }
            const pose=joints.map(j=>j.getWorldPosition(new T.Vector3()));
            if(previous)for(let j=0;j<pose.length;j++) {
                const delta=pose[j].distanceTo(previous[j])/dt/120;
                if(delta>maxStep){maxStep=delta;worst={frame,bone:joints[j].name,clip:p.visual.current};}
            }
            if(mode==='fly'&&p.visual.current==='land')spuriousLand++;
            if(mode==='fly')groundLift=Math.max(groundLift,p.visual.model.position.y);
            previous=pose;frame++;
        }
        reference.dispose();
        transitions.push({profile,mode,speed,bindingError,legError,maxStep,worst,spuriousLand,groundLift,final:p.visual.current});
    }
    checks.push({name:'standing, running and airborne punches blend continuously across 60/120/144 Hz and uneven intervals',pass:transitions.every(t=>t.maxStep<.12),transitions});
    checks.push({name:'airborne punches preserve flight context without a false landing',pass:transitions.filter(t=>t.mode==='fly').every(t=>t.spuriousLand===0),data:transitions.filter(t=>t.mode==='fly')});
    checks.push({name:'every animated property retains normalized layer weights',pass:transitions.every(t=>t.bindingError<1e-6),maxError:Math.max(...transitions.map(t=>t.bindingError))});
    checks.push({name:'running punches preserve the exact original pelvis and leg tracks',pass:transitions.filter(t=>t.mode==='ground'&&t.speed>1).every(t=>t.legError<1e-5),maxError:Math.max(...transitions.map(t=>t.legError))});
    g.reset();g.ui.playing(true);g.running=false;
    g.camera.camera.position.set(25,8,45);g.camera.camera.lookAt(-20,5,-20);
    g.presentation.render(0);
    const a=g.world.art;
    checks.push({name:'ground and facades have color, normal and roughness textures',pass:[a.asphalt,a.paving,...[...a.facades.values()].map(f=>f.concrete)].every(m=>m.map&&m.normalMap&&m.roughnessMap)});
    const target=g.presentation.ao.normalRenderTarget;
    const readNormals=()=>{const data=new Uint16Array(target.width*target.height*4);g.renderer.readRenderTargetPixels(target,0,0,target.width,target.height,data);return data;};
    const beforeSmoke=readNormals(),startEffects=g.effects.list.length;
    g.effects.ring(g.player.feet);g.presentation.render(0);
    const afterSmoke=readNormals();let changed=0;
    for(let i=0;i<beforeSmoke.length;i++)if(beforeSmoke[i]!==afterSmoke[i])changed++;
    checks.push({name:'transparent impact smoke does not write rectangular occluders into the normal buffer',pass:changed===0,changedValues:changed});
    for(const effect of [...g.effects.list].slice(startEffects))g.effects.remove(effect);
    g.presentation.render(0);
    return {checks};
});
await page.screenshot({path:`.artifacts/city-${label}.png`});
await page.evaluate(()=>{
    const g=window.game;const a=g.player.visual.eyes[0];g.player.visual.update(0,0,'ground',0,true);g.player.visual.group.updateMatrixWorld(true);
    const start=a.getWorldPosition(a.position.clone());g.effects.beam(0,start,start.clone().add({x:0,y:0,z:-12}));
    g.camera.camera.position.set(0,2.8,31);g.camera.camera.lookAt(0,1,15);g.presentation.render(0);
});
await page.screenshot({path:`.artifacts/laser-${label}.png`});
await page.evaluate(()=>{const g=window.game;g.effects.hideBeams();g.camera.camera.position.set(-24,2.5,-19);g.camera.camera.lookAt(-34,2.5,-25.1);g.presentation.render(0);});
await page.screenshot({path:`.artifacts/facade-${label}.png`});
await page.evaluate(async()=>{
    const T=await import('/node_modules/.vite/deps/three.js');
    const {PersonVisual}=await import('/src/PersonVisual.ts');
    const g=window.game;
    g.effects.hideBeams();g.world.group.visible=false;g.scene.children.filter(o=>o.type==='Sky'||o.material?.type==='ShaderMaterial').forEach(o=>o.visible=false);g.scene.background=new T.Color(0x303b46);
    const group=new T.Group();g.scene.add(group);
    for(const [i,role] of ['hero','civilian','police','soldier'].entries()) {
        const p=new PersonVisual(g.assets,role,i);p.group.position.set(-2.7+i*1.8,0,24);p.group.rotation.y=.15;p.update(.5,0,'ground',0);group.add(p.group);
    }
    g.camera.camera.position.set(.3,2.2,29.8);g.camera.camera.lookAt(0,1,24);g.presentation.render(0);
});
await page.screenshot({path:`.artifacts/npcs-${label}.png`});
report.checks.push(await page.evaluate(()=>{const g=window.game;let npcMaterials=0;g.scene.traverse(o=>{if(o.isMesh){for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.userData.clothing&&m.map?.name==='npc/woven-fabric')npcMaterials++;}});return {name:'NPC clothing textures are active and reusable',pass:npcMaterials>=3&&g.assets.textures.has('npc/camouflage')&&g.assets.textures.has('npc/woven-fabric'),npcMaterials};}));
fs.writeFileSync(`.artifacts/scene-motion-${label}.json`,JSON.stringify({...report,errors},null,2));
console.log(JSON.stringify({checks:report.checks.map(({transitions,data,...check})=>check),profiles:report.checks[0].transitions.length,maxNormalizedStep:Math.max(...report.checks[0].transitions.map(t=>t.maxStep)),errors},null,2));
await browser.close();
if(errors.length||report.checks.some(c=>!c.pass))process.exitCode=1;
