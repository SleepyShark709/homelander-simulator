import * as T from 'three';
import type { Player } from '../characters/Player';
import { type Physics, R } from '../core/Physics';
import { v } from '../core/math';
import { CONFIG } from '../core/config';
export class FollowCamera {
    camera = new T.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 600);
    constructor(
        public physics: Physics,
        public player: Player,
    ) {
        this.camera.position.set(4, 4, 32);
    }
    update(dt: number, menu: boolean, interpolated = false) {
        const p = this.player,
            speed = (interpolated ? p.renderVelocity : p.velocity).length(),
            // The render camera must follow the same interpolated feet as the model.
            anchor = (interpolated ? p.visual.group.position.clone() : p.feet)
                .add(v(0, 1.65, 0));
        if (menu) {
            this.camera.position.lerp(
                p.position.clone().add(v(4.4, 1.0, -6.5)),
                1 - Math.exp(-dt * 3),
            );
            this.camera.lookAt(p.position.clone().add(v(-2.5, 0.3, 0)));
            return;
        }
        const groundBoost = p.mode === 'ground' && p.superSpeedRequested
            ? T.MathUtils.smoothstep(speed, CONFIG.walk, CONFIG.sprint) : 0;
        const dir = p.direction(),
            right = v(-dir.z, 0, dir.x).normalize();
        const desired = dir
            .clone()
            .multiplyScalar(
                -(
                    5.2 +
                    T.MathUtils.smoothstep(speed, 12, 40) * 2.0 +
                    groundBoost * CONFIG.superSpeed.groundCameraDistance
                ),
            )
            .addScaledVector(right, 0.85)
            .add(v(0, 0.7, 0));
        const length = desired.length();
        const hit = this.physics.world.castShape(
            anchor,
            { x: 0, y: 0, z: 0, w: 1 },
            desired.clone().normalize(),
            new R.Ball(0.25),
            0,
            length,
            true,
            undefined,
            undefined,
            p.collider,
            undefined,
            (c) => !this.physics.ignored.has(c.handle),
        );
        if (hit) desired.setLength(Math.max(0.45, hit.time_of_impact - 0.12));
        this.camera.position.copy(anchor).add(desired);
        if (p.shake > 0)
            this.camera.position.add(
                v(
                    (Math.random() - 0.5) * p.shake * 0.2,
                    (Math.random() - 0.5) * p.shake * 0.2,
                    0,
                ),
            );
        this.camera.lookAt(
            this.camera.position.clone().addScaledVector(dir, 100),
        );
        if (p.mode === 'fly')
            this.camera.rotateZ(p.visual.model.rotation.z * 0.22);
        if (interpolated) this.camera.fov = T.MathUtils.lerp(
            this.camera.fov,
            speed > 18 ? 72 : T.MathUtils.lerp(62, CONFIG.superSpeed.groundFov, groundBoost),
            1 - Math.exp(-dt * 4),
        );
        this.camera.updateProjectionMatrix();
    }
}
