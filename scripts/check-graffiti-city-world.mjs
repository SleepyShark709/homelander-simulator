/** Real city geometry / Rapier / navigation audit without a browser or GPU.
 * Images are omitted only for this CPU fixture; geometry and extras are intact.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createServer } from 'vite';
const root=path.resolve(import.meta.dirname,'..'),workspace=path.resolve(process.argv[2] ?? root);
const server=await createServer({root:workspace,configFile:false,cacheDir:path.join(root,'.artifacts/graffiti-city/cpu-vite-cache'),
    optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,watch:null}});
const checks=[];
function check(name,pass,data) {checks.push({name,pass:Boolean(pass),data});if(!pass)throw new Error(`${name}: ${JSON.stringify(data)}`);}
async function geometry(file) {
    const bytes=fs.readFileSync(file);let model,binary;
    if(file.endsWith('.glb')) {
        const length=bytes.readUInt32LE(12);model=JSON.parse(bytes.subarray(20,20+length));
        binary=bytes.subarray(28+length,28+length+bytes.readUInt32LE(20+length));
    } else {
        model=JSON.parse(bytes);check('single-buffer CPU input',model.buffers.length===1,file);
        binary=fs.readFileSync(path.resolve(path.dirname(file),model.buffers[0].uri));
    }
    for(const m of model.materials ?? []) {
        for(const key of ['normalTexture','occlusionTexture','emissiveTexture'])delete m[key];
        for(const key of ['baseColorTexture','metallicRoughnessTexture'])delete m.pbrMetallicRoughness?.[key];
        delete m.extensions;
    }
    delete model.images;delete model.textures;delete model.samplers;
    model.extensionsRequired=(model.extensionsRequired ?? []).filter(e=>e==='KHR_mesh_quantization');
    model.buffers=[{byteLength:binary.byteLength}];
    const json=Buffer.from(JSON.stringify(model)),jsonSize=Math.ceil(json.length/4)*4,binSize=Math.ceil(binary.length/4)*4;
    const glb=Buffer.alloc(28+jsonSize+binSize);glb.write('glTF');glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);
    glb.writeUInt32LE(jsonSize,12);glb.writeUInt32LE(0x4e4f534a,16);glb.fill(32,20,20+jsonSize);json.copy(glb,20);
    glb.writeUInt32LE(binSize,20+jsonSize);glb.writeUInt32LE(0x004e4942,24+jsonSize);binary.copy(glb,28+jsonSize);
    return new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.length),'');
}
const context=new Proxy({measureText:text=>({width:text.length*18})},{get:(o,k)=>o[k] ?? (()=>{})});
globalThis.document={createElement:()=>({width:512,height:96,getContext:()=>context})};
let physics,assets,world;
try {
    const {Assets}=await server.ssrLoadModule('/src/core/Assets.ts');
    const {Physics,R}=await server.ssrLoadModule('/src/core/Physics.ts');
    const {StreetWorld}=await server.ssrLoadModule('/src/world/World.ts');
    const {Npcs}=await server.ssrLoadModule('/src/gameplay/Npcs.ts');
    await R.init();assets=new Assets();assets.graffitiCity=true;
    assets.textures.set('foliage/color',new T.Texture());
    for(const name of ['worn_asphalt','concrete_pavement','brick_wall_003','concrete_wall_006',
        'stone_tiles_02','rectangular_facade_tiles','asphalt_05','bark_brown_02'])
        for(const role of ['color','normal','roughness','ao'])assets.textures.set(`${name}/${role}`,new T.Texture());
    const files={graffitiCity:'graffiti-city/city.gltf',district:'jiangwan/district.glb',
        streetLamp:'street-lamp/street_lamp_01_1k.gltf',cafeSet:'city-details/outdoor_table_chair_set_01/outdoor_table_chair_set_01_2k.gltf',
        pottedPlant:'city-details/potted_plant_02/potted_plant_02_2k.gltf',shopCabinet:'city-details/drawer_cabinet/drawer_cabinet_2k.gltf',
        shutter:'city-details/rollershutter_door/rollershutter_door_2k.gltf',seating:'scene-density/seating.glb',bus:'jiangwan/bus.glb',sedan:'jiangwan/sedan.glb',scooter:'jiangwan/scooter.glb'};
    for(const [key,file] of Object.entries(files))assets.models.set(key,await geometry(path.join(root,'public/assets',file)));
    physics=new Physics();world=new StreetWorld(physics,assets);physics.world.step();
    const blocked=world.nav.filter(p=>physics.world.intersectionWithShape(p.clone().add(new T.Vector3(0,1,0)),
        {x:0,y:0,z:0,w:1},new R.Capsule(.65,.32))!==null);
    check('navigation capsules have static clearance',!blocked.length,blocked.map(p=>p.toArray()));
    const unseen=new Set(world.nav.map((_,i)=>i)),components=[];
    while(unseen.size) {
        const first=unseen.values().next().value,queue=[first];unseen.delete(first);let count=0;
        while(queue.length) {
            const i=queue.pop();count++;
            for(const p of world.neighbors(world.nav[i])) {const next=world.nav.indexOf(p);if(unseen.delete(next))queue.push(next);}
        }
        components.push(count);
    }
    check('the entire sidewalk graph is connected',components.length===1,components);
    const people=[];world.spawn=(_kind,p)=>{people.push(p.clone());return {};};
    new Npcs(world,physics,{}, {},{},new T.PerspectiveCamera());
    check('twenty initial civilians have distinct safe positions',new Set(people.map(p=>p.toArray().join(','))).size===20,people.map(p=>p.toArray()));
    check('original eight vehicle bodies remain',world.alive('car').length===8);
    check('at least eight independent destructible zones remain',world.alive('panel').length>=8,world.alive('panel').length);
    const city=assets.models.get('graffitiCity'),layout=city.parser.json.extras.graffitiCity,roofs=[];
    for(const p of layout.buildings) {
        const source=city.scene.getObjectByName(p.prototype+'_L0');city.scene.updateMatrixWorld(true);
        const visual=new T.Raycaster(new T.Vector3(0,40,0),new T.Vector3(0,-1,0)).intersectObject(source,true)[0];
        const hit=physics.ray(new T.Vector3(p.position[0],40,p.position[2]),new T.Vector3(0,-1,0),50);
        roofs.push({prototype:p.prototype,position:p.position,expected:visual.point.y*p.height+p.position[1],physical:hit&&40-hit.timeOfImpact});
    }
    check('all expanded roof centers match their physical surface',roofs.every(r=>r.physical!==null&&Math.abs(r.expected-r.physical)<.02),
        {count:roofs.length,maximum:Math.max(...roofs.map(r=>Math.abs(r.expected-r.physical))),
         failures:roofs.filter(r=>r.physical===null||Math.abs(r.expected-r.physical)>=.02)});
    const entrances=[];world.group.traverse(o=>{if(o.name==='city-closed-entrances')entrances.push(o);});
    const contacts=[];
    for(const [i,p] of layout.buildings.entries()) {
        const bounds=new T.Box3(),matrix=new T.Matrix4();
        for(const mesh of entrances) {
            mesh.getMatrixAt(i,matrix);mesh.geometry.computeBoundingBox();
            bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(matrix));
        }
        const turn=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),-p.yaw);
        const center=bounds.getCenter(new T.Vector3()).sub(new T.Vector3(...p.position)).applyQuaternion(turn);
        center.y/=p.height;
        const size=layout.prototypes[p.prototype].collider.size;
        const normal=Math.abs(center.x)/(size[0]/2)>Math.abs(center.z)/(size[2]/2) ?
            new T.Vector3(Math.sign(center.x),0,0) : new T.Vector3(0,0,Math.sign(center.z));
        const source=city.scene.getObjectByName(p.prototype+'_L0');
        const tangent=new T.Vector3(normal.z,0,-normal.x);
        const hit=[1.1,-1.1,1.6,-1.6].map(offset=>new T.Raycaster(center.clone().addScaledVector(tangent,offset)
            .addScaledVector(normal,.2),normal.clone().negate(),0,1).intersectObject(source,true)[0]).find(Boolean);
        contacts.push({prototype:p.prototype,distance:hit ? Math.abs(hit.distance-.2) : null});
    }
    check('all closed entrances sit against their actual facade',contacts.every(c=>c.distance!==null&&c.distance<.105),
        {count:contacts.length,maximum:Math.max(...contacts.map(c=>c.distance??Infinity)),failures:contacts.filter(c=>c.distance===null||c.distance>=.105)});
    console.log(JSON.stringify({passed:true,checks:checks.length,navigation:world.nav.length,components,
        bodies:physics.world.bodies.len(),colliders:physics.world.colliders.len()}));
} catch(error) {
    checks.push({error:String(error)});
    fs.writeFileSync(path.join(root,'.artifacts/graffiti-city',`world-cpu-failure-${Date.now()}.json`),JSON.stringify(checks,null,2)+'\n');
    throw error;
}
finally {
    const out=path.join(root,'.artifacts/graffiti-city');fs.mkdirSync(out,{recursive:true});
    fs.writeFileSync(path.join(out,'world-cpu-check.json'),JSON.stringify({checks,scope:'Actual city geometry / Rapier; textures and visual quality excluded'},null,2)+'\n');
    if(world) {assets.disposeScene(world.group);world.art.dispose();}assets?.dispose();physics?.dispose();await server.close();
}
