import { afterEach, beforeAll, expect, it } from 'vitest';
import * as T from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { Assets } from '../src/core/Assets';
import { PersonVisual } from '../src/characters/PersonVisual';
import { loadModel } from './helpers/load-model';

let model: GLTF;
const visuals: PersonVisual[] = [];
beforeAll(async () => { model = await loadModel('public/assets/human/homelander.glb'); });
afterEach(() => { visuals.splice(0).forEach(visual => visual.dispose()); });

it.each(['laser_hip', 'laser_back'])('finishes an attack before resuming %s and releasing the laser', pose => {
    const assets = new Assets(); assets.models.set('person', model);
    const visual = new PersonVisual(assets, 'hero'); visuals.push(visual);
    const duration = visual.actionDuration('combo_a'), dt = 1 / 20;
    for (let elapsed = 0; elapsed < duration; elapsed += dt)
        visual.update(dt, elapsed, 'ground', 0, true, 0, 'combo_a', undefined, duration - elapsed, elapsed);
    for (const abilityPose of [pose, '']) {
        for (let i = 0; i < 20; i++) visual.update(dt, 0, 'ground', 0, !!abilityPose, 0, abilityPose);
        const originals = new Set(visual.actions.values());
        const actions = (visual.mixer as unknown as { _actions: T.AnimationAction[] })._actions;
        expect(actions.filter(action => !originals.has(action) && action.isScheduled())).toEqual([]);
        expect(visual.current).toBe(abilityPose || 'idle');
        expect(visual.eyes.every(eye => eye.visible)).toBe(!!abilityPose);
    }
});
