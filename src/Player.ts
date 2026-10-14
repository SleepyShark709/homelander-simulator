import * as T from 'three';
import { Assets, PersonVisual } from './Assets';
import { Physics, R, vec } from './Physics';
import { Input } from './Input';
import { CONFIG } from './config';
import { limitAxis } from './rules';
import { v } from './World';
export type PlayerMode = 'ground' | 'takeoff' | 'fly' | 'fall' | 'slam';
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
    recovery = 0;
    shake = 0;
    private previousVisualYaw = 0;
    private flightHull = false;
    private movementYaw = Math.PI;
    private takeoffTime = 0;
    private punchHitTime = 0;
    private punchHitPending = false;
    private slamElapsed = 0;
    private slamImpactDelay = 0;
    private slamImpactPending = false;
    onContact = (c: R.Collider, speed: number, direction: T.Vector3) => false;
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
    step(dt: number) {
        this.previous.copy(this.position);
        this.previousVelocity.copy(this.velocity);
        if (this.mode === 'slam') this.slamElapsed += dt;
        if (this.slamImpactPending) {
            this.slamImpactDelay -= dt;
            if (this.slamImpactDelay <= 0) {
                this.slamImpactPending = false;
                this.shake = 0.35;
                this.onSlam(this.feet);
            }
        }
        if (this.punchHitPending) {
            this.punchHitTime -= dt;
            if (this.punchHitTime <= 0) {
                this.punchHitPending = false;
                this.onPunch();
            }
        }
        this.punchTime = Math.max(0, this.punchTime - dt);
        this.recovery = Math.max(0, this.recovery - dt);
        this.shake = Math.max(0, this.shake - dt);
        if(this.mode==='takeoff') {
            this.takeoffTime-=dt;
            if(this.takeoffTime<=0) {
                this.mode='fly';this.position.y+=.13;this.velocity.y=8;
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
                this.velocity.y = 0;
            } else if(this.mode==='ground') {
                this.mode='takeoff';this.takeoffTime=this.visual.actionDuration('takeoff');
            } else {
                this.mode = 'fly';
                this.position.y += 0.13;
                this.velocity.y = 0;
            }
        }
        if (
            this.input.take('KeyQ') &&
            this.mode !== 'ground' &&
            this.mode !== 'takeoff' &&
            this.mode !== 'slam' &&
            this.recovery === 0
        ) {
            this.mode = 'slam';
            this.punchTime = 0;
            this.punchHitPending = false;
            this.slamElapsed = 0;
        }
        if (this.input.punch) {
            this.input.punch = false;
            if (!this.punchTime && this.mode !== 'slam' && !this.recovery) {
                this.punchTime = this.visual.actionDuration('punch');
                this.punchHitTime = this.punchTime * CONFIG.punchHitFraction;
                this.punchHitPending = true;
            }
        }
        const f = this.horizontal(),
            right = v(-f.z, 0, f.x),
            wish = v();
        if (this.input.keys.has('KeyW')) wish.add(f);
        if (this.input.keys.has('KeyS')) wish.sub(f);
        if (this.input.keys.has('KeyD')) wish.add(right);
        if (this.input.keys.has('KeyA')) wish.sub(right);
        if (wish.lengthSq() > 0) wish.normalize();
        const flying = this.mode === 'fly',
            speed = flying
                ? this.input.shift
                    ? CONFIG.boost
                    : CONFIG.fly
                : this.input.shift
                  ? CONFIG.sprint
                  : CONFIG.walk;
        const wantFlightHull=flying || this.mode === 'fall';
        if (wantFlightHull !== this.flightHull) {
            let blocked=false;
            if(wantFlightHull) this.physics.world.intersectionsWithShape(
                this.position,{x:0,y:0,z:0,w:1},new R.Ball(CONFIG.playerFlightRadius),
                () => {blocked=true;return false;},undefined,undefined,this.collider,undefined,
                c=>!this.physics.ignored.has(c.handle),
            );
            if(!blocked) {
                this.collider.setShape(new R.Ball(wantFlightHull ? CONFIG.playerFlightRadius : CONFIG.playerGroundRadius));
                this.collider.setTranslationWrtParent({x:0,y:wantFlightHull ? 0 : CONFIG.playerGroundRadius - 1,z:0});
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
            const smoothing = 1 - Math.exp(-dt * 9);
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
            if (flying)
                this.velocity.y = T.MathUtils.lerp(
                    this.velocity.y,
                    wish.y,
                    smoothing,
                );
            else if (this.mode === 'ground' && this.controller.computedGrounded()) {
                // The controller already supplies ground contact and snapping. Repeated
                // downward casts at its offset boundary can consume horizontal movement.
                this.velocity.y = 0;
            } else this.velocity.y = Math.max(-45, this.velocity.y - 24 * dt);
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
        this.controller.computeColliderMovement(
            this.collider,
            queryMovement,
            undefined,
            undefined,
            predicate,
        );
        let retry = false;
        if (actualSpeed >= CONFIG.contactSpeed) {
            for (let i = 0; i < this.controller.numComputedCollisions(); i++) {
                const collision = this.controller.computedCollision(i);
                if (!collision?.collider) continue;
                if (Math.abs(collision.normal1.y) > 0.7) continue;
                retry =
                    this.onContact(
                        collision.collider,
                        actualSpeed,
                        this.velocity.clone().normalize(),
                    ) || retry;
                this.shake = 0.13;
            }
        }
        if (retry)
            this.controller.computeColliderMovement(
                this.collider,
                queryMovement,
                undefined,
                undefined,
                predicate,
            );
        const movement = stationary ? v() : vec(this.controller.computedMovement());
        const grounded = this.controller.computedGrounded();
        this.position.add(movement);
        this.position.x = T.MathUtils.clamp(this.position.x, -99, 99);
        this.position.z = T.MathUtils.clamp(this.position.z, -99, 99);
        this.position.y = T.MathUtils.clamp(this.position.y, 0.98, 80);
        if (grounded && this.velocity.y <= 0) {
            if (this.mode === 'slam') {
                const duration = this.visual.actionDuration('slam');
                const contactTime = duration * CONFIG.slamHitFraction;
                this.slamImpactDelay = Math.max(0, contactTime - this.slamElapsed);
                this.slamImpactPending = true;
                this.recovery = duration - Math.min(this.slamElapsed,contactTime);
                if (!this.slamImpactDelay) {
                    this.slamImpactPending = false;
                    this.shake = 0.35;
                    this.onSlam(this.feet);
                }
            }
            if (this.mode !== 'takeoff' && (this.mode !== 'fly' || wish.y < 0)) {
                if (this.mode !== 'ground' && this.mode !== 'slam') this.recovery = this.visual.actionDuration('land');
                this.mode = 'ground';
            }
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
        const moving = (this.mode === 'ground' || this.mode === 'takeoff') && horizontalSpeed > Math.sqrt(0.5) && !this.input.laser && !this.punchTime;
        const desiredYaw = moving ? Math.atan2(this.renderVelocity.x,this.renderVelocity.z) : this.input.yaw+Math.PI;
        const headingDelta=T.MathUtils.euclideanModulo(desiredYaw-this.movementYaw+Math.PI,Math.PI*2)-Math.PI;
        this.movementYaw += headingDelta*(1-Math.exp(-dt*16));
        this.visual.group.rotation.y=this.movementYaw;
        const mode = this.punchTime
            ? 'punch'
            : this.mode === 'takeoff' ? 'takeoff'
            : this.mode === 'fly'
              ? this.velocity.length() > 18
                  && this.flightHull ? 'boost'
                  : 'fly'
              : this.mode === 'slam'
                ? 'slam'
                : this.mode === 'fall'
                  ? 'fall'
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
        );
    }
}
