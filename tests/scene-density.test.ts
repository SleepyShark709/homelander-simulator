import { expect, it } from 'vitest';
import fs from 'node:fs';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { Physics, R } from '../src/core/Physics';
import { StreetWorld } from '../src/world/World';

const root = new URL('../', import.meta.url);
const read = (path: string) => fs.readFileSync(new URL(path, root));
const layout = JSON.parse(read('.asset-source/scene-density/layout.json').toString());

function model(name: string) {
    const data = read(`public/assets/scene-density/${name}.glb`);
    expect(data.toString('ascii', 0, 4)).toBe('glTF');
    expect(data.readUInt32LE(8)).toBe(data.length);
    const json = JSON.parse(data.toString('utf8', 20, 20 + data.readUInt32LE(12)));
    return { data, json };
}

it('the 66 metre sample and full-map massing leave the street, alley and campus entry clear', () => {
    expect(layout.sampleLength).toBe(66);
    expect(layout.plots.filter((b: any) => b.sample)).toHaveLength(8);
    for (const b of layout.plots) {
        expect(Math.abs(b.x) + b.width / 2).toBeLessThanOrEqual(100);
        expect(Math.abs(b.z) + b.depth / 2).toBeLessThanOrEqual(100);
        const box = new Box3(new Vector3(b.x-b.width/2,0,b.z-b.depth/2),new Vector3(b.x+b.width/2,70,b.z+b.depth/2));
        for (const [x,z] of [...layout.routes.walk,...layout.routes.campus])
            expect(box.containsPoint(new Vector3(x,1,z)), `${b.id} blocks ${x},${z}`).toBe(false);
    }
});

it.each(['street-sample', 'whitebox', 'aircon', 'seating'])('%s ships embedded textures and bounded geometry', name => {
    const { data,json } = model(name);
    expect(data.length).toBeLessThan(32_000_000);
    expect(json.buffers.every((b: any) => !b.uri)).toBe(true);
    expect((json.images ?? []).every((i: any) => i.bufferView !== undefined && !i.uri)).toBe(true);
    const triangles = json.meshes.flatMap((m: any) => m.primitives).reduce((n: number,p: any) => n+json.accessors[p.indices].count/3,0);
    expect(triangles).toBeLessThan(layout.budget.maxRuntimeTriangles);
});

it('brick facades retain white vertex modulation after joining authored modules and new backdrop solids', () => {
    const {data,json}=model('street-sample');
    const binaryOffset=28+data.readUInt32LE(12);
    for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
        if (!json.materials[primitive.material].name.startsWith('MI_RedBrick') || primitive.attributes.COLOR_0 === undefined) continue;
        const accessor=json.accessors[primitive.attributes.COLOR_0],view=json.bufferViews[accessor.bufferView];
        const bytes=accessor.componentType===5121 ? 1 : accessor.componentType===5123 ? 2 : 4;
        const components=Number(accessor.type.slice(-1)),stride=view.byteStride ?? bytes*components;
        const offset=binaryOffset+(view.byteOffset ?? 0)+(accessor.byteOffset ?? 0);
        let minimum=1;
        for (let i=0;i<accessor.count;i++) for(let channel=0;channel<3;channel++) {
            const p=offset+i*stride+channel*bytes;
            const value=bytes===1 ? data.readUInt8(p)/255 : bytes===2 ? data.readUInt16LE(p)/65535 : data.readFloatLE(p);
            minimum=Math.min(minimum,value);
        }
        expect(minimum).toBeCloseTo(1,5);
    }
});

it('shop glazing is an independent panel with no static body closing the ground-floor passage', () => {
    const { json } = model('street-sample');
    const colliders: Box3[] = [], panels: Vector3[] = [];
    const visit = (index: number, parent: Matrix4) => {
        const node = json.nodes[index];
        const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
            new Vector3().fromArray(node.translation ?? [0,0,0]),new Quaternion().fromArray(node.rotation ?? [0,0,0,1]),new Vector3().fromArray(node.scale ?? [1,1,1]));
        const world = parent.clone().multiply(local), center = new Vector3().setFromMatrixPosition(world);
        if (node.extras?.collider) {
            const half = new Vector3().fromArray(node.extras.collider).multiplyScalar(.5);
            colliders.push(new Box3(center.clone().sub(half),center.clone().add(half)));
        }
        if (node.extras?.densityPanel) panels.push(center);
        for (const child of node.children ?? []) visit(child,world);
    };
    for (const index of json.scenes[json.scene].nodes) visit(index,new Matrix4());
    expect(panels.length).toBeGreaterThanOrEqual(8);
    for (const panel of panels) {
        const inside = panel.clone(); inside.y = 1.5; inside.z += panel.z < 0 ? -2 : 2;
        expect(colliders.some(box => box.containsPoint(inside)), `solid box behind glazing at ${panel.toArray()}`).toBe(false);
    }
});

it('navigation rejects a wall-crossing edge and restores it when the side-lane panel is removed', async () => {
    await R.init();
    const physics = new Physics();
    try {
        const from = new Vector3(-30.5,.18,-30), to = new Vector3(-30.5,.18,-42);
        const panel = physics.staticBox(new Vector3(-30.5,1.61,-36),new Vector3(4.6,2.9,.18));
        physics.world.step();
        const fixture = { nav:[from,to], physics, byCollider:new Map() } as unknown as StreetWorld;
        expect(StreetWorld.prototype.neighbors.call(fixture,from)).toHaveLength(0);
        physics.world.removeCollider(panel,true);
        physics.world.step();
        expect(StreetWorld.prototype.neighbors.call(fixture,from)).toEqual([to]);
    } finally { physics.dispose(); }
});
