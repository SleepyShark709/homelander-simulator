import {chromium} from '@playwright/test';
import fs from 'node:fs';
const folder='.artifacts/jump-landing-video';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:folder,size:{width:1280,height:800}}});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.game?.player,{timeout:45000});await page.locator('#start').click();await page.waitForFunction(()=>window.game.input.active);
await page.evaluate(()=>{const p=window.game.player,animate=p.animate.bind(p);window.jumpFrames=[];p.animate=(dt,time)=>{animate(dt,time);window.jumpFrames.push({time,mode:p.mode,clip:p.visual.current,position:p.position.toArray(),speed:Math.hypot(p.velocity.x,p.velocity.z)});};});
await page.waitForTimeout(500);
for(const motion of ['idle','run','sprint']){
 if(motion!=='idle')await page.keyboard.down('KeyW');if(motion==='sprint')await page.keyboard.down('Shift');
 await page.waitForTimeout(650);await page.keyboard.press('Space');await page.waitForTimeout(240);await page.screenshot({path:`${folder}/${motion}-jump.png`});await page.waitForTimeout(motion==='idle'?1700:950);
 await page.keyboard.up('KeyW');await page.keyboard.up('Shift');await page.waitForTimeout(400);
}
for(const key of ['KeyF','KeyQ']){
 await page.keyboard.press('KeyF');await page.keyboard.down('Space');await page.waitForTimeout(await page.evaluate(()=>window.game.player.visual.actionDuration('takeoff')*1000+1500));await page.keyboard.up('Space');await page.waitForTimeout(350);
 await page.keyboard.press(key);await page.waitForFunction(()=>window.game.player.mode==='ground'&&window.game.player.visual.current==='land',{timeout:10000});await page.waitForTimeout(80);await page.screenshot({path:`${folder}/${key}-contact.png`});await page.waitForTimeout(1300);
}
await page.keyboard.press('Escape');
const samples=await page.evaluate(()=>window.jumpFrames);const starts=samples.filter((s,i)=>s.mode==='jump'&&(!i||samples[i-1].mode!=='jump'));
const video=page.video();await context.close();await video.saveAs('.artifacts/jump-landing-preview.webm');await browser.close();
fs.writeFileSync('.artifacts/jump-landing-recording.json',JSON.stringify({samples,starts,errors,source:'actual keyboard inputs, original Jump_2, F and Q shared contact recovery'},null,2));console.log(JSON.stringify({starts,errors},null,2));if(starts.length!==3||errors.length)process.exitCode=1;
