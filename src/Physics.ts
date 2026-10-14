import R from '@dimforge/rapier3d-compat';
import * as T from 'three';
export { R };
export const vec = (p: { x: number; y: number; z: number }) =>
    new T.Vector3(p.x, p.y, p.z);
export class Physics {
    ignored = new Set<number>();
    world = new R.World({ x: 0, y: -24, z: 0 });
    staticBox(p: T.Vector3, size: T.Vector3) {
        return this.world.createCollider(
            R.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
                .setTranslation(p.x, p.y, p.z)
                .setFriction(0.7),
        );
    }
    ray(
        origin: T.Vector3,
        direction: T.Vector3,
        length: number,
        exclude?: R.Collider,
        predicate?: (c: R.Collider) => boolean,
    ) {
        return this.world.castRay(
            new R.Ray(origin, direction),
            length,
            true,
            undefined,
            undefined,
            exclude,
            undefined,
            predicate,
        );
    }
    clearLine(
        a: T.Vector3,
        b: T.Vector3,
        exclude?: R.Collider,
        predicate?: (c: R.Collider) => boolean,
    ) {
        const dir = b.clone().sub(a),
            length = dir.length();
        if (length < 0.01) return true;
        const hit = this.ray(
            a,
            dir.divideScalar(length),
            length,
            exclude,
            predicate,
        );
        return !hit || hit.timeOfImpact >= length - 0.2;
    }
    dispose() {
        this.world.free();
    }
}
