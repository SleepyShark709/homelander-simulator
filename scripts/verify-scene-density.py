"""Compare every packed vertex/normal and embedded texture against Blender output."""
from pathlib import Path
import hashlib
import json
import struct
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.artifacts/scene-density'


def load(path):
    data=path.read_bytes();length=struct.unpack_from('<I',data,12)[0]
    model=json.loads(data[20:20+length]);binary=data[28+length:]
    def accessor(index):
        a=model['accessors'][index];v=model['bufferViews'][a['bufferView']]
        dtype=np.dtype({5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']])
        count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        arr=np.ndarray((a['count'],count),dtype=dtype,buffer=binary,
            offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dtype.itemsize*count),dtype.itemsize)).astype(np.float64)
        if a.get('normalized'):
            arr/=np.iinfo(dtype).max
            if np.issubdtype(dtype,np.signedinteger): arr=np.maximum(arr,-1)
        return arr
    nodes={}
    def visit(index,parent):
        n=model['nodes'][index]
        if 'matrix' in n: local=np.array(n['matrix']).reshape(4,4).T
        else:
            x,y,z,w=n.get('rotation',[0,0,0,1]);local=np.eye(4)
            local[:3,:3]=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                         [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                         [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]
            local[:3,:3]@=np.diag(n.get('scale',[1,1,1]))
            local[:3,3]=n.get('translation',[0,0,0])
        world=parent@local;nodes[n['name']]=(n,world)
        for child in n.get('children',[]): visit(child,world)
    for index in model['scenes'][model['scene']]['nodes']: visit(index,np.eye(4))
    images=[]
    for image in model.get('images',[]):
        v=model['bufferViews'][image['bufferView']];offset=v.get('byteOffset',0)
        images.append(hashlib.sha256(binary[offset:offset+v['byteLength']]).hexdigest())
    return model,nodes,accessor,images


a,an,aa,ai=load(OUT/'street-sample-unquantized.glb')
b,bn,ba,bi=load(ROOT/'public/assets/scene-density/street-sample.glb')
positions=[];normal_errors=[];vertices=0
for name,(node,world) in an.items():
    packed,transform=bn[name]
    assert node.get('extras')==packed.get('extras'), name+' extras changed'
    if 'mesh' not in node: continue
    for source,target in zip(a['meshes'][node['mesh']]['primitives'],b['meshes'][packed['mesh']]['primitives']):
        p=aa(source['attributes']['POSITION']);q=ba(target['attributes']['POSITION'])
        assert p.shape==q.shape,(name,p.shape,q.shape)
        vertices+=len(p)
        p=np.c_[p,np.ones(len(p))]@world.T;q=np.c_[q,np.ones(len(q))]@transform.T
        positions.append(float(np.linalg.norm(p[:,:3]-q[:,:3],axis=1).max()))
        if 'NORMAL' in source['attributes']:
            n=aa(source['attributes']['NORMAL']);m=ba(target['attributes']['NORMAL'])
            normal_errors.append(float(np.linalg.norm(n-m,axis=1).max()))
assert sorted(ai)==sorted(bi),'Embedded texture bytes changed'
report={'verticesCompared':vertices,'maxPositionErrorMetres':max(positions),'maxNormalVectorError':max(normal_errors),
        'identicalTextureBytes':len(ai),'extrasPreserved':True,'positionToleranceMetres':.003,'normalTolerance':.0001}
(OUT/'quantization.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
assert max(positions)<.003 and max(normal_errors)<.0001,report
