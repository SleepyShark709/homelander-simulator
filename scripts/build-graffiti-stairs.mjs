/** CPU-only import with Three's official FBXLoader/GLTFExporter. No renderer. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as T from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGroups, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(root, '.asset-source/graffiti-stairs/fbx-2k/GraffitiStairs_2K_FBX');
const output = path.join(root, '.artifacts/graffiti-stairs/raw');
fs.mkdirSync(output, { recursive: true });
// The exporter needs FileReader for Blob buffers, even when no images are used.
globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
        blob.arrayBuffer().then(value => { this.result = value; this.onloadend(); });
    }
};
// Imported cameras are discarded; their aspect calculation still needs a size.
globalThis.window = { innerWidth: 1600, innerHeight: 1000 };
const manager = new T.LoadingManager();
manager.addHandler(/\.(png|jpe?g)$/i, {
    path: '',
    setPath(value) { this.path = value; return this; },
    load(file) {
        // Record image provenance without decoding ~10 GiB of source maps.
        const texture = new T.Texture();
        texture.userData.sourceFile = file.replaceAll('\\', '/').split('/').pop();
        return texture;
    },
});
const warnings = new Map(), warn = console.warn;
console.warn = (...args) => {
    const message = args.join(' ');
    warnings.set(message, (warnings.get(message) ?? 0) + 1);
};
const bytes = fs.readFileSync(path.join(source, 'GraffitiStairs_2K.fbx'));
const scene = new FBXLoader(manager).parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '',
);
console.warn = warn;
scene.scale.setScalar(scene.userData.unitScaleFactor / 100);
// Preserve the author's arrangement; place the lower street at the game spawn.
scene.position.z = 20;
scene.name = 'Graffiti Stairs — local asset trial';
scene.userData = { graffitiStairs: true, sourceAuthor: 'Bala', units: 'metres', streetOffset: [0, 0, 20] };
const removed = [], materials = new Map(), maps = [];
const geometries = new Map();
let meshes = 0, triangles = 0;
scene.traverse(object => {
    if (object.isCamera || object.isLight) removed.push(object);
    if (!object.isMesh) return;
    meshes++;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    if (!geometries.has(object.geometry.uuid)) {
        // FBX contains a separate draw group for thousands of individual faces.
        // Merge equal complete vertex records, then coalesce groups per material.
        const geometry = mergeVertices(object.geometry, 1e-7);
        if (geometry.groups.length) mergeGroups(geometry);
        geometries.set(object.geometry.uuid, geometry);
    }
    object.geometry = geometries.get(object.geometry.uuid);
    object.material = [].concat(object.material).map(original => {
        if (materials.has(original.uuid)) return materials.get(original.uuid);
        const albedo = original.map?.userData.sourceFile;
        if (!albedo) {
            if (original.name !== 'Window_Glass') throw new Error(`Missing baked albedo: ${original.name}`);
            // Reverse Blender FBX's shininess = ((1 - roughness) * 10)^2.
            // GLTFExporter otherwise defaults legacy Phong glass to roughness 1.
            maps.push({ name: original.name, untextured: true, opacity: original.opacity,
                roughness: 1 - Math.sqrt(T.MathUtils.clamp(original.shininess, 0, 100)) / 10 });
            materials.set(original.uuid, original);
            return original;
        }
        const material = new T.MeshStandardMaterial({
            name: original.name, color: 0xffffff,
            roughness: 1, metalness: 1,
            opacity: original.opacity, transparent: original.transparent,
            side: original.side,
        });
        // Baked albedo already contains the original material colour; FBX's
        // legacy 0.8 diffuse fallback must not tint it a second time.
        maps.push({ name: material.name, albedo, normal: original.normalMap?.userData.sourceFile,
            offset: original.map.offset.toArray(), repeat: original.map.repeat.toArray(),
            legacyDiffuse: original.color.toArray() });
        materials.set(original.uuid, material);
        return material;
    });
});
removed.forEach(object => object.removeFromParent());
scene.updateMatrixWorld(true);
const bounds = new T.Box3().setFromObject(scene);
const glb = await new GLTFExporter().parseAsync(scene, {
    binary: true, animations: [], onlyVisible: true,
    copyright: 'Bala — Graffiti Stairs. User-approved local evaluation; not a CC0 redistribution.',
});
fs.writeFileSync(path.join(output, 'geometry.glb'), Buffer.from(glb));
fs.writeFileSync(path.join(output, 'materials.json'), JSON.stringify(maps, null, 2) + '\n');
const report = { tool: `Three.js r${T.REVISION} FBXLoader / GLTFExporter`,
    sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    meshes, triangles, materials: materials.size, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    removedCamerasAndLights: removed.length, warnings: Object.fromEntries(warnings),
    geometryBytes: glb.byteLength, transform: { unitScale: scene.scale.x, translation: scene.position.toArray() } };
fs.writeFileSync(path.join(output, 'build.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
