"""Offline ARP Remap/Universal export. Run with Blender, never in the game."""
import argparse
import hashlib
import json
import gzip
from pathlib import Path
import sys

import bpy
from mathutils import Matrix

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--source', default=str(ROOT / '.asset-source/homelander/rig.blend'))
parser.add_argument('--only', default='')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
out = ROOT / '.artifacts/homelander'
out.mkdir(parents=True, exist_ok=True)
addon_folder = Path.home() / 'Library/Application Support/Blender/5.2/extensions/user_default'
sys.path.insert(0, str(addon_folder))
bpy.ops.preferences.addon_enable(module='auto_rig_pro')
import auto_rig_pro as arp

# ARP 3.78.32 still accesses pre-4.4 ActionsData fields. Keep the official
# retarget/bake/export code intact; adapt only this versioned glTF hook.
def gather_actions_52(self, obj, params, settings):
    if 'arp_rig_name' not in obj:
        return
    names = set(self.export_action_only.split('|%%|'))
    for action_id, rows in list(params.actions.items()):
        kept = [row for row in rows if 'arp_baked_action' in row.action
                and (self.export_action_only == 'all_actions' or row.action.name in names)]
        if kept:
            params.actions[action_id] = kept
        else:
            del params.actions[action_id]
arp.glTF2ExportUserExtension.gather_actions_hook = gather_actions_52

bpy.ops.wm.open_mainfile(filepath=args.source)
scn = bpy.context.scene
scn.render.fps = 30
target = bpy.data.objects['rig']
mesh = bpy.data.objects['tripo_node_f6a19988']
if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
for action in bpy.data.actions:
    action['arp_export'] = False
target.animation_data.action = None
for bone in target.pose.bones:
    bone.matrix_basis = Matrix.Identity(4)
scn.frame_set(1)

manifest = json.loads((ROOT / 'actions/manifest.json').read_text())
input_paths = [Path(args.source).resolve(), ROOT / 'actions/manifest.json',
               *(ROOT / 'actions' / r['filename'] for r in manifest['assets']),
               ROOT / '.asset-source/mesh2motion/human-addon-animations.glb',
               ROOT / '.asset-source/mesh2motion/human-base-animations.glb']
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
generation = {'inputs': {str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p): sha(p)
                         for p in input_paths}, 'adapterSha256': sha(Path(__file__))}
clips = []
def retarget(name, src, file, custom_pairs=None):
    source_action = src.animation_data.action
    target.animation_data.action = None
    for bone in target.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    # Unit/height normalization is static and does not author any body pose.
    target_hips = (target.matrix_world @ target.data.bones['c_root_master.x'].head_local).z
    source_hips = (src.matrix_world @ src.data.bones['pelvis' if custom_pairs else 'mixamorig:Hips'].head_local).z
    src.scale *= target_hips / source_hips
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    scn.target_rig = target.name
    scn.source_rig = src.name
    scn.batch_retarget = False
    scn.arp_retarget_in_place = name in ['run', 'sprint', 'walk']
    bpy.ops.arp.build_bones_list()
    if custom_pairs:
        scn.bones_map_v2.clear()
        scn.arp_remap_allow_root_update = False
        for source_name, target_name in custom_pairs:
            assert source_name in src.data.bones and target_name in target.pose.bones
            item = scn.bones_map_v2.add()
            item.source_bone = source_name
            item.name = target_name
            item.set_as_root = target_name == 'c_root_master.x'
        scn.arp_remap_allow_root_update = True
    else:
        try:
            bpy.ops.arp.import_config_preset(preset_name='mixamo_fk', clear_current=True)
        except RuntimeError as error:
            # XBot has no eye bones; ARP still imports the complete body mapping.
            if 'LeftEye' not in str(error) or 'RightEye' not in str(error):
                raise
    start, end = [round(f) for f in source_action.frame_range]
    mapping = [(m.source_bone, m.name) for m in scn.bones_map_v2 if m.name in target.pose.bones]
    print('REMAP_BEGIN', name, start, end, target_hips, source_hips, mapping, flush=True)
    bpy.ops.arp.retarget('EXEC_DEFAULT', frame_start=start, frame_end=end,
        fake_user_action=True, interpolation_type='LINEAR', handle_type='AUTO_CLAMPED',
        only_existing_keyframes=False, clean_fk_rot=False, clean_ik_pole=False,
        extract_root_motion=False)
    action = target.animation_data.action
    action.name = name
    action.use_fake_user = True
    action['arp_export'] = True
    clips.append({'name': name, 'source': str(file.relative_to(ROOT)),
                  'sourceClip': source_action.name, 'frames': [start, end], 'mapping': mapping})
    print('REMAP_DONE', name, flush=True)

for record in manifest['assets']:
    name = record['id']
    if args.only and name not in args.only.split(','):
        continue
    before = set(bpy.data.objects)
    file = ROOT / 'actions' / record['filename']
    assert hashlib.sha256(file.read_bytes()).hexdigest() == record['sha256']
    bpy.ops.import_scene.fbx(filepath=str(file))
    imported = set(bpy.data.objects) - before
    src = next(o for o in imported if o.type == 'ARMATURE')
    retarget(name, src, file)
    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)

if not args.only:
    pairs = [('pelvis','c_root_master.x'),('spine_01','c_spine_01.x'),
        ('spine_02','c_spine_02.x'),('spine_03','c_spine_03.x'),
        ('neck_01','c_neck.x'),('head','c_head.x')]
    for side in ['l','r']:
        for source_name, target_name in [('clavicle','shoulder'),('upperarm','arm_fk'),
                ('lowerarm','forearm_fk'),('hand','hand_fk'),('thigh','thigh_fk'),
                ('calf','leg_fk'),('foot','foot_fk'),('ball','toes_fk')]:
            pairs.append((f'{source_name}_{side}',f'c_{target_name}.{side}'))
        for finger in ['thumb','index','middle','ring','pinky']:
            for i in range(1,4):
                pairs.append((f'{finger}_0{i}_{side}',f'c_{finger}{i}.{side}'))
    from auto_rig_pro.src.lib.animation import assign_armature_action
    for bundle, motions in [
        ('addon', [('walk','Walk_Female'),('takeoff','Levitate Entrance'),
                   ('hover','Levitate Idle'),('land','Land_Three_Point'),
                   ('slam','Attack_Ground_Pound')]),
        ('base', [('fall','Jump_air'),('jump_start','Jump_Start'),('jump_land','Jump_Land')]),
    ]:
        file = ROOT / f'.asset-source/mesh2motion/human-{bundle}-animations.glb'
        before = set(bpy.data.objects)
        before_actions = set(bpy.data.actions)
        bpy.ops.import_scene.gltf(filepath=str(file))
        imported = set(bpy.data.objects) - before
        imported_actions = set(bpy.data.actions) - before_actions
        src = next(o for o in imported if o.type == 'ARMATURE')
        for name, source_name in motions:
            action = next(a for a in imported_actions if a.name.split('.')[0] == source_name)
            assign_armature_action(src,action)
            retarget(name,src,file,pairs)
        for obj in imported:
            bpy.data.objects.remove(obj,do_unlink=True)

for action in bpy.data.actions:
    action['arp_export'] = action.name in {clip['name'] for clip in clips}

# glTF/Three.js uses linear skinning with four influences. Measure that exact
# export representation against Blender, including fingers, soles and cape.
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True)
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
for modifier in mesh.modifiers:
    if modifier.type == 'ARMATURE':
        modifier.use_deform_preserve_volume = False
vertices = set(range(0,len(mesh.data.vertices),max(1,len(mesh.data.vertices)//180)))
for group in mesh.vertex_groups:
    weighted = [(vg.weight,v.index) for v in mesh.data.vertices for vg in v.groups if vg.group == group.index]
    if weighted:
        vertices.add(max(weighted)[1])
vertices = sorted(vertices)
convert = lambda p: [round(p.x,6),round(p.z,6),round(-p.y,6)]
reference = {'vertices':[convert(mesh.matrix_world @ mesh.data.vertices[i].co) for i in vertices], 'clips':[]}
from auto_rig_pro.src.lib.animation import assign_armature_action
for clip in clips:
    action = bpy.data.actions[clip['name']]
    target.animation_data.action = None
    for bone in target.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    assign_armature_action(target,action)
    bpy.context.view_layer.update()
    scn.frame_set(clip['frames'][0]-1)
    samples = []
    for frame in range(clip['frames'][0],clip['frames'][1]+1):
        scn.frame_set(frame)
        evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        evaluated_mesh = evaluated.to_mesh()
        samples.append({'time':(frame-clip['frames'][0])/30,
            'vertices':[convert(evaluated.matrix_world @ evaluated_mesh.vertices[i].co) for i in vertices]})
        evaluated.to_mesh_clear()
    reference['clips'].append({'name':clip['name'],'samples':samples})
with gzip.open(out / 'blender-reference.json.gz','wt') as stream:
    json.dump(reference,stream,separators=(',',':'))

settings = dict(arp_export_rig_type='UNIVERSAL', arp_engine_type='OTHERS',
    arp_export_format_copy='GLTF', arp_export_rig_name='root', arp_bake_anim=True,
    arp_bake_type='ACTIONS', arp_frame_range_type='FULL', arp_bake_only_active=False,
    arp_ge_reset_transforms=True,
    arp_bake_only_active_slot=True, arp_export_use_actlist=False,
    arp_export_separate_fbx=False, arp_export_act_name='NONE', arp_export_name_string='',
    arp_ge_sel_only=True, arp_ge_sel_bones_only=False, arp_ge_gltf_format='GLB',
    arp_ge_gltf_unitsx100=False, arp_ge_gltf_sample_anim=True,
    arp_ge_gltf_anim_start_zero=True, arp_ge_gltf_export_frame_step=1,
    arp_simplify_fac=0.0, arp_ge_master_traj=False, arp_ue_root_motion=False,
    arp_export_noparent=False)
for prop, value in settings.items():
    setattr(scn, prop, value)
bpy.ops.object.select_all(action='DESELECT')
target.select_set(True)
mesh.select_set(True)
bpy.context.view_layer.objects.active = target
scn.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(out / 'homelander-actions.blend'))
bpy.ops.arp.arp_export_gltf_panel('EXEC_DEFAULT', filepath=str(out / 'homelander-raw.glb'))
for path, digest in generation['inputs'].items():
    assert sha(ROOT / path) == digest, f'Input changed during export: {path}'
assert sha(Path(__file__)) == generation['adapterSha256'], 'Adapter changed during export'
generation['rawExportSha256'] = sha(out / 'homelander-raw.glb')
generation['referenceSha256'] = sha(out / 'blender-reference.json.gz')
(out / 'adaptation.json').write_text(json.dumps({'tool': 'Auto-Rig Pro 3.78.32 Remap + Universal GLTF',
    'blender': bpy.app.version_string, 'source': args.source,
    'sourceSha256': hashlib.sha256(Path(args.source).read_bytes()).hexdigest(),
    'keyframesAuthoredHere': False, 'generation': generation, 'clips': clips}, indent=2) + '\n')
print('HOMELANDER_EXPORT_DONE', flush=True)
