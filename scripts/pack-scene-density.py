"""Pin glTF Transform 4.5.1 quantization; preserve the full Blender mesh/PNG maps."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]
folder=ROOT/'public/assets/scene-density'
build=json.loads((folder/'build.json').read_text())
if 'quantization' in build:
    print('Already packed; rebuild with Blender to change inputs.')
    raise SystemExit(0)
raw=folder/'street-sample.glb'
artifacts=ROOT/'.artifacts/scene-density'
artifacts.mkdir(parents=True,exist_ok=True)
shutil.copy2(raw,artifacts/'street-sample-unquantized.glb')
output=artifacts/'street-sample-quantized.glb'
subprocess.run(['npx','--yes','@gltf-transform/cli@4.5.1','quantize',str(raw),str(output),
    '--quantize-position','16','--quantize-normal','16','--quantize-texcoord','16',
    '--quantize-color','8','--quantize-generic','16'],check=True)
data=output.read_bytes()
assert len(data)<32_000_000, 'Packed street sample exceeds 32 MB'
build['quantization']={'tool':'@gltf-transform/cli@4.5.1','positionBits':16,'normalBits':16,
    'texcoordBits':16,'colorBits':8,'source':build['street-sample']}
shutil.copy2(output,raw)
build['street-sample']={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
(folder/'build.json').write_text(json.dumps(build,indent=2)+'\n')
print(json.dumps(build['street-sample']))
