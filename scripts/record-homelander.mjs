import { chromium } from '@playwright/test';
import fs from 'node:fs';

// Uses browser input events; scene setup and animation stepping remain in the game.
const folder = '.artifacts/homelander/video';
const url = new URL('/', process.argv[2] ?? 'http://127.0.0.1:5173').href;
fs.mkdirSync(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: folder, size: { width: 1280, height: 900 } } });
const page = await context.newPage(), errors = [], preview = [], stages = [];
page.on('pageerror', e => errors.push(e.message));
try {
    await page.goto(`${url}?preview=character`);
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => window.studio?.person);
    console.log('recording 18 preview actions');
    for (const pose of ['ground','walk','jog','sprint','jump_start','jump_land','takeoff','fly','boost','fall','land','punch','casual_attack','combo_a','combo_b','laser_hip','laser_back','slam']) {
        await page.evaluate(pose => {
            const s = window.studio;
            s.camera.position.set(['walk','jog','sprint','boost','fall'].includes(pose) ? 3.6 : 1.6, 1.65, 3.5);
            s.controls.target.set(0, 1.02, 0); s.controls.update();
        }, pose);
        await page.locator(`[data-pose="${pose}"]`).click();
        await page.waitForTimeout(100);
        const clip = await page.evaluate(() => { const p = window.studio.person; return { name: p.current, duration: p.actionDuration(p.current) }; });
        preview.push({ pose, ...clip });
        const duration = Math.max(2, Math.min(clip.duration + .3, 4));
        await page.waitForTimeout(duration * 450);
        await page.screenshot({ path: `${folder}/preview-${pose}.png` });
        await page.waitForTimeout(duration * 550);
    }
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => window.game?.player);
    await page.locator('#start').click();
    await page.waitForFunction(() => window.game.input.active);
    await page.evaluate(() => {
        window.gameRecording = { started: performance.now(), active: true, stage: 'idle', samples: [] };
        const sample = () => {
            const r = window.gameRecording, g = window.game, p = g.player;
            if (!r.active) return;
            r.samples.push({ t: (performance.now()-r.started)/1000, stage: r.stage, clip: p.visual.current, mode: p.mode, speed: p.velocity.length(), position: p.position.toArray(), keys: [...g.input.keys], laser: g.input.laser, running: g.running });
            requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
    });
    const stage = async name => { console.log(name); await page.evaluate(name => window.gameRecording.stage = name, name); stages.push(name); };
    const hold = async (keys, ms) => { for (const key of keys) await page.keyboard.down(key); await page.waitForTimeout(ms); for (const key of keys.reverse()) await page.keyboard.up(key); };
    await stage('Space ground jump'); await hold(['Space'], 2400); await page.waitForTimeout(500);
    await stage('W/S running'); await hold(['KeyW'], 2200); await hold(['KeyS'], 2200);
    await stage('A/D turning'); await hold(['KeyA'], 500); await hold(['KeyD'], 500);
    await stage('Shift sprint'); await hold(['KeyW','Shift'], 1100); await page.waitForTimeout(700);
    for (const [key, clip] of [['KeyE','casual_attack'],['KeyR','combo_a'],['KeyT','combo_b'],[null,'punch']]) {
        await stage(clip);
        if (key) await page.keyboard.press(key); else await page.mouse.click(640, 450, { button: 'right' });
        const duration = await page.evaluate(clip => window.game.player.visual.actionDuration(clip), clip);
        await page.waitForTimeout(duration * 500);
        await page.screenshot({ path: `${folder}/game-${clip}.png` });
        await page.waitForTimeout(duration * 500 + 500);
    }
    for (const pose of ['idle','laser_hip','laser_back']) {
        await stage(pose === 'idle' ? 'laser_idle' : pose);
        if (pose !== 'idle') await page.keyboard.press('KeyV');
        await page.mouse.down(); await page.waitForTimeout(1600);
        await page.screenshot({ path: `${folder}/game-${pose}-laser.png` });
        await page.mouse.up(); await page.waitForTimeout(350);
    }
    await stage('F takeoff'); await page.keyboard.press('KeyF');
    await page.waitForFunction(() => window.game.player.mode === 'fly', null, { timeout: 15000 });
    await stage('Space ascend and hover'); await hold(['Space'], 1800); await page.waitForTimeout(1200);
    await stage('W forward flight'); await hold(['KeyW'], 1200);
    await stage('Shift boosted flight'); await hold(['KeyW','Shift'], 900);
    await stage('S backward flight'); await hold(['KeyS'], 1400);
    await stage('Ctrl descend'); await hold(['ControlLeft'], 500);
    await stage('F fall and land'); await page.keyboard.press('KeyF');
    await page.waitForFunction(() => window.game.player.mode === 'ground', null, { timeout: 15000 });
    await page.waitForTimeout(2200);
    await stage('takeoff for Q slam'); await page.keyboard.press('KeyF');
    await page.waitForFunction(() => window.game.player.mode === 'fly', null, { timeout: 15000 });
    await hold(['Space'], 2200); await stage('Q slam'); await page.keyboard.press('KeyQ');
    await page.waitForFunction(() => window.game.player.mode === 'ground', null, { timeout: 15000 });
    await page.waitForTimeout(2500);
    await stage('pause during combo'); await page.keyboard.press('KeyR'); await page.waitForTimeout(450);
    await page.keyboard.press('Escape'); await page.waitForTimeout(1300);
    await page.locator('#start').click(); await page.waitForTimeout(2400);
    await stage('end'); await page.screenshot({ path: `${folder}/game-final.png` });
    const trace = await page.evaluate(() => { window.gameRecording.active = false; return window.gameRecording.samples; });
    const expected = ['jog','sprint','jump_start','jump_land','casual_attack','combo_a','combo_b','punch','idle','laser_hip','laser_back','takeoff','hover','fly','fall','land'];
    const checks = expected.map(clip => ({ clip, pass: trace.some(s => s.clip === clip) }));
    checks.push({ name: 'pause and resume', pass: trace.some(s => !s.running) && trace.at(-1).running });
    checks.push({ name: 'all 18 preview controls respond', pass: preview.length === 18 && preview.some(s => s.name === 'jump_start') && preview.some(s => s.name === 'jump_land') });
    fs.writeFileSync('.artifacts/homelander/recording.json', JSON.stringify({ method: 'actual Playwright keyboard/mouse events, default city and NPCs; preview is separate from actual gameplay', preview, stages, checks, errors, trace }, null, 2));
    console.log(JSON.stringify({ checks, errors }));
    if (errors.length || checks.some(c => !c.pass)) process.exitCode = 1;
} finally {
    const video = page.video(); await context.close();
    await video.saveAs('.artifacts/homelander/gameplay.webm'); await browser.close();
}
