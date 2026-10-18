import { expect, it } from 'vitest';
import fs from 'node:fs';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

function model(name: string) {
    const data = fs.readFileSync(new URL(`../public/assets/jiangwan/${name}.glb`, import.meta.url));
    expect(data.toString('ascii', 0, 4)).toBe('glTF');
    expect(data.readUInt32LE(4)).toBe(2);
    expect(data.readUInt32LE(8)).toBe(data.length);
    const json = JSON.parse(data.toString('utf8', 20, 20 + data.readUInt32LE(12)));
    const triangles = json.meshes.flatMap((m: any) => m.primitives)
        .reduce((n: number, p: any) => n + json.accessors[p.indices].count / 3, 0);
    expect(json.buffers.every((b: any) => !b.uri)).toBe(true);
    expect(json.images.every((i: any) => i.bufferView !== undefined && !i.uri)).toBe(true);
    return { json, triangles, bytes: data.length };
}

it.each([['bus', 10.5], ['scooter', 1.95], ['sedan', 4.6]])(
    '%s is a self-contained, budgeted metre-scale vehicle with its wheels on the ground', (name, length) => {
        const { json, triangles, bytes } = model(String(name));
        const bounds = new Box3();
        const visit = (index: number, parent: Matrix4) => {
            const node = json.nodes[index];
            const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
                new Vector3().fromArray(node.translation ?? [0, 0, 0]),
                new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
                new Vector3().fromArray(node.scale ?? [1, 1, 1]),
            );
            const world = parent.clone().multiply(local);
            if (node.mesh !== undefined) for (const primitive of json.meshes[node.mesh].primitives) {
                const a = json.accessors[primitive.attributes.POSITION];
                bounds.union(new Box3(new Vector3(...a.min), new Vector3(...a.max)).applyMatrix4(world));
            }
            for (const child of node.children ?? []) visit(child, world);
        };
        for (const root of json.scenes[json.scene].nodes) visit(root, new Matrix4());
        expect(bounds.min.y).toBeCloseTo(0, 2);
        expect(bounds.getCenter(new Vector3()).x).toBeCloseTo(0, 2);
        expect(bounds.getCenter(new Vector3()).z).toBeCloseTo(0, 2);
        expect(bounds.getSize(new Vector3()).z).toBeCloseTo(Number(length), 2);
        expect(triangles).toBeLessThan(26000);
        expect(bytes).toBeLessThan(4_000_000);
    },
);

it('the district includes collision metadata and stays within the browser asset budget', () => {
    const { json, triangles, bytes } = model('district');
    const colliders = json.nodes.filter((n: any) => n.extras?.collider);
    expect(colliders.length).toBeGreaterThan(100);
    for (const node of colliders) {
        expect(node.extras.collider).toHaveLength(3);
        expect(node.extras.collider.every((n: number) => Number.isFinite(n) && n > 0)).toBe(true);
    }
    expect(json.nodes.filter((n: any) => /^Block \d+$/.test(n.name))).toHaveLength(8);
    expect(triangles).toBeLessThan(450000);
    expect(bytes).toBeLessThan(26_000_000);
});
