import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Keep real geometry, skin and clips; CPU tests do not decode PBR images.
export async function loadModel(path: string) {
    const bytes = readFileSync(path);
    const length = bytes.readUInt32LE(12), doc = JSON.parse(bytes.subarray(20, 20 + length).toString());
    delete doc.images; delete doc.textures; delete doc.materials;
    for (const mesh of doc.meshes) for (const primitive of mesh.primitives) delete primitive.material;
    const data = Buffer.from(JSON.stringify(doc));
    const json = Buffer.concat([data, Buffer.alloc((4 - data.length % 4) % 4, 32)]);
    const binary = bytes.subarray(28 + length), packed = Buffer.alloc(28 + json.length + binary.length);
    packed.write('glTF'); packed.writeUInt32LE(2, 4); packed.writeUInt32LE(packed.length, 8);
    packed.writeUInt32LE(json.length, 12); packed.write('JSON', 16); json.copy(packed, 20);
    packed.writeUInt32LE(binary.length, 20 + json.length); packed.write('BIN\0', 24 + json.length);
    binary.copy(packed, 28 + json.length);
    return new GLTFLoader().parseAsync(packed.buffer as ArrayBuffer, '');
}
