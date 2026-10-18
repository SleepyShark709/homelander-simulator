import { afterEach, beforeAll, expect, it } from 'vitest';
import * as T from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { loadModel } from './helpers/load-model';
import { Assets } from '../src/core/Assets';
import { Physics, R } from '../src/core/Physics';
import type { Input } from '../src/core/Input';
import { Player } from '../src/characters/Player';
import { CONFIG } from '../src/core/config';

let asset: GLTF;
const fixtures: Array<{ player: Player; physics: Physics }> = [];
beforeAll(async () => {
    await R.init();
    asset = await loadModel('public/assets/human/homelander.glb');
});
afterEach(() => {
    for (const { player, physics } of fixtures.splice(0)) { player.visual.dispose(); physics.dispose(); }
});

const dt = 1 / 120;
const grounded = (player: Player) => player.mode === 'ground';
function setup(surface = 0) {
    const physics = new Physics(); physics.world.timestep = dt;
    if (surface === 0) physics.world.createCollider(new R.ColliderDesc(new R.HalfSpace(new T.Vector3(0, 1, 0))));
    else physics.staticBox(new T.Vector3(0, surface - .5, 0), new T.Vector3(100, 1, 100));
    const assets = new Assets(); assets.models.set('person', asset);
    const input = { keys: new Set<string>(), pressed: new Set<string>(), yaw: 0, pitch: 0, laser: false,
        shift: false, punch: false, take(key: string) { return this.pressed.delete(key); } };
    const player = new Player(physics, assets, input as unknown as Input, new T.Group());
    const place = (y: number) => {
        player.position.set(0, y, 0); player.previous.copy(player.position);
        player.body.setTranslation(player.position, true); player.body.setNextKinematicTranslation(player.position);
        physics.world.step(); player.sync();
    };
    place(surface + 1.03);
    const frame = () => { player.step(dt); physics.world.step(); player.sync(); player.animate(dt, 0); };
    for (let i = 0; i < 60; i++) frame();
    fixtures.push({ player, physics });
    return { player, physics, input, place, frame };
}

it.each([0, 15])('jumps from %s metre support with start, air and ordinary landing actions', surface => {
    const { player: p, input, frame } = setup(surface);
    const base = p.position.y, clips = new Set<string>();
    let peak = base, impacts = 0;
    p.onSlam = () => impacts++;
    input.pressed.add('Space');
    for (let i = 0; i < 300; i++) {
        frame(); clips.add(p.visual.current); peak = Math.max(peak, p.position.y);
    }
    expect(peak - base).toBeGreaterThan(1.4);
    expect(peak - base).toBeLessThan(1.8);
    expect(clips).toEqual(new Set(['jump_start', 'fall', 'jump_land', 'idle']));
    expect(p.mode).toBe('ground'); expect(p.recovery).toBe(0); expect(impacts).toBe(0);
    expect(p.position.y).toBeCloseTo(base, 2);
});

it('does not repeat a held Space or queue an airborne press for landing', () => {
    const { player: p, input, frame } = setup();
    input.keys.add('Space'); input.pressed.add('Space');
    let launches = 0, previousY = 0;
    for (let i = 0; i < 420; i++) {
        if (i === 60) input.pressed.add('Space');
        frame();
        if (p.velocity.y > 0 && previousY <= 0) launches++;
        previousY = p.velocity.y;
    }
    expect(launches).toBe(1); expect(p.visual.current).toBe('idle'); expect(input.pressed.size).toBe(0);
    input.keys.delete('Space'); input.pressed.add('Space'); frame();
    expect(p.mode).toBe('jump'); expect(p.visual.current).toBe('jump_start');
});

it('stops upward jumping at a low ceiling and returns to support', () => {
    const { player: p, physics, input, frame } = setup();
    physics.staticBox(new T.Vector3(0, 3, 0), new T.Vector3(12, .4, 12));
    physics.world.step(); input.pressed.add('Space');
    let peak = p.position.y;
    for (let i = 0; i < 300; i++) { frame(); peak = Math.max(peak, p.position.y); }
    expect(peak).toBeGreaterThan(1.2); expect(peak).toBeLessThan(1.7);
    expect(p.collider.radius()).toBeCloseTo(CONFIG.playerGroundRadius, 5);
    expect(p.mode).toBe('ground'); expect(p.position.y).toBeCloseTo(1.03, 2);
});

it('keeps directional movement and wall collision during a running jump', () => {
    const { player: p, physics, input, frame } = setup();
    physics.staticBox(new T.Vector3(0, 5, -4), new T.Vector3(12, 10, .4));
    physics.world.step(); input.keys.add('KeyW'); input.pressed.add('Space');
    let peak = p.position.y;
    for (let i = 0; i < 300; i++) { frame(); peak = Math.max(peak, p.position.y); }
    expect(peak).toBeGreaterThan(2.4); expect(p.position.z).toBeLessThan(-2);
    expect(p.position.z).toBeGreaterThan(-2.8); expect(p.mode).toBe('ground');
});

it('preserves horizontal momentum when movement is released after jump preparation', () => {
    const { player: p, input, frame } = setup();
    input.keys.add('KeyW');
    for (let i = 0; i < 90; i++) frame();
    input.pressed.add('Space');
    for (let i = 0; i < 40; i++) frame();
    const speed = Math.hypot(p.velocity.x, p.velocity.z), z = p.position.z;
    input.keys.clear();
    for (let i = 0; i < 30; i++) frame();
    expect(p.mode).toBe('jump');
    expect(Math.hypot(p.velocity.x, p.velocity.z)).toBeCloseTo(speed, 5);
    expect(z - p.position.z).toBeGreaterThan(1);
});

it('buffers the requested combo through an attack ending and clears it on pause', () => {
    const { player: p, physics, input } = setup();
    const frame = () => { p.step(dt); physics.world.step(); };
    let hits = 0; p.onPunch = () => hits++;
    input.punch = true; frame();
    while (p.punchTime > CONFIG.punchInputBuffer / 2) frame();
    input.pressed.add('KeyR'); frame();
    while (p.attackClip === 'punch') frame();
    expect(p.attackClip).toBe('combo_a');
    for (let i = 0; i < 400; i++) frame();
    expect(hits).toBe(5);
    input.punch = true; frame();
    while (p.punchTime > CONFIG.punchInputBuffer / 2) frame();
    input.pressed.add('KeyE'); frame(); p.clearBufferedAttack();
    for (let i = 0; i < 200; i++) frame();
    expect(hits).toBe(6); expect(p.attackClip).toBe('punch');
});

it.each(['KeyF', 'KeyQ'])('allows %s to take over an airborne jump', key => {
    const { player: p, input, frame } = setup();
    input.pressed.add('Space');
    for (let i = 0; i < 50; i++) frame();
    expect(p.mode).toBe('jump');
    let impacts = 0; p.onSlam = () => impacts++;
    input.pressed.add(key); frame();
    expect(p.mode).toBe(key === 'KeyF' ? 'fly' : 'slam');
    if (key === 'KeyF') {
        const y = p.position.y;
        input.keys.add('Space'); input.pressed.add('Space');
        for (let i = 0; i < 60; i++) frame();
        expect(p.mode).toBe('fly'); expect(p.position.y).toBeGreaterThan(y + 2);
    } else {
        for (let i = 0; i < 300; i++) frame();
        expect(impacts).toBe(1); expect(p.mode).toBe('ground');
    }
});

it('does not interrupt attacks or landing recovery and consumes rejected jump input', () => {
    const { player: p, input, frame } = setup();
    input.punch = true; frame(); input.pressed.add('Space'); frame();
    expect(p.mode).toBe('ground'); expect(p.punchTime).toBeGreaterThan(0);
    for (let i = 0; i < 300; i++) frame();
    expect(p.mode).toBe('ground');
    input.pressed.add('Space');
    for (let i = 0; i < 1000 && (p.mode !== 'ground' || p.recovery === 0); i++) {
        frame();
        if (p.mode === 'jump') { input.punch = true; input.pressed.add('KeyE'); }
    }
    expect(p.punchTime).toBe(0); expect(p.recovery).toBeGreaterThan(0);
    input.pressed.add('Space'); frame();
    expect(p.mode).toBe('ground');
    for (let i = 0; i < 180; i++) frame();
    expect(p.visual.current).toBe('idle'); expect(input.pressed.size).toBe(0);
});

it('gives flight priority over a simultaneous Space and F press', () => {
    const { player: p, input, frame } = setup();
    input.pressed.add('Space'); input.pressed.add('KeyF'); frame();
    expect(p.mode).toBe('takeoff'); expect(input.pressed.has('Space')).toBe(false);
});

it('uses normal takeoff when F interrupts jump preparation on the ground', () => {
    const { player: p, input, frame } = setup();
    input.pressed.add('Space'); frame();
    input.pressed.add('KeyQ'); frame(); expect(p.mode).toBe('jump');
    input.pressed.add('KeyF'); frame(); expect(p.mode).toBe('takeoff');
    for (let i = 0; i < 90; i++) frame();
    expect(p.mode).toBe('fly'); expect(p.position.y).toBeGreaterThan(1.2);
});

it.each([[.2, false], [1, false], [5.8, false], [6.2, true], [15, true]])(
    'a %s metre fall requests the appropriate landing and preserves support height', (height, heavy) => {
        const { player: p, place, frame } = setup();
        place(Number(height) + 1.03); p.mode = 'fall'; p.velocity.set(0, 0, 0);
        for (let i = 0; i < 1000 && !grounded(p); i++) frame();
        expect(p.mode).toBe('ground');
        expect(p.recovery > 0).toBe(heavy);
        // Rapier's predictive contact can stop a shallow drop a few cm early.
        expect(Math.abs(p.position.y - 1.03)).toBeLessThan(.06);
        if (!heavy) {
            p.input.keys.add('KeyW');
            for (let i = 0; i < 24; i++) frame();
            expect(p.position.z).toBeLessThan(-.3);
            expect(p.visual.current).not.toBe('land');
        }
    },
);

it('measures the drop relative to a roof rather than sea level', () => {
    const { player: p, place, frame } = setup(15);
    place(17.03); p.mode = 'fall';
    for (let i = 0; i < 500 && !grounded(p); i++) frame();
    expect(p.recovery).toBe(0);
    expect(Math.abs(p.position.y - 16.03)).toBeLessThan(.02);
});

it('reaches physical takeoff and hover within 0.75 seconds', () => {
    const { player: p, input, frame } = setup();
    input.pressed.add('KeyF');
    for (let i = 0; i < 90; i++) frame();
    expect(p.mode).toBe('fly'); expect(p.visual.current).toBe('hover');
    expect(p.position.y).toBeGreaterThan(1.2);
});

it('keeps the smaller safe hull under a low ceiling while taking off and landing', () => {
    const { player: p, physics, input, frame } = setup();
    physics.staticBox(new T.Vector3(0, 3, 0), new T.Vector3(12, .4, 12));
    physics.world.step(); input.pressed.add('KeyF');
    for (let i = 0; i < 150; i++) frame();
    expect(p.mode).toBe('fly'); expect(p.collider.radius()).toBeCloseTo(1.1, 5);
    expect(p.position.y).toBeLessThan(1.7);
    input.pressed.add('KeyF');
    for (let i = 0; i < 120; i++) frame();
    expect(p.mode).toBe('ground'); expect(p.recovery).toBe(0);
});

it('does not count earlier controlled flight as a short natural fall', () => {
    const { player: p, input, frame } = setup();
    input.pressed.add('KeyF');
    for (let i = 0; i < 90; i++) frame();
    input.keys.add('Space'); for (let i = 0; i < 180; i++) frame();
    expect(p.position.y).toBeGreaterThan(10);
    input.keys.delete('Space'); input.keys.add('ControlLeft');
    for (let i = 0; i < 600 && p.position.y > 2; i++) frame();
    input.keys.clear(); input.pressed.add('KeyF');
    let heavy = false;
    for (let i = 0; i < 180; i++) { frame(); heavy ||= p.recovery > 0 || p.visual.current === 'land'; }
    expect(p.mode).toBe('ground'); expect(heavy).toBe(false);
});

it('a high fall lands without replaying the airborne prefix or lifting the feet', () => {
    const { player: p, place, frame } = setup();
    place(16.03); p.mode = 'fall';
    for (let i = 0; i < 1000 && !grounded(p); i++) frame();
    let maxSole = -Infinity;
    let mesh!: T.SkinnedMesh;
    p.visual.model.traverse(o => { if (o instanceof T.SkinnedMesh) mesh = o; });
    const vertices: number[] = [];
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++)
        if (!p.visual.cape?.vertices.has(i) && mesh.geometry.attributes.position.getY(i) < .13) vertices.push(i);
    for (let i = 0; i < 100; i++) {
        frame(); p.visual.group.updateMatrixWorld(true);
        let lowest = Infinity;
        for (const vertex of vertices) {
            const point = new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, vertex);
            mesh.applyBoneTransform(vertex, point).applyMatrix4(mesh.matrixWorld);
            lowest = Math.min(lowest, point.y);
        }
        maxSole = Math.max(maxSole, lowest);
    }
    expect(maxSole).toBeLessThan(.1);
});

it.each([.25, 15])('Q from %s metres uses the landing clip and impacts once at physical contact', height => {
    const { player: p, input, place, frame } = setup();
    place(height + 1.03); p.mode = 'fly';
    let impacts = 0, impactY = 0, usedLanding = false, oldSlam = false;
    p.onSlam = point => { impacts++; impactY = point.y; };
    input.pressed.add('KeyQ');
    for (let i = 0; i < 300; i++) {
        frame(); usedLanding ||= p.visual.current === 'land'; oldSlam ||= p.visual.current === 'slam';
        if (!grounded(p)) expect(impacts).toBe(0);
    }
    expect(usedLanding).toBe(true); expect(oldSlam).toBe(false);
    expect(impacts).toBe(1); expect(impactY).toBeCloseTo(.03, 2);
    expect(p.visual.current).toBe('idle');
});
