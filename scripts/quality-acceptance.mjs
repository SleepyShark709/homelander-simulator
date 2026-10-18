import {chromium} from '@playwright/test';
import fs from 'node:fs';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,2000));});
await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.game?.player,{timeout:45000});
const report=await page.evaluate(()=>{
 const g=window.game;g.renderer.setAnimationLoop(null);let clock=1000;
 const frame=(dt=1/60)=>{clock+=dt*1000;g.frame(clock);};
 const setup=(x=0,y=1,z=25,mode='ground')=>{
  g.reset();for(const e of g.world.alive('civilian'))g.world.remove(e);
  g.running=true;g.input.active=true;g.ui.playing(true);g.previous=clock;g.accumulator=0;
  const p=g.player;p.position.set(x,y,z);p.previous.copy(p.position);p.velocity.set(0,0,0);p.mode=mode;
  p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);g.physics.world.step();p.sync();g.camera.update(2,false);
 };
 const checks=[];
 const check=(name,pass,data)=>checks.push({name,pass,data});
 const vector=()=>g.player.position.clone();
 const samples=(dense=false)=>{
  g.player.visual.group.updateMatrixWorld(true);const points=[];
  g.player.visual.model.traverse(mesh=>{
   if(!mesh.isMesh)return;
   const used=mesh.geometry.index ? [...new Set(mesh.geometry.index.array)] : Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>i),stride=dense ? 1 : Math.max(1,Math.floor(used.length/90));
   for(let n=0;n<used.length;n+=stride){const i=used[n],point=vector().fromBufferAttribute(mesh.geometry.attributes.position,i);if(mesh.isSkinnedMesh)mesh.applyBoneTransform(i,point);point.applyMatrix4(mesh.matrixWorld);points.push(point);}
  });return points;
 };
 const penetration=(dense=false)=>{
  const points=samples(dense);let maximum=0,count=0;
  for(const point of points){const hit=g.physics.world.projectPoint(point,false,undefined,undefined,g.player.collider,undefined,c=>!g.physics.ignored.has(c.handle));if(hit?.isInside){const depth=point.distanceTo(hit.point);maximum=Math.max(maximum,depth);if(depth>.015)count++;}}
  return {maximum,count,samples:points.length};
 };
 // Six real street seams, including the shop plinth and wall sliding.
 const routes=[];
 for(const [x,z,yaw,seconds] of [[8,70,-Math.PI/2,2.5],[-8,70,Math.PI/2,2.5],[70,8,Math.PI,2.5],[70,-8,0,2.5],[35,-25,0,1.5],[-37,-20,0,2]]){
  setup(x,1.16,z);g.input.yaw=yaw;g.input.keys.add('KeyW');for(let i=0;i<seconds*60;i++)frame();
  const end=g.player.position.clone();g.input.keys.clear();g.input.keys.add('KeyS');for(let i=0;i<75;i++)frame();
  routes.push({start:[x,z],end:end.toArray(),forwardDistance:Math.hypot(end.x-x,end.z-z),returnDistance:end.distanceTo(g.player.position)});
 }
 check('road edges, raised storefront and wall allow returning',routes.every(r=>r.returnDistance>2.5)&&routes.slice(0,4).every(r=>r.forwardDistance>8),routes);
 setup(-37,1,-20);g.input.keys.add('KeyW');let wallDepth=0;for(let i=0;i<150;i++){frame();if(i>40&&i%8===0)wallDepth=Math.max(wallDepth,penetration([64,88,120].includes(i)).maximum);}
 g.input.keys.clear();for(let i=0;i<30;i++)frame();
 check('animated body stays outside the solid wall while walking into it',wallDepth<.025,{wallDepth,end:g.player.position.toArray()});
 let punchWallDepth=0;g.input.punch=true;for(let i=0;i<40;i++){frame();if(i%4===0)punchWallDepth=Math.max(punchWallDepth,penetration(true).maximum);}
 check('full native body and hands stay outside the wall during a punch',punchWallDepth<.025,{punchWallDepth});
 setup(-37,12,-12,'fly');g.input.keys.add('KeyW');g.input.keys.add('ShiftLeft');let flightWallDepth=0;for(let i=0;i<120;i++){frame();if(i>15&&i%5===0)flightWallDepth=Math.max(flightWallDepth,penetration().maximum);}
 check('forward flight body and head stay outside the wall',flightWallDepth<.025,{flightWallDepth,end:g.player.position.toArray()});
 setup(-37,12,-12,'fly');g.input.yaw=Math.PI;g.input.keys.add('KeyS');g.input.keys.add('ShiftLeft');let backwardsDepth=0;for(let i=0;i<130;i++){frame();if(i%10===0)backwardsDepth=Math.max(backwardsDepth,penetration(true).maximum);}
 g.input.keys.clear();g.input.pressed.add('KeyF');for(let i=0;i<85;i++){frame();if(i%10===0)backwardsDepth=Math.max(backwardsDepth,penetration(true).maximum);}
 check('native feet and body remain clear during backward flight and flight exit at a wall',backwardsDepth<.025,{backwardsDepth,end:g.player.position.toArray()});
 const jitter=[];
 for(const profile of ['hover','accelerate','turn','uneven']){
  setup(0,65,30,'fly');
  if(profile!=='hover')g.input.keys.add('KeyW');
  g.input.keys.add('ShiftLeft');const points=[];let t=0;
  for(let i=0;i<220;i++){
   const dt=profile==='uneven' ? [1/144,1/120,1/75,1/90,1/60][i%5] : 1/120;
   if(profile==='turn')g.input.yaw+=dt*.7;
   frame(dt);t+=dt;const p=g.player.visual.group.position.clone().project(g.camera.camera);
   points.push({t,dt,x:p.x*720,y:p.y*450});
  }
  let max=0;for(let i=40;i<points.length;i++){
   const a=points[i-2],b=points[i-1],c=points[i];
   const dx=(c.x-b.x)/c.dt-(b.x-a.x)/b.dt,dy=(c.y-b.y)/c.dt-(b.y-a.y)/b.dt;
   max=Math.max(max,Math.hypot(dx,dy)*Math.min(b.dt,c.dt));
  }
  jitter.push({profile,maxNormalizedPixelJump:max});
 }
 check('hover acceleration turns and uneven render times keep camera motion continuous',jitter.every(j=>j.maxNormalizedPixelJump<.75),jitter);
 setup();g.input.pressed.add('KeyF');const launch=[];for(let i=0;i<Math.ceil((g.player.visual.actionDuration('takeoff')+.8)*60);i++){frame();launch.push({mode:g.player.mode,clip:g.player.visual.current,y:g.player.position.y});}
 const hoverAt=launch.findIndex(p=>p.mode==='fly')/60;
 check('takeoff anticipates then reaches hover within 0.75 seconds',launch.filter(p=>p.mode==='takeoff').length>=10&&launch.some(p=>p.clip==='takeoff')&&hoverAt>0&&hoverAt<=.75&&launch.at(-1).mode==='fly'&&launch.at(-1).y>1.6,{hoverAt,first:launch.slice(0,18),end:launch.at(-1)});
 setup(0,65,30,'fly');g.input.keys.add('KeyW');g.input.keys.add('ShiftLeft');g.input.laser=true;let beamError=0,visibleBeamSamples=0;
 for(let i=0;i<100;i++){frame(1/144);g.player.visual.group.updateMatrixWorld(true);for(let eye=0;eye<2;eye++){
  const beam=g.effects.beams[eye];if(!beam.visible)continue;visibleBeamSamples++;const axis=vector().set(0,1,0).applyQuaternion(beam.quaternion);
  const origin=beam.position.clone().addScaledVector(axis,-beam.scale.y*.5);beamError=Math.max(beamError,origin.distanceTo(g.player.visual.eyes[eye].getWorldPosition(vector())));
 }}
 check('lasers remain attached to the animated eyes at 144 Hz',beamError<.00001&&visibleBeamSamples>=190,{beamError,visibleBeamSamples});
 g.running=false;g.input.clear();g.previous=performance.now();g.renderer.setAnimationLoop(t=>g.frame(t));
 return {checks};
});
fs.writeFileSync('.artifacts/quality-acceptance.json',JSON.stringify({...report,errors},null,2));
console.log(JSON.stringify({...report,errors},null,2));if(errors.length||report.checks.some(c=>!c.pass))process.exitCode=1;
await page.screenshot({path:'.artifacts/quality-acceptance-last.png'});await browser.close();
