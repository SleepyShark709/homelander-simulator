"""Verify every shipped model dependency and inventory local media with provenance."""
from pathlib import Path
import hashlib, json, struct
from datetime import date

root = Path(__file__).resolve().parents[1]
assets = root / 'public/assets'
sources = {
    'characters': {'author': 'Kenney', 'url': 'https://kenney.nl/assets/blocky-characters', 'license': 'CC0-1.0', 'licenseFile': 'licenses/kenney-characters.txt'},
    'city': {'author': 'Kenney', 'url': 'https://kenney.nl/assets/city-kit-commercial', 'license': 'CC0-1.0', 'licenseFile': 'licenses/kenney-city.txt'},
    'cars': {'author': 'Kenney', 'url': 'https://kenney.nl/assets/car-kit', 'license': 'CC0-1.0', 'licenseFile': 'licenses/kenney-cars.txt'},
    'jiangwan': {'author': 'Project original environment / user supplied Tripo vehicles', 'license': 'Project original / user supplied; no third-party redistribution license asserted', 'licenseFile': 'licenses/jiangwan-source.txt', 'pipeline': ['scripts/build-jiangwan.py']},
    'human': {'author': 'Mesh2Motion / contributors', 'url': 'https://github.com/Mesh2Motion/mesh2motion-app', 'license': 'CC0-1.0', 'licenseFile': 'licenses/mesh2motion-cc0.txt', 'motionLicenseFile': 'licenses/mesh2motion-cc0.txt', 'pipeline': ['scripts/pack-native-character.mjs'], 'sourceRepository': 'https://github.com/Mesh2Motion/mesh2motion-app', 'motionRepository': 'https://github.com/Mesh2Motion/mesh2motion-app'},
}
polyhaven = {
    'worn_asphalt': 'Amal Kumar', 'concrete_pavement': 'Charlotte Baglioni',
    'brick_wall_003': 'Dimitrios Savva (Photography), Rob Tuytel (Processing)',
    'urban_street_03': 'Andreas Mischok', 'street_lamp_01': 'Josh Dean',
    'concrete_wall_006': 'Charlotte Baglioni (Photography), Dario Barresi (Processing)',
    'stone_tiles_02': 'Charlotte Baglioni', 'rectangular_facade_tiles': 'Charlotte Baglioni',
    'asphalt_05': 'Amal Kumar',
    'outdoor_table_chair_set_01': 'James Ray Cock', 'potted_plant_02': 'Rico Cilliers',
    'drawer_cabinet': 'Ulan Cabanilla', 'rollershutter_door': 'MP',
    'bark_brown_02': 'Rob Tuytel',
}
source_records = {}
record_path = root / '.asset-source/quality-downloads.json'
if record_path.exists():
    records = json.loads(record_path.read_text())
    for record in records:
        path = root / record['file']
        data = path.read_bytes()
        assert len(data) == record['bytes'] and hashlib.sha256(data).hexdigest() == record['sha256'], path
        if record['file'].startswith('public/assets/'):
            source_records[record['file'].removeprefix('public/assets/')] = record
else:
    for record in json.loads((assets / 'quality-sources.json').read_text()):
        source_records[record['file'].removeprefix('public/assets/')] = record

detail_sources = assets / 'city-details/sources.json'
if detail_sources.exists():
    for asset in json.loads(detail_sources.read_text()):
        for record in asset['files']:
            source_records[record['file']] = {**record, 'file': 'public/assets/' + record['file'],
                'source': asset['source'], 'license': asset['license']}

entries = []
for p in sorted(assets.rglob('*')):
    if p.suffix.lower() not in ('.glb', '.gltf', '.bin', '.png', '.jpg', '.hdr'):
        continue
    rel = p.relative_to(assets)
    data = p.read_bytes()
    entry = {'path': str(rel), 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'retainedReference': rel.parts[0] in ('characters', 'city', 'cars')}
    if rel.parts[0] in sources:
        entry.update(sources[rel.parts[0]])
        if str(rel) == 'human/homelander.glb':
            entry.update(author='User supplied Tripo model; Adobe Mixamo and Mesh2Motion motions',
                url='https://www.tripo3d.ai/', license='User supplied model / mixed motion licenses',
                licenseFile='licenses/homelander-source.txt', motionLicenseFile='licenses/homelander-source.txt',
                pipeline=['scripts/adapt-homelander.py', 'scripts/pack-homelander.mjs'])
            entry.pop('sourceRepository')
            entry.pop('motionRepository')
        if rel.parts[0] == 'human' and p.suffix != '.glb':
            entry['license'] = 'CC0-1.0'
            entry.pop('motionLicenseFile')
    elif rel.parts[0] == 'foliage':
        provenance = json.loads((assets / 'foliage/provenance.json').read_text())
        assert entry['sha256'] == provenance['sha256'], p
        entry.update(author='Project / OpenAI built-in image_gen', license='AI-generated project asset',
                     licenseFile='foliage/provenance.json', provenanceFile='foliage/provenance.json')
    else:
        record = source_records[str(rel)]
        assert hashlib.sha256(data).hexdigest() == record['sha256'], p
        name = record['source'].rsplit('/', 1)[-1]
        entry.update(author=polyhaven[name], url=record['source'], downloadUrl=record['url'], license='CC0-1.0', licenseFile='licenses/polyhaven.txt')
    if p.suffix in ('.glb', '.gltf'):
        if p.suffix == '.glb':
            assert data[:4] == b'glTF'
            model = json.loads(data[20:20 + struct.unpack_from('<I', data, 12)[0]])
        else:
            model = json.loads(data)
        dependencies = [item['uri'] for item in model.get('images', []) + model.get('buffers', []) if 'uri' in item]
        for uri in dependencies:
            assert not uri.startswith(('http:', 'https:', 'data:')) and (p.parent / uri).is_file(), (p, uri)
        entry.update(animations=[a['name'] for a in model.get('animations', [])], dependencies=dependencies)
        if rel.parts[0] == 'human':
            entry['motionSources'] = model['extras']['locomotion']
            entry['animationSource'] = model['extras']['animationSource']
            entry['clipSources'] = {a['name']: a['extras'] for a in model['animations']}
    entries.append(entry)
(assets / 'quality-sources.json').write_text(json.dumps(list(source_records.values()), indent=2) + '\n')
(assets / 'manifest.json').write_text(json.dumps({'generated': date.today().isoformat(), 'assets': entries}, indent=2) + '\n')
print(f'{len(entries)} shipped media files: dependencies and SHA-256 verified')
