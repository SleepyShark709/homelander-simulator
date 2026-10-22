"""Run through the installed Blender MCP; preserve source UVs and material names.

The caller supplies __file__ when executing this file through MCP. No paid tools,
downloads, source FBX edits, or changes to the character scene on disk are made.
"""
from pathlib import Path
import hashlib
import json
import math
from itertools import product
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / '.artifacts/graffiti-stairs/raw/geometry.glb'
OUT = ROOT / '.artifacts/graffiti-city'
EDITABLE = ROOT / '.asset-source/graffiti-city'
OUT.mkdir(parents=True, exist_ok=True)
EDITABLE.mkdir(parents=True, exist_ok=True)

# Work in memory after the other Blender session has saved and released its lock.
# Its character .blend is never overwritten.
if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for collection in list(bpy.data.collections):
    bpy.data.collections.remove(collection)
for datablocks in [bpy.data.meshes, bpy.data.materials]:
    for block in list(datablocks):
        if not block.users:
            datablocks.remove(block)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
scene = bpy.context.scene
scene.name = 'Graffiti city — editable modules and urban layout'
source_objects = list(scene.objects)
buildings = [o for o in source_objects if o.name.startswith('Building_') and o.type == 'EMPTY'
             and not o.parent.name.startswith('Building_')]
assert len(buildings) == 6, [o.name for o in buildings]

library = bpy.data.collections.new('Export — shared prototype library')
scene.collection.children.link(library)
assembly = bpy.data.collections.new('City layout — linked prototype instances')
scene.collection.children.link(assembly)
prototypes, report = {}, {}

def descendants(parent):
    return [o for o in parent.children_recursive if o.type == 'MESH']

def combine(name, objects, transform):
    copies = []
    for original in objects:
        obj = bpy.data.objects.new(name + '_part', original.data.copy())
        obj.data.transform(transform @ original.matrix_world)
        library.objects.link(obj)
        copies.append(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in copies:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    if len(copies) > 1:
        bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    # glTF material slots are shared by name across all three LODs.
    bpy.ops.object.material_slot_remove_unused()
    return obj

def triangles(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)

for original in sorted(buildings, key=lambda o: o.name):
    parts = descendants(original)
    points = [o.matrix_world @ Vector(corner) for o in parts for corner in o.bound_box]
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    # Blender Z is height. Keep the source ground at 0, including buried wall feet.
    center = Vector(((low.x + high.x)/2, (low.y + high.y)/2, 0))
    name = original.name.removeprefix('Building_')
    facade = next(o for o in parts if o.name.endswith('_Facade'))
    facade_points = [facade.matrix_world @ Vector(c) for c in facade.bound_box]
    fl = Vector(tuple(min(p[i] for p in facade_points) for i in range(3)))
    fh = Vector(tuple(max(p[i] for p in facade_points) for i in range(3)))
    windows = []
    for window in [o for o in parts if '_Window_' in o.name]:
        points = [window.matrix_world @ Vector(c) for c in window.bound_box]
        sill = min(p.z for p in points)
        wc = sum(points, Vector())/len(points)-center
        faces = {'+X':abs(wc.x-(fh.x-center.x)), '-X':abs(wc.x-(fl.x-center.x)),
                 '-Z':abs(wc.y-(fh.y-center.y)), '+Z':abs(wc.y-(fl.y-center.y))}
        face = min(faces,key=faces.get)
        windows.append({'face':face,'sill':sill,'position':[wc.x,0,-wc.y],'object':window})
    preferred = {'AcrossStreet_Beige':'-Z','Annex_Ochre':'-Z','Back_Pink':'+Z',
                 'Backdrop_Brick':'+Z','Left_Ochre':'+X','Right_Cream':'-X'}[name]
    candidates = [w for w in windows if w['face'] == preferred]
    bottom = min(w['sill'] for w in candidates)
    chosen = min([w for w in candidates if w['sill'] < bottom+.1],
                 key=lambda w:abs(w['position'][2] if preferred.endswith('X') else w['position'][0]))
    # Convert one real ground-floor window into an entrance. Keep the original
    # corner untouched; only the flat-street module omits that window assembly.
    parts = [o for o in parts if o != chosen['object']]
    # Fit the long beige frontage to a corner lot without changing floor/window
    # heights. Its original 28.44 m width becomes 26.25 m (7.7% shorter).
    width_scale = 26.25/(high.x-low.x) if name == 'AcrossStreet_Beige' else 1
    transform = Matrix.Diagonal((width_scale,1,1,1)) @ Matrix.Translation(-center)
    base = combine(name + '_L0', parts, transform)
    base['prototype'] = name
    base['lod'] = 0
    prototypes[name] = base
    levels = [triangles(base)]
    for level, ratio in [(1, .22), (2, .065)]:
        obj = bpy.data.objects.new(name + f'_L{level}', base.data.copy())
        library.objects.link(obj)
        obj['prototype'] = name
        obj['lod'] = level
        bpy.context.view_layer.objects.active = obj
        modifier = obj.modifiers.new('Offline detail reduction', 'DECIMATE')
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        levels.append(triangles(obj))
    # Main roof height comes from the largest upward horizontal surface cluster;
    # chimney/rail tips must not become an invisible elevated landing surface.
    roof_areas = {}
    for face in base.data.polygons:
        if face.normal.z > .98 and face.center.z > high.z*.5:
            key = round(face.center.z, 2)
            roof_areas[key] = roof_areas.get(key, 0) + face.area
    roof = max(roof_areas, key=roof_areas.get)
    report[name] = {'size': [(high.x-low.x)*width_scale, high.z-low.z, high.y-low.y],
                    'center': [center.x, 0, -center.y-20], 'triangles': levels,
                    'collider': {'size': [(fh.x-fl.x)*width_scale, roof, fh.y-fl.y],
                                 'offset': [((fl.x+fh.x)/2-center.x)*width_scale, roof/2, center.y-(fl.y+fh.y)/2]},
                    'roofY': roof}
    sill = min(w['sill'] for w in windows)
    report[name]['groundShift'] = -max(0,sill-.9)
    chosen['position'][0] *= width_scale
    report[name]['entries'] = {preferred:chosen['position']}
    # The wall body stops at the eaves. The authored pitched roof above it is
    # exported as a separate exact collision surface, shared by all instances.
    roof_collision = combine(name+'_Roof', [facade], transform)
    mesh = roof_collision.data
    import bmesh
    editable = bmesh.new();editable.from_mesh(mesh)
    bmesh.ops.delete(editable,geom=[f for f in editable.faces if
        max(v.co.z for v in f.verts) < roof-.02],context='FACES')
    editable.to_mesh(mesh);editable.free();mesh.update()
    roof_collision['collisionOnly'] = True

# Keep the accepted authored stair corner once. Its street and the opposite
# building are omitted so the existing roads can pass through the new city.
across = next(o for o in buildings if o.name == 'Building_AcrossStreet_Beige')
street = next(o for o in source_objects if o.name == 'Street')
excluded = set([across, street] + list(across.children_recursive) + list(street.children_recursive))
corner_parts = []
for obj in source_objects:
    if obj.type != 'MESH' or obj in excluded:
        continue
    bounds = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    # Loose decals belonging to the opposite building stay out of the stair corner.
    if -sum(p.y for p in bounds)/len(bounds)-20 > 12:
        continue
    corner_parts.append(obj)
corner = combine('Stair_Corner', corner_parts, Matrix.Translation((0, 20, 0)))
corner['landmark'] = True
corner['triangles'] = triangles(corner)
stairs = next(o for o in source_objects if o.name == 'Staircase')
collision = combine('Stair_Collision', descendants(stairs), Matrix.Translation((0, 20, 0)))
collision['collisionOnly'] = True

# Four-by-four street blocks, with variations in orientation and courtyard use.
# All placements use measured source dimensions, leaving the road grid clear.
bands = [(-97, -64), (-52, -13), (13, 52), (64, 97)]
sidewalk_edges = [(-100,-61.6),(-54.4,-10),(10,54.4),(61.6,100)]
placements = []
courtyards = []
def place(kind, x, z, yaw=0, height=1):
    placements.append({'prototype': kind, 'position': [x, report[kind]['groundShift']*height, z], 'yaw': yaw, 'height': height})

for ix, (x0, x1) in enumerate(bands):
    for iz, (z0, z1) in enumerate(bands):
        if (ix, iz) == (2, 2):
            continue
        cx, cz = (x0+x1)/2, (z0+z1)/2
        rotate = math.pi/2 if (ix+iz) % 2 else 0
        # Swap the local dimensions before rotating a rectangular street block.
        lx0,lx1,lz0,lz1 = x0,x1,z0,z1
        if rotate:
            lx0,lx1 = cx-(z1-z0)/2,cx+(z1-z0)/2
            lz0,lz1 = cz-(x1-x0)/2,cz+(x1-x0)/2
        def at(kind, x, z, yaw=0, height=1):
            dx, dz = x-cx, z-cz
            place(kind, cx+math.cos(rotate)*dx+math.sin(rotate)*dz,
                  cz-math.sin(rotate)*dx+math.cos(rotate)*dz, yaw+rotate, height)
        north = 'Left_Ochre' if (ix+iz) % 3 == 0 and lz1-lz0 > 38 else 'Backdrop_Brick'
        north_depth = report[north]['size'][0] if north == 'Left_Ochre' else report[north]['size'][2]
        north_width = report[north]['size'][2] if north == 'Left_Ochre' else report[north]['size'][0]
        at(north, lx0+north_width/2, lz1-north_depth/2, -math.pi/2 if north == 'Left_Ochre' else 0,
           [.94, 1, 1.06][(ix*3+iz)%3])
        annex_w,_,annex_d = report['Annex_Ochre']['size']
        count = int((lx1-lx0-north_width)/annex_w)
        gap = (lx1-lx0-north_width-count*annex_w)/count
        for i in range(count):
            at('Annex_Ochre',lx0+north_width+gap+(i+.5)*annex_w+i*gap,lz1-annex_d/2,math.pi)
        north_depth = max(north_depth,annex_d)
        beige_w,_,beige_d = report['AcrossStreet_Beige']['size']
        at('AcrossStreet_Beige',lx0+beige_w/2,lz0+beige_d/2)
        at('Annex_Ochre',lx1-annex_w/2,lz0+annex_d/2)
        front,back = lz0+beige_d,lz1-north_depth

        # Fill measured frontage strips with whole existing houses. Keep one
        # deliberate courtyard entrance; other joins are narrow party-wall gaps.
        def pack(length,options):
            candidates = [items for n in range(1,5) for items in product(options,repeat=n)
                          if sum(item[1] for item in items)+.02*(n-1) <= length]
            return max(candidates,key=lambda items:sum(item[1]*item[2] for item in items))
        strip = [('Right_Cream',report['Right_Cream']['size'][2],report['Right_Cream']['size'][0]),
                 ('Back_Pink',report['Back_Pink']['size'][0],report['Back_Pink']['size'][2]),
                 ('Annex_Ochre',annex_w,annex_d)]
        west = pack(back-front-4.16,strip)
        cursor = back
        for kind,length,depth in west:
            at(kind,lx0+depth/2,cursor-length/2,
               {'Right_Cream':0,'Back_Pink':-math.pi/2,'Annex_Ochre':math.pi/2}[kind],.97)
            cursor -= length+.02
        west_gap = cursor+.02-front
        # Below the long south building's rear edge, only the narrow annex fits.
        east_options = [item for item in strip if item[2] < lx1-lx0-beige_w]
        east = pack(back-(lz0+annex_d),east_options)
        cursor = back
        for kind,length,depth in east:
            at(kind,lx1-depth/2,cursor-length/2,
               {'Right_Cream':math.pi,'Back_Pink':math.pi/2,'Annex_Ochre':-math.pi/2}[kind],1.03)
            cursor -= length+.02
        inner_left,inner_right = lx0+max(item[2] for item in west),lx1-max(item[2] for item in east)
        rear_options = [('Right_Cream',report['Right_Cream']['size'][2],report['Right_Cream']['size'][0]),
                        ('Back_Pink',report['Back_Pink']['size'][0],report['Back_Pink']['size'][2]),
                        ('Annex_Ochre',annex_w,annex_d)]
        rear = pack(inner_right-inner_left,rear_options)
        cursor = inner_left
        for kind,width,depth in rear:
            at(kind,cursor+width/2,back-depth/2,-math.pi/2 if kind == 'Right_Cream' else math.pi)
            cursor += width+.02
        court_depth = back-max(item[2] for item in rear)-front
        fill = int((inner_right-inner_left-9)/annex_w) if court_depth > 10 else 0
        for i in range(fill):
            at('Annex_Ochre',inner_right-(i+.5)*annex_w,front+annex_d/2,math.pi)
        court_right = inner_right-fill*annex_w
        def point(x,z):
            dx,dz=x-cx,z-cz
            return [cx+math.cos(rotate)*dx+math.sin(rotate)*dz,0,cz-math.sin(rotate)*dx+math.cos(rotate)*dz]
        courtyards.append({'position':point((inner_left+court_right)/2,front+court_depth/2),
                           'yaw':rotate,'width':court_right-inner_left,'depth':court_depth,
                           'entry':{'position':point(lx0+1.4,front+west_gap/2),'yaw':rotate+math.pi/2,
                                    'width':min(4.6,west_gap-.36)}})

# The opposite beige frontage now sits across the secondary street in the next block.
landmark = {'position': [39, 0, 48.5], 'yaw': 0}
# Enclose the authored corner with source buildings along its two empty edges.
place('AcrossStreet_Beige',13+report['AcrossStreet_Beige']['size'][2]/2,13+report['AcrossStreet_Beige']['size'][0]/2,math.pi/2)
place('Annex_Ochre',13+report['Annex_Ochre']['size'][2]/2,52-report['Annex_Ochre']['size'][0]/2,math.pi/2)
for i in range(3):
    place('Back_Pink',24.6+(i+.5)*report['Back_Pink']['size'][0],13+report['Back_Pink']['size'][2]/2,math.pi)
background = []
types = list(report)
for iz,z in enumerate([-270,-210,-150,-90,-30,30,90,150,210,270]):
    for ix,x in enumerate([-270,-210,-150,-90,-30,30,90,150,210,270]):
        if abs(x)<110 and abs(z)<110:
            continue
        for n,(dx,dz) in enumerate([(-14,-14),(14,-14),(-14,14),(14,14)]):
            kind = types[(ix*3+iz*5+n)%len(types)]
            height = [.95,1,1.08][(ix+iz+n)%3]
            background.append({'prototype':kind,'position':[x+dx,report[kind]['groundShift']*height,z+dz],
                               'yaw':(ix+iz+n)%4*math.pi/2,'height':height,'distant':True})
for item in placements:
    obj = bpy.data.objects.new('City — '+item['prototype'], prototypes[item['prototype']].data)
    assembly.objects.link(obj)
    x, y, z = item['position']
    obj.location = (x, -z, y)
    obj.rotation_euler.z = item['yaw']
    obj.scale.z = item['height']
obj = bpy.data.objects.new('City — original stair corner', corner.data)
assembly.objects.link(obj)
obj.location = (landmark['position'][0], -landmark['position'][2], 0)
for item in background:
    obj = bpy.data.objects.new('Distant city — '+item['prototype'],bpy.data.objects[item['prototype']+'_L2'].data)
    assembly.objects.link(obj)
    x,y,z = item['position'];obj.location = (x,-z,y);obj.rotation_euler.z=item['yaw'];obj.scale.z=item['height']
for obj in source_objects:
    bpy.data.objects.remove(obj, do_unlink=True)

layout = {'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
          'scope': 'Private local derived assets; Bala source license retained',
          'blocks': 16, 'plots':bands,'sidewalkEdges':sidewalk_edges,
          'landmark': landmark, 'buildings': placements, 'background': background,
          'courtyards': courtyards, 'prototypes': report,
          'lodRatios': [1, .22, .065]}
(OUT/'layout.json').write_text(json.dumps(layout, indent=2)+'\n')
bpy.ops.object.select_all(action='DESELECT')
for obj in library.objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'library.glb'), export_format='GLB',
    use_selection=True, export_extras=True, export_yup=True, export_tangents=False,
    export_materials='EXPORT', export_animations=False, export_cameras=False, export_lights=False)
library.hide_viewport = True
library.hide_render = True
scene['assetSource'] = str(SOURCE.relative_to(ROOT))
scene['layoutRecord'] = str((OUT/'layout.json').relative_to(ROOT))
bpy.ops.wm.save_as_mainfile(filepath=str(EDITABLE/'city.blend'))
print(json.dumps({'buildings': len(placements)+5, 'prototypes': report,
                  'landmarkTriangles': triangles(corner), 'editable': str(EDITABLE/'city.blend')}))
