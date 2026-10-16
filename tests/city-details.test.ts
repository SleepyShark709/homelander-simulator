import { expect, it } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { Assets } from '../src/Assets';

it('scanned props retain proportions and shared geometry while damage materials stay independent', () => {
    const assets = new Assets();
    const source = new Group();
    source.add(new Mesh(new BoxGeometry(2,4,1),new MeshStandardMaterial({color:0x927047})));
    assets.models.set('cafeSet',{scene:source} as never);
    const first = assets.prop('cafeSet',1.8), second = assets.prop('cafeSet',1.8);
    const bounds = new Box3().setFromObject(first), size = bounds.getSize(new Vector3());
    expect(bounds.min.y).toBeCloseTo(0);
    expect(size.toArray()).toEqual([.9,1.8,.45]);
    const a = (first.children[0] as Group).children[0] as Mesh<BoxGeometry,MeshStandardMaterial>;
    const b = (second.children[0] as Group).children[0] as Mesh<BoxGeometry,MeshStandardMaterial>;
    expect(a.geometry).toBe(b.geometry);
    expect(a.userData.keepSharedGeometry).toBe(true);
    expect(a.material).not.toBe(b.material);
    const before = b.material.color.getHex();
    a.material.color.multiplyScalar(.4);
    expect(b.material.color.getHex()).toBe(before);
    expect((source.children[0] as Mesh<BoxGeometry,MeshStandardMaterial>).material.color.getHex()).toBe(before);
});

it('selecting a shutter variant keeps the cached source intact', () => {
    const assets = new Assets(), source = new Group();
    for(let i=0;i<2;i++) { const mesh = new Mesh(new BoxGeometry(2,3,.1),new MeshStandardMaterial()); mesh.position.x=i*3; source.add(mesh); }
    assets.models.set('shutter',{scene:source} as never);
    const variant = assets.prop('shutter',2.7,1);
    expect(variant.children[0].children).toHaveLength(1);
    expect(source.children).toHaveLength(2);
    expect(new Box3().setFromObject(variant).getSize(new Vector3()).y).toBeCloseTo(2.7);
});
