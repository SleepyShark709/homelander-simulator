import * as T from 'three';
import { CONFIG } from '../core/config';
import { v } from '../core/math';
import type { StreetWorld } from './World';

/** The Blender file owns static geometry, collision and interaction placement. */
export function buildSceneDensity(world: StreetWorld) {
    const whitebox = new URLSearchParams(location.search).has('whitebox');
    const scene = world.assets.clone(whitebox ? 'sceneWhitebox' : 'sceneDensity');
    scene.name = whitebox ? 'Density full-map whitebox' : 'Density 66m street sample';
    scene.userData.offlineBatch = true;
    world.group.add(scene);
    scene.updateMatrixWorld(true);
    scene.traverse(marker => {
        const p = marker.getWorldPosition(v());
        if (marker.userData.collider) {
            const size = v(...marker.userData.collider as [number, number, number]);
            world.physics.staticBox(p, size);
        }
        if (marker.userData.densityPanel) {
            const size = v(...marker.userData.densityPanel as [number, number, number]);
            const panel = world.box(size, p, 0xc4d5cf);
            panel.name = 'sample-shop-glazing';
            panel.material = new T.MeshPhysicalMaterial({ color: 0xc4d5cf, roughness: .2, metalness: .06,
                transparent: true, opacity: .27, depthWrite: false, envMapIntensity: .7, clearcoat: .25 });
            panel.material.forceSinglePass = true;
            panel.castShadow = false;
            panel.userData.fragmentType = 'glass';
            const frame = new T.Mesh(new T.BoxGeometry(.065, size.y, .23),
                new T.MeshStandardMaterial({ color: 0x263d40, metalness: .55, roughness: .5 }));
            frame.castShadow = true;
            panel.add(frame);
            world.add('panel', panel, world.physics.staticBox(p, size), CONFIG.sceneDensity.glassHp);
        }
        if (marker.userData.densityProp || marker.userData.densityTree) {
            const key = marker.userData.densityProp as string | undefined;
            const object = marker.userData.densityTree ? world.art.street.tree(Math.round(p.x * 10 + p.z)) :
                key === 'bin' ? world.art.street.bin() : world.assets.prop(key!, marker.userData.height);
            object.position.copy(p);
            object.quaternion.copy(marker.getWorldQuaternion(new T.Quaternion()));
            object.name = `sample-${key ?? 'tree'}`;
            // Procedural bins/trees share art materials; isolate damage on every instance.
            if (!object.userData.assetKey) object.traverse(o => {
                if (o instanceof T.Mesh)
                    o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
            });
            world.group.add(object);
            const bounds = new T.Box3().setFromObject(object);
            if (key === 'bin') {
                object.position.y -= bounds.min.y - p.y;
                bounds.setFromObject(object);
            }
            const size = bounds.getSize(v()), center = bounds.getCenter(v());
            if (key === 'pottedPlant') { size.set(.6,.55,.6); center.copy(p).y += .275; }
            if (marker.userData.densityTree) { size.set(.52,3.6,.52); center.copy(p).y += 1.8; }
            world.add('prop', object, world.physics.staticBox(center, size), marker.userData.hp ?? CONFIG.sceneDensity.treeHp);
        }
        if (marker.userData.densitySign) {
            const sign = world.art.sign(marker.userData.densitySign, marker.userData.width);
            sign.position.copy(p); sign.quaternion.copy(marker.getWorldQuaternion(new T.Quaternion()));
            world.group.add(sign);
        }
    });
    if (whitebox) return;
    // A side-lane panel opens a real passage rather than revealing a solid box.
    const size = v(4.6, 2.9, .18), p = v(-30.5, 1.61, -36);
    const gate = world.box(size, p, 0x566b65);
    gate.name = 'sample-service-panel';
    const ribMaterial = new T.MeshStandardMaterial({ color:0x8a9b8d, roughness:.6, metalness:.5 });
    for (const x of [-2,-1,0,1,2]) {
        const rib = new T.Mesh(new T.BoxGeometry(.045,2.8,.08),ribMaterial);
        rib.position.set(x,0,.13);gate.add(rib);
    }
    const label = world.art.sign('SERVICE / KEEP CLEAR',2.7);
    label.position.set(0,.3,.19);gate.add(label);
    world.add('panel', gate, world.physics.staticBox(p, size), CONFIG.sceneDensity.servicePanelHp);
    for (const [x,z,sign] of [[-43,-26,1],[-45,26,-1]]) {
        const canopy = world.art.awning(sign > 0 ? 19.5 : 13.5, sign > 0 ? 2 : 0);
        canopy.position.set(x,3.1,sign > 0 ? -17.8 : 17.8);
        if (sign < 0) canopy.rotation.y = Math.PI;
        world.group.add(canopy);
        for (const offset of [-4,4]) {
            const cabinet = world.assets.prop('shopCabinet',1.95);
            cabinet.position.set(x+offset,.16,z-sign*5);
            world.group.add(cabinet);
            const bounds = new T.Box3().setFromObject(cabinet);
            world.add('prop',cabinet,world.physics.staticBox(bounds.getCenter(v()),bounds.getSize(v())),90);
        }
    }
}
