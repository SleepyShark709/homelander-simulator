import {chromium} from '@playwright/test';
import fs from 'node:fs';
const recording=process.argv[2]??'player-motion';
fs.mkdirSync(`.artifacts/${recording}`,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const context=await b.newContext({viewport:{width:1200,height:900},recordVideo:{dir:`.artifacts/${recording}`,size:{width:1200,height:900}}});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5173/?preview=character');await page.waitForFunction(()=>window.studio?.person,{timeout:30000});
await page.evaluate(()=>{const s=window.studio;s.camera.position.set(2.4,1.7,3.8);s.controls.target.set(0,1.05,0);s.controls.update();});
for(const [pose,seconds] of [['walk',2],['jog',2],['sprint',2],['ground',1.2],['punch',1.5],['takeoff',2.2],['fly',1.5],['boost',2],['land',1.6],['slam',3]]){
    await page.locator(`[data-pose="${pose}"]`).click();
    await page.waitForTimeout(seconds*1000);
    await page.screenshot({path:`.artifacts/${recording}/${pose}.png`});
}
// Continue the recording in the actual game, using real key/mouse events.
await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.game?.player,{timeout:45000});
await page.locator('#start').click();await page.waitForFunction(()=>window.game.input.active);
await page.keyboard.down('KeyW');await page.waitForTimeout(1600);await page.keyboard.down('Shift');await page.waitForTimeout(1200);await page.keyboard.up('Shift');await page.keyboard.up('KeyW');
await page.mouse.click(600,450,{button:'right'});await page.waitForTimeout(1300);
await page.keyboard.press('KeyF');await page.keyboard.down('Space');await page.waitForTimeout(3200);await page.keyboard.up('Space');
await page.keyboard.down('KeyW');await page.keyboard.down('Shift');await page.waitForTimeout(1500);await page.mouse.down();await page.waitForTimeout(600);await page.mouse.up();await page.keyboard.up('KeyW');await page.keyboard.up('Shift');
await page.keyboard.press('KeyQ');await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
const video=page.video();await context.close();await video.saveAs(`.artifacts/${recording}-preview.webm`);await b.close();
fs.writeFileSync(`.artifacts/${recording}-recording.json`,JSON.stringify({errors,source:'Mesh2Motion original paired mannequin and animation, no retargeting',gameInputs:'actual keyboard/mouse',authoredKeyframes:false},null,2));
console.log(JSON.stringify({errors},null,2));if(errors.length)process.exitCode=1;
