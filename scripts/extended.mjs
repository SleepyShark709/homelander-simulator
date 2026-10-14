import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];const results=[];
page.on('pageerror',e=>errors.push(e.message));
const check=(name,condition,data)=>{results.push({name,pass:!!condition,data});assert.ok(condition,name+JSON.stringify(data));};
await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.game?.world);
try{
 const target=await page.evaluate(()=>{
  const g=window.game;const p=g.player;p.position.set(0,1.16,5);p.previous.copy(p.position);p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);
  const e=g.world.spawn('civilian',p.position.clone().set(0,.18,-5),0);e.goal=e.mesh.position.clone();e.nextThink=999;g.physics.world.step();return e.id;
 });
 await page.locator('#start').click();await page.waitForFunction(()=>window.game.input.active);await page.waitForTimeout(100);
 await page.keyboard.down('KeyW');await page.keyboard.down('Shift');await page.waitForTimeout(1100);await page.keyboard.up('KeyW');await page.keyboard.up('Shift');
 const sprint=await page.evaluate(id=>({hp:window.game.world.entities.get(id)?.health.hp,snapshot:window.game.snapshot()}),target);
 check('real keyboard sprint hits NPC',sprint.hp===0,sprint);
 await page.keyboard.press('Escape');
 const physical=await page.evaluate(()=>{
  const g=window.game;g.reset();let p=g.player;
  const teleport=(x,y,z,mode)=>{p.position.set(x,y,z);p.previous.copy(p.position);p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);p.velocity.set(0,0,0);p.mode=mode;g.physics.world.step();};
  teleport(-37,45,-38,'fall');for(let i=0;i<240;i++)g.step();const roof={position:p.position.toArray(),mode:p.mode};
  teleport(90,45,0,'fly');g.input.yaw=-Math.PI/2;g.input.keys.add('KeyW');g.input.keys.add('ShiftLeft');for(let i=0;i<240;i++)g.step();const edge=p.position.x;
  g.input.keys.delete('KeyW');g.input.keys.add('KeyS');for(let i=0;i<80;i++)g.step();const returned=p.position.x;
  g.input.clear();g.reset();const person=g.world.alive('civilian')[0];g.world.remove(person);const count=g.world.alive('civilian').length;
  const visible=g.npcs.visible;g.npcs.visible=()=>true;g.npcs.spawnSafe('civilian',0);const afterVisible=g.world.alive('civilian').length;g.npcs.visible=()=>false;g.npcs.spawnSafe('civilian',0);const afterHidden=g.world.alive('civilian').length;g.npcs.visible=visible;
  return {roof,edge,returned,count,afterVisible,afterHidden};
 });
 check('natural fall lands on roof',physical.roof.mode==='ground'&&physical.roof.position[1]>20&&physical.roof.position[1]<24,physical.roof);
 check('boundary blocks outward but permits returning',physical.edge<100&&physical.edge>95&&physical.returned<90,physical);
 check('spawn delays while every candidate is visible',physical.count===physical.afterVisible&&physical.afterHidden===20,physical);
 // Test the actual laser system with a physical wall inserted between player and target.
 const shield=await page.evaluate(()=>{
  const g=window.game;g.reset();const p=g.player;p.position.set(0,1.16,5);p.previous.copy(p.position);p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);
  const e=g.world.spawn('civilian',p.position.clone().set(0,.18,-5),0);e.nextThink=999;e.goal=e.mesh.position.clone();
  g.physics.staticBox(p.position.clone().set(0,2,0),p.position.clone().set(8,5,.4));g.physics.world.step();g.input.pitch=-.1;g.input.laser=true;
  for(let i=0;i<120;i++)g.step();const result={hp:e.health.hp,heat:g.wanted.heat};g.input.clear();return result;
 });check('laser does not damage through solid wall',shield.hp===50&&shield.heat===0,shield);
 const errorPage=await browser.newPage();await errorPage.route('**/assets/human/hero.glb',r=>r.fulfill({status:404,body:'missing'}));
 await errorPage.goto('http://127.0.0.1:5173');await errorPage.waitForFunction(()=>document.querySelector('#loading')?.textContent?.includes('模型加载失败'));
 await errorPage.waitForTimeout(1000);check('missing asset exposes actionable retry',await errorPage.locator('#start').textContent()==='重新加载 ↻' && (await errorPage.locator('#loading').textContent()).includes('模型加载失败'),await errorPage.locator('#loading').textContent());await errorPage.close();
 check('no runtime errors',errors.length===0,errors);
}catch(e){console.error(e);process.exitCode=1;await page.screenshot({path:'.artifacts/extended-failure.png'});}
fs.writeFileSync('.artifacts/extended.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));await browser.close();
