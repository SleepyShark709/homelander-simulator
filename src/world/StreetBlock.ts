import * as T from 'three';
import { R } from '../core/Physics';
import { v } from '../core/math';
import { streetGround, metreBox, type GroundRect } from './CitySurfaces';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { StreetWorld } from './World';

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
    const roads: GroundRect[] = [[-300, 300, -10, 10], [-10, 10, -300, 300]];
    for (const side of [-1, 1]) {
        roads.push([-100, 100, side * 58 - 4, side * 58 + 4]);
        roads.push([side * 58 - 4, side * 58 + 4, -100, 100]);
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
    for (const a of [-1, 1]) {
        for(const side of [-1,1]) {
            world.box(v(86,.16,4),v(side*57,.08,a*12),0xb7b8aa,true).material=world.art.paving;
            world.box(v(4,.16,86),v(a*12,.08,side*57),0xb7b8aa,true).material=world.art.paving;
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
    world.group.add(district);
    district.updateMatrixWorld(true);
    district.traverse(o => {
        if (o.userData.collider)
            world.physics.staticBox(o.getWorldPosition(v()), v(...o.userData.collider as [number, number, number]));
        if (o.userData.background) o.traverse(child => {
            if (child instanceof T.Mesh) child.castShadow = child.receiveShadow = false;
        });
    });
    for (const [i, [x, z, width, depth]] of [
        [-37, -38, 22, 26], [-40, -73, 28, 22], [38, 38, 24, 27], [37, 74, 25, 24],
    ].entries()) {
        const shutter = world.assets.prop('shutter', 2.85, i);
        shutter.position.set(x + width * .32, .35, z + depth / 2 + .13);
        world.group.add(shutter);
    }
    // An open plaza and framed, genuinely openable storefront rooms.
    for (const sign of [-1, 1]) {
        const x = sign * 39,
            z = -sign * 38;
        world.box(v(40, 0.15, 42), v(x, 0.07, z), 0xa5ab9c, true).material=world.art.plaza;
        world.box(v(20, 0.35, 13), v(x, 0.3, z), 0xbdbeaf, true).material=world.art.paving;
        world.box(v(20, 0.3, 13), v(x, 5.3, z), 0xe2d9c3, true).material=world.art.surfaces.roof;
        world.box(v(20, 5, 0.4), v(x, 2.8, z - sign * 6.3), 0x9f998b, true).material=world.art.surfaces.concrete;
        for (const dx of [-9.8, 9.8])
            world.box(v(0.4, 5, 13), v(x + dx, 2.8, z), 0xafa493, true).material=world.art.surfaces.concrete;
        for (let j = 0; j < 4; j++) {
            const px = x - 7.5 + j * 5,
                pz = z + sign * 6.3;
            world.box(v(0.25, 5, 0.5), v(px - 2.4, 2.8, pz), 0xdbd0b7, true);
            const size = v(4.6, 4.4, 0.22),
                p = v(px, 2.85, pz);
            const panel = world.box(size, p, j % 2 ? 0x6e979d : 0x8ca7a0);
                panel.material = new T.MeshPhysicalMaterial({ color: 0xb9d1cf, roughness: .2, metalness: .06,
                    transparent: true, opacity: .27, depthWrite: false, envMapIntensity: .7, clearcoat: .25 });
                panel.material.forceSinglePass = true;
                panel.castShadow = false;
                panel.userData.fragmentType = 'glass';
                // Frames belong to the breakable pane and vanish with it, so
                // destroying a shopfront still opens the exact same passage.
                const frameMaterial = () => new T.MeshStandardMaterial({ color: 0x263d40, roughness: .5, metalness: .55 });
                const transom = new T.Mesh(new T.BoxGeometry(4.55,.075,.28),frameMaterial());
                transom.castShadow = true;
                transom.position.y = .1; panel.add(transom);
                const mullion = new T.Mesh(new T.BoxGeometry(.065,4.35,.28),frameMaterial());
                mullion.castShadow = true;
                mullion.position.x = j % 2 ? -.6 : .6; panel.add(mullion);
            const c = world.physics.staticBox(p, size);
            world.add('panel', panel, c, 130);
        }
        for (let j = 0; j < 2; j++) {
            const p = v(x + 23, 1.5, z - 6 + j * 6),
                size = v(0.3, 3, 5.8);
            const panel = world.box(size, p, 0xb5a48a);
            world.add('panel', panel, world.physics.staticBox(p, size), 100);
        }
        for (let j = 0; j < 4; j++) {
            const tree = world.art.street.tree(j+sign*10);
            tree.position.set(x - 13 + j * 9, 0, z + sign * 19);
            world.group.add(tree);
            world.physics.staticBox(tree.position.clone().add(v(0,1.8,0)),v(.52,3.6,.52));
            const planter=world.box(v(2.3,.27,2.3),tree.position.clone().add(v(0,.13,0)),0x9a9b90,true);
            planter.material=world.art.paving;
        }
        for(let j=0;j<3;j++) {
            const bench=world.art.street.bench();bench.position.set(x-10+j*10,.15,z+sign*14.5);
            if(sign<0) bench.rotation.y=Math.PI;world.group.add(bench);
            world.physics.staticBox(bench.position.clone().add(v(0,.52,0)),v(1.88,1.04,.55));
            const bin=world.art.street.bin();bin.position.copy(bench.position).add(v(2.2,0,0));world.group.add(bin);
            world.add('prop',bin,world.physics.staticBox(bin.position.clone().add(v(0,.5,0)),v(.58,1,.58)),60);
        }
        const shop=world.art.sign(sign>0 ? '江湾生活超市' : '江畔咖啡 · RIVERSIDE',8);
        shop.position.set(x,4.9,z+sign*6.56);if(sign<0) shop.rotation.y=Math.PI;world.group.add(shop);
        shopDetails(world,x,z,sign);
    }
    for (let i = 0; i < 12; i++) {
        const horizontal = i < 6,
            t = -85 + (i % 6) * 34,
            sign = i % 2 ? 1 : -1;
        const p = horizontal ? v(t, 0, sign * 13.7) : v(sign * 13.7, 0, t);
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
        const car = world.assets.clone(key);
        const bounds = new T.Box3().setFromObject(car);
        const size = bounds.getSize(v());
        const center = bounds.getCenter(v());
        car.position.set(-center.x, -center.y, -center.z);
        p.y = size.y / 2 + .08;
        const group = new T.Group();
        group.name = key;
        group.position.copy(p);
        const rotation = new T.Quaternion().setFromAxisAngle(v(0,1,0), i < 4 ? Math.PI/2 : 0);
        group.quaternion.copy(rotation);
        group.add(car);
        world.group.add(group);
        const body = world.physics.world.createRigidBody(
            R.RigidBodyDesc.dynamic()
                .setTranslation(p.x, p.y, p.z)
                .setRotation(rotation)
                .setLinearDamping(0.45)
                .setAngularDamping(0.9)
                .setCcdEnabled(true),
        );
        const collider = world.physics.world.createCollider(
            R.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
                .setMass(key === 'bus' ? 1800 : key === 'scooter' ? 110 : 380)
                .setFriction(0.8)
                .setRestitution(0.15),
            body,
        );
        world.add('car', group, collider, 300, body);
    }
    for(const x of [-1,1]) for(const z of [-1,1]) {
        const light=world.art.street.trafficLight();light.position.set(x*13.6,.16,z*16.5);
        if(z>0) light.rotation.y=Math.PI;world.group.add(light);
        world.add('prop',light,world.physics.staticBox(light.position.clone().add(v(0,1.85,0)),v(.35,3.7,.28)),65);
    }
    for (let t = -90; t <= 90; t += 15) {
        for (const side of [-12, 12]) {
            world.nav.push(v(t, 0.18, side), v(side, 0.18, t));
        }
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

function shopDetails(world: StreetWorld, x: number, z: number, sign: number) {
    const add = (key: string, height: number, position: T.Vector3, rotation = 0, hp = 70) => {
        const object = world.assets.prop(key,height);
        object.position.copy(position); object.rotation.y = rotation;
        world.group.add(object);
        const bounds = new T.Box3().setFromObject(object), center = bounds.getCenter(v()), size = bounds.getSize(v());
        if (key === 'pottedPlant') { size.set(.52,.5,.52); center.copy(position).y += .25; }
        world.add('prop',object,world.physics.staticBox(center,size),hp);
        return object;
    };
    // Authored cafe/shop interiors are visible through real breakable glazing.
    for (const offset of [-6.8, 6.8]) {
        add('shopCabinet',1.95,v(x+offset,.475,z-sign*4.9),sign>0 ? 0 : Math.PI,90);
        add('pottedPlant',1.35,v(x+offset,.15,z+sign*8.6),offset>0 ? .5 : -.6,45);
    }
    add('cafeSet',.95,v(x,.475,z+sign*1.3),sign>0 ? .35 : -.35);
    for (const offset of [-5.2,5.2])
        add('cafeSet',.95,v(x+offset,.15,z+sign*11),offset<0 ? .2 : -.35);
    // A service counter gives the room a purpose while keeping the front
    // aisle open. It shares the same damage/removal rules as other props.
    const counter = new T.Group(); counter.name = 'shop-service-counter';
    counter.position.set(x,.475,z-sign*3.7);
    const counterParts = [new T.BoxGeometry(6.5,.95,.85).translate(0,.475,0)];
    for (let i = 0; i < 27; i++)
        counterParts.push(new T.BoxGeometry(.035,.81,.035).translate(-3.13+i*.24,.48,sign*.44));
    const counterBody = new T.Mesh(mergeGeometries(counterParts)!,
        new T.MeshStandardMaterial({color:0x294b49,roughness:.75}));
    counterParts.forEach(geometry => geometry.dispose());
    counterBody.castShadow = counterBody.receiveShadow = true; counter.add(counterBody);
    const top = new T.Mesh(metreBox(6.7,.09,1.02),world.art.surfaces.stone.clone());
    top.position.y = .995; top.castShadow = top.receiveShadow = true; counter.add(top);
    world.group.add(counter);
    world.add('prop',counter,world.physics.staticBox(counter.position.clone().add(v(0,.52,0)),v(6.7,1.04,1.02)),110);
    const menu = world.art.sign(sign>0 ? 'METRO / FRESH DAILY' : 'COFFEE / BAKERY',5.5);
    menu.position.set(x,3,z-sign*6.07); if(sign<0) menu.rotation.y = Math.PI;
    world.group.add(menu);
    const canopy = world.art.awning(19.6,sign>0 ? 0 : 2);
    canopy.position.set(x,4.5,z+sign*6.55); if(sign<0) canopy.rotation.y = Math.PI;
    world.group.add(canopy);
    world.physics.staticBox(v(x,4.35,z+sign*7.15),v(19.6,.5,1.25));
    for (const offset of [-6,0,6]) {
        const light = new T.Mesh(new T.PlaneGeometry(2.8,.65),
            new T.MeshBasicMaterial({color:0xd9cdb0,toneMapped:false}));
        light.rotation.x = Math.PI/2; light.position.set(x+offset,5.12,z);
        world.group.add(light);
        const illumination = new T.PointLight(0xffe2bd,45,11,2);
        illumination.position.set(x+offset,4.95,z);
        world.group.add(illumination);
    }
}
