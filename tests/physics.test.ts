import { beforeAll, it, expect } from 'vitest';
import { Physics, R } from '../src/core/Physics';
import { Vector3 } from 'three';
beforeAll(async () => {
    await R.init();
});
it('sweeps a fast character against a thin wall and opens a destroyed panel without crossing the back wall', () => {
    const p = new Physics();
    const panel = p.staticBox(new Vector3(0, 1, -2), new Vector3(6, 4, 0.15));
    p.staticBox(new Vector3(0, 1, -5), new Vector3(6, 4, 0.2));
    const body = p.world.createRigidBody(
        R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1, 0),
    );
    const collider = p.world.createCollider(
        R.ColliderDesc.capsule(0.65, 0.32),
        body,
    );
    const controller = p.world.createCharacterController(0.03);
    p.world.step();
    controller.computeColliderMovement(collider, { x: 0, y: 0, z: -10 });
    expect(controller.computedMovement().z).toBeGreaterThan(-2);
    p.world.removeCollider(panel, true);
    p.world.step();
    controller.computeColliderMovement(collider, { x: 0, y: 0, z: -10 });
    expect(controller.computedMovement().z).toBeLessThan(-2);
    expect(controller.computedMovement().z).toBeGreaterThan(-5);
    p.dispose();
});
it('roof blocks downward area line-of-sight', () => {
    const p = new Physics();
    p.staticBox(new Vector3(0, 5, 0), new Vector3(10, 0.4, 10));
    p.world.step();
    expect(p.clearLine(new Vector3(0, 5.5, 0), new Vector3(0, 1, 0))).toBe(
        false,
    );
    expect(p.clearLine(new Vector3(0, 5.5, 0), new Vector3(3, 6, 0))).toBe(
        true,
    );
    p.dispose();
});
it('character filters use JS handle metadata so the WASM world can be released after movement', () => {
    const p = new Physics();
    p.staticBox(new Vector3(0, -0.5, 0), new Vector3(10, 1, 10));
    const body = p.world.createRigidBody(
        R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1, 0),
    );
    const collider = p.world.createCollider(
        R.ColliderDesc.capsule(0.65, 0.32),
        body,
    );
    const controller = p.world.createCharacterController(0.03);
    p.world.step();
    controller.computeColliderMovement(
        collider,
        { x: 0, y: -0.2, z: 0 },
        undefined,
        undefined,
        (c) => !p.ignored.has(c.handle),
    );
    expect(() => p.dispose()).not.toThrow();
});
