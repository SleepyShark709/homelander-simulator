// A0 CPU inspection of the actual runtime GLB. This is not visual acceptance.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from '../src/core/config.ts';

const folder = process.argv[2] ?? '.artifacts/animation-style/a0';
const source = 'public/assets/human/homelander.glb';
const bytes = fs.readFileSync(source);
const jsonLength = bytes.readUInt32LE(12);
const doc = JSON.parse(bytes.subarray(20, 20 + jsonLength));
const binary = bytes.subarray(28 + jsonLength);
const provenance = JSON.parse(fs.readFileSync('.asset-source/homelander/provenance.json'));
const referencePath = '.asset-source/homelander/blender-reference.json.gz';
const reference = JSON.parse(gunzipSync(fs.readFileSync(referencePath)));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass, detail });
check('runtime digest', hash(bytes) === provenance.runtimeSha256, hash(bytes));
check('raw BIN digest', hash(binary) === provenance.rawBinSha256, hash(binary));
check('saved Blender reference digest', hash(fs.readFileSync(referencePath)) === provenance.referenceSha256);
for (const [file, digest] of Object.entries(provenance.inputs))
    check(`input: ${file}`, hash(fs.readFileSync(file)) === digest);
check('adapter digest', hash(fs.readFileSync('scripts/adapt-homelander.py')) === provenance.adapterSha256);

// Decode the real hierarchy, skin and tracks without a browser or image codec.
// This copy only drops materials for CPU measurement; the runtime file is untouched.
const cpuDoc = structuredClone(doc);
delete cpuDoc.images; delete cpuDoc.textures; delete cpuDoc.materials;
for (const mesh of cpuDoc.meshes) for (const primitive of mesh.primitives) delete primitive.material;
const data = Buffer.from(JSON.stringify(cpuDoc));
const json = Buffer.concat([data, Buffer.alloc((4 - data.length % 4) % 4, 32)]);
const packed = Buffer.alloc(28 + json.length + binary.length);
packed.write('glTF'); packed.writeUInt32LE(2, 4); packed.writeUInt32LE(packed.length, 8);
packed.writeUInt32LE(json.length, 12); packed.write('JSON', 16); json.copy(packed, 20);
packed.writeUInt32LE(binary.length, 20 + json.length); packed.write('BIN\0', 24 + json.length);
binary.copy(packed, 28 + json.length);
const asset = await new GLTFLoader().parseAsync(packed.buffer, '');
let mesh;
asset.scene.traverse(object => { if (object.isSkinnedMesh) { assert.ok(!mesh, 'Expected one skinned mesh'); mesh = object; } });
assert.ok(mesh, 'Missing skinned mesh');
check('complete exported rig', mesh.skeleton.bones.length === 68, mesh.skeleton.bones.length);
const positions = mesh.geometry.attributes.position;
const indices = reference.vertices.map(point => {
    let nearest = -1, distance = Infinity;
    for (let i = 0; i < positions.count; i++) {
        const d = (positions.getX(i) - point[0]) ** 2 + (positions.getY(i) - point[1]) ** 2 + (positions.getZ(i) - point[2]) ** 2;
        if (d < distance) { nearest = i; distance = d; }
    }
    assert.ok(distance < 1e-8, `Reference vertex missing: ${point}`);
    return nearest;
});
const mixer = new T.AnimationMixer(asset.scene);
const aliases = { run: 'jog', heavy_attack: 'punch' };
for (const clipReference of reference.clips) {
    const name = aliases[clipReference.name] ?? clipReference.name;
    const clip = asset.animations.find(item => item.name === name);
    assert.ok(clip, `Missing animation ${name}`);
    mixer.stopAllAction();
    const action = mixer.clipAction(clip).setLoop(T.LoopOnce, 1).play();
    action.clampWhenFinished = true;
    let maxVertexError = 0, worst;
    for (const sample of clipReference.samples) {
        mixer.setTime(sample.time); asset.scene.updateMatrixWorld(true);
        for (let j = 0; j < indices.length; j++) {
            const point = new T.Vector3().fromBufferAttribute(positions, indices[j]);
            mesh.applyBoneTransform(indices[j], point).applyMatrix4(mesh.matrixWorld);
            const error = point.distanceTo(new T.Vector3().fromArray(sample.vertices[j]));
            assert.ok(Number.isFinite(error), `Non-finite skin: ${name}`);
            if (error > maxVertexError) { maxVertexError = error; worst = { time: sample.time, vertex: indices[j] }; }
        }
    }
    check(`saved Blender skin: ${name}`, maxVertexError < .015,
        { frames: clipReference.samples.length, vertices: indices.length, maxVertexError, worst });
}

const once = new Set([...Object.keys(CONFIG.heroAttacks), 'takeoff', 'fall', 'jump_start', 'jump_land', 'land', 'slam']);
const clips = doc.animations.map(record => {
    const clip = asset.animations.find(item => item.name === record.name);
    const duration = clip.duration;
    const events = record.name in CONFIG.heroAttacks
        ? CONFIG.heroAttacks[record.name].map(fraction => ({ kind: 'hit', fraction, clipTime: duration * fraction }))
        : record.name === 'land' ? [{ kind: 'existing landing contact', clipTime: CONFIG.playerLandingContactTime }] : [];
    const samples = reference.clips.find(item => (aliases[item.name] ?? item.name) === record.name)?.samples.length;
    return { name: record.name, active: record.name !== 'slam', duration, sourceFrames: samples,
        source: record.extras.source, sourceClip: record.extras.sourceClip, license: record.extras.license,
        authoredHere: record.extras.keyframesAuthoredHere, mode: once.has(record.name) ? 'once' : 'loop',
        events, baseSpeedMetadata: doc.extras.locomotion[record.name]?.baseSpeed ?? null,
        supportContacts: ['walk', 'jog', 'sprint'].includes(record.name) ? 'unmarked; requires visual calibration' : 'not inferred',
        disposition: 'pending current visual review',
    };
});
check('17 active categories and one reserved slam', clips.filter(item => item.active).length === 17 && clips.length === 18);
for (const record of doc.animations)
    check(`complete bone channels: ${record.name}`, doc.skins[0].joints.every(node =>
        ['translation', 'rotation', 'scale'].every(property => record.channels.some(channel => channel.target.node === node && channel.target.path === property))));

const report = { method: 'CPU decode of current GLB vs saved Blender evaluated-mesh samples; materials omitted only in memory',
    limits: ['No newly evaluated Blender reference', 'No visual, cape, contact, transition or gameplay acceptance', 'No measured world-space foot drift'],
    source, bytes: bytes.length, runtimeSha256: hash(bytes), bones: mesh.skeleton.bones.length,
    checks, clips, pass: checks.every(item => item.pass) };
fs.mkdirSync(folder, { recursive: true });
fs.writeFileSync(path.join(folder, 'asset-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ pass: report.pass, checks: checks.length, bones: report.bones, clips: clips.map(({name,duration,events}) => ({name,duration,events})), failures: checks.filter(item => !item.pass) }, null, 2));
if (!report.pass) process.exitCode = 1;
