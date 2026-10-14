import * as T from 'three';
import { StreetWorld, type Entity, v } from './World';
import { Physics, R, vec } from './Physics';
import { Player } from './Player';
import { Wanted } from './rules';
import { Effects } from './Effects';
import { CONFIG, isPerson } from './config';
export class Npcs {
    controller: R.KinematicCharacterController;
    spawnClock = 0;
    dangerUntil = 0;
    danger = v();
    private withdrawals = new Map<
        number,
        { goal: T.Vector3; fadeAt?: number }
    >();
    constructor(
        public world: StreetWorld,
        public physics: Physics,
        public player: Player,
        public wanted: Wanted,
        public effects: Effects,
        public camera: T.Camera,
    ) {
        this.controller = physics.world.createCharacterController(0.03);
        this.controller.enableAutostep(0.42, 0.25, false);
        this.controller.enableSnapToGround(0.4);
        for (let i = 0; i < CONFIG.civilians; i++)
            this.world.spawn(
                'civilian',
                this.world.nav[(i * 5 + 8) % this.world.nav.length],
                0,
            );
    }
    scare(point: T.Vector3, time: number) {
        this.danger.copy(point);
        this.dangerUntil = time + 7;
        for (const e of this.world.alive('civilian'))
            if (e.mesh.position.distanceTo(point) < 35)
                e.scaredUntil = time + 7;
    }
    visible(p: T.Vector3) {
        this.camera.updateMatrixWorld();
        const frustum = new T.Frustum().setFromProjectionMatrix(
            new T.Matrix4().multiplyMatrices(
                this.camera.projectionMatrix,
                this.camera.matrixWorldInverse,
            ),
        );
        if (!frustum.intersectsSphere(new T.Sphere(p, 1.5))) return false;
        return this.physics.clearLine(
            this.camera.position,
            p,
            undefined,
            (c) =>
                !this.world.byCollider.has(c.handle) &&
                c.handle !== this.player.collider.handle &&
                !this.physics.ignored.has(c.handle),
        );
    }
    spawnSafe(kind: 'civilian' | 'police' | 'soldier', time: number) {
        const points = [...this.world.spawnPoints].sort(
            () => Math.random() - 0.5,
        );
        const point = points.find(
            (p) =>
                p.distanceTo(this.player.position) > 28 &&
                !this.visible(p.clone().add(v(0, 1, 0))) &&
                this.world
                    .alive()
                    .every((e) => e.mesh.position.distanceTo(p) > 2),
        );
        if (point) this.world.spawn(kind, point, time);
    }
    update(dt: number, time: number) {
        const enemies = this.world
            .alive()
            .filter((e) => e.kind === 'police' || e.kind === 'soldier');
        const desiredSoldiers = this.wanted.level === 3 ? 8 : 0;
        let budget = this.wanted.budget,
            police = 0,
            soldiers = 0;
        for (const e of enemies) {
            const desired =
                e.kind === 'soldier'
                    ? soldiers < desiredSoldiers
                    : police < budget - desiredSoldiers;
            e.retiring = !desired;
            if (desired) {
                if (e.kind === 'soldier') soldiers++;
                else police++;
            }
        }
        this.spawnClock += dt;
        if (this.spawnClock >= CONFIG.spawnInterval) {
            this.spawnClock = 0;
            for (
                let i = 0;
                i < 2 && this.world.alive('civilian').length < CONFIG.civilians;
                i++
            )
                this.spawnSafe('civilian', time);
            // Total includes retiring units, preventing temporary cap overflow.
            for (let i = 0; i < 2; i++) {
                const all = this.world
                    .alive()
                    .filter((e) => e.kind === 'police' || e.kind === 'soldier');
                if (all.length >= budget) break;
                const kind =
                    this.wanted.level === 3 &&
                    all.filter((e) => e.kind === 'soldier').length < 8
                        ? 'soldier'
                        : 'police';
                this.spawnSafe(kind, time);
            }
        }
        for (const e of [...this.world.entities.values()]) {
            if (!isPerson(e.kind) || e.health.dead) continue;
            if (
                e.retiring &&
                !this.visible(e.mesh.position.clone().add(v(0, 1, 0)))
            ) {
                this.world.remove(e);
                this.wanted.forget(e.id);
                this.withdrawals.delete(e.id);
                continue;
            }
            const p = vec(e.body!.translation()).add(v(0, -1, 0));
            if (e.retiring) {
                let retreat = this.withdrawals.get(e.id);
                if (!retreat) {
                    const goal = this.world.spawnPoints
                        .reduce((a, b) =>
                            a.distanceToSquared(p) < b.distanceToSquared(p)
                                ? a
                                : b,
                        )
                        .clone();
                    if (Math.abs(goal.x) > 80) goal.x = Math.sign(goal.x) * 98;
                    else goal.z = Math.sign(goal.z) * 98;
                    retreat = { goal };
                    this.withdrawals.set(e.id, retreat);
                }
                e.goal.copy(retreat.goal);
                if (p.distanceTo(retreat.goal) < 1.5) retreat.fadeAt ??= time;
                if (retreat.fadeAt !== undefined) {
                    const opacity = 1 - (time - retreat.fadeAt) / 1.2;
                    e.person!.opacity(opacity);
                    if (opacity <= 0) {
                        this.world.remove(e);
                        this.wanted.forget(e.id);
                        this.withdrawals.delete(e.id);
                        continue;
                    }
                }
            } else if (this.withdrawals.has(e.id)) {
                this.withdrawals.delete(e.id);
                e.person!.opacity(1);
            }
            const enemy = e.kind !== 'civilian',
                scared = e.scaredUntil > time;
            const target = this.player.position.clone();
            let shooting = false;
            if (
                enemy &&
                !e.retiring &&
                p.distanceTo(target) < 70 &&
                this.physics.clearLine(
                    p.clone().add(v(0, 1.5, 0)),
                    target,
                    e.collider,
                    (c) =>
                        !this.physics.ignored.has(c.handle) &&
                        c.handle !== this.player.collider.handle,
                )
            ) {
                shooting = true;
                if (time - e.shotAt > (e.kind === 'soldier' ? 0.4 : 1.2)) {
                    e.shotAt = time;
                    this.effects.tracer(p.clone().add(v(0, 1.5, 0)), target);
                    this.effects.particles(target, 0xffd59b, 2);
                }
            }
            if (e.nextThink <= time) {
                e.nextThink = time + 0.15;
                if (!e.retiring && p.distanceTo(e.goal) < 1.2) {
                    const node = this.world.nearestNode(p),
                        choices = this.world.neighbors(node);
                    if (choices.length) {
                        if (e.retiring) {
                            const exit = this.world.spawnPoints.reduce(
                                (a, b) =>
                                    a.distanceTo(p) < b.distanceTo(p) ? a : b,
                            );
                            e.goal = choices
                                .sort(
                                    (a, b) =>
                                        a.distanceToSquared(exit) -
                                        b.distanceToSquared(exit),
                                )[0]
                                .clone();
                        } else if (enemy)
                            e.goal = choices
                                .sort(
                                    (a, b) =>
                                        a.distanceToSquared(target) -
                                        b.distanceToSquared(target),
                                )[0]
                                .clone();
                        else if (scared)
                            e.goal = choices
                                .sort(
                                    (a, b) =>
                                        b.distanceToSquared(this.danger) -
                                        a.distanceToSquared(this.danger),
                                )[0]
                                .clone();
                        else
                            e.goal =
                                choices[
                                    Math.floor(Math.random() * choices.length)
                                ].clone();
                    }
                }
            }
            const dir = e.goal.clone().sub(p);
            dir.y = 0;
            const moving =
                (!shooting || p.distanceTo(target) > 24) && dir.length() > 0.3;
            const speed = enemy ? 3.5 : scared ? 5 : 1.5;
            const step = moving
                ? dir.normalize().multiplyScalar(speed * dt)
                : v();
            if (moving) {
                const toward = step.clone().normalize();
                for (const other of this.world.alive()) {
                    if (other.id === e.id || !isPerson(other.kind)) continue;
                    const delta = p.clone().sub(other.mesh.position);
                    delta.y = 0;
                    const distance = delta.length();
                    if (distance > 0.02 && distance < 1.25) {
                        const side = Math.min(e.id, other.id) % 2 ? 1 : -1;
                        step.add(
                            v(-toward.z, 0, toward.x).multiplyScalar(
                                side * (1 - distance / 1.25) * speed * dt * 0.8,
                            ),
                        );
                    }
                }
                const horizontalLength = step.length();
                if (horizontalLength > speed * dt)
                    step.multiplyScalar((speed * dt) / horizontalLength);
            }
            step.y = -0.25;
            this.controller.computeColliderMovement(
                e.collider,
                step,
                undefined,
                undefined,
                (c) =>
                    c.handle !== this.player.collider.handle &&
                    !this.physics.ignored.has(c.handle),
            );
            const movement = vec(this.controller.computedMovement());
            e.body!.setNextKinematicTranslation(
                vec(e.body!.translation()).add(movement),
            );
            const face = shooting ? target.sub(p) : dir;
            if (face.lengthSq() > 0.01)
                e.mesh.rotation.y += (T.MathUtils.euclideanModulo(Math.atan2(face.x,face.z)-e.mesh.rotation.y+Math.PI,Math.PI*2)-Math.PI)*(1-Math.exp(-dt*12));
            e.person!.update(
                dt,
                time,
                shooting ? 'shoot' : 'ground',
                moving ? Math.hypot(movement.x,movement.z)/dt : 0,
            );
        }
    }
}
