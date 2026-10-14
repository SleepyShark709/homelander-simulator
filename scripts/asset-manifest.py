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
    'human': {'author': 'Mesh2Motion / contributors', 'url': 'https://github.com/Mesh2Motion/mesh2motion-app', 'license': 'CC0-1.0', 'licenseFile': 'licenses/mesh2motion-cc0.txt', 'motionLicenseFile': 'licenses/mesh2motion-cc0.txt', 'pipeline': ['scripts/pack-native-character.mjs'], 'sourceRepository': 'https://github.com/Mesh2Motion/mesh2motion-app', 'motionRepository': 'https://github.com/Mesh2Motion/mesh2motion-app'},
}
polyhaven = {
    'worn_asphalt': 'Amal Kumar', 'concrete_pavement': 'Charlotte Baglioni',
    'brick_wall_003': 'Dimitrios Savva (Photography), Rob Tuytel (Processing)',
    'urban_street_03': 'Andreas Mischok', 'street_lamp_01': 'Josh Dean',
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

entries = []
for p in sorted(assets.rglob('*')):
    if p.suffix.lower() not in ('.glb', '.gltf', '.bin', '.png', '.jpg', '.hdr'):
        continue
    rel = p.relative_to(assets)
    data = p.read_bytes()
    entry = {'path': str(rel), 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'retainedReference': rel.parts[0] in ('characters', 'city', 'cars')}
    if rel.parts[0] in sources:
        entry.update(sources[rel.parts[0]])
        if rel.parts[0] == 'human' and p.suffix != '.glb':
            entry['license'] = 'CC0-1.0'
            entry.pop('motionLicenseFile')
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
