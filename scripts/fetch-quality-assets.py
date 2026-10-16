"""Fetch pinned, local PBR and original motion data; preserve source hashes."""
from pathlib import Path
import concurrent.futures, subprocess, json, hashlib

ROOT = Path(__file__).resolve().parents[1]
jobs = []
for name, stem in [('worn_asphalt', 'diff'), ('concrete_pavement', 'diff'), ('brick_wall_003', 'diffuse'),
                   ('concrete_wall_006', 'diff'), ('stone_tiles_02', 'diff'),
                   ('rectangular_facade_tiles', 'diff'), ('asphalt_05', 'diff')]:
    for channel, resolution in [(stem, '2k'), ('nor_gl', '1k'), ('rough', '1k'), ('ao', '1k')]:
        filename = f'{name}_{channel}_{resolution}.jpg'
        jobs.append((f'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/{resolution}/{name}/{filename}',
                     f'public/assets/pbr/{name}/{filename}', 'CC0', f'https://polyhaven.com/a/{name}'))
jobs.append(('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/urban_street_03_1k.hdr',
             'public/assets/pbr/urban_street_03_1k.hdr', 'CC0', 'https://polyhaven.com/a/urban_street_03'))
for subject, trial in [('07', '04'), ('09', '01'), ('35', '24')]:
    for filename in [f'{subject}.asf', f'{subject}_{trial}.amc']:
        jobs.append((f'https://mocap.cs.cmu.edu/subjects/{subject}/{filename}',
                     f'.asset-source/mocap/{filename}', 'CMU motion data terms', 'https://mocap.cs.cmu.edu/'))
lamp_url = 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/street_lamp_01/'
for filename in ['street_lamp_01_1k.gltf', 'street_lamp_01.bin',
                 'textures/street_lamp_01_nor_gl_1k.jpg', 'textures/street_lamp_01_diff_1k.jpg',
                 'textures/street_lamp_01_arm_1k.jpg']:
    url = lamp_url+filename
    if filename == 'street_lamp_01.bin': url = lamp_url.replace('/1k/', '/8k/')+filename
    if filename.startswith('textures/'):
        url = 'https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/street_lamp_01/'+filename.split('/')[-1]
    jobs.append((url, 'public/assets/street-lamp/'+filename,
                 'CC0', 'https://polyhaven.com/a/street_lamp_01'))

def download(job):
    url, filename, license, source = job
    path = ROOT / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.stat().st_size == 0:
        tmp = path.with_suffix(path.suffix + '.download')
        subprocess.run(['curl', '-fLsS', '--retry', '2', '--max-time', '120', url, '-o', str(tmp)], check=True)
        tmp.replace(path)
    data = path.read_bytes()
    print(path.name, len(data), flush=True)
    return {'file': filename, 'url': url, 'source': source, 'license': license,
            'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    records = list(pool.map(download, jobs))
(ROOT / '.asset-source/quality-downloads.json').write_text(json.dumps(records, indent=2))
