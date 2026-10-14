"""Fetch pinned CC0 Mesh2Motion inputs; runtime assets are always local."""
from pathlib import Path
import subprocess, hashlib, json

root = Path(__file__).resolve().parents[1]
commit = (root/'scripts/vendor/mesh2motion/UPSTREAM_COMMIT').read_text().strip()
folder = root/'.asset-source/mesh2motion'
folder.mkdir(parents=True, exist_ok=True)
files = ['static/rigs/rig-human.glb', 'static/animations/human-base-animations.glb',
         'static/animations/human-addon-animations.glb', 'static/models/model-human.glb',
         'LICENSE-CC0.MD', 'LICENSE-MIT.MD']
records = []
for name in files:
    url = f'https://raw.githubusercontent.com/Mesh2Motion/mesh2motion-app/{commit}/{name}'
    path = folder/Path(name).name
    subprocess.run(['curl','-fsSL','--max-time','30',url,'-o',str(path)],check=True)
    data = path.read_bytes()
    records.append({'file':str(path.relative_to(root)), 'url':url, 'bytes':len(data),
                    'sha256':hashlib.sha256(data).hexdigest()})
(folder/'provenance.json').write_text(json.dumps({'commit':commit, 'artLicense':'CC0-1.0',
                                              'codeLicense':'MIT', 'sources':records},indent=2)+'\n')
print(f'{len(records)} pinned Mesh2Motion inputs downloaded and hashed')
