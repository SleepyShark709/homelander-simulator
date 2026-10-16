"""Download the selected CC0 city props with pinned hashes and local dependencies."""
from pathlib import Path
from urllib.parse import urlparse
import concurrent.futures
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/assets/city-details'
NAMES = ['outdoor_table_chair_set_01', 'potted_plant_02', 'drawer_cabinet', 'rollershutter_door']
AGENT = 'Homelander-local-asset-preparation/1.0'


def request(url, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['curl', '-fLsS', '--retry', '2', '--max-time', '120', '-A', AGENT, url, '-o', str(path)], check=True)


def fetch(name):
    folder = DEST / name
    folder.mkdir(parents=True, exist_ok=True)
    description = folder / 'source-files.json'
    if not description.exists():
        request('https://api.polyhaven.com/files/' + name, description)
    variant = json.loads(description.read_text())['gltf']['2k']['gltf']
    files = {Path(urlparse(variant['url']).path).name: variant, **variant['include']}
    records = []
    for relative, metadata in files.items():
        if '..' in Path(relative).parts or Path(relative).is_absolute():
            raise ValueError('Unexpected asset path')
        path = folder / relative
        if not path.exists() or hashlib.md5(path.read_bytes()).hexdigest() != metadata['md5']:
            request(metadata['url'], path)
        data = path.read_bytes()
        if hashlib.md5(data).hexdigest() != metadata['md5']:
            raise ValueError('Downloaded asset checksum mismatch: ' + str(path))
        records.append({'file': str(path.relative_to(ROOT / 'public/assets')), 'url': metadata['url'],
                        'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    print(name, sum(r['bytes'] for r in records), flush=True)
    return {'asset': name, 'source': 'https://polyhaven.com/a/' + name,
            'license': 'CC0-1.0', 'licenseSource': 'https://polyhaven.com/license', 'files': records}


def fetch_bark():
    name = 'bark_brown_02'
    folder = ROOT / 'public/assets/pbr' / name
    description = folder / 'source-files.json'
    if not description.exists():
        request('https://api.polyhaven.com/files/' + name, description)
    variants = json.loads(description.read_text())
    records = []
    for channel in ['Diffuse', 'nor_gl', 'Rough', 'AO']:
        metadata = variants[channel]['1k']['jpg']
        path = folder / Path(urlparse(metadata['url']).path).name
        if not path.exists() or hashlib.md5(path.read_bytes()).hexdigest() != metadata['md5']:
            request(metadata['url'], path)
        data = path.read_bytes()
        if hashlib.md5(data).hexdigest() != metadata['md5']:
            raise ValueError('Downloaded bark checksum mismatch: ' + str(path))
        records.append({'file': str(path.relative_to(ROOT / 'public/assets')), 'url': metadata['url'],
                        'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    print(name, sum(r['bytes'] for r in records), flush=True)
    return {'asset': name, 'source': 'https://polyhaven.com/a/' + name, 'license': 'CC0-1.0',
            'licenseSource': 'https://polyhaven.com/license', 'files': records}


with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    records = list(pool.map(fetch, NAMES))
records.append(fetch_bark())
(DEST / 'sources.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')
