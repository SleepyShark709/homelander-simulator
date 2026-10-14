import { chromium } from '@playwright/test';
import fs from 'node:fs';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,1800));});
await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.game?.player,{timeout:20000});
const report=await page.evaluate(()=>{
 const g=window.game;g.renderer.setAnimationLoop(null);
 let clock=1000;
 const frame=(dt)=>{clock+=dt*1000;g.frame(clock);};
 const setup=(x,y,z,mode='ground')=>{
  g.reset();g.running=true;g.input.active=true;g.ui.playing(true);g.previous=clock;g.accumulator=0;
  // Isolate controller fixtures from random pedestrian patrols.
  for(const e of g.world.alive('civilian'))g.world.remove(e);
  const p=g.player;p.position.set(x,y,z);p.previous.copy(p.position);p.velocity.set(0,0,0);p.mode=mode;
  p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);g.physics.world.step();p.sync();g.camera.update(10,false);
 };
 const checks=[],edge=[];
 for(const side of [-1,1]){
  setup(side*90,1.16,0);g.input.yaw=-side*Math.PI/2;g.input.keys.add('KeyW');
  for(let i=0;i<480;i++)frame(1/60);
  const outward=g.player.position.clone();
  g.input.keys.clear();g.input.keys.add('KeyS');for(let i=0;i<120;i++)frame(1/60);
  const inward=g.player.position.clone();
  g.input.keys.clear();g.input.keys.add('KeyA');for(let i=0;i<120;i++)frame(1/60);
  const tangent=g.player.position.clone();
  edge.push({side,outward:outward.toArray(),inward:inward.toArray(),tangent:tangent.toArray(),returnDistance:(outward.x-inward.x)*side,tangentDistance:Math.abs(tangent.z-inward.z)});
 }
 checks.push({name:'ground boundary permits returning and tangential walking',pass:edge.every(s=>s.returnDistance>4&&s.tangentDistance>4),data:edge});
 const curb=[];
 for(const side of [-1,1]){
  // The redesigned intersection has curb gaps; test an actual raised edge at z=70.
  setup(side*8,1.16,70);g.input.yaw=-side*Math.PI/2;g.input.keys.add('KeyW');for(let i=0;i<180;i++)frame(1/60);
  curb.push({side,position:g.player.position.toArray(),distance:(g.player.position.x-side*8)*side});
 }
 checks.push({name:'crossing roadway edge onto pavement makes continuous progress',pass:curb.every(s=>s.distance>8),data:curb});
 const flights=[];
 for(const hz of [60,120,144]){
  setup(0,30,30,'fly');g.input.yaw=0;g.input.pitch=-.1;g.input.keys.add('KeyW');g.input.keys.add('ShiftLeft');
  for(let i=0;i<hz;i++)frame(1/hz);
  const points=[];
  for(let i=0;i<Math.floor(hz*.7);i++){
   frame(1/hz);
   const p=g.player.visual.group.position.clone();const head=g.player.visual.model.getObjectByName('head').getWorldPosition(p.clone());head.project(g.camera.camera);
   points.push({root:p.toArray(),pixel:[head.x*720,head.y*450],camera:g.camera.camera.position.toArray()});
  }
  const pixelJerk=points.slice(2).map((p,i)=>Math.hypot(p.pixel[0]-2*points[i+1].pixel[0]+points[i].pixel[0],p.pixel[1]-2*points[i+1].pixel[1]+points[i].pixel[1]));
  const reversals=points.slice(1).filter((p,i)=>p.root[2]>points[i].root[2]+.005).length;
  flights.push({hz,maxPixelJerk:Math.max(...pixelJerk),meanPixelJerk:pixelJerk.reduce((a,b)=>a+b,0)/pixelJerk.length,reversals,points});
 }
 checks.push({name:'steady straight flight has no visible frame-to-frame camera jerk',pass:flights.every(f=>f.maxPixelJerk<.75&&f.reversals===0),data:flights.map(({points,...f})=>f)});
 setup(0,4,0,'fall');
 const landing=[];for(let i=0;i<120;i++){frame(1/60);if(g.player.mode==='ground')landing.push({time:g.time,clip:g.player.visual.current});}
 const held=landing.filter(p=>p.clip==='land').length;
 checks.push({name:'landing animation is retained for its recovery instead of interrupted after a frame',pass:held>=12,data:{groundFrames:landing.length,landingFrames:held,first:landing.slice(0,20)}});
 g.running=false;g.input.clear();g.previous=performance.now();g.renderer.setAnimationLoop(t=>g.frame(t));
 return {checks,flights,landing};
});
fs.mkdirSync('.artifacts',{recursive:true});fs.writeFileSync('.artifacts/quality-repro.json',JSON.stringify({...report,errors},null,2));
console.log(JSON.stringify({checks:report.checks,errors},null,2));
if(report.checks.some(c=>!c.pass)||errors.length)process.exitCode=1;
await browser.close();
