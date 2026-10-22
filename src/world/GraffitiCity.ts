import * as T from 'three';
import { R } from '../core/Physics';
import { CONFIG } from '../core/config';
import { v } from '../core/math';
import type { StreetWorld } from './World';

interface Placement { prototype: string; position: [number,number,number]; yaw: number; height: number; distant?: boolean }
interface Prototype { center: [number,number,number]; roofY: number;
    size?: [number,number,number]; entries?: Record<string,[number,number,number]>;
    collider: { size: [number,number,number]; offset: [number,number,number] } }
export interface CityLayout { buildings: Placement[]; landmark: { position: [number,number,number] };
    plots: [number,number][]; sidewalkEdges: [number,number][];
    background?: Placement[];
    courtyards: { position: [number,number,number]; yaw: number; width: number; depth: number;
        entry: {position:[number,number,number];yaw:number;width:number} }[];
    prototypes: Record<string,Prototype> }

function buildingCollision(world: StreetWorld, prototype: Prototype, placement: Placement) {
    const rotation = new T.Quaternion().setFromAxisAngle(v(0,1,0),placement.yaw);
    const size = v(...prototype.collider.size); size.y *= placement.height;
    const center = v(...prototype.collider.offset); center.y *= placement.height;
    center.applyQuaternion(rotation).add(v(...placement.position));
    world.physics.world.createCollider(R.ColliderDesc.cuboid(size.x/2,size.y/2,size.z/2)
        .setTranslation(center.x,center.y,center.z).setRotation(rotation).setFriction(.7));
}

function meshCollision(world: StreetWorld, source: T.Object3D, position: T.Vector3, yaw=0, height=1) {
    const root = new T.Group(); root.scale.y=height;
    root.add(source.clone(true));
    root.updateMatrixWorld(true);
    const vertices: number[] = [], indices: number[] = [], p = v();
    root.traverse(o => {
        if (!(o instanceof T.Mesh)) return;
        const attribute = o.geometry.attributes.position, index = o.geometry.index, start = vertices.length/3;
        for (let i=0;i<attribute.count;i++) {
            p.fromBufferAttribute(attribute,i).applyMatrix4(o.matrixWorld); vertices.push(p.x,p.y,p.z);
        }
        for (let i=0;i<(index?.count ?? attribute.count);i++) indices.push(start+(index ? index.getX(i) : i));
    });
    world.physics.world.createCollider(R.ColliderDesc.trimesh(new Float32Array(vertices),new Uint32Array(indices),
        R.TriMeshFlags.FIX_INTERNAL_EDGES | R.TriMeshFlags.DELETE_DEGENERATE_TRIANGLES)
        .setTranslation(position.x,position.y,position.z)
        .setRotation(new T.Quaternion().setFromAxisAngle(v(0,1,0),yaw)).setFriction(.7));
}

/** Original roads and gameplay surround a shared, offline-built building library. */
export function buildGraffitiCity(world: StreetWorld) {
    const asset = world.assets.models.get('graffitiCity')!;
    const layout = asset.parser.json.extras.graffitiCity as CityLayout;
    const library = asset.scene; library.updateMatrixWorld(true);
    const city = new T.Group(); city.name = 'Graffiti full city'; city.userData.offlineBatch = true;
    city.userData.buildings = layout.buildings.length+5;
    city.userData.backgroundBuildings = layout.background?.length ?? 0;
    world.group.add(city);
    const batches: { placements: Placement[]; parts: { mesh: T.InstancedMesh; local: T.Matrix4 }[];
        level: number; assignment: string }[] = [];
    for (const prototype of Object.keys(layout.prototypes)) {
        // Quadrants allow distant street blocks to leave the camera frustum together.
        for (const sx of [-1,1]) for (const sz of [-1,1]) {
            const placements = [...layout.buildings,...layout.background ?? []].filter(p => p.prototype === prototype &&
                Math.sign(p.position[0]) === sx && Math.sign(p.position[2]) === sz);
            if (!placements.length) continue;
            for (let level=0;level<3;level++) {
                const source = library.getObjectByName(`${prototype}_L${level}`)!;
                const parts: {mesh:T.InstancedMesh;local:T.Matrix4}[] = [];
                source.traverse(o => {
                    if (!(o instanceof T.Mesh)) return;
                    const mesh = new T.InstancedMesh(o.geometry,o.material,placements.length);
                    mesh.name = `${prototype} L${level} ${sx},${sz}`;
                    mesh.castShadow = level < 2;mesh.receiveShadow = true;
                    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
                    mesh.count = 0; city.add(mesh);
                    parts.push({mesh,local:o.matrixWorld.clone()});
                });
                batches.push({placements,parts,level,assignment:''});
            }
        }
    }
    const matrix = new T.Matrix4(), rotation = new T.Quaternion(), cameraPosition = v();
    world.updateScenery = camera => {
        camera.getWorldPosition(cameraPosition);
        for (const batch of batches) {
            const active = batch.placements.filter(p => {
                const distance = cameraPosition.distanceTo(v(p.position[0],10,p.position[2]));
                return batch.level === (p.distant ? 2 : distance < CONFIG.graffitiCity.nearDistance ? 0 :
                    distance < CONFIG.graffitiCity.farDistance ? 1 : 2);
            });
            const assignment = active.map(p => p.position.join(',')).join(';');
            if (assignment === batch.assignment) continue;
            batch.assignment = assignment;
            for (const part of batch.parts) {
                part.mesh.count = active.length;
                for (let i=0;i<active.length;i++) {
                    const p = active[i]; rotation.setFromAxisAngle(v(0,1,0),p.yaw);
                    matrix.compose(v(...p.position),rotation,v(1,p.height,1)).multiply(part.local);
                    part.mesh.setMatrixAt(i,matrix);
                }
                part.mesh.instanceMatrix.needsUpdate = true;
                part.mesh.computeBoundingSphere();
            }
        }
    };
    for (const p of layout.buildings) {
        buildingCollision(world,layout.prototypes[p.prototype],p);
        meshCollision(world,library.getObjectByName(`${p.prototype}_Roof`)!,v(...p.position),p.yaw,p.height);
    }
    const landmarkPosition = v(...layout.landmark.position);
    const landmark = new T.Group(); landmark.name = 'Graffiti stair landmark';
    landmark.position.copy(landmarkPosition);
    landmark.add(library.getObjectByName('Stair_Corner')!.clone(true));
    landmark.traverse(o => { if (o instanceof T.Mesh) o.castShadow = o.receiveShadow = true; });
    city.add(landmark);
    meshCollision(world,library.getObjectByName('Stair_Collision')!,landmarkPosition);
    for (const [name,prototype] of Object.entries(layout.prototypes)) {
        if (name === 'AcrossStreet_Beige') continue;
        const p: Placement={prototype:name,position:[landmarkPosition.x+prototype.center[0],0,
            landmarkPosition.z+prototype.center[2]],yaw:0,height:1};
        buildingCollision(world,prototype,p);
        meshCollision(world,library.getObjectByName(`${name}_Roof`)!,v(...p.position));
    }
    world.physics.staticBox(landmarkPosition.clone().add(v(1.9,1.85,-.75)),v(4.17,3.7,2.67));

    // Courtyard gates are independent panels, with a real path on both sides.
    const courtPoint = (court: CityLayout['courtyards'][number],x:number,y:number,z:number) =>
        v(x,y,z).applyAxisAngle(v(0,1,0),court.yaw).add(v(...court.position));
    for (const court of layout.courtyards.filter((_,i)=>i%2===0)) {
        const entry=court.entry;
        const gatePoint=(x:number,y:number,z:number)=>v(x,y,z).applyAxisAngle(v(0,1,0),entry.yaw).add(v(...entry.position));
        const size = v(entry.width,2.9,.14), p = gatePoint(0,1.45,0);
        const gate = world.box(size,p,0x4d5956); gate.name = 'city-courtyard-gate';
        gate.rotation.y = entry.yaw;
        gate.material = new T.MeshStandardMaterial({color:0x4d5956,metalness:.65,roughness:.67});
        for (const dx of [-.42,-.21,0,.21,.42].map(t=>t*entry.width)) {
            const rib = new T.Mesh(new T.BoxGeometry(.045,2.8,.06),gate.material);
            rib.position.set(dx,0,.09);gate.add(rib);
        }
        for (const dx of [-1,1].map(sign=>sign*(entry.width/2+.1))) {
            const post = world.box(v(.18,3.1,.18),gatePoint(dx,1.55,0),0x3b4543,true);
            post.material = world.art.street.metal;
        }
        const collider = world.physics.world.createCollider(R.ColliderDesc.cuboid(size.x/2,size.y/2,size.z/2)
            .setTranslation(p.x,p.y,p.z).setRotation(gate.quaternion));
        world.add('panel',gate,collider,CONFIG.sceneDensity.servicePanelHp);
    }
    // Two open shop shells retain the original glass -> enter -> furnish/attack
    // loop. The shell has side/back walls, never a solid box behind its glazing.
    for (const court of [layout.courtyards[4],layout.courtyards[10]]) {
        const shell = (size:T.Vector3, x:number,y:number,z:number, material:T.MeshStandardMaterial) => {
            const mesh = world.box(size,courtPoint(court,x,y,z),0xffffff);
            mesh.rotation.y = court.yaw;mesh.material = material;
            world.physics.world.createCollider(R.ColliderDesc.cuboid(size.x/2,size.y/2,size.z/2)
                .setTranslation(mesh.position.x,mesh.position.y,mesh.position.z).setRotation(mesh.quaternion));
            return mesh;
        };
        for (const x of [-2.9,2.9]) shell(v(.18,3.4,4.2),x,1.7,.1,world.art.surfaces.concrete);
        shell(v(5.8,3.4,.18),0,1.7,2.2,world.art.surfaces.concrete);
        shell(v(6.25,.18,4.65),0,3.49,.05,world.art.surfaces.roof);
        shell(v(5.8,.09,4.2),0,.045,.1,world.art.plaza);
        for (const x of [-2.76,0,2.76]) shell(v(.09,3.25,.16),x,1.625,-2.04,world.art.street.metal);
        for (const x of [-1.37,1.37]) {
            const size = v(2.65,2.95,.075), p = courtPoint(court,x,1.6,-2.04);
            const glass = world.box(size,p,0xc4d5cf);glass.rotation.y=court.yaw;
            glass.name='city-shop-glass';glass.castShadow=false;glass.userData.fragmentType='glass';
            glass.material=new T.MeshPhysicalMaterial({color:0xc4d5cf,roughness:.2,metalness:.06,
                transparent:true,opacity:.27,depthWrite:false,envMapIntensity:.7,clearcoat:.25});
            (glass.material as T.MeshPhysicalMaterial).forceSinglePass=true;
            const collider=world.physics.world.createCollider(R.ColliderDesc.cuboid(size.x/2,size.y/2,size.z/2)
                .setTranslation(p.x,p.y,p.z).setRotation(glass.quaternion));
            world.add('panel',glass,collider,CONFIG.sceneDensity.glassHp);
        }
        const awning=world.art.awning(6.25,0);awning.position.copy(courtPoint(court,0,3.6,-2.2));
        awning.rotation.y=court.yaw+Math.PI;world.group.add(awning);
        const cabinet=world.assets.prop('shopCabinet',1.6);cabinet.position.copy(courtPoint(court,0,.09,1.3));
        cabinet.rotation.y=court.yaw;cabinet.name='city-shop-cabinet';world.group.add(cabinet);
        const bounds=new T.Box3().setFromObject(cabinet);
        world.add('prop',cabinet,world.physics.staticBox(bounds.getCenter(v()),bounds.getSize(v())),90);
    }
    // Furnished small courtyards and street corners; imported furniture stays
    // independently destructible and keeps its original scanned proportions.
    for (const [i,court] of layout.courtyards.filter((_,i)=>i%2===1).entries()) {
        for (const [key,dx,height] of [['pottedPlant',-3,1.15],['cafeSet',2,1.25]] as const) {
            const object = world.assets.prop(key,height);object.position.copy(courtPoint(court,dx,0,0));
            object.rotation.y = court.yaw;
            object.name = `city-${key}`; world.group.add(object);
            const bounds = new T.Box3().setFromObject(object);
            const size = bounds.getSize(v()),center = bounds.getCenter(v());
            if (key === 'pottedPlant') {size.set(.6,.55,.6);center.y=.275;}
            world.add('prop',object,world.physics.staticBox(center,size),80);
        }
        const tree = world.art.street.tree(i+71);tree.position.copy(courtPoint(court,0,0,Math.min(3.5,court.depth/2-1.2)));
        tree.name = 'city-courtyard-tree';world.group.add(tree);
        tree.traverse(o => {if (o instanceof T.Mesh) o.material = Array.isArray(o.material) ? o.material.map(m=>m.clone()) : o.material.clone();});
        world.add('prop',tree,world.physics.staticBox(tree.position.clone().add(v(0,1.8,0)),v(.52,3.6,.52)),100);
    }
    // Sidewalk graph spans all four street rows and leaves peripheral exits open.
    const points = new Map<string,T.Vector3>();
    const nav = (x:number,z:number) => points.set(`${x},${z}`,v(x,.18,z));
    for (const side of [-62.8,-53.2,-11.5,11.5,53.2,62.8]) for (let t=-90;t<=90;t+=12) {nav(side,t);nav(t,side);}
    for (const side of [-11.5,11.5]) {nav(0,side);nav(side,0);}
    nav(0,0);
    world.nav.push(...points.values());
    addFrontages(world,city,layout);
}

function addFrontages(world: StreetWorld, city: T.Group, layout: CityLayout) {
    const entries: {position:T.Vector3;rotation:T.Quaternion;floor:number;normal:T.Vector3}[]=[];
    const normals:Record<string,T.Vector3>={'+X':v(1,0,0),'-X':v(-1,0,0),'+Z':v(0,0,1),'-Z':v(0,0,-1)};
    const inPlot=(t:number)=>layout.plots.some(([a,b])=>t>=a&&t<=b);
    const footPlane=(point:T.Vector3)=>{
        const road=Math.abs(point.x)<10||Math.abs(point.z)<10||Math.abs(Math.abs(point.x)-58)<3.6||Math.abs(Math.abs(point.z)-58)<3.6;
        return !road&&!(inPlot(point.x)&&inPlot(point.z)) ? .16 : 0;
    };
    for (const p of layout.buildings) {
        const prototype=layout.prototypes[p.prototype];
        if (!prototype.entries || !Object.keys(prototype.entries).length) continue;
        const candidates=Object.entries(prototype.entries).map(([face,entry])=>{
            const normal=normals[face].clone(),point=v(...entry),turn=new T.Quaternion().setFromAxisAngle(v(0,1,0),p.yaw);
            point.applyQuaternion(turn).add(v(p.position[0],0,p.position[2]));normal.applyQuaternion(turn);
            return {position:point,normal,distance:Math.min(...[0,-58,58].flatMap(t=>[Math.abs(point.x-t),Math.abs(point.z-t)]))};
        });
        candidates.sort((a,b)=>a.distance-b.distance);
        const chosen=candidates[0],point=chosen.position,turn=new T.Quaternion().setFromAxisAngle(v(0,1,0),-p.yaw);
        const localNormal=chosen.normal.clone().applyQuaternion(turn);
        const origin=point.clone().sub(v(p.position[0],0,p.position[2])).applyQuaternion(turn);
        origin.y=(footPlane(point)+1.46-p.position[1])/p.height;
        origin.addScaledVector(localNormal,3);
        const source=world.assets.models.get('graffitiCity')!.scene.getObjectByName(`${p.prototype}_L0`)!;
        const tangent=v(localNormal.z,0,-localNormal.x);
        // The removed window leaves a real opening. Sample its jambs to find
        // the facade plane, then retain the entrance's original horizontal axis.
        const surface=[1.1,-1.1,1.6,-1.6].map(offset=>new T.Raycaster(origin.clone().addScaledVector(tangent,offset),
            localNormal.clone().negate(),0,4).intersectObject(source,true)[0]).find(Boolean);
        if (surface) {
            const contact=origin.clone().addScaledVector(localNormal,surface.point.dot(localNormal)-origin.dot(localNormal)+.065).applyQuaternion(turn.invert());
            point.x=contact.x+p.position[0];point.z=contact.z+p.position[2];
        }
        const floor=footPlane(point);
        entries.push({position:point,normal:chosen.normal,floor,rotation:new T.Quaternion().setFromAxisAngle(v(0,1,0),Math.atan2(chosen.normal.x,chosen.normal.z))});
    }
    if (entries.length) {
        // Closed ground-floor entrances reuse the existing scanned roller door.
        // The two open shops above retain separate glass and accessible shells.
        const source=world.assets.prop('shutter',2.6);
        let size=new T.Box3().setFromObject(source).getSize(v());
        if(size.z>size.x)source.rotation.y=Math.PI/2;
        size=new T.Box3().setFromObject(source).getSize(v());
        source.scale.x*=1.45/size.x;source.scale.z*=.18/size.z;source.updateMatrixWorld(true);
        const matrix=new T.Matrix4();
        source.traverse(o=>{
            if(!(o instanceof T.Mesh))return;
            const mesh=new T.InstancedMesh(o.geometry,o.material,entries.length);mesh.name='city-closed-entrances';
            for(const [i,e] of entries.entries()) {
                matrix.compose(e.position.clone().setY(e.floor+.16),e.rotation,v(1,1,1)).multiply(o.matrixWorld);
                mesh.setMatrixAt(i,matrix);
            }
            mesh.castShadow=mesh.receiveShadow=true;city.add(mesh);
        });
        const step=new T.InstancedMesh(new T.BoxGeometry(1.8,.16,.45),world.art.surfaces.stone,entries.length);
        step.name='city-entry-steps';step.castShadow=step.receiveShadow=true;
        for(const [i,e] of entries.entries()) {
            const point=e.position.clone().addScaledVector(e.normal,.13).setY(e.floor+.08);
            matrix.compose(point,e.rotation,v(1,1,1));step.setMatrixAt(i,matrix);
            world.physics.world.createCollider(R.ColliderDesc.cuboid(.9,.08,.225).setTranslation(point.x,point.y,point.z).setRotation(e.rotation));
        }
        city.add(step);
    }
    // Retain all sixteen seats/bins in courtyard pockets so three-metre
    // pavements keep a continuous walking lane beside the new street walls.
    for(const [i,court] of [...layout.courtyards,layout.courtyards[0]].entries()) {
        const p=v(-court.width/2+2.6,0,(i<15?1:-1)*(court.depth/2-.9))
            .applyAxisAngle(v(0,1,0),court.yaw).add(v(...court.position));
        const seat=world.assets.prop('seating',.85);seat.position.copy(p);seat.rotation.y=court.yaw;
        seat.name='city-street-seating';world.group.add(seat);
        const bounds=new T.Box3().setFromObject(seat);
        world.add('prop',seat,world.physics.staticBox(bounds.getCenter(v()),bounds.getSize(v())),100);
        const bin=world.art.street.bin();bin.position.copy(p).add(v(2.3,0,0).applyAxisAngle(v(0,1,0),court.yaw));
        bin.name='city-street-bin';bin.traverse(o=>{if(o instanceof T.Mesh)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();});
        world.group.add(bin);const box=new T.Box3().setFromObject(bin);bin.position.y-=box.min.y-p.y;box.setFromObject(bin);
        world.add('prop',bin,world.physics.staticBox(box.getCenter(v()),box.getSize(v())),70);
    }
}
