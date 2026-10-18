import { afterEach, beforeAll, expect, it } from 'vitest';
import * as T from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { Assets } from '../src/core/Assets';
import { PersonVisual } from '../src/characters/PersonVisual';
import { Physics, R } from '../src/core/Physics';
import { loadModel } from './helpers/load-model';

let model: GLTF;
const people: PersonVisual[] = [], worlds: Physics[] = [];
beforeAll(async () => { await R.init(); model = await loadModel('public/assets/human/homelander.glb'); });
afterEach(() => { people.splice(0).forEach(p=>p.dispose()); worlds.splice(0).forEach(w=>w.dispose()); });
function setup() {
    const assets=new Assets();assets.models.set('person',model);
    const person=new PersonVisual(assets,'hero');people.push(person);
    person.group.position.y=2;person.group.updateMatrixWorld(true);person.cape!.reset();
    let mesh!:T.SkinnedMesh;person.model.traverse(o=>{if(o instanceof T.SkinnedMesh)mesh=o;});
    return {person,mesh,cape:person.cape!,step:(dt=1/60)=>person.update(dt,0,'ground',0)};
}
it('simulates an independent cape while preserving body vertices, UVs and the cache', () => {
    const {person,mesh,cape,step}=setup(),other=setup();
    const original=Array.from(mesh.geometry.attributes.position.array);
    expect(mesh.geometry).not.toBe(other.mesh.geometry);
    for(let i=0;i<90;i++)step();
    let motion=0,bodyUnchanged=true;
    for(let i=0;i<original.length/3;i++)for(let k=0;k<3;k++) {
        const delta=Math.abs(mesh.geometry.attributes.position.array[i*3+k]-original[i*3+k]);
        if(cape.vertices.has(i))motion=Math.max(motion,delta);else bodyUnchanged&&=delta===0;
    }
    expect(bodyUnchanged).toBe(true);
    expect(Array.from(other.mesh.geometry.attributes.position.array)).toEqual(original);
    expect(motion).toBeGreaterThan(.02);expect(cape.snapshot().finite).toBe(true);
    expect(cape.snapshot().pinError).toBeLessThan(.001);
    expect(cape.snapshot().maxStretch).toBeLessThan(1.3);
    const cached=model.scene.getObjectByProperty('type','SkinnedMesh') as T.SkinnedMesh;
    expect(Array.from(cached.geometry.attributes.position.array)).toEqual(original);
    expect(mesh.geometry.attributes.uv.array).toEqual(cached.geometry.attributes.uv.array);
    expect(person.model.getObjectByName('headx')).toBeDefined();
});
it.each([30,60,120,144])('remains finite under movement, turns, sudden stops and %s Hz rendering', hz => {
    const {person,cape,step}=setup();
    let peakStretch=1,renderedStretch=1;
    for(let i=0;i<hz*2;i++) {
        person.group.position.z=i<hz?i/hz*12:12;
        person.group.rotation.y=Math.min(i/hz,1)*1.2;
        step(1/hz);const state=cape.snapshot();peakStretch=Math.max(peakStretch,state.maxStretch);
        renderedStretch=Math.max(renderedStretch,state.renderedStretch);
    }
    expect(cape.snapshot().finite).toBe(true);expect(cape.snapshot().pinError).toBeLessThan(.001);
    expect(peakStretch).toBeLessThan(2);
    expect(renderedStretch).toBeLessThan(2);
    expect(new T.Vector3().fromArray(cape.snapshot().tail).distanceTo(person.group.position)).toBeLessThan(3);
});
it('gives consistent cloth motion at 30 and 144 Hz', () => {
    const tails=[];
    for(const hz of [30,144]) {
        const {person,cape,step}=setup();
        for(let i=0;i<hz*2;i++) { person.group.position.z=Math.min((i+1)/hz,1)*6;step(1/hz); }
        tails.push(new T.Vector3().fromArray(cape.snapshot().tail));
    }
    expect(tails[0].distanceTo(tails[1])).toBeLessThan(.04);
});
it.each([[40,0,0],[-40,0,0],[0,40,0],[0,-40,0],[0,0,40],[0,0,-40]])(
    'survives high-speed movement along %s/%s/%s without growing or exploding', (x,y,z) => {
        const {person,cape,step}=setup();person.group.position.set(0,50,0);cape.reset();
        for(let i=0;i<90;i++) { person.group.position.set(x*Math.min((i+1)/60,1),50+y*Math.min((i+1)/60,1),z*Math.min((i+1)/60,1));step(); }
        expect(cape.snapshot().finite).toBe(true);
        expect(new T.Vector3().fromArray(cape.snapshot().tail).distanceTo(person.group.position)).toBeLessThan(3);
    },
);
it('freezes on zero time and restarts safely after teleport', () => {
    const {person,mesh,cape,step}=setup();for(let i=0;i<90;i++)step();
    const before=Array.from(mesh.geometry.attributes.position.array);
    for(let i=0;i<60;i++)step(0);
    expect(Array.from(mesh.geometry.attributes.position.array)).toEqual(before);
    person.group.position.set(80,30,50);step();
    expect(cape.snapshot().finite).toBe(true);
    expect(new T.Vector3().fromArray(cape.snapshot().tail).distanceTo(person.group.position)).toBeLessThan(3);
});
it('releases its private geometry once and never disposes the source', () => {
    const {person,mesh}=setup();let disposed=0;mesh.geometry.addEventListener('dispose',()=>disposed++);
    person.dispose();people.splice(people.indexOf(person),1);
    expect(disposed).toBe(1);
});
it('uses swept sphere collisions for thin walls and roof support', () => {
    const w=new Physics();worlds.push(w);
    const body=w.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0,8,0));
    const excluded=w.world.createCollider(R.ColliderDesc.ball(.1),body);
    w.staticBox(new T.Vector3(0,1.9,0),new T.Vector3(10,.2,10));
    w.staticBox(new T.Vector3(0,3,-.5),new T.Vector3(4,4,.06));w.world.step();
    const target=new T.Vector3(0,1,-2);
    w.constrainSphere(new T.Vector3(0,3,0),target,.035,excluded);
    expect(target.z).toBeGreaterThan(-.48);
    const floor=new T.Vector3(1,1,0);w.constrainSphere(new T.Vector3(1,3,0),floor,.035,excluded);
    expect(floor.y).toBeGreaterThan(2.03);
    const {person,cape,step}=setup();
    cape.worldCollision=(from,to,radius)=>w.constrainSphere(from,to,radius,excluded);
    person.group.position.y=1.5;for(let i=0;i<120;i++)step();
    expect(cape.snapshot().finite).toBe(true);
});
