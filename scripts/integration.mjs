import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];const results=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.game?.world,{timeout:60000});
const check=(name,condition,data)=>{results.push({name,pass:!!condition,data});assert.ok(condition,name+': '+JSON.stringify(data));};
const state=()=>page.evaluate(()=>window.game.snapshot());
const setup=async(position=[0,1.16,5],kind='civilian',target=[0,.18,-3])=>page.evaluate(({position,kind,target})=>{
 const g=window.game;g.input.pause();g.reset();const p=g.player;
 p.position.set(...position);p.previous.copy(p.position);p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);p.velocity.set(0,0,0);p.mode='ground';
 const e=g.world.spawn(kind,p.position.clone().set(...target),0);e.goal=e.mesh.position.clone();e.nextThink=999;
 g.physics.world.step();g.world.sync();p.sync();g.camera.update(.016,false);
 const aim=e.mesh.position.clone().add({x:0,y:1.3,z:0});
 for(let i=0;i<8;i++){const d=aim.clone().sub(g.camera.camera.position).normalize();g.input.yaw=Math.atan2(-d.x,-d.z);g.input.pitch=Math.asin(d.y);g.camera.update(.016,false);}
 return e.id;
},{position,kind,target});
try{
 await page.waitForTimeout(2200);await page.locator('#start').click();await page.waitForFunction(()=>window.game.input.active);await page.waitForTimeout(100);await page.keyboard.press('KeyF');await page.keyboard.down('Space');await page.waitForTimeout(800);await page.keyboard.up('Space');
 let s=await state();check('keyboard flight ascent',s.mode==='fly'&&s.position[1]>5,s);
 await page.keyboard.press('Escape');await page.waitForTimeout(100);let a=await state();await page.waitForTimeout(250);let b=await state();check('Esc freezes simulation',!b.running&&a.time===b.time,b);
 const laserId=await setup();await page.waitForTimeout(2200);await page.locator('#start').click();await page.waitForFunction(()=>window.game.input.active);await page.waitForTimeout(100);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
 const killed=await page.evaluate(id=>{const e=window.game.world.entities.get(id);return {hp:e?.health.hp,time:window.game.time,heat:window.game.wanted.heat,beam:window.game.effects.beams[0].visible};},laserId);
 check('laser kills aligned NPC',killed.hp===0,killed);await page.screenshot({path:'.artifacts/laser.png'});
 const punchId=await setup([0,1.16,0],'civilian',[0,.18,-2]);await page.waitForTimeout(2200);await page.locator('#start').click();await page.waitForFunction(()=>window.game.input.active);await page.waitForTimeout(100);await page.mouse.click(720,450,{button:'right'});await page.waitForTimeout(200);
 let hp=await page.evaluate(id=>window.game.world.entities.get(id)?.health.hp,punchId);check('right click punch kills',hp===0,hp);
 await setup([0,15,0],'civilian',[3,.18,0]);await page.evaluate(()=>{window.game.player.mode='fly';});await page.waitForTimeout(2200);await page.locator('#start').click();await page.waitForFunction(()=>window.game.input.active);await page.waitForTimeout(100);await page.keyboard.press('KeyQ');await page.waitForTimeout(950);
 s=await state();check('air slam lands and kills nearby NPC',s.mode==='ground'&&s.kills>=1,s);
 // Damage real panel and car, preserving the surrounding scene.
 const destruction=await page.evaluate(()=>{
  const g=window.game;g.input.pause();const panel=g.world.alive('panel')[0],car=g.world.alive('car')[0];
  const point=panel.mesh.position.clone(),dir=point.clone().set(0,0,1);
  g.combat.hit(panel,200,'test-panel',point,dir,12);
  g.combat.hit(car,350,'test-car',car.mesh.position.clone(),dir,17);
  g.physics.world.step();
  return {panelDead:panel.health.dead,panelCollider:panel.collider.isValid(),carDead:car.health.dead,carSpeed:car.body.linvel(),heat:g.wanted.heat};
 });check('panel opens collision; vehicle receives physics impulse',destruction.panelDead&&!destruction.panelCollider&&destruction.carDead&&destruction.carSpeed.y>0,destruction);
 await page.screenshot({path:'.artifacts/destruction.png'});
 await page.evaluate(()=>{const g=window.game;g.reset();g.wanted.heat=100;});await page.waitForTimeout(2200);await page.locator('#start').click();await page.waitForFunction(()=>window.game.input.active);await page.waitForTimeout(100);
 // Keep attacking empty sky so heat remains while the real spawn system fills units.
 await page.evaluate(()=>{const g=window.game;g.input.pitch=.8;g.player.mode='fly';g.player.position.y=12;g.player.body.setTranslation(g.player.position,true);});
 await page.mouse.down();await page.waitForTimeout(31000);await page.mouse.up();s=await state();check('three-tier director fills capped enemy roster',s.level===3&&s.enemies===12,s);
 await page.screenshot({path:'.artifacts/pursuit.png'});
 await page.waitForTimeout(36000);s=await state();check('pursuit decays without player attack',s.level===0,s);
 await page.keyboard.press('Escape');
 const resets=[];for(let i=0;i<3;i++){await page.locator('#reset').click();await page.waitForTimeout(100);resets.push(await state());}
 check('three resets restore baseline entities',resets.every(s=>s.civilians===20&&s.enemies===0&&s.bodies===29&&s.effects===0&&s.heat===0),resets);
 check('no browser runtime errors',errors.length===0,errors);
}catch(e){console.error(e);process.exitCode=1;await page.screenshot({path:'.artifacts/failure.png'});}
fs.writeFileSync('.artifacts/integration.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));await browser.close();
