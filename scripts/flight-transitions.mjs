import { chromium } from '@playwright/test';
import fs from 'node:fs';

const folder = process.argv[3] ?? '.artifacts/flight';
fs.mkdirSync(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
    await page.goto(process.argv[2] ?? 'http://127.0.0.1:5173/');
    await page.waitForFunction(() => window.game?.player);
    await page.waitForLoadState('networkidle');
    const report = await page.evaluate(async () => {
        const T = await import('/node_modules/.vite/deps/three.js');
        const g = window.game, dt = 1 / 120, checks = [], traces = [];
        const landingClip = name => ['land','style_land_from_back'].includes(name);
        g.renderer.setAnimationLoop(null);
        const render = g.presentation.render.bind(g.presentation);
        g.presentation.render = () => {};
        let clock = 1000;
        const frame = () => { clock += dt * 1000; g.frame(clock); };
        const setup = (height, surface = 0, mode = 'fall') => {
            g.reset();
            for (const entity of [...g.world.entities.values()]) if (entity.person) g.world.remove(entity);
            if (surface) g.physics.staticBox(new T.Vector3(0, surface - .5, 25), new T.Vector3(12, 1, 12));
            const p = g.player;
            p.position.set(0, surface + height + 1.03, 25); p.previous.copy(p.position);
            p.velocity.set(0, 0, 0); p.previousVelocity.set(0, 0, 0); p.mode = mode;
            p.body.setTranslation(p.position, true); p.body.setNextKinematicTranslation(p.position);
            g.physics.world.step(); p.sync();
            g.running = true; g.input.active = true; g.ui.playing(true); g.previous = clock; g.accumulator = 0;
            let mesh; p.visual.model.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
            const soles = [], skin = [];
            for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
                if (!p.visual.cape?.vertices.has(i)) {
                    if (mesh.geometry.attributes.position.getY(i) < .13) soles.push(i);
                    if (i % 503 === 0) skin.push(i);
                }
            }
            return { p, mesh, soles, skin };
        };
        const sample = ({ p, mesh, soles, skin }) => {
            p.visual.group.updateMatrixWorld(true);
            const vertex = i => mesh.applyBoneTransform(i,
                new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i)).applyMatrix4(mesh.matrixWorld);
            return { pose: [...mesh.skeleton.bones.map(b => b.getWorldPosition(new T.Vector3())), ...skin.map(vertex)]
                .map(v => v.sub(p.visual.group.position)), sole: Math.min(...soles.map(i => vertex(i).y)) };
        };
        for (const [height, surface] of [[.2, 0], [1, 0], [5.8, 0], [6.2, 0], [15, 0], [1, 15], [8, 15]]) {
            const fixture = setup(height, surface), { p } = fixture;
            let previous, maxPoseStep = 0, maxGroundSole = -Infinity, minGroundSole = Infinity;
            let land = false, contactFrame = -1, maxRootRise = 0;
            const frames = [];
            for (let i = 0; i < 600; i++) {
                const oldY = p.position.y; frame();
                const s = sample(fixture);
                if (previous) maxPoseStep = Math.max(maxPoseStep, ...s.pose.map((v, j) => v.distanceTo(previous[j])));
                previous = s.pose;
                if (p.mode === 'ground') {
                    if (contactFrame < 0) contactFrame = i;
                    // Display interpolation finishes the previous airborne fixed
                    // step during the first two 120 Hz samples after contact.
                    if (i > contactFrame + 2) {
                        maxGroundSole = Math.max(maxGroundSole, s.sole - surface);
                        minGroundSole = Math.min(minGroundSole, s.sole - surface);
                    }
                    maxRootRise = Math.max(maxRootRise, p.position.y - oldY);
                }
                land ||= landingClip(p.visual.current);
                frames.push({ t: i * dt, mode: p.mode, clip: p.visual.current, root: p.position.y,
                    model: p.visual.model.position.y, sole: s.sole, recovery: p.recovery });
            }
            checks.push({ name: `${height}m fall onto ${surface}m support`, pass: land === (height >= 6) &&
                contactFrame >= 0 && p.mode === 'ground' && p.recovery === 0 && maxPoseStep < .12 &&
                maxGroundSole < .12 && minGroundSole > -.035 && maxRootRise < .02,
                land, contactFrame, maxPoseStep, maxGroundSole, minGroundSole, maxRootRise });
            traces.push({ height, surface, frames });
        }
        for (const [name, surface, moving, ceiling] of [
            ['standing jump', 0, false, false], ['running jump', 0, true, false],
            ['rooftop jump', 15, false, false], ['low ceiling jump', 0, false, true],
        ]) {
            const fixture = setup(0, surface, 'ground'), { p } = fixture;
            if (ceiling) g.physics.staticBox(new T.Vector3(0, 3, 25), new T.Vector3(12, .4, 12));
            for (let i = 0; i < 90; i++) frame();
            if (moving) g.input.keys.add('KeyW');
            g.input.keys.add('Space'); g.input.pressed.add('Space');
            let previous, maxPoseStep = 0, peak = p.position.y, launches = 0, lastY = 0;
            let maxGroundSole = -Infinity, minGroundSole = Infinity, contactFrame = -1;
            const clips = new Set(), frames = [];
            for (let i = 0; i < 360; i++) {
                if (i === 60) g.input.pressed.add('Space');
                frame(); const s = sample(fixture); clips.add(p.visual.current);
                if (previous) maxPoseStep = Math.max(maxPoseStep, ...s.pose.map((v, j) => v.distanceTo(previous[j])));
                previous = s.pose; peak = Math.max(peak, p.position.y);
                if (p.velocity.y > 0 && lastY <= 0) launches++;
                lastY = p.velocity.y;
                if (p.mode === 'ground' && launches > 0) {
                    if (contactFrame < 0) contactFrame = i;
                    // Once jogging resumes, the stock run includes airborne strides.
                    if (i > contactFrame + 2 && p.recovery > 0) {
                        maxGroundSole = Math.max(maxGroundSole, s.sole - surface);
                        minGroundSole = Math.min(minGroundSole, s.sole - surface);
                    }
                }
                if (name === 'standing jump' && i === 12) {
                    const before = { time: g.time, action: p.visual.actions.get('jump_start').time, y: p.position.y };
                    g.input.pause(); for (let j = 0; j < 60; j++) frame();
                    checks.push({ name: 'jump pauses its physics and animation and clears input',
                        pass: before.time === g.time && before.action === p.visual.actions.get('jump_start').time &&
                            before.y === p.position.y && !g.input.keys.size && !g.input.pressed.size });
                    g.running = true; g.input.active = true; g.previous = clock;
                    g.input.keys.add('Space');
                }
                frames.push({ t: i * dt, mode: p.mode, clip: p.visual.current, root: p.position.y, sole: s.sole });
            }
            checks.push({ name: `${name}: full skeleton and skin, one launch and landing recovery`,
                pass: clips.has('jump_start') && clips.has('jump_land') && (ceiling || clips.has('fall')) &&
                    ![...clips].some(landingClip) && launches === 1 && p.mode === 'ground' && p.recovery === 0 &&
                    peak - surface > (ceiling ? 1.2 : 2.4) && (!ceiling || peak < 1.7) &&
                    maxPoseStep < .12 && maxGroundSole < .12 && minGroundSole > -.035,
                clips: [...clips], launches, peak, maxPoseStep, maxGroundSole, minGroundSole });
            traces.push({ name, frames });
        }
        for (const [key, at] of [['KeyF', 6], ['KeyF', 42], ['KeyQ', 42]]) {
            const fixture = setup(0, 0, 'ground'), { p } = fixture;
            for (let i = 0; i < 90; i++) frame();
            g.input.pressed.add('Space');
            let previous, maxPoseStep = 0, hits = 0;
            const clips = new Set(); p.onSlam = () => hits++;
            for (let i = 0; i < 420; i++) {
                if (i === at) g.input.pressed.add(key);
                frame(); const s = sample(fixture); clips.add(p.visual.current);
                if (previous) maxPoseStep = Math.max(maxPoseStep, ...s.pose.map((v, j) => v.distanceTo(previous[j])));
                previous = s.pose;
            }
            checks.push({ name: `jump to ${key} at ${at * dt}s preserves full-body continuity`,
                pass: maxPoseStep < .12 && (key === 'KeyF'
                    ? p.mode === 'fly' && p.position.y > 1.2 && (at !== 6 || clips.has('takeoff'))
                    : p.mode === 'ground' && p.recovery === 0 && hits === 1),
                maxPoseStep, hits, clips: [...clips] });
        }
        for (const height of [.25, 15]) {
            const fixture = setup(height, 0, 'fly'), { p } = fixture;
            let hits = 0, earlyHit = false, held = false, groundLand = false, oldSlam = false, previous, maxPoseStep = 0, worst;
            p.onSlam = () => { hits++; earlyHit ||= p.mode !== 'slam' || p.feet.y > .12; };
            g.input.pressed.add('KeyQ');
            for (let i = 0; i < 450; i++) {
                frame(); const s = sample(fixture);
                if (previous) maxPoseStep = Math.max(maxPoseStep, ...s.pose.map((v, j) => v.distanceTo(previous[j])));
                if(previous) for(let j=0;j<s.pose.length;j++){const step=s.pose[j].distanceTo(previous[j]);if(step>=maxPoseStep && step>0)worst={frame:i,point:j,clip:p.visual.current,mode:p.mode,modelY:p.visual.model.position.y,weights:[...p.visual.baseWeights]};}
                previous = s.pose;
                held ||= p.mode === 'slam' && landingClip(p.visual.current) && p.visual.actions.get(p.visual.current).paused;
                groundLand ||= p.mode === 'ground' && landingClip(p.visual.current);
                oldSlam ||= p.visual.current === 'slam';
                if (i === 1) {
                    const before = { time: g.time, action: p.visual.actions.get(p.visual.current).time, hits };
                    g.running = false; for (let j = 0; j < 120; j++) frame();
                    checks.push({ name: `${height}m Q pauses without advancing clip or damage`,
                        pass: before.time === g.time && before.action === p.visual.actions.get(p.visual.current).time && before.hits === hits });
                    g.running = true; g.previous = clock;
                }
            }
            checks.push({ name: `${height}m Q shares landing pose with one physical impact`,
                // A .25m Q reaches the floor in its first 60 Hz physics step.
                pass: (height === .25 || held) && groundLand && !oldSlam && hits === 1 && !earlyHit && maxPoseStep < .12 && ['idle','style_idle_a','style_idle_b'].includes(p.visual.current),
                held, groundLand, oldSlam, hits, earlyHit, maxPoseStep, worst });
        }
        const fixture = setup(0, 0, 'ground'), { p } = fixture;
        for (let i = 0; i < 90; i++) frame();
        g.input.pressed.add('KeyF');
        let hoverAt = -1, previous, maxPoseStep = 0;
        for (let i = 0; i < 240; i++) {
            frame(); const s = sample(fixture);
            if (previous) maxPoseStep = Math.max(maxPoseStep, ...s.pose.map((v, j) => v.distanceTo(previous[j])));
            previous = s.pose;
            if (hoverAt < 0 && p.mode === 'fly') hoverAt = i * dt;
        }
        checks.push({ name: 'takeoff reaches hover promptly and blends the complete rig',
            pass: hoverAt > 0 && hoverAt <= .75 && p.position.y > 1.2 && maxPoseStep < .12, hoverAt, maxPoseStep });
        g.running = false; g.input.clear(); g.presentation.render = render;
        return { checks, traces };
    });
    fs.writeFileSync(`${folder}/transitions.json`, JSON.stringify({ ...report, errors }, null, 2));
    console.log(JSON.stringify({ checks: report.checks, errors }, null, 2));
    if (errors.length || report.checks.some(check => !check.pass)) process.exitCode = 1;
} finally { await browser.close(); }
