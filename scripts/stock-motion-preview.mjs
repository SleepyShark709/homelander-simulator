// Plays upstream CC0 clips on their own bundled mesh/skeleton, without retargeting
// or authoring keyframes. This is an asset audition, not a game replacement.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

fs.mkdirSync('.artifacts/stock-motion', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const context = await browser.newContext({ viewport: { width: 1000, height: 900 }, recordVideo: { dir: '.artifacts/stock-motion', size: { width: 1000, height: 900 } } });
const page = await context.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://127.0.0.1:5173/?preview=character');
await page.waitForFunction(() => window.studio?.person, { timeout: 20000 });
const assets = await page.evaluate(async () => {
    const T = await import('/node_modules/.vite/deps/three.js');
    const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const s = window.studio;
    s.renderer.setAnimationLoop(null);
    s.scene.remove(s.person.group);
    s.camera.position.set(0, 1.6, 4.6);
    s.controls.target.set(0, 1.0, 0);
    s.controls.update();
    const loader = new GLTFLoader(), bundles = {};
    for (const key of ['base', 'addon']) {
        const gltf = await loader.loadAsync(`/.asset-source/mesh2motion/human-${key}-animations.glb`);
        gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        bundles[key] = { ...gltf, mixer: new T.AnimationMixer(gltf.scene) };
    }
    document.querySelector('.studio-controls').remove();
    document.querySelector('.studio-bar').innerHTML = '<strong>Mesh2Motion · 原始 CC0 动作预览</strong><span id="motion-label"></span>';
    let current, action;
    window.stockMotion = (key, name, loop) => {
        if (current) { current.mixer.stopAllAction(); s.scene.remove(current.scene); }
        current = bundles[key];
        current.scene.position.set(0, .05, 0);
        const clip = current.animations.find(c => c.name === name);
        if (!clip) throw new Error('Upstream clip not found: ' + name);
        action = current.mixer.clipAction(clip).reset().setLoop(loop ? T.LoopRepeat : T.LoopOnce, loop ? Infinity : 1);
        action.clampWhenFinished = true;
        action.play();
        s.scene.add(current.scene);
        document.getElementById('motion-label').textContent = name;
        return { name, duration: clip.duration, tracks: clip.tracks.length };
    };
    let previous;
    s.renderer.setAnimationLoop(now => {
        const dt = previous === undefined ? 0 : Math.min(.05, (now-previous)/1000);
        previous = now;
        if (current) current.mixer.update(dt);
        s.renderer.render(s.scene, s.camera);
    });
    return Object.fromEntries(Object.entries(bundles).map(([key, gltf]) => [key, gltf.animations.length]));
});
const clips = [];
for (const [key, name, loop] of [
    ['base', 'Jog', true], ['base', 'Sprint', true], ['base', 'Punch_Jab', false],
    ['addon', 'Levitate Entrance', false], ['addon', 'Levitate Idle', true],
    ['addon', 'Flying Forward Super', true], ['addon', 'Land_Three_Point', false],
    ['addon', 'Attack_Ground_Pound', false],
]) {
    const clip = await page.evaluate(([key,name,loop]) => window.stockMotion(key,name,loop), [key,name,loop]);
    clips.push(clip);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `.artifacts/stock-motion/${name.replaceAll(' ', '-')}.png` });
    await page.waitForTimeout(1200);
}
const video = page.video();
await context.close();
await video.saveAs('.artifacts/stock-motion-preview.webm');
await browser.close();
const report = { source: 'https://github.com/Mesh2Motion/mesh2motion-app', assets, clips, errors, retargeted: false, authoredKeyframes: false, installedInGame: false };
fs.writeFileSync('.artifacts/stock-motion-preview.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
