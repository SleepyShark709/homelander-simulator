import {chromium} from '@playwright/test';
import fs from 'node:fs';
const label=process.argv[2]??'current';fs.mkdirSync('.artifacts',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.game?.player,{timeout:45000});
const report=await page.evaluate(()=>{
 const g=window.game;g.renderer.setAnimationLoop(null);const render=g.presentation.render.bind(g.presentation);g.presentation.render=()=>{};let clock=1000;
 const setup=(height=1.03,roof=false)=>{g.reset();for(const e of [...g.world.entities.values()])if(e.person)g.world.remove(e);g.running=true;g.input.active=true;g.previous=clock;g.accumulator=0;g.ui.playing(true);const p=g.player;p.position.set(0,height,25);p.previous.copy(p.position);p.mode=height>2?'fly':'ground';if(roof)g.physics.staticBox(p.position.clone().set(0,5,25),p.position.clone().set(10,2,10));p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);g.physics.world.step();p.sync();return p;};
 const feet=p=>{p.visual.group.updateMatrixWorld(true);let min=Infinity;for(const {mesh,vertex} of p.visual.soles){const point=p.position.clone().fromBufferAttribute(mesh.geometry.attributes.position,vertex);mesh.applyBoneTransform(vertex,point).applyMatrix4(mesh.matrixWorld);min=Math.min(min,point.y);}return min;};
 const checks=[],landings=[],jumps=[];
 for(const hz of [60,120,144])for(const key of ['KeyF','KeyQ'])for(const roof of [false,true]){
  const p=setup(roof?15:12,roof);g.input.pressed.add(key);let contact=false,maxLift=0,maxPhysicalRise=0,contactY=0,sawLand=false,hits=0,contactFrame=0,maxSupportGap=0;const hit=p.onSlam;p.onSlam=q=>{hits++;hit(q);};
  for(let i=0;i<hz*4;i++){clock+=1000/hz;g.frame(clock);if(p.mode==='ground'&&!contact){contact=true;contactY=p.position.y;contactFrame=i;}
   if(contact){const lift=feet(p)-(p.visual.group.position.y+.008);if(lift>maxLift){maxLift=lift;g.camera.update(0,false,true);render(0);}maxPhysicalRise=Math.max(maxPhysicalRise,p.position.y-contactY);if(i>contactFrame+hz*.06)maxSupportGap=Math.max(maxSupportGap,feet(p)-(roof?6:0));if(['land','style_land_from_back'].includes(p.visual.current))sawLand=true;}}
  landings.push({hz,key,roof,contact,maxLift,maxPhysicalRise,maxSupportGap,sawLand,hits,final:p.visual.current});
 }
 checks.push({name:'F and Q ground/roof landings stay planted instead of replaying an airborne descent',pass:landings.every(s=>s.contact&&s.maxLift<.12&&s.maxPhysicalRise<.04&&s.maxSupportGap<.09&&s.sawLand),landings});
 checks.push({name:'Q preserves one physical impact and uses the landing recovery as F',pass:landings.every(s=>s.hits===(s.key==='KeyQ'?1:0)&&s.sawLand)});
 for(const hz of [60,120,144])for(const moving of ['idle','run','sprint']){
  const p=setup();for(let i=0;i<10;i++){clock+=1000/hz;g.frame(clock);}if(moving!=='idle')g.input.keys.add('KeyW');if(moving==='sprint')g.input.keys.add('ShiftLeft');for(let i=0;i<hz*.5;i++){clock+=1000/hz;g.frame(clock);}const start=p.position.y;g.input.pressed.add('Space');g.input.keys.add('Space');let apex=start,sawJump=false,contacts=0,wasAir=false,airStart,airEnd,landingSpeed=Infinity;
  for(let i=0;i<hz*3;i++){clock+=1000/hz;g.frame(clock);apex=Math.max(apex,p.position.y);if(p.mode==='jump'){sawJump=true;if(!airStart)airStart=p.position.clone();airEnd=p.position.clone();}if(p.mode!=='ground')wasAir=true;if(wasAir&&p.mode==='ground'){contacts++;wasAir=false;landingSpeed=Math.hypot(p.velocity.x,p.velocity.z);}}
  jumps.push({hz,moving,distance:airStart?Math.hypot(airEnd.x-airStart.x,airEnd.z-airStart.z):0,landingSpeed,height:apex-start,sawJump,contacts,mode:p.mode,clip:p.visual.current});
 }
 checks.push({name:'Space jumps once while held, in place and running, then returns to the ground',pass:jumps.every(j=>j.sawJump&&j.height>.9&&j.height<2.2&&j.contacts===1&&j.mode==='ground'&&(j.moving==='idle'||(j.distance>3&&j.landingSpeed>5.5))),jumps});


 const momentum=setup();g.input.keys.add('KeyW');for(let i=0;i<90;i++){clock+=1000/120;g.frame(clock);}g.input.pressed.add('Space');
 for(let i=0;i<40;i++){clock+=1000/120;g.frame(clock);}const launchSpeed=Math.hypot(momentum.velocity.x,momentum.velocity.z),launchZ=momentum.position.z;g.input.keys.delete('KeyW');
 for(let i=0;i<45;i++){clock+=1000/120;g.frame(clock);}const coastingSpeed=Math.hypot(momentum.velocity.x,momentum.velocity.z);
 checks.push({name:'releasing movement after takeoff preserves horizontal momentum',pass:momentum.mode==='jump'&&coastingSpeed>launchSpeed*.99&&launchZ-momentum.position.z>2,launchSpeed,coastingSpeed,distance:launchZ-momentum.position.z});
 const transition=setup();for(let i=0;i<10;i++){clock+=1000/120;g.frame(clock);}g.input.pressed.add('Space');for(let i=0;i<50;i++){clock+=1000/120;g.frame(clock);}g.input.pressed.add('KeyF');
 for(let i=0;i<30;i++){clock+=1000/120;g.frame(clock);}const fly=transition.mode==='fly';g.input.pressed.add('KeyQ');let slamHits=0;transition.onSlam=()=>slamHits++;
 for(let i=0;i<300;i++){clock+=1000/120;g.frame(clock);}
 checks.push({name:'jump can enter flight and then Q lands with one impact',pass:fly&&slamHits===1&&transition.mode==='ground',fly,slamHits});
 // Headroom and walls must block physical movement; a held Space cannot double-jump.
 const ceiling=setup();g.physics.staticBox(ceiling.position.clone().set(0,2.9,25),ceiling.position.clone().set(8,.3,8));g.physics.world.step();
 for(let i=0;i<15;i++){clock+=1000/120;g.frame(clock);}g.input.pressed.add('Space');let ceilingTop=ceiling.position.y;
 for(let i=0;i<300;i++){if(i===20)g.input.pressed.add('Space');clock+=1000/120;g.frame(clock);ceilingTop=Math.max(ceilingTop,ceiling.position.y);}
 checks.push({name:'jump respects a low ceiling and an airborne second press cannot double-jump',pass:ceilingTop<1.7&&ceiling.mode==='ground',ceilingTop});
 const wall=setup();g.physics.staticBox(wall.position.clone().set(0,3,21),wall.position.clone().set(10,6,.3));g.physics.world.step();g.input.keys.add('KeyW');g.input.pressed.add('Space');
 for(let i=0;i<240;i++){clock+=1000/120;g.frame(clock);}
 checks.push({name:'a running jump is blocked by a solid wall',pass:wall.position.z>22.1&&wall.mode==='ground',position:wall.position.toArray()});
 const paused=setup();for(let i=0;i<10;i++){clock+=1000/120;g.frame(clock);}g.input.pressed.add('Space');for(let i=0;i<30;i++){clock+=1000/120;g.frame(clock);}
 const before=[paused.position.y,paused.visual.actions.get(paused.visual.current).time];g.running=false;
 for(let i=0;i<120;i++){clock+=1000/120;g.frame(clock);}const after=[paused.position.y,paused.visual.actions.get(paused.visual.current).time];
 g.running=true;g.previous=clock;for(let i=0;i<300;i++){clock+=1000/120;g.frame(clock);}
 checks.push({name:'pause freezes jump physics and animation, then resumes into one landing',pass:before.every((v,i)=>v===after[i])&&paused.mode==='ground',before,after});
 g.running=false;g.presentation.render=render;return {checks};
});
await page.screenshot({path:`.artifacts/landing-${label}.png`});fs.writeFileSync(`.artifacts/jump-landing-${label}.json`,JSON.stringify({...report,errors},null,2));console.log(JSON.stringify({checks:report.checks.map(({landings,jumps,...c})=>c),errors},null,2));await browser.close();if(errors.length||report.checks.some(c=>!c.pass))process.exitCode=1;
