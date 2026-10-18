import type * as T from 'three';
import type { R } from '../core/Physics';
import type { Health } from '../gameplay/rules';
import type { PersonVisual } from '../characters/PersonVisual';
import type { Ragdoll } from '../characters/Ragdoll';

export type Kind = 'civilian' | 'police' | 'soldier' | 'panel' | 'prop' | 'car';
export const isPerson = (kind: Kind) =>
    ['civilian', 'police', 'soldier'].includes(kind);

export interface Entity {
    id: number;
    kind: Kind;
    mesh: T.Object3D;
    collider: R.Collider;
    body?: R.RigidBody;
    health: Health;
    person?: PersonVisual;
    ragdoll?: Ragdoll;
    born: number;
    deathTime?: number;
    goal: T.Vector3;
    scaredUntil: number;
    shotAt: number;
    retiring: boolean;
    nextThink: number;
    carOwnedUntil: number;
    collisionHits: Set<number>;
}
