"""Quantize the Blender module library; reference the existing PBR/KTX2 cache."""
from pathlib import Path
import hashlib
import json
import shutil
import struct
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT/'.artifacts/graffiti-city'
OUT = ROOT/'public/assets/graffiti-city'
OUT.mkdir(parents=True, exist_ok=True)
with (ART/'quantize.log').open('w') as log:
    subprocess.run(['npx', '--yes', '@gltf-transform/cli@4.5.1', 'quantize',
                    str(ART/'library.glb'), str(ART/'library-quantized.glb'),
                    '--quantize-position','16','--quantize-normal','16','--quantize-texcoord','16'],
                   check=True, stdout=log, stderr=subprocess.STDOUT)
data = (ART/'library-quantized.glb').read_bytes()
length = struct.unpack_from('<I',data,12)[0]
model = json.loads(data[20:20+length])
offset = 20+length
bin_length = struct.unpack_from('<I',data,offset)[0]
binary = data[offset+8:offset+8+bin_length]
assert not any('TANGENT' in p['attributes'] for m in model['meshes'] for p in m['primitives'])
source = json.loads((ROOT/'public/assets/graffiti-stairs/scene.gltf').read_text())
materials = {m['name']:m for m in source['materials']}
for i, material in enumerate(model['materials']):
    assert material['name'] in materials, material['name']
    model['materials'][i] = materials[material['name']]
model['images'] = [{**im, 'uri':'../graffiti-stairs/'+im['uri']} for im in source['images']]
model['textures'] = source['textures']
model['samplers'] = source['samplers']
# Quantized per-primitive positions can open a sub-millimetre seam at a roof
# ridge. Collision keeps Blender's original Float32 positions, independently
# of render compression; UVs/normals are unnecessary for these hidden meshes.
raw = (ART/'library.glb').read_bytes()
raw_length = struct.unpack_from('<I',raw,12)[0]
raw_model = json.loads(raw[20:20+raw_length])
raw_binary = raw[28+raw_length:28+raw_length+struct.unpack_from('<I',raw,20+raw_length)[0]]
combined = bytearray(binary)
accessors, views = {}, {}
def collision_accessor(index):
    if index in accessors:
        return accessors[index]
    original = raw_model['accessors'][index]
    view_index = original['bufferView']
    if view_index not in views:
        view = raw_model['bufferViews'][view_index]
        combined.extend(b'\x00' * (-len(combined) % 4))
        start = len(combined)
        combined.extend(raw_binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])
        views[view_index] = len(model['bufferViews'])
        model['bufferViews'].append({**view,'buffer':0,'byteOffset':start})
    accessors[index] = len(model['accessors'])
    model['accessors'].append({**original,'bufferView':views[view_index]})
    return accessors[index]
for node in model['nodes']:
    if not (node.get('name','').endswith('_Roof') or node.get('name') == 'Stair_Collision'):
        continue
    original = next(n for n in raw_model['nodes'] if n.get('name') == node['name'])
    assert not original.get('children'), original['name']
    mesh = raw_model['meshes'][original['mesh']]
    primitives = []
    for primitive in mesh['primitives']:
        assert raw_model['accessors'][primitive['attributes']['POSITION']]['componentType'] == 5126
        primitives.append({'attributes':{'POSITION':collision_accessor(primitive['attributes']['POSITION'])},
                           'indices':collision_accessor(primitive['indices'])})
    new_index = len(model['meshes'])
    model['meshes'].append({'name':mesh.get('name',node['name']),'primitives':primitives})
    node.clear();node.update({**original,'mesh':new_index})
binary = bytes(combined)
for field in ['extensionsUsed','extensionsRequired']:
    model[field] = list(dict.fromkeys(model.get(field,[])+['KHR_texture_basisu']))
model['buffers'] = [{'uri':'city.bin','byteLength':len(binary)}]
(OUT/'city.bin').write_bytes(binary)
(OUT/'city.gltf').write_text(json.dumps(model,separators=(',',':')))
layout = json.loads((ART/'layout.json').read_text())
model['extras'] = {'graffitiCity':layout}
(OUT/'city.gltf').write_text(json.dumps(model,separators=(',',':')))
shutil.copy2(ART/'layout.json',OUT/'layout.json')
shutil.copy2(ROOT/'public/assets/graffiti-stairs/SOURCE-README.txt',OUT/'SOURCE-README.txt')
report = {'librarySha256':hashlib.sha256(data).hexdigest(), 'geometryBytes':len(binary),
          'collisionPositions':'Original Blender Float32; render-only quantization',
          'rawLibrarySha256':hashlib.sha256(raw).hexdigest(),
          'geometrySha256':hashlib.sha256(binary).hexdigest(),
          'buildings':len(layout['buildings'])+5, 'sharedTextures':len(model['images']),
          'source':layout['sourceSha256'], 'blenderScriptSha256':hashlib.sha256(
              (ROOT/'scripts/build-graffiti-city.py').read_bytes()).hexdigest(),
          'scope':'Private local game; no public model redistribution confirmed'}
(OUT/'build.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
