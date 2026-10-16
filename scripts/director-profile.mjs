import { chromium } from '@playwright/test';
import fs from 'node:fs';

const phase = process.argv[2] ?? 'after';
const seconds = Number(process.argv[3] ?? 20);
const warmup = Number(process.argv[4] ?? 5);
const url = process.env.GAME_URL ?? 'http://127.0.0.1:4173/?qa=1';
if (!/^[a-z0-9-]+$/.test(phase) || !Number.isFinite(seconds) || seconds <= 0)
    throw new Error('Usage: director-profile.mjs phase [seconds] [warmup]');
const folder = `.artifacts/director-round/${phase}`;
fs.mkdirSync(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--use-angle=metal', '--enable-precise-memory-info'] });
const errors = [], scenarios = [];
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => {
        let state = 104729;
        Math.random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
    });
    await page.goto(url);
    await page.waitForFunction(() => window.game?.world, { timeout: 60000 });
    const env = await page.evaluate(() => {
        const gl = window.game.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { browser: navigator.userAgent, gpu: ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
            buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], dpr: devicePixelRatio };
    });
    for (const state of ['street', 'flight', 'stress']) {
        await page.evaluate(s => window.__THREE_GAME_TEST_HOOKS__.setState(s), state);
        // Frozen identical composition, real GPU timing over the complete composer.
        await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true));
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${folder}/${state}.png` });
        const render = await page.evaluate(async () => {
            const g = window.game, gl = g.renderer.getContext();
            const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
            const samples = [];
            if (!ext) throw new Error('GPU timer query extension is unavailable; GPU comparison cannot run');
            g.renderer.setAnimationLoop(null);
            try { for (let i = 0; i < 40; i++) {
                const query = gl.createQuery();
                gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
                g.presentation.render(0);
                gl.endQuery(ext.TIME_ELAPSED_EXT);
                await new Promise(resolve => {
                    const check = () => {
                        if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return requestAnimationFrame(check);
                        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) samples.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
                        gl.deleteQuery(query); resolve();
                    }; requestAnimationFrame(check);
                });
            } } finally {
                g.previous = performance.now();
                g.renderer.setAnimationLoop(t => g.frame(t));
            }
            return { state: g.snapshot(), gpuMs: samples, presentation: window.__THREE_GAME_DIAGNOSTICS__.presentation };
        });
        await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(false));
        await page.waitForTimeout(warmup * 1000);
        await page.evaluate(() => { const g = window.game; g.frameTimes = []; g.updateTimes = []; g.submissionTimes = []; });
        const began = Date.now();
        let second = -1;
        while (Date.now() - began < seconds * 1000) {
            const next = Math.floor((Date.now() - began) / 1000);
            if (next !== second) {
                second = next;
                await page.evaluate(({ state, second }) => {
                    const g = window.game;
                    g.input.yaw = second * .16;
                    g.input.keys.clear();
                    if (state !== 'street') g.input.keys.add('KeyW');
                    else g.input.keys.add(second % 8 < 4 ? 'KeyW' : 'KeyS');
                    if (state === 'stress') {
                        g.wanted.heat = 100; g.wanted.action(); g.input.laser = true;
                        if (second % 3 === 0) g.effects.fragments(g.player.feet, 0xa6a293, 2);
                    }
                }, { state, second });
            }
            await page.waitForTimeout(200);
        }
        const live = await page.evaluate(() => {
            const g = window.game;
            return { frame: g.frameTimes, cpu: g.updateTimes, submit: g.submissionTimes, snapshot: g.snapshot(),
                heap: performance.memory?.usedJSHeapSize };
        });
        const stat = values => {
            const s = [...values].sort((a, b) => a - b);
            return { count: s.length, median: s[Math.floor(s.length * .5)] ?? null,
                p95: s[Math.floor(s.length * .95)] ?? null, max: s.at(-1) ?? null };
        };
        scenarios.push({ name: state, frozen: render.state, gpu: stat(render.gpuMs),
            presentation: render.presentation, live: { frame: stat(live.frame), cpu: stat(live.cpu),
                submit: stat(live.submit), state: live.snapshot, heap: live.heap } });
    }
    const result = { phase, url, seconds, warmup, date: new Date().toISOString(), env, scenarios, errors };
    fs.writeFileSync(`${folder}/profile.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    if (errors.length || /swiftshader|software/i.test(env.gpu)) process.exitCode = 1;
} finally { await browser.close(); }
