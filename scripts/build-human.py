"""Build reproducible, clothed, skinned GLBs from official MakeHuman CC0 assets.
Builds bind-pose meshes only. Stock animation import is a separate Mesh2Motion step.
Input files and source URLs are recorded in docs/ASSETS.md. No Blender runtime required.
"""
from pathlib import Path
import json,struct,gzip,math,shutil
ROOT=Path(__file__).resolve().parents[1];SOURCE=ROOT/'.asset-source/realism';OUT=ROOT/'.asset-source/mesh2motion-input'
OUT.mkdir(parents=True,exist_ok=True)
shutil.copytree(ROOT/'public/assets/human/Textures',OUT/'Textures',dirs_exist_ok=True)

def read_obj(path):
 verts=[];uv=[];faces=[];groups={};group=''
 for line in path.read_text().splitlines():
  bits=line.split()
  if not bits:continue
  if bits[0]=='v':verts.append([float(x) for x in bits[1:4]])
  # OBJ texture coordinates start at the bottom; glTF images start at the top.
  elif bits[0]=='vt':uv.append([float(bits[1]),1-float(bits[2])])
  elif bits[0]=='g':group=bits[1];groups.setdefault(group,set())
  elif bits[0]=='f':
   face=[tuple(int(x)-1 if x else -1 for x in b.split('/')) for b in bits[1:]];faces.append((group,face));groups.setdefault(group,set()).update(v[0] for v in face)
 return verts,uv,faces,groups

base,base_uv,base_faces,groups=read_obj(SOURCE/'base.obj')
vertices=[p[:] for p in base]
for filename,amount in [('male.target.gz',1.0),('muscle.target.gz',.72)]:
 for line in gzip.decompress((SOURCE/filename).read_bytes()).decode().splitlines():
  if not line or line.startswith('#'):continue
  i,*delta=line.split();p=vertices[int(i)]
  for axis,x in enumerate(delta):p[axis]+=float(x)*amount
rig=json.loads((SOURCE/'rig.json').read_text());weights=json.loads((SOURCE/'weights.json').read_text())['weights']
body_ids=groups['body'];floor=min(vertices[i][1] for i in body_ids);top=max(vertices[i][1] for i in body_ids);scale=1.88/(top-floor)
def world(p):return [p[0]*scale,(p[1]-floor)*scale,p[2]*scale]
def center(ids):return [sum(vertices[i][axis] for i in ids)/len(ids) for axis in range(3)]
def resolve(spec):
 if spec.get('cube_name') in groups:return world(center(groups[spec['cube_name']]))
 if spec.get('vertex_indices'):return world(center(spec['vertex_indices']))
 # Saved rig coordinates are Blender Z-up metres; OBJ is Y-up decimetres.
 x,y,z=spec['default_position'];return world([x*10,z*10,-y*10])
heads={name:resolve(bone['head']) for name,bone in rig.items()}
# The root belongs on the ground; translating its children maintains the original anatomy.
heads['Root']=[0,0,0]
names=list(rig);joint_index={name:i for i,name in enumerate(names)}
vertex_weights=[[] for _ in vertices]
for name,values in weights.items():
 if name not in joint_index:continue
 for index,weight in values:
  if weight>1e-5:vertex_weights[index].append((joint_index[name],weight))
for i,values in enumerate(vertex_weights):
 values.sort(key=lambda v:-v[1]);values=values[:4]
 if not values:values=[(joint_index['pelvis'],1)]
 total=sum(w for _,w in values);vertex_weights[i]=[(j,w/total) for j,w in values]+[(0,0)]*(4-len(values))

def cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def subtract(a,b):return [a[i]-b[i] for i in range(3)]
class Builder:
 def __init__(self):
  self.binary=bytearray();self.d={'asset':{'version':'2.0','generator':'Homelander / MakeHuman CC0 pipeline'},'buffers':[],'bufferViews':[],'accessors':[],'nodes':[],'meshes':[],'skins':[],'animations':[],'materials':[],'images':[],'textures':[],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}]}
 def accessor(self,values,kind,component=5126,target=None,bounds=False):
  size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[kind];flat=[x for row in values for x in row] if size>1 else values
  while len(self.binary)%4:self.binary.append(0)
  start=len(self.binary);fmt={5126:'f',5123:'H',5125:'I'}[component];self.binary.extend(struct.pack('<'+fmt*len(flat),*flat));view={'buffer':0,'byteOffset':start,'byteLength':len(self.binary)-start}
  if target:view['target']=target
  self.d['bufferViews'].append(view);a={'bufferView':len(self.d['bufferViews'])-1,'componentType':component,'count':len(values),'type':kind}
  if bounds:
   rows=values if size>1 else [[v] for v in values];a['min']=[min(row[i] for row in rows) for i in range(size)];a['max']=[max(row[i] for row in rows) for i in range(size)]
  self.d['accessors'].append(a);return len(self.d['accessors'])-1
 def save(self,path):
  while len(self.binary)%4:self.binary.append(0)
  self.d['buffers']=[{'byteLength':len(self.binary)}];text=json.dumps(self.d,separators=(',',':')).encode();text+=b' '*((-len(text))%4);total=12+8+len(text)+8+len(self.binary)
  path.write_bytes(struct.pack('<4sII',b'glTF',2,total)+struct.pack('<I4s',len(text),b'JSON')+text+struct.pack('<I4s',len(self.binary),b'BIN\0')+self.binary)

def mapped_attachment(folder,name):
 raw,uv,faces,_=read_obj(SOURCE/'system-assets'/folder/(name+'.obj'))
 text=(SOURCE/'system-assets'/folder/(name+'.mhclo')).read_text();lines=text.splitlines();active=False;mapping=[]
 for line in lines:
  bits=line.split()
  if not bits:continue
  if bits[0]=='verts':active=True;continue
  if not active:continue
  if not bits[0].lstrip('-').isdigit():
   if mapping:break
   continue
  if len(bits)==1:mapping.append(vertices[int(bits[0])][:])
  elif len(bits)>=9:
   indices=list(map(int,bits[:3]));w=list(map(float,bits[3:6]));offset=list(map(float,bits[6:9]));mapping.append([sum(vertices[indices[j]][axis]*w[j] for j in range(3))+offset[axis] for axis in range(3)])
 if len(mapping)!=len(raw):raise ValueError((name,len(mapping),len(raw)))
 return mapping,uv,faces

clothes,clothes_uv,clothes_faces=mapped_attachment(Path('clothes/male_casualsuit01'),'male_casualsuit01')
clothes_weights=[];active=False
for line in (SOURCE/'system-assets/clothes/male_casualsuit01/male_casualsuit01.mhclo').read_text().splitlines():
 bits=line.split()
 if not bits:continue
 if bits[0]=='verts':active=True;continue
 if not active:continue
 if not bits[0].lstrip('-').isdigit():
  if clothes_weights:break
  continue
 combined={}
 pairs=[(int(bits[0]),1)] if len(bits)==1 else list(zip(map(int,bits[:3]),map(float,bits[3:6])))
 for vi,amount in pairs:
  for joint,weight in vertex_weights[vi]:combined[joint]=combined.get(joint,0)+weight*amount
 top=sorted([(j,max(0,w)) for j,w in combined.items()],key=lambda pair:-pair[1])[:4];total=sum(w for _,w in top) or 1;clothes_weights.append([(j,w/total) for j,w in top]+[(0,0)]*(4-len(top)))
shoes,shoes_uv,shoes_faces=mapped_attachment(Path('clothes/shoes02'),'shoes02')
shoes_weights=[];active=False
for line in (SOURCE/'system-assets/clothes/shoes02/shoes02.mhclo').read_text().splitlines():
 bits=line.split()
 if not bits:continue
 if bits[0]=='verts':active=True;continue
 if not active:continue
 if not bits[0].lstrip('-').isdigit():
  if shoes_weights:break
  continue
 combined={};pairs=[(int(bits[0]),1)] if len(bits)==1 else list(zip(map(int,bits[:3]),map(float,bits[3:6])))
 for vi,amount in pairs:
  for joint,weight in vertex_weights[vi]:combined[joint]=combined.get(joint,0)+weight*amount
 top=sorted([(j,max(0,w)) for j,w in combined.items()],key=lambda pair:-pair[1])[:4];total=sum(w for _,w in top) or 1;shoes_weights.append([(j,w/total) for j,w in top]+[(0,0)]*(4-len(top)))
hair,hair_uv,hair_faces=mapped_attachment(Path('hair/short02'),'short02')
# Eye geometry is fitted through the same vertex mapping as the head.
eye_vertices,eye_uv,eye_faces=mapped_attachment(Path('eyes/low-poly'),'low-poly')

for role in ['hero','civilian']:
 b=Builder();d=b.d;d['nodes']=[{'name':'Human','children':[1,len(names)+1]},{'name':'Root','children':[]}]
 # Bone index = joint index + 1, including the dedicated Root node.
 for name in names[1:]:d['nodes'].append({'name':name})
 for name in names:
  ni=joint_index[name]+1;parent=rig[name]['parent'];origin=heads[parent] if parent else [0,0,0];d['nodes'][ni]['translation']=subtract(heads[name],origin)
  if parent:d['nodes'][joint_index[parent]+1].setdefault('children',[]).append(ni)
 inv=[]
 for name in names:
  x,y,z=heads[name];inv.append([1,0,0,0,0,1,0,0,0,0,1,0,-x,-y,-z,1])
 d['skins']=[{'name':'MakeHumanGameRig','joints':[i+1 for i in range(len(names))],'skeleton':1,'inverseBindMatrices':b.accessor(inv,'MAT4')}]
 d['images']=[{'uri':'Textures/skin.png'},{'uri':'Textures/hair.png'},{'uri':'Textures/hair-normal.png'}];d['textures']=[{'source':i,'sampler':0} for i in range(3)]
 skin={'name':'Skin','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':.63}}
 suit={'name':'Suit','pbrMetallicRoughness':{'baseColorFactor':[.023,.075,.145,1],'metallicFactor':.15,'roughnessFactor':.53}}
 boots={'name':'Boots','pbrMetallicRoughness':{'baseColorFactor':[.20,.016,.024,1],'metallicFactor':.05,'roughnessFactor':.4}}
 gloves={'name':'Gloves','pbrMetallicRoughness':{'baseColorFactor':[.20,.016,.024,1],'metallicFactor':.05,'roughnessFactor':.42}}
 if role=='civilian':suit['pbrMetallicRoughness']['baseColorFactor']=[.13,.2,.25,1];boots['pbrMetallicRoughness']['baseColorFactor']=[.025,.028,.035,1];gloves=skin.copy();gloves['name']='Hands'
 hairmat={'name':'Hair','doubleSided':True,'alphaMode':'MASK','alphaCutoff':.45,'pbrMetallicRoughness':{'baseColorTexture':{'index':1},'metallicFactor':0,'roughnessFactor':.85},'normalTexture':{'index':2,'scale':.4}}
 d['materials']=[skin,suit,boots,gloves,hairmat,{'name':'Eyes','pbrMetallicRoughness':{'baseColorFactor':[.84,.87,.87,1],'metallicFactor':0,'roughnessFactor':.12}}]
 body_faces=[face for group,face in base_faces if group=='body'];raw_pos=[world(p) for p in vertices]
 # Hide exposed anatomical contour beneath the tailored suit.
 for pos in raw_pos:
  if .79<pos[1]<.99 and abs(pos[0])<.10:pos[2]=min(pos[2],.095)
 normals=[[0,0,0] for _ in vertices]
 for face in body_faces:
  for j in range(1,len(face)-1):
   ids=[face[0][0],face[j][0],face[j+1][0]];n=cross(subtract(raw_pos[ids[1]],raw_pos[ids[0]]),subtract(raw_pos[ids[2]],raw_pos[ids[0]]))
   for i in ids:
    for a in range(3):normals[i][a]+=n[a]
 for n in normals:
  length=math.sqrt(sum(v*v for v in n)) or 1
  for a in range(3):n[a]/=length
 pos=[];nor=[];uv=[];joints=[];ws=[];lookup={};indices=[[] for _ in range(4)]
 for face in body_faces:
  avg=[sum(raw_pos[c[0]][a] for c in face)/len(face) for a in range(3)]
  bone_names=[names[max(vertex_weights[c[0]],key=lambda x:x[1])[0]] for c in face]
  is_hand=all(n.startswith(('hand','thumb','index','middle','ring','pinky')) for n in bone_names)
  neck=max(raw_pos[c[0]][1] for c in face)>heads['head'][1]-.125 if role=='hero' else avg[1]>heads['head'][1]-.135
  mi=0 if neck else 2 if avg[1]<.38 else 3 if is_hand else 1
  for j in range(1,len(face)-1):
   for corner in [face[0],face[j],face[j+1]]:
    key=(corner[0],corner[1]);i=lookup.get(key)
    if i is None:
     i=len(pos);lookup[key]=i;vi,ti=corner[:2];pos.append(raw_pos[vi]);nor.append(normals[vi]);uv.append(base_uv[ti]);joints.append([x[0] for x in vertex_weights[vi]]);ws.append([x[1] for x in vertex_weights[vi]])
    indices[mi].append(i)
 attributes={'POSITION':b.accessor(pos,'VEC3',target=34962,bounds=True),'NORMAL':b.accessor(nor,'VEC3',target=34962),'TEXCOORD_0':b.accessor(uv,'VEC2',target=34962),'JOINTS_0':b.accessor(joints,'VEC4',5123,34962),'WEIGHTS_0':b.accessor(ws,'VEC4',target=34962)}
 # The full casual outfit includes shoes: omit the covered torso, legs and bare feet.
 primitives=[{'attributes':attributes,'indices':b.accessor(ind,'SCALAR',5123,34963),'material':i} for i,ind in enumerate(indices) if ind and not (role=='civilian' and i in (1,2)) and not (role=='hero' and i==1)]
 d['meshes']=[{'name':'HumanBody','primitives':primitives}];d['nodes'].append({'name':'Body','mesh':0,'skin':0})
 if role=='hero':
  # A separate fitted cloth shell shares the exact body skin weights. The covered
  # body is omitted, so cloth/body z-fighting cannot occur during any animation.
  suit_pos=[[p[a]+n[a]*.007 for a in range(3)] for p,n in zip(pos,nor)]
  suit_attributes={**attributes,'POSITION':b.accessor(suit_pos,'VEC3',target=34962,bounds=True)}
  d['meshes'].append({'name':'TailoredSuit','primitives':[{'attributes':suit_attributes,'indices':b.accessor(indices[1],'SCALAR',5123,34963),'material':1}]})
  d['nodes'].append({'name':'TailoredSuit','mesh':len(d['meshes'])-1,'skin':0});d['nodes'][0]['children'].append(len(d['nodes'])-1)
  # Smooth high collar, weighted against nearby neck vertices rather than fixed
  # to the head. It overlaps the suit's triangular material boundary by 3 cm.
  cp=[];cn=[];cu=[];cj=[];cw=[];ci=[]
  neck_ids=[i for i in body_ids if 1.54<raw_pos[i][1]<1.66 and abs(raw_pos[i][0])<.13]
  for row in range(5):
   t=row/4;y=1.515+t*.12;rx=.098-t*.025;rz=.112-t*.041
   for col in range(49):
    angle=col/48*math.tau;p=[math.cos(angle)*rx,y,.019+math.sin(angle)*rz];nearest=min(neck_ids,key=lambda i:sum((raw_pos[i][a]-p[a])**2 for a in range(3)))
    cp.append(p);cn.append([math.cos(angle),0,math.sin(angle)]);cu.append([col/48,t]);cj.append([j for j,w in vertex_weights[nearest]]);cw.append([w for j,w in vertex_weights[nearest]])
    if row<4 and col<48:
     a=row*49+col;ci.extend([a,a+49,a+1,a+1,a+49,a+50])
  d['meshes'].append({'name':'FittedCollar','primitives':[{'attributes':{'POSITION':b.accessor(cp,'VEC3',target=34962,bounds=True),'NORMAL':b.accessor(cn,'VEC3',target=34962),'TEXCOORD_0':b.accessor(cu,'VEC2',target=34962),'JOINTS_0':b.accessor(cj,'VEC4',5123,34962),'WEIGHTS_0':b.accessor(cw,'VEC4',target=34962)},'indices':b.accessor(ci,'SCALAR',5123,34963),'material':1}]})
  d['nodes'].append({'name':'FittedCollar','mesh':len(d['meshes'])-1,'skin':0});d['nodes'][0]['children'].append(len(d['nodes'])-1)
  d['materials'].append({'name':'Gold','pbrMetallicRoughness':{'baseColorFactor':[.49,.32,.13,1],'metallicFactor':.72,'roughnessFactor':.35}})
  gold_pos=[[p[a]+n[a]*.026 for a in range(3)] for p,n in zip(pos,nor)]
  armor=[];belt=[]
  for j in range(0,len(indices[1]),3):
   triangle=indices[1][j:j+3];avg=[sum(pos[i][a] for i in triangle)/3 for a in range(3)]
   for side in ['l','r']:
    shoulder=heads['upperarm_'+side]
    if sum((avg[a]-shoulder[a])**2 for a in range(3))<.135**2 and avg[1]>shoulder[1]-.068 and abs(avg[0])>.175:
     armor.extend(triangle);break
   if abs(avg[1]-heads['pelvis'][1]-.016)<.033:belt.extend(triangle)
  for name,ix in [('FittedEpaulets',armor),('FittedBelt',belt)]:
   d['meshes'].append({'name':name,'primitives':[{'attributes':{**attributes,'POSITION':b.accessor(gold_pos,'VEC3',target=34962,bounds=True)},'indices':b.accessor(ix,'SCALAR',5123,34963),'material':6}]})
   d['nodes'].append({'name':name,'mesh':len(d['meshes'])-1,'skin':0});d['nodes'][0]['children'].append(len(d['nodes'])-1)
 if role=='civilian':
  d['images'].append({'uri':'Textures/casual.png'});d['textures'].append({'source':3,'sampler':0});d['materials'].append({'name':'Clothing','pbrMetallicRoughness':{'baseColorTexture':{'index':3},'metallicFactor':0,'roughnessFactor':.85}})
  pv=[];tc=[];ix=[];js=[];ww=[];lp={}
  for _,face in clothes_faces:
   for j in range(1,len(face)-1):
    for vi,ti,*_ in [face[0],face[j],face[j+1]]:
     key=(vi,ti)
     if key not in lp:
      lp[key]=len(pv);pv.append(world(clothes[vi]));tc.append(clothes_uv[ti] if ti>=0 else [0,0]);js.append([v[0] for v in clothes_weights[vi]]);ww.append([v[1] for v in clothes_weights[vi]])
     ix.append(lp[key])
  ns=[[0,0,0] for _ in pv]
  for j in range(0,len(ix),3):
   ids=ix[j:j+3];n=cross(subtract(pv[ids[1]],pv[ids[0]]),subtract(pv[ids[2]],pv[ids[0]]))
   for i in ids:
    for a in range(3):ns[i][a]+=n[a]
  ns=[[x/(math.sqrt(sum(v*v for v in n)) or 1) for x in n] for n in ns]
  d['meshes'].append({'name':'CasualUniform','primitives':[{'attributes':{'POSITION':b.accessor(pv,'VEC3',target=34962,bounds=True),'NORMAL':b.accessor(ns,'VEC3',target=34962),'TEXCOORD_0':b.accessor(tc,'VEC2',target=34962),'JOINTS_0':b.accessor(js,'VEC4',5123,34962),'WEIGHTS_0':b.accessor(ww,'VEC4',target=34962)},'indices':b.accessor(ix,'SCALAR',5123,34963),'material':6}]});d['nodes'].append({'name':'Clothing','mesh':len(d['meshes'])-1,'skin':0});d['nodes'][0]['children'].append(len(d['nodes'])-1)
 if role in ['hero','civilian']:
  footwear_name='HeroBoots' if role=='hero' else 'NpcShoes'
  pv=[];tc=[];ix=[];js=[];ww=[];lp={}
  for _,face in shoes_faces:
   for j in range(1,len(face)-1):
    for vi,ti,*_ in [face[0],face[j],face[j+1]]:
     key=(vi,ti)
     if key not in lp:
      lp[key]=len(pv);pv.append(world(shoes[vi]));tc.append(shoes_uv[ti] if ti>=0 else [0,0]);js.append([v[0] for v in shoes_weights[vi]]);ww.append([v[1] for v in shoes_weights[vi]])
     ix.append(lp[key])
  ns=[[0,0,0] for _ in pv]
  for j in range(0,len(ix),3):
   ids=ix[j:j+3];n=cross(subtract(pv[ids[1]],pv[ids[0]]),subtract(pv[ids[2]],pv[ids[0]]))
   for i in ids:
    for a in range(3):ns[i][a]+=n[a]
  ns=[[x/(math.sqrt(sum(v*v for v in n)) or 1) for x in n] for n in ns]
  d['meshes'].append({'name':footwear_name,'primitives':[{'attributes':{'POSITION':b.accessor(pv,'VEC3',target=34962,bounds=True),'NORMAL':b.accessor(ns,'VEC3',target=34962),'TEXCOORD_0':b.accessor(tc,'VEC2',target=34962),'JOINTS_0':b.accessor(js,'VEC4',5123,34962),'WEIGHTS_0':b.accessor(ww,'VEC4',target=34962)},'indices':b.accessor(ix,'SCALAR',5123,34963),'material':2}]});d['nodes'].append({'name':footwear_name,'mesh':len(d['meshes'])-1,'skin':0});d['nodes'][0]['children'].append(len(d['nodes'])-1)
 # Fitted hair and eyeballs are rigid attachments to the head joint.
 for mesh_name,raw,coords,faces,mi in [('Hair',hair,hair_uv,hair_faces,4),('EyeSclera',eye_vertices,eye_uv,eye_faces,5)]:
  pv=[];tc=[];ix=[];lp={};hn=heads['head']
  for _,face in faces:
   for j in range(1,len(face)-1):
    for vi,ti,*_ in [face[0],face[j],face[j+1]]:
     key=(vi,ti)
     if key not in lp:lp[key]=len(pv);pv.append(subtract(world(raw[vi]),hn));tc.append(coords[ti] if ti>=0 else [0,0])
     ix.append(lp[key])
  ns=[[0,0,0] for _ in pv]
  for j in range(0,len(ix),3):
   ids=ix[j:j+3];n=cross(subtract(pv[ids[1]],pv[ids[0]]),subtract(pv[ids[2]],pv[ids[0]]))
   for i in ids:
    for a in range(3):ns[i][a]+=n[a]
  ns=[[x/(math.sqrt(sum(v*v for v in n)) or 1) for x in n] for n in ns]
  d['meshes'].append({'name':mesh_name,'primitives':[{'attributes':{'POSITION':b.accessor(pv,'VEC3',target=34962,bounds=True),'NORMAL':b.accessor(ns,'VEC3',target=34962),'TEXCOORD_0':b.accessor(tc,'VEC2',target=34962)},'indices':b.accessor(ix,'SCALAR',5123,34963),'material':mi}]});d['nodes'].append({'name':mesh_name,'mesh':len(d['meshes'])-1});d['nodes'][joint_index['head']+1].setdefault('children',[]).append(len(d['nodes'])-1)
 metadata={'source':'MakeHuman / MPFB2 CC0','height':1.88,'triangles':sum(len(v) for v in indices)//3,'boneCount':len(names),'head':heads['head'],'eyes':{side:subtract(world(center(groups[f'joint-{side}-eye'])),heads['head']) for side in ['l','r']}}
 d['extras']=metadata
 d['scenes']=[{'nodes':[0]}];d['scene']=0;b.save(OUT/(role+'.glb'))
 (OUT/'rig-metadata.json').write_text(json.dumps(metadata,indent=2))
 print(role,'vertices',len(pos),'triangles',metadata['triangles'],'bones',len(names),'bytes',(OUT/(role+'.glb')).stat().st_size)
