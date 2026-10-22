import * as T from 'three';
import type { Assets } from '../core/Assets';
import { PersonVisual } from './PersonVisual';
import { type Physics, R } from '../core/Physics';
import { v, vec, limitAxis } from '../core/math';
import type { Input } from '../core/Input';
import { CONFIG } from '../core/config';
export type PlayerMode = 'ground' | 'jump' | 'takeoff' | 'fly' | 'fall' | 'slam';
export class Player {
    body: R.RigidBody;
    collider: R.Collider;
    controller: R.KinematicCharacterController;
    visual: PersonVisual;
    position = v(0, 1.0, 25);
    previous = this.position.clone();
    velocity = v();
    previousVelocity = v();
    renderVelocity = v();
    mode: PlayerMode = 'ground';
    punchTime = 0;
    attackClip: keyof typeof CONFIG.heroAttacks = 'punch';
    laserPose = 0;
    recovery = 0;
    shake = 0;
    private previousVisualYaw = 0;
    private flightHull = false;
    private movementYaw = Math.PI;
    private takeoffTime = 0;
    private punchQueuedTime = 0;
    private queuedAttack: keyof typeof CONFIG.heroAttacks = 'punch';
    private simulationTime = 0;
    private jumpTime = 0;
    private recoveryClip = 'land';
    private punchHits: number[] = [];
    private airbornePeak = this.position.y;
    onContact = (c: R.Collider, speed: number, direction: T.Vector3, vertical = false) => false;
    onSlam = (p: T.Vector3) => {};
    onPunch = () => {};
    constructor(
        public physics: Physics,
        assets: Assets,
        public input: Input,
        group: T.Group,
    ) {
        this.body = physics.world.createRigidBody(
            R.RigidBodyDesc.kinematicPositionBased().setTranslation(
                ...(this.position.toArray() as [number, number, number]),
            ),
        );
        this.collider = physics.world.createCollider(
            R.ColliderDesc.ball(CONFIG.playerGroundRadius)
                .setTranslation(0, CONFIG.playerGroundRadius - 1, 0),
            this.body,
        );
        this.controller = physics.world.createCharacterController(0.03);
        this.controller.setSlideEnabled(true);
        this.controller.enableAutostep(0.42, 0.25, false);
        this.controller.enableSnapToGround(0.3);
        this.visual = new PersonVisual(assets, 'hero');
        if (this.visual.cape) this.visual.cape.worldCollision = (from,to,radius) =>
            this.physics.constrainSphere(from,to,radius,this.collider);
        group.add(this.visual.group);
        this.sync();
    }
    direction() {
        return v(
            -Math.sin(this.input.yaw) * Math.cos(this.input.pitch),
            Math.sin(this.input.pitch),
            -Math.cos(this.input.yaw) * Math.cos(this.input.pitch),
        );
    }
    horizontal() {
        return v(-Math.sin(this.input.yaw), 0, -Math.cos(this.input.yaw));
    }
    get feet() {
        return this.position.clone().add(v(0, -1.0, 0));
    }
    clearBufferedAttack() { this.punchQueuedTime = 0; }
    get superSpeedRequested() {
        const keys = this.input.keys;
        const horizontal = Number(keys.has('KeyW')) - Number(keys.has('KeyS')) ||
            Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
        const vertical = this.mode === 'fly' && (Number(keys.has('Space')) -
            Number(keys.has('ControlLeft') || keys.has('ControlRight')));
        return this.input.shift && !this.recovery && (this.mode === 'ground' || this.mode === 'fly') && !!(horizontal || vertical);
    }
    step(dt: number) {
        this.simulationTime += dt;
        this.previous.copy(this.position);
        this.previousVelocity.copy(this.velocity);
        this.punchHits = this.punchHits.map(time => time - dt);
        while (this.punchHits.length && this.punchHits[0] <= 0) {
            this.punchHits.shift();
            this.onPunch();
        }
        this.punchTime = Math.max(0, this.punchTime - dt);
        this.punchQueuedTime = Math.max(0, this.punchQueuedTime - dt);
        this.recovery = Math.max(0, this.recovery - dt);
        this.shake = Math.max(0, this.shake - dt);
        if (this.mode === 'jump') {
            const previousTime = this.jumpTime;
            this.jumpTime += dt;
            if (previousTime < CONFIG.playerJumpAnticipation && this.jumpTime >= CONFIG.playerJumpAnticipation)
                this.velocity.y = CONFIG.playerJumpSpeed;
        }
        if(this.mode==='takeoff') {
            this.takeoffTime-=dt;
            if(this.takeoffTime<=0) {
                this.mode='fly';this.velocity.y=8;
            }
        }
        if (
            this.input.take('KeyF') &&
            this.mode !== 'slam' &&
            this.mode !== 'takeoff' &&
            this.recovery === 0
        ) {
            if (this.mode === 'fly') {
                this.mode = 'fall';
                this.airbornePeak = this.position.y;
                this.velocity.y = 0;
            } else if(this.mode==='ground' || (this.mode==='jump' &&
                this.jumpTime < CONFIG.playerJumpAnticipation && this.controller.computedGrounded())) {
                this.mode='takeoff';this.takeoffTime=CONFIG.playerTakeoffDuration;
            } else {
                this.mode = 'fly';
                this.velocity.y = 0;
            }
        }
        if (
            this.input.take('KeyQ') &&
            this.mode !== 'ground' &&
            this.mode !== 'takeoff' &&
            this.mode !== 'slam' &&
            !(this.mode === 'jump' && this.jumpTime < CONFIG.playerJumpAnticipation) &&
            this.recovery === 0
        ) {
            this.mode = 'slam';
            this.punchTime = 0;
            this.punchHits = [];
            this.clearBufferedAttack();
        }
        if (this.input.take('Space') && this.mode === 'ground' &&
            this.controller.computedGrounded() && !this.recovery && !this.punchTime) {
            this.mode = 'jump';
            this.jumpTime = 0;
            this.airbornePeak = this.position.y;
            this.visual.play('jump_start', true);
        }
        if (this.input.take('KeyV')) this.laserPose = (this.laserPose + 1) % 3;
        let attack: keyof typeof CONFIG.heroAttacks | undefined = this.input.punch ? 'punch' : undefined;
        this.input.punch = false;
        for (const [key, clip] of [['KeyE', 'casual_attack'], ['KeyR', 'combo_a'], ['KeyT', 'combo_b']] as const)
            if (this.input.take(key)) attack = clip;
        if (attack && this.mode !== 'slam' && this.mode !== 'jump' && !this.recovery) {
            this.queuedAttack = attack;
            this.punchQueuedTime = CONFIG.punchInputBuffer;
        }
        if (this.punchQueuedTime > 0 && !this.punchTime && this.mode !== 'slam' && this.mode !== 'jump' && !this.recovery) {
            this.clearBufferedAttack();
            this.attackClip = this.queuedAttack;
            this.punchTime = this.visual.actionDuration(this.attackClip);
            this.punchHits = CONFIG.heroAttacks[this.attackClip].map(fraction => this.punchTime * fraction);
        }
        const f = this.horizontal(),
            right = v(-f.z, 0, f.x),
            wish = v();
        if (this.input.keys.has('KeyW')) wish.add(f);
        if (this.input.keys.has('KeyS')) wish.sub(f);
        if (this.input.keys.has('KeyD')) wish.add(right);
        if (this.input.keys.has('KeyA')) wish.sub(right);
        if (wish.lengthSq() > 0) wish.normalize();
        const flying = this.mode === 'fly';
        let speed:number = flying
                ? this.input.shift
                    ? CONFIG.boost
                    : CONFIG.fly
                : this.input.shift
                  ? CONFIG.sprint
                  : CONFIG.walk;
        if(this.mode==='ground' && this.input.laser && !this.punchTime && wish.lengthSq()>0) {
            const yaw=this.input.yaw+Math.PI,c=Math.cos(yaw),s=Math.sin(yaw);
            speed=this.visual.aimSpeedLimit(c*wish.x-s*wish.z,s*wish.x+c*wish.z,this.input.shift);
        }
        const wantFlightHull=flying || this.mode === 'fall';
        if (wantFlightHull !== this.flightHull) {
            let blocked=false;
            if(wantFlightHull) this.physics.world.intersectionsWithShape(
                this.position.clone().add(v(0,CONFIG.playerFlightRadius-1,0)),
                {x:0,y:0,z:0,w:1},new R.Ball(CONFIG.playerFlightRadius),
                () => {blocked=true;return false;},undefined,undefined,this.collider,undefined,
                c=>!this.physics.ignored.has(c.handle),
            );
            if(!blocked) {
                const radius = wantFlightHull ? CONFIG.playerFlightRadius : CONFIG.playerGroundRadius;
                this.collider.setShape(new R.Ball(radius));
                // Both hulls share the same foot plane, including rooftop contact.
                this.collider.setTranslationWrtParent({x:0,y:radius-1,z:0});
                // Set the world transform so the same-step query sees the new offset.
                this.collider.setTranslation(this.position.clone().add(v(0,radius-1,0)));
                this.flightHull=wantFlightHull;
            }
        }
        wish.multiplyScalar(speed);
        if (flying) {
            if (this.input.keys.has('Space')) wish.y = CONFIG.vertical;
            if (
                this.input.keys.has('ControlLeft') ||
                this.input.keys.has('ControlRight')
            )
                wish.y = -CONFIG.vertical;
            if (wish.length() > speed) wish.setLength(speed);
        }
        if (this.mode === 'slam') {
            wish.set(0, -CONFIG.slamSpeed, 0);
            this.velocity.copy(wish);
        } else {
            const smoothing = 1 - Math.exp(-dt * (this.mode === 'jump' ? 3 : 9));
            // Releasing movement in the air preserves the launch momentum;
            // directional input can still steer without an abrupt reversal.
            if (this.mode !== 'jump' || wish.x !== 0 || wish.z !== 0) {
                this.velocity.x = T.MathUtils.lerp(
                this.velocity.x,
                wish.x,
                smoothing,
                );
                this.velocity.z = T.MathUtils.lerp(
                this.velocity.z,
                wish.z,
                smoothing,
                );
            }
            if (flying)
                this.velocity.y = T.MathUtils.lerp(
                    this.velocity.y,
                    wish.y,
                    smoothing,
                );
            else if ((this.mode === 'ground' || (this.mode === 'jump' && this.jumpTime < CONFIG.playerJumpAnticipation)) && this.controller.computedGrounded()) {
                // The controller already supplies ground contact and snapping. Repeated
                // downward casts at its offset boundary can consume horizontal movement.
                this.velocity.y = 0;
            } else this.velocity.y = Math.max(-45, this.velocity.y - CONFIG.gravity * dt);
            if (this.recovery) this.velocity.set(0, -1, 0);
        }
        this.velocity.x = limitAxis(
            this.position.x,
            this.velocity.x,
            CONFIG.halfMap - 1,
            CONFIG.boundaryBuffer,
        );
        this.velocity.z = limitAxis(
            this.position.z,
            this.velocity.z,
            CONFIG.halfMap - 1,
            CONFIG.boundaryBuffer,
        );
        if (this.velocity.y > 0)
            this.velocity.y *= T.MathUtils.clamp(
                (CONFIG.ceiling - this.position.y) / 10,
                0,
                1,
            );
        const desired = this.velocity.clone().multiplyScalar(dt),
            actualSpeed = this.velocity.length();
        const stationary = desired.lengthSq() < CONFIG.playerSupportProbe ** 2;
        // Rapier's near-zero half-space sweep can return an upward movement of
        // half the ball radius. Probe support with a nonzero query, but retain
        // the requested stationary position; refresh grounded for disappearing ledges.
        const queryMovement = stationary ? v(0, -CONFIG.playerSupportProbe, 0) : desired;
        const predicate = (c: R.Collider) =>
            !this.physics.ignored.has(c.handle);
        // Restart the complete sweep after each removed obstacle. Consuming the
        // old collision list would retain a blocked displacement or hit behind it.
        const contacted = new Set<number>();
        const maxSweeps = this.physics.world.colliders.len() + 1;
        const contactSpeed=this.superSpeedRequested ? Math.min(CONFIG.contactSpeed,CONFIG.superSpeed.impactSpeed) : CONFIG.contactSpeed;
        if(this.superSpeedRequested && actualSpeed>=CONFIG.superSpeed.impactSpeed) {
            // KCC ground prediction can match a nearby moving body's velocity
            // before reporting its contact. Sweep the actual shape first so a
            // consumed person cannot shorten this step. Tangent support is skipped.
            const origin=this.collider.translation(), rotation=this.collider.rotation(), shape=this.collider.shape;
            for(let sweep=0;sweep<maxSweeps;sweep++) {
                const hit=this.physics.world.castShape(origin,rotation,queryMovement,shape,0,1,false,
                    undefined,undefined,this.collider,undefined,predicate);
                if(!hit)break;
                contacted.add(hit.collider.handle);
                const vertical=Math.abs(hit.normal1.y)>0.7;
                if(!this.onContact(hit.collider,actualSpeed,this.velocity.clone().normalize(),vertical)) {
                    if(!vertical)this.shake=.13;
                    break;
                }
            }
        }
        for (let sweep = 0; sweep < maxSweeps; sweep++) {
            this.controller.computeColliderMovement(this.collider, queryMovement, undefined, undefined, predicate);
            let retry = false;
            if (actualSpeed < contactSpeed) break;
            for (let i = 0; i < this.controller.numComputedCollisions(); i++) {
                const collision = this.controller.computedCollision(i);
                if (!collision?.collider) continue;
                const handle = collision.collider.handle;
                if (contacted.has(handle)) continue;
                contacted.add(handle);
                retry = this.onContact(
                        collision.collider,
                        actualSpeed,
                        this.velocity.clone().normalize(),
                        Math.abs(collision.normal1.y) > 0.7,
                    );
                if (!retry && Math.abs(collision.normal1.y) <= 0.7) this.shake = 0.13;
                if (retry) break;
            }
            if (!retry) break;
        }
        const movement = stationary ? v() : vec(this.controller.computedMovement());
        const grounded = this.controller.computedGrounded();
        this.position.add(movement);
        this.position.x = T.MathUtils.clamp(this.position.x, -99, 99);
        this.position.z = T.MathUtils.clamp(this.position.z, -99, 99);
        this.position.y = T.MathUtils.clamp(this.position.y, 0.98, 80);
        this.airbornePeak = this.mode === 'fly' || this.mode === 'takeoff'
            ? this.position.y : Math.max(this.airbornePeak, this.position.y);
        if (grounded && this.velocity.y <= 0) {
            if (this.mode !== 'takeoff' && (this.mode !== 'fly' || wish.y < 0) &&
                !(this.mode === 'jump' && this.jumpTime < CONFIG.playerJumpAnticipation)) {
                const slam = this.mode === 'slam';
                if (slam || (this.mode !== 'ground' && this.airbornePeak - this.position.y >= CONFIG.playerHardLandingHeight)) {
                    this.recoveryClip = 'land';
                    this.visual.playLanding();
                    this.recovery = this.visual.landingRecoveryDuration;
                } else if (this.mode === 'jump') {
                    this.recoveryClip = 'jump_land';
                    this.visual.play('jump_land', true);
                    this.recovery = CONFIG.playerJumpLandingDuration;
                }
                if (slam) {
                    this.shake = 0.35;
                    this.onSlam(this.feet);
                }
                this.mode = 'ground';
            }
            this.airbornePeak = this.position.y;
            this.velocity.y = 0;
        } else if (
            this.mode === 'ground' &&
            this.velocity.y < -CONFIG.playerFallThreshold
        ) {
            // Small curb drops and the initial ground snap do not interrupt locomotion.
            this.mode = 'fall';
        }
        this.body.setNextKinematicTranslation(this.position);
        if (Math.abs(movement.x) < Math.abs(desired.x) * 0.3)
            this.velocity.x = 0;
        if (Math.abs(movement.z) < Math.abs(desired.z) * 0.3)
            this.velocity.z = 0;
        if (desired.y > 0 && movement.y < desired.y * 0.3)
            this.velocity.y = 0;
    }
    sync(alpha = 1) {
        this.renderVelocity.copy(this.previousVelocity).lerp(this.velocity,alpha);
        this.visual.group.position
            .copy(this.previous)
            .lerp(this.position, alpha)
            .add(v(0, -1.0, 0));
        // Movement facing turns smoothly; attacks return the pose to the aim direction.
        this.visual.group.rotation.y = this.movementYaw;
    }
    animate(dt: number, time: number) {
        const horizontalSpeed = Math.hypot(this.renderVelocity.x, this.renderVelocity.z);
        if(dt>0 && this.mode==='ground' && horizontalSpeed<CONFIG.animation.idleTurnSpeed &&
            !this.input.laser && !this.punchTime && !this.recovery &&
            !['KeyW','KeyS','KeyA','KeyD'].some(key=>this.input.keys.has(key))) {
            const delta=T.MathUtils.euclideanModulo(this.input.yaw+Math.PI-this.movementYaw+Math.PI,Math.PI*2)-Math.PI;
            if(Math.abs(delta)>CONFIG.animation.idleTurnAngle)this.visual.startTurn(delta>0);
        }
        const moving = (this.mode === 'ground' || this.mode === 'takeoff' || this.mode === 'jump') && horizontalSpeed > Math.sqrt(0.5) && !this.input.laser && !this.punchTime;
        const desiredYaw = moving ? Math.atan2(this.renderVelocity.x,this.renderVelocity.z)
            : this.mode==='ground' && !this.input.laser && !this.punchTime ? this.movementYaw : this.input.yaw+Math.PI;
        const headingDelta=T.MathUtils.euclideanModulo(desiredYaw-this.movementYaw+Math.PI,Math.PI*2)-Math.PI;
        const turn = headingDelta*(1-Math.exp(-dt*16));
        this.movementYaw += this.punchTime || this.input.laser
            ? T.MathUtils.clamp(turn, -CONFIG.animation.attackTurnSpeed * dt, CONFIG.animation.attackTurnSpeed * dt) : turn;
        this.visual.group.rotation.y=this.movementYaw;
        const mode = this.mode === 'jump' ? this.jumpTime < CONFIG.playerJumpStartDuration ? 'jump_start' : 'jump_air'
            : this.mode === 'takeoff' ? 'takeoff'
            : this.mode === 'fly'
              ? this.input.shift && this.renderVelocity.dot(this.horizontal()) > 18
                  && this.flightHull ? 'boost'
                  : 'fly'
              : this.mode === 'slam'
                ? 'slam'
                : this.mode === 'fall'
                  ? 'fall'
                  : this.recovery > 0 ? this.recoveryClip
                  : 'ground';
        const yawDelta =
            T.MathUtils.euclideanModulo(
                this.input.yaw - this.previousVisualYaw + Math.PI,
                Math.PI * 2,
            ) - Math.PI;
        this.previousVisualYaw = this.input.yaw;
        const bank = T.MathUtils.clamp(
            (yawDelta / Math.max(0.001, dt)) * 0.055 +
                (this.input.keys.has('KeyA') ? 0.1 : 0) -
                (this.input.keys.has('KeyD') ? 0.1 : 0),
            -0.24,
            0.24,
        );
        this.visual.update(
            dt,
            time,
            mode,
            // Match the interpolated position shown this frame; vertical gravity
            // must not switch the standing/walking/running animation.
            mode === 'ground' ? horizontalSpeed : this.renderVelocity.length(),
            this.input.laser,
            bank,
            this.punchTime ? this.attackClip
                : this.input.laser && horizontalSpeed < 1 && !this.recovery
                  && (this.mode === 'ground' || this.mode === 'fly')
                  ? ['idle', 'laser_hip', 'laser_back'][this.laserPose] : '',
            this.renderVelocity,
            this.punchTime,
            this.punchTime > 0 ? Math.max(0, this.visual.actionDuration(this.attackClip) - this.punchTime
                - Math.max(0, this.simulationTime - time)) : undefined,
            !!(Number(this.input.keys.has('KeyW'))-Number(this.input.keys.has('KeyS')) ||
                Number(this.input.keys.has('KeyD'))-Number(this.input.keys.has('KeyA'))),
            this.input.shift,
        );
        this.movementYaw+=this.visual.turnYawDelta;
    }
}
