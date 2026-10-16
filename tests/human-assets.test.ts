import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

function glb(path: string) {
    const bytes = readFileSync(path), length = bytes.readUInt32LE(12);
    return { json: JSON.parse(bytes.subarray(20, 20 + length).toString()), binary: bytes.subarray(28 + length), bytes };
}
const characters = [glb('public/assets/human/native-player.glb'), glb('public/assets/human/native-npc.glb')];
const sources = {
    base: glb('.asset-source/mesh2motion/human-base-animations.glb'),
    addon: glb('.asset-source/mesh2motion/human-addon-animations.glb'),
};
const adapted = JSON.parse(readFileSync('.asset-source/mesh2motion-adapted-runs/player.json','utf8'));
function data(asset: ReturnType<typeof glb>, index: number) {
    const a = asset.json.accessors[index], view = asset.json.bufferViews[a.bufferView];
    const components: Record<string,number> = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
    const sizes: Record<number,number> = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
    const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return asset.binary.subarray(offset, offset + a.count * components[a.type] * sizes[a.componentType]);
}

describe('native character asset integrity', () => {
    it('has the complete original humanoid and normalized skin weights', () => {
        for (const character of characters) {
        const { json, binary } = character;
        expect(json.skins[0].joints.length).toBe(66);
        for (const side of ['l','r']) for (const part of ['clavicle','upperarm','lowerarm','hand','thigh','calf','foot','ball'])
            expect(json.nodes.some((n: { name:string }) => n.name === `${part}_${side}`)).toBe(true);
        expect(json.animations.map((a: { name:string }) => a.name)).toEqual(expect.arrayContaining(['idle','walk','jog','sprint','punch','shoot','fall']));
        for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
            const a = json.accessors[primitive.attributes.WEIGHTS_0], view = json.bufferViews[a.bufferView];
            const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
            for (let i = 0; i < a.count; i++) {
                let sum = 0;
                for (let c = 0; c < 4; c++) {
                    const value = binary.readFloatLE(offset + i * 16 + c * 4);
                    expect(value).toBeGreaterThanOrEqual(0); sum += value;
                }
                expect(sum).toBeCloseTo(1,5);
            }
        }
        expect(json.extras.modelSource).toBe('Mesh2Motion native mannequin');
        expect(json.extras.animationSource.retargeted).toBe(json.extras.sourceBundle === 'addon');
        expect(json.extras.animationSource.keyframesAuthoredHere).toBe(false);
        }
    });
    it('preserves the upstream mesh, hierarchy, skin indices and inverse bind matrices byte for byte', () => {
        expect(createHash('sha256').update(sources.base.bytes).digest('hex')).toBe('406eb0a8dc4ab366e623b79b6e3005a4951392e1bda78ae39c1099d31147733c');
        for (const character of characters) {
            const originalAsset = sources[character.json.extras.sourceBundle as keyof typeof sources];
            expect(character.json.nodes).toEqual(originalAsset.json.nodes);
            expect(character.json.skins[0].joints).toEqual(originalAsset.json.skins[0].joints);
            expect(data(character,character.json.skins[0].inverseBindMatrices).equals(data(originalAsset,originalAsset.json.skins[0].inverseBindMatrices))).toBe(true);
            const current = character.json.meshes[0].primitives[0], original = originalAsset.json.meshes[0].primitives[0];
            for (const name of Object.keys(original.attributes))
                expect(data(character,current.attributes[name]).equals(data(originalAsset,original.attributes[name]))).toBe(true);
            expect(data(character,current.indices).equals(data(originalAsset,original.indices))).toBe(true);
        }

    });
    it('preserves native clips and packages only the verified tool output for the two approved runs', () => {
        const jump = characters[0].json.animations.find((clip: {name:string}) => clip.name === 'jump');
        expect(jump.extras).toMatchObject({sourceClip:'Jump_2',bundle:'addon',retargeted:false});
        expect(createHash('sha256').update(sources.addon.bytes).digest('hex')).toBe('a0d64d555e0d492026b72d58bf8e16c5e86779295f9093e376dcc001915c2c95');
        for (const character of characters) for (const clip of character.json.animations) {
            const source = sources[clip.extras.bundle as keyof typeof sources];
            const original = source.json.animations.find((a: { name:string }) => a.name === clip.extras.sourceClip);
            expect(clip.channels.length).toBe(198);
            expect(clip.extras.license).toBe('CC0-1.0');
            if (clip.extras.retargeted) {
                expect(character.json.extras.sourceBundle).toBe('addon');
                expect(['jog','sprint']).toContain(clip.name);
                expect(clip.extras.bundle).toBe('base');
                expect(clip.extras.keyframesAuthoredHere).toBe(false);
                const converted = adapted.clips.find((c: {name:string}) => c.name === clip.name);
                expect(clip.extras.sourceClip).toBe(clip.name === 'jog' ? 'Jog' : 'Sprint');
                for (let i = 0; i < clip.channels.length; i++) {
                    const channel = clip.channels[i], track = converted.tracks[i], sampler = clip.samplers[channel.sampler];
                    const [bone,property] = track.name.split('.');
                    expect(character.json.nodes[channel.target.node].name).toBe(bone);
                    expect(channel.target.path).toBe(({position:'translation',quaternion:'rotation',scale:'scale'} as Record<string,string>)[property]);
                    expect(data(character,sampler.input).equals(Buffer.from(Float32Array.from(track.times).buffer))).toBe(true);
                    expect(data(character,sampler.output).equals(Buffer.from(Float32Array.from(track.values).buffer))).toBe(true);
                }
                continue;
            }
            expect(clip.extras.bundle).toBe(character.json.extras.sourceBundle);
            for (let i = 0; i < clip.channels.length; i++) {
                const current = clip.channels[i], upstream = original.channels[i];
                expect(current.target.path).toBe(upstream.target.path);
                expect(character.json.nodes[current.target.node].name).toBe(source.json.nodes[upstream.target.node].name);
                const a = clip.samplers[current.sampler], b = original.samplers[upstream.sampler];
                expect(data(character,a.input).equals(data(source,b.input))).toBe(true);
                expect(data(character,a.output).equals(data(source,b.output))).toBe(true);
            }
        }
    });
    it('records matching source inputs and an unchanged upstream retargeter with full skeleton reference checks', () => {
        const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
        expect(adapted.metadata).toEqual(JSON.parse(readFileSync('.asset-source/mesh2motion-adapted-runs/provenance.json','utf8')));
        expect(hash(Buffer.from(JSON.stringify(adapted.clips)))).toBe(adapted.metadata.outputSha256);
        expect(Object.keys(adapted.metadata.library)).toHaveLength(12);
        expect(adapted.metadata.adapterSha256).toBe(hash(readFileSync('scripts/adapt-native-runs.mjs')));
        expect(adapted.metadata.commit).toBe(readFileSync('scripts/vendor/mesh2motion/UPSTREAM_COMMIT','utf8').trim());
        for (const input of Object.values(adapted.metadata.inputs) as Array<{path:string;sha256:string}>) expect(hash(readFileSync(input.path))).toBe(input.sha256);
        for (const [path,sha] of Object.entries(adapted.metadata.library)) {
            const current = readFileSync(`scripts/vendor/mesh2motion/${path}`);
            expect(hash(current)).toBe(sha);
            expect(current.equals(readFileSync(`.asset-source/mesh2motion-code/${path}`))).toBe(true);
        }
        expect(adapted.metadata.checks).toHaveLength(2);
        for (const check of adapted.metadata.checks) {
            expect(check.bones).toBe(66); expect(check.mapped).toBe(65);
            expect(check.maxDeformationRotationError).toBeLessThan(.15);
        }
        expect(adapted.clips[0].tracks).not.toEqual(adapted.clips[1].tracks);
    });
});
