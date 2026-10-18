import { expect, it } from 'vitest';
import * as T from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { Assets } from '../src/core/Assets';

it('scene teardown releases local resources while preserving cached model resources', () => {
    const assets = new Assets();
    const geometry = new T.BoxGeometry(), material = new T.MeshStandardMaterial();
    const source = new T.Group();
    source.add(new T.Mesh(geometry, material));
    assets.models.set('model', { scene: source } as GLTF);
    const instance = assets.clone('model');
    const localGeometry = new T.BoxGeometry(), localMaterial = new T.MeshStandardMaterial();
    instance.add(new T.Mesh(localGeometry, localMaterial));
    const disposed: string[] = [];
    geometry.addEventListener('dispose', () => disposed.push('shared geometry'));
    material.addEventListener('dispose', () => disposed.push('shared material'));
    localGeometry.addEventListener('dispose', () => disposed.push('local geometry'));
    localMaterial.addEventListener('dispose', () => disposed.push('local material'));

    assets.disposeScene(instance);

    expect(disposed.sort()).toEqual(['local geometry', 'local material']);
    expect(assets.models.get('model')?.scene).toBe(source);
    assets.dispose();
});

it('final asset teardown releases aliased model resources once and empties both caches', () => {
    const assets = new Assets(), source = new T.Group();
    const texture = new T.Texture(), standalone = new T.Texture();
    const material = new T.MeshStandardMaterial({ map: texture });
    const geometry = new T.BoxGeometry();
    source.add(new T.Mesh(geometry, material), new T.Mesh(geometry, material));
    const model = { scene: source } as GLTF;
    for (const key of ['civilian', 'police', 'soldier']) assets.models.set(key, model);
    assets.textures.set('ground', standalone);
    const disposed: string[] = [];
    for (const [name, resource] of [['geometry', geometry], ['material', material], ['texture', texture], ['standalone', standalone]] as const)
        resource.addEventListener('dispose', () => disposed.push(name));

    assets.dispose();

    expect(disposed.sort()).toEqual(['geometry', 'material', 'standalone', 'texture']);
    expect(assets.models.size).toBe(0);
    expect(assets.textures.size).toBe(0);
});
