import { expect, it } from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const bytes = fs.readFileSync('public/assets/human/homelander-style.glb');
const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
const build = JSON.parse(fs.readFileSync('.asset-source/homelander/style-build.json', 'utf8'));
const hash = (data: Buffer) => crypto.createHash('sha256').update(data).digest('hex');

it('ties the reviewed samples and editable NLA project to their actual inputs', () => {
    expect(hash(bytes)).toBe(build.runtimeSha256);
    expect(build.inputs['scripts/adapt-homelander.py']).toBe(hash(fs.readFileSync('scripts/adapt-homelander.py')));
    expect(hash(fs.readFileSync('public/assets/human/homelander.glb'))).toBe(build.baselineRuntimeSha256);
    expect(hash(fs.readFileSync('.asset-source/homelander/style-editable.blend'))).toBe(build.editableSha256);
    expect(hash(fs.readFileSync('.asset-source/homelander/style-reference.json.gz'))).toBe(build.referenceSha256);
    for (const [file, digest] of Object.entries(build.inputs)) expect(hash(fs.readFileSync(file))).toBe(digest);
    const shipped = JSON.parse(fs.readFileSync('public/assets/manifest.json', 'utf8')).assets
        .find((entry: any) => entry.path === 'human/homelander-style.glb');
    expect(shipped.license).not.toBe('CC0-1.0');
    expect(shipped.licenseFile).toBe('licenses/homelander-source.txt');
    expect(shipped.pipeline).toContain('scripts/build-homelander-style.py');
});

it('distinguishes NLA edits from unedited, formally remapped sources', () => {
    expect(doc.extras.animationSource.keyframesAuthoredHere).toBe(true);
    const added = doc.animations.filter((clip: any) => build.clips.some((item: any) => item.name === clip.name));
    expect(added).toHaveLength(24);
    expect(added.filter((clip: any) => clip.extras.keyframesAuthoredHere)).toHaveLength(22);
    for (const clip of added.filter((clip: any) => clip.extras.keyframesAuthoredHere))
        expect(Array.isArray(clip.extras.editing.tracks)).toBe(true);
    for (const clip of doc.animations.filter((clip: any) => !added.includes(clip)))
        expect(clip.extras.keyframesAuthoredHere).toBe(false);
});

it('preserves PBR values, texture associations and primitive material assignments', () => {
    const baseline = fs.readFileSync('public/assets/human/homelander.glb');
    const original = JSON.parse(baseline.subarray(20, 20 + baseline.readUInt32LE(12)).toString());
    for (const key of ['materials', 'textures', 'samplers']) expect(doc[key]).toEqual(original[key]);
    expect(doc.meshes[0].primitives.map((item: any) => item.material))
        .toEqual(original.meshes[0].primitives.map((item: any) => item.material));
});

it('exports full body channels and fresh evaluated skin for every candidate', () => {
    expect(doc.skins[0].joints).toHaveLength(68);
    expect(doc.animations).toHaveLength(42);
    const reference = JSON.parse(gunzipSync(fs.readFileSync('.asset-source/homelander/style-reference.json.gz')).toString());
    expect(reference.vertices).toHaveLength(249);
    for (const candidate of build.clips) {
        const clip = doc.animations.find((clip: any) => clip.name === candidate.name);
        for (const joint of doc.skins[0].joints) for (const property of ['translation', 'rotation', 'scale'])
            expect(clip.channels.some((channel: any) => channel.target.node === joint && channel.target.path === property)).toBe(true);
        expect(reference.clips.find((clip: any) => clip.name === candidate.name).samples.length).toBeGreaterThan(1);
    }
});
