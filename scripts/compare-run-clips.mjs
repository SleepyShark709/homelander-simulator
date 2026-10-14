// Audition two distinct stock clips on their own original base skin/skeleton.
// This preview never copies base tracks into the addon player or edits keyframes.
import {chromium} from '@playwright/test';
import fs from 'node:fs';
fs.mkdirSync('.artifacts/distinct-runs',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const context=await browser.newContext({viewport:{width:1200,height:900},recordVideo:{dir:'.artifacts/distinct-runs',size:{width:1200,height:900}}});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5173/?preview=character');
await page.waitForFunction(()=>window.studio?.person,{timeout:30000});
const report=await page.evaluate(async()=>{
 const {PersonVisual}=await import('/src/PersonVisual.ts');
 const s=window.studio;s.renderer.setAnimationLoop(null);s.scene.remove(s.person.group);
 const asset=s.person.assets.models.get('civilian2');
 const names=['jog','sprint'];
 const people=names.map((_,i)=>{
  const p=new PersonVisual(s.person.assets,'civilian');p.model.scale.setScalar(1);
  p.model.traverse(o=>{if(o.isMesh)for(const material of Array.isArray(o.material)?o.material:[o.material])material.color.set(0xffffff);});
  p.group.position.set(i ? .86 : -.86,.05,0);s.scene.add(p.group);return p;
 });
 const pedestal=s.scene.children.find(o=>o.isMesh&&o.geometry?.type==='CylinderGeometry');if(pedestal)pedestal.scale.x=2.5;
 document.querySelector('.studio-controls').remove();
 document.querySelector('.studio-bar').innerHTML='<strong>普通跑 / 快跑 · 原配现成动作对比</strong><span>素材预览 · 尚未替换主角</span>';
 const label=document.createElement('div');label.style.cssText='position:fixed;top:115px;left:0;width:100%;display:flex;justify-content:center;gap:260px;color:#e8d4a6;font:600 20px sans-serif;pointer-events:none';
 label.innerHTML='<span>普通跑 · Jog</span><span>快跑 · Sprint</span>';document.body.append(label);
 s.camera.position.set(0,1.5,5.2);s.controls.target.set(0,1.05,0);s.controls.update();
 let previous;const begin=performance.now();
 s.renderer.setAnimationLoop(now=>{const dt=previous===undefined?0:Math.min(.05,(now-previous)/1000);previous=now;
  people[0].update(dt,(now-begin)/1000,'ground',4);people[1].update(dt,(now-begin)/1000,'ground',12);
  s.renderer.render(s.scene,s.camera);
 });
 window.runComparison={people};
 return {sourceBundle:asset.parser.json.extras.sourceBundle,bones:asset.parser.json.skins[0].joints.length,clips:names.map(name=>{const a=asset.parser.json.animations.find(a=>a.name===name);return {name,original:a.extras.sourceClip,channels:a.channels.length};}),retargeted:false,authoredKeyframes:false,installedInGame:false};
});
await page.waitForTimeout(4200);await page.screenshot({path:'.artifacts/distinct-runs/front.png'});
await page.evaluate(()=>{const s=window.studio;s.camera.position.set(2.6,1.55,5.4);s.controls.update();});
await page.waitForTimeout(4200);await page.screenshot({path:'.artifacts/distinct-runs/angle.png'});
await page.evaluate(()=>window.studio.renderer.setAnimationLoop(null));
const video=page.video();await context.close();await video.saveAs('.artifacts/distinct-runs-preview.webm');await browser.close();
const result={...report,errors};fs.writeFileSync('.artifacts/distinct-runs-comparison.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
if(errors.length||report.clips[0].original===report.clips[1].original)process.exitCode=1;
