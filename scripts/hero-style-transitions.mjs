// Local full-body diagnostics; actual input/cape footage is recorded separately.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const origin = process.argv[2] ?? 'http://127.0.0.1:5176';
const folder = process.argv[3] ?? '.artifacts/animation-style/a1';
fs.mkdirSync(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const reports = [], errors = [];
try {
    for (const profile of (process.argv[4]?.split(',') ?? ['restrained', 'commanding'])) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${origin}/?preview=character&heroStyle=${profile}`);
        await page.waitForFunction(() => window.studio?.person, null, { timeout: 45000 });
        const report = await page.evaluate(async profile => {
            const T = await import('/node_modules/.vite/deps/three.js');
            const s = window.studio, p = s.person;
            s.renderer.setAnimationLoop(null);
            if (p.cape) { p.cape.enabled = false; p.cape.reset(); }
            const meshes = [];
            p.model.traverse(object => { if (object.isSkinnedMesh) meshes.push(object); });
            const bones = meshes[0].skeleton.bones;
            const sample = () => {
                p.group.updateMatrixWorld(true);
                return [...bones.map(bone => bone.getWorldPosition(new T.Vector3())),
                    ...meshes.flatMap(mesh => Array.from({ length: Math.ceil(mesh.geometry.attributes.position.count / 503) }, (_, i) => {
                        const index = i * 503;
                        return mesh.applyBoneTransform(index, new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index)).applyMatrix4(mesh.matrixWorld);
                    }))];
            };
            p.mixer.stopAllAction(); p.current = '';
            let previous, maxStep = 0, worst, time = 0;
            const clips = new Set(), trace = [];
            const sequence = [['ground', 120], ['takeoff', 90], ['fly', 120], ['boost', 180],
                ['fly', 120], ['boost', 10], ['fly', 10], ['boost', 120], ['fly', 120], ['fall', 90], ['land', 120], ['ground', 120]];
            for (const [mode, frames] of sequence) for (let frame = 0; frame < frames; frame++) {
                p.update(1 / 120, time, mode, mode === 'boost' ? 40 : 0);
                time += 1 / 120;
                const pose = sample();
                if (previous) for (let j = 0; j < pose.length; j++) {
                    const step = pose[j].distanceTo(previous[j]);
                    if (step > maxStep) { maxStep = step; worst = { t: time, mode, clip: p.current, point: bones[j]?.name ?? `skin-${j - bones.length}` }; }
                }
                previous = pose; clips.add(p.current);
                trace.push({ t: time, mode, clip: p.current });
            }
            const paused = sample();
            for (let i = 0; i < 30; i++) p.update(0, time, 'ground', 0);
            const pauseError = Math.max(...sample().map((point, j) => point.distanceTo(paused[j])));
            const checks = [
                { name: '68 bones and sampled skin, 0.12m / 120Hz', pass: maxStep < .12, maxStep, worst },
                { name: 'both transitions observed', pass: [...clips].some(name=>name.startsWith(`hover_to_fly_${profile}`)) && [...clips].some(name=>name.startsWith(`fly_to_hover_${profile}`)) },
                { name: 'zero-time pause does not advance pose', pass: pauseError < 1e-6, pauseError },
            ];
            return { profile, method: 'fixed local viewer, full skeleton and sampled undeformed-cape skin, rapid interruptions included', checks, trace };
        }, profile);
        reports.push(report); await page.close();
    }
} finally { await browser.close(); }
fs.writeFileSync(`${folder}/transitions.json`, JSON.stringify({ reports, errors }, null, 2));
console.log(JSON.stringify({ reports: reports.map(({ profile, checks }) => ({ profile, checks })), errors }));
if (errors.length || reports.some(report => report.checks.some(check => !check.pass))) process.exitCode = 1;
