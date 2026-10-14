import {chromium} from '@playwright/test';
import fs from 'node:fs';
const mode=process.argv[2]??'normal',duration=20;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.game?.world,{timeout:20000});await page.locator('#start').click();await page.waitForFunction(()=>window.game.input.active);
const env=await page.evaluate(()=>{const gl=window.game.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {gpu:ext&&gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],browser:navigator.userAgent};});
await page.evaluate(mode=>{
 const g=window.game,p=g.player;p.position.y=mode==='stress'?12:25;p.previous.copy(p.position);p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);p.mode='fly';g.input.keys.add('KeyW');
 if(mode==='stress'){
  g.wanted.heat=100;
  for(let i=0;i<12;i++)g.world.spawn(i<4?'police':'soldier',p.position.clone().set((i%2?1:-1)*12,.18,-55+Math.floor(i/2)*18),g.time);
  g.input.laser=true;for(let i=0;i<7;i++)g.effects.fragments(p.feet,0xa6a293,2);
 }
},mode);
await page.waitForTimeout(2500);await page.evaluate(()=>{const g=window.game;g.frameTimes=[];g.updateTimes=[];g.submissionTimes=[];});
const began=Date.now();let sec=-1;
while(Date.now()-began<duration*1000){
 const next=Math.floor((Date.now()-began)/1000);if(next!==sec){sec=next;await page.evaluate(({mode,sec})=>{const g=window.game;g.input.yaw=sec*.18;if(mode==='stress'){g.wanted.action();if(sec%2===0)g.effects.fragments(g.player.feet,0xa5a095,2);} },{mode,sec});}
 await page.waitForTimeout(200);
}
const metrics=await page.evaluate(()=>{const g=window.game,stat=a=>{const s=[...a].sort((a,b)=>a-b);return {count:s.length,median:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],max:s.at(-1)};};return {frame:stat(g.frameTimes),cpu:stat(g.updateTimes),submit:stat(g.submissionTimes),state:g.snapshot()};});
await page.screenshot({path:`.artifacts/realism-${mode}-benchmark.png`});const result={mode,duration,env,metrics,errors};fs.writeFileSync(`.artifacts/visual-${mode}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();
