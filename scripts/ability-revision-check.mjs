import { chromium } from '@playwright/test';
import fs from 'node:fs';
const out='.artifacts/ability-revision';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:`${out}/raw-video`,size:{width:1440,height:900}}});
const page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try {
 await page.goto(process.argv[2]??'http://127.0.0.1:5184/');await page.waitForFunction(()=>window.game?.player,null,{timeout:90000});
 const fixture=await page.evaluate(async()=>{
  const T=await import('/node_modules/.vite/deps/three.js'),g=window.game,e=g.world.alive('civilian')[0];
  e.body.setTranslation({x:0,y:1.03,z:10},true);e.body.setNextKinematicTranslation({x:0,y:1.03,z:10});
  e.mesh.position.set(0,.03,10);e.goal.set(0,0,-80);e.nextThink=1e6;g.physics.world.step();g.world.sync();
  return {target:e.id,point:[0,1,10],method:'One NPC initial position staged on the lane; default city retained. Movement and laser use actual keyboard/mouse events.'};
 });
 await page.locator('#start').click();await page.waitForFunction(()=>window.game.input.active);
 await page.evaluate(()=>{
  window.abilityRecording={active:true,stage:'normal',samples:[]};
  const frame=()=>{const r=window.abilityRecording;if(!r.active)return;const g=window.game,p=g.player;
   r.samples.push({stage:r.stage,time:g.time,worldTime:g.worldTime,position:p.position.toArray(),speed:Math.hypot(p.velocity.x,p.velocity.z),clip:p.visual.current,
    weights:[...p.visual.actions].filter(([,a])=>a.getEffectiveWeight()>.01).map(([n,a])=>[n,a.getEffectiveWeight(),a.getEffectiveTimeScale()]),
    fov:g.camera.camera.fov,wind:g.effects.wind.visible,kills:g.combat.kills,remnants:g.effects.impactRemnant.active.length,sprays:g.effects.blood.sprays.filter(s=>s.life>0).length});requestAnimationFrame(frame);};requestAnimationFrame(frame);
 });
 await page.keyboard.down('KeyW');await page.waitForTimeout(1000);
 await page.evaluate(()=>window.abilityRecording.stage='boost');await page.keyboard.down('Shift');
 await page.waitForFunction(id=>!window.game.world.entities.has(id),fixture.target,{timeout:6000});
 await page.evaluate(()=>{window.game.inspectionFrozen=true;});
 await page.keyboard.up('Shift');await page.keyboard.up('KeyW');
 const impact=await page.evaluate(async()=>{
  const T=await import('/node_modules/.vite/deps/three.js'),g=window.game;
  const spray=g.effects.blood.sprays.find(s=>s.life>0),point=spray.mesh.position;
  g.camera.camera.position.copy(point).add(new T.Vector3(3.7,1.8,4.2));g.camera.camera.lookAt(point);g.presentation.render(0);
  return {point:point.toArray(),remnants:g.effects.impactRemnant.active.length,kills:g.combat.kills,
   originalRemoved:true,poolScale:g.effects.blood.pools.find(p=>p.life>0).mesh.scale.x};
 });
 for(const [name,dt] of [['contact',0],['60ms',.003],['180ms',.006],['400ms',.011],['1s',.03],['2s',.05],['4s',.1]]) {
  await page.evaluate(dt=>{const g=window.game;g.effects.update(dt);g.presentation.render(0);},dt);
  await page.screenshot({path:`${out}/impact-${name}.png`});
 }
 await page.keyboard.press('Escape');
 await page.evaluate(()=>{window.abilityRecording.stage='laser';window.game.reset();window.game.inspectionFrozen=false;});
 await page.locator('#start').click();await page.waitForFunction(()=>window.game.input.active);
 await page.mouse.down({button:'left'});
 for(const [label,keys] of [['laser-a',['KeyA']],['laser-d',['KeyD']],['laser-s',['KeyS']],['laser-aw',['KeyA','KeyW']],['laser-ds',['KeyD','KeyS']],['laser-shift-a',['KeyA','Shift']]]) {
  await page.evaluate(label=>window.abilityRecording.stage=label,label);
  for(const key of keys)await page.keyboard.down(key);await page.waitForTimeout(900);
  await page.screenshot({path:`${out}/${label}.png`});
  for(const key of [...keys].reverse())await page.keyboard.up(key);
 }
 await page.mouse.up({button:'left'});await page.waitForTimeout(500);
 await page.keyboard.press('Escape');const paused=await page.evaluate(()=>({time:window.game.time,worldTime:window.game.worldTime,life:window.game.effects.blood.pools.map(p=>p.life)}));
 await page.waitForTimeout(400);const after=await page.evaluate(()=>({time:window.game.time,worldTime:window.game.worldTime,life:window.game.effects.blood.pools.map(p=>p.life)}));
 const samples=await page.evaluate(()=>{window.abilityRecording.active=false;return window.abilityRecording.samples;});
 const normal=samples.filter(s=>s.stage==='normal'),boost=samples.filter(s=>s.stage==='boost');
 const max=a=>Math.max(...a.map(s=>s.speed));
 checks.push({name:'actual forward speed increases by at least 35%',pass:max(boost)/max(normal)>1.35,normal:max(normal),boost:max(boost)});
 checks.push({name:'boost selects Sprint and ground FOV/wind respond',pass:boost.some(s=>s.clip==='sprint'&&s.fov>67&&s.wind)});
 checks.push({name:'contact retains a short visual handoff and liquid spray after removing the entity',pass:impact.originalRemoved&&impact.remnants===1&&impact.poolScale<.3&&boost.some(s=>s.sprays>0),impact});
 for(const [stage,clip] of [['laser-a','strafe_l'],['laser-d','strafe_r'],['laser-s','backpedal']])
  checks.push({name:stage,pass:samples.some(s=>s.stage===stage&&s.clip===clip)});
 checks.push({name:'pause freezes both time domains and residue',pass:JSON.stringify(paused)===JSON.stringify(after)});
 const reset=await page.evaluate(()=>{const g=window.game;g.reset();return {remnants:g.effects.impactRemnant.active.length,sprays:g.effects.blood.sprays.filter(s=>s.life>0).length,pools:g.effects.blood.pools.filter(p=>p.life>0).length};});
 checks.push({name:'reset releases all impact phases',pass:Object.values(reset).every(n=>n===0),reset});
 fs.writeFileSync(`${out}/game-check.json`,JSON.stringify({fixture,checks,errors,samples},null,2));
 console.log(JSON.stringify({checks,errors}));
 if(errors.length||checks.some(c=>!c.pass))process.exitCode=1;
} finally {const video=page.video();await context.close();await video.saveAs(`${out}/game-check.webm`);await browser.close();}
