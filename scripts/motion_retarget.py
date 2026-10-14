"""Retarget original CMU ASF/AMC to the project's metre-scale, identity-bind rig.
ASF axis frames conjugate DOF rotations. Rotations are evaluated in world space,
aligned to each target bone's bind direction, then converted to local quaternions.
No third-party converted animation files or parser code are bundled.
"""
from pathlib import Path
import math

IDENTITY = [0, 0, 0, 1]
METRES = .0254 / .45

def mul(a, b):
    x, y, z, w = a; X, Y, Z, W = b
    return [w*X+x*W+y*Z-z*Y, w*Y-x*Z+y*W+z*X, w*Z+x*Y-y*X+z*W, w*W-x*X-y*Y-z*Z]

def inverse(q): return [-q[0], -q[1], -q[2], q[3]]
def unit(v):
    length = math.sqrt(sum(x*x for x in v)) or 1
    return [x / length for x in v]
def rotate(q, v): return mul(mul(q, [*v, 0]), inverse(q))[:3]
def euler(values):
    # Acclaim XYZ is extrinsic: Rz * Ry * Rx.
    x, y, z = [v * math.pi / 360 for v in values]
    return mul(mul([0, 0, math.sin(z), math.cos(z)], [0, math.sin(y), 0, math.cos(y)]), [math.sin(x), 0, 0, math.cos(x)])
def from_to(a, b):
    a = unit(a); b = unit(b); dot = sum(x*y for x,y in zip(a,b))
    if dot < -.9999: return [1, 0, 0, 0]
    return unit([a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0], 1+dot])
def slerp(a, b, t):
    dot = sum(x*y for x,y in zip(a,b))
    if dot < 0: b = [-x for x in b]; dot = -dot
    if dot > .999: return unit([(1-t)*x+t*y for x,y in zip(a,b)])
    angle = math.acos(min(1, dot)); sa = math.sin((1-t)*angle)/math.sin(angle); sb = math.sin(t*angle)/math.sin(angle)
    return [sa*x+sb*y for x,y in zip(a,b)]

def read_asf(path):
    bones = {}; bone = None; hierarchy = False
    for line in path.read_text().splitlines():
        p = line.split()
        if not p: continue
        if p[0] == ':hierarchy': hierarchy = True; continue
        if hierarchy:
            if p[0] not in ('begin','end'):
                for child in p[1:]: bones[child]['parent'] = p[0]
            continue
        if p[0] == 'begin': bone = {}; continue
        if p[0] == 'end' and bone and 'name' in bone: bones[bone['name']] = bone; bone = None; continue
        if bone is None: continue
        if p[0] == 'name': bone['name'] = p[1]
        elif p[0] in ('axis','direction'): bone[p[0]] = list(map(float, p[1:4]))
        elif p[0] == 'dof': bone['dof'] = p[1:]
    return bones

def read_amc(path):
    frames = []; current = None
    for line in path.read_text().splitlines():
        p = line.split()
        if not p or p[0].startswith(('#', ':')): continue
        if p[0].isdigit(): current = {}; frames.append(current)
        elif current is not None: current[p[0]] = list(map(float,p[1:]))
    return frames

def motion_clips(folder: Path, rig, heads, resolve, floor_samples):
    mapping = {'pelvis':'root', 'spine_01':'lowerback', 'spine_02':'upperback', 'spine_03':'thorax',
               'neck_01':'lowerneck', 'head':'head'}
    for side in ['l','r']:
        for target, source in [('clavicle','clavicle'),('upperarm','humerus'),('lowerarm','radius'),
                               ('hand','hand'),('thigh','femur'),('calf','tibia'),('foot','foot'),('ball','toes')]:
            mapping[f'{target}_{side}'] = side+source
    clips = {}
    for clip, subject, trial in [('walk','07','04'),('jog','35','24'),('sprint','09','01')]:
        bones = read_asf(folder/f'{subject}.asf'); frames = read_amc(folder/f'{subject}_{trial}.amc')
        # Find a full stride with a matching pose, after the initial capture settling frames.
        start = min(40, len(frames)//6)
        channels = ['lfemur','rfemur','ltibia','rtibia','lhumerus','rhumerus']
        def cost(end):
            return sum((a-b)**2 for n in channels for a,b in zip(frames[start][n], frames[end][n]))
        candidates = range(start+55, min(len(frames)-1, start+240))
        end = min(candidates, key=cost)
        duration = (end-start)/120
        stride = math.hypot(frames[end]['root'][0]-frames[start]['root'][0],frames[end]['root'][2]-frames[start]['root'][2])*METRES
        heading = math.atan2(frames[end]['root'][0]-frames[start]['root'][0],frames[end]['root'][2]-frames[start]['root'][2])
        unheading = euler([0,-math.degrees(heading),0])
        axes = {name:euler(bone['axis']) for name,bone in bones.items()}
        align = {}
        for name, source in mapping.items():
            if source == 'root': align[name] = IDENTITY; continue
            target = [a-b for a,b in zip(resolve(rig[name]['tail']),heads[name])]
            align[name] = from_to(target,bones[source]['direction'])
        rotations = {name:[] for name in rig if name != 'Root'}; translations = []
        sample_indices = list(range(start,end,2))+[end]
        times = [(i-start)/120 for i in sample_indices]
        for fi in sample_indices:
            frame = frames[fi]; source_world = {'root':mul(unheading,euler(frame['root'][3:]))}
            def source_rotation(name):
                if name in source_world: return source_world[name]
                bone = bones[name]; dof = bone.get('dof',[]); values = frame.get(name,[]); xyz = [0,0,0]
                for d,value in zip(dof,values): xyz['xyz'.index(d[1])] = value
                local = mul(mul(axes[name],euler(xyz)),inverse(axes[name]))
                source_world[name] = mul(source_rotation(bone['parent']),local)
                return source_world[name]
            target_world = {'Root':IDENTITY}; target_local = {}
            def target_rotation(name):
                if name in target_world: return target_world[name]
                parent = rig[name]['parent']; parent_q = target_rotation(parent) if parent else IDENTITY
                if name in mapping:
                    desired = mul(source_rotation(mapping[name]),align[name])
                    local = mul(inverse(parent_q),desired)
                else:
                    local = euler([-12,0,0]) if name.startswith(('index','middle','ring','pinky')) else IDENTITY
                    desired = mul(parent_q,local)
                target_local[name] = local; target_world[name] = desired
                return desired
            for name in rotations: target_rotation(name)
            # Evaluate actual weighted shoe vertices. A stance sole, rather than a hip
            # marker, anchors each pose; retargeted feet cannot sink through the floor.
            positions = {'Root':[0,0,0]}
            def position(name):
                if name in positions: return positions[name]
                parent = rig[name]['parent']; parent_p = position(parent)
                offset = [a-b for a,b in zip(heads[name],heads[parent])]
                rotated = rotate(target_world[parent],offset)
                positions[name] = [a+b for a,b in zip(parent_p,rotated)]
                return positions[name]
            for name in rig: position(name)
            lowest = 10
            for vertex, weights in floor_samples:
                y = 0
                for name, weight in weights:
                    local = [a-b for a,b in zip(vertex,heads[name])]
                    y += weight*(rotate(target_world[name],local)[1]+positions[name][1])
                lowest = min(lowest,y)
            pelvis_offset = [a-b for a,b in zip(heads['pelvis'],heads[rig['pelvis']['parent']])]
            pelvis_offset[1] += .004-lowest
            translations.append(pelvis_offset)
            for name in rotations:
                q = target_local[name]
                if rotations[name] and sum(a*b for a,b in zip(q,rotations[name][-1])) < 0: q = [-v for v in q]
                rotations[name].append(q)
        # Close the cycle through a short seam blend rather than snapping its last frame.
        for name, values in rotations.items():
            for i in range(max(0,len(values)-6),len(values)):
                t = (i-(len(values)-6))/5
                values[i] = slerp(values[i],values[0],max(0,t))
        for i in range(max(0,len(translations)-6),len(translations)):
            t = max(0,(i-(len(translations)-6))/5)
            translations[i] = [(1-t)*a+t*b for a,b in zip(translations[i],translations[0])]
        clips[clip] = {'times':times,'rotations':rotations,'translations':translations,
                       'baseSpeed':stride/duration,'source':f'{subject}_{trial}', 'frames':[start+1,end+1]}
        print('CMU',clip,'frames',start+1,end+1,'duration',round(duration,3),'baseSpeed',round(stride/duration,3))
    return clips
