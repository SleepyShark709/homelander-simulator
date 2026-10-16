import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const folder = '.artifacts/director-round/playtest';
fs.mkdirSync(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 },
    recordVideo: { dir: `${folder}/raw`, size: { width: 1280, height: 800 } } });
const page = await context.newPage(), errors = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const check = (name, pass, data) => { checks.push({ name, pass: !!pass, data }); assert.ok(pass, name); };
const snapshot = () => page.evaluate(() => window.game.snapshot());
try {
    await page.goto('http://127.0.0.1:4173/');
    await page.waitForFunction(() => !document.querySelector('#start').disabled);
    check('ordinary production page has no inspection controls', await page.evaluate(() => !window.game && !window.__THREE_GAME_TEST_HOOKS__));
    await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:4173/?qa=1');
    await page.waitForFunction(() => window.game?.world);
    await page.locator('#start').click();
    await page.waitForFunction(() => window.game.input.active);
    const start = await snapshot();
    await page.keyboard.down('KeyW'); await page.waitForTimeout(1300); await page.keyboard.up('KeyW');
    const moved = await snapshot();
    check('real W input advances the player', Math.hypot(moved.position[0] - start.position[0], moved.position[2] - start.position[2]) > 4, { start, moved });
    await page.keyboard.press('KeyF'); await page.keyboard.down('Space');
    await page.waitForTimeout(3900); await page.keyboard.up('Space');
    const high = await snapshot();
    check('real F and Space enter sustained flight', high.mode === 'fly' && high.position[1] > 5, high);
    await page.keyboard.down('ControlLeft'); await page.waitForTimeout(650); await page.keyboard.up('ControlLeft');
    const low = await snapshot(); check('real Ctrl descends', low.position[1] < high.position[1] - 2, { high, low });
    await page.keyboard.press('KeyQ'); await page.waitForTimeout(3300);
    check('real Q lands and completes recovery', (await snapshot()).mode === 'ground', await snapshot());
    await page.keyboard.press('Escape');
    const paused = await snapshot(); await page.waitForTimeout(350);
    check('Escape freezes simulation and clears input', (await snapshot()).time === paused.time && await page.evaluate(() => !window.game.input.active && window.game.input.keys.size === 0), paused);
    await page.screenshot({ path: `${folder}/pause.png` });
    await page.locator('#reset').click();
    const npc = await page.evaluate(() => {
        const g = window.game, p = g.player;
        const e = g.world.spawn('civilian', p.position.clone().set(0, .18, 22.8), 0);
        e.nextThink = 999; e.goal.copy(e.mesh.position); return e.id;
    });
    await page.locator('#start').click(); await page.waitForFunction(() => window.game.input.active);
    await page.mouse.click(640, 400, { button: 'right' }); await page.waitForTimeout(1500);
    check('real right click kills a close target once', await page.evaluate(id => window.game.world.entities.get(id)?.health.dead, npc), await snapshot());
    const levels = [];
    for (let i = 0; i < 8; i++) {
        const id = await page.evaluate(() => {
            const g = window.game, p = g.player;
            const e = g.world.spawn('civilian', p.position.clone().set(0, .18, 18), g.time);
            e.nextThink = 999; e.goal.copy(e.mesh.position);
            const aim = e.mesh.position.clone().add({ x: 0, y: 1.2, z: 0 });
            for (let j = 0; j < 10; j++) {
                const d = aim.clone().sub(g.camera.camera.position).normalize();
                g.input.yaw = Math.atan2(-d.x, -d.z); g.input.pitch = Math.asin(d.y); g.camera.update(.016, false);
            }
            return e.id;
        });
        await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
        check(`real laser kills target ${i + 1}`, await page.evaluate(id => window.game.world.entities.get(id)?.health.dead, id), await snapshot());
        levels.push((await snapshot()).level);
    }
    check('actual damage crosses all three pursuit levels', [1, 2, 3].every(level => levels.includes(level)), levels);
    await page.mouse.down();
    await page.waitForFunction(() => window.game.snapshot().enemies === 12, null, { timeout: 40000 });
    await page.screenshot({ path: `${folder}/pursuit.png` });
    const pursuit = await snapshot();
    check('level three reaches the twelve-enemy budget while player remains active', pursuit.level === 3 && pursuit.enemies === 12 && pursuit.running, pursuit);
    await page.mouse.up(); await page.keyboard.press('Escape');
    const baselines = [];
    for (let i = 0; i < 3; i++) {
        await page.locator('#reset').click(); await page.waitForTimeout(300); baselines.push(await snapshot());
        await page.locator('#start').click(); await page.waitForFunction(() => window.game.input.active);
        await page.keyboard.press('Escape');
    }
    check('three real menu resets recover entities and GPU allocations', baselines.every(s => s.bodies === 29 && s.civilians === 20 && s.enemies === 0 && s.effects === 0)
        && new Set(baselines.map(s => s.geometries)).size === 1 && new Set(baselines.map(s => s.textures)).size === 1, baselines);
    check('no browser errors during production input playtest', errors.length === 0, errors);
} catch (e) {
    errors.push(String(e)); process.exitCode = 1;
    await page.screenshot({ path: `${folder}/failure.png` });
} finally {
    const video = page.video(); await context.close();
    await video.saveAs(`${folder}/playtest.webm`); await browser.close();
    fs.writeFileSync(`${folder}/report.json`, JSON.stringify({ method: 'real Playwright keyboard/mouse and menu input; fixed target fixtures for hit assertions', checks, errors }, null, 2));
    console.log(JSON.stringify({ checks: checks.map(({ name, pass }) => ({ name, pass })), errors }));
}
