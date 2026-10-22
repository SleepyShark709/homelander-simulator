import * as T from 'three';
import type { StreetWorld } from '../world/World';
import { type Entity, isPerson } from '../world/entities';
import { type Physics, R } from '../core/Physics';
import { v, vec } from '../core/math';
import type { Player } from '../characters/Player';
import type { Wanted } from './rules';
import type { Effects } from '../render/Effects';
import type { Npcs } from './Npcs';
import { CONFIG } from '../core/config';
import { Ragdoll } from '../characters/Ragdoll';
export class Combat {
    time = 0;
    worldTime = 0;
    serial = 0;
    laserAccumulator = 0;
    contacts = new Map<number, number>();
    kills = 0;
    destroyed = 0;
    private beamEnds = [v(),v()];
    constructor(
        public world: StreetWorld,
        public physics: Physics,
        public player: Player,
        public wanted: Wanted,
        public effects: Effects,
        public npcs: Npcs,
        public camera: T.Camera,
    ) {
        player.onPunch = () => this.punch();
        player.onSlam = (p) => this.slam(p);
        player.onContact = (c, s, d, vertical) => this.contact(c, s, d, vertical);
    }
    blocking(c: R.Collider) {
        return (
            c.handle !== this.player.collider.handle &&
            !this.physics.ignored.has(c.handle)
        );
    }
    hit(
        e: Entity,
        damage: number,
        token: string,
        point: T.Vector3,
        dir: T.Vector3,
        force: number,
    ) {
        const result = e.health.hit(damage, token, this.time);
        if (!result.applied) return false;
        this.wanted.hit(e.id, this.time);
        this.npcs.scare(point, this.worldTime);
        this.effects.particles(
            point,
            isPerson(e.kind) ? 0x962e32 : 0xffc490,
            4,
            isPerson(e.kind),
        );
        if (result.killed) {
            this.wanted.destroyed(e.kind);
            if (isPerson(e.kind)) {
                this.kills++;
                e.deathTime = this.worldTime;
                this.world.byCollider.delete(e.collider.handle);
                this.physics.world.removeRigidBody(e.body!);
                e.ragdoll = new Ragdoll(
                    this.physics, e.person!,
                    dir.clone().multiplyScalar(force).add(v(0, 5, 0)),
                    v(
                        2 + Math.random() * 2,
                        Math.random() * 2,
                        Math.random() * 3,
                    ),
                );
                e.body = e.ragdoll.root.body;
                e.collider = e.ragdoll.root.collider;
                for (const part of e.ragdoll.parts.values()) this.world.byCollider.set(part.collider.handle, e);
            } else {
                this.destroyed++;
                this.effects.fragments(
                    point,
                    e.kind === 'car' ? 0x59676b : 0xada58d,
                    2,
                    e.mesh.userData.fragmentType === 'glass',
                );
                if (e.kind === 'car') {
                    e.mesh.traverse((o) => {
                        if (o instanceof T.Mesh) {
                            const old = o.material;
                            const m = (
                                Array.isArray(old) ? old[0] : old
                            ).clone() as T.MeshStandardMaterial;
                            m.color?.set(0x424746);
                            m.roughness = 1;
                            o.material = m;
                        }
                    });
                } else {
                    e.mesh.visible = false;
                    this.world.byCollider.delete(e.collider.handle);
                    this.physics.world.removeCollider(e.collider, true);
                }
            }
        } else if (e.kind === 'panel' || e.kind === 'prop') {
            e.mesh.traverse((o) => {
                if (o instanceof T.Mesh) {
                    const material = o.material as T.MeshStandardMaterial;
                    material.color.multiplyScalar(0.86);
                }
            });
        }
        if (e.kind === 'car' && e.body) {
            e.carOwnedUntil = this.worldTime + 5;
            e.collisionHits.clear();
            e.body.applyImpulse(
                dir
                    .clone()
                    .multiplyScalar(force * 200)
                    .add(v(0, force * 110, 0)),
                true,
            );
            if (force > 5)
                e.body.applyTorqueImpulse(v(force * 170, 0, force * 130), true);
        }
        return true;
    }
    visibleTarget(origin: T.Vector3, e: Entity, end = vec(e.collider.translation())) {
        return this.physics.clearLine(
            origin,
            end,
            this.player.collider,
            (c) => this.blocking(c) && c.handle !== e.collider.handle,
        );
    }
    punch() {
        this.wanted.action();
        const origin = this.player.position.clone(),
            dir = this.player.direction();
        const token = `punch:${++this.serial}`;
        for (const e of this.world.alive()) {
            const target = e.kind === 'car'
                    ? vec(e.collider.projectPoint(origin, true)!.point)
                    : vec(e.collider.translation()),
                offset = target.clone().sub(origin);
            const radius = e.kind === 'car' ? 0 : e.kind === 'panel' ? 2 : 0.5;
            if (
                offset.length() > CONFIG.punchRange + radius ||
                offset.clone().normalize().dot(dir) < 0.45 ||
                !this.visibleTarget(origin, e, target)
            )
                continue;
            this.hit(e, CONFIG.punchDamage, token, target, dir, 12);
            this.player.shake = 0.13;
        }
        this.npcs.scare(origin, this.worldTime);
    }
    slam(point: T.Vector3) {
        this.wanted.action();
        this.npcs.scare(point, this.worldTime);
        this.effects.ring(point);
        this.effects.fragments(point, 0xa1a598, 1);
        const origin = point.clone().add(v(0, 0.25, 0)),
            token = `slam:${++this.serial}`;
        for (const e of this.world.alive()) {
            const target = vec(e.collider.translation()),
                dir = target.clone().sub(origin);
            if (
                dir.length() > CONFIG.slamRadius ||
                !this.visibleTarget(origin, e)
            )
                continue;
            this.hit(e, CONFIG.slamDamage, token, target, dir.normalize(), 17);
        }
    }
    contact(c: R.Collider, speed: number, dir: T.Vector3, vertical = false) {
        const e = this.world.byCollider.get(c.handle);
        if (!e || e.health.dead) return false;
        if (isPerson(e.kind) && this.player.superSpeedRequested && speed >= CONFIG.superSpeed.impactSpeed) {
            const point = vec(c.translation());
            const result = e.health.hit(e.health.hp, `speed:${++this.serial}`, this.time);
            if (!result.killed) return false;
            this.wanted.hit(e.id, this.time);
            this.wanted.destroyed(e.kind);
            this.npcs.scare(point, this.worldTime);
            this.kills++;
            this.effects.impactRemnant.spawn(e.mesh,dir);
            this.world.remove(e);
            this.effects.bloodImpact(point, dir, this.player.collider,
                c => this.blocking(c) && !isPerson(this.world.byCollider.get(c.handle)?.kind ?? 'prop'));
            this.wanted.forget(e.id);
            return true;
        }
        if (vertical || speed<CONFIG.contactSpeed) return false;
        if (this.time - (this.contacts.get(e.id) ?? -Infinity) < 0.5)
            return false;
        this.contacts.set(e.id, this.time);
        this.hit(
            e,
            CONFIG.contactDamage,
            `contact:${++this.serial}`,
            vec(c.translation()),
            dir,
            14,
        );
        return e.health.dead && (e.kind === 'panel' || e.kind === 'prop');
    }
    laser(dt: number) {
        const p = this.player;
        if (
            !p.input.laser ||
            p.punchTime > 0 ||
            p.recovery > 0 ||
            p.mode === 'slam'
        ) {
            this.effects.hideBeams();
            this.laserAccumulator = 0;
            return;
        }
        this.wanted.action();
        this.laserAccumulator += dt;
        const tick = this.laserAccumulator >= CONFIG.laserTick - 1e-8;
        if (tick) this.laserAccumulator -= CONFIG.laserTick;
        this.camera.updateMatrixWorld();
        p.visual.group.updateMatrixWorld(true);
        const direction = this.camera.getWorldDirection(v());
        const origin = this.camera.position;
        const aimed = this.physics.ray(
            origin,
            direction,
            CONFIG.laserRange,
            p.collider,
            (c) => this.blocking(c),
        );
        const end = origin
            .clone()
            .addScaledVector(
                direction,
                aimed?.timeOfImpact ?? CONFIG.laserRange,
            );
        const token = tick ? `laser:${++this.serial}` : '';
        for (let i = 0; i < 2; i++) {
            const eye = p.visual.eyes[i].getWorldPosition(v()),
                dir = end.clone().sub(eye),
                distance = Math.min(CONFIG.laserRange, dir.length());
            dir.normalize();
            const hit = this.physics.ray(
                eye,
                dir,
                distance + 0.02,
                p.collider,
                (c) => this.blocking(c),
            );
            const final = eye
                .clone()
                .addScaledVector(dir, hit?.timeOfImpact ?? distance);
            this.effects.beam(i, eye, final);
            this.beamEnds[i].copy(final);
            if (hit && tick) {
                this.effects.particles(final, 0xff6540, 2);
                const e = this.world.byCollider.get(hit.collider.handle);
                if (e)
                    this.hit(
                        e,
                        CONFIG.laserDps * CONFIG.laserTick,
                        token,
                        final,
                        dir,
                        1,
                    );
                this.npcs.scare(final, this.worldTime);
            }
        }
    }
    renderBeams() {
        if(!this.effects.beams[0].visible)return;
        this.player.visual.group.updateMatrixWorld(true);
        for(let i=0;i<2;i++)this.effects.beam(i,this.player.visual.eyes[i].getWorldPosition(v()),this.beamEnds[i]);
    }
    update(dt: number, time: number) {
        this.time = time;
        this.laser(dt);
        for (const [id, t] of this.contacts)
            if (time - t > 3) this.contacts.delete(id);
        for (const e of [...this.world.entities.values()]) {
            if (e.deathTime !== undefined && this.worldTime - e.deathTime > 12) {
                this.world.remove(e);
                this.wanted.forget(e.id);
            }
            if (
                e.kind === 'car' &&
                e.body &&
                this.worldTime < e.carOwnedUntil &&
                vec(e.body.linvel()).length() > 3
            ) {
                for (const person of this.world
                    .alive()
                    .filter((p) => isPerson(p.kind))) {
                    if (e.collisionHits.has(person.id)) continue;
                    if (
                        e.collider.intersectsShape(
                            person.collider.shape,
                            person.collider.translation(),
                            person.collider.rotation(),
                        )
                    ) {
                        e.collisionHits.add(person.id);
                        const dir = vec(e.body.linvel()).normalize();
                        this.hit(
                            person,
                            150,
                            `car:${e.id}:${person.id}:${e.carOwnedUntil}`,
                            vec(person.collider.translation()),
                            dir,
                            10,
                        );
                    }
                }
            }
        }
        const corpses = [...this.world.entities.values()]
            .filter((e) => e.deathTime !== undefined)
            .sort((a, b) => a.deathTime! - b.deathTime!);
        while (corpses.length > CONFIG.corpseCap)
            this.world.remove(corpses.shift()!);
    }
}
