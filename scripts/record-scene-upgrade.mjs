import {chromium} from '@playwright/test';
import fs from 'node:fs';
const label=process.argv[2]??'scene-upgrade';
if(!/^[a-z0-9-]+$/.test(label))throw new Error('Invalid artifact label');
const folder=`.artifacts/${label}-video`;fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:folder,size:{width:1280,height:800}}});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(process.env.GAME_URL??'http://127.0.0.1:5173/');await page.waitForFunction(()=>window.game?.player,{timeout:45000});
await page.locator('#start').click();await page.waitForFunction(()=>window.game.input.active);
await page.evaluate(()=>{
 const g=window.game,p=g.player,animate=p.animate.bind(p);window.recordedMotion=[];
 p.animate=(dt,time)=>{animate(dt,time);window.recordedMotion.push({time,mode:p.mode,clip:p.visual.current,punch:p.punchTime,speed:p.velocity.length(),position:p.position.toArray()});};
});
const punch=async label=>{
 await page.mouse.down({button:'right'});await page.mouse.up({button:'right'});
 await page.waitForTimeout(200);await page.screenshot({path:`${folder}/${label}-enter.png`});
 await page.waitForTimeout(250);await page.screenshot({path:`${folder}/${label}-contact.png`});
 await page.waitForTimeout(750);
};
await page.waitForTimeout(500);await punch('standing');
await page.keyboard.down('KeyW');await page.waitForTimeout(800);await punch('running');await page.keyboard.up('KeyW');
await page.keyboard.down('KeyW');await page.keyboard.down('Shift');await page.waitForTimeout(600);await punch('sprinting');await page.keyboard.up('Shift');await page.keyboard.up('KeyW');
await page.keyboard.press('KeyF');await page.keyboard.down('Space');
await page.waitForTimeout(await page.evaluate(()=>window.game.player.visual.actionDuration('takeoff')*1000+1800));
await page.keyboard.up('Space');await page.waitForTimeout(350);await punch('hover');
await page.keyboard.down('KeyW');await page.keyboard.down('Shift');await page.waitForTimeout(600);await punch('flying');await page.keyboard.up('Shift');await page.keyboard.up('KeyW');
await page.mouse.down({button:'left'});await page.waitForTimeout(600);await page.screenshot({path:`${folder}/laser.png`});await page.mouse.up({button:'left'});
await page.keyboard.press('KeyQ');await page.waitForTimeout(3500);await page.keyboard.press('Escape');
const report=await page.evaluate(()=>{
 const samples=window.recordedMotion;const punches=samples.filter((s,i)=>s.punch>0&&(!i||s.punch>samples[i-1].punch+.1));
 return {source:'actual keyboard/mouse in the running Web game',punchStarts:punches.map(({time,mode,speed})=>({time,mode,speed})),frames:samples.length,samples};
});
const video=page.video();await context.close();await video.saveAs(`.artifacts/${label}-preview.webm`);await browser.close();
fs.writeFileSync(`.artifacts/${label}-recording.json`,JSON.stringify({...report,errors},null,2));
console.log(JSON.stringify({frames:report.frames,punchStarts:report.punchStarts,errors},null,2));
if(errors.length||report.punchStarts.length!==5)process.exitCode=1;
