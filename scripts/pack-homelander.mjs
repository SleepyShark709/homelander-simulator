// Package the ARP export without changing its skeleton, skin or motion samples.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as T from 'three';

const folder = '.artifacts/homelander';
const bytes = fs.readFileSync(`${folder}/homelander-raw.glb`);
const length = bytes.readUInt32LE(12);
const doc = JSON.parse(bytes.subarray(20,20+length));
const binary = bytes.subarray(28+length);
const adaptation = JSON.parse(fs.readFileSync(`${folder}/adaptation.json`));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const source = '.asset-source/homelander/rig.blend';
assert.equal(hash(fs.readFileSync(source)),adaptation.sourceSha256);
const generation = adaptation.generation;
assert.ok(generation, 'Missing export evidence; rerun adapt-homelander.py');
for (const [path, digest] of Object.entries(generation.inputs))
    assert.equal(hash(fs.readFileSync(path)), digest, `Stale export input: ${path}`);
assert.equal(hash(fs.readFileSync('scripts/adapt-homelander.py')), generation.adapterSha256, 'Stale export adapter');
assert.equal(hash(bytes), generation.rawExportSha256, 'Raw export does not match generation evidence');
assert.equal(hash(fs.readFileSync(`${folder}/blender-reference.json.gz`)), generation.referenceSha256, 'Stale Blender reference');
adaptation.source = source;
const mixamo = JSON.parse(fs.readFileSync('actions/manifest.json'));
const aliases = { run:'jog', heavy_attack:'punch' };
assert.equal(doc.animations.length, adaptation.clips.length);
for (const clip of doc.animations) {
    const record = adaptation.clips.find(c => c.name === clip.name);
    assert.ok(record, `Unrequested animation: ${clip.name}`);
    const input = mixamo.assets.find(a => a.id === clip.name);
    clip.extras = { ...record, tool:adaptation.tool, retargeted:true,
        keyframesAuthoredHere:false, license:input ? 'Adobe Mixamo (user supplied)' : 'CC0-1.0' };
    clip.name = aliases[clip.name] ?? clip.name;
}
const worlds = [];
function world(index, parent) {
    const node = doc.nodes[index];
    const local = node.matrix ? new T.Matrix4().fromArray(node.matrix) : new T.Matrix4().compose(
        new T.Vector3().fromArray(node.translation ?? [0,0,0]),
        new T.Quaternion().fromArray(node.rotation ?? [0,0,0,1]),
        new T.Vector3().fromArray(node.scale ?? [1,1,1]));
    worlds[index] = parent.clone().multiply(local);
    for (const child of node.children ?? []) world(child, worlds[index]);
}
for (const root of doc.scenes[doc.scene ?? 0].nodes) world(root,new T.Matrix4());
const head = doc.nodes.findIndex(n => n.name === 'head.x');
assert.ok(head >= 0);
const inverse = worlds[head].clone().invert();
// Weld positions for connectivity only; the render vertices/UV islands remain intact.
const primitive = doc.meshes[0].primitives[0];
function accessor(index) {
    const a = doc.accessors[index], view = doc.bufferViews[a.bufferView];
    const components = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
    const size = {5121:1,5123:2,5125:4,5126:4}[a.componentType];
    const read = {5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType];
    return Array.from({length:a.count},(_,i) => Array.from({length:components},(_,j) =>
        binary[read]((view.byteOffset??0)+(a.byteOffset??0)+i*(view.byteStride??size*components)+j*size)));
}
const positions = accessor(primitive.attributes.POSITION), joints = accessor(primitive.attributes.JOINTS_0),
    weights = accessor(primitive.attributes.WEIGHTS_0), triangles = accessor(primitive.indices).flat();
const parents = positions.map((_,i)=>i), weld = new Map();
const find = i => parents[i] === i ? i : (parents[i] = find(parents[i]));
const join = (a,b) => { parents[find(a)] = find(b); };
for (let i=0;i<positions.length;i++) {
    const key=positions[i].join(',');
    if(weld.has(key)) join(i,weld.get(key)); else weld.set(key,i);
}
for(let i=0;i<triangles.length;i+=3) { join(triangles[i],triangles[i+1]);join(triangles[i],triangles[i+2]); }
const components = new Map();
for(let i=0;i<positions.length;i++) {
    const root=find(i);if(!components.has(root))components.set(root,[]);components.get(root).push(i);
}
const anchorJoint = doc.skins[0].joints.findIndex(i=>doc.nodes[i].name==='spine_03.x');
const cape = [...components.values()].filter(vertices => vertices.every(i =>
    joints[i][0]===anchorJoint && weights[i][0]===1 && weights[i].slice(1).every(w=>w===0)))
    .sort((a,b)=>b.length-a.length)[0];
assert.equal(cape?.length,5913,'The independent rigid cape component has changed');
doc.extras = {
    modelSource:'User supplied Tripo Homelander / Auto-Rig Pro',
    headBone:'headx', height:1.86, boneCount:doc.skins[0].joints.length,
    eyes:Object.fromEntries(['l','r'].map((side,i) => [side,
        new T.Vector3(i ? -.032 : .032,1.742,.095).applyMatrix4(inverse).toArray()])),
    locomotion:Object.fromEntries(['walk','jog','sprint'].map((name,i) => [name,{baseSpeed:[1.5,4,8][i]}])),
    cape:{mesh:0,anchorJoint,pinMinY:1.5,vertexIndices:cape},
    animationSource:{...adaptation, source:'Mixamo + Mesh2Motion', retargeted:true,
        license:'Mixed: user supplied Tripo/Mixamo; Mesh2Motion CC0',
        adapterSha256:crypto.createHash('sha256').update(fs.readFileSync('scripts/adapt-homelander.py')).digest('hex')},
};
const data = Buffer.from(JSON.stringify(doc));
const json = Buffer.concat([data,Buffer.alloc((4-data.length%4)%4,0x20)]);
const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
header.write('glTF'); header.writeUInt32LE(2,4);
header.writeUInt32LE(28+json.length+binary.length,8);
header.writeUInt32LE(json.length,12); header.write('JSON',16);
binHeader.writeUInt32LE(binary.length); binHeader.write('BIN\0',4);
fs.writeFileSync('public/assets/human/homelander.glb',Buffer.concat([header,json,binHeader,binary]));
fs.copyFileSync(`${folder}/blender-reference.json.gz`,'.asset-source/homelander/blender-reference.json.gz');
fs.writeFileSync('.asset-source/homelander/adaptation.json',JSON.stringify(adaptation,null,2)+'\n');
fs.writeFileSync('.asset-source/homelander/provenance.json',JSON.stringify({
    tool:adaptation.tool, blender:adaptation.blender,
    ...generation,
    runtimeSha256:hash(fs.readFileSync('public/assets/human/homelander.glb')),
    rawBinSha256:hash(binary),
    keyframesAuthoredHere:false,
},null,2)+'\n');
console.log(JSON.stringify({bones:doc.skins[0].joints.length,clips:doc.animations.map(a=>a.name),bytes:28+json.length+binary.length}));
