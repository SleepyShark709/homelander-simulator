"""Blender offline build. Run: Blender -b --python scripts/build-jiangwan.py

Game coordinates are metres, Y up, vehicle noses +Z. Blender uses Z up.
No ground is exported: the game's existing disjoint road surfaces remain authoritative.
"""
import bpy
import hashlib
import json
import math
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / '.asset-source/jiangwan'
OUT = ROOT / 'public/assets/jiangwan'
SOURCE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
random.seed(4217)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'


def xyz(p):
    return Vector((p[0], -p[2], p[1]))


def material(name, color, roughness=.85, metallic=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return m


def export(path):
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB',
                              export_extras=True, export_yup=True,
                              export_animations=False, export_cameras=False,
                              export_lights=False)


vehicle_report = []
for name, length, yaw, target_faces in [
    ('bus', 10.5, -math.pi / 2, 24000),
    ('scooter', 1.95, -math.pi / 2, 16000),
    ('sedan', 4.6, 0, 24000),
]:
    reset()
    path = SOURCE / f'{name}.fbx'
    bpy.ops.import_scene.fbx(filepath=str(path))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    o.rotation_euler.z += yaw
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bounds = [o.matrix_world @ Vector(v) for v in o.bound_box]
    lo = Vector(tuple(min(v[i] for v in bounds) for i in range(3)))
    hi = Vector(tuple(max(v[i] for v in bounds) for i in range(3)))
    scale = length / (hi.y - lo.y)
    center = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    for v in o.data.vertices:
        v.co = (o.matrix_world @ v.co - center) * scale
    o.matrix_world.identity()
    triangles = sum(len(p.vertices) - 2 for p in o.data.polygons)
    mod = o.modifiers.new('Browser budget', 'DECIMATE')
    mod.ratio = min(1, target_faces / triangles)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for img in bpy.data.images:
        if img.size[0] > 1024:
            img.scale(1024, 1024)
        if img.type == 'IMAGE':
            img.pack()
    for p in o.data.polygons:
        p.use_smooth = True
    bpy.context.view_layer.update()
    dimensions = [o.dimensions.x, o.dimensions.z, o.dimensions.y]
    o['vehicle'] = name
    o['dimensions'] = dimensions
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / f'{name}.blend'))
    export(OUT / f'{name}.glb')
    vehicle_report.append(dict(name=name, dimensions=dimensions,
        triangles=sum(len(p.vertices) - 2 for p in o.data.polygons),
        source=path.name, sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest()))

reset()
mats = {
    'plaster': material('Aged ivory ceramic tile', (.68, .62, .49)),
    'sand': material('Warm weathered plaster', (.55, .45, .33)),
    'concrete': material('Concrete and rooftop gravel', (.41, .43, .40)),
    'trim': material('Painted window frames', (.21, .27, .26), .67, .25),
    'steel': material('Galvanized metal', (.43, .48, .47), .38, .72),
    'teal': material('Jiangwan shop awning teal', (.025, .23, .20)),
    'red': material('Faded red shop awning', (.38, .075, .045)),
    'cream': material('Lettering and stone coping', (.87, .82, .64)),
    'wood': material('Timber', (.25, .14, .07)),
    'bark': material('Plane tree bark', (.21, .20, .13)),
    'water': material('Jiangwan river', (.095, .24, .27), .24, .48),
    'road': material('Viaduct asphalt', (.095, .105, .11)),
}
for i, c in enumerate([(.12,.23,.26),(.18,.30,.32),(.23,.34,.34),(.32,.36,.30)]):
    mats[f'glass{i}'] = material(f'Blue glass tone {i}', c, .27, .38)
for i, c in enumerate([(.12,.23,.07),(.20,.31,.095),(.29,.37,.12),(.36,.40,.16)]):
    mats[f'leaf{i}'] = material(f'Plane tree foliage {i}', c)

# A local baked tile/stain image survives GLB export (no procedural shader dependency).
img = bpy.data.images.new('Baked ceramic grout and weathering', width=256, height=256)
pixels = []
for y in range(256):
    for x in range(256):
        seam = x % 32 < 1 or y % 16 < 1
        stain = .035 * math.sin(x * .05) * math.sin(y * .033)
        shade = (.60 if seam else .92 + random.uniform(-.035,.035)) - stain
        pixels.extend((shade, shade, shade * .96, 1))
img.pixels = pixels
img.pack()
for key in ['plaster', 'sand', 'concrete']:
    m = mats[key]
    node = m.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = img
    # Bake the wall tint for standard glTF base-color export.
    colored = img.copy()
    colored.name = key + ' baked tile'
    tint_color = m.diffuse_color
    colored.pixels = [v * tint_color[i % 4] for i, v in enumerate(pixels)]
    colored.pack()
    node.image = colored
    m.node_tree.links.new(node.outputs['Color'], m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

font = bpy.data.fonts.load('/System/Library/Fonts/STHeiti Medium.ttc')
solids = []


class Builder:
    def __init__(self, name, origin=(0,0,0), background=False):
        self.root = bpy.data.objects.new(name, None)
        bpy.context.collection.objects.link(self.root)
        self.root.location = xyz(origin)
        self.root['background'] = background
        self.parts = {}
        self.origin = origin

    def face(self, key, vertices, uv=None):
        vs, fs, uvs = self.parts.setdefault(key, ([], [], []))
        n = len(vs)
        vs.extend([xyz(v) for v in vertices])
        fs.append(tuple(range(n, n + len(vertices))))
        uvs.extend(uv or [(0,0), (1,0), (1,1), (0,1)][:len(vertices)])

    def box(self, key, size, p):
        w,h,d = [s/2 for s in size]
        x,y,z = p
        v = [(x+sx*w,y+sy*h,z+sz*d) for sx,sy,sz in
             [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
              (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        for indices, a,b in [((0,3,2,1),size[0],size[1]),
             ((4,5,6,7),size[0],size[1]),((0,4,7,3),size[2],size[1]),
             ((1,2,6,5),size[2],size[1]),((3,7,6,2),size[0],size[2]),
             ((0,1,5,4),size[0],size[2])]:
            self.face(key,[v[i] for i in indices],[(0,0),(0,b/4),(a/4,b/4),(a/4,0)])

    def cylinder(self, key, a, b, radius, segments=10, top_radius=None):
        va,vb = Vector(a),Vector(b)
        axis=(vb-va).normalized()
        u=axis.cross(Vector((1,0,0)) if abs(axis.x)<.9 else Vector((0,0,1))).normalized()
        v=axis.cross(u)
        rings=[]
        for center,r in [(va,radius),(vb,top_radius if top_radius is not None else radius)]:
            rings.append([tuple(center+r*(u*math.cos(i*math.tau/segments)+v*math.sin(i*math.tau/segments))) for i in range(segments)])
        for i in range(segments):
            j=(i+1)%segments
            self.face(key,[rings[0][i],rings[0][j],rings[1][j],rings[1][i]])
            self.face(key,[tuple(vb),rings[1][i],rings[1][j]])
            self.face(key,[tuple(va),rings[0][j],rings[0][i]])

    def solid(self,size,p):
        empty=bpy.data.objects.new('Collision '+self.root.name, None)
        bpy.context.collection.objects.link(empty)
        empty.parent=self.root
        empty.location=xyz(p)
        empty['collider']=list(size)
        solids.append(dict(position=[p[i]+self.origin[i] for i in range(3)],size=list(size)))

    def text(self, text, p, width, yaw=0):
        curve=bpy.data.curves.new(text,'FONT')
        curve.body=text
        curve.font=font
        curve.align_x='CENTER'
        curve.align_y='CENTER'
        curve.size=.7
        curve.resolution_u=2
        obj=bpy.data.objects.new(text,curve)
        bpy.context.collection.objects.link(obj)
        obj.parent=self.root
        obj.location=xyz(p)
        obj.rotation_euler=(math.pi/2,0,-yaw)
        curve.materials.append(mats['cream'])
        bpy.context.view_layer.update()
        obj.scale *= width/max(.01,obj.dimensions.x,obj.dimensions.y)
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.convert(target='MESH')

    def finish(self):
        for key,(vs,fs,uvs) in self.parts.items():
            mesh=bpy.data.meshes.new(self.root.name+' / '+key)
            mesh.from_pydata(vs,[],fs)
            mesh.update()
            uv=mesh.uv_layers.new()
            for poly in mesh.polygons:
                for li in poly.loop_indices:
                    uv.data[li].uv=uvs[mesh.loops[li].vertex_index]
            obj=bpy.data.objects.new(mesh.name,mesh)
            bpy.context.collection.objects.link(obj)
            obj.parent=self.root
            mesh.materials.append(mats[key])


def building(x,z,w,h,d,index,background=False):
    b=Builder(('Skyline ' if background else 'Block ')+str(index),(x,0,z),background)
    modern=index in [1,5] or (background and index%3!=0)
    wall='concrete' if modern else ('sand' if index%3==0 else 'plaster')
    b.box(wall,(w,h,d),(0,h/2,0))
    if not background:
        b.solid((w+.2,h,d+.2),(0,h/2,0))
    floors=max(2,int((h-3.6)/(6 if background else 3)))
    step=(h-3.6)/floors
    for face in range(4):
        span=w if face<2 else d
        sign=1 if face%2==0 else -1
        def panel(key,u,y,ww,hh,thick=.10,out=.05):
            p=(u,y,sign*(d/2+out)) if face<2 else (sign*(w/2+out),y,u)
            b.box(key,(ww,hh,thick) if face<2 else (thick,hh,ww),p)
        cols=max(2,int(span/(6 if background else 3 if not modern else 2.4)))
        spacing=span/cols
        for floor in range(floors):
            y=3.6+step*(floor+.5)
            panel('cream' if not modern else 'steel',0,3.6+step*floor,span+.1,.12)
            for col in range(cols):
                u=-span/2+spacing*(col+.5)
                ww=spacing*(.67 if not modern else .94)
                hh=step*(.64 if not modern else .91)
                if not background:
                    panel('trim',u,y,ww+.14,hh+.14,.14,.10)
                panel(f'glass{(floor*7+col*3+index)%4}',u,y,ww,hh,.04,.19)
                if not background:
                    panel('cream' if not modern else 'steel',u,y, .06,hh,.06,.23)
                if not background and not modern:
                    panel('cream',u,y-hh/2-.12,ww+.4,.14,.5,.22)
                    if (col+floor+index)%4==0:
                        # Window cages and AC boxes are geometric silhouettes.
                        for offset in [-.42,-.14,.14,.42]:
                            panel('steel',u+offset*ww,y,.035,hh,.06,.48)
                        panel('steel',u,y-hh/2,ww,.045,.55,.38)
                    if col%3==1 and floor%2==0:
                        panel('cream',u+ww*.48,y-hh/2-.5,.82,.53,.48,.32)
                        for sy in [-.16,-.05,.06,.17]:
                            panel('trim',u+ww*.48,y-hh/2-.5+sy,.67,.025,.03,.58)
        if not background:
            for col in range(max(2,int(span/5))):
                u=-span/2+(col+.5)*span/max(2,int(span/5))
                panel('trim',u,1.6,3.1,2.9,.08,.08)
                panel('glass1',u,1.6,2.9,2.7,.04,.15)
                panel('steel',u,1.6,.06,2.7,.08,.19)
            panel('teal' if index%2==0 else 'red',0,3.25,span-.4,.68,.16,.22)
            panel('teal' if index%2==0 else 'red',0,2.88,span-.4,.12,1.1,.7)
    b.box('concrete',(w-.4,.08,d-.4),(0,h+.04,0))
    if not background:
        for s in [-1,1]:
            for size,p in [((w,.6,.22),(0,h+.3,s*(d/2-.11))),((.22,.6,d),(s*(w/2-.11),h+.3,0))]:
                b.box('cream',size,p)
                b.solid(size,p)
        b.box(wall,(3.7,2.4,4),(w*.28,h+1.2,-d*.28))
        b.solid((3.7,2.4,4),(w*.28,h+1.2,-d*.28))
        for j in range(3):
            p=(-w*.24+j*w*.24,h+.65,-d*.18)
            b.box('steel',(2.1,1.3,1.5),p)
            b.solid((2.1,1.3,1.5),p)
        if not modern:
            b.cylinder('steel',(-w*.3,h+.4,d*.22),(-w*.3,h+2.5,d*.22),.85,16)
            for y in [h+.6,h+1.2,h+1.8,h+2.3]:
                b.cylinder('cream',(-w*.3,y,d*.22),(-w*.3,y+.05,d*.22),.87,16)
            b.solid((1.75,2.5,1.75),(-w*.3,h+1.25,d*.22))
        labels=['江湾便利店','北岸商务中心','江湾茶社','春来五金','江畔生活超市','汇江国际','江湾邮政','滨江公寓']
        b.text(labels[index],(0,3.25,d/2+.32),min(w-2,9))
    b.finish()


plots=[[-37,-38,22,21,26],[-71,-36,24,33,28],[-40,-73,28,15,22],[-76,-75,23,25,24],
       [38,38,24,22,27],[73,36,22,32,25],[37,74,25,16,24],[75,75,24,27,23]]
for i,p in enumerate(plots):
    building(*p,i)

# Continuous riverside outside the 200 m playable district. Its pavement is lower
# than existing ground; near-ground meshes never overlap the game's road planes.
b=Builder('Riverwalk and distant bridge',background=True)
b.box('water',(600,.1,180),(25,-.65,-400))
b.box('sand',(600,1,180),(25,-.4,-580))
b.box('sand',(600,1.2,2),(25,-.2,-308))
b.box('concrete',(600,.08,14),(25,-.12,-299))
for x in range(-270,321,6):
    b.box('cream',(.24,1.1,.24),(x,.65,-307))
    b.box('steel',(5.9,.09,.10),(x+3,1.16,-307))
    b.box('steel',(5.9,.06,.08),(x+3,.65,-307))
# Viaduct behind the playable blocks, a landmark at street level and in flight.
for x in range(-280,300,20):
    b.box('concrete',(20,1.1,13),(x,13,-114))
    b.box('road',(20,.06,11),(x,13.58,-114))
    for side in [-1,1]:
        b.box('cream',(20,.9,.35),(x,14.05,-114+side*6.4))
    b.box('concrete',(2.2,12.5,3),(x,6.25,-114))
    b.box('concrete',(3.4,.9,10),(x,12,-114))
    b.box('cream',(4,.02,.12),(x,13.63,-114))
# Cable-stayed bridge spans the river, including fine diagonal suspension stays.
b.box('concrete',(15,1.6,250),(160,9,-411))
b.box('road',(13,.08,250),(160,9.85,-411))
for zz in [-355,-465]:
    for xx in [153,167]:
        b.box('concrete',(1.4,48,2.2),(xx,24,zz))
        for dz in [-48,-36,-24,-12,12,24,36,48]:
            b.cylinder('steel',(xx,46,zz),(xx,10,zz+dz),.075,5)
    b.box('cream',(15,1.5,2.2),(160,39,zz))
b.finish()

# A sheltered bus stop, timetable, bench and utility cabinet beside the pavement.
b=Builder('Jiangwan bus stop',(-65,0,18.7))
b.box('teal',(5.8,.18,2.5),(0,3.05,0))
b.solid((5.8,.18,2.5),(0,3.05,0))
for x in [-2.65,2.65]:
    b.box('steel',(.09,2.9,.09),(x,1.5,.85))
    b.solid((.09,2.9,.09),(x,1.5,.85))
b.box('glass2',(5.4,2.4,.06),(0,1.6,1))
b.solid((5.4,2.4,.08),(0,1.6,1))
b.box('teal',(5.6,.6,.08),(0,2.75,-1.25))
b.text('江湾路站  /  JIANGWAN',(0,2.75,-1.3),4.8,math.pi)
for y in [.52,.95]:
    b.box('wood',(3.6,.07,.36),(0,y,.55))
for x in [-1.5,1.5]:
    b.box('steel',(.08,.55,.3),(x,.27,.55))
b.solid((3.7,1,.55),(0,.5,.55))
b.box('cream',(.85,1.7,.08),(1.85,1.7,.9))
for row in range(10):
    b.box('teal',(.65,.025,.02),(1.85,1.05+row*.12,.84))
b.finish()
b=Builder('Street utility cabinets',(21,0,20))
b.box('concrete',(1.1,1.5,.65),(0,.75,0))
b.solid((1.1,1.5,.65),(0,.75,0))
b.box('trim',(.035,1.2,.03),(0,.75,.34))
for row in range(5):
    b.box('trim',(.3,.025,.03),(-.28,.9+row*.07,.34))
b.finish()

index=8
for x in range(-240,301,60):
    for z in [-250,-190,150,220]:
        if abs(x)<35:
            continue
        height=22+((index*19)%64)
        building(x,z,25+(index%3)*5,height,24+(index%4)*3,index,True)
        index+=1

# Tree canopies built from irregular leaf sprays, with distinct trunks/branches.
b=Builder('Street trees and planting')
tree_positions=[]
for t in range(-88,94,18):
    if abs(t)<21:
        continue
    for s in [-1,1]:
        tree_positions.extend([(t,s*16.7),(s*16.7,t)])
for x,z in tree_positions:
    b.cylinder('bark',(x,0,z),(x,4.8,z),.21,9,.09)
    for j in range(7):
        a=j*math.tau/7
        tip=(x+math.cos(a)*1.7,5.3+random.random()*1.2,z+math.sin(a)*1.7)
        b.cylinder('bark',(x,3.1,z),tip,.075,6,.025)
        for k in range(5):
            p=(tip[0]+random.uniform(-1,1),tip[1]+random.uniform(-.7,.7),tip[2]+random.uniform(-1,1))
            r=random.uniform(.6,1.1)
            key=f'leaf{random.randrange(4)}'
            def leafpoint(lat,lon):
                return (p[0]+r*math.sin(lat)*math.cos(lon),
                        p[1]+r*.7*math.cos(lat),p[2]+r*math.sin(lat)*math.sin(lon))
            for row in range(5):
                for col in range(8):
                    a1,a2=col*math.tau/8,(col+1)*math.tau/8
                    l1,l2=row*math.pi/5,(row+1)*math.pi/5
                    b.face(key,[leafpoint(l1,a2),leafpoint(l2,a2),leafpoint(l2,a1),leafpoint(l1,a1)])
    b.solid((.48,4,.48),(x,2,z))
b.finish()

# Dressing on the two existing openable shops. No geometry covers their panels.
for sign in [-1,1]:
    b=Builder('Shop roof dressing '+str(sign),(sign*39,0,-sign*38))
    b.box('teal',(20,.17,1.3),(0,4.85,sign*6.8))
    for x in [-8,8]:
        b.box('concrete',(1.2,.7,.8),(x,5.8,0))
        b.solid((1.2,.7,.8),(x,5.8,0))
    b.finish()

bpy.context.scene['description']='江湾城 / Jiangwan — original GTA-inspired riverside district'
bpy.context.scene['coordinates']='metres; exported Y-up; no duplicate game ground'
export(OUT/'district.glb')
report=dict(blender=bpy.app.version_string,vehicles=vehicle_report,plots=plots,
            builderSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            referenceSha256=hashlib.sha256((SOURCE/'reference.png').read_bytes()).hexdigest(),
            collisionBoxes=len(solids),colliders=solids,
            environmentTriangles=sum(len(p.vertices)-2 for o in bpy.context.scene.objects if o.type=='MESH' for p in o.data.polygons))
(OUT/'build.json').write_text(json.dumps(report,indent=2)+'\n')
# Editable .blend also includes a presentation ground, parked vehicles, camera and
# light. Added AFTER export so roads and dynamic cars are not duplicated in-game.
b=Builder('Blender preview only — ground and road markings')
b.box('concrete',(200,.1,200),(0,-.07,0))
for size,p in [((200,.02,20),(0,0,0)),((20,.02,200),(0,0,0))]:
    b.box('road',size,p)
for s in [-1,1]:
    b.box('road',(200,.02,8),(0,0,s*58))
    b.box('road',(8,.02,200),(s*58,0,0))
    for t in range(-90,100,10):
        if abs(t)>15:
            b.box('cream',(3,.01,.15),(t,.025,s*.25))
            b.box('cream',(.15,.01,3),(s*.25,.025,t))
    for t in range(-7,8,2):
        b.box('cream',(1,.01,4),(t,.025,s*15))
        b.box('cream',(4,.01,1),(s*15,.025,t))
b.finish()
for name,p,yaw in [('bus',(-77,0,-7),math.pi/2),('sedan',(-32,0,7),math.pi/2),('scooter',(13,0,-7),math.pi/2)]:
    with bpy.data.libraries.load(str(SOURCE/f'{name}.blend'),link=False) as (available,loaded):
        loaded.objects=[name]
    o=loaded.objects[0]
    bpy.context.collection.objects.link(o)
    o.location=xyz(p)
    o.rotation_euler.z=-yaw
bpy.ops.object.camera_add(location=xyz((115,94,130)))
camera=bpy.context.object
camera.rotation_euler=(xyz((0,8,-35))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.clip_end=2000
camera.data.lens=40
bpy.context.scene.camera=camera
bpy.ops.object.light_add(type='SUN',location=xyz((-45,80,40)))
sun=bpy.context.object
sun.rotation_euler=(.5,-.4,-.5)
sun.data.energy=2.4
bpy.context.scene.world=bpy.data.worlds.new('Daylight')
bpy.context.scene.world.color=(.3,.4,.5)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.clip_end=2000
            area.spaces.active.region_3d.view_distance=210
            area.spaces.active.region_3d.view_location=xyz((0,8,-10))
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'jiangwan.blend'))
print('JIANGWAN_BUILD '+json.dumps({k:v for k,v in report.items() if k!='colliders'}))
