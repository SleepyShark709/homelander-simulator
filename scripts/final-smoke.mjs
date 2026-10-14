import {chromium} from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}});const results=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));const check=(name,pass,data)=>{results.push({name,pass:!!pass,data});assert.ok(pass,name);};
try{
 await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.game?.world);
 await page.screenshot({path:'.artifacts/final-menu.png'});
 await page.locator('#start').click();await page.waitForFunction(()=>window.game.input.active);
 await page.keyboard.press('KeyF');await page.keyboard.down('Space');await page.waitForTimeout(await page.evaluate(()=>window.game.player.visual.actionDuration('takeoff')*1000+800));await page.keyboard.up('Space');await page.waitForTimeout(350);
 const high=await page.evaluate(()=>window.game.player.position.y);
 await page.keyboard.down('ControlLeft');await page.waitForTimeout(650);await page.keyboard.up('ControlLeft');
 const low=await page.evaluate(()=>window.game.player.position.y);check('Ctrl descends during flight',low<high-2,{high,low});
 await page.mouse.down();await page.waitForTimeout(200);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();
 const frozen=await page.evaluate(()=>window.game.snapshot());await page.waitForTimeout(250);
 const blur=await page.evaluate(()=>({snapshot:window.game.snapshot(),laser:window.game.input.laser,beams:window.game.effects.beams.some(b=>b.visible)}));
 check('blur clears held attack and freezes clock',!blur.snapshot.running&&!blur.laser&&!blur.beams&&blur.snapshot.time===frozen.time,blur);
 const camera=await page.evaluate(()=>{const g=window.game;g.reset();g.physics.staticBox(g.player.position.clone().set(0,3,28),g.player.position.clone().set(12,6,.2));g.physics.world.step();g.player.sync();g.camera.update(.016,false);return g.camera.camera.position.toArray();});check('third-person camera stops before rear wall',camera[2]<28,camera);
 const crossing=await page.evaluate(()=>{
  const g=window.game;g.reset();const p=g.player;const panel=g.world.alive('panel').find(e=>e.mesh.position.x<-40&&e.mesh.position.x>-43&&e.mesh.position.z>0);
  p.position.set(panel.mesh.position.x,3,23);p.previous.copy(p.position);p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);p.mode='fly';g.input.yaw=Math.PI;g.input.keys.add('KeyW');g.input.keys.add('ShiftLeft');g.physics.world.step();
  for(let i=0;i<180;i++)g.step();const result={panelDead:panel.health.dead,position:p.position.toArray(),panelZ:panel.mesh.position.z};g.input.clear();return result;
 });check('boost breaks panel and stops at intact rear wall',crossing.panelDead&&crossing.position[2]>crossing.panelZ&&crossing.position[2]<45,crossing);
 const airFire=await page.evaluate(()=>{
  const g=window.game;g.reset();const p=g.player;p.position.set(0,15,0);p.previous.copy(p.position);p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);p.mode='fly';g.wanted.heat=100;
  const e=g.world.spawn('soldier',p.position.clone().set(12,.18,0),0);g.physics.world.step();for(let i=0;i<180;i++){g.wanted.action();g.step();}return {shotAt:e.shotAt,player:g.snapshot()};
 });check('soldier fires upward at invincible player',airFire.shotAt>0&&airFire.player.mode==='fly',airFire);
 const production=await browser.newPage();const prodErrors=[];production.on('pageerror',e=>prodErrors.push(e.message));
 await production.goto('http://127.0.0.1:4173');await production.waitForFunction(()=>document.querySelector('#start')?.textContent?.includes('进入街区'));
 await production.screenshot({path:'.artifacts/production.png'});await production.locator('#start').click();await production.waitForTimeout(400);
 check('production build starts with bundled local assets',await production.locator('#menu').evaluate(e=>e.classList.contains('hidden'))&&prodErrors.length===0,prodErrors);await production.close();
 check('no runtime errors',errors.length===0,errors);
}catch(e){console.error(e);process.exitCode=1;}
fs.writeFileSync('.artifacts/final-smoke.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));await browser.close();
