import * as T from 'three';
import type { Assets } from './Assets';
import { CONFIG } from './config';

export class PersonVisual {
    group = new T.Group();
    model: T.Group;
    mixer: T.AnimationMixer;
    actions = new Map<string, T.AnimationAction>();
    current = '';
    eyes: T.Object3D[] = [];
    private head: T.Object3D;
    private eyeMaterials: T.MeshStandardMaterial[] = [];
    private bank = 0;
    private previousMode = 'ground';
    private landingTime = 0;
    private landingClip = 'land';
    private locomotion: Record<string, { baseSpeed: number }>;
    private soles: Array<{mesh:T.SkinnedMesh; vertex:number}> = [];
    private blendFrom = new Map<string, number>();
    private blendTime = 0;
    private blendDuration = 0.24;
    actionDuration(name: string) {
        return this.actions.get(name)?.getClip().duration ?? 0;
    }
    constructor(
        private assets: Assets,
        public role: 'hero' | 'civilian' | 'police' | 'soldier',
        variant = 0,
    ) {
        const key = role === 'hero' ? 'person' : 'civilian2';
        const source = assets.models.get(key)!;
        this.locomotion = source.parser.json.extras.locomotion;
        this.model = assets.clone(key);
        this.model.scale.setScalar(role === 'hero' ? 1 : 0.96 + (variant % 4) * 0.012);
        this.group.add(this.model);
        this.mixer = new T.AnimationMixer(this.model);
        this.head = this.model.getObjectByName('head')!;
        if (!this.head) throw new Error('角色缺少 head 骨骼');
        for (const clip of source.animations)
            this.actions.set(clip.name, this.mixer.clipAction(clip));
        const shades = [0xb7c0c6, 0xd5cab9, 0xbac5bd, 0xc2b9b5];
        this.model.traverse(o => {
            if (!(o instanceof T.Mesh)) return;
            const materials = Array.isArray(o.material) ? o.material : [o.material];
            const adapted = materials.map(original => {
                const material = (original as T.MeshStandardMaterial).clone();
                material.color.set(role === 'hero' ? 0xffffff : role === 'police' ? 0x6b96bb
                    : role === 'soldier' ? 0x8f9e71 : shades[variant % shades.length]);
                material.roughness = 0.8;
                return material;
            });
            o.material = Array.isArray(o.material) ? adapted : adapted[0];
            if (o instanceof T.SkinnedMesh) {
                const positions = o.geometry.attributes.position, candidates: number[] = [];
                for (let i = 0; i < positions.count; i++) if (positions.getY(i) < 0.13) candidates.push(i);
                for (let i = 0; i < candidates.length; i += Math.max(1, Math.floor(candidates.length / 80)))
                    this.soles.push({ mesh: o, vertex: candidates[i] });
                o.boundingSphere = new T.Sphere(new T.Vector3(0, 1, 0), 1.5);
            }
        });
        if (role === 'hero') for (const side of ['l', 'r']) {
            const material = new T.MeshStandardMaterial({color: 0xff2318, emissive: 0xff2318});
            const eye = new T.Mesh(new T.SphereGeometry(0.008, 8, 6), material);
            eye.position.fromArray(source.parser.json.extras.eyes[side]);
            eye.visible = false;
            this.head.add(eye); this.eyes.push(eye); this.eyeMaterials.push(material);
        }
        if (role === 'police' || role === 'soldier') {
            const material = new T.MeshStandardMaterial({color: 0x24292e, roughness: 0.5, metalness: 0.5});
            const gun = new T.Mesh(new T.BoxGeometry(0.045, 0.22, 0.065), material);
            gun.position.y = 0.075;
            this.model.getObjectByName('hand_r')!.add(gun);
        }
        this.update(0, 0, 'ground', 0);
    }
    play(name: string) {
        if (name === this.current) return;
        const next = this.actions.get(name) ?? this.actions.get('idle')!;
        const previous = this.actions.get(this.current);
        const moving = ['walk', 'jog', 'sprint'];
        const phase = previous && moving.includes(this.current) && moving.includes(name)
            ? previous.time / previous.getClip().duration : 0;
        const once = ['punch', 'land', 'takeoff', 'slam'].includes(name);
        const weights = [...this.actions].map(([key, action]) =>
            [key, action.isScheduled() && action.enabled ? action.getEffectiveWeight() : 0] as const);
        const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
        this.blendFrom = new Map(weights.map(([key, weight]) => [key, total ? weight / total : 0]));
        const continuing = next.isScheduled() && next.enabled && next.getEffectiveWeight() > 0 && !once;
        if (!continuing) {
            next.reset().setEffectiveTimeScale(1);
            next.time = phase * next.getClip().duration;
        }
        next.stopFading().setLoop(once ? T.LoopOnce : T.LoopRepeat, Infinity);
        next.clampWhenFinished = once;
        next.enabled = true;
        next.play();
        this.blendDuration = once ? 0.16 : 0.24;
        this.blendTime = total ? 0 : this.blendDuration;
        this.current = name;
        this.blendActions(0);
    }
    private blendActions(dt: number) {
        this.blendTime = Math.min(this.blendDuration, this.blendTime + dt);
        const t = this.blendTime / this.blendDuration;
        const eased = t * t * (3 - 2 * t);
        for (const [name, action] of this.actions) {
            const weight = (this.blendFrom.get(name) ?? 0) * (1 - eased) + (name === this.current ? eased : 0);
            action.stopFading().setEffectiveWeight(weight);
            if (t === 1 && name !== this.current && action.isScheduled()) action.stop();
        }
    }
    update(
        dt: number,
        _time: number,
        mode: string,
        speed: number,
        attacking = false,
        bank = 0,
    ) {
        const air = mode === 'fly' || mode === 'boost' || mode === 'slam' || mode === 'fall' || mode === 'takeoff';
        const landing =
            !air &&
            (this.previousMode === 'fly' ||
                this.previousMode === 'boost' ||
                this.previousMode === 'slam' || this.previousMode === 'fall');
        if (landing) {
            this.landingClip = this.previousMode === 'slam' ? 'slam' : 'land';
            const action = this.actions.get(this.landingClip);
            this.landingTime = this.actionDuration(this.landingClip) -
                (this.landingClip === 'slam' ? action?.time ?? 0 : 0);
            if (action && this.landingClip === 'slam') action.paused = false;
        }
        else this.landingTime = Math.max(0, this.landingTime - dt);
        if (air || mode === 'punch') this.landingTime = 0;
        const clip =
            mode === 'punch'
                ? 'punch'
                : mode === 'shoot'
                  ? 'shoot'
                  : mode === 'takeoff'
                    ? 'takeoff'
                  : mode === 'boost'
                    ? 'fly'
                    : mode === 'fall'
                      ? 'fall'
                    : mode === 'fly'
                      ? 'hover'
                      : mode === 'slam' || mode === 'slamPreview'
                        ? 'slam'
                        : this.landingTime > 0 || mode === 'land'
                          ? mode === 'land' ? 'land' : this.landingClip
                          : speed > 1 && mode === 'ground'
                            ? speed > 8
                                ? 'sprint'
                                : speed > 2.8 ? 'jog' : 'walk'
                            : 'idle';
        this.play(clip);
        const action = this.actions.get(this.current);
        if (action && this.locomotion[clip])
            action.timeScale = T.MathUtils.clamp(
                speed / this.locomotion[clip].baseSpeed,
                0.6,
                this.role === 'hero' && (clip === 'jog' || clip === 'sprint')
                    ? CONFIG.playerRunAnimationRateMax : 1,
            );
        this.blendActions(dt);
        if (mode === 'slam' && action) {
            const impactTime = action.getClip().duration * CONFIG.slamHitFraction;
            if (action.time + dt >= impactTime) {
                action.time = impactTime;
                action.paused = true;
            }
        }
        this.mixer.update(dt);
        const ease = 1 - Math.exp(-dt * 10);
        this.bank = T.MathUtils.lerp(this.bank, air ? bank : 0, ease);
        // Flight pitch, hover motion and limb poses come entirely from the stock
        // clips. Only whole-character steering roll belongs to the controller.
        this.model.rotation.set(0, 0, this.bank);
        const pivot=new T.Vector3(0,0.92,0);
        this.model.position.copy(pivot).sub(pivot.clone().applyQuaternion(this.model.quaternion));
        if (!air && this.soles.length) {
            this.group.updateMatrixWorld(true);
            let lowest=Infinity;
            const point=new T.Vector3();
            for(const {mesh,vertex} of this.soles) {
                point.fromBufferAttribute(mesh.geometry.attributes.position,vertex);
                mesh.applyBoneTransform(vertex,point).applyMatrix4(mesh.matrixWorld);
                lowest=Math.min(lowest,point.y);
            }
            // Preserve the stock clip's vertical motion (including airborne run
            // frames); only prevent soles from going below the support surface.
            this.model.position.y += Math.max(0,(this.group.position.y+.008-lowest)/this.group.scale.y);
        }
        const laser = attacking && mode !== 'punch';
        for (let i = 0; i < this.eyes.length; i++) {
            this.eyes[i].visible = laser;
            this.eyeMaterials[i].emissiveIntensity = laser ? 14 : 0;
        }
        this.previousMode = mode;
    }
    opacity(value: number) {
        const opacity = T.MathUtils.clamp(value, 0, 1);
        const transparent = opacity < 1;
        this.model.traverse((o) => {
            if (o instanceof T.Mesh)
                for (const m of Array.isArray(o.material)
                    ? o.material
                    : [o.material]) {
                    if (m.transparent !== transparent) {
                        m.transparent = transparent;
                        m.needsUpdate = true;
                    }
                    m.depthWrite = !transparent;
                    m.opacity = opacity;
                }
        });
    }
    dispose() {
        this.mixer.stopAllAction();
        this.mixer.uncacheRoot(this.model);
        const sharedG = new Set<T.BufferGeometry>(),
            sharedM = new Set<T.Material>();
        for (const asset of this.assets.models.values())
            asset.scene.traverse((o) => {
                if (o instanceof T.Mesh) {
                    sharedG.add(o.geometry);
                    for (const m of Array.isArray(o.material)
                        ? o.material
                        : [o.material])
                        sharedM.add(m);
                }
            });
        const ownedG = new Set<T.BufferGeometry>(),
            ownedM = new Set<T.Material>(),
            skeletons = new Set<T.Skeleton>();
        this.group.traverse((o) => {
            if (o instanceof T.Mesh) {
                if (!sharedG.has(o.geometry)) ownedG.add(o.geometry);
                for (const m of Array.isArray(o.material)
                    ? o.material
                    : [o.material])
                    if (!sharedM.has(m)) ownedM.add(m);
            }
            if (o instanceof T.SkinnedMesh) skeletons.add(o.skeleton);
        });
        ownedG.forEach((g) => g.dispose());
        ownedM.forEach((m) => m.dispose());
        skeletons.forEach((s) => s.dispose());
        this.group.removeFromParent();
    }
}
