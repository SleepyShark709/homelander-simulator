import { chromium } from '@playwright/test';
import fs from 'node:fs';

const origin = process.argv[2] ?? 'http://127.0.0.1:5176';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const reports = [], errors = [];
try {
    for (const profile of ['restrained', 'commanding']) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${origin}/?heroStyle=${profile}`);
        await page.waitForLoadState('networkidle');
        await page.waitForFunction(() => window.game?.player, null, { timeout: 45000 });
        const report = await page.evaluate(profile => {
            const g = window.game;
            g.renderer.setAnimationLoop(null);
            let clock = performance.now();
            const render = () => g.frame(clock += 17);
            const source = g.assets.models.get('person');
            let cache;
            source.scene.traverse(object => { if (object.isSkinnedMesh) cache = object; });
            const original = cache.geometry.attributes.position.array.slice();
            render();
            const startup = g.snapshot(), resets = [];
            let baseline;
            for (let i = 0; i < 3; i++) {
                const p = g.player;
                p.visual.update(.1, 0, 'fly', 0);
                p.visual.update(.1, .1, 'boost', 40);
                g.input.keys.add('KeyW'); g.input.keys.add('ShiftLeft'); g.input.laser = true;
                g.reset(); render();
                const s = g.snapshot();
                baseline ??= s;
                resets.push({ ...s, clip: g.player.visual.current,
                    pass: !g.running && !g.input.keys.size && !g.input.laser && s.mode === 'ground'
                        && s.heat === 0 && s.kills === 0 && s.effects === 0
                        && ['bodies', 'colliders', 'civilians', 'enemies'].every(key => s[key] === startup[key])
                        // Initial cleanup can release startup-only renderer resources;
                        // all three rebuilt worlds must match, without any increase.
                        && ['geometries', 'textures'].every(key => s[key] === baseline[key] && s[key] <= startup[key])
                        && g.assets.models.get('person') === source
                        && original.every((value, j) => value === cache.geometry.attributes.position.array[j])
                        && g.player.visual.current === source.parser.json.extras.styleProfiles[profile].idle });
            }
            return { profile, method: 'diagnostic transition/input setup followed by real Game.reset; default city and NPCs retained', startup, baseline, resets };
        }, profile);
        reports.push(report); await page.close();
    }
} finally { await browser.close(); }
fs.writeFileSync('.artifacts/animation-style/a1/lifecycle.json', JSON.stringify({ reports, errors }, null, 2));
console.log(JSON.stringify({ reports: reports.map(({ profile, resets }) => ({ profile, checks: resets.map(({ pass, geometries, textures, clip }) => ({ pass, geometries, textures, clip })) })), errors }));
if (errors.length || reports.some(report => report.resets.some(reset => !reset.pass))) process.exitCode = 1;
