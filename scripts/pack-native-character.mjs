// Select stock clips with their ORIGINAL mannequin, skin and 66-joint skeleton.
// Mesh/skin and native clips are copied unchanged. Only the two approved base
// runs use the separately verified, offline Mesh2Motion retargeter output.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as T from 'three';

const folder = '.asset-source/mesh2motion';
const provenance = JSON.parse(fs.readFileSync(`${folder}/provenance.json`));
const adapted = JSON.parse(fs.readFileSync('.asset-source/mesh2motion-adapted-runs/player.json'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
assert.deepEqual(adapted.metadata,JSON.parse(fs.readFileSync('.asset-source/mesh2motion-adapted-runs/provenance.json')));
assert.equal(hash(Buffer.from(JSON.stringify(adapted.clips))),adapted.metadata.outputSha256,'Changed tool output; re-run scripts/adapt-native-runs.mjs');
assert.equal(Object.keys(adapted.metadata.library).length,12);
assert.equal(adapted.metadata.adapterSha256,hash(fs.readFileSync('scripts/adapt-native-runs.mjs')),'Re-run scripts/adapt-native-runs.mjs');
assert.equal(adapted.metadata.commit,provenance.commit);
for (const input of Object.values(adapted.metadata.inputs)) assert.equal(hash(fs.readFileSync(input.path)),input.sha256);
for (const [path,sha] of Object.entries(adapted.metadata.library)) assert.equal(hash(fs.readFileSync(`scripts/vendor/mesh2motion/${path}`)),sha);
assert.equal(adapted.metadata.targetBundle,'addon');
assert.ok(adapted.metadata.checks.every(c => c.bones === 66 && c.mapped === 65 && c.maxDeformationRotationError < .15));
const bundles = {};
for (const name of ['base', 'addon']) {
    const file = `${folder}/human-${name}-animations.glb`;
    const bytes = fs.readFileSync(file), length = bytes.readUInt32LE(12);
    const record = provenance.sources.find(s => s.file === file);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), record.sha256);
    bundles[name] = { json: JSON.parse(bytes.subarray(20, 20 + length)), binary: bytes.subarray(28 + length) };
}
const selections = [
    ['addon', 'native-player', [
        ['idle','Idle_Subtle'], ['walk','Walk_Female'], ['jog','Jog','base'], ['sprint','Sprint','base'],
        ['punch','Fighting Right Jab'], ['shoot','Fighting Idle'], ['fall','Glide'],
        ['hover','Levitate Idle'], ['fly','Flying Forward Super'], ['takeoff','Levitate Entrance'],
        ['land','Land_Three_Point'], ['slam','Attack_Ground_Pound'],
    ]],
    ['base', 'native-npc', [
        ['idle','Idle_A'], ['walk','Walk'], ['jog','Jog'], ['sprint','Sprint'],
        ['punch','Punch_Jab'], ['shoot','Pistol_Aim_Neutral'], ['fall','Jump_air'],
    ]],
];
for (const [bundle, filename, selected] of selections) {
const base = bundles[bundle].json;
const doc = structuredClone(base), binary = [], views = new Map(), accessors = new Map();
doc.bufferViews = []; doc.accessors = []; doc.animations = [];
let offset = 0;
function copyView(bundle, index) {
    const key = `${bundle}:${index}`;
    if (views.has(key)) return views.get(key);
    const source = bundles[bundle], view = source.json.bufferViews[index];
    assert.equal(view.buffer, 0);
    const data = source.binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const target = doc.bufferViews.length;
    doc.bufferViews.push({ ...view, buffer: 0, byteOffset: offset });
    binary.push(data, Buffer.alloc((4 - data.length % 4) % 4));
    offset += data.length + (4 - data.length % 4) % 4;
    views.set(key, target); return target;
}
function copyAccessor(bundle, index) {
    const key = `${bundle}:${index}`;
    if (accessors.has(key)) return accessors.get(key);
    const source = bundles[bundle].json.accessors[index];
    assert.ok(!source.sparse, 'Sparse accessor needs an explicit packaging implementation');
    const target = doc.accessors.length;
    doc.accessors.push({ ...source, bufferView: copyView(bundle, source.bufferView) });
    accessors.set(key, target); return target;
}
for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
    primitive.attributes = Object.fromEntries(Object.entries(primitive.attributes).map(([key, value]) => [key, copyAccessor(bundle, value)]));
    if (primitive.indices !== undefined) primitive.indices = copyAccessor(bundle, primitive.indices);
}
for (const skin of doc.skins) skin.inverseBindMatrices = copyAccessor(bundle, skin.inverseBindMatrices);
for (const image of doc.images ?? []) if (image.bufferView !== undefined) image.bufferView = copyView(bundle, image.bufferView);
const mapping = selected.map(([name, sourceName, sourceBundle = bundle]) => [name, sourceBundle, sourceName]);
const nodeNames = new Map(doc.nodes.map((n, i) => [n.name, i]));
function floatAccessor(values, type) {
    const typed = Float32Array.from(values), data = Buffer.from(typed.buffer);
    const view = doc.bufferViews.length, index = doc.accessors.length;
    doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length});
    binary.push(data,Buffer.alloc((4-data.length%4)%4)); offset += data.length+(4-data.length%4)%4;
    doc.accessors.push({bufferView:view,componentType:5126,count:values.length / ({SCALAR:1,VEC3:3,VEC4:4}[type]),type,
        ...(type === 'SCALAR' ? {min:[Math.min(...typed)],max:[Math.max(...typed)]} : {})});
    return index;
}
for (const [name, sourceBundle, sourceName] of mapping) {
    if (sourceBundle !== bundle) {
        assert.ok(filename === 'native-player' && ['jog','sprint'].includes(name),'Unapproved cross-bind clip');
        const converted = adapted.clips.find(c => c.name === name && c.sourceName === sourceName);
        assert.ok(converted); assert.equal(converted.tracks.length,198);
        const channels = [], samplers = [], paths = {position:'translation',quaternion:'rotation',scale:'scale'};
        for (const track of converted.tracks) {
            const split = track.name.lastIndexOf('.'), bone = track.name.slice(0,split), property = track.name.slice(split+1);
            assert.ok(nodeNames.has(bone)); assert.ok(paths[property]);
            channels.push({sampler:samplers.length,target:{node:nodeNames.get(bone),path:paths[property]}});
            samplers.push({input:floatAccessor(track.times,'SCALAR'),output:floatAccessor(track.values,property === 'quaternion' ? 'VEC4' : 'VEC3'),interpolation:'LINEAR'});
        }
        doc.animations.push({name,channels,samplers,extras:{source:'Mesh2Motion',sourceClip:sourceName,bundle:sourceBundle,targetBundle:bundle,
            license:'CC0-1.0',sourceCommit:provenance.commit,retargeted:true,tool:adapted.metadata.tool,
            sampleRate:adapted.metadata.sampleRate,adapterSha256:adapted.metadata.adapterSha256,keyframesAuthoredHere:false}});
        continue;
    }
    const source = bundles[sourceBundle].json, clip = source.animations.find(a => a.name === sourceName);
    assert.ok(clip, sourceName);
    doc.animations.push({
        ...clip, name,
        channels: clip.channels.map(c => ({ ...c, target: { ...c.target, node: nodeNames.get(source.nodes[c.target.node].name) } })),
        samplers: clip.samplers.map(s => ({ ...s, input: copyAccessor(sourceBundle, s.input), output: copyAccessor(sourceBundle, s.output) })),
        extras: { source: 'Mesh2Motion', sourceClip: sourceName, bundle, license: 'CC0-1.0', sourceCommit: provenance.commit, retargeted: false },
    });
}
// Static laser anchors are measured in the original head's bind coordinate frame.
const worlds = [];
function world(index, parent) {
    const node = doc.nodes[index];
    const local = node.matrix ? new T.Matrix4().fromArray(node.matrix) : new T.Matrix4().compose(
        new T.Vector3().fromArray(node.translation ?? [0,0,0]),
        new T.Quaternion().fromArray(node.rotation ?? [0,0,0,1]),
        new T.Vector3().fromArray(node.scale ?? [1,1,1]),
    );
    worlds[index] = parent.clone().multiply(local);
    for (const child of node.children ?? []) world(child, worlds[index]);
}
for (const root of doc.scenes[doc.scene ?? 0].nodes) world(root, new T.Matrix4());
const headInverse = worlds[nodeNames.get('head')].clone().invert();
doc.extras = {
    modelSource: 'Mesh2Motion native mannequin', sourceBundle: bundle, boneCount: doc.skins[0].joints.length, height: 1.8295642137527466,
    eyes: Object.fromEntries(['l','r'].map((side, i) => [side, new T.Vector3(i ? -.032 : .032, 1.715, .135).applyMatrix4(headInverse).toArray()])),
    locomotion: Object.fromEntries(['walk','jog','sprint'].map((name, i) => [name, { baseSpeed: [1.5,4,8][i], source: 'Mesh2Motion', sourceClip: mapping.find(m => m[0] === name)[2] }])),
    animationSource: { author: 'Mesh2Motion / contributors', license: 'CC0-1.0', url: 'https://github.com/Mesh2Motion/mesh2motion-app', sourceCommit: provenance.commit,
        retargeted:filename === 'native-player',keyframesAuthoredHere:false,originalChannelsPreserved:filename !== 'native-player',
        ...(filename === 'native-player' ? {retargetedClips:['jog','sprint'],adaptation:adapted.metadata} : {}) },
};
doc.buffers = [{ byteLength: offset }];
const jsonBytes = Buffer.from(JSON.stringify(doc));
const json = Buffer.concat([jsonBytes, Buffer.alloc((4 - jsonBytes.length % 4) % 4, 0x20)]);
const bin = Buffer.concat(binary), header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
header.write('glTF'); header.writeUInt32LE(2,4); header.writeUInt32LE(28 + json.length + bin.length,8);
header.writeUInt32LE(json.length,12); header.write('JSON',16);
binHeader.writeUInt32LE(bin.length); binHeader.write('BIN\0',4);
fs.writeFileSync(`public/assets/human/${filename}.glb`, Buffer.concat([header,json,binHeader,bin]));
if (filename === 'native-player') fs.writeFileSync('public/assets/human/rig-metadata.json', JSON.stringify(doc.extras,null,2)+'\n');
console.log(JSON.stringify({ file: filename, bundle, bytes: 28 + json.length + bin.length, joints: doc.skins[0].joints.length, clips: doc.animations.map(a=>[a.name,a.channels.length,a.extras.sourceClip]), retargeted:doc.animations.filter(a => a.extras.retargeted).map(a => a.name) }));
}
