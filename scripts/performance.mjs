import {chromium} from '@playwright/test';
import fs from 'node:fs';
const artifactPrefix=process.argv[2]??'performance';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--enable-precise-memory-info']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.game?.world,{timeout:60000});
await page.locator('#start').click();await page.waitForFunction(()=>window.game.input.active);
const environment=await page.evaluate(()=>{const g=window.game,gl=g.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {userAgent:navigator.userAgent,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],devicePixelRatio,hardwareConcurrency:navigator.hardwareConcurrency};});
const samples=[],segments=[],resets=[];
const summary=async(name)=>page.evaluate(name=>{
 const g=window.game,stats=a=>{const s=[...a].sort((a,b)=>a-b);return {frames:s.length,medianMs:s[Math.floor(s.length*.5)],p95Ms:s[Math.floor(s.length*.95)],maxMs:s.at(-1)};};
 return {name,frame:stats(g.frameTimes),cpuUpdate:stats(g.updateTimes),renderSubmission:stats(g.submissionTimes),snapshot:g.snapshot(),heap:performance.memory?.usedJSHeapSize};
},name);
const prepare=async(mode)=>page.evaluate(mode=>{
 const g=window.game;g.frameTimes=[];g.updateTimes=[];g.submissionTimes=[];g.input.clear();g.running=true;g.input.active=true;g.ui.playing(true);
 if(mode==='stress'){
  g.wanted.heat=100;
  for(let i=0;i<12;i++)g.world.spawn(i<4?'police':'soldier',g.player.position.clone().set((i%2?1:-1)*12,.18,-55+Math.floor(i/2)*18),g.time);
 }
 const p=g.player;p.position.set(0,mode==='stress'?14:25,25);p.previous.copy(p.position);p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);p.velocity.set(0,0,0);p.mode='fly';
},mode);
const drive=async(mode,second)=>page.evaluate(({mode,second})=>{
 const g=window.game,p=g.player;g.input.yaw=second*.16;g.input.pitch=-.12;g.input.keys.clear();
 if(mode==='normal'||mode==='warm')g.input.keys.add('KeyW');
 if(mode==='stress'){
  g.wanted.heat=100;g.wanted.action();g.input.laser=true;
  // Periodic real ability requests plus capped physics effects keep this a combat workload.
  if(second%12===0){g.input.punch=true;g.effects.fragments(p.feet,0xa79983,2);}
  if(second%20===0&&p.mode==='fly')g.input.pressed.add('KeyQ');
  if(p.mode==='ground'&&second%20===3){g.input.pressed.add('KeyF');g.input.keys.add('Space');}
  if(p.mode==='fly'&&p.position.y<14)g.input.keys.add('Space');
  if(second%5===0){const target=g.world.alive('panel')[0]??g.world.alive('prop')[0]??g.world.alive('car')[0];if(target)g.combat.hit(target,160,'stress:'+second,target.mesh.position.clone(),p.position.clone().set(1,.5,0).normalize(),12);}
 }
 if(mode==='long'){
  g.input.keys.add('KeyW');g.input.laser=second%30<6;
  if(second%12<4)g.input.keys.add('ShiftLeft');
  if(p.position.y<10&&p.mode==='fly')g.input.keys.add('Space');
 }
}, {mode,second});
async function run(mode,duration){
 const began=performance.now();let lastSecond=-1;
 while((performance.now()-began)/1000<duration){
  const second=Math.floor((performance.now()-began)/1000);
  if(second!==lastSecond){lastSecond=second;await drive(mode,second);
   if(second%30===0){const s=await summary(mode);samples.push({phase:mode,second,...s.snapshot,heap:s.heap});console.log(mode,second,JSON.stringify({median:s.frame.medianMs,p95:s.frame.p95Ms,bodies:s.snapshot.bodies,geometries:s.snapshot.geometries,heap:s.heap}));}
   if(mode==='long'&&[60,180,300].includes(second)){
    const before=await summary('before-reset');await page.evaluate(()=>{const g=window.game;g.reset();});await page.waitForTimeout(1000);
    await page.evaluate(()=>{const g=window.game;g.player.sync();g.camera.update(10,true);g.renderer.render(g.scene,g.camera.camera);});
    const after=await summary('after-reset');resets.push({before,after});await prepare('long');
   }
  }
  await page.waitForTimeout(250);
 }
}
try{
 console.log('environment',JSON.stringify(environment));await prepare('warm');await run('warm',30);
 await prepare('normal');await run('normal',120);segments.push(await summary('normal'));
 await prepare('stress');await run('stress',120);segments.push(await summary('stress'));await page.screenshot({path:`.artifacts/${artifactPrefix}-stress.png`});
 await prepare('long');await run('long',360);segments.push(await summary('long-final'));
}catch(e){errors.push(String(e));process.exitCode=1;}
if(resets.some(r=>r.after.snapshot.bodies!==29||r.after.snapshot.colliders!==87||r.after.snapshot.civilians!==20||r.after.snapshot.enemies!==0||r.after.snapshot.effects!==0))errors.push('Reset entity baseline did not recover');
if(errors.length)process.exitCode=1;
const report={date:new Date().toISOString(),environment,durationSeconds:630,method:'30s warmup + 120s normal + 120s combat + 360s continued operation; Chrome headless on local Metal GPU; scripted input/scenario driver, not manual play',segments,resets,samples,errors};
fs.writeFileSync(`.artifacts/${artifactPrefix}.json`,JSON.stringify(report,null,2));console.log('FINAL',JSON.stringify({segments,resets:resets.map(r=>r.after.snapshot),errors}));await browser.close();
