import { chromium } from '@playwright/test';
import fs from 'node:fs';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:5173/');
await page.waitForFunction(() => window.game?.player, { timeout: 45000 });
const report = await page.evaluate(() => {
  const g = window.game; g.renderer.setAnimationLoop(null); g.reset(); g.ui.playing(true);
  for (const e of [...g.world.entities.values()]) if (e.person) g.world.remove(e);
  const vector = () => g.player.position.clone();
  const baseline = { bodies: g.physics.world.bodies.len(), colliders: g.physics.world.colliders.len(), joints: g.physics.world.impulseJoints.len() };
  const fixtures = [];
  for (const [kind, x, force] of [['civilian', 0, 12], ['police', 3, 1], ['soldier', -3, 17]]) {
    const e = g.world.spawn(kind, vector().set(x, 0, 14), 0);
    e.person.update(.45, .45, kind === 'civilian' ? 'ground' : 'shoot', 3.5);
    e.person.group.updateMatrixWorld(true);
    const bind = [];
    const points = () => {
      e.person.group.updateMatrixWorld(true);
      const output = [];
      e.person.model.traverse(mesh => {
        if (!mesh.isMesh) return;
        const used = mesh.geometry.index ? [...new Set(mesh.geometry.index.array)] : Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) => i);
        for (const i of used) {
          const point = vector().fromBufferAttribute(mesh.geometry.attributes.position, i);
          if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, point);
          point.applyMatrix4(mesh.matrixWorld); output.push(point);
        }
      }); return output;
    };
    const before = points();
    e.person.model.traverse(bone => { if (bone.isBone && bone.parent?.isBone && bone.parent.name.toLowerCase() !== 'root') bind.push({ bone, length: bone.getWorldPosition(vector()).distanceTo(bone.parent.getWorldPosition(vector())) }); });
    const begin = performance.now();
    g.combat.hit(e, 150, `probe:${kind}`, vector().set(x, 1, 14), vector().set(0, 0, -1), force);
    const constructionMs = performance.now() - begin;
    const after = points(); let transitionJump = 0;
    for (let i = 0; i < before.length; i++) transitionJump = Math.max(transitionJump, before[i].distanceTo(after[i]));
    let pauseResumeJump = 0;
    let floorDepth = 0, maximumJointStretch = 0, stretchedBone = '', deepest = '', groundSamples = 0;
    for (let frame = 0; frame < 360; frame++) {
      g.physics.world.step(); g.world.sync();
      if (frame === 8) {
        g.running = true; g.accumulator = 0; g.previous = 1000; g.frame(1010);
        const paused = points(); g.input.onPause(); g.frame(1060);
        g.input.onResume(); g.previous = 1060; g.frame(1061);
        const resumed = points();
        for (let i = 0; i < paused.length; i++) pauseResumeJump = Math.max(pauseResumeJump, paused[i].distanceTo(resumed[i]));
        g.running = false; g.input.clear();
      }
      if (frame % 12 === 0) {
        const output = points(); groundSamples += output.length;
        for (const point of output) if (point.y < -floorDepth) { floorDepth = -point.y; deepest = point.toArray(); }
        for (const { bone, length } of bind) { const change = Math.abs(bone.getWorldPosition(vector()).distanceTo(bone.parent.getWorldPosition(vector())) - length); if (change > maximumJointStretch) { maximumJointStretch = change; stretchedBone = bone.name; } }
      }
    }
    fixtures.push({ kind, constructionMs, parts: e.ragdoll.parts.size, transitionJump, pauseResumeJump, floorDepth, maximumJointStretch, stretchedBone, deepest, groundSamples, position: e.mesh.position.toArray() });
    if (kind === 'soldier') { window.probedCorpse = e; continue; }
    g.world.remove(e);
  }
  const last = window.probedCorpse;
  g.player.position.set(3, 1, last.mesh.position.z + 6); g.player.previous.copy(g.player.position); g.player.sync(); g.camera.update(2, false);
  g.presentation.render(1 / 60);
  window.finishCorpseProbe = () => {
    g.world.remove(last); return { bodies: g.physics.world.bodies.len(), colliders: g.physics.world.colliders.len(), joints: g.physics.world.impulseJoints.len() };
  };
  return { baseline, fixtures };
});
await page.screenshot({ path: '.artifacts/quality-corpse-after.png' });
report.afterRemoval = await page.evaluate(() => window.finishCorpseProbe());
report.pass = report.fixtures.every(f => f.parts === 15 && f.transitionJump < .001 && f.pauseResumeJump < .001 && f.floorDepth < .025 && f.maximumJointStretch < .035) && JSON.stringify(report.baseline) === JSON.stringify(report.afterRemoval) && !errors.length;
fs.writeFileSync('.artifacts/quality-ragdoll.json', JSON.stringify({ ...report, errors }, null, 2));
console.log(JSON.stringify({ ...report, errors }, null, 2));
await browser.close(); if (!report.pass) process.exitCode = 1;
