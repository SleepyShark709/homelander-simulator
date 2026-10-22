import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import * as T from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { loadModel } from './helpers/load-model';
import { Assets } from '../src/core/Assets';
import { Physics, R } from '../src/core/Physics';
import type { Input } from '../src/core/Input';
import { Player } from '../src/characters/Player';
import { Combat } from '../src/gameplay/Combat';
import { Npcs } from '../src/gameplay/Npcs';
import { Health, Wanted } from '../src/gameplay/rules';
import type { Effects } from '../src/render/Effects';
import type { StreetWorld } from '../src/world/World';
import type { Entity, Kind } from '../src/world/entities';
import { Game } from '../src/app/Game';
import { CONFIG } from '../src/core/config';

let asset: GLTF;
const fixtures: Array<{player: Player; physics: Physics}> = [];
beforeAll(async () => { await R.init(); asset = await loadModel('public/assets/human/homelander.glb'); });
afterEach(() => { for (const f of fixtures.splice(0)) { f.player.visual.dispose(); f.physics.dispose(); } });
function setup(height = 0) {
    const physics = new Physics(), group = new T.Group();
    if (!height) physics.world.createCollider(new R.ColliderDesc(new R.HalfSpace(new T.Vector3(0,1,0))));
    else physics.staticBox(new T.Vector3(0,height-.5,0),new T.Vector3(80,1,80));
    const assets = new Assets(); assets.models.set('person', asset);
    const input = {keys:new Set<string>(), pressed:new Set<string>(), shift:true, yaw:0, pitch:0, laser:false,
        punch:false, take(key:string) { return this.pressed.delete(key); }};
    const player = new Player(physics,assets,input as unknown as Input,group);
    player.position.set(0,height+1.03,0); player.previous.copy(player.position);
    player.body.setTranslation(player.position,true); player.body.setNextKinematicTranslation(player.position);
    physics.world.step(); player.step(CONFIG.step); physics.world.step();
    player.velocity.set(0,0,-24); input.keys.add('KeyW');
    const entities = new Map<number,Entity>(), byCollider = new Map<number,Entity>();
    const world = {entities, byCollider, sync() {}, alive(kind?:Kind) { return [...entities.values()].filter(e=>!e.health.dead && (!kind || kind===e.kind)); },
        remove(e:Entity) { entities.delete(e.id); byCollider.delete(e.collider.handle); if(e.body) physics.world.removeRigidBody(e.body); e.person?.dispose(); }} as unknown as StreetWorld;
    const effects = {impactRemnant:{spawn:vi.fn()},bloodImpact:vi.fn(),particles:vi.fn(),fragments:vi.fn(),ring:vi.fn(),hideBeams:vi.fn(),update:vi.fn()} as unknown as Effects;
    const npcs = {scare:vi.fn(),update:vi.fn()} as unknown as Npcs;
    const wanted = new Wanted(), combat = new Combat(world,physics,player,wanted,effects,npcs,new T.PerspectiveCamera());
    function entity(kind:Kind, z:number, x=0, hp=100) {
        const id=entities.size+1;
        const body=physics.world.createRigidBody((kind==='car' ? R.RigidBodyDesc.dynamic() : R.RigidBodyDesc.kinematicPositionBased()).setTranslation(x,height+1,z));
        const collider=physics.world.createCollider(kind==='car' ? R.ColliderDesc.cuboid(1,1,1).setMass(1000) : R.ColliderDesc.capsule(.65,.32),body);
        const mesh=new T.Group(); mesh.position.set(x,height,z);
        const e={id,kind,body,collider,mesh,health:new Health(hp),born:0,goal:new T.Vector3(x,height,z-40),scaredUntil:0,shotAt:0,retiring:false,nextThink:100,
            carOwnedUntil:0,collisionHits:new Set<number>(),person:{dispose:vi.fn(),update:vi.fn()}} as unknown as Entity;
        entities.set(id,e); byCollider.set(collider.handle,e); physics.world.step(); return e;
    }
    const game = {time:0,worldTime:0,worldScale:1,superSpeedActive:false,player,physics,world,npcs,combat,effects,wanted,camera:{update(){}}} as unknown as Game;
    const frame=()=>Game.prototype.step.call(game);
    fixtures.push({player,physics});
    return {player,physics,input,world,effects,npcs,wanted,combat,entity,game,frame};
}

it('slows world physics once while preserving the same player trajectory and stored body velocity',()=>{
    const slow=setup(), normal=setup();
    slow.game.worldScale=CONFIG.superSpeed.worldScale;
    const falling=(f:ReturnType<typeof setup>)=>{const body=f.physics.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(20,20,0));f.physics.world.createCollider(R.ColliderDesc.ball(.2).setMass(1),body);return body;};
    const a=falling(slow), b=falling(normal);
    for(let i=0;i<120;i++) {
        slow.frame();
        normal.physics.world.timestep=CONFIG.step*CONFIG.superSpeed.worldScale;
        normal.player.step(CONFIG.step); normal.physics.world.step();
        expect(slow.player.position.distanceTo(normal.player.position)).toBeLessThan(1e-5);
    }
    expect(slow.game.time).toBeCloseTo(2,8); expect(slow.game.worldTime).toBeCloseTo(2*CONFIG.superSpeed.worldScale,8);
    expect(20-a.translation().y).toBeGreaterThan(8*(2*CONFIG.superSpeed.worldScale)**2);
    expect(a.translation().y).toBeCloseTo(b.translation().y,5);
    expect(a.linvel().y).toBeCloseTo(b.linvel().y,5);
    const velocity=a.linvel().y; slow.input.keys.clear(); slow.frame();
    expect(Math.abs(a.linvel().y-velocity)).toBeLessThan(.1);
    for(let i=0;i<20;i++) slow.frame();
    expect(slow.game.worldScale).toBe(1); expect(slow.player.superSpeedRequested).toBe(false);
});

it('uses world time for real NPC movement, animation, shooting and replenishment',()=>{
    const f=setup(), e=f.entity('civilian',-12,10);
    const npc=Object.create(Npcs.prototype) as Npcs;
    Object.assign(npc,{world:f.world,physics:f.physics,player:f.player,wanted:f.wanted,effects:f.effects,controller:f.physics.world.createCharacterController(.03),
        spawnClock:0,dangerUntil:0,danger:new T.Vector3(),withdrawals:new Map(),visible:()=>false});
    npc.controller.enableSnapToGround(.4);
    e.goal.set(50,0,-12); const x=e.body!.translation().x;
    f.game.npcs=npc; f.game.worldScale=CONFIG.superSpeed.worldScale;
    for(let i=0;i<120;i++) f.frame();
    expect(e.body!.translation().x-x).toBeCloseTo(3*CONFIG.superSpeed.worldScale,3);
    expect(npc.spawnClock).toBeCloseTo(2*CONFIG.superSpeed.worldScale,8);
    const calls=vi.mocked(e.person!.update).mock.calls;
    expect(calls.length).toBe(120); expect(calls[0][0]).toBeCloseTo(CONFIG.step*CONFIG.superSpeed.worldScale,8);
    expect(calls.at(-1)![1]).toBeCloseTo(2*CONFIG.superSpeed.worldScale,8);
    expect(f.effects.update).toHaveBeenLastCalledWith(CONFIG.step*CONFIG.superSpeed.worldScale);
});

it.each([1,1.03])('accelerates from idle and reaches a moving person at the configured speed from %sm',height=>{
    const f=setup(),e=f.entity('civilian',-11);
    f.player.position.y=height;f.player.previous.copy(f.player.position);
    f.player.body.setTranslation(f.player.position,true);f.player.body.setNextKinematicTranslation(f.player.position);
    f.player.velocity.set(0,0,0);f.input.keys.clear();f.input.shift=false;f.physics.world.step();
    const npc=Object.create(Npcs.prototype) as Npcs;
    Object.assign(npc,{world:f.world,physics:f.physics,player:f.player,wanted:f.wanted,effects:f.effects,controller:f.physics.world.createCharacterController(.03),
        spawnClock:0,dangerUntil:0,danger:new T.Vector3(),withdrawals:new Map(),visible:()=>false});
    npc.controller.enableSnapToGround(.4);e.goal.set(0,0,-70);f.game.npcs=npc;
    for(let i=0;i<108;i++)f.frame();
    f.input.keys.add('KeyW');for(let i=0;i<48;i++)f.frame();
    f.input.shift=true;for(let i=0;i<240 && !e.health.dead;i++)f.frame();
    expect(e.health.dead).toBe(true);expect(f.combat.kills).toBe(1);
    expect(f.player.velocity.length()).toBeGreaterThan(CONFIG.superSpeed.impactSpeed);
});

it.each([false,true])('handles KCC support prediction beside a moving person with wall=%s',wall=>{
    const f=setup(),e=f.entity('civilian',-1.47875);
    f.player.position.y=1.01;f.player.previous.copy(f.player.position);
    f.player.body.setTranslation(f.player.position,true);f.player.body.setNextKinematicTranslation(f.player.position);
    f.player.velocity.set(0,0,-CONFIG.sprint);f.game.worldScale=CONFIG.superSpeed.worldScale;
    if(wall)f.physics.staticBox(new T.Vector3(0,2,-1.14),new T.Vector3(4,4,.02));
    f.physics.world.timestep=CONFIG.step*CONFIG.superSpeed.worldScale;
    e.body!.setNextKinematicTranslation(new T.Vector3(0,1,-1.48));f.physics.world.step();
    f.frame();
    expect(e.health.dead).toBe(!wall);expect(f.combat.kills).toBe(wall?0:1);
    if(!wall) {
        expect(f.player.position.z).toBeCloseTo(-CONFIG.sprint*CONFIG.step,5);
        expect(f.player.velocity.length()).toBeCloseTo(CONFIG.sprint,5);
    }
});

it.each([0,15])('removes several overlapping people in the same sweep without losing displacement on %sm support',height=>{
    const f=setup(height), reference=setup(height);
    const people=[f.entity('civilian',-1.65),f.entity('police',-1.7),f.entity('soldier',-1.75)];
    f.frame(); reference.frame();
    expect(f.player.position.distanceTo(reference.player.position)).toBeLessThan(1e-5);
    expect(f.player.velocity.distanceTo(reference.player.velocity)).toBeLessThan(1e-5);
    expect(f.combat.kills).toBe(3); expect(f.effects.bloodImpact).toHaveBeenCalledTimes(3);
    expect(f.world.entities.size).toBe(0); expect(f.physics.world.bodies.len()).toBe(1);
    for(const e of people) { expect(e.health.dead).toBe(true); expect(e.ragdoll).toBeUndefined(); }
    f.frame(); expect(f.combat.kills).toBe(3); expect(f.wanted.heat).toBe(33);
});

it.each(['wall','car'])('keeps a complete %s blocking people behind it and applies contact once',obstacle=>{
    const f=setup(); f.entity('civilian',-1.55);
    let car:Entity|undefined;
    if(obstacle==='wall') f.physics.staticBox(new T.Vector3(0,2,-2.4),new T.Vector3(6,4,.4));
    else car=f.entity('car',-2.5,0,1000);
    const hidden=f.entity('civilian',-4.7);
    for(let i=0;i<8;i++) f.frame();
    expect(f.combat.kills).toBe(1); expect(hidden.health.dead).toBe(false);
    expect(f.player.position.z).toBeGreaterThan(-2);
    if(car) expect(car.health.hp).toBe(850);
});

it('does not trigger with cancelled input, low speed or released Shift',()=>{
    for(const mode of ['cancelled','slow','released']) {
        const f=setup(); f.entity('civilian',-1.6,0,500);
        if(mode==='cancelled') f.input.keys.add('KeyS');
        if(mode==='slow') f.player.velocity.set(0,0,-(CONFIG.superSpeed.impactSpeed-1));
        if(mode==='released') f.input.shift=false;
        f.frame(); expect(f.combat.kills).toBe(0); expect(f.effects.bloodImpact).not.toHaveBeenCalled();
    }
});

it('does not credit an already dead target twice and consumes vertical human contact',()=>{
    const f=setup(); const e=f.entity('civilian',-1.65);
    expect(f.combat.contact(e.collider,24,new T.Vector3(0,-1,0),true)).toBe(true);
    expect(e.health.dead).toBe(true); expect(f.combat.kills).toBe(1);
    expect(f.world.entities.has(e.id)).toBe(false);
});
