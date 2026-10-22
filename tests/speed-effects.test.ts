import { beforeAll, expect, it, vi } from 'vitest';
import * as T from 'three';
import { Physics, R } from '../src/core/Physics';
import { BloodImpact } from '../src/render/BloodImpact';
import { ImpactRemnant } from '../src/render/ImpactRemnant';
import { CONFIG } from '../src/core/config';

beforeAll(async()=>{await R.init();});
it.each([0,15])('places pooled blood on the actual %sm surface and clips residue at walls',height=>{
    const physics=new Physics(), group=new T.Group();
    physics.staticBox(new T.Vector3(0,height-.5,0),new T.Vector3(20,1,20));
    physics.staticBox(new T.Vector3(.7,height+2,0),new T.Vector3(.2,4,5));
    const exclude=physics.world.createCollider(R.ColliderDesc.ball(.1).setTranslation(50,50,50)); physics.world.step();
    const blood=new BloodImpact(group,physics);
    for(let i=0;i<40;i++) blood.spawn(new T.Vector3(0,height+1,0),new T.Vector3(0,0,-1),exclude,()=>true);
    expect(blood.drops).toHaveLength(CONFIG.superSpeed.bloodBursts*CONFIG.superSpeed.bloodDrops);
    expect(blood.pools).toHaveLength(CONFIG.superSpeed.bloodPools);
    for(const pool of blood.pools.filter(p=>p.mesh.visible)) {
        expect(pool.mesh.position.y).toBeCloseTo(height+.012,4);
        const positions=pool.mesh.geometry.attributes.position;
        for(let i=0;i<positions.count;i++) expect(positions.getX(i)+pool.mesh.position.x).toBeLessThan(.6);
    }
    const lives=blood.drops.map(d=>d.life); blood.update(0); expect(blood.drops.map(d=>d.life)).toEqual(lives);
    expect(blood.sprays.filter(s=>s.mesh.visible)).toHaveLength(CONFIG.superSpeed.bloodBursts);
    const pool=blood.pools.find(p=>p.mesh.visible)!;
    expect(pool.mesh.scale.x).toBeCloseTo(.14,6);
    blood.update(CONFIG.superSpeed.poolSpreadTime);
    expect(pool.mesh.scale.x).toBeCloseTo(1,6);
    expect(blood.drops.some(d=>d.life>0)).toBe(true);
    expect(blood.sprays.every(s=>!s.mesh.visible)).toBe(true);
    blood.update(20); expect(blood.drops.every(d=>d.life===0)).toBe(true); expect(blood.pools.every(p=>!p.mesh.visible)).toBe(true);
    blood.dispose(); expect(group.children.length).toBe(0); physics.dispose();
});

it('keeps only a brief independent visual snapshot and never disposes shared assets',()=>{
    const group=new T.Group(),effect=new ImpactRemnant(group),source=new T.Group();
    const material=new T.MeshStandardMaterial(),geometry=new T.BoxGeometry();
    const mesh=new T.Mesh(geometry,material);source.add(mesh);source.position.set(3,2,1);
    const sharedGeometry=vi.spyOn(geometry,'dispose'),sharedMaterial=vi.spyOn(material,'dispose');
    effect.spawn(source,new T.Vector3(0,0,-1));
    const remnant=effect.active[0],copy=remnant.root.children[0] as T.Mesh;
    expect(copy.geometry).toBe(geometry);expect(copy.material).not.toBe(material);
    expect(remnant.root.position.toArray()).toEqual([3,2,1]);
    const owned=vi.spyOn(copy.material as T.Material,'dispose');
    effect.update(0);expect(remnant.progress.value).toBe(0);
    effect.update(CONFIG.superSpeed.impactTransition*.5);expect(remnant.progress.value).toBeCloseTo(.5);
    effect.update(CONFIG.superSpeed.impactTransition);expect(effect.active).toHaveLength(0);expect(owned).toHaveBeenCalledOnce();
    expect(sharedGeometry).not.toHaveBeenCalled();expect(sharedMaterial).not.toHaveBeenCalled();
    for(let i=0;i<CONFIG.superSpeed.bloodBursts+3;i++)effect.spawn(source,new T.Vector3());
    expect(effect.active).toHaveLength(CONFIG.superSpeed.bloodBursts);
    effect.dispose();expect(group.children).toHaveLength(0);
    geometry.dispose();material.dispose();
});
it('keeps car-top residue attached to its actual support and removes it with that support',()=>{
    const physics=new Physics(), group=new T.Group();
    physics.world.createCollider(new R.ColliderDesc(new R.HalfSpace(new T.Vector3(0,1,0))));
    const body=physics.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0,1,0));
    physics.world.createCollider(R.ColliderDesc.cuboid(2,.5,2).setMass(1000),body);
    const exclude=physics.world.createCollider(R.ColliderDesc.ball(.1).setTranslation(30,30,30));physics.world.step();
    const blood=new BloodImpact(group,physics);blood.spawn(new T.Vector3(0,2,0),new T.Vector3(0,0,1),exclude,()=>true);
    const pool=blood.pools.find(p=>p.mesh.visible)!;expect(pool.mesh.position.y).toBeGreaterThan(1.4);
    body.setTranslation(new T.Vector3(5,1,0),true);physics.world.step();blood.update(0);
    expect(pool.mesh.position.x).toBeCloseTo(5,4);
    physics.world.removeRigidBody(body);blood.update(0);expect(pool.mesh.visible).toBe(false);expect(pool.life).toBe(0);
    blood.dispose();physics.dispose();
});
