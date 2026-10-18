import * as T from 'three';
import type { Assets } from '../core/Assets';
import { CONFIG } from '../core/config';
import { CapePhysics } from './CapePhysics';
import { dressNpc } from './NpcMaterials';

export class PersonVisual {
    group = new T.Group();
    model: T.Group;
    mixer: T.AnimationMixer;
    actions = new Map<string, T.AnimationAction>();
    current = '';
    eyes: T.Object3D[] = [];
    cape?: CapePhysics;
    private head: T.Object3D;
    private eyeMaterials: T.MeshStandardMaterial[] = [];
    private bank = 0;
    private locomotion: Record<string, { baseSpeed: number }>;
    private soles: Array<{mesh:T.SkinnedMesh; vertex:number}> = [];
    private blendFrom = new Map<string, number>();
    private blendTime = 0;
    private blendDuration: number = CONFIG.animation.locomotionBlend;
    private baseCurrent = '';
    private baseWeights = new Map<string, number>();
    private attackLayers = new Map<string, { full: T.AnimationAction; upper: T.AnimationAction }>();
    private punchFull?: T.AnimationAction;
    private punchUpper?: T.AnimationAction;
    private lowerActions = new Map<string, T.AnimationAction>();
    private punchActive = false;
    private previousPunchRemaining = 0;
    private legSupport = 0;
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
        this.head = this.model.getObjectByName(source.parser.json.extras.headBone ?? 'head')!;
        if (!this.head) throw new Error('角色缺少 head 骨骼');
        for (const clip of source.animations)
            this.actions.set(clip.name, this.mixer.clipAction(clip));
        if (role === 'hero') {
            // Filter existing authored tracks by hierarchy, without changing a
            // keyframe. Running attacks keep the original pelvis and leg motion.
            const lower = new Set(['rootx']);
            for (const side of ['l', 'r']) this.model.getObjectByName(`thigh_stretch${side}`)!
                .traverse(o => lower.add(o.name));
            for (const clip of source.animations) {
                if (clip.name in CONFIG.heroAttacks) {
                    this.attackLayers.set(clip.name, {
                        full: this.mixer.clipAction(clip.clone()),
                        upper: this.mixer.clipAction(new T.AnimationClip(`${clip.name}-upper`, clip.duration,
                            clip.tracks.filter(track => !lower.has(track.name.split('.')[0])))),
                    });
                } else this.lowerActions.set(clip.name, this.mixer.clipAction(new T.AnimationClip(`${clip.name}-lower`, clip.duration,
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
                o.boundingSphere = new T.Sphere(new T.Vector3(0, 1, 0), role === 'hero' ? 2 : 1.5);
                if (role === 'hero' && source.parser.json.extras.cape)
                    this.cape = new CapePhysics(o, source.parser.json.extras.cape);
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
    play(name: string, restart = false) {
        if (this.current === '') this.baseCurrent = '';
        if (name === this.baseCurrent && !restart) { this.current = name; return; }
        const next = this.actions.get(name) ?? this.actions.get('idle')!;
        const previous = this.actions.get(this.baseCurrent);
        const moving = ['walk', 'jog', 'sprint'];
        const phase = previous && moving.includes(this.baseCurrent) && moving.includes(name)
            ? previous.time / previous.getClip().duration : 0;
        const once = [...Object.keys(CONFIG.heroAttacks), 'land', 'takeoff', 'slam', 'jump_start', 'jump_land'].includes(name) ||
            (this.role === 'hero' && name === 'fall');
        const weights = [...this.actions].map(([key, action]) =>
            [key, action.isScheduled() && action.enabled ? this.baseWeights.get(key) ?? action.getEffectiveWeight() : 0] as const);
        const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
        this.blendFrom = new Map(weights.map(([key, weight]) => [key, total ? weight / total : 0]));
        const continuing = next.isScheduled() && next.enabled && next.getEffectiveWeight() > 0 && !once;
        if (!continuing) {
            next.reset().setEffectiveTimeScale(1);
            next.time = name === 'land' ? CONFIG.playerLandingContactTime : phase * next.getClip().duration;
        }
        next.stopFading().setLoop(once ? T.LoopOnce : T.LoopRepeat, Infinity);
        next.clampWhenFinished = once;
        next.enabled = true;
        next.play();
        this.blendDuration = ['hover', 'fly', 'fall'].includes(name) || ['hover', 'fly', 'fall'].includes(this.baseCurrent)
            ? CONFIG.animation.flightBlend : once && name !== 'land' ? 0.16 : CONFIG.animation.locomotionBlend;
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
    private blendPunch(dt: number, remaining: number, grounded: boolean, speed: number, renderedElapsed?: number, attackClip = 'punch') {
        if (remaining <= 0) {
            if (this.punchActive) {
                this.punchFull?.stop(); this.punchUpper?.stop();
                this.lowerActions.forEach(action => action.stop());
            }
            this.punchActive = false;
            this.previousPunchRemaining = 0;
            return;
        }
        const layer = this.attackLayers.get(attackClip);
        const changed = layer && this.punchFull !== layer.full;
        if (changed) { this.punchFull?.stop(); this.punchUpper?.stop(); }
        this.punchFull = layer?.full; this.punchUpper = layer?.upper;
        const full = this.punchFull, upper = this.punchUpper;
        if (!full || !upper) return;
        const started = changed || !this.punchActive || remaining > this.previousPunchRemaining + .01;
        if (started) {
            for (const action of [full, upper]) {
                action.reset().setLoop(T.LoopOnce, 1).setEffectiveTimeScale(1).play();
                action.clampWhenFinished = true;
                action.time = Math.max(0, this.actionDuration(attackClip) - remaining);
            }
            this.legSupport = grounded && speed > 1 ? 1 : 0;
        }
        this.punchActive = true;
        this.previousPunchRemaining = remaining;
        const duration = this.actionDuration(attackClip), elapsed = renderedElapsed ?? full.time + dt;
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
        this.current = attackClip;
    }
    update(
        dt: number,
        _time: number,
        mode: string,
        speed: number,
        attacking = false,
        bank = 0,
        abilityPose = '',
        airVelocity?: T.Vector3,
        punchRemaining = 0,
        punchElapsed?: number,
    ) {
        const air = mode === 'fly' || mode === 'boost' || mode === 'slam' || mode === 'fall' || mode === 'takeoff' || mode === 'jump_start';
        const clip = punchRemaining <= 0 && abilityPose && this.actions.has(abilityPose)
            ? abilityPose
            : mode === 'jump_start' || mode === 'jump_land' ? mode
            : mode === 'punch'
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
                        ? 'land'
                        : mode === 'land'
                          ? 'land'
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
        if (mode === 'takeoff' && action)
            action.timeScale = action.getClip().duration / CONFIG.playerTakeoffDuration;
        if (mode === 'jump_start' && action)
            action.timeScale = action.getClip().duration / CONFIG.playerJumpStartDuration;
        if (mode === 'jump_land' && action)
            action.timeScale = action.getClip().duration / CONFIG.playerJumpLandingDuration;
        if (mode === 'slam' && action) action.paused = true;
        this.blendPunch(dt, punchRemaining, !air, speed, punchElapsed, abilityPose || 'punch');
        this.mixer.update(dt);
        const ease = 1 - Math.exp(-dt * 10);
        this.bank = T.MathUtils.lerp(this.bank, air ? bank : 0, ease);
        // Flight pitch, hover motion and limb poses come entirely from the stock
        // clips. Only whole-character steering roll belongs to the controller.
        this.model.rotation.set(0, 0, this.bank);
        const pivot=new T.Vector3(0,0.92,0);
        this.model.position.copy(pivot).sub(pivot.clone().applyQuaternion(this.model.quaternion));
        if (this.soles.length) {
            this.group.updateMatrixWorld(true);
            let lowest=Infinity;
            const point=new T.Vector3();
            for(const {mesh,vertex} of this.soles) {
                point.fromBufferAttribute(mesh.geometry.attributes.position,vertex);
                mesh.applyBoneTransform(vertex,point).applyMatrix4(mesh.matrixWorld);
                lowest=Math.min(lowest,point.y);
            }
            // Physics owns the jump/fall/landing height. Align the whole model's foot
            // plane, without editing bones or replaying the clip's baked descent.
            // Blend this correction with the same action weights to avoid a pop.
            const anchored = this.role === 'hero' ? Math.min(1,
                ['fall', 'land', 'jump_start', 'jump_land'].reduce((sum, name) => {
                    const action = this.actions.get(name);
                    return sum + (action?.isScheduled() ? action.getEffectiveWeight() : 0);
                }, 0)) : 0;
            const offset = (this.group.position.y+.008-lowest)/this.group.scale.y;
            this.model.position.y += anchored * offset + (1-anchored) * (air ? 0 : Math.max(0,offset));
        }
        const laser = attacking && mode !== 'punch' && punchRemaining <= 0;
        for (let i = 0; i < this.eyes.length; i++) {
            this.eyes[i].visible = laser;
            this.eyeMaterials[i].emissiveIntensity = laser ? CONFIG.presentation.laserEyeEmission : 0;
        }
        if (this.cape) {
            this.group.updateMatrixWorld(true);
            this.cape.floorY = this.group.matrixWorld.elements[13];
            this.cape.update(dt, airVelocity);
        }
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
