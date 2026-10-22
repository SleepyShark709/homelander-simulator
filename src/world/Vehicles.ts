import * as T from 'three';
import { R } from '../core/Physics';
import { v } from '../core/math';
import type { StreetWorld } from './World';

/** Use the existing vehicle assets and dynamics in either street layout. */
export function addVehicle(world: StreetWorld, key: 'bus' | 'scooter' | 'sedan', p: T.Vector3, yaw: number) {
    const car = world.assets.clone(key);
    const bounds = new T.Box3().setFromObject(car);
    const size = bounds.getSize(v());
    const center = bounds.getCenter(v());
    car.position.set(-center.x, -center.y, -center.z);
    p.y = size.y / 2 + .08;
    const group = new T.Group();
    group.name = key;
    group.position.copy(p);
    const rotation = new T.Quaternion().setFromAxisAngle(v(0,1,0), yaw);
    group.quaternion.copy(rotation);
    group.add(car);
    world.group.add(group);
    const body = world.physics.world.createRigidBody(
        R.RigidBodyDesc.dynamic()
            .setTranslation(p.x, p.y, p.z)
            .setRotation(rotation)
            .setLinearDamping(0.45)
            .setAngularDamping(0.9)
            .setCcdEnabled(true),
    );
    const collider = world.physics.world.createCollider(
        R.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
            .setMass(key === 'bus' ? 1800 : key === 'scooter' ? 110 : 380)
            .setFriction(0.8)
            .setRestitution(0.15),
        body,
    );
    world.add('car', group, collider, 300, body);
}
