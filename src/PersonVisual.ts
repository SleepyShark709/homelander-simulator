import * as T from 'three';
import type { Assets } from './Assets';
import { CONFIG } from './config';
import { dressNpc } from './NpcMaterials';

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
    private blendDuration: number = CONFIG.animation.locomotionBlend;
    private baseCurrent = '';
    private baseWeights = new Map<string, number>();
    private punchFull?: T.AnimationAction;
    private punchUpper?: T.AnimationAction;
    private lowerActions = new Map<string, T.AnimationAction>();
    private punchActive = false;
    private previousPunchRemaining = 0;
    private legSupport = 0;
    actionDuration(name: string) {
        return this.actions.get(name)?.getClip().duration ?? 0;
    }
    landingDuration() { return this.actionDuration('land') - CONFIG.animation.landContactTime; }
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
        if (role === 'hero') {
            // Filter existing authored tracks by hierarchy, without changing a
            // keyframe. Running attacks keep the original pelvis and leg motion.
            const lower = new Set(['root', 'pelvis']);
            for (const side of ['l', 'r']) this.model.getObjectByName(`thigh_${side}`)!
                .traverse(o => lower.add(o.name));
            const punch = source.animations.find(clip => clip.name === 'punch')!;
            this.punchFull = this.mixer.clipAction(punch.clone());
            this.punchUpper = this.mixer.clipAction(new T.AnimationClip('punch-upper', punch.duration,
                punch.tracks.filter(track => !lower.has(track.name.split('.')[0]))));
            for (const clip of source.animations) if (clip.name !== 'punch') {
                this.lowerActions.set(clip.name, this.mixer.clipAction(new T.AnimationClip(`${clip.name}-lower`, clip.duration,
                    clip.tracks.filter(track => lower.has(track.name.split('.')[0])))));
            }
        }
        this.model.traverse(o => {
            if (!(o instanceof T.Mesh)) return;
            const materials = Array.isArray(o.material) ? o.material : [o.material];
            const adapted = materials.map(original => {
                const material = (original as T.MeshStandardMaterial).clone();
                if (role !== 'hero') dressNpc(material, assets, role, variant);
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
        if (this.current === '') this.baseCurrent = '';
        if (name === this.baseCurrent) { this.current = name; return; }
        const next = this.actions.get(name) ?? this.actions.get('idle')!;
        const previous = this.actions.get(this.baseCurrent);
        const moving = ['walk', 'jog', 'sprint'];
        const phase = previous && moving.includes(this.baseCurrent) && moving.includes(name)
            ? previous.time / previous.getClip().duration : 0;
        const once = ['punch', 'land', 'takeoff', 'slam', 'jump'].includes(name);
        const weights = [...this.actions].map(([key, action]) =>
            [key, action.isScheduled() && action.enabled ? this.baseWeights.get(key) ?? action.getEffectiveWeight() : 0] as const);
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
        this.blendDuration = ['hover', 'fly', 'fall'].includes(name) || ['hover', 'fly', 'fall'].includes(this.baseCurrent)
            ? CONFIG.animation.flightBlend : once ? 0.16 : CONFIG.animation.locomotionBlend;
        this.blendTime = total ? 0 : this.blendDuration;
        this.baseCurrent = this.current = name;
        this.blendActions(0);
    }
    private blendActions(dt: number) {
        this.blendTime = Math.min(this.blendDuration, this.blendTime + dt);
        const t = this.blendTime / this.blendDuration;
        const eased = t * t * (3 - 2 * t);
        for (const [name, action] of this.actions) {
            const weight = (this.blendFrom.get(name) ?? 0) * (1 - eased) + (name === this.baseCurrent ? eased : 0);
            this.baseWeights.set(name, weight);
            action.stopFading().setEffectiveWeight(weight);
            if (t === 1 && name !== this.baseCurrent && action.isScheduled()) action.stop();
        }
    }
    private blendPunch(dt: number, remaining: number, grounded: boolean, speed: number, renderedElapsed?: number) {
        const full = this.punchFull, upper = this.punchUpper;
        if (!full || !upper) return;
        if (remaining <= 0) {
            if (this.punchActive) {
                full.stop(); upper.stop(); this.lowerActions.forEach(action => action.stop());
            }
            this.punchActive = false;
            this.previousPunchRemaining = 0;
            return;
        }
        const started = !this.punchActive || remaining > this.previousPunchRemaining + .01;
        if (started) {
            for (const action of [full, upper]) {
                action.reset().setLoop(T.LoopOnce, 1).setEffectiveTimeScale(1).play();
                action.clampWhenFinished = true;
                action.time = Math.max(0, this.actionDuration('punch') - remaining);
            }
            this.legSupport = grounded && speed > 1 ? 1 : 0;
        }
        this.punchActive = true;
        this.previousPunchRemaining = remaining;
        const duration = this.actionDuration('punch'), elapsed = renderedElapsed ?? full.time + dt;
        // Sample the same interpolated simulation time as the player's position.
        // Mixer.update advances once below, so subtract this frame before sampling.
        if (renderedElapsed !== undefined) for (const action of [full, upper]) {
            action.time = elapsed - dt; action.paused = false;
        }
        const smooth = (value: number) => { const t = T.MathUtils.clamp(value, 0, 1); return t * t * (3 - 2 * t); };
        const weight = smooth(elapsed / CONFIG.animation.punchBlendIn)
            * smooth((duration - elapsed) / CONFIG.animation.punchBlendOut);
        this.legSupport = T.MathUtils.lerp(this.legSupport, grounded && speed > 1 ? 1 : 0, 1 - Math.exp(-dt * 12));
        full.setEffectiveWeight(weight * (1 - this.legSupport));
        upper.setEffectiveWeight(weight * this.legSupport);
        // Each upper binding sums to base*(1-w) + full*w*(1-s) + upper*w*s.
        // Each lower binding substitutes the continuing lower-body clip for upper.
        for (const [name, action] of this.actions) {
            const base = this.baseWeights.get(name) ?? 0;
            action.setEffectiveWeight(base * (1 - weight));
            const lower = this.lowerActions.get(name);
            if (!lower) continue;
            if (base > 0) {
                lower.enabled = true; lower.play(); lower.time = action.time;
                lower.setLoop(action.loop, Infinity); lower.clampWhenFinished = action.clampWhenFinished;
                lower.paused = action.paused;
                lower.setEffectiveTimeScale(action.getEffectiveTimeScale());
                lower.setEffectiveWeight(base * weight * this.legSupport);
            } else lower.stop();
        }
        this.current = 'punch';
    }
    update(
        dt: number,
        _time: number,
        mode: string,
        speed: number,
        attacking = false,
        bank = 0,
        punchRemaining = 0,
        punchElapsed?: number,
        jumpElapsed?: number,
    ) {
        const air = mode === 'fly' || mode === 'boost' || mode === 'slam' || mode === 'fall' || mode === 'takeoff' || mode === 'jump';
        const landing =
            !air &&
            (this.previousMode === 'fly' ||
                this.previousMode === 'boost' ||
                this.previousMode === 'slam' || this.previousMode === 'fall' || this.previousMode === 'jump');
        const runningJumpLanding = landing && this.previousMode === 'jump' && speed > 1;
        if (runningJumpLanding) this.landingTime = 0;
        else if (landing) {
            this.landingClip = 'land';
            this.landingTime = this.landingDuration();
            this.play('land');
            // The stock clip begins in mid-air. Physical contact enters its
            // authored contact/recovery section, never its airborne descent.
            this.actions.get('land')!.time = CONFIG.animation.landContactTime;
        }
        else this.landingTime = Math.max(0, this.landingTime - dt);
        if (air || mode === 'punch') this.landingTime = 0;
        const clip =
            mode === 'punch'
                ? 'punch'
                : mode === 'jump'
                  ? 'jump'
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
        if (mode === 'jump' && action && jumpElapsed !== undefined) {
            const flightDuration = 2 * CONFIG.jumpSpeed / CONFIG.gravity;
            const phase = Math.min(CONFIG.animation.jumpAirEnd, jumpElapsed / flightDuration * CONFIG.animation.jumpAirEnd);
            action.time = phase - dt; action.paused = false;
        }
        if (mode === 'slam' && action) {
            const impactTime = action.getClip().duration * CONFIG.slamHitFraction;
            if (action.time + dt >= impactTime) {
                action.time = impactTime;
                action.paused = true;
            }
        }
        this.blendPunch(dt, punchRemaining, !air, speed, punchElapsed);
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
            const correction = (this.group.position.y + .008 - lowest) / this.group.scale.y;
            // A completed physical landing plants the authored recovery pose.
            // Ordinary running keeps its original airborne stride frames.
            this.model.position.y += this.landingTime > 0 ? correction : Math.max(0, correction);
        }
        const laser = attacking && mode !== 'punch' && punchRemaining <= 0;
        for (let i = 0; i < this.eyes.length; i++) {
            this.eyes[i].visible = laser;
            this.eyeMaterials[i].emissiveIntensity = laser ? CONFIG.presentation.laserEyeEmission : 0;
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
