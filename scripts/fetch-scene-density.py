"""Fetch only the three approved CC0 scene packs; retain reproducible inputs."""
from pathlib import Path
import concurrent.futures
import hashlib
import http.cookiejar
import json
import re
import shutil
import subprocess
import urllib.parse
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / '.asset-source/scene-density'
AGENT = 'Homelander-scene-density/1.0 (local asset preparation)'


def download(url, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['curl', '-fLsS', '--retry', '3', '--max-time', '300', '-A', AGENT,
                    url, '-o', str(path)], check=True)


def record(path, url):
    data = path.read_bytes()
    return {'file': str(path.relative_to(ROOT)), 'source': url, 'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest()}


def quaternius():
    folder = DEST / 'quaternius'
    archive = folder / 'Downtown City MegaKit[Standard].zip'
    base = 'https://quaternius.itch.io/downtown-city-megakit'
    if not archive.exists():
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        opener.addheaders = [('User-Agent', AGENT)]
        def csrf(html):
            return re.search(r'<meta name="csrf_token" value="([^"]+)"', html).group(1)
        token = csrf(opener.open(base + '/purchase?popup=1').read().decode())
        data = urllib.parse.urlencode({'csrf_token': token}).encode()
        page = json.load(opener.open(base + '/download_url', data))['url']
        token = csrf(opener.open(page).read().decode())
        data = urllib.parse.urlencode({'csrf_token': token}).encode()
        url = json.load(opener.open(base + '/file/17615373?source=game_download', data))['url']
        download(url, archive)
    with zipfile.ZipFile(archive) as package:
        names = package.namelist()
        for name in names:
            if name.endswith('/'): continue
            if '/Exports/glTF (Godot)/' not in '/' + name and not name.endswith('License_Standard.txt'):
                continue
            relative = name.split('Exports/glTF (Godot)/')[-1] if 'Exports/glTF (Godot)/' in name else 'License_Standard.txt'
            path = folder / 'input' / relative
            if '..' in Path(relative).parts: raise ValueError(relative)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(package.read(name))
        (folder / 'archive-list.json').write_text(json.dumps(names, indent=2) + '\n')
    license_path = folder / 'input/License_Standard.txt'
    assert 'CC0' in license_path.read_text(), 'Unexpected Standard license'
    shutil.copy(license_path, ROOT / 'public/assets/licenses/quaternius-downtown-cc0.txt')
    files = [record(p, base) for p in sorted((folder / 'input').rglob('*')) if p.is_file()]
    print('A01:', len(files), 'retained inputs', flush=True)
    return {'id': 'A01', 'author': 'Quaternius', 'source': base, 'license': 'CC0-1.0',
            'uploadId': 17615373, 'uploaded': '2026-05-20', 'archive': record(archive, base), 'files': files}


def polyhaven(name, asset_id):
    folder = DEST / name
    for endpoint in ['files', 'info']:
        path = folder / (endpoint + '.json')
        if not path.exists(): download('https://api.polyhaven.com/' + endpoint + '/' + name, path)
    metadata = json.loads((folder / 'files.json').read_text())
    files = []
    for kind in ['gltf', 'blend']:
        variant = metadata[kind]['1k'][kind]
        items = {Path(urllib.parse.urlparse(variant['url']).path).name: variant, **variant['include']}
        for relative, item in items.items():
            if '..' in Path(relative).parts or Path(relative).is_absolute(): raise ValueError(relative)
            path = folder / kind / relative
            if not path.exists() or hashlib.md5(path.read_bytes()).hexdigest() != item['md5']:
                download(item['url'], path)
            assert hashlib.md5(path.read_bytes()).hexdigest() == item['md5'], path
            files.append({**record(path, 'https://polyhaven.com/a/' + name), 'downloadUrl': item['url'], 'md5': item['md5']})
    info = json.loads((folder / 'info.json').read_text())
    print(asset_id, name, len(files), 'inputs', flush=True)
    return {'id': asset_id, 'author': info['authors'], 'source': 'https://polyhaven.com/a/' + name,
            'license': 'CC0-1.0', 'licenseSource': 'https://polyhaven.com/license', 'files': files}


if __name__ == '__main__':
    DEST.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(quaternius), pool.submit(polyhaven, 'exterior_aircon_unit', 'A04'),
                   pool.submit(polyhaven, 'modular_street_seating', 'A05')]
        records = [future.result() for future in futures]
    (DEST / 'provenance.json').write_text(json.dumps({'retrieved': '2026-10-21', 'assets': records}, indent=2) + '\n')
