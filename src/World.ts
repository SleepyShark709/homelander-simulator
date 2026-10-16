import * as T from 'three';
import { Assets, PersonVisual } from './Assets';
import { Physics, R, vec } from './Physics';
import { Health } from './rules';
import { type Kind, isPerson } from './config';
import { CityArt } from './Environment';
import { metreBox, streetGround, type GroundRect } from './CitySurfaces';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Ragdoll } from './Ragdoll';

export interface Entity {
    id: number;
    kind: Kind;
    mesh: T.Object3D;
    collider: R.Collider;
    body?: R.RigidBody;
    health: Health;
    person?: PersonVisual;
    ragdoll?: Ragdoll;
    born: number;
    deathTime?: number;
    goal: T.Vector3;
    scaredUntil: number;
    shotAt: number;
    retiring: boolean;
    nextThink: number;
    carOwnedUntil: number;
    collisionHits: Set<number>;
}
export const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
export const mat = (color: number) =>
    new T.MeshStandardMaterial({ color, roughness: 0.86 });
export class StreetWorld {
    group = new T.Group();
    art: CityArt;
    entities = new Map<number, Entity>();
    byCollider = new Map<number, Entity>();
    nextId = 1;
    nav: T.Vector3[] = [];
    spawnPoints: T.Vector3[] = [];
    private staticMaterials = new Map<number,T.MeshStandardMaterial>();
    constructor(
        public physics: Physics,
        public assets: Assets,
    ) {
        this.art = new CityArt(assets);
        this.build();
    }
    box(size: T.Vector3, p: T.Vector3, color: number, solid = false) {
        if (!this.staticMaterials.has(color)) this.staticMaterials.set(color,mat(color));
        const m = new T.Mesh(
            metreBox(size.x, size.y, size.z),
            this.staticMaterials.get(color)!,
        );
        m.position.copy(p);
        m.receiveShadow = true;
        m.castShadow = true;
        this.group.add(m);
        if (solid) this.physics.staticBox(p, size);
        return m;
    }
    private paint(size: T.Vector3, p: T.Vector3, color: number) {
        const mesh = this.box(size, p, color);
        // Paint is a decal, not another shadow-casting road surface. Depth bias
        // keeps millimetre-thick markings stable at grazing angles and in flight.
        const material = mesh.material as T.MeshStandardMaterial;
        material.polygonOffset = true;
        material.polygonOffsetFactor = -1;
        material.polygonOffsetUnits = -4;
        mesh.castShadow = false;
        return mesh;
    }
    add(
        kind: Kind,
        mesh: T.Object3D,
        collider: R.Collider,
        hp: number,
        body?: R.RigidBody,
        person?: PersonVisual,
    ): Entity {
        const entity: Entity = {
            id: this.nextId++,
            kind,
            mesh,
            collider,
            body,
            health: new Health(hp),
            person,
            born: 0,
            goal: mesh.position.clone(),
            scaredUntil: 0,
            shotAt: 0,
            retiring: false,
            nextThink: 0,
            carOwnedUntil: 0,
            collisionHits: new Set(),
        };
        this.entities.set(entity.id, entity);
        this.byCollider.set(collider.handle, entity);
        return entity;
    }
    build() {
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
            const mesh = new T.Mesh(ground[surface], this.art[surface]);
            mesh.receiveShadow = true;
            this.group.add(mesh);
        }
        // A plane has an exact upward contact normal. The former 220 m cuboid
        // occasionally returned tilted normals and bumped characters on flat roads.
        this.physics.world.createCollider(
            new R.ColliderDesc(new R.HalfSpace({ x: 0, y: 1, z: 0 })).setFriction(0.7),
        );
        // Secondary streets connect the building plots into readable city blocks.
        for (const side of [-1,1]) {
            for (let t=-96;t<=96;t+=12) {
                if (Math.abs(t)<16 || Math.abs(Math.abs(t)-58)<6) continue;
                this.paint(v(3,.001,.13),v(t,.0025,side*58),0xbfb8a4);
                this.paint(v(.13,.001,3),v(side*58,.0025,t),0xbfb8a4);
            }
        }
        for (const a of [-1, 1]) {
            for(const side of [-1,1]) {
                this.box(v(86,.16,4),v(side*57,.08,a*12),0xb7b8aa,true).material=this.art.paving;
                this.box(v(4,.16,86),v(a*12,.08,side*57),0xb7b8aa,true).material=this.art.paving;
                this.box(v(4,.16,4),v(a*12,.08,side*12),0xb7b8aa,true).material=this.art.paving;
            }
            for (let i = -90; i <= 90; i += 10) {
                if (Math.abs(i) > 15) {
                    this.paint(v(3, 0.001, 0.16), v(i, 0.0025, a * 0.25), 0xddd3b6);
                    this.paint(v(0.16, 0.001, 3), v(a * 0.25, 0.0025, i), 0xddd3b6);
                }
            }
            for (let i = -7; i <= 7; i += 2) {
                this.paint(v(1, 0.001, 4), v(i, 0.0025, a * 15), 0xe1ddd0);
                this.paint(v(4, 0.001, 1), v(a * 15, 0.0025, i), 0xe1ddd0);
            }
            for(let t=-90;t<=90;t+=9) {
                if(Math.abs(t)<18) continue;
                // Segmented kerbs, drain slots and parking bay paint.
                this.box(v(1.4,.065,.18),v(t,.105,a*10.05),0xcac6b8);
                this.box(v(.18,.065,1.4),v(a*10.05,.105,t),0xcac6b8);
                for(let slot=0;slot<5;slot++) {
                    this.paint(v(.035,.001,.42),v(t+slot*.06,.0025,a*9.3),0x272d30);
                    this.paint(v(.42,.001,.035),v(a*9.3,.0025,t+slot*.06),0x272d30);
                }
                this.paint(v(.11,.001,2.8),v(t,.0025,a*7.7),0xbcbba8);
                this.paint(v(2.8,.001,.11),v(a*7.7,.0025,t),0xbcbba8);
            }
        }
        const plots = [
            [-37, -38, 22, 21, 26],
            [-71, -36, 24, 33, 28],
            [-40, -73, 28, 15, 22],
            [-76, -75, 23, 25, 24],
            [38, 38, 24, 22, 27],
            [73, 36, 22, 32, 25],
            [37, 74, 25, 16, 24],
            [75, 75, 24, 27, 23],
        ];
        plots.forEach(([x, z, w, h, d], i) => {
            const model = this.art.architecture(w, h, d, i);
            model.position.set(x, 0, z);
            this.group.add(model);
            this.physics.staticBox(v(x, h / 2, z), v(w+.2, h, d+.2));
            for (const solid of model.userData.solids)
                this.physics.staticBox(solid.position.clone().add(v(x,0,z)),solid.size);
            this.box(v(w + 1, 0.35, d + 1), v(x, 0.17, z), 0xacafa1).material =
                this.art.paving;
            const sign = this.art.sign(
                [
                    'VANTAGE',
                    'WEST / 01',
                    'ATLAS',
                    'NORTH BANK',
                    'METRO',
                    'DISTRICT',
                    'CIVIC',
                    'VOUGHT',
                ][i],
                4.2,
            );
            sign.position.set(x, 3.8, z + d / 2 + 0.08);
            this.group.add(sign);
            if (i % 2 === 0) {
                const shutter = this.assets.prop('shutter', 2.85, i / 2);
                shutter.position.set(x + w * .32, .35, z + d / 2 + .13);
                this.group.add(shutter);
            }
        });
        // An open plaza and framed, genuinely openable storefront rooms.
        for (const sign of [-1, 1]) {
            const x = sign * 39,
                z = -sign * 38;
            this.box(v(40, 0.15, 42), v(x, 0.07, z), 0xa5ab9c, true).material=this.art.plaza;
            this.box(v(20, 0.35, 13), v(x, 0.3, z), 0xbdbeaf, true).material=this.art.paving;
            this.box(v(20, 0.3, 13), v(x, 5.3, z), 0xe2d9c3, true).material=this.art.surfaces.roof;
            this.box(v(20, 5, 0.4), v(x, 2.8, z - sign * 6.3), 0x9f998b, true).material=this.art.surfaces.concrete;
            for (const dx of [-9.8, 9.8])
                this.box(v(0.4, 5, 13), v(x + dx, 2.8, z), 0xafa493, true).material=this.art.surfaces.concrete;
            for (let j = 0; j < 4; j++) {
                const px = x - 7.5 + j * 5,
                    pz = z + sign * 6.3;
                this.box(v(0.25, 5, 0.5), v(px - 2.4, 2.8, pz), 0xdbd0b7, true);
                const size = v(4.6, 4.4, 0.22),
                    p = v(px, 2.85, pz);
                const panel = this.box(size, p, j % 2 ? 0x6e979d : 0x8ca7a0);
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
                const c = this.physics.staticBox(p, size);
                this.add('panel', panel, c, 130);
            }
            for (let j = 0; j < 2; j++) {
                const p = v(x + 23, 1.5, z - 6 + j * 6),
                    size = v(0.3, 3, 5.8);
                const panel = this.box(size, p, 0xb5a48a);
                this.add('panel', panel, this.physics.staticBox(p, size), 100);
            }
            for (let j = 0; j < 4; j++) {
                const tree = this.art.street.tree(j+sign*10);
                tree.position.set(x - 13 + j * 9, 0, z + sign * 19);
                this.group.add(tree);
                this.physics.staticBox(tree.position.clone().add(v(0,1.8,0)),v(.52,3.6,.52));
                const planter=this.box(v(2.3,.27,2.3),tree.position.clone().add(v(0,.13,0)),0x9a9b90,true);
                planter.material=this.art.paving;
            }
            for(let j=0;j<3;j++) {
                const bench=this.art.street.bench();bench.position.set(x-10+j*10,.15,z+sign*14.5);
                if(sign<0) bench.rotation.y=Math.PI;this.group.add(bench);
                this.physics.staticBox(bench.position.clone().add(v(0,.52,0)),v(1.88,1.04,.55));
                const bin=this.art.street.bin();bin.position.copy(bench.position).add(v(2.2,0,0));this.group.add(bin);
                this.add('prop',bin,this.physics.staticBox(bin.position.clone().add(v(0,.5,0)),v(.58,1,.58)),60);
            }
            const shop=this.art.sign(sign>0 ? 'METRO MARKET' : 'RIVERSIDE / CAFE',8);
            shop.position.set(x,4.9,z+sign*6.56);if(sign<0) shop.rotation.y=Math.PI;this.group.add(shop);
            this.shopDetails(x,z,sign);
        }
        for (let i = 0; i < 12; i++) {
            const horizontal = i < 6,
                t = -85 + (i % 6) * 34,
                sign = i % 2 ? 1 : -1;
            const p = horizontal ? v(t, 0, sign * 13.7) : v(sign * 13.7, 0, t);
            if (Math.abs(t) < 18) continue;
            const lamp = this.assets.clone('streetLamp');
            lamp.position.copy(p);
            lamp.scale.setScalar(5.5/3.8705554);
            this.group.add(lamp);
            this.add(
                'prop',
                lamp,
                this.physics.staticBox(
                    p.clone().add(v(0, 2.75, 0)),
                    v(1.0, 5.5, 0.55),
                ),
                65,
            );
        }
        for (let i = 0; i < 8; i++) {
            const p =
                i < 4
                    ? v(-77 + i * 45, 0.8, i % 2 ? 7 : -7)
                    : v(i % 2 ? 7 : -7, 0.8, -80 + (i - 4) * 46);
            const group = new T.Group();
            group.position.copy(p);
            const car = this.art.street.car(i);
            car.position.y = -0.7;
            group.add(car);
            this.group.add(group);
            const body = this.physics.world.createRigidBody(
                R.RigidBodyDesc.dynamic()
                    .setTranslation(p.x, p.y, p.z)
                    .setLinearDamping(0.45)
                    .setAngularDamping(0.9)
                    .setCcdEnabled(true),
            );
            const collider = this.physics.world.createCollider(
                R.ColliderDesc.cuboid(1.02, 0.7, 2.15)
                    .setMass(380)
                    .setFriction(0.8)
                    .setRestitution(0.15),
                body,
            );
            this.add('car', group, collider, 300, body);
        }
        for(const x of [-1,1]) for(const z of [-1,1]) {
            const light=this.art.street.trafficLight();light.position.set(x*13.6,.16,z*16.5);
            if(z>0) light.rotation.y=Math.PI;this.group.add(light);
            this.add('prop',light,this.physics.staticBox(light.position.clone().add(v(0,1.85,0)),v(.35,3.7,.28)),65);
        }
        // Skyline is decorative and outside playable bounds.
        let distantIndex=0;
        for (let x=-270;x<=270;x+=60) for (let z=-270;z<=270;z+=60) {
            if(Math.abs(x)<115 && Math.abs(z)<115) continue;
            const i=distantIndex++,h=18+((i*17)%84);
            const distant = this.art.architecture(
                30 + (i % 4) * 4,
                h,
                30+(i%3)*5,
                i,
                true,
            );
            distant.position.set(x+(i%3-1)*3,0,z);
            distant.traverse((o) => {
                if (o instanceof T.Mesh) {
                    o.castShadow = false;
                    o.receiveShadow = false;
                }
            });
            this.group.add(distant);
        }
        for (let t = -90; t <= 90; t += 15) {
            for (const side of [-12, 12]) {
                this.nav.push(v(t, 0.18, side), v(side, 0.18, t));
            }
        }
        this.spawnPoints = [
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
            this.physics.staticBox(v(sign * 101, 40, 0), v(2, 82, 204));
            this.physics.staticBox(v(0, 40, sign * 101), v(204, 82, 2));
        }
        this.physics.staticBox(v(0, 82, 0), v(204, 2, 204));
        this.batchStatic();
    }
    private batchStatic() {
        const dynamic=new Set<T.Object3D>();
        for (const entity of this.entities.values()) entity.mesh.traverse(o=>dynamic.add(o));
        this.group.updateMatrixWorld(true);
        const instances=new Map<string,T.InstancedMesh[]>();
        this.group.traverse(o=>{
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
            mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;this.group.add(mesh);
        }
        const batches=new Map<string,{material:T.Material;parts:T.BufferGeometry[]; meshes:T.Mesh[]}>();
        this.group.traverse(o=>{
            if (!(o instanceof T.Mesh) || o instanceof T.InstancedMesh || dynamic.has(o) || o.userData.keepSharedGeometry || Array.isArray(o.material)) return;
            const key=`${o.material.uuid}/${o.castShadow}/${o.receiveShadow}`;
            const batch=batches.get(key) ?? {material:o.material,parts:[] as T.BufferGeometry[],meshes:[] as T.Mesh[]};
            batch.parts.push(o.geometry.clone().applyMatrix4(o.matrixWorld));batch.meshes.push(o);batches.set(key,batch);
        });
        for (const {material,parts,meshes} of batches.values()) {
            const merged=mergeGeometries(parts);
            parts.forEach(p=>p.dispose());
            if (!merged) throw new Error('静态街景合批失败');
            const mesh=new T.Mesh(merged,material);mesh.castShadow=meshes[0].castShadow;mesh.receiveShadow=meshes[0].receiveShadow;this.group.add(mesh);
            const geometries=new Set<T.BufferGeometry>();
            meshes.forEach(m=>{geometries.add(m.geometry);m.removeFromParent();});
            geometries.forEach(g=>g.dispose());
        }
    }
    private shopDetails(x: number, z: number, sign: number) {
        const add = (key: string, height: number, position: T.Vector3, rotation = 0, hp = 70) => {
            const object = this.assets.prop(key,height);
            object.position.copy(position); object.rotation.y = rotation;
            this.group.add(object);
            const bounds = new T.Box3().setFromObject(object), center = bounds.getCenter(v()), size = bounds.getSize(v());
            if (key === 'pottedPlant') { size.set(.52,.5,.52); center.copy(position).y += .25; }
            this.add('prop',object,this.physics.staticBox(center,size),hp);
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
        const top = new T.Mesh(metreBox(6.7,.09,1.02),this.art.surfaces.stone.clone());
        top.position.y = .995; top.castShadow = top.receiveShadow = true; counter.add(top);
        this.group.add(counter);
        this.add('prop',counter,this.physics.staticBox(counter.position.clone().add(v(0,.52,0)),v(6.7,1.04,1.02)),110);
        const menu = this.art.sign(sign>0 ? 'METRO / FRESH DAILY' : 'COFFEE / BAKERY',5.5);
        menu.position.set(x,3,z-sign*6.07); if(sign<0) menu.rotation.y = Math.PI;
        this.group.add(menu);
        const canopy = this.art.awning(19.6,sign>0 ? 0 : 2);
        canopy.position.set(x,4.5,z+sign*6.55); if(sign<0) canopy.rotation.y = Math.PI;
        this.group.add(canopy);
        this.physics.staticBox(v(x,4.35,z+sign*7.15),v(19.6,.5,1.25));
        for (const offset of [-6,0,6]) {
            const light = new T.Mesh(new T.PlaneGeometry(2.8,.65),
                new T.MeshBasicMaterial({color:0xd9cdb0,toneMapped:false}));
            light.rotation.x = Math.PI/2; light.position.set(x+offset,5.12,z);
            this.group.add(light);
            const illumination = new T.PointLight(0xffe2bd,45,11,2);
            illumination.position.set(x+offset,4.95,z);
            this.group.add(illumination);
        }
    }
    spawn(kind: 'civilian' | 'police' | 'soldier', p: T.Vector3, time: number) {
        const person = new PersonVisual(this.assets, kind, this.nextId);
        person.group.position.copy(p);
        this.group.add(person.group);
        const body = this.physics.world.createRigidBody(
            R.RigidBodyDesc.kinematicPositionBased().setTranslation(
                p.x,
                p.y + 1,
                p.z,
            ),
        );
        const collider = this.physics.world.createCollider(
            R.ColliderDesc.capsule(0.65, 0.32),
            body,
        );
        const e = this.add(
            kind,
            person.group,
            collider,
            kind === 'civilian' ? 50 : kind === 'police' ? 80 : 120,
            body,
            person,
        );
        e.born = time;
        e.goal = this.nearestNode(p);
        return e;
    }
    nearestNode(p: T.Vector3) {
        return this.nav
            .reduce((a, b) =>
                a.distanceToSquared(p) < b.distanceToSquared(p) ? a : b,
            )
            .clone();
    }
    neighbors(p: T.Vector3) {
        return this.nav.filter(
            (n) =>
                n.distanceToSquared(p) > 0.01 &&
                n.distanceToSquared(p) < 16 * 16,
        );
    }
    sync() {
        for (const e of this.entities.values())
            if (e.ragdoll) {
                e.ragdoll.capture();
                e.ragdoll.pose(1);
            } else if (e.body) {
                e.mesh.position.copy(vec(e.body.translation()));
                if (isPerson(e.kind) && !e.health.dead) e.mesh.position.y -= 1;
                else {
                    e.mesh.quaternion.copy(e.body.rotation());
                    if (isPerson(e.kind))
                        e.mesh.position.add(
                            v(0, -1, 0).applyQuaternion(e.mesh.quaternion),
                        );
                }
            }
    }
    interpolate(alpha: number) {
        for (const e of this.entities.values()) e.ragdoll?.pose(alpha);
    }
    freezeInterpolation() {
        for (const e of this.entities.values()) e.ragdoll?.freezeInterpolation();
    }
    remove(e: Entity) {
        if (e.ragdoll) {
            for (const part of e.ragdoll.parts.values()) this.byCollider.delete(part.collider.handle);
            e.ragdoll.dispose();
        } else if (e.body) {
            this.byCollider.delete(e.collider.handle);
            this.physics.world.removeRigidBody(e.body);
        }
        else if (e.collider.isValid())
            {
                this.byCollider.delete(e.collider.handle);
                this.physics.world.removeCollider(e.collider, true);
            }
        this.entities.delete(e.id);
        e.mesh.removeFromParent();
        if (e.person) e.person.dispose();
        else {
            // Detached props cannot be reached by the later scene cleanup.
            // Protect resources retained by other objects or the asset cache.
            const retainedGeometry = new Set<T.BufferGeometry>();
            const retainedMaterial = new Set<T.Material>();
            const retain = (object: T.Object3D) => object.traverse(o => {
                if (!(o instanceof T.Mesh)) return;
                retainedGeometry.add(o.geometry);
                for (const m of Array.isArray(o.material) ? o.material : [o.material])
                    retainedMaterial.add(m);
            });
            retain(this.group);
            for (const asset of this.assets.models.values()) retain(asset.scene);
            const geometry = new Set<T.BufferGeometry>();
            const material = new Set<T.Material>();
            e.mesh.traverse(o => {
                if (!(o instanceof T.Mesh)) return;
                if (!retainedGeometry.has(o.geometry)) geometry.add(o.geometry);
                for (const m of Array.isArray(o.material) ? o.material : [o.material])
                    if (!retainedMaterial.has(m)) material.add(m);
            });
            geometry.forEach(g => g.dispose());
            material.forEach(m => m.dispose());
        }
    }
    alive(kind?: Kind) {
        return [...this.entities.values()].filter(
            (e) => !e.health.dead && (!kind || e.kind === kind),
        );
    }
}
