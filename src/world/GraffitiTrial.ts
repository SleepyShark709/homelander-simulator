import * as T from 'three';
import { R } from '../core/Physics';
import { v } from '../core/math';
import { CONFIG } from '../core/config';
import type { StreetWorld } from './World';
import { addVehicle } from './Vehicles';

/** Private, user-approved asset evaluation; the regular district stays intact. */
export function buildGraffitiTrial(world: StreetWorld) {
    const scene = world.assets.clone('sceneDensity');
    scene.userData.offlineBatch = true;
    scene.position.x += CONFIG.graffitiTrial.offsetX;
    world.group.add(scene);
    scene.updateMatrixWorld(true);
    const meshes: T.Mesh[] = [];
    let vertexCount = 0, indexCount = 0;
    scene.traverse(o => {
        if (!(o instanceof T.Mesh)) return;
        meshes.push(o);
        vertexCount += o.geometry.attributes.position.count;
        indexCount += o.geometry.index?.count ?? o.geometry.attributes.position.count;
    });
    const vertices = new Float32Array(vertexCount * 3);
    const indices = new Uint32Array(indexCount);
    const point = v();
    let vertexOffset = 0, indexOffset = 0;
    for (const mesh of meshes) {
        const position = mesh.geometry.attributes.position, index = mesh.geometry.index;
        for (let i = 0; i < position.count; i++) {
            // getX/Y/Z also decode normalized KHR_mesh_quantization attributes.
            point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
            point.toArray(vertices, (vertexOffset + i) * 3);
        }
        for (let i = 0, count = index?.count ?? position.count; i < count; i++)
            indices[indexOffset++] = vertexOffset + (index ? index.getX(i) : i);
        vertexOffset += position.count;
    }
    // Physical stairs, ledges and railings match the imported geometry.
    world.physics.world.createCollider(R.ColliderDesc.trimesh(vertices, indices,
        R.TriMeshFlags.FIX_INTERNAL_EDGES | R.TriMeshFlags.DELETE_DEGENERATE_TRIANGLES).setFriction(.7));
    // Support beyond the finite authored street, below its visible pavement.
    world.physics.world.createCollider(
        new R.ColliderDesc(new R.HalfSpace({ x: 0, y: 1, z: 0 })).setTranslation(0, CONFIG.graffitiTrial.groundY, 0).setFriction(.7),
    );
    const ground = world.box(v(600, .001, 600), v(0, CONFIG.graffitiTrial.groundY - .0005, 0), 0xffffff);
    ground.material = world.art.asphalt;
    ground.castShadow = false;
    addVehicle(world, 'bus', v(-6, 0, 31), Math.PI/2);
    addVehicle(world, 'sedan', v(8, 0, 31), Math.PI/2);
    addVehicle(world, 'scooter', v(12, 0, 26), Math.PI/2);
    // 27 nodes give the existing (i * 5 + 8) spawn sequence 20 unique places.
    // Leave the player spawn and the parked vehicles clear.
    for (const x of [-10, -6.5, -3, .5, 4, 7.5, 11]) for (const z of [23, 25.5, 28, 33.5]) {
        if (x === .5 && z === 25.5) continue;
        world.nav.push(v(x, .18, z));
    }
    // Reinforcements enter from outside view and the existing 28 m safe radius.
    world.spawnPoints = [v(-36, .18, 27), v(38, .18, 27), v(-36, .18, 34), v(38, .18, 34)];
    for (const sign of [-1, 1]) {
        world.physics.staticBox(v(sign * 101, 40, 0), v(2, 82, 204));
        world.physics.staticBox(v(0, 40, sign * 101), v(204, 82, 2));
    }
    world.physics.staticBox(v(0, 82, 0), v(204, 2, 204));
}
