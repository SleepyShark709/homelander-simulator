import { beforeAll, expect, it } from 'vitest';
import * as T from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { loadModel } from './helpers/load-model';
import { Assets } from '../src/core/Assets';
import { Physics,R } from '../src/core/Physics';
import { Player } from '../src/characters/Player';
import type { Input } from '../src/core/Input';
import { Game } from '../src/app/Game';
let source:GLTF;
beforeAll(async()=>{await R.init();source=await loadModel('public/assets/human/homelander-style.glb');});
it.each([['style_idle_a','hover'],['style_idle_a','style_hover_b'],['style_idle_b','hover'],['style_idle_b','style_hover_b']])(
 'keeps full-body continuity through low Q and pause from %s / %s',(idle,hover)=>{
 const physics=new Physics();physics.world.createCollider(new R.ColliderDesc(new R.HalfSpace(new T.Vector3(0,1,0))));
 const extras=source.parser.json.extras,parser=Object.create(source.parser);
 parser.json={...source.parser.json,extras:{...extras,activeStyleProfile:'fixture',styleProfiles:{...extras.styleProfiles,fixture:{...extras.styleProfiles.natural,idle:[idle],hover:[hover]}}}};
 const assets=new Assets();assets.models.set('person',{...source,parser});
 const input={keys:new Set<string>(),pressed:new Set(['KeyQ']),yaw:0,pitch:0,shift:false,laser:false,punch:false,take(k:string){return this.pressed.delete(k)}};
 const p=new Player(physics,assets,input as unknown as Input,new T.Group());if(p.visual.cape)p.visual.cape.enabled=false;
 try {
  p.position.set(0,1.28,0);p.previous.copy(p.position);p.mode='fly';p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);physics.world.step();p.sync();
  const g={time:0,worldTime:0,worldScale:1,superSpeedActive:false,previous:1000,accumulator:0,running:true,inspectionFrozen:false,
   physics,player:p,world:{sync(){},interpolate(){}},npcs:{update(){}},combat:{update(){},renderBeams(){}},wanted:{update(){}},
   effects:{update(){},speedTrails(){},wind:{visible:false}},camera:{update(){},camera:{position:new T.Vector3()}},presentation:{render(){}},
   frameTimes:[],updateTimes:[],submissionTimes:[],updateUI(){},step:Game.prototype.step} as unknown as Game;
  let clock=1000,previous:T.Vector3[]|undefined,maxStep=0,worst='';
  const bones:T.Object3D[]=[];p.visual.model.traverse(o=>{if(o instanceof T.Bone)bones.push(o)});
  const frame=()=>Game.prototype.frame.call(g,clock+=1000/120);
  for(let i=0;i<450;i++) {
   frame();p.visual.group.updateMatrixWorld(true);
   const pose=bones.map(b=>b.getWorldPosition(new T.Vector3()).sub(p.visual.group.position));
   if(previous)pose.forEach((v,j)=>{const step=v.distanceTo(previous![j]);if(step>maxStep){maxStep=step;worst=`${i}/${bones[j].name}/${p.visual.current}`;}});previous=pose;
   if(i===1){g.running=false;for(let j=0;j<120;j++)frame();g.running=true;g.previous=clock;}
  }
  expect(maxStep,worst).toBeLessThan(.12);expect(p.mode).toBe('ground');expect(p.recovery).toBe(0);expect(p.visual.current).toBe(idle);
 } finally {p.visual.dispose();physics.dispose();}
});

it.each([-1,1])('uses a captured standing turn for camera direction %s and preserves it after completion',direction=>{
 const physics=new Physics();physics.world.createCollider(new R.ColliderDesc(new R.HalfSpace(new T.Vector3(0,1,0))));
 const assets=new Assets();assets.models.set('person',source);
 const input={keys:new Set<string>(),pressed:new Set<string>(),yaw:direction*Math.PI/2,pitch:0,shift:false,laser:false,punch:false,take(k:string){return this.pressed.delete(k)}};
 const p=new Player(physics,assets,input as unknown as Input,new T.Group());if(p.visual.cape)p.visual.cape.enabled=false;
 try {
  p.position.set(0,1.03,0);p.previous.copy(p.position);p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);physics.world.step();
  const clips=new Set<string>();let time=0;
  const frame=()=>{p.step(1/60);physics.world.step();p.sync();p.animate(1/60,time+=1/60);clips.add(p.visual.current);};
  p.animate(0,0);expect(p.visual.current).not.toMatch(/^turn_/);
  for(let i=0;i<150;i++)frame();
  expect(clips.has(direction>0?'turn_l':'turn_r')).toBe(true);
  const heading=p.visual.group.rotation.y;expect(Math.abs(heading-Math.PI)).toBeGreaterThan(1);
  for(let i=0;i<60;i++)frame();expect(p.visual.group.rotation.y).toBeCloseTo(heading,8);
  expect(Math.hypot(p.position.x,p.position.z)).toBeLessThan(.00001);
  input.keys.add('KeyW');frame();expect(p.velocity.length()).toBeGreaterThan(0);expect(p.visual.current).not.toMatch(/^turn_/);
 } finally {p.visual.dispose();physics.dispose();}
});
