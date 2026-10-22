import * as T from 'three';
import type { Assets } from '../core/Assets';
import { CONFIG } from '../core/config';
import { CapePhysics } from './CapePhysics';
import { dressNpc } from './NpcMaterials';
import { contactPhase, contactTime, type Gait } from './Locomotion';

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
    private locomotion: Record<string, Gait>;
    private groundStage = '';
    private groundLoop = 'jog';
    private groundIntent = false;
    private pendingStop = false;
    private soles: Array<{mesh:T.SkinnedMesh; vertex:number}> = [];
    private blendFrom = new Map<string, number>();
    private blendTime = 0;
    private blendDuration: number = CONFIG.animation.locomotionBlend;
    private baseCurrent = '';
    private baseWeights = new Map<string, number>();
    private blendTargets = new Map<string, number>();
    private attackLayers = new Map<string, { full: T.AnimationAction; upper: T.AnimationAction }>();
    private punchFull?: T.AnimationAction;
    private punchUpper?: T.AnimationAction;
    private lowerActions = new Map<string, T.AnimationAction>();
    private punchActive = false;
    private previousPunchRemaining = 0;
    private legSupport = 0;
    private styleProfile?: Record<string, string | string[] | Record<string,string>>;
    private styleSemantic = '';
    private styleVariant = '';
    private variantTime = 0;
    private variantLoops = 0;
    private flightHover = '';
    private transitionEnds: Record<string,{clip:string; time:number}> = {};
    private flightTarget = '';
    private flightTransition = '';
    private landingVariant = 'land';
    private turnMotions: Record<string,Array<[number,number]>> = {};
    private groundTurn = '';
    turnYawDelta = 0;
    startTurn(left: boolean) {
        const name=left?'turn_l':'turn_r';
        if(!this.turnMotions[name] || this.groundTurn ||
            Object.keys(this.turnMotions).some(clip=>(this.baseWeights.get(clip)??0)>.001))return false;
        this.groundTurn=name;this.groundStage='';this.pendingStop=false;
        this.play(name,true);return true;
    }
    private turnYaw(name:string,time:number) {
        const samples=this.turnMotions[name],i=Math.min(Math.floor(time*30),samples.length-2);
        const [a,x]=samples[Math.max(0,i)], [b,y]=samples[Math.max(0,i)+1];
        return T.MathUtils.lerp(x,y,T.MathUtils.clamp((time-a)/(b-a),0,1));
    }
    actionDuration(name: string) {
        return this.actions.get(name)?.getClip().duration ?? 0;
    }
    private gaitRateMax(name:string) {
        return this.role!=='hero' || name==='walk' ? 1 :
            ['strafe_l','strafe_r','backpedal'].includes(name) ? CONFIG.playerAimAnimationRateMax : CONFIG.playerRunAnimationRateMax;
    }
    private aimGaits(x:number,z:number,forward:string) {
        const weights=new Map<string,number>();
        const side=x>=0?'strafe_l':'strafe_r',longitudinal=z>=0?forward:'backpedal';
        const stride=(name:string)=>this.locomotion[name].baseSpeed*this.actionDuration(name);
        if(!this.actions.has(side) || !this.actions.has(longitudinal))return weights;
        const a=Math.abs(x)/stride(side),b=Math.abs(z)/stride(longitudinal),total=a+b;
        if(a>1e-5)weights.set(side,a/total);
        if(b>1e-5)weights.set(longitudinal,b/total);
        return weights;
    }
    private aimStride(weights:Map<string,number>) {
        const stride=new T.Vector2();let duration=0;
        for(const [name,weight] of weights) {
            const gait=this.locomotion[name],seconds=this.actionDuration(name);
            stride.addScaledVector(new T.Vector2(...(gait.direction??[0,1])),weight*gait.baseSpeed*seconds);
            duration=Math.max(duration,seconds);
        }
        return {length:stride.length(),duration};
    }
    aimSpeedLimit(x:number,z:number,boost:boolean) {
        if(z>0 && Math.abs(x)<1e-5)return boost?CONFIG.sprint:CONFIG.walk;
        const weights=this.aimGaits(x,z,boost?'sprint':'jog');
        if(!weights.size)return boost?CONFIG.sprint:CONFIG.walk;
        const stride=this.aimStride(weights);
        return Math.min(boost?CONFIG.sprint:CONFIG.walk,stride.length/stride.duration*
            CONFIG.playerAimAnimationRateMax*(boost?1:CONFIG.walk/CONFIG.sprint));
    }
    private landingClip() {
        const backWeight=['style_idle_b','style_hover_b','laser_back'].reduce((sum,name)=>sum+(this.baseWeights.get(name)??0),0);
        if(this.landingVariant==='land' && backWeight>.001 && this.actions.has('style_land_from_back'))
            this.landingVariant='style_land_from_back';
        return this.landingVariant;
    }
    playLanding() {this.play(this.landingClip(),true);}
    get landingRecoveryDuration() {
        return this.actionDuration(this.landingVariant)-(this.landingVariant==='land' ? CONFIG.playerLandingContactTime : 0);
    }
    constructor(
        private assets: Assets,
        public role: 'hero' | 'civilian' | 'police' | 'soldier',
        variant = 0,
    ) {
        const key = role === 'hero' ? 'person' : 'civilian2';
        const source = assets.models.get(key)!;
        this.locomotion = source.parser.json.extras.locomotion;
        if (role === 'hero') {
            this.styleProfile = source.parser.json.extras.styleProfiles?.[source.parser.json.extras.activeStyleProfile ?? source.parser.json.extras.defaultStyleProfile];
            this.transitionEnds = source.parser.json.extras.styleTransitionEnds ?? {};
            for(const clip of source.parser.json.animations)
                if(clip.extras?.rootMotion)this.turnMotions[clip.name]=clip.extras.rootMotion.samples;
        }
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
        const syncMoving = previous && this.locomotion[this.baseCurrent] && this.locomotion[name];
        const phase = syncMoving ? contactPhase(previous.time,previous.getClip().duration,this.locomotion[this.baseCurrent]) : 0;
        const once = [...Object.keys(CONFIG.heroAttacks), 'land', 'takeoff', 'slam', 'jump_start', 'jump_land'].includes(name) ||
            (this.role === 'hero' && name === 'fall') || /^(hover_to_fly_|fly_to_hover_|jog_start_|jog_stop_|style_land_|turn_)/.test(name);
        const weights = [...this.actions].map(([key, action]) =>
            [key, action.isScheduled() && action.enabled ? this.baseWeights.get(key) ?? action.getEffectiveWeight() : 0] as const);
        const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
        this.blendFrom = new Map(weights.map(([key, weight]) => [key, total ? weight / total : 0]));
        const continuing = next.isScheduled() && next.enabled && next.getEffectiveWeight() > 0 && !once;
        if (!continuing) {
            next.reset().setEffectiveTimeScale(1);
            next.time = name === 'land' ? CONFIG.playerLandingContactTime : 0;
        }
        if(syncMoving) next.time=contactTime(phase,next.getClip().duration,this.locomotion[name]);
        next.stopFading().setLoop(once ? T.LoopOnce : T.LoopRepeat, Infinity);
        next.clampWhenFinished = once;
        next.enabled = true;
        next.play();
        const flight = (clip:string) => ['hover', 'fly', 'fall'].includes(clip) ||
            /^(style_(hover|fly|fall|land)|hover_to_fly_|fly_to_hover_)/.test(clip);
        this.blendDuration = flight(name) || flight(this.baseCurrent)
            ? CONFIG.animation.flightBlend : once && name !== 'land' ? 0.16 : CONFIG.animation.locomotionBlend;
        this.blendTime = total ? 0 : this.blendDuration;
        this.baseCurrent = this.current = name;
        this.blendTargets=new Map([[name,1]]);
        this.blendActions(0);
    }
    private styleClip(semantic:string, dt:number) {
        const variants=this.styleProfile?.[semantic];
        if(!Array.isArray(variants)) {this.styleSemantic=semantic;return typeof variants==='string' ? variants : semantic;}
        const action=this.actions.get(this.styleVariant);
        const entered=this.styleSemantic!==semantic;
        const wrapped=!entered && dt>0 && action && action.time<this.variantTime;
        if(entered || (wrapped && --this.variantLoops<=0)) {
            this.styleSemantic=semantic;
            this.styleVariant=variants[Math.floor(Math.random()*variants.length)];
            this.variantLoops=2+Math.floor(Math.random()*2);
        }
        this.variantTime=this.actions.get(this.styleVariant)?.time ?? 0;
        return this.styleVariant;
    }
    private blendActions(dt: number) {
        this.blendTime = Math.min(this.blendDuration, this.blendTime + dt);
        const t = this.blendTime / this.blendDuration;
        const eased = t * t * (3 - 2 * t);
        for (const [name, action] of this.actions) {
            const target=this.blendTargets.get(name)??0;
            const weight = (this.blendFrom.get(name) ?? 0) * (1 - eased) + target*eased;
            this.baseWeights.set(name, weight);
            action.stopFading().setEffectiveWeight(weight);
            if (t === 1 && target===0 && action.isScheduled()) action.stop();
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
        groundIntent?: boolean,
        groundBoost = false,
    ) {
        const air = mode === 'fly' || mode === 'boost' || mode === 'slam' || mode === 'fall' || mode === 'jump_air' || mode === 'takeoff' || mode === 'jump_start';
        let clip = punchRemaining <= 0 && abilityPose && this.actions.has(abilityPose)
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
                    : mode === 'fall' || mode === 'jump_air'
                      ? 'fall'
                    : mode === 'fly'
                      ? 'hover'
                      : mode === 'slam' || mode === 'slamPreview'
                        ? 'land'
                        : mode === 'land'
                          ? 'land'
                          : speed > 1 && mode === 'ground'
                            ? speed > (this.role==='hero' && this.styleProfile
                                ? this.groundLoop==='sprint' ? CONFIG.animation.sprintExitSpeed : CONFIG.animation.sprintEnterSpeed : 8)
                                ? 'sprint'
                                : speed > 2.8 ? 'jog' : 'walk'
                            : 'idle';
        if(clip==='land') clip=this.landingClip();
        else this.landingVariant='land';
        const aiming=this.role==='hero' && mode==='ground' && attacking && punchRemaining<=0;
        let directional=new Map<string,number>();
        if(aiming && speed>1 && airVelocity) {
            const yaw=this.group.rotation.y,c=Math.cos(yaw),s=Math.sin(yaw);
            directional=this.aimGaits(c*airVelocity.x-s*airVelocity.z,s*airVelocity.x+c*airVelocity.z,groundBoost?'sprint':'jog');
            if(directional.size)clip=[...directional].sort((a,b)=>b[1]-a[1])[0][0];
        }
        if(this.role==='hero' && this.actions.has('jog_start_l')) {
            if(mode==='ground' && !abilityPose && punchRemaining<=0 && !aiming) {
                const intent=groundIntent ?? speed>1;
                const loop=this.actions.get(this.groundLoop), gait=this.locomotion[this.groundLoop];
                const side=loop && contactPhase(loop.time,loop.getClip().duration,gait)<.5 ? 'l' : 'r';
                if(intent && !this.groundIntent && speed<CONFIG.walk*.7) {
                    this.groundStage=`jog_start_${side}`;this.pendingStop=false;this.play(this.groundStage,true);
                }
                if(!intent && this.groundIntent) this.pendingStop=true;
                if(this.pendingStop && speed<=8) {
                    this.groundStage=`jog_stop_${side}`;this.pendingStop=false;this.play(this.groundStage,true);
                }
                if(intent && this.groundStage.startsWith('jog_stop_')) this.groundStage='';
                this.groundIntent=intent;
                const stage=this.actions.get(this.groundStage);
                if(stage && stage.time<stage.getClip().duration) clip=this.groundStage;
                else if(this.groundStage) {
                    const end=this.transitionEnds[this.groundStage];this.groundStage='';
                    if(end && this.locomotion[clip]) {
                        this.play(clip);
                        const phase=contactPhase(end.time,this.actionDuration(end.clip),this.locomotion[end.clip]);
                        this.actions.get(clip)!.time=contactTime(phase,this.actionDuration(clip),this.locomotion[clip]);
                    }
                }
                if(['walk','jog','sprint'].includes(clip)) this.groundLoop=clip;
            } else {this.groundStage='';this.groundIntent=false;this.pendingStop=false;}
        }
        if(this.groundTurn) {
            if(mode!=='ground' || speed>.7 || groundIntent || abilityPose || punchRemaining>0)this.groundTurn='';
            else clip=this.groundTurn;
        }
        if (this.styleProfile) {
            if (clip === 'hover' || clip === 'fly') {
                if (this.flightTarget !== clip) {
                    const previousTransition=this.actions.get(this.flightTransition);
                    const interrupted=previousTransition && previousTransition.time<previousTransition.getClip().duration;
                    const selected=this.styleClip(clip,dt);
                    if(clip==='hover') this.flightHover=selected;
                    const entry=this.styleProfile[`${this.flightTarget}_to_${clip}`];
                    this.flightTransition=typeof entry==='string' ? entry : entry && !Array.isArray(entry) ? entry[this.flightHover] ?? '' : '';
                    // Blend directly from the still-playing actions when reversed.
                    // Resetting a weighted one-shot would jump its existing pose.
                    if(interrupted || (this.baseWeights.get(this.flightTransition)??0)>.001) this.flightTransition='';
                    this.flightTarget = clip;
                    if (this.flightTransition) this.play(this.flightTransition, true);
                }
                const transition = this.actions.get(this.flightTransition);
                if (transition && transition.time < transition.getClip().duration) clip = this.flightTransition;
                else {
                    const end=this.transitionEnds[this.flightTransition], semantic=clip;
                    this.flightTransition = ''; clip = this.styleClip(semantic,dt);
                    if(semantic==='hover') this.flightHover=clip;
                    if(end && end.clip===clip) {this.play(clip); this.actions.get(clip)!.time=end.time%this.actionDuration(clip);}
                }
            } else {
                this.flightTarget = this.flightTransition = '';
                if (!abilityPose && mode!=='jump_air') clip = this.styleClip(clip,dt);
            }
        }
        this.play(clip);
        const action = this.actions.get(this.current);
        const targets=directional.size?directional:new Map([[clip,1]]);
        const response=1-Math.exp(-dt/CONFIG.animation.locomotionBlend);
        for(const name of new Set([...this.blendTargets.keys(),...targets.keys()])) {
            const value=T.MathUtils.lerp(this.blendTargets.get(name)??0,targets.get(name)??0,response);
            if(value<.0001 && !targets.has(name))this.blendTargets.delete(name);
            else this.blendTargets.set(name,value);
        }
        if(directional.size) {
            for(const name of directional.keys()) {
                const part=this.actions.get(name)!;
                if(!part.isScheduled())part.reset().setLoop(T.LoopRepeat,Infinity).play();
                part.enabled=true;
            }
        }
        if (action && this.locomotion[clip])
            action.timeScale = T.MathUtils.clamp(
                speed / this.locomotion[clip].baseSpeed,
                0.6,
                this.gaitRateMax(clip),
            );
        if(action && directional.size) {
            const stride=this.aimStride(directional);
            action.timeScale=Math.min(this.gaitRateMax(clip),speed*this.actionDuration(clip)/stride.length);
        }
        this.blendActions(dt);
        if(action && this.locomotion[clip]) {
            const phase=contactPhase(action.time+dt*action.timeScale,action.getClip().duration,this.locomotion[clip]);
            for(const [name,fading] of this.actions) if(name!==clip && this.locomotion[name] && (this.baseWeights.get(name)??0)>0) {
                fading.timeScale=T.MathUtils.clamp(speed/this.locomotion[name].baseSpeed,.6,
                    this.gaitRateMax(name));
                fading.time=contactTime(phase,fading.getClip().duration,this.locomotion[name])-dt*fading.timeScale;
            }
        }
        if (mode === 'takeoff' && action)
            action.timeScale = action.getClip().duration / CONFIG.playerTakeoffDuration;
        if (mode === 'jump_start' && action)
            action.timeScale = action.getClip().duration / CONFIG.playerJumpStartDuration;
        if (mode === 'jump_land' && action)
            action.timeScale = action.getClip().duration / CONFIG.playerJumpLandingDuration;
        if (mode === 'slam' && action) action.paused = true;
        this.blendPunch(dt, punchRemaining, !air, speed, punchElapsed, abilityPose || 'punch');
        this.turnYawDelta=0;
        const turn=this.actions.get(this.groundTurn);
        if(turn && dt>0 && !turn.paused) {
            this.turnYawDelta=(this.turnYaw(this.groundTurn,Math.min(turn.getClip().duration,turn.time+dt))-
                this.turnYaw(this.groundTurn,turn.time))*turn.getEffectiveWeight();
            this.group.rotation.y+=this.turnYawDelta;
        }
        this.mixer.update(dt);
        if(turn && turn.time>=turn.getClip().duration)this.groundTurn='';
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
                ['fall', 'land', 'style_land_from_back', 'jump_start', 'jump_land',
                    ...(typeof this.styleProfile?.fall==='string' ? [this.styleProfile.fall] : [])].reduce((sum, name) => {
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
