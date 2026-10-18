import R from '@dimforge/rapier3d-compat';
import type * as T from 'three';
export { R };
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
    constrainSphere(from: T.Vector3, to: T.Vector3, radius: number, exclude: R.Collider) {
        const delta = to.clone().sub(from), filter = (c: R.Collider) => !this.ignored.has(c.handle);
        const hit = delta.lengthSq() > 1e-8 ? this.world.castShape(
            from, {x:0,y:0,z:0,w:1}, delta, new R.Ball(radius), 0, 1, true,
            undefined, undefined, exclude, undefined, filter,
        ) : null;
        if (hit) {
            to.copy(from).addScaledVector(delta, hit.time_of_impact);
            delta.multiplyScalar(1-hit.time_of_impact);
            const inward = Math.min(0,delta.dot(hit.normal1));
            to.add(delta).addScaledVector(hit.normal1,-inward+.001);
        }
        const projected = this.world.projectPoint(to, false, undefined, undefined, exclude, undefined, filter);
        if (projected) {
            delta.copy(to).sub(projected.point);
            const distance = delta.length();
            if (projected.isInside || distance < radius) {
                if (projected.isInside) delta.negate();
                if (distance < 1e-8) delta.set(0,1,0); else delta.divideScalar(distance);
                to.copy(projected.point).addScaledVector(delta,radius);
            }
        }
    }
    dispose() {
        this.world.free();
    }
}
