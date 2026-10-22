import * as T from 'three';
import { R } from '../core/Physics';
import { v } from '../core/math';
import { streetGround, type GroundRect } from './CitySurfaces';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { StreetWorld } from './World';
import { buildSceneDensity } from './SceneDensity';
import { buildGraffitiCity, type CityLayout } from './GraffitiCity';
import { buildGraffitiTrial } from './GraffitiTrial';
import { addVehicle } from './Vehicles';

function paint(world: StreetWorld, size: T.Vector3, p: T.Vector3, color: number) {
    const mesh = world.box(size, p, color);
    // Paint is a decal, not another shadow-casting road surface. Depth bias
    // keeps millimetre-thick markings stable at grazing angles and in flight.
    const material = mesh.material as T.MeshStandardMaterial;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -4;
    mesh.castShadow = false;
    return mesh;
}

export function buildStreetBlock(world: StreetWorld) {
    if (world.assets.graffitiTrial) {
        buildGraffitiTrial(world);
        return;
    }
    const roads: GroundRect[] = [[-300, 300, -10, 10], [-10, 10, -300, 300]];
    for (const side of [-1, 1]) {
        roads.push([-100, 100, side * 58 - (world.assets.graffitiCity ? 3.6 : 4), side * 58 + (world.assets.graffitiCity ? 3.6 : 4)]);
        roads.push([side * 58 - (world.assets.graffitiCity ? 3.6 : 4), side * 58 + (world.assets.graffitiCity ? 3.6 : 4), -100, 100]);
    }
    for (const t of [-240, -180, -120, 120, 180, 240]) {
        roads.push([-300, 300, t - 7, t + 7], [t - 7, t + 7, -300, 300]);
    }
    const ground = streetGround(roads);
    for (const surface of ['asphalt', 'paving'] as const) {
        const mesh = new T.Mesh(ground[surface], world.art[surface]);
        mesh.receiveShadow = true;
        world.group.add(mesh);
    }
    // A plane has an exact upward contact normal. The former 220 m cuboid
    // occasionally returned tilted normals and bumped characters on flat roads.
    world.physics.world.createCollider(
        new R.ColliderDesc(new R.HalfSpace({ x: 0, y: 1, z: 0 })).setFriction(0.7),
    );
    // Secondary streets connect the building plots into readable city blocks.
    for (const side of [-1,1]) {
        for (let t=-96;t<=96;t+=12) {
            if (Math.abs(t)<16 || Math.abs(Math.abs(t)-58)<6) continue;
            paint(world, v(3,.001,.13),v(t,.0025,side*58),0xbfb8a4);
            paint(world, v(.13,.001,3),v(side*58,.0025,t),0xbfb8a4);
        }
    }
    if (world.assets.graffitiCity) {
        const layout=world.assets.models.get('graffitiCity')!.parser.json.extras.graffitiCity as CityLayout;
        const plots=layout.plots,edges=layout.sidewalkEdges;
        const paving=(x0:number,x1:number,z0:number,z1:number)=>{
            const mesh=world.box(v(x1-x0,.16,z1-z0),v((x0+x1)/2,.08,(z0+z1)/2),0xb7b8aa,true);
            mesh.material=world.art.paving;
        };
        // Each plot owns four disjoint strips. Corners belong to the side
        // strips, so widening pavements cannot create coplanar overlaps.
        for(let x=0;x<4;x++)for(let z=0;z<4;z++) {
            const [x0,x1]=plots[x],[z0,z1]=plots[z],[a,b]=edges[x],[c,d]=edges[z];
            paving(a,x0,c,d);paving(x1,b,c,d);paving(x0,x1,c,z0);paving(x0,x1,z1,d);
        }
    }
    for (const a of [-1, 1]) {
        if (!world.assets.graffitiCity) for(const side of [-1,1]) {
            for (const [length,center] of [[40,34],[38,81]]) {
                world.box(v(length,.16,4),v(side*center,.08,a*12),0xb7b8aa,true).material=world.art.paving;
                world.box(v(4,.16,length),v(a*12,.08,side*center),0xb7b8aa,true).material=world.art.paving;
            }
            world.box(v(4,.16,4),v(a*12,.08,side*12),0xb7b8aa,true).material=world.art.paving;
        }
        for (let i = -90; i <= 90; i += 10) {
            if (Math.abs(i) > 15) {
                paint(world, v(3, 0.001, 0.16), v(i, 0.0025, a * 0.25), 0xddd3b6);
                paint(world, v(0.16, 0.001, 3), v(a * 0.25, 0.0025, i), 0xddd3b6);
            }
        }
        for (let i = -7; i <= 7; i += 2) {
            paint(world, v(1, 0.001, 4), v(i, 0.0025, a * 15), 0xe1ddd0);
            paint(world, v(4, 0.001, 1), v(a * 15, 0.0025, i), 0xe1ddd0);
        }
        for(let t=-90;t<=90;t+=9) {
            if(Math.abs(t)<18) continue;
            // Segmented kerbs, drain slots and parking bay paint.
            world.box(v(1.4,.065,.18),v(t,.105,a*10.05),0xcac6b8);
            world.box(v(.18,.065,1.4),v(a*10.05,.105,t),0xcac6b8);
            for(let slot=0;slot<5;slot++) {
                paint(world, v(.035,.001,.42),v(t+slot*.06,.0025,a*9.3),0x272d30);
                paint(world, v(.42,.001,.035),v(a*9.3,.0025,t+slot*.06),0x272d30);
            }
            paint(world, v(.11,.001,2.8),v(t,.0025,a*7.7),0xbcbba8);
            paint(world, v(2.8,.001,.11),v(a*7.7,.0025,t),0xbcbba8);
        }
    }
    const district = world.assets.clone('district');
    district.name = 'Jiangwan Blender environment';
    // Offline batches share cached geometry. Keep them out of batchStatic(),
    // which owns and disposes its procedural input geometry.
    district.userData.offlineBatch = true;
    for (const child of [...district.children])
        if (!child.userData.background || (world.assets.graffitiCity && child.name.startsWith('Skyline'))) child.removeFromParent();
    world.group.add(district);
    district.updateMatrixWorld(true);
    district.traverse(o => {
        if (o.userData.collider)
            world.physics.staticBox(o.getWorldPosition(v()), v(...o.userData.collider as [number, number, number]));
        if (o.userData.background) o.traverse(child => {
            if (child instanceof T.Mesh) child.castShadow = child.receiveShadow = false;
        });
    });
    if (world.assets.graffitiCity) buildGraffitiCity(world);
    else {
        // Raised frontage bands share the shop/prop foot plane; secondary-street
        // crossings remain open rather than being covered by a continuous kerb slab.
        for (const side of [-1,1]) for (const [width,x] of [[34,-79],[38,-35]])
            world.box(v(width,.16,4),v(x,.08,side*16),0xb7b8aa,true).material=world.art.paving;
        world.box(v(5,.16,36),v(-30.5,.08,-36),0xb7b8aa,true).material=world.art.paving;
        world.box(v(10,.16,34),v(-33,.08,35),0xb7b8aa,true).material=world.art.plaza;
        buildSceneDensity(world);
    }
    for (let i = 0; i < 12; i++) {
        const horizontal = i < 6,
            t = -85 + (i % 6) * 34,
            sign = i % 2 ? 1 : -1;
        const lampLine=world.assets.graffitiCity ? 9.7 : 13.7;
        const p = horizontal ? v(t, 0, sign * lampLine) : v(sign * lampLine, 0, t);
        if (Math.abs(t) < 18) continue;
        const lamp = world.assets.clone('streetLamp');
        lamp.position.copy(p);
        lamp.scale.setScalar(5.5/3.8705554);
        world.group.add(lamp);
        world.add(
            'prop',
            lamp,
            world.physics.staticBox(
                p.clone().add(v(0, 2.75, 0)),
                v(1.0, 5.5, 0.55),
            ),
            65,
        );
    }
    for (let i = 0; i < 8; i++) {
        const p =
            i < 4
                ? v(-77 + i * 45, 0, i % 2 ? 7 : -7)
                : v(i % 2 ? 7 : -7, 0, -80 + (i - 4) * 46);
        const key = i === 0 ? 'bus' : [2, 5].includes(i) ? 'scooter' : 'sedan';
        addVehicle(world, key, p, i < 4 ? Math.PI/2 : 0);
    }
    for(const x of [-1,1]) for(const z of [-1,1]) {
        const light=world.art.street.trafficLight();light.position.set(x*(world.assets.graffitiCity?9.7:13.6),world.assets.graffitiCity?0:.16,z*16.5);
        if(z>0) light.rotation.y=Math.PI;world.group.add(light);
        world.add('prop',light,world.physics.staticBox(light.position.clone().add(v(0,1.85,0)),v(.35,3.7,.28)),65);
    }
    if (!world.assets.graffitiCity) {
        for (let t = -90; t <= 90; t += 15) {
            for (const side of [-12, 12]) {
                world.nav.push(v(t, 0.18, side), v(side, 0.18, t));
            }
        }
        // Sample alleys/courtyard connect through the existing secondary street.
        for (const z of [-51, 51]) for (const x of [-87,-73,-58,-44,-30,-16])
            world.nav.push(v(x,.18,z));
        for (const z of [-12,-24,-36,-50]) world.nav.push(v(-30.5,.18,z));
        for (const z of [12,24,38,50]) world.nav.push(v(-31,.18,z));
        for (const z of [-50,-36,-24,-12,12,24,38,50]) world.nav.push(v(-58,.18,z));
    }
    world.spawnPoints = [
        v(-90, 0.18, -12),
        v(-90, 0.18, 12),
        v(90, 0.18, -12),
        v(90, 0.18, 12),
        v(-12, 0.18, -90),
        v(12, 0.18, -90),
        v(-12, 0.18, 90),
        v(12, 0.18, 90),
    ];
    if (world.assets.graffitiCity) {
        for (const point of world.spawnPoints) {
            if (Math.abs(point.x)===12) point.x=Math.sign(point.x)*11.5;
            if (Math.abs(point.z)===12) point.z=Math.sign(point.z)*11.5;
        }
        const shape = new R.Capsule(.65,.4), rotation = {x:0,y:0,z:0,w:1};
        const occupied = [...world.entities.values()].map(e=>e.collider);
        world.nav = world.nav.filter(p => occupied.every(c => !c.intersectsShape(shape,
            {x:p.x,y:p.y+1,z:p.z},rotation)));
    }
    // Invisible physical limits are beyond the visible soft boundary.
    for (const sign of [-1, 1]) {
        world.physics.staticBox(v(sign * 101, 40, 0), v(2, 82, 204));
        world.physics.staticBox(v(0, 40, sign * 101), v(204, 82, 2));
    }
    world.physics.staticBox(v(0, 82, 0), v(204, 2, 204));
    batchStatic(world);
}

function batchStatic(world: StreetWorld) {
    const dynamic=new Set<T.Object3D>();
    for (const entity of world.entities.values()) entity.mesh.traverse(o=>dynamic.add(o));
    for (const child of world.group.children)
        if (child.userData.offlineBatch) child.traverse(o => dynamic.add(o));
    world.group.updateMatrixWorld(true);
    const instances=new Map<string,T.InstancedMesh[]>();
    world.group.traverse(o=>{
        if(!(o instanceof T.InstancedMesh) || dynamic.has(o) || o.userData.keepSharedGeometry || Array.isArray(o.material)) return;
        const key=`${o.material.uuid}/${o.geometry.type}/${o.castShadow}/${o.receiveShadow}`;
        const batch=instances.get(key) ?? [];batch.push(o);instances.set(key,batch);
    });
    for(const originals of instances.values()) {
        const first=originals[0],geometry=first.geometry.clone();
        const mesh=new T.InstancedMesh(geometry,first.material,originals.reduce((n,m)=>n+m.count,0));
        const matrix=new T.Matrix4(),color=new T.Color();let index=0;
        for(const original of originals) {
            for(let i=0;i<original.count;i++) {
                original.getMatrixAt(i,matrix);matrix.premultiply(original.matrixWorld);mesh.setMatrixAt(index,matrix);
                if(original.instanceColor) original.getColorAt(i,color);else color.set(0xffffff);
                mesh.setColorAt(index++,color);
            }
            original.removeFromParent();original.geometry.dispose();original.dispose();
        }
        mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;world.group.add(mesh);
    }
    const batches=new Map<string,{material:T.Material;parts:T.BufferGeometry[]; meshes:T.Mesh[]}>();
    world.group.traverse(o=>{
        if (!(o instanceof T.Mesh) || o instanceof T.InstancedMesh || dynamic.has(o) || o.userData.keepSharedGeometry || Array.isArray(o.material)) return;
        const key=`${o.material.uuid}/${o.castShadow}/${o.receiveShadow}`;
        const batch=batches.get(key) ?? {material:o.material,parts:[] as T.BufferGeometry[],meshes:[] as T.Mesh[]};
        batch.parts.push(o.geometry.clone().applyMatrix4(o.matrixWorld));batch.meshes.push(o);batches.set(key,batch);
    });
    for (const {material,parts,meshes} of batches.values()) {
        const merged=mergeGeometries(parts);
        parts.forEach(p=>p.dispose());
        if (!merged) throw new Error('静态街景合批失败');
        const mesh=new T.Mesh(merged,material);mesh.castShadow=meshes[0].castShadow;mesh.receiveShadow=meshes[0].receiveShadow;world.group.add(mesh);
        const geometries=new Set<T.BufferGeometry>();
        meshes.forEach(m=>{geometries.add(m.geometry);m.removeFromParent();});
        geometries.forEach(g=>g.dispose());
    }
}
