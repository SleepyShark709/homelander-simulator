import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import * as T from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { loadModel } from './helpers/load-model';
import { Assets } from '../src/core/Assets';
import { PersonVisual } from '../src/characters/PersonVisual';
import { contactPhase, contactTime } from '../src/characters/Locomotion';
import { CONFIG } from '../src/core/config';
let asset:GLTF; const people:PersonVisual[]=[];
beforeAll(async()=>{asset=await loadModel('public/assets/human/homelander-style.glb');});
afterEach(()=>{people.splice(0).forEach(p=>p.dispose());vi.restoreAllMocks();});
function setup() {const assets=new Assets();assets.models.set('person',asset);const p=new PersonVisual(assets,'hero');if(p.cape)p.cape.enabled=false;people.push(p);return p;}
it('maps named touchdown intervals reversibly even across a wrap',()=>{
    const a={baseSpeed:5,leftContact:.23,rightContact:.6},b={baseSpeed:6,leftContact:.13,rightContact:.43};
    for(let t=0;t<.7;t+=.007) {const phase=contactPhase(t,.7,a);expect(contactTime(phase,.7,a)).toBeCloseTo(t,7);
        const target=contactTime(phase,.533333,b);expect(contactPhase(target,.533333,b)).toBeCloseTo(phase,7);}
    expect(contactPhase(.23,.7,a)).toBe(0);expect(contactPhase(.6,.7,a)).toBeCloseTo(.5,7);
});
it.each(['ground','fly'])('uses both %s variants only at complete loop boundaries and stays frozen at zero dt',mode=>{
    let random=.1;vi.spyOn(Math,'random').mockImplementation(()=>random);
    const p=setup(),seen=new Set<string>();let previous=p.current,changes=0;
    for(let frame=0;frame<120*65;frame++) {
        const old=p.actions.get(p.current),before=old?.time;
        random=frame<120*7 ? .1 : .9;
        p.update(1/120,frame/120,mode,0);seen.add(p.current);
        if(previous!==p.current && frame>0) {changes++;expect(before).toBeLessThan(.02);}
        previous=p.current;
    }
    expect(seen.size).toBe(2);expect(changes).toBeGreaterThan(0);
    const time=p.actions.get(p.current)!.time,clip=p.current;
    for(let i=0;i<30;i++)p.update(0,65,mode,0);
    expect(p.current).toBe(clip);expect(p.actions.get(clip)!.time).toBe(time);
});
it('separates an elegant natural fall from the existing jump air and keeps both flight transition variants',()=>{
    const p=setup();p.update(.1,0,'fall',12);expect(p.current).toBe('style_fall_controlled');
    p.update(.1,.1,'jump_air',4);expect(p.current).toBe('fall');
    for(const name of ['style_fly_relaxed','hover_to_fly_natural_a','hover_to_fly_natural_b','fly_to_hover_natural_a','fly_to_hover_natural_b'])expect(p.actions.has(name)).toBe(true);
});
it('starts, stops and immediately interrupts a stop with matching gait phases and bounded animation rates',()=>{
    const p=setup(),seen=new Set<string>();let time=0;
    const step=(speed:number,intent:boolean)=>{p.update(1/120,time+=1/120,'ground',speed,false,0,'',undefined,0,undefined,intent);seen.add(p.current);};
    for(let i=0;i<100;i++)step(6*(1-Math.exp(-9*i/120)),true);
    for(let i=0;i<100;i++)step(6,true);
    for(let i=0;i<8;i++)step(6*Math.exp(-9*i/120),false);
    expect(p.current).toMatch(/^jog_stop_/);step(4,true);expect(p.current).not.toMatch(/^jog_stop_/);
    for(let i=0;i<60;i++)step(24,true);
    expect([...seen].some(c=>c.startsWith('jog_start_'))).toBe(true);
    for(const name of ['jog','sprint'])expect(p.actions.get(name)!.getEffectiveTimeScale()).toBeLessThanOrEqual(CONFIG.playerRunAnimationRateMax);
    const jog=p.actions.get('jog')!,sprint=p.actions.get('sprint')!,meta=asset.parser.json.extras.locomotion;
    step(6,true);step(12,true);step(6,true);
    expect(contactPhase(jog.time,jog.getClip().duration,meta.jog)).toBeCloseTo(contactPhase(sprint.time,sprint.getClip().duration,meta.sprint),5);
});

it.each([['l',.1],['r',.1],['l',.9],['r',.9]] as const)('turns %s from variant %s without a pose jump or heading rewind',(side,random)=>{
    vi.spyOn(Math,'random').mockReturnValue(random);
    const p=setup(),bones:T.Object3D[]=[];p.model.traverse(o=>{if(o instanceof T.Bone)bones.push(o)});
    for(let i=0;i<60;i++)p.update(1/120,i/120,'ground',0);
    expect(p.startTurn(side==='l')).toBe(true);
    const yaw=p.group.rotation.y,time=p.actions.get('turn_'+side)!.time;
    p.update(0,1,'ground',0);expect(p.group.rotation.y).toBe(yaw);expect(p.actions.get('turn_'+side)!.time).toBe(time);
    let previous:T.Vector3[]|undefined,maxStep=0;
    for(let i=0;i<240;i++) {
        p.update(1/120,1+i/120,'ground',0);p.group.updateMatrixWorld(true);
        const pose=bones.map(b=>b.getWorldPosition(new T.Vector3()));
        if(previous)maxStep=Math.max(maxStep,...pose.map((v,j)=>v.distanceTo(previous![j])));previous=pose;
    }
    expect(maxStep).toBeLessThan(.12);
    expect(Math.sign(p.group.rotation.y)).toBe(side==='l'?1:-1);expect(Math.abs(p.group.rotation.y)).toBeGreaterThan(1);
    const final=p.group.rotation.y;for(let i=0;i<60;i++)p.update(1/120,3+i/120,'ground',0);
    expect(p.group.rotation.y).toBe(final);expect(p.current).toMatch(/^style_idle_/);
});

it.each(['move','attack','fall'])('interrupts a turn for %s while preserving the accumulated heading',event=>{
    const p=setup();expect(p.startTurn(true)).toBe(true);
    for(let i=0;i<36;i++)p.update(1/120,i/120,'ground',0);
    const yaw=p.group.rotation.y;
    for(let i=0;i<120;i++)p.update(1/120,1+i/120,event==='fall'?'fall':'ground',event==='move'?6:0,
        false,0,event==='attack'?'punch':'',undefined,event==='attack'?.5:0,undefined,event==='move');
    expect(p.group.rotation.y).toBe(yaw);expect(p.turnYawDelta).toBe(0);expect(p.current).not.toMatch(/^turn_/);
});
