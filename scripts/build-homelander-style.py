"""A1 samples: existing ARP actions + CC0 remaps + editable NLA composition.

Run adapt-homelander.py first if its validated intermediate is missing. Execute
this script in Blender (including via MCP), then pack-homelander-style.mjs.
The canonical rig and runtime GLB are never overwritten.
"""
import gzip
import hashlib
import json
import math
import re
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.artifacts/animation-style/a2/build'
OUT.mkdir(parents=True, exist_ok=True)
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
baseline = json.loads((ROOT / '.artifacts/homelander/adaptation.json').read_text())
generation = baseline['generation']
for file, digest in generation['inputs'].items():
    assert sha(ROOT / file) == digest, f'Stale intermediate input: {file}'
assert sha(ROOT / 'scripts/adapt-homelander.py') == generation['adapterSha256']
assert sha(ROOT / '.artifacts/homelander/homelander-raw.glb') == generation['rawExportSha256']
cache = ROOT / '.artifacts/homelander/homelander-actions.blend'
assert cache.exists(), 'Rebuild the intermediate with adapt-homelander.py first'
contract_path = ROOT / '.asset-source/homelander/locomotion-contract.json'
contract = json.loads(contract_path.read_text())
inputs = {**generation['inputs'], 'scripts/adapt-homelander.py': generation['adapterSha256'], 'scripts/build-homelander-style.py': sha(Path(__file__)), str(contract_path.relative_to(ROOT)): sha(contract_path)}
motion_sources = []
for folder in ['turns', 'idle', 'directional']:
    manifest_path = ROOT / '.asset-source/homelander' / folder / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    inputs[str(manifest_path.relative_to(ROOT))] = sha(manifest_path)
    for record in manifest['assets']:
        path = manifest_path.parent / record['filename']
        assert sha(path) == record['sha256']
        inputs[str(path.relative_to(ROOT))] = record['sha256']
        motion_sources.append((path, record))
sys.path.insert(0, str(Path.home() / 'Library/Application Support/Blender/5.2/extensions/user_default'))
bpy.ops.preferences.addon_enable(module='auto_rig_pro')
import auto_rig_pro as arp
from auto_rig_pro.src.lib.animation import assign_armature_action

# Keep the same versioned exporter compatibility hook as the canonical builder.
def gather_actions_52(self, obj, params, settings):
    if 'arp_rig_name' not in obj:
        return
    names = set(self.export_action_only.split('|%%|'))
    for action_id, rows in list(params.actions.items()):
        kept = [row for row in rows if 'arp_baked_action' in row.action and
                (self.export_action_only in {'', 'all_actions'} or row.action.name in names)]
        if kept:
            params.actions[action_id] = kept
        else:
            del params.actions[action_id]
arp.glTF2ExportUserExtension.gather_actions_hook = gather_actions_52

bpy.ops.wm.open_mainfile(filepath=str(cache))
def build():
    scene = bpy.context.scene
    scene.render.fps = 30
    rig = bpy.data.objects['rig']
    mesh = bpy.data.objects['tripo_node_f6a19988']
    clips = []
    directional_sources = {}
    turn_proofs = []
    transition_ends = {}
    vertices = set(range(0, len(mesh.data.vertices), max(1, len(mesh.data.vertices) // 180)))
    for group in mesh.vertex_groups:
        weighted = [(vg.weight, vertex.index) for vertex in mesh.data.vertices for vg in vertex.groups if vg.group == group.index]
        if weighted:
            vertices.add(max(weighted)[1])
    vertices = sorted(vertices)
    convert = lambda point: [round(point.x, 6), round(point.z, 6), round(-point.y, 6)]
    def reset():
        rig.animation_data.action = None
        for bone in rig.pose.bones:
            bone.matrix_basis = Matrix.Identity(4)
        scene.frame_set(0)

    def curves(action):
        return [curve for layer in action.layers for strip in layer.strips
                for bag in strip.channelbags for curve in bag.fcurves]

    # Reuse the already verified source-to-ARP mapping, not exported joint tracks.
    source_file = ROOT / '.asset-source/mesh2motion/human-addon-animations.glb'
    before, before_actions = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=str(source_file))
    imported, actions = set(bpy.data.objects) - before, set(bpy.data.actions) - before_actions
    source = next(obj for obj in imported if obj.type == 'ARMATURE')
    mapping = next(clip['mapping'] for clip in baseline['clips'] if clip['name'] == 'hover')
    height = (rig.matrix_world @ rig.data.bones['c_root_master.x'].head_local).z
    source.scale *= height / (source.matrix_world @ source.data.bones['pelvis'].head_local).z
    bpy.context.view_layer.update()
    for name, original in [('style_fly_b', 'Flying Forward Super')]:
        action = next(action for action in actions if action.name.split('.')[0] == original)
        assign_armature_action(source, action)
        reset()
        bpy.ops.object.select_all(action='DESELECT')
        rig.select_set(True)
        bpy.context.view_layer.objects.active = rig
        scene.target_rig, scene.source_rig = rig.name, source.name
        scene.batch_retarget = False
        scene.arp_retarget_in_place = False
        bpy.ops.arp.build_bones_list()
        scene.bones_map_v2.clear()
        for source_name, target_name in mapping:
            item = scene.bones_map_v2.add()
            item.source_bone, item.name = source_name, target_name
            item.set_as_root = target_name == 'c_root_master.x'
        start, end = map(round, action.frame_range)
        bpy.ops.arp.retarget('EXEC_DEFAULT', frame_start=start, frame_end=end,
            fake_user_action=True, interpolation_type='LINEAR', handle_type='AUTO_CLAMPED',
            only_existing_keyframes=False, clean_fk_rot=False, clean_ik_pole=False,
            extract_root_motion=False)
        result = rig.animation_data.action
        result.name, result.use_fake_user = name, True
        clips.append(dict(name=name, source=str(source_file.relative_to(ROOT)), sourceClip=original,
                          frames=[start, end], keyframesAuthoredHere=False, license='CC0-1.0'))
    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)

    for file, record in motion_sources:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.fbx(filepath=str(file))
        imported = set(bpy.data.objects) - before
        source = next(obj for obj in imported if obj.type == 'ARMATURE')
        action = source.animation_data.action
        source.scale *= height / (source.matrix_world @ source.data.bones['mixamorig:Hips'].head_local).z
        bpy.context.view_layer.update()
        start, end = map(round, action.frame_range)
        source_positions = []
        if 'direction' in record:
            for frame in [start, end]:
                scene.frame_set(frame)
                source_positions.append((source.matrix_world @ source.pose.bones['mixamorig:Hips'].matrix.translation).copy())
        reset()
        bpy.ops.object.select_all(action='DESELECT')
        rig.select_set(True)
        bpy.context.view_layer.objects.active = rig
        scene.target_rig, scene.source_rig = rig.name, source.name
        scene.batch_retarget, scene.arp_retarget_in_place = False, record.get('inPlaceRetarget', False)
        bpy.ops.arp.build_bones_list()
        try:
            bpy.ops.arp.import_config_preset(preset_name='mixamo_fk', clear_current=True)
        except RuntimeError as error:
            if 'LeftEye' not in str(error) or 'RightEye' not in str(error):
                raise
        bpy.ops.arp.retarget('EXEC_DEFAULT', frame_start=start, frame_end=end,
            fake_user_action=True, interpolation_type='LINEAR', handle_type='AUTO_CLAMPED',
            only_existing_keyframes=False, clean_fk_rot=False, clean_ik_pole=False,
            extract_root_motion=False)
        result = rig.animation_data.action
        result.name, result.use_fake_user = record['id'], True
        if 'direction' in record:
            result.name = 'STYLE_SOURCE_' + record['id']
            directional_sources[record['id']] = (result, file, record, source_positions)
            for obj in imported:
                bpy.data.objects.remove(obj, do_unlink=True)
            continue
        if not record['id'].startswith('turn_'):
            clips.append(dict(name=result.name, source=str(file.relative_to(ROOT)), sourceClip=record['name'],
                frames=[start,end], keyframesAuthoredHere=False, license='Adobe Mixamo royalty-free game usage'))
            for obj in imported:
                bpy.data.objects.remove(obj, do_unlink=True)
            continue
        # ARP separates the whole-character trajectory. Freeze only that global
        # controller; its child body animation remains the official baked result.
        scene.frame_set(start)
        root = rig.pose.bones['c_root_master.x']
        axes = {name: (rig.matrix_world.to_3x3() @ root.matrix.to_3x3() @ axis).normalized()
                for name, axis in [('X', Vector((1,0,0))), ('Y', Vector((0,1,0))), ('Z', Vector((0,0,1)))]}
        axis = max(axes, key=lambda name: abs(axes[name].dot(Vector((0,-1,0)))))
        forward_axis = axis if axes[axis].dot(Vector((0,-1,0))) >= 0 else '-' + axis
        bpy.ops.object.mode_set(mode='POSE')
        bpy.ops.arp.extract_root_motion(frame_start=start, frame_end=end, loc_x=False, loc_y=False,
            loc_z=False, rotation=True, forward_axis=forward_axis, root_type='ROOT_MASTER')
        bpy.ops.object.mode_set(mode='OBJECT')
        trajectory = rig.pose.bones['c_traj']
        rest = rig.matrix_world @ trajectory.bone.matrix_local
        pivot, rest_rotation, _ = rest.decompose()
        deform = [bone for bone in rig.pose.bones if bone.bone.use_deform]
        raw, yaws = [], []
        for frame in range(start,end+1):
            scene.frame_set(frame)
            rotation = (rig.matrix_world @ trajectory.matrix).to_quaternion() @ rest_rotation.inverted()
            yaw = rotation.to_euler('XYZ').z
            if yaws:
                yaw = yaws[-1] + (yaw-yaws[-1]+math.pi) % (2*math.pi)-math.pi
            yaws.append(yaw)
            evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
            geometry = evaluated.to_mesh()
            raw.append(dict(vertices=[evaluated.matrix_world @ geometry.vertices[i].co for i in vertices],
                bones=[rig.matrix_world @ bone.matrix.translation for bone in deform]))
            evaluated.to_mesh_clear()
        for layer in result.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in list(bag.fcurves):
                        if curve.data_path.startswith('pose.bones["c_traj"].rotation_'):
                            bag.fcurves.remove(curve)
        trajectory.matrix_basis = Matrix.Identity(4)
        max_skin_error, max_bone_error, samples = 0, 0, []
        normalize = Matrix.Rotation(-yaws[0],4,'Z')
        for index, frame in enumerate(range(start,end+1)):
            scene.frame_set(frame)
            evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
            geometry = evaluated.to_mesh()
            rotation = Matrix.Rotation(yaws[index]-yaws[0],4,'Z')
            expected = [pivot + normalize @ (point-pivot) for point in raw[index]['vertices']]
            actual = [pivot + rotation @ (evaluated.matrix_world @ geometry.vertices[i].co-pivot) for i in vertices]
            max_skin_error = max(max_skin_error, max((a-b).length for a,b in zip(expected,actual)))
            max_bone_error = max(max_bone_error, max((pivot + normalize @ (point-pivot) -
                (pivot + rotation @ (rig.matrix_world @ bone.matrix.translation-pivot))).length
                for point,bone in zip(raw[index]['bones'],deform)))
            samples.append(dict(time=index/30,yaw=yaws[index]-yaws[0],vertices=[convert(point) for point in expected]))
            evaluated.to_mesh_clear()
        assert max_skin_error < .0001 and max_bone_error < .0001, (result.name,max_skin_error,max_bone_error)
        turn_proofs.append(dict(name=result.name,samples=samples))
        clips.append(dict(name=result.name, source=str(file.relative_to(ROOT)), sourceClip=record['name'],
            frames=[start,end], keyframesAuthoredHere=True, license='Adobe Mixamo royalty-free game usage',
            rootMotion=dict(samples=[[i/30,yaw-yaws[0]] for i,yaw in enumerate(yaws)],angle=yaws[-1]-yaws[0],pivot=convert(pivot)),
            editing=dict(workflow='ARP Extract Root Motion; separate global trajectory yaw from body animation',
                forwardAxis=forward_axis,tracks=[],deformBones=len(deform),maxSkinError=max_skin_error,maxBoneError=max_bone_error)))
        for obj in imported:
            bpy.data.objects.remove(obj, do_unlink=True)

    # An upper-body Action derived from the user-supplied, formally remapped pose.
    # No bone angles are authored: NLA blends the existing control channels.
    back = bpy.data.actions['laser_back'].copy()
    back.name, back.use_fake_user = 'STYLE_SOURCE_back_arms', True
    for layer in back.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in list(bag.fcurves):
                    if not re.search(r'pose.bones\["c_(shoulder|arm_fk|forearm_fk|hand_fk|thumb|index|middle|ring|pinky)', curve.data_path):
                        bag.fcurves.remove(curve)
    assert curves(back), 'Missing authored arm controls'

    def compose(name, base, overlay, end, influence=1, transition=False, crop=False, properties=False):
        for track in rig.animation_data.nla_tracks:
            track.mute = True
        reset()
        tracks = []
        for label, action in [('base', base), ('overlay', overlay)]:
            track = rig.animation_data.nla_tracks.new()
            track.name = f'{name}/{label}'
            strip = track.strips.new(action.name, 1, action)
            strip.action_slot = action.slots[0]
            if transition or crop:
                strip.action_frame_end = min(action.frame_range[1], action.frame_range[0] + end - 1)
            strip.frame_end = end
            strip.extrapolation = 'NOTHING'
            strip.blend_type = 'REPLACE'
            if label == 'overlay':
                strip.use_animated_influence = True
                strip.influence = 0 if transition else influence
                strip.keyframe_insert('influence', frame=1)
                strip.influence = influence
                strip.keyframe_insert('influence', frame=end)
            tracks.append(track)
        # Bake control-channel composition; ARP constraints remain live and perform
        # the final deformation during Universal export. Preserve the NLA tracks.
        controls = set(re.findall(r'pose.bones\["([^"]+)"\]', '\n'.join(c.data_path for a in [base, overlay] for c in curves(a))))
        for bone in rig.pose.bones:
            bone.select = bone.name in controls
        bpy.ops.object.select_all(action='DESELECT')
        rig.select_set(True)
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.mode_set(mode='POSE')
        baked = bpy.ops.nla.bake(frame_start=1, frame_end=end, step=1, only_selected=True,
            visual_keying=False, clear_constraints=False, clear_parents=False,
            use_current_action=False, clean_curves=False, bake_types={'POSE'},
            channel_types={'LOCATION', 'ROTATION', 'SCALE'} | ({'PROPS'} if properties else set()))
        bpy.ops.object.mode_set(mode='OBJECT')
        assert baked == {'FINISHED'}, f'NLA bake did not finish: {name}'
        result = rig.animation_data.action
        result.name, result.use_fake_user = name, True
        for track in tracks:
            track.mute = True
        clips.append(dict(name=name, source='Existing formally adapted ARP Actions',
            sourceClip=[base.name, overlay.name], frames=[1, end], keyframesAuthoredHere=True,
            license=('Adobe Mixamo royalty-free game usage' if name == 'style_idle_b' or name.startswith('jog_')
                     else 'Mixed: user supplied Mixamo; Mesh2Motion CC0'),
            editing={'workflow': 'Blender NLA control-channel composition + Bake Action',
                     'influence': influence, 'transition': transition, 'tracks': [t.name for t in tracks]}))
        if transition:
            transition_ends[name] = dict(clip=overlay.name, time=(end-1)/30)
        return result

    compose('style_idle_b', bpy.data.actions['style_idle_a'], back, round(bpy.data.actions['style_idle_a'].frame_range[1]), .85)
    compose('style_hover_b', bpy.data.actions['hover'], back, round(bpy.data.actions['hover'].frame_range[1]), .85)
    profiles = {
        'restrained': dict(idle='style_idle_a', hover='hover', fly='fly'),
        'commanding': dict(idle='style_idle_b', hover='style_hover_b', fly='style_fly_b'),
    }
    for profile, names in profiles.items():
        for entry, first, last in [('hover_to_fly', 'hover', 'fly'), ('fly_to_hover', 'fly', 'hover')]:
            name = f'{entry}_{profile}'
            compose(name, bpy.data.actions[names[first]], bpy.data.actions[names[last]], 19, transition=True)
            names[entry] = name

    # Revision: keep A's torso/legs, blend complete existing relaxed arm controls.
    relaxed = bpy.data.actions['hover'].copy()
    relaxed.name, relaxed.use_fake_user = 'STYLE_SOURCE_relaxed_hover_arms', True
    for layer in relaxed.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in list(bag.fcurves):
                    if not re.search(r'pose.bones\["c_(shoulder|arm_fk|forearm_fk|hand_fk|thumb|index|middle|ring|pinky)', curve.data_path):
                        bag.fcurves.remove(curve)
    assert curves(relaxed)
    flight = compose('STYLE_fly_relaxed_source', bpy.data.actions['fly'], relaxed,
                     round(bpy.data.actions['fly'].frame_range[1]), .65)
    clips.pop()  # Intermediate is editable, but not a separate runtime category.

    # Reference targets come from the existing upright idle, not guessed angles.
    reset()
    assign_armature_action(rig, bpy.data.actions['idle'])
    scene.frame_set(1)
    targets = {}
    for bone in ['c_neck.x', 'c_head.x']:
        target = bpy.data.objects.new('STYLE_GAZE_' + bone, None)
        scene.collection.objects.link(target)
        target.matrix_world = rig.matrix_world @ rig.pose.bones[bone].matrix
        target.hide_render = True
        targets[bone] = target

    def neutral_gaze(name, source):
        reset()
        action = source.copy()
        action.name, action.use_fake_user = name, True
        start, end = map(round, action.frame_range)
        assign_armature_action(rig, bpy.data.actions['idle'])
        reference = {}
        for frame in range(start, end+1):
            scene.frame_set(frame-start+1)
            reference[frame] = {bone:(rig.matrix_world @ rig.pose.bones[bone].matrix).to_quaternion() for bone in targets}
        for frame, values in reference.items():
            seam = max(0, (frame-(end-10))/10)
            seam = seam*seam*(3-2*seam)
            for bone, rotation in values.items():
                target = targets[bone]
                target.rotation_mode = 'QUATERNION'
                target.rotation_quaternion = rotation.slerp(reference[start][bone], seam)
                target.keyframe_insert('rotation_quaternion', frame=frame)
        assign_armature_action(rig, action)
        active = []
        for bone_name, influence in [('c_neck.x', .35), ('c_head.x', 1)]:
            constraint = rig.pose.bones[bone_name].constraints.new('COPY_ROTATION')
            constraint.name = name + '/neutral-gaze'
            constraint.target = targets[bone_name]
            constraint.owner_space = constraint.target_space = 'WORLD'
            constraint.influence = influence
            active.append(constraint)
        for bone in rig.pose.bones:
            bone.select = bone.name in targets
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.mode_set(mode='POSE')
        start, end = map(round, action.frame_range)
        bpy.ops.nla.bake(frame_start=start, frame_end=end, step=1, only_selected=True,
            visual_keying=True, clear_constraints=False, clear_parents=False,
            use_current_action=True, clean_curves=False, bake_types={'POSE'}, channel_types={'ROTATION'})
        bpy.ops.object.mode_set(mode='OBJECT')
        result = rig.animation_data.action
        for constraint in active:
            constraint.mute = True
        clips.append(dict(name=name, source='Existing formally adapted ARP Actions', sourceClip=source.name,
            frames=[start, end], keyframesAuthoredHere=True,
            license='Mixed: user supplied Mixamo; Mesh2Motion CC0',
            editing=dict(workflow='NLA source composition + ARP controller world-space Copy Rotation + visual Bake Action',
                reference='existing idle head/neck motion sampled to helper targets with a closed seam; no manually entered joint angles',
                targets=[target.name for target in targets.values()], constraints=[c.name for c in active],
                tracks=[t.name for t in rig.animation_data.nla_tracks if t.name.startswith('STYLE_fly_relaxed_source/')]
                    if name == 'style_fly_relaxed' else [])))
        return result

    natural_fly = neutral_gaze('style_fly_relaxed', flight)
    natural_fall = neutral_gaze('style_fall_controlled', bpy.data.actions['hover'])
    aim_arms = bpy.data.actions['style_idle_a'].copy()
    aim_arms.name, aim_arms.use_fake_user = 'STYLE_SOURCE_aim_arms', True
    for layer in aim_arms.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in list(bag.fcurves):
                    if not re.search(r'pose.bones\["c_(shoulder|arm_fk|forearm_fk|hand_fk|thumb|index|middle|ring|pinky)', curve.data_path):
                        bag.fcurves.remove(curve)
    for name, (source, file, record, positions) in directional_sources.items():
        composed = compose('STYLE_AIM_' + name, source, aim_arms, round(source.frame_range[1]), crop=True, properties=True)
        composition = clips.pop()
        result = neutral_gaze(name, composed)
        clips[-1].update(source=str(file.relative_to(ROOT)), sourceClip=record['name'],
            license='Adobe Mixamo royalty-free game usage')
        clips[-1]['editing'].update(tracks=composition['editing']['tracks'],
            armSource='Mixamo Standing Idle; NLA REPLACE of existing shoulder/arm/hand/finger control channels, original rate cropped to directional cycle',
            customProperties='Blender Bake Action PROPS preserves authored ARP IK/FK controller switches')
        start, end = map(round, result.frame_range)
        delta = positions[-1] - positions[0]
        base_speed = math.hypot(delta.x, delta.y) / ((end-start)/30)
        heights = {side: [] for side in ['l','r']}
        feet = {side: [] for side in ['l','r']}
        assign_armature_action(rig, result)
        for frame in range(start,end):
            scene.frame_set(frame)
            for side in feet:
                point = rig.matrix_world @ rig.pose.bones['c_foot_fk.' + side].matrix.translation
                heights[side].append(point.z)
                feet[side].append(point)
        contacts, movement, support_velocities = {}, Vector((0,0,0)), []
        for side, values in heights.items():
            low = [value < min(values)+.025 for value in values]
            entries = [i for i in range(len(low)) if low[i] and not low[i-1]]
            assert entries, ('No foot-contact candidate',name,side)
            contacts[side] = entries[0]/30
            for i in range(len(low)-1):
                if low[i] and low[i+1]:
                    velocity = (feet[side][i]-feet[side][i+1])*30
                    velocity.z=0
                    support_velocities.append(velocity)
                    movement += velocity
        movement.z=0
        axis = movement.normalized()
        speeds = sorted(velocity.dot(axis) for velocity in support_velocities)
        if base_speed <= .1:
            base_speed = speeds[len(speeds)//2]
        assert base_speed > .1 and movement.length > .01, (name,base_speed,movement)
        direction = convert(movement.normalized())
        contract['clips'][name] = dict(baseSpeed=base_speed, leftContact=contacts['l'],rightContact=contacts['r'],
            direction=[direction[0],direction[2]],
            sourceRootSpeed=math.hypot(delta.x,delta.y)/((end-start)/30),
            calibration='Original normalized FBX root displacement, or median planted-ankle velocity for already-in-place source; low-ankle touchdown candidates, full sole acceptance remains separate')
        print('DIRECTIONAL_GAIT',name,contract['clips'][name],flush=True)
    natural = dict(idle=['style_idle_a', 'style_idle_b'], hover=['hover', 'style_hover_b'],
                   fly=natural_fly.name, fall=natural_fall.name, hover_to_fly={}, fly_to_hover={})
    for suffix, hover in [('a', 'hover'), ('b', 'style_hover_b')]:
        for entry, first, last in [('hover_to_fly', hover, natural_fly.name), ('fly_to_hover', natural_fly.name, hover)]:
            name = entry + '_natural_' + suffix
            compose(name, bpy.data.actions[first], bpy.data.actions[last], 25, transition=True)
            natural[entry][hover] = name
    profiles['natural'] = natural

    # Release the existing behind-back arm pose while the contact-cropped land
    # begins. This avoids ambiguous 180-degree multi-action arm interpolation.
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    reset()
    original_land = bpy.data.actions['land']
    first, last = original_land.frame_range
    contact = first + 0.45*30
    end = round(last-contact)+1
    tracks = []
    for label, action in [('contact', original_land), ('back-release', back)]:
        track = rig.animation_data.nla_tracks.new()
        track.name = 'style_land_from_back/' + label
        strip = track.strips.new(action.name, 1, action)
        strip.action_slot = action.slots[0]
        if label == 'contact':
            strip.action_frame_start = contact
        strip.frame_end = end
        strip.extrapolation = 'NOTHING'
        if label == 'back-release':
            strip.use_animated_influence = True
            for frame, value in [(1, .85), (11, 0), (end, 0)]:
                strip.influence = value
                strip.keyframe_insert('influence', frame=frame)
        tracks.append(track)
    controls = set(re.findall(r'pose.bones\["([^"]+)"\]', '\n'.join(c.data_path for a in [original_land, back] for c in curves(a))))
    for bone in rig.pose.bones:
        bone.select = bone.name in controls
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.nla.bake(frame_start=1, frame_end=end, step=1, only_selected=True, visual_keying=False,
        clear_constraints=False, clear_parents=False, use_current_action=False, clean_curves=False,
        bake_types={'POSE'}, channel_types={'LOCATION', 'ROTATION', 'SCALE'})
    bpy.ops.object.mode_set(mode='OBJECT')
    result = rig.animation_data.action
    result.name, result.use_fake_user = 'style_land_from_back', True
    for track in tracks:
        track.mute = True
    clips.append(dict(name=result.name, source='Existing formally adapted ARP Actions', sourceClip=['land', back.name],
        frames=[1,end], keyframesAuthoredHere=True, license='Mixed: user supplied Mixamo; Mesh2Motion CC0',
        editing=dict(workflow='NLA contact-cropped landing + behind-back arm release + Bake Action',
            sourceContactTime=.45, armReleaseSeconds=10/30, tracks=[t.name for t in tracks])))

    # Phase-shift existing curves, then NLA-compose the beginning/end of a stride.
    # These are edited stock motion, not newly captured start/stop performances.
    for side, contact in [('l', contract['clips']['jog']['leftContact']), ('r', contract['clips']['jog']['rightContact'])]:
        source = bpy.data.actions['run']
        phased = source.copy()
        phased.name, phased.use_fake_user = 'STYLE_SOURCE_jog_phase_' + side, True
        first, last = source.frame_range
        period = last-first
        for curve in curves(phased):
            values = [curve.evaluate(first + (i+contact*30) % period) for i in range(round(period)+1)]
            curve.keyframe_points.clear()
            for i, value in enumerate(values):
                key = curve.keyframe_points.insert(i+1, value)
                key.interpolation = 'LINEAR'
            curve.update()
        for stage, base, overlay in [('start', bpy.data.actions['style_idle_a'], phased), ('stop', phased, bpy.data.actions['style_idle_a'])]:
            name = 'jog_' + stage + '_' + side
            compose(name, base, overlay, 13, transition=True)
            clips[-1]['editing']['supportFoot'] = side
            clips[-1]['editing']['sourceContactTime'] = contact
            if stage == 'start':
                transition_ends[name] = dict(clip='jog', time=(contact+.4) % (period/30))

    reset()
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    all_clips = [*baseline['clips'], *clips]
    for action in bpy.data.actions:
        action['arp_export'] = action.name in {clip['name'] for clip in all_clips}
    for prop, value in dict(arp_bake_type='ACTIONS', arp_ge_reset_transforms=True,
        arp_export_use_actlist=False, arp_bake_only_active=False).items():
        setattr(scene, prop, value)
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.arp.arp_export_gltf_panel('EXEC_DEFAULT', filepath=str(OUT / 'style-raw.glb'))

    # Fresh evaluated skin reference for the new candidates, including all fingers.
    reference = json.loads(gzip.decompress((ROOT / '.asset-source/homelander/blender-reference.json.gz').read_bytes()))
    assert reference['vertices'] == [convert(mesh.matrix_world @ mesh.data.vertices[i].co) for i in vertices]
    reference['clips'] = []
    reference['turnProofs'] = turn_proofs
    for clip in clips:
        reset()
        assign_armature_action(rig, bpy.data.actions[clip['name']])
        samples = []
        for frame in range(clip['frames'][0], clip['frames'][1] + 1):
            scene.frame_set(frame)
            evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
            evaluated_mesh = evaluated.to_mesh()
            samples.append(dict(time=(frame - clip['frames'][0]) / 30,
                vertices=[convert(evaluated.matrix_world @ evaluated_mesh.vertices[i].co) for i in vertices]))
            evaluated.to_mesh_clear()
        reference['clips'].append(dict(name=clip['name'], samples=samples))
    with gzip.open(OUT / 'style-reference.json.gz', 'wt') as stream:
        json.dump(reference, stream, separators=(',', ':'))
    reset()
    assign_armature_action(rig, bpy.data.actions['style_idle_a'])
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'style-editable.blend'))
    for file, digest in inputs.items():
        assert sha(ROOT / file) == digest, f'Input changed: {file}'
    (OUT / 'style-build.json').write_text(json.dumps(dict(tool=baseline['tool'], blender=bpy.app.version_string,
        inputs=inputs, validatedIntermediateSha256=sha(cache), profiles=profiles, transitionEnds=transition_ends, defaultProfile='natural', locomotionContract=contract, clips=clips,
        rawSha256=sha(OUT / 'style-raw.glb'), referenceSha256=sha(OUT / 'style-reference.json.gz')), indent=2) + '\n')
    print('HOMELANDER_STYLE_BUILD_DONE')

window = bpy.context.window_manager.windows[0]
area = next(area for area in window.screen.areas if area.type == 'VIEW_3D')
region = next(region for region in area.regions if region.type == 'WINDOW')
with bpy.context.temp_override(window=window, area=area, region=region):
    build()
