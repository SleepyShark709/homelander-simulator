import * as T from 'three';
import type { Assets } from './Assets';

/** Reusable local swatches. Coordinates come from the unchanged mesh bind pose,
 * because the upstream mannequin uses a palette atlas rather than clothing UVs. */
function swatch(assets: Assets, camouflage: boolean) {
    const key = camouflage ? 'npc/camouflage' : 'npc/woven-fabric';
    const cached = assets.textures.get(key);
    if (cached) return cached;
    const size = 256, data = new Uint8Array(size * size * 4);
    let seed = 9271;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const weave = (x % 4 === 0 ? -13 : 0) + (y % 4 === 0 ? 9 : 0) + (seed % 9) - 4;
        const patch = Math.sin(x / size * Math.PI * 6 + Math.cos(y / size * Math.PI * 4) * 2)
            + Math.cos(y / size * Math.PI * 8 + Math.sin(x / size * Math.PI * 4));
        const palette = patch < -.6 ? [62, 69, 47] : patch > .9 ? [145, 139, 99] : patch > .1 ? [103, 112, 73] : [85, 94, 62];
        const color = camouflage ? palette : [217, 217, 217];
        data.set([color[0] + weave, color[1] + weave, color[2] + weave, 255], (y * size + x) * 4);
    }
    const texture = new T.DataTexture(data, size, size);
    texture.name = key;
    texture.colorSpace = T.SRGBColorSpace;
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.generateMipmaps = true; texture.minFilter = T.LinearMipmapLinearFilter;
    texture.magFilter = T.LinearFilter; texture.anisotropy = 8; texture.needsUpdate = true;
    assets.textures.set(key, texture);
    return texture;
}

export function dressNpc(material: T.MeshStandardMaterial, assets: Assets,
    role: 'civilian' | 'police' | 'soldier', variant: number) {
    const shirts = [0x9d4f34, 0x4d7881, 0xc6b58e, 0x627a58];
    const pants = [0x283b4a, 0x383d3c, 0x435164, 0x4c4540];
    material.name = `npc-${role}-${variant % 4}`;
    material.map = swatch(assets, false);
    material.color.set(0xffffff); material.metalness = 0; material.roughness = .9;
    const uniforms = {
        npcFabric: {value: swatch(assets, false)},
        npcCamo: {value: swatch(assets, true)},
        npcShirt: {value: new T.Color(role === 'police' ? 0x254361 : shirts[variant % 4])},
        npcPants: {value: new T.Color(role === 'police' ? 0x1d2a3c : pants[variant % 4])},
        npcSkin: {value: new T.Color([0xbe8d6e, 0x976b50, 0xd1ab88, 0x72513f][variant % 4])},
        npcUniform: {value: role === 'soldier' ? 2 : role === 'police' ? 1 : 0},
    };
    material.userData.clothing = {role, fabric: uniforms.npcFabric.value.name, camouflage: role === 'soldier'};
    material.customProgramCacheKey = () => 'npc-clothing-bind-projection-v1';
    material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
            varying vec3 vClothingPosition;
        `).replace('#include <begin_vertex>', `#include <begin_vertex>
            vClothingPosition = position;
        `);
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
            varying vec3 vClothingPosition;
            uniform sampler2D npcFabric;
            uniform sampler2D npcCamo;
            uniform vec3 npcShirt, npcPants, npcSkin;
            uniform float npcUniform;
            float clothingRect(vec2 p, vec2 center, vec2 extent) {
                vec2 edge = 1.0 - smoothstep(extent, extent + vec2(0.003), abs(p - center));
                return edge.x * edge.y;
            }
        `).replace('#include <map_fragment>', `
            vec3 cp = vClothingPosition;
            vec3 fabric = texture2D(npcFabric, cp.xy * 3.0).rgb;
            float shirt = smoothstep(0.94, 1.01, cp.y);
            float neck = smoothstep(1.46, 1.49, cp.y) * (1.0 - smoothstep(0.065, 0.095, abs(cp.x)));
            float head = smoothstep(1.51, 1.57, cp.y) * (1.0 - smoothstep(0.13, 0.19, abs(cp.x)));
            float skin = max(max(neck, head), smoothstep(0.74, 0.79, abs(cp.x)));
            float shoe = 1.0 - smoothstep(0.14, 0.19, cp.y);
            vec3 cloth = mix(npcPants, npcShirt, shirt) * fabric;
            if (npcUniform > 1.5) {
                cloth = texture2D(npcCamo, cp.xy * 2.6).rgb * fabric;
            }
            // Small seams, chest pockets and a belt keep uniforms readable at street scale.
            float front = smoothstep(0.08, 0.13, cp.z);
            float pocket = clothingRect(vec2(abs(cp.x), cp.y), vec2(0.125, 1.31), vec2(0.065, 0.065));
            float pocketInner = clothingRect(vec2(abs(cp.x), cp.y), vec2(0.125, 1.312), vec2(0.058, 0.056));
            cloth *= 1.0 - (pocket - pocketInner) * front * 0.35;
            float seam = (1.0 - smoothstep(0.002, 0.006, abs(cp.x))) * shirt * front;
            cloth *= 1.0 - seam * 0.3;
            float belt = (1.0 - smoothstep(0.018, 0.025, abs(cp.y - 0.965)));
            cloth = mix(cloth, vec3(0.028, 0.024, 0.02), belt * 0.8);
            if (npcUniform > 0.5 && npcUniform < 1.5) {
                float badge = clothingRect(cp.xy, vec2(0.12, 1.395), vec2(0.025, 0.035)) * front;
                cloth = mix(cloth, vec3(0.72, 0.53, 0.19), badge);
                float shoulder = smoothstep(1.405, 1.43, cp.y) * (1.0 - smoothstep(1.45, 1.47, cp.y));
                cloth = mix(cloth, vec3(0.12, 0.18, 0.23), shoulder);
            }
            cloth = mix(cloth, npcSkin, skin);
            cloth = mix(cloth, vec3(0.025, 0.03, 0.035) * fabric, shoe);
            diffuseColor.rgb *= cloth;
        `);
    };
}
