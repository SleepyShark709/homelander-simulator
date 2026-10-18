import { expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { streetGround, type GroundRect } from '../src/world/CitySurfaces';

it('crossing roads and surrounding paving each expose exactly one upward-facing surface', () => {
    const roads: GroundRect[] = [
        [-20, 20, -3, 3],
        [-3, 3, -20, 20],
        [-20, 20, 8, 12],
    ];
    const geometry = streetGround(roads, 30);
    const meshes = [
        new Mesh(geometry.asphalt, new MeshBasicMaterial()),
        new Mesh(geometry.paving, new MeshBasicMaterial()),
    ];
    const ray = new Raycaster();
    try {
        // Offset the grid from triangle edges; cover both intersections, street
        // edges and paving. A stacked full ground/road mesh returns two hits.
        for (let x = -29.87; x < 30; x += 2)
            for (let z = -29.61; z < 30; z += 2) {
                ray.set(new Vector3(x, 10, z), new Vector3(0, -1, 0));
                const hits = ray.intersectObjects(meshes);
                expect(hits).toHaveLength(1);
                const onRoad = roads.some(
                    ([minX, maxX, minZ, maxZ]) =>
                        x > minX && x < maxX && z > minZ && z < maxZ,
                );
                expect(hits[0].object).toBe(meshes[onRoad ? 0 : 1]);
                expect(hits[0].face!.normal.y).toBe(1);
                expect(hits[0].uv!.x).toBeCloseTo(x / 4);
                expect(hits[0].uv!.y).toBeCloseTo(z / 4);
            }
    } finally {
        for (const mesh of meshes) {
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
    }
});
