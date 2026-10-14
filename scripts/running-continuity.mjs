import { chromium } from '@playwright/test';
import fs from 'node:fs';

// Real Game.frame -> Player.step -> Rapier -> PersonVisual regression. Check
// every steady frame so repeated stalls cannot hide behind total distance.
const label = process.argv[2] ?? 'current';
fs.mkdirSync('.artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } }), errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://127.0.0.1:5173/');
await page.waitForFunction(() => window.game?.player, { timeout: 30000 });
const result = await page.evaluate(() => {
    const g = window.game;
    g.renderer.setAnimationLoop(null);
    g.presentation.render = () => {};
    const profiles = [
        { name: 'ordinary run with civilians, 60 Hz', npc: true, hz: 60, seconds: 12 },
        ...[60, 120, 144].map(hz => ({ name: `ordinary run without civilians, ${hz} Hz`, hz, seconds: 12 })),
        { name: 'ordinary run, uneven render intervals', hz: 120, seconds: 12, uneven: true },
        { name: 'ordinary run with gentle steering, 120 Hz', hz: 120, seconds: 12, turn: true },
        ...[60, 144].map(hz => ({ name: `sprint, ${hz} Hz`, hz, seconds: 4, shift: true })),
        { name: 'release and resume ordinary run, 120 Hz', hz: 120, seconds: 9, resume: true },
        { name: 'held W with repeated Shift press/release, 120 Hz', hz: 120, seconds: 6, toggle: true },
    ];
    const checks = [], traces = [];
    let clock = 1000;
    const setup = (npc = false, position = [0, 1.04, 25]) => {
        g.reset();
        if (!npc) for (const entity of [...g.world.entities.values()]) if (entity.person) g.world.remove(entity);
        const p = g.player;
        p.position.fromArray(position); p.previous.copy(p.position);
        p.body.setTranslation(p.position, true); p.body.setNextKinematicTranslation(p.position);
        g.physics.world.step(); p.sync();
        g.running = true; g.input.active = true; g.previous = clock; g.accumulator = 0;
        g.input.yaw = 0;
        return p;
    };
    for (const profile of profiles) {
        const p = setup(profile.npc, [0, 1.04, profile.shift ? 45 : 25]);
        g.input.keys.add('KeyW');
        if (profile.shift) g.input.keys.add('ShiftLeft');
        const samples = [], joints = ['head', 'hand_l', 'hand_r', 'foot_l', 'foot_r'].map(name => p.visual.model.getObjectByName(name));
        let previousPosition = p.visual.group.position.clone(), previousY = p.position.y, previousPose, maxPoseStepAt120Hz = 0, t = 0;
        while (t < profile.seconds) {
            const dt = profile.uneven ? [1 / 144, 1 / 120, 1 / 75, 1 / 90, 1 / 60][samples.length % 5] : 1 / profile.hz;
            if (profile.turn) g.input.yaw = Math.sin(t) * .12;
            if (profile.toggle) {
                if (Math.floor((t + 1e-6)/1.5)%2 === 0) g.input.keys.add('ShiftLeft');
                else g.input.keys.delete('ShiftLeft');
            }
            if (profile.resume) {
                if (t >= 4 && t < 5) g.input.keys.delete('KeyW');
                else g.input.keys.add('KeyW');
            }
            t += dt; clock += dt * 1000; g.frame(clock);
            const collisions = [];
            for (let j = 0; j < p.controller.numComputedCollisions(); j++) {
                const hit = p.controller.computedCollision(j);
                if (hit?.collider) collisions.push({ handle: hit.collider.handle, kind: g.world.byCollider.get(hit.collider.handle)?.kind ?? 'static', normal: hit.normal1 });
            }
            p.visual.group.updateMatrixWorld(true);
            const pose = joints.map(j => p.visual.group.worldToLocal(j.getWorldPosition(j.position.clone())));
            if (previousPose) maxPoseStepAt120Hz = Math.max(maxPoseStepAt120Hz, ...pose.map((point, j) => point.distanceTo(previousPose[j]) / dt / 120));
            previousPose = pose;
            samples.push({ t, speed: p.velocity.length() * 3.6, horizontalSpeed: Math.hypot(p.velocity.x, p.velocity.z) * 3.6,
                displacementSpeed: p.visual.group.position.distanceTo(previousPosition) / dt * 3.6,
                groundYStep: Math.abs(p.position.y - previousY), position: p.position.toArray(), velocity: p.velocity.toArray(), mode: p.mode, recovery: p.recovery,
                grounded: p.controller.computedGrounded(), clip: p.visual.current, clipTime: p.visual.actions.get(p.visual.current)?.time, collisions });
            previousPosition.copy(p.visual.group.position);
            previousY = p.position.y;
        }
        const steady = samples.filter(s => s.t >= 1 && (!profile.resume || s.t < 4 || s.t >= 6) && (!profile.toggle || (s.t % 1.5 > .5 && s.t % 1.5 < 1.49)));
        const sprintAt = s => profile.shift || (profile.toggle && Math.floor(s.t/1.5)%2 === 0);
        const stops = steady.filter(s => s.horizontalSpeed < 1), badClips = steady.filter(s => s.clip !== (sprintAt(s) ? 'sprint' : 'jog'));
        const minTargetRatio = Math.min(...steady.map(s => s.horizontalSpeed/((sprintAt(s)?24:6)*3.6)));
        const minDisplacementRatio = Math.min(...steady.map(s => s.displacementSpeed/((sprintAt(s)?24:6)*3.6)));
        const minSpeed = Math.min(...steady.map(s => s.horizontalSpeed)), minDisplacementSpeed = Math.min(...steady.map(s => s.displacementSpeed));
        const maxGroundYStep = Math.max(...steady.map(s => s.groundYStep));
        checks.push({ name: profile.name, pass: steady.length > 0 && stops.length === 0 && minTargetRatio > .99 && minDisplacementRatio > .97 && badClips.length === 0 && maxPoseStepAt120Hz < .12 && maxGroundYStep < .001,
            minTargetRatio,minDisplacementRatio,
            minSpeed, maxSpeed: Math.max(...steady.map(s => s.horizontalSpeed)), minDisplacementSpeed, maxPoseStepAt120Hz, maxGroundYStep,
            stopFrames: stops.length, wrongSteadyClips: badClips.length, modeChanges: samples.filter((s, i) => i && s.mode !== samples[i - 1].mode).length,
            firstStops: stops.slice(0, 4), clipChanges: samples.filter((s, i) => i && s.clip !== samples[i - 1].clip).map(s => ({ t: s.t, clip: s.clip })), end: p.position.toArray() });
        traces.push({ profile, samples });
    }
    // Grounded gravity suppression must still release support at a real ledge.
    const p = setup(false, [0, 5.54, 22]);
    g.physics.staticBox(p.position.clone().set(0, 4, 20), p.position.clone().set(8, 1, 10));
    g.physics.world.step(); g.input.keys.add('KeyW');
    const samples = [];
    for (let i = 0; i < 360; i++) {
        clock += 1000 / 60; g.frame(clock);
        samples.push({ t: i / 60, mode: p.mode, grounded: p.controller.computedGrounded(), position: p.position.toArray(), clip: p.visual.current });
    }
    checks.push({ name: 'run off a raised platform, fall, land and resume', pass: samples.some(s => s.mode === 'fall') && samples.some(s => s.clip === 'land') && p.mode === 'ground' && p.position.y < 1.06 && p.visual.current === 'jog' && p.velocity.length() > 5.9, end: p.position.toArray(), mode: p.mode, clip: p.visual.current });
    traces.push({ profile: { name: 'raised platform' }, samples });
    g.running = false; g.input.clear();
    return { checks, traces };
});
fs.writeFileSync(`.artifacts/running-${label}.json`, JSON.stringify({ ...result, errors }, null, 2));
console.log(JSON.stringify({ checks: result.checks.map(({ firstStops, ...check }) => check), errors }, null, 2));
await browser.close();
if (errors.length || result.checks.some(c => !c.pass)) process.exitCode = 1;
