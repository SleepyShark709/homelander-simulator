import * as T from 'three';

export const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);

export const vec = (p: { x: number; y: number; z: number }) =>
    new T.Vector3(p.x, p.y, p.z);

/** Fade only outward velocity; inward and tangential movement remain available. */
export function limitAxis(
    position: number,
    speed: number,
    edge: number,
    buffer: number,
) {
    if (position * speed <= 0) return speed;
    return (
        speed * Math.max(0, Math.min(1, (edge - Math.abs(position)) / buffer))
    );
}
