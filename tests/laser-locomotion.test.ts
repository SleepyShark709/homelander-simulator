import { beforeAll, expect, it } from 'vitest';
import * as T from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { loadModel } from './helpers/load-model';
import { Assets } from '../src/core/Assets';
import { Physics,R } from '../src/core/Physics';
import { Player } from '../src/characters/Player';
import type { Input } from '../src/core/Input';
import { CONFIG } from '../src/core/config';

let source:GLTF;
beforeAll(async()=>{await R.init();source=await loadModel('public/assets/human/homelander-style.glb');});
function setup() {
    const physics=new Physics();physics.world.createCollider(new R.ColliderDesc(new R.HalfSpace(new T.Vector3(0,1,0))));
    const assets=new Assets();assets.models.set('person',source);
    const input={keys:new Set<string>(),pressed:new Set<string>(),yaw:0,pitch:0,shift:false,laser:true,punch:false,take(key:string){return this.pressed.delete(key);}};
    const player=new Player(physics,assets,input as unknown as Input,new T.Group());
    if(player.visual.cape)player.visual.cape.enabled=false;
    player.position.set(0,1.03,0);player.previous.copy(player.position);
    player.body.setTranslation(player.position,true);player.body.setNextKinematicTranslation(player.position);physics.world.step();
    let time=0;
    return {physics,input,player,step(){player.step(CONFIG.step);physics.world.step();player.sync();player.animate(CONFIG.step,time+=CONFIG.step);},
        dispose(){player.visual.dispose();physics.dispose();}};
}
it.each([['KeyA','strafe_l'],['KeyD','strafe_r'],['KeyS','backpedal']] as const)(
    'plays the actual %s gait, keeps its aim heading, and accelerates under Shift',(key,clip)=>{
    const f=setup();try {
        f.input.keys.add(key);
        for(let i=0;i<120;i++)f.step();
        const normal=f.player.velocity.length();
        expect(f.player.visual.current).toBe(clip);
        expect(f.player.visual.group.rotation.y).toBeCloseTo(Math.PI,6);
        f.input.shift=true;for(let i=0;i<120;i++)f.step();
        expect(f.player.velocity.length()/normal).toBeGreaterThan(1.35);
        expect(f.player.visual.actions.get(clip)!.getEffectiveTimeScale()).toBeLessThanOrEqual(CONFIG.playerAimAnimationRateMax);
        const action=f.player.visual.actions.get(clip)!,time=action.time;
        f.player.animate(0,2);expect(action.time).toBe(time);
        f.input.laser=false;for(let i=0;i<60;i++)f.step();
        expect(f.player.visual.current).toBe('sprint');
        expect(f.player.visual.actions.get(clip)!.getEffectiveWeight()).toBe(0);
    } finally {f.dispose();}
});
it('has visible forward acceleration and selects Sprint rather than reusing Jog',()=>{
    const f=setup();try {
        f.input.laser=false;f.input.keys.add('KeyW');for(let i=0;i<120;i++)f.step();
        const normal=f.player.velocity.length();expect(normal).toBeCloseTo(CONFIG.walk,2);
        expect(f.player.visual.current).toBe('jog');
        f.input.shift=true;for(let i=0;i<120;i++)f.step();
        expect(f.player.velocity.length()).toBeCloseTo(CONFIG.sprint,2);
        expect(f.player.velocity.length()/normal).toBeGreaterThan(1.35);expect(f.player.visual.current).toBe('sprint');
    } finally {f.dispose();}
});
it.each(['strafe_l','strafe_r','backpedal'])('loops the complete %s skeleton at the rate cap',name=>{
    const f=setup();try {
        const p=f.player.visual,bones:T.Bone[]=[];p.model.traverse(o=>{if(o instanceof T.Bone)bones.push(o);});
        p.mixer.stopAllAction();p.current='';p.play(name);const action=p.actions.get(name)!;action.timeScale=CONFIG.playerAimAnimationRateMax;
        let previous:T.Vector3[]|undefined,maxStep=0,worst='',maxWristRise=-Infinity;
        for(let i=0;i<300;i++) {
            p.mixer.update(CONFIG.step);p.group.updateMatrixWorld(true);const points=bones.map(b=>b.getWorldPosition(new T.Vector3()));
            if(previous)points.forEach((v,j)=>{const step=v.distanceTo(previous![j]);if(step>maxStep){maxStep=step;worst=`${i}/${bones[j].name}/${action.time}`;}});previous=points;
            for(const side of ['l','r']) {
                const wrist=p.model.getObjectByName('hand'+side)!.getWorldPosition(new T.Vector3());
                const elbow=p.model.getObjectByName('forearm_stretch'+side)!.getWorldPosition(new T.Vector3());
                maxWristRise=Math.max(maxWristRise,wrist.y-elbow.y);
            }
        }
        expect(maxStep,worst).toBeLessThan(.12);
        expect(maxWristRise,'the composed relaxed arms must not fall back to an IK T-pose').toBeLessThan(-.12);
    } finally {f.dispose();}
});
it('keeps all joints and sampled skin continuous through diagonals and reversals',()=>{
    const f=setup(),bones:T.Bone[]=[],meshes:T.SkinnedMesh[]=[];
    f.player.visual.model.traverse(o=>{if(o instanceof T.Bone)bones.push(o);if(o instanceof T.SkinnedMesh)meshes.push(o);});
    try {
        let previous:T.Vector3[]|undefined,maxStep=0,worst='';
        for(const keys of [['KeyA'],['KeyA','KeyW'],['KeyD','KeyW'],['KeyD'],['KeyD','KeyS'],['KeyS'],['KeyA','KeyS'],[]]) {
            f.input.keys.clear();keys.forEach(k=>f.input.keys.add(k));
            for(let i=0;i<65;i++) {
                f.step();const p=f.player.visual;p.group.updateMatrixWorld(true);
                const points=bones.map(b=>b.getWorldPosition(new T.Vector3()).sub(p.group.position));
                for(const mesh of meshes)for(let vertex=0;vertex<mesh.geometry.attributes.position.count;vertex+=503) {
                    const point=new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertex);
                    mesh.applyBoneTransform(vertex,point).applyMatrix4(mesh.matrixWorld).sub(p.group.position);points.push(point);
                }
                if(previous)points.forEach((v,j)=>{const step=v.distanceTo(previous![j]);if(step>maxStep){maxStep=step;worst=`${keys}/${i}/${bones[j]?.name??j}/${p.current}`;}});previous=points;
            }
            expect(present(f.player.visual.actions.get('jog_start_l'))).toBe(false);
        }
        expect(maxStep,worst).toBeLessThan(.12);
    } finally {f.dispose();}
});
function present(action:T.AnimationAction|undefined) {return !!action && action.getEffectiveWeight()>.001;}
