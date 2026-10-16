import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const folder = '.artifacts/director-round/verification';
fs.mkdirSync(folder, { recursive: true });
const tasks = [
    ['native-character', ['scripts/native-character-check.mjs']],
    ['character-motion', ['scripts/character-motion-check.mjs', 'director']],
    ['running', ['scripts/running-continuity.mjs', 'director']],
    ['character-game', ['scripts/character-game-check.mjs']],
    ['quality-acceptance', ['scripts/quality-acceptance.mjs']],
    ['scene-motion', ['scripts/scene-motion-check.mjs', 'director']],
    ['attack-transitions', ['scripts/attack-transitions.mjs']],
    ['ragdoll', ['scripts/quality-ragdoll.mjs']],
    ['visual-regression', ['scripts/visual-regression.mjs']],
    ['final-smoke', ['scripts/final-smoke.mjs']],
    ['production-input', ['scripts/director-playtest.mjs']],
    ['motion-video', ['scripts/record-scene-upgrade.mjs', 'director']],
];
if (process.env.RUN_PERFORMANCE === '1') tasks.unshift(['soak', ['scripts/performance.mjs', 'director-performance']]);
const results = [];
for (const [name, args] of tasks) {
    const began = Date.now();
    const result = spawnSync(process.execPath, args, {
        encoding: 'utf8', timeout: name === 'soak' ? 750000 : 180000, maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, GAME_URL: 'http://127.0.0.1:4173/?qa=1' },
    });
    fs.writeFileSync(`${folder}/${name}.log`, `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
    results.push({ name, args, exit: result.status, signal: result.signal,
        error: result.error?.message, seconds: (Date.now() - began) / 1000 });
    fs.writeFileSync(`${folder}/results.json`, JSON.stringify(results, null, 2));
    // Each suite has exited before its terminal summary is emitted.
    console.log(name, result.status === 0 ? 'PASS' : 'FAIL');
}
if (results.some(r => r.exit !== 0)) process.exitCode = 1;
