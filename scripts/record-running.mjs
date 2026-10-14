import { chromium } from '@playwright/test';
import fs from 'node:fs';

const label = process.argv[2] ?? 'running';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Use a simple lowercase recording label');
const folder = `.artifacts/${label}-video`;
fs.mkdirSync(folder, {recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const context = await browser.newContext({viewport:{width:1200,height:900},recordVideo:{dir:folder,size:{width:1200,height:900}}});
const page = await context.newPage(), errors = [];
page.on('pageerror',e=>errors.push(e.message));
if (process.argv.includes('--closeup')) {
 await page.goto('http://127.0.0.1:5173/?preview=character');
 await page.waitForFunction(()=>window.studio?.person,{timeout:30000});
 for (const pose of ['jog','sprint']) {
  await page.evaluate(()=>{const s=window.studio;s.camera.position.set(1.8,1.55,3.4);s.controls.target.set(0,1.03,0);s.controls.update();});
  await page.locator(`[data-pose="${pose}"]`).click();
  await page.waitForTimeout(2500);
  await page.screenshot({path:`${folder}/${pose}-front.png`});
  await page.evaluate(()=>{const s=window.studio;s.camera.position.set(3.4,1.45,.15);s.controls.update();});
  await page.waitForTimeout(2500);
  await page.screenshot({path:`${folder}/${pose}-side.png`});
 }
}
await page.goto('http://127.0.0.1:5173/');
await page.waitForFunction(()=>window.game?.player,{timeout:30000});
await page.locator('#start').click();
await page.waitForFunction(()=>window.game.input.active);
await page.evaluate(()=>{
 window.runningRecording = {started:performance.now(), samples:[], active:true};
 const sample=()=>{
  const r=window.runningRecording,p=window.game.player;
  if(!r.active)return;
  const collisions=[];
  for(let i=0;i<p.controller.numComputedCollisions();i++) {
   const hit=p.controller.computedCollision(i);
   if(hit?.collider)collisions.push({handle:hit.collider.handle,kind:window.game.world.byCollider.get(hit.collider.handle)?.kind??'static',normal:hit.normal1});
  }
  r.samples.push({t:(performance.now()-r.started)/1000,speed:Math.hypot(p.velocity.x,p.velocity.z)*3.6,mode:p.mode,clip:p.visual.current,position:p.position.toArray(),keys:[...window.game.input.keys],collisions});
  requestAnimationFrame(sample);
 };
 requestAnimationFrame(sample);
});
await page.keyboard.down('KeyW');
await page.waitForTimeout(7000);
await page.screenshot({path:`${folder}/forward.png`});
await page.keyboard.up('KeyW');
await page.keyboard.down('KeyS');
await page.waitForTimeout(7000);
await page.screenshot({path:`${folder}/return.png`});
await page.keyboard.up('KeyS');
await page.waitForTimeout(800);
await page.keyboard.down('KeyW');
await page.keyboard.down('Shift');
await page.waitForTimeout(1800);
await page.keyboard.up('Shift');
await page.waitForTimeout(1600);
await page.keyboard.up('KeyW');
await page.waitForTimeout(600);
const trace=await page.evaluate(()=>{window.runningRecording.active=false;return window.runningRecording.samples;});
await page.keyboard.press('Escape');
const steady=trace.filter(s=>(s.t>=1&&s.t<6.9)||(s.t>=8&&s.t<13.9));
const checks=[{name:'real W/S input sustained ordinary run',pass:steady.length>300&&steady.every(s=>s.speed>21.3&&s.clip==='jog'&&s.mode==='ground'),frames:steady.length,minSpeed:Math.min(...steady.map(s=>s.speed)),maxSpeed:Math.max(...steady.map(s=>s.speed))}];
const sprint = trace.filter(s => s.speed>85 && s.clip==='sprint');
checks.push({name:'real Shift input uses a distinct Sprint then returns to Jog',pass:sprint.length>20&&trace.some(s=>s.t>sprint.at(-1)?.t&&s.clip==='jog'),frames:sprint.length});
fs.writeFileSync(`.artifacts/${label}-recording.json`,JSON.stringify({checks,errors,trace,input:'actual keyboard W/S/Shift; current main character with verified Jog/Sprint adaptation'},null,2));
const video=page.video();await context.close();await video.saveAs(`.artifacts/${label}-preview.webm`);await browser.close();
console.log(JSON.stringify({checks,errors},null,2));
if(errors.length||checks.some(c=>!c.pass))process.exitCode=1;
