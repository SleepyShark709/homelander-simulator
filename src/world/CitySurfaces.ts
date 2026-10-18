import * as T from 'three';
import type { Assets } from '../core/Assets';

/** UVs are measured in metres; a long pavement cannot stretch one texture tile. */
export function metreBox(
    width: number,
    height: number,
    depth: number,
    tile = 4,
) {
    const geometry = new T.BoxGeometry(width, height, depth);
    const p = geometry.attributes.position,
        n = geometry.attributes.normal,
        uv = geometry.attributes.uv;
    for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
            y = p.getY(i),
            z = p.getZ(i);
        if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, x / tile, z / tile);
        else if (Math.abs(n.getX(i)) > 0.5) uv.setXY(i, z / tile, y / tile);
        else uv.setXY(i, x / tile, y / tile);
    }
    return geometry;
}

export type GroundRect = readonly [
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
];

/** Partition the ground so intersections and paving never have overlapping faces. */
export function streetGround(
    roads: readonly GroundRect[],
    halfSize = 300,
    tile = 4,
) {
    const edges = (axis: 0 | 2) =>
        [
            ...new Set([
                -halfSize,
                halfSize,
                ...roads
                    .flatMap((r) => [r[axis], r[axis + 1]])
                    .map((n) => T.MathUtils.clamp(n, -halfSize, halfSize)),
            ]),
        ].sort((a, b) => a - b);
    const xs = edges(0),
        zs = edges(2);
    const buffers = {
        asphalt: {
            positions: [] as number[],
            normals: [] as number[],
            uvs: [] as number[],
            indices: [] as number[],
        },
        paving: {
            positions: [] as number[],
            normals: [] as number[],
            uvs: [] as number[],
            indices: [] as number[],
        },
    };
    for (let z = 0; z < zs.length - 1; z++)
        for (let x = 0; x < xs.length - 1; x++) {
            const x0 = xs[x],
                x1 = xs[x + 1],
                z0 = zs[z],
                z1 = zs[z + 1];
            const cx = (x0 + x1) / 2,
                cz = (z0 + z1) / 2;
            const road = roads.some(
                ([minX, maxX, minZ, maxZ]) =>
                    cx > minX && cx < maxX && cz > minZ && cz < maxZ,
            );
            const buffer = road ? buffers.asphalt : buffers.paving;
            const first = buffer.positions.length / 3;
            for (const [px, pz] of [
                [x0, z0],
                [x0, z1],
                [x1, z1],
                [x1, z0],
            ]) {
                buffer.positions.push(px, 0, pz);
                buffer.normals.push(0, 1, 0);
                buffer.uvs.push(px / tile, pz / tile);
            }
            buffer.indices.push(
                first,
                first + 1,
                first + 2,
                first,
                first + 2,
                first + 3,
            );
        }
    const geometry = (buffer: typeof buffers.asphalt) => {
        const result = new T.BufferGeometry();
        result.setAttribute(
            'position',
            new T.Float32BufferAttribute(buffer.positions, 3),
        );
        result.setAttribute(
            'normal',
            new T.Float32BufferAttribute(buffer.normals, 3),
        );
        result.setAttribute('uv', new T.Float32BufferAttribute(buffer.uvs, 2));
        result.setIndex(buffer.indices);
        return result;
    };
    return {
        asphalt: geometry(buffers.asphalt),
        paving: geometry(buffers.paving),
    };
}

export class CitySurfaces {
    materials = new Set<T.Material>();
    asphalt: T.MeshStandardMaterial;
    paving: T.MeshStandardMaterial;
    brick: T.MeshStandardMaterial;
    concrete: T.MeshStandardMaterial;
    stone: T.MeshStandardMaterial;
    roof: T.MeshStandardMaterial;
    cladding: T.MeshStandardMaterial;
    constructor(assets: Assets) {
        const make = (name: string, color: number, normalStrength: number) => {
            const material = new T.MeshStandardMaterial({
                color,
                map: assets.textures.get(`${name}/color`),
                normalMap: assets.textures.get(`${name}/normal`),
                normalScale: new T.Vector2(normalStrength, normalStrength),
                roughnessMap: assets.textures.get(`${name}/roughness`),
                roughness: 1,
                aoMap: assets.textures.get(`${name}/ao`),
                aoMapIntensity: .65,
                envMapIntensity: .4,
            });
            this.materials.add(material);
            return material;
        };
        this.asphalt = make('worn_asphalt', 0x626a73, 0.95);
        this.paving = make('concrete_pavement', 0xd0c9bb, 0.75);
        this.brick = make('brick_wall_003', 0xd0b9a7, 0.75);
        this.concrete = make('concrete_wall_006', 0xe8e4db, .55);
        this.stone = make('stone_tiles_02', 0xe3dfd3, .7);
        this.cladding = make('rectangular_facade_tiles', 0xe0ddd6, .6);
        this.roof = make('asphalt_05', 0x999c9e, .8);
    }
    dispose() {
        this.materials.forEach((m) => m.dispose());
    }
}
