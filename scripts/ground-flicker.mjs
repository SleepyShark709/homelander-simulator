import { chromium } from '@playwright/test';
import fs from 'node:fs';

const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=metal'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
    await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:5173/');
    await page.waitForFunction(() => window.game?.player);
    await page.evaluate(() => {
        const g = window.game;
        g.renderer.setAnimationLoop(null);
        g.running = true;
        g.input.active = true;
        g.ui.playing(true);
        for (const e of g.world.alive('civilian')) g.world.remove(e);
        const p = g.player;
        p.position.set(0, 1.16, 25);
        p.previous.copy(p.position);
        p.velocity.set(0, 0, 0);
        p.mode = 'ground';
        p.body.setTranslation(p.position, true);
        p.body.setNextKinematicTranslation(p.position);
        g.physics.world.step();
        p.sync();
        g.input.pitch = -0.12;
        g.camera.update(1, false, true);
        g.presentation.render();
    });
    fs.mkdirSync('.artifacts', { recursive: true });
    const label = process.env.REPORT_LABEL ?? 'current';
    await page
        .locator('canvas')
        .screenshot({ path: `.artifacts/ground-${label}.png` });
    const report = await page.evaluate(async () => {
        const T = await import('/node_modules/three/build/three.module.js');
        const g = window.game;
        const paving = g.world.art.paving,
            asphalt = g.world.art.asphalt;
        // Use the real, batched ground geometry and moving game camera. Flat ID
        // colours isolate which surface wins the depth test from texture/shading.
        const road = new T.MeshBasicMaterial({
            color: 0xff0000,
            fog: false,
            toneMapped: false,
        });
        const base = new T.MeshBasicMaterial({
            color: 0x00ff00,
            fog: false,
            toneMapped: false,
        });
        g.scene.traverse((o) => {
            if (!o.isMesh) return;
            if (o.material === asphalt) o.material = road;
            else if (o.material === paving) o.material = base;
            else {
                o.visible = false;
                return;
            }
            // Retain actual road/base top faces; raised building plinths and
            // sidewalks otherwise occlude off-axis probes at a shallow angle.
            const geometry = o.geometry.clone(),
                position = geometry.attributes.position;
            const normal = geometry.attributes.normal,
                index = geometry.index,
                triangles = [];
            for (let i = 0; i < index.count; i += 3) {
                const ids = [
                    index.getX(i),
                    index.getX(i + 1),
                    index.getX(i + 2),
                ];
                if (
                    ids.every(
                        (id) =>
                            position.getY(id) < 0.01 && normal.getY(id) > 0.99,
                    )
                )
                    triangles.push(...ids);
            }
            geometry.setIndex(triangles);
            o.geometry = geometry;
        });
        g.scene.fog = null;
        g.renderer.shadowMap.enabled = false;
        const gl = g.renderer.getContext(),
            width = gl.drawingBufferWidth,
            height = gl.drawingBufferHeight;
        const pixels = new Uint8Array(width * height * 4);
        const scenarios = [];
        let clock = 1000;
        for (const [name, altitude, pitch, hz] of [
            ['walk', 1.16, -0.12, 60],
            ['walk-down', 1.16, -0.5, 144],
            ['fly', 30, -0.5, 60],
            ['high-flight', 70, -0.8, 144],
            ['distant-road', 70, -0.3, 60],
        ]) {
            const probes = [];
            for (let z = -95; z <= -15; z += 2) {
                for (const x of [-8, -4, 0, 4, 8])
                    probes.push({ x, z, expected: 'road', values: [] });
            }
            for (const side of [-1, 1]) {
                for (const t of [-85, -65, 0, 65, 85]) {
                    probes.push({
                        x: side * 58,
                        z: t,
                        expected: 'road',
                        values: [],
                    });
                    probes.push({
                        x: t,
                        z: side * 58,
                        expected: 'road',
                        values: [],
                    });
                }
                for (const t of [20, 40, 70, 90])
                    probes.push({
                        x: side * t,
                        z: 0,
                        expected: 'road',
                        values: [],
                    });
                for (const t of [120, 180, 240])
                    probes.push({
                        x: 0,
                        z: side * t,
                        expected: 'road',
                        values: [],
                    });
                for (const x of [20, 85])
                    probes.push({
                        x: side * x,
                        z: -20,
                        expected: 'paving',
                        values: [],
                    });
            }
            const p = g.player;
            p.position.set(0, altitude, 25);
            p.previous.copy(p.position);
            p.velocity.set(0, 0, 0);
            p.previousVelocity.set(0, 0, 0);
            p.mode = altitude > 2 ? 'fly' : 'ground';
            p.body.setTranslation(p.position, true);
            p.body.setNextKinematicTranslation(p.position);
            g.physics.world.step();
            p.sync();
            g.input.pitch = pitch;
            g.previous = clock;
            g.accumulator = 0;
            g.input.keys.add('KeyW');
            for (let frame = 0; frame < 24; frame++) {
                clock += 1000 / hz;
                g.frame(clock);
                g.renderer.setRenderTarget(null);
                g.renderer.render(g.scene, g.camera.camera);
                gl.readPixels(
                    0,
                    0,
                    width,
                    height,
                    gl.RGBA,
                    gl.UNSIGNED_BYTE,
                    pixels,
                );
                for (const probe of probes) {
                    const projected = new T.Vector3(
                        probe.x,
                        0,
                        probe.z,
                    ).project(g.camera.camera);
                    const x = Math.floor(((projected.x + 1) * width) / 2),
                        y = Math.floor(((projected.y + 1) * height) / 2);
                    if (
                        x < 0 ||
                        x >= width ||
                        y < 0 ||
                        y >= height ||
                        projected.z > 1 ||
                        projected.z < -1
                    )
                        continue;
                    const offset = (y * width + x) * 4;
                    const r = pixels[offset],
                        green = pixels[offset + 1];
                    probe.values.push(
                        r > 200 && green < 10
                            ? 'road'
                            : green > 200 && r < 10
                              ? 'paving'
                              : 'missing',
                    );
                }
            }
            const sampled = probes.filter((p) => p.values.length > 0);
            const failures = sampled.filter((p) =>
                p.values.some((value) => value !== p.expected),
            );
            const flickering = failures.filter(
                (p) => new Set(p.values).size > 1,
            );
            scenarios.push({
                name,
                hz,
                sampledProbes: sampled.length,
                samples: sampled.reduce((n, p) => n + p.values.length, 0),
                incorrectSurfaceProbes: failures.length,
                flickeringProbes: flickering.length,
                examples: failures.slice(0, 3),
            });
        }
        return {
            pass: scenarios.every(
                (s) => s.sampledProbes >= 10 && s.incorrectSurfaceProbes === 0,
            ),
            scenarios,
        };
    });
    await page
        .locator('canvas')
        .screenshot({ path: `.artifacts/ground-depth-${label}.png` });
    fs.writeFileSync(
        `.artifacts/ground-${label}.json`,
        JSON.stringify({ ...report, errors }, null, 2),
    );
    console.log(JSON.stringify({ ...report, errors }, null, 2));
    if (!report.pass || errors.length) process.exitCode = 1;
} finally {
    await browser.close();
}
