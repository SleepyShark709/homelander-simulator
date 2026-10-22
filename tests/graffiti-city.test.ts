import { expect, it } from 'vitest';
import * as T from 'three';
import { Physics, R } from '../src/core/Physics';
import { buildGraffitiCity } from '../src/world/GraffitiCity';
import { Assets } from '../src/core/Assets';
import type { StreetWorld } from '../src/world/World';
import { Combat } from '../src/gameplay/Combat';
import { Health } from '../src/gameplay/rules';
import { Npcs } from '../src/gameplay/Npcs';

it('city LODs share cached geometry, roof collision follows transforms, and destroyed gates leave a real opening',async()=>{
    await R.init();
    const source=new T.Group(),material=new T.MeshStandardMaterial(),geometry=new T.BoxGeometry(10,4,8);
    for(let level=0;level<3;level++) {const m=new T.Mesh(geometry,material);m.name=`Backdrop_Brick_L${level}`;m.position.y=2;source.add(m);}
    const roof=new T.Mesh(new T.BoxGeometry(10,.1,8),material);roof.name='Backdrop_Brick_Roof';roof.position.y=5;source.add(roof);
    const corner=new T.Group();corner.name='Stair_Corner';source.add(corner);
    const stairs=new T.Mesh(new T.BoxGeometry(2,.2,3),material);stairs.name='Stair_Collision';stairs.position.set(0,.1,0);source.add(stairs);
    const courts=Array.from({length:15},(_,i)=>({position:[-80+i%4*40,0,-80+Math.floor(i/4)*40],yaw:i%2*Math.PI/2,width:12,depth:12,
        entry:{position:[-80+i%4*40,0,-82.4+Math.floor(i/4)*40],yaw:i%2*Math.PI/2,width:4.6}}));
    const layout={buildings:[{prototype:'Backdrop_Brick',position:[-34,0,-34],yaw:Math.PI/2,height:1.1},
        {prototype:'Backdrop_Brick',position:[80,0,80],yaw:0,height:1}],landmark:{position:[34,0,43]},
        courtyards:courts,plots:[[-97,-64],[-52,-13],[13,52],[64,97]],sidewalkEdges:[],
        prototypes:{Backdrop_Brick:{center:[0,0,0],roofY:4,collider:{size:[10,4,8],offset:[0,2,0]}}}};
    const assets=new Assets();assets.models.set('graffitiCity',{scene:source,parser:{json:{extras:{graffitiCity:layout}}}} as never);
    const originalProp=assets.prop.bind(assets);
    assets.prop=()=>new T.Mesh(new T.BoxGeometry(.5,1,.5),material.clone()) as never;
    const physics=new Physics(),group=new T.Group(),entities=new Map(),byCollider=new Map();let id=0;
    const fixture={assets,physics,group,entities,byCollider,nav:[],spawnPoints:[],art:{plaza:material,
        surfaces:{concrete:material,roof:material},awning:()=>new T.Group(),
        street:{metal:material,bin:()=>new T.Mesh(new T.BoxGeometry(.5,.8,.5),material),tree:()=>new T.Mesh(new T.BoxGeometry(.2,2,.2),material)}},
        box:(size:T.Vector3,p:T.Vector3,_color:number,solid=false)=>{const m=new T.Mesh(new T.BoxGeometry(size.x,size.y,size.z),material);m.position.copy(p);group.add(m);if(solid)physics.staticBox(p,size);return m;},
        add:(kind:string,mesh:T.Mesh,collider:R.Collider,hp:number)=>{const e={id:++id,kind,mesh,collider,health:new Health(hp)};entities.set(id,e);byCollider.set(collider.handle,e);return e;},
    } as unknown as StreetWorld;
    try {
        buildGraffitiCity(fixture);physics.world.step();
        const hit=physics.ray(new T.Vector3(-34,12,-34),new T.Vector3(0,-1,0),20);
        expect(12-hit!.timeOfImpact).toBeCloseTo(5.05*1.1,3);
        const camera=new T.PerspectiveCamera();camera.position.set(-34,12,-34);
        fixture.updateScenery!(camera);
        const counts=()=>{const n=[0,0,0];group.traverse(o=>{if(o instanceof T.InstancedMesh){n[Number(o.name.match(/L(\d)/)![1])]+=o.count;expect(o.geometry).toBe(geometry);}});return n;};
        expect(counts()).toEqual([1,0,1]);camera.position.set(0,100,200);fixture.updateScenery!(camera);expect(counts()).toEqual([0,0,2]);
        const people:T.Vector3[]=[];fixture.spawn=(_kind,p)=>{people.push(p.clone());return undefined as never;};
        new Npcs(fixture,physics,{} as never,{} as never,{} as never,camera);
        expect(new Set(people.map(p=>p.toArray().join(','))).size).toBe(20);
        const gate=[...entities.values()].find(e=>e.mesh.name==='city-courtyard-gate');
        const direction=new T.Vector3(0,0,-1).applyQuaternion(gate.mesh.quaternion);
        const origin=gate.mesh.position.clone().addScaledVector(direction,-3);
        expect(physics.ray(origin,direction,6)?.collider.handle).toBe(gate.collider.handle);
        const combat=new Combat(fixture,physics,{} as never,{hit:()=>{},destroyed:()=>{}} as never,
            {particles:()=>{},fragments:()=>{}} as never,{scare:()=>{}} as never,camera);
        combat.hit(gate,200,'gate',gate.mesh.position,direction,1);physics.world.step();
        expect(gate.mesh.visible).toBe(false);expect(physics.ray(origin,direction,6)).toBeNull();
        let disposed=0;group.traverse(o=>{if(o instanceof T.InstancedMesh)o.addEventListener('dispose',()=>disposed++);});
        assets.disposeScene(group);expect(disposed).toBeGreaterThan(0);
        expect(source.children[0].position.y).toBe(2);
    } finally {assets.prop=originalProp;physics.dispose();}
});
