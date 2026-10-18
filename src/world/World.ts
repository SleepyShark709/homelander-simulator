import * as T from 'three';
import type { Assets } from '../core/Assets';
import { PersonVisual } from '../characters/PersonVisual';
import { type Physics, R } from '../core/Physics';
import { Health } from '../gameplay/rules';
import { CityArt } from './Environment';
import { metreBox } from './CitySurfaces';
import { buildStreetBlock } from './StreetBlock';
import { type Entity, type Kind, isPerson } from './entities';
import { v, vec } from '../core/math';

const mat = (color: number) =>
    new T.MeshStandardMaterial({ color, roughness: 0.86 });
export class StreetWorld {
    group = new T.Group();
    art: CityArt;
    entities = new Map<number, Entity>();
    byCollider = new Map<number, Entity>();
    nextId = 1;
    nav: T.Vector3[] = [];
    spawnPoints: T.Vector3[] = [];
    private staticMaterials = new Map<number,T.MeshStandardMaterial>();
    constructor(
        public physics: Physics,
        public assets: Assets,
    ) {
        this.art = new CityArt(assets);
        buildStreetBlock(this);
    }
    box(size: T.Vector3, p: T.Vector3, color: number, solid = false) {
        if (!this.staticMaterials.has(color)) this.staticMaterials.set(color,mat(color));
        const m = new T.Mesh(
            metreBox(size.x, size.y, size.z),
            this.staticMaterials.get(color)!,
        );
        m.position.copy(p);
        m.receiveShadow = true;
        m.castShadow = true;
        this.group.add(m);
        if (solid) this.physics.staticBox(p, size);
        return m;
    }
    add(
        kind: Kind,
        mesh: T.Object3D,
        collider: R.Collider,
        hp: number,
        body?: R.RigidBody,
        person?: PersonVisual,
    ): Entity {
        const entity: Entity = {
            id: this.nextId++,
            kind,
            mesh,
            collider,
            body,
            health: new Health(hp),
            person,
            born: 0,
            goal: mesh.position.clone(),
            scaredUntil: 0,
            shotAt: 0,
            retiring: false,
            nextThink: 0,
            carOwnedUntil: 0,
            collisionHits: new Set(),
        };
        this.entities.set(entity.id, entity);
        this.byCollider.set(collider.handle, entity);
        return entity;
    }
    spawn(kind: 'civilian' | 'police' | 'soldier', p: T.Vector3, time: number) {
        const person = new PersonVisual(this.assets, kind, this.nextId);
        person.group.position.copy(p);
        this.group.add(person.group);
        const body = this.physics.world.createRigidBody(
            R.RigidBodyDesc.kinematicPositionBased().setTranslation(
                p.x,
                p.y + 1,
                p.z,
            ),
        );
        const collider = this.physics.world.createCollider(
            R.ColliderDesc.capsule(0.65, 0.32),
            body,
        );
        const e = this.add(
            kind,
            person.group,
            collider,
            kind === 'civilian' ? 50 : kind === 'police' ? 80 : 120,
            body,
            person,
        );
        e.born = time;
        e.goal = this.nearestNode(p);
        return e;
    }
    nearestNode(p: T.Vector3) {
        return this.nav
            .reduce((a, b) =>
                a.distanceToSquared(p) < b.distanceToSquared(p) ? a : b,
            )
            .clone();
    }
    neighbors(p: T.Vector3) {
        return this.nav.filter(
            (n) =>
                n.distanceToSquared(p) > 0.01 &&
                n.distanceToSquared(p) < 16 * 16,
        );
    }
    sync() {
        for (const e of this.entities.values())
            if (e.ragdoll) {
                e.ragdoll.capture();
                e.ragdoll.pose(1);
            } else if (e.body) {
                e.mesh.position.copy(vec(e.body.translation()));
                if (isPerson(e.kind) && !e.health.dead) e.mesh.position.y -= 1;
                else {
                    e.mesh.quaternion.copy(e.body.rotation());
                    if (isPerson(e.kind))
                        e.mesh.position.add(
                            v(0, -1, 0).applyQuaternion(e.mesh.quaternion),
                        );
                }
            }
    }
    interpolate(alpha: number) {
        for (const e of this.entities.values()) e.ragdoll?.pose(alpha);
    }
    freezeInterpolation() {
        for (const e of this.entities.values()) e.ragdoll?.freezeInterpolation();
    }
    remove(e: Entity) {
        if (e.ragdoll) {
            for (const part of e.ragdoll.parts.values()) this.byCollider.delete(part.collider.handle);
            e.ragdoll.dispose();
        } else if (e.body) {
            this.byCollider.delete(e.collider.handle);
            this.physics.world.removeRigidBody(e.body);
        }
        else if (e.collider.isValid())
            {
                this.byCollider.delete(e.collider.handle);
                this.physics.world.removeCollider(e.collider, true);
            }
        this.entities.delete(e.id);
        e.mesh.removeFromParent();
        if (e.person) e.person.dispose();
        else {
            // Detached props cannot be reached by the later scene cleanup.
            // Protect resources retained by other objects or the asset cache.
            const retainedGeometry = new Set<T.BufferGeometry>();
            const retainedMaterial = new Set<T.Material>();
            const retain = (object: T.Object3D) => object.traverse(o => {
                if (!(o instanceof T.Mesh)) return;
                retainedGeometry.add(o.geometry);
                for (const m of Array.isArray(o.material) ? o.material : [o.material])
                    retainedMaterial.add(m);
            });
            retain(this.group);
            for (const asset of this.assets.models.values()) retain(asset.scene);
            const geometry = new Set<T.BufferGeometry>();
            const material = new Set<T.Material>();
            e.mesh.traverse(o => {
                if (!(o instanceof T.Mesh)) return;
                if (!retainedGeometry.has(o.geometry)) geometry.add(o.geometry);
                for (const m of Array.isArray(o.material) ? o.material : [o.material])
                    if (!retainedMaterial.has(m)) material.add(m);
            });
            geometry.forEach(g => g.dispose());
            material.forEach(m => m.dispose());
        }
    }
    alive(kind?: Kind) {
        return [...this.entities.values()].filter(
            (e) => !e.health.dead && (!kind || e.kind === kind),
        );
    }
}
