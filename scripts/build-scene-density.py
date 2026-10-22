"""Blender 5.2: assemble the approved kit into the 66 m street sample.

Run through Blender MCP execute_blender_code, or Blender --python for a rebuild.
All layout coordinates are metres in game X/Y/Z; Blender uses X/-Z/Y.
"""
from pathlib import Path
from math import pi, sin, cos
import bpy
import json
import hashlib

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / '.asset-source/scene-density'
DEST = ROOT / 'public/assets/scene-density'
LAYOUT = json.loads((SOURCE / 'layout.json').read_text())
DEST.mkdir(parents=True, exist_ok=True)
# Keep the installed MCP service alive while clearing the previous scene.
for obj in list(bpy.data.objects): bpy.data.objects.remove(obj, do_unlink=True)
def build():
    bpy.context.scene.unit_settings.system = 'METRIC'
    templates = {}
    materials = {}


    def point(p): return (p[0], -p[2], p[1])


    def material(name, color):
        if name not in materials:
            m = bpy.data.materials.new(name)
            m.diffuse_color = (*color, 1)
            m.use_nodes = True
            bsdf = m.node_tree.nodes.get('Principled BSDF')
            bsdf.inputs['Base Color'].default_value = (*color, 1)
            bsdf.inputs['Roughness'].default_value = .82
            materials[name] = m
        return materials[name]


    def cube(name, size, p, mat, collider=False):
        x,y,z=size[0]/2,size[2]/2,size[1]/2
        mesh=bpy.data.meshes.new(name)
        mesh.from_pydata([(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),
                          (-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)],[],
                         [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
        mesh.update();uv_layer=mesh.uv_layers.new()
        color=mesh.color_attributes.new('Color','BYTE_COLOR','CORNER')
        color.data.foreach_set('color',[1.0]*(len(mesh.loops)*4))
        obj=bpy.data.objects.new(name,mesh)
        bpy.context.collection.objects.link(obj);obj.location=point(p)
        mesh.materials.append(mat)
        for polygon in mesh.polygons:
            for loop in polygon.loop_indices:
                v=mesh.vertices[mesh.loops[loop].vertex_index].co
                if abs(polygon.normal.z)>.5: uv=(v.x/2,v.y/2)
                elif abs(polygon.normal.y)>.5: uv=(v.x/2,v.z/2)
                else: uv=(v.y/2,v.z/2)
                uv_layer.data[loop].uv=uv
        if collider: empty(name + ' collision', p, {'collider': size})
        return obj


    def empty(name, p, extras):
        obj = bpy.data.objects.new(name, None)
        bpy.context.collection.objects.link(obj)
        obj.location = point(p)
        for key, value in extras.items(): obj[key] = value
        return obj


    def load(key, path):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(path))
        objects = set(bpy.data.objects) - before
        meshes = [o for o in objects if o.type == 'MESH']
        # Imported assets use repeated material/image names; share identical originals.
        for obj in meshes:
            for slot in obj.material_slots:
                base = slot.material.name.split('.')[0]
                if base in materials: slot.material = materials[base]
                else: materials[base] = slot.material
            bpy.context.view_layer.update()
            obj.data.transform(obj.matrix_world)
            obj.matrix_world.identity()
        templates[key] = [(obj.name, obj.data) for obj in meshes]
        for obj in objects: bpy.data.objects.remove(obj, do_unlink=True)


    def kit(key, p, yaw=0, scale=1):
        for _, data in templates[key]:
            obj = bpy.data.objects.new(key, data)
            bpy.context.collection.objects.link(obj)
            obj.location = point(p)
            obj.rotation_euler.z = yaw
            obj.scale = (scale, scale, scale)


    def export(name):
        bpy.ops.export_scene.gltf(filepath=str(DEST / (name + '.glb')), export_format='GLB',
            export_extras=True, export_yup=True, export_animations=False, export_cameras=False,
            export_lights=False, export_image_format='AUTO', export_all_vertex_colors=False)


    stone = material('Density limestone', (.48,.46,.41))
    roof = material('Density roof membrane', (.18,.20,.20))
    metal = material('Density dark metal', (.09,.13,.14))
    massing = material('D2 untextured massing', (.56,.58,.56))
    trim = material('Density pale trim', (.72,.70,.62))


    def shell(b, white=False):
        x,z,w,d = b['x'],b['z'],b['width'],b['depth']
        h = 4 + b['floors'] * 3
        mat = massing if white else stone
        if not b.get('shop') or white:
            cube(b['id'], (w if white else w-.6,h,d if white else d-.6), (x,h/2+.16,z), mat)
            empty(b['id']+' collision',(x,h/2+.16,z),{'collider':[w,h,d]})
        else:
            cube(b['id']+' upper body',(w-.6,h-4,d-.6),(x,(h+4)/2+.16,z),mat)
            empty(b['id']+' upper collision',(x,(h+4)/2+.16,z),{'collider':[w,h-4,d]})
            cube(b['id']+' back',(w,4,.3),(x,2.16,z+(-d/2 if z<0 else d/2)),mat,True)
            for side in [-1,1]:
                cube(b['id']+' side',(.3,4,d),(x+side*(w/2-.15),2.16,z),mat,True)
            cube(b['id']+' shop floor',(w,.16,d),(x,.08,z),stone,True)
            front = z + (d/2 if z<0 else -d/2)
            for i in range(int(w/4)):
                px=x-w/2+2+i*4
                cube('Shop pier',(.22,4,.5),(px-1.9,2.16,front),trim,True)
                empty('Breakable glazing',(px,2.16,front),{'densityPanel':[3.55,3.8,.18]})
            cube('Shop lintel',(w,.3,.6),(x,4.05,front),trim)
        if not white:
            cube('Flat accessible roof',(w,.2,d),(x,h+.16,z),roof,True)
            for s in [-1,1]:
                cube('Parapet',(w,.5,.2),(x,h+.5,z+s*(d/2-.1)),trim,True)
                cube('Parapet',(.2,.5,d),(x+s*(w/2-.1),h+.5,z),trim,True)
        return h+.26


    # D2 is an explicit export of exactly the same plots used by the sample.
    for b in LAYOUT['plots']: shell(b, True)
    export('whitebox')
    for obj in list(bpy.data.objects): bpy.data.objects.remove(obj, do_unlink=True)

    for key in ['Brick_Window_Trim_Single','Brick_Window_Square_Single','Brick_Plain_4',
                'Brick_Inset_Window_Curved','Brick_RedWhite_DoubleWindow','Cornice_Brick_Center','Cornice_Trim_Center']:
        load(key, SOURCE / 'quaternius/input' / (key + '.gltf'))

    roofs = []
    for index,b in enumerate(LAYOUT['plots']):
        backdrop = not b['sample'] and (b['x']<0 or (14<b['x']<54 and abs(b['z'])<40))
        h = shell(b, not b['sample'])
        if backdrop:
            # Only the immediate sample sightlines receive a textured backdrop;
            # distant D2 massing remains explicit until D7 approval.
            obj=bpy.data.objects.get(b['id'])
            obj.data.materials.clear();obj.data.materials.append(materials['MI_RedBrick'])
            x,z,w,d=b['x'],b['z'],b['width'],b['depth']
            glazing=material('Context glazing',(.16,.24,.26))
            for face in range(4):
                span=w if face%2==0 else d
                for floor in range(b['floors']):
                    for col in range(max(1,int(span/4))):
                        u=-span/2+(col+.5)*span/max(1,int(span/4))
                        p=(x+u,5.4+floor*3,z+(1 if face==0 else -1)*(d/2+.04)) if face%2==0 else (x+(1 if face==1 else -1)*(w/2+.04),5.4+floor*3,z+u)
                        size=(1.5,1.8,.08) if face%2==0 else (.08,1.8,1.5)
                        cube('Context window',size,p,glazing)
            cube('Context roof cap',(w+.3,.25,d+.3),(x,h,z),trim,True)
        if not b['sample']: continue
        x,z,w,d=b['x'],b['z'],b['width'],b['depth']
        roofs.append({'id':b['id'],'point':[x,h,z]})
        # Four complete facades, including service lane and building backs.
        for face in range(4):
            yaw = face*pi/2
            span = w if face%2==0 else d
            edge = d/2 if face%2==0 else w/2
            for floor in range(b['floors']):
                key = 'Brick_Window_Trim_Single' if index%2 and index not in [3,5] else 'Brick_Window_Square_Single'
                step=2
                if index%3==0 and span%4==0:
                    key='Brick_Inset_Window_Curved' if floor%2 else 'Brick_RedWhite_DoubleWindow'; step=4
                for col in range(int(span/step)):
                    u=-span/2+step*(col+.5)
                    px=x+u*cos(yaw)+(edge+.02)*sin(yaw)
                    pz=z-u*sin(yaw)+(edge+.02)*cos(yaw)
                    kit(key,(px,4.16+floor*3,pz),yaw)
            for col in range(int(span/2)):
                u=-span/2+1+col*2
                px=x+u*cos(yaw)+(edge+.04)*sin(yaw)
                pz=z-u*sin(yaw)+(edge+.04)*cos(yaw)
                kit('Cornice_Brick_Center' if index%2 else 'Cornice_Trim_Center',(px,h-.2,pz),yaw)
                if not b.get('shop') or face != (0 if z<0 else 2):
                    kit('Brick_Plain_4',(px,.16,pz),yaw)
        # Roof service equipment stays clear of the central landing pad.
        cube('Roof access stairwell',(3,2.5,3),(x-w*.28,h+1.25,z+d*.27),stone,True)
        for offset in [-1.5,1.5]:
            cube('Roof vent',(.8,.8,1.2),(x+offset,h+.4,z-d*.28),metal,True)
        empty('Roof aircon',(x+w*.26,h,z+d*.22),{'densityProp':'aircon','height':.9,'hp':90})

    # Markers keep runtime interactions in the same editable Blender layout.
    for x,z in [(-88,15.7),(-72,-15.7),(-49,15.7),(-25,-15.7),(-34,40)]:
        empty('Street seating',(x,.16,z),{'densityProp':'seating','height':.9,'hp':100})
    for x,z in [(-82,-16),(-64,16),(-43,-15.8),(-39,16),(-23,16),(-33,32),(-32.5,-38)]:
        empty('Planter',(x,.16,z),{'densityProp':'pottedPlant','height':1.35,'hp':45})
    for x,z in [(-82,16),(-69,-16),(-36,16),(-33,42),(-32.5,-46)]:
        empty('Street bin',(x,.16,z),{'densityProp':'bin','height':1,'hp':60})
    for x,z in [(-49,-15.8),(-39,-15.8),(-49,15.8),(-43,15.8)]:
        empty('Cafe tables',(x,.16,z),{'densityProp':'cafeSet','height':.95,'hp':70})
    for x,z,yaw in [(-51,-31,pi/2),(-51,31,pi/2),(-25,-30,0)]:
        obj=empty('Service aircon',(x,2.4,z),{'densityProp':'aircon','height':.7,'hp':90})
        obj.rotation_euler.z=yaw
    for x,z in [(-84,-16),(-67,16),(-35,36),(-32.3,-48),(-22,16)]:
        empty('Tree',(x,.16,z),{'densityTree':True})
    # Campus portal spans the open 10 m entry, with no body across the passage.
    for x in [-38,-28]: cube('Campus gate pier',(.55,4.4,.55),(x,2.36,20),stone,True)
    cube('Campus gate header',(10.55,.55,.65),(-33,4.56,20),metal,True)
    campus_sign=empty('Campus sign',(-33,4.55,19.64),{'densitySign':'NORTHBANK / COURTYARD','width':3.6})
    campus_sign.rotation_euler.z=pi
    for b in LAYOUT['plots']:
        if b.get('shop'):
            front=b['z']+(b['depth']/2 if b['z']<0 else -b['depth']/2)
            marker=empty('Shop sign',(b['x'],3.8,front+(.32 if b['z']<0 else -.32)),
                         {'densitySign':'NORTHBANK COFFEE' if b['z']<0 else 'DAILY / MARKET','width':8})
            if b['z']>0: marker.rotation_euler.z=pi
    empty('Scene layout',(0,0,0),{'sceneDensity':True,'sampleLength':66})

    # Merge static objects by material after baking all transforms. Interactions
    # and collision empties stay independent; cached geometry is protected at runtime.
    meshes=[obj for obj in bpy.data.objects if obj.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes: obj.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    bpy.ops.object.join()
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
    for obj in bpy.data.objects:
        if obj.type=='MESH':
            obj.name='Static / '+obj.data.materials[0].name
            while len(obj.data.uv_layers)>1: obj.data.uv_layers.remove(obj.data.uv_layers[-1])
    for image in bpy.data.images:
        if image.size[0]>1024 or image.size[1]>1024: image.scale(1024,1024)
        if image.has_data: image.pack()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'street-sample.blend'))
    export('street-sample')

    # A04: one clean and one rusted variant kept as separate grounded exports.
    # A05: assembled seat, supports and back; connector samples are excluded.
    for name,key in [('exterior_aircon_unit','aircon'),('modular_street_seating','seating')]:
        for obj in list(bpy.data.objects): bpy.data.objects.remove(obj,do_unlink=True)
        path=next((SOURCE/name/'gltf').glob('*.gltf'))
        bpy.ops.import_scene.gltf(filepath=str(path))
        objects=[obj for obj in bpy.data.objects if obj.type=='MESH']
        if key=='aircon':
            for obj in objects:
                if 'rusted' in obj.name: bpy.data.objects.remove(obj,do_unlink=True)
        else:
            for obj in objects:
                if obj.name.startswith(('connector','suspended_support','seat_bench')):
                    bpy.data.objects.remove(obj,do_unlink=True)
        export(key)

    stats={'layout':LAYOUT,'roofLandings':roofs,'blender':bpy.app.version_string,
           'pipeline':'scripts/build-scene-density.py','builderSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
           'layoutSha256':hashlib.sha256((SOURCE/'layout.json').read_bytes()).hexdigest(),
           'inputsSha256':hashlib.sha256((SOURCE/'provenance.json').read_bytes()).hexdigest()}
    for path in DEST.glob('*.glb'):
        data=path.read_bytes();stats[path.stem]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
    (DEST/'build.json').write_text(json.dumps(stats,indent=2)+'\n')
    print('SCENE_DENSITY_BUILD_COMPLETE',json.dumps({k:v for k,v in stats.items() if k not in ['layout','roofLandings']}))


window = bpy.context.window_manager.windows[0]
area = next((a for a in window.screen.areas if a.type == 'VIEW_3D'), window.screen.areas[0])
area.type = 'VIEW_3D'
region = next(r for r in area.regions if r.type == 'WINDOW')
with bpy.context.temp_override(window=window, area=area, region=region):
    build()
