import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const origin = process.argv[2] ?? 'http://127.0.0.1:5176';
const folder = process.argv[3] ?? '.artifacts/animation-style/a1';
fs.mkdirSync(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const reports = [];
async function record(profile, preview) {
    const label = `${profile}-${preview ? 'views' : 'game'}`;
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 },
        recordVideo: { dir: path.join(folder, 'raw-video'), size: { width: 1280, height: 900 } } });
    const page = await context.newPage(), errors = [], samples = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        const url = new URL('/', origin);
        url.searchParams.set('heroStyle', profile);
        if (preview) url.searchParams.set('preview', 'character');
        await page.goto(url.href);
        await page.waitForLoadState('networkidle');
        await page.waitForFunction(preview ? () => window.studio?.person : () => window.game?.player, null, { timeout: 45000 });
        if (preview) {
            for (const [view, camera] of [['front', [0, 1.65, 4.8]], ['side', [4.8, 1.65, 0]], ['back', [0, 1.65, -4.8]]]) {
                for (const pose of ['ground', 'fly', 'boost']) {
                    await page.evaluate(camera => {
                        const s = window.studio;
                        s.camera.position.fromArray(camera); s.controls.target.set(0, 1.02, 0); s.controls.update();
                    }, camera);
                    await page.locator(`[data-pose="${pose}"]`).click();
                    await page.waitForTimeout(800);
                    const clip = await page.evaluate(() => {
                        const p = window.studio.person, action = p.actions.get(p.current);
                        return { clip: p.current, duration: action.getClip().duration, rate: action.getEffectiveTimeScale() };
                    });
                    samples.push({ view, pose, ...clip, cycles: 3 });
                    const ms = Math.max(1000, clip.duration * 3000 / clip.rate);
                    await page.waitForTimeout(ms / 2);
                    await page.screenshot({ path: path.join(folder, `${profile}-${pose}-${view}.png`) });
                    await page.waitForTimeout(ms / 2);
                }
            }
        } else {
            await page.locator('#start').click();
            await page.waitForFunction(() => window.game.input.active);
            await page.evaluate(() => {
                window.heroRecording = { active: true, started: performance.now(), stage: 'idle', samples: [] };
                const sample = () => {
                    const r = window.heroRecording, g = window.game, p = g.player;
                    if (!r.active) return;
                    r.samples.push({ t: (performance.now() - r.started) / 1000, stage: r.stage,
                        clip: p.visual.current, mode: p.mode, speed: p.velocity.length(),
                        position: p.position.toArray(), running: g.running, keys: [...g.input.keys] });
                    requestAnimationFrame(sample);
                };
                requestAnimationFrame(sample);
            });
            const stage = async name => { console.log(profile, name); await page.evaluate(name => window.heroRecording.stage = name, name); };
            const hold = async (keys, ms) => {
                for (const key of keys) await page.keyboard.down(key);
                await page.waitForTimeout(ms);
                for (const key of [...keys].reverse()) await page.keyboard.up(key);
            };
            await stage('idle'); await page.waitForTimeout(4200);
            await stage('takeoff'); await page.keyboard.press('KeyF');
            await page.waitForFunction(() => window.game.player.mode === 'fly');
            await stage('rise / hover'); await hold(['Space'], 1600); await page.waitForTimeout(1800);
            await stage('ordinary forward'); await hold(['KeyW'], 1200);
            await stage('accelerate'); await hold(['KeyW', 'Shift'], 1200);
            await stage('brake / hover'); await page.waitForTimeout(2200);
            await stage('reverse'); await hold(['KeyS'], 1200);
            await stage('hover'); await page.waitForTimeout(1800);
            await stage('fall / land'); await page.keyboard.press('KeyF');
            await page.waitForFunction(() => window.game.player.mode === 'ground', null, { timeout: 15000 });
            await page.waitForTimeout(2600);
            await stage('pause'); await page.keyboard.press('Escape'); await page.waitForTimeout(700);
            await page.locator('#start').click(); await page.waitForTimeout(1000);
            samples.push(...await page.evaluate(() => { window.heroRecording.active = false; return window.heroRecording.samples; }));
            await page.screenshot({ path: path.join(folder, `${profile}-game-final.png`) });
        }
        const checks = preview ? [{ name: 'three views, three cycles of idle / hover / fly', pass: samples.length === 9 }]
            : ['takeoff', profile==='natural' ? 'style_fall_controlled' : 'fall', 'land', `hover_to_fly_${profile}`, `fly_to_hover_${profile}`]
                .map(clip => ({ name: clip, pass: samples.some(sample => sample.clip === clip || sample.clip.startsWith(clip+'_') || (clip==='land' && sample.clip==='style_land_from_back')) }));
        if (!preview) checks.push({ name: 'pause and resume', pass: samples.some(sample => !sample.running) && samples.at(-1).running });
        const report = { profile, preview, method: preview ? 'source playback in runtime viewer, original rate, three complete cycles per view'
            : 'actual Playwright keyboard events, default city / NPCs, no coordinate or ability state writes', samples, checks, errors };
        reports.push(report);
        fs.writeFileSync(path.join(folder, `${label}.json`), JSON.stringify(report, null, 2));
        if (errors.length || checks.some(check => !check.pass)) throw new Error(`${label} failed`);
    } finally {
        const video = page.video(); await context.close();
        await video.saveAs(path.join(folder, `${label}.webm`));
    }
}
try {
    for (const profile of (process.argv[4]?.split(',') ?? ['restrained', 'commanding'])) {
        if(process.argv[5]!=='game') await record(profile, true);
        await record(profile, false);
    }
} finally { await browser.close(); }
console.log(JSON.stringify(reports.map(({ profile, preview, checks, errors }) => ({ profile, preview, checks, errors }))));
