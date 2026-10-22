import { expect, it } from 'vitest';
import * as T from 'three';
import { Physics, R } from '../src/core/Physics';
import { buildGraffitiTrial } from '../src/world/GraffitiTrial';
import type { StreetWorld } from '../src/world/World';
import { CONFIG } from '../src/core/config';
import { Npcs } from '../src/gameplay/Npcs';

it('imported collision decodes quantized vertices and nested transforms, retaining vehicle bodies across rebuilds', async () => {
    await R.init();
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(new Int16Array([
        0,0,0, 32767,0,0, 32767,0,32767, 0,0,32767,
    ]), 3, true));
    geometry.setIndex([0,2,1, 0,3,2]);
    const source = new T.Group(), nested = new T.Group();
    nested.rotation.y = Math.PI/2;
    const floor = new T.Mesh(geometry, new T.MeshStandardMaterial());
    floor.position.set(10,2,12); floor.scale.setScalar(4);
    nested.add(floor); source.add(nested);
    for (let repeat = 0; repeat < 2; repeat++) {
        const physics = new Physics(), vehicles: string[] = [];
        try {
            const fixture = {
                physics, group: new T.Group(), nav: [], spawnPoints: [],
                art: { asphalt: new T.MeshStandardMaterial() },
                box: () => new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial()),
                assets: { clone: (key: string) => key === 'sceneDensity' ? source.clone(true) :
                    new T.Mesh(new T.BoxGeometry(2,1,4), new T.MeshStandardMaterial()) },
                add: (kind: string) => vehicles.push(kind),
            } as unknown as StreetWorld;
            buildGraffitiTrial(fixture);
            physics.world.step();
            const hit = physics.world.castRay(new R.Ray(
                {x:14+CONFIG.graffitiTrial.offsetX,y:10,z:-12}, {x:0,y:-1,z:0}),20,true);
            expect(hit?.timeOfImpact).toBeCloseTo(8,4);
            expect(vehicles).toEqual(['car','car','car']);
            expect(physics.world.bodies.len()).toBe(3);
            expect(fixture.nav.length).toBeGreaterThan(0);
            const people: T.Vector3[] = [];
            fixture.spawn = (_kind, point) => { people.push(point.clone()); return undefined as never; };
            new Npcs(fixture, physics, {} as never, {} as never, {} as never, new T.PerspectiveCamera());
            expect(people).toHaveLength(CONFIG.civilians);
            expect(new Set(people.map(point => point.toArray().join(','))).size).toBe(CONFIG.civilians);
            for (const point of fixture.spawnPoints)
                expect(point.distanceTo(new T.Vector3(0,1,25))).toBeGreaterThan(28);
            expect(source.position.x).toBe(0);
            expect(geometry.getAttribute('position').normalized).toBe(true);
        } finally { physics.dispose(); }
    }
});
