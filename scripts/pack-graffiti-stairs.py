"""Rebuild the approved local trial's baked PBR and GPU-compressed textures."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import hashlib
import json
import os
import shutil
import struct
import subprocess
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / '.artifacts/graffiti-stairs'
RAW = ART / 'raw'
ENCODED = ART / 'encoded'
RUNTIME = ART / 'runtime'
SOURCE = ROOT / '.asset-source/graffiti-stairs/fbx-2k/GraffitiStairs_2K_FBX/textures'
TOKTX = ROOT / '.artifacts/tools/ktx-4.4.2/runtime/bin/toktx'
CLI = ['npx', '--yes', '@gltf-transform/cli@4.5.1']
os.nice(15)
ENCODED.mkdir(parents=True, exist_ok=True)
RUNTIME.mkdir(parents=True, exist_ok=True)
assert TOKTX.is_file(), 'Extract the pinned official KTX 4.4.2 tools first'
assert 'v4.4.2' in subprocess.check_output([str(TOKTX), '--version'], text=True, stderr=subprocess.STDOUT)

# Geometry was indexed and its FBX draw groups coalesced by the official Three
# utilities. Attach distinct maps before the CLI's automatic material dedup.
data = (RAW / 'geometry.glb').read_bytes()
json_length = struct.unpack_from('<I', data, 12)[0]
model = json.loads(data[20:20 + json_length])
assert all('TANGENT' not in p['attributes'] for m in model['meshes'] for p in m['primitives'])
bin_offset = 20 + json_length
bin_length, bin_type = struct.unpack_from('<II', data, bin_offset)
assert bin_type == 0x004e4942
(ENCODED / 'geometry.bin').write_bytes(data[bin_offset + 8:bin_offset + 8 + bin_length])
model['buffers'][0]['uri'] = 'geometry.bin'
records = {m['name']: m for m in json.loads((RAW / 'materials.json').read_text())}
by_stem = {p.stem: p for p in SOURCE.iterdir() if p.suffix.lower() in ('.jpg', '.png')}
jobs = []
model['images'] = []
model['textures'] = []
model['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]

def texture(role, inputs):
    number = len(jobs)
    name = f'texture-{number:03d}-{role}.ktx2'
    model['images'].append({'uri': name, 'mimeType': 'image/ktx2'})
    model['textures'].append({'sampler': 0, 'extensions': {'KHR_texture_basisu': {'source': number}}})
    jobs.append((role, inputs, name))
    return {'index': number}

for material in model['materials']:
    record = records[material['name']]
    if record.get('untextured'):
        material['pbrMetallicRoughness']['roughnessFactor'] = record['roughness']
        continue
    assert record['repeat'] == [1, 1] and record['offset'] == [0, 0], record['name']
    albedo = SOURCE / record['albedo']
    prefix = albedo.stem.replace('_Albedo', '_{}')
    normal = by_stem[prefix.format('Normal')]
    roughness = by_stem[prefix.format('Roughness')]
    # Twenty authored staircase tiles omit an all-zero metallic image.
    metallic = by_stem.get(prefix.format('Metallic'))
    assert metallic is not None or prefix.startswith('Staircase_Mesh_'), record['name']
    ao = by_stem[prefix.format('AO')]
    pbr = material['pbrMetallicRoughness']
    pbr['baseColorFactor'] = [1, 1, 1, 1]
    pbr['baseColorTexture'] = texture('color', [albedo])
    material['normalTexture'] = texture('normal', [normal])
    packed = texture('orm', [ao, roughness, metallic])
    pbr['metallicRoughnessTexture'] = packed
    pbr['metallicFactor'] = pbr['roughnessFactor'] = 1
    # The source staircase AO contains sharp black bake silhouettes on exposed
    # walls (confirmed in the original JPGs and in-game channel isolation).
    # Keep the authored colour/normal/roughness; use the game's contact AO here.
    if not prefix.startswith('Staircase_Mesh_'):
        material['occlusionTexture'] = {**packed, 'strength': 1}
for key in ('extensionsUsed', 'extensionsRequired'):
    model.setdefault(key, [])
    if 'KHR_texture_basisu' not in model[key]:
        model[key].append('KHR_texture_basisu')
(ENCODED / 'scene.gltf').write_text(json.dumps(model, separators=(',', ':')))

def encode(job):
    role, inputs, name = job
    destination = ENCODED / name
    stamp = destination.with_suffix('.json')
    digest = hashlib.sha256(b'graffiti-pbr-uastc-q2-zstd6-v2')
    if role == 'normal':
        digest.update(b'no-tangent glTF green-channel inversion v1')
    for p in inputs:
        digest.update(p.read_bytes() if p else b'constant nonmetallic 0')
    source_hash = digest.hexdigest()
    if destination.exists() and stamp.exists() and json.loads(stamp.read_text())['inputSha256'] == source_hash:
        return json.loads(stamp.read_text())
    images = []
    try:
        for p in inputs:
            images.append(Image.open(p).convert('RGB') if p else Image.new('RGB', images[0].size, 0))
        if role == 'orm':
            assert len({im.size for im in images}) == 1, name
            image = Image.merge('RGB', tuple(im.getchannel('R') for im in images))
        else:
            image = images[0].copy()
        if role == 'normal':
            # Match GLTFExporter's normal conversion for geometry without
            # explicit tangents; GLTFLoader negates normalScale.y on import.
            red, green, blue = image.split()
            image = Image.merge('RGB', (red, green.point(lambda g: 255 - g), blue))
        # Reproduce the official exporter's texture.flipY behaviour while
        # keeping FBX UVs and their tangent basis unchanged.
        image = image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        png = destination.with_suffix('.png')
        image.save(png)
        result = subprocess.run([str(TOKTX), '--t2', '--genmipmap', '--upper_left_maps_to_s0t0',
            '--assign_oetf', 'srgb' if role == 'color' else 'linear',
            '--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '6', '--threads', '1',
            str(destination), str(png)], text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError(f'{name}: {result.stderr[-1500:]}')
        png.unlink()
        content = destination.read_bytes()
        assert content[:12] == b'\xabKTX 20\xbb\r\n\x1a\n'
        width, height = struct.unpack_from('<II', content, 20)
        assert (width, height) == image.size
        report = {'file': name, 'role': role, 'inputs': [p.name if p else 'constant metallic 0' for p in inputs],
                  'inputSha256': source_hash, 'width': width, 'height': height,
                  'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()}
        stamp.write_text(json.dumps(report, indent=2) + '\n')
        return report
    finally:
        for im in images:
            im.close()

results = []
with ThreadPoolExecutor(max_workers=6) as pool:
    futures = [pool.submit(encode, job) for job in jobs]
    for future in as_completed(futures):
        results.append(future.result())
        if len(results) % 24 == 0 or len(results) == len(jobs):
            print(json.dumps({'encoded': len(results), 'textures': len(jobs)}), flush=True)

with (ART / 'quantize.log').open('w') as log:
    subprocess.run(CLI + ['quantize', str(ENCODED / 'scene.gltf'), str(RUNTIME / 'scene.gltf'),
        '--quantize-position', '16', '--quantize-normal', '16', '--quantize-texcoord', '16'],
        check=True, stdout=log, stderr=subprocess.STDOUT)
shutil.copy2(SOURCE / 'urban_alley_01_1k.hdr', RUNTIME / 'environment.hdr')
basis = ROOT / 'node_modules/three/examples/jsm/libs/basis'
(RUNTIME / 'basis').mkdir(exist_ok=True)
for name in ['basis_transcoder.js', 'basis_transcoder.wasm', 'README.md']:
    shutil.copy2(basis / name, RUNTIME / 'basis' / name)
shutil.copy2(SOURCE.parent / 'README.txt', RUNTIME / 'SOURCE-README.txt')
report = {**json.loads((RAW / 'build.json').read_text()),
          'packing': {'geometryTool': '@gltf-transform/cli@4.5.1', 'textureTool': 'KTX-Software 4.4.2',
                      'codec': 'UASTC quality 2 + lossless Zstd 6; full source dimensions',
                      'packedORM': 'R=AO, G=roughness, B=metallic', 'imageFlipY': True,
                      'normalGreenInverted': True,
                      'staircaseAO': 'Source JPG bake silhouettes excluded; runtime contact AO retained'},
          'textures': sorted(results, key=lambda r: r['file']),
          'runtimeBytes': sum(p.stat().st_size for p in RUNTIME.rglob('*') if p.is_file()),
          'scope': 'Local trial only; not approved for public source/model redistribution'}
(RUNTIME / 'build.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'runtimeBytes': report['runtimeBytes'], 'textures': len(results)}), flush=True)
