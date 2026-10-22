// Package A1 samples only after proving the original rig, skin and 18 clips survived.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const folder = '.artifacts/animation-style/a2/build';
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const read = file => {
    const bytes = fs.readFileSync(file), length = bytes.readUInt32LE(12);
    return { bytes, doc: JSON.parse(bytes.subarray(20, 20 + length)), bin: bytes.subarray(28 + length) };
};
const base = read('public/assets/human/homelander.glb');
const next = read(`${folder}/style-raw.glb`);
const build = JSON.parse(fs.readFileSync(`${folder}/style-build.json`));
for (const [file, digest] of Object.entries(build.inputs))
    assert.equal(hash(fs.readFileSync(file)), digest, `Stale style input: ${file}`);
assert.equal(hash(next.bytes), build.rawSha256);
assert.equal(hash(fs.readFileSync(`${folder}/style-reference.json.gz`)), build.referenceSha256);
function accessor(asset, index) {
    const a = asset.doc.accessors[index], view = asset.doc.bufferViews[a.bufferView];
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type]
        * { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
    assert.ok(width && !a.sparse);
    const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return { type: a.type, componentType: a.componentType, count: a.count,
        bytes: Buffer.concat(Array.from({ length: a.count }, (_, i) =>
            asset.bin.subarray(start + i * (view.byteStride ?? width), start + i * (view.byteStride ?? width) + width))) };
}
assert.deepEqual(next.doc.skins[0].joints.map(i => next.doc.nodes[i].name), base.doc.skins[0].joints.map(i => base.doc.nodes[i].name));
assert.deepEqual(accessor(next, next.doc.skins[0].inverseBindMatrices), accessor(base, base.doc.skins[0].inverseBindMatrices));
for (const key of ['materials', 'textures', 'samplers']) assert.deepEqual(next.doc[key], base.doc[key], `Changed PBR: ${key}`);
for (const node of base.doc.nodes) {
    const other = next.doc.nodes.find(item => item.name === node.name);
    assert.ok(other, `Missing baseline node: ${node.name}`);
    for (const key of ['translation', 'rotation', 'scale', 'matrix']) assert.deepEqual(other[key], node[key], `Changed bind: ${node.name}/${key}`);
}
for (let i = 0; i < base.doc.meshes[0].primitives.length; i++) {
    const a = base.doc.meshes[0].primitives[i], b = next.doc.meshes[0].primitives[i];
    assert.equal(b.material, a.material, 'Changed primitive material');
    for (const key of Object.keys(a.attributes)) assert.deepEqual(accessor(next, b.attributes[key]), accessor(base, a.attributes[key]), `Changed mesh: ${key}`);
    assert.deepEqual(accessor(next, b.indices), accessor(base, a.indices));
}
const aliases = { run: 'jog', heavy_attack: 'punch' };
for (const clip of next.doc.animations) {
    clip.name = aliases[clip.name] ?? clip.name;
    const original = base.doc.animations.find(item => item.name === clip.name);
    if (original) {
        assert.equal(clip.channels.length, original.channels.length);
        for (const channel of original.channels) {
            const name = base.doc.nodes[channel.target.node].name, property = channel.target.path;
            const equivalent = clip.channels.find(item => next.doc.nodes[item.target.node].name === name && item.target.path === property);
            assert.ok(equivalent, `Missing channel: ${clip.name}/${name}/${property}`);
            const a = original.samplers[channel.sampler], b = clip.samplers[equivalent.sampler];
            assert.deepEqual(accessor(next, b.input), accessor(base, a.input), `Changed time: ${clip.name}/${name}`);
            assert.deepEqual(accessor(next, b.output), accessor(base, a.output), `Changed samples: ${clip.name}/${name}/${property}`);
            assert.equal(b.interpolation ?? 'LINEAR', a.interpolation ?? 'LINEAR');
        }
        clip.extras = original.extras;
    } else {
        const record = build.clips.find(item => item.name === clip.name);
        assert.ok(record, `Unrecorded style clip: ${clip.name}`);
        clip.extras = { ...record, retargeted: true, tool: build.tool };
    }
}
assert.equal(next.doc.animations.length, base.doc.animations.length + build.clips.length);
assert.equal(next.doc.images.length, base.doc.images.length);
for (let i = 0; i < base.doc.images.length; i++) {
    const a = base.doc.bufferViews[base.doc.images[i].bufferView], b = next.doc.bufferViews[next.doc.images[i].bufferView];
    assert.deepEqual(next.bin.subarray(b.byteOffset, b.byteOffset + b.byteLength), base.bin.subarray(a.byteOffset, a.byteOffset + a.byteLength));
}
next.doc.extras = { ...base.doc.extras, styleProfiles: build.profiles, defaultStyleProfile: build.defaultProfile, styleTransitionEnds: build.transitionEnds,
    locomotion: {...base.doc.extras.locomotion, ...build.locomotionContract.clips}, locomotionContract: build.locomotionContract,
    animationSource: { tool: build.tool, blender: build.blender, keyframesAuthoredHere: true,
        baseline: base.doc.extras.animationSource, styleBuild: build } };
const data = Buffer.from(JSON.stringify(next.doc));
const json = Buffer.concat([data, Buffer.alloc((4 - data.length % 4) % 4, 32)]);
const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + next.bin.length, 8);
header.writeUInt32LE(json.length, 12); header.write('JSON', 16);
binHeader.writeUInt32LE(next.bin.length); binHeader.write('BIN\0', 4);
const result = Buffer.concat([header, json, binHeader, next.bin]);
fs.writeFileSync('public/assets/human/homelander-style.glb', result);
for (const [from, to] of [['style-editable.blend', 'style-editable.blend'], ['style-reference.json.gz', 'style-reference.json.gz']])
    fs.copyFileSync(`${folder}/${from}`, `.asset-source/homelander/${to}`);
fs.writeFileSync('.asset-source/homelander/style-build.json', JSON.stringify({ ...build,
    baselineRuntimeSha256: hash(base.bytes), runtimeSha256: hash(result),
    editableSha256: hash(fs.readFileSync(`${folder}/style-editable.blend`)),
    preservation: 'Original mesh, weights, bind matrices, textures and all 18 animation samples are byte-identical' }, null, 2) + '\n');
console.log(JSON.stringify({ bytes: result.length, baselineClipsPreserved: 18, candidateClips: build.clips.map(item => item.name), runtimeSha256: hash(result) }));
