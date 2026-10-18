import { chromium } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const out = '.artifacts/jiangwan';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const recording = process.argv.includes('--record');
const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    ...(recording ? { recordVideo: { dir: `${out}/video`, size: { width: 1600, height: 1000 } } } : {}),
});
const page = await context.newPage();
const errors = [], checks = [], failures = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', r => { if (r.status() >= 400) failures.push({ url: r.url(), status: r.status() }); });
const check = (name, pass, data) => {
    checks.push({ name, pass: !!pass, data });
    assert.ok(pass, `${name}: ${JSON.stringify(data)}`);
};
try {
    await page.goto('http://127.0.0.1:5173');
    await page.waitForFunction(() => window.game?.world, { timeout: 90000 });
    await page.waitForLoadState('networkidle');
    await page.locator('#start').click();
    await page.waitForFunction(() => window.game.input.active);
    await page.keyboard.press('KeyF');
    await page.keyboard.down('Space');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(3400);
    await page.keyboard.up('Space');
    await page.keyboard.up('KeyW');
    const flight = await page.evaluate(() => window.game.snapshot());
    check('real keyboard input flies through the new district', flight.mode === 'fly' && flight.position[1] > 5, flight);
    await page.screenshot({ path: `${out}/gameplay.png` });
    await page.keyboard.press('Escape');
    const paused = await page.evaluate(() => window.game.snapshot());
    await page.waitForTimeout(200);
    check('Escape freezes the new world', !paused.running && paused.time === await page.evaluate(() => window.game.time), paused.time);

    const geometry = await page.evaluate(async () => {
        const T = await import('/node_modules/three/build/three.module.js');
        const g = window.game;
        g.renderer.setAnimationLoop(null);
        g.reset();
        g.ui.playing(true);
        g.physics.world.step();
        const district = g.world.group.getObjectByName('Jiangwan Blender environment');
        district.updateMatrixWorld(true);
        const roofs = [];
        // Clear corners of each actual exported roof; avoid equipment and parapets.
        for (const [x,z,h] of [[-37,-38,21],[-71,-36,33],[-40,-73,15],[-76,-75,25],
            [38,38,22],[73,36,32],[37,74,16],[75,75,27]]) {
            const origin = new T.Vector3(x-7,h+7,z+4), direction = new T.Vector3(0,-1,0);
            const visible = new T.Raycaster(origin,direction).intersectObject(district,true)[0];
            const collision = g.physics.ray(origin,direction,15);
            roofs.push({ x,z,h,visualY:visible?.point.y,physicsY:collision && origin.y-collision.timeOfImpact });
        }
        for (let i=0;i<120;i++) { g.physics.world.step(); g.world.sync(); }
        const vehicles = g.world.alive('car').map(e => {
            const box = new T.Box3().setFromObject(e.mesh), c = e.collider;
            const half = c.halfExtents(), size = box.getSize(new T.Vector3());
            const horizontal = Math.abs(e.mesh.quaternion.y) > .5;
            const hit = g.physics.ray(box.getCenter(new T.Vector3()).add(new T.Vector3(0,5,0)),new T.Vector3(0,-1,0),10);
            return { name:e.mesh.name, minY:box.min.y, size:size.toArray(),
                colliderSize:horizontal ? [half.z*2,half.y*2,half.x*2] : [half.x*2,half.y*2,half.z*2],
                centerError:box.getCenter(new T.Vector3()).distanceTo(new T.Vector3().copy(c.translation())),
                hit:hit?.collider.handle===c.handle };
        });
        return { roofs,vehicles,state:g.snapshot() };
    });
    check('all eight visible roofs have matching physics surfaces', geometry.roofs.every(r => Math.abs(r.visualY-r.h)<.1 && Math.abs(r.physicsY-r.h)<.02), geometry.roofs);
    check('all three vehicle models are present', ['bus','scooter','sedan'].every(n => geometry.vehicles.some(v => v.name===n)), geometry.vehicles);
    check('vehicles rest on the ground and their rotated bounds match colliders', geometry.vehicles.every(v => Math.abs(v.minY)<.035 && v.centerError<.01 && v.hit && v.size.every((n,i)=>Math.abs(n-v.colliderSize[i])<.035)), geometry.vehicles);

    for (const [name,position,target] of [
        ['street',[-4,3,12],[-37,10,-38]],
        ['aerial',[95,78,110],[-15,0,-70]],
        ['rooftop',[-52,27,-19],[-39,22,-40]],
        ['bus',[-63,4,4],[-77,1.3,-7]],
        ['sedan',[-25,2,17],[-32,.8,7]],
        ['scooter',[17,1.8,-2],[13,.65,-7]],
        ['river',[80,60,-255],[155,20,-395]],
    ]) {
        await page.evaluate(({position,target}) => {
            const g = window.game, camera = g.camera.camera;
            camera.position.set(...position); camera.lookAt(...target); camera.updateMatrixWorld(true);
            g.presentation.render();
        }, { position,target });
        await page.locator('#viewport canvas').screenshot({ path: `${out}/${name}.png` });
        if (recording) await page.waitForTimeout(1400);
    }

    const damage = await page.evaluate(() => {
        const g = window.game, result = [];
        for (const name of ['bus','scooter','sedan']) {
            const e = g.world.alive('car').find(e => e.mesh.name===name);
            const cachedMaterial = g.assets.models.get(name).scene.children.find(c=>c.isMesh)?.material;
            const before = cachedMaterial?.roughness;
            g.combat.hit(e,350,`jiangwan-${name}`,e.mesh.position.clone(),e.mesh.position.clone().set(0,0,1),17);
            g.physics.world.step();
            result.push({ name,dead:e.health.dead,velocity:e.body.linvel(),cacheRoughness:cachedMaterial?.roughness,before });
        }
        const panel = g.world.alive('panel')[0];
        g.combat.hit(panel,200,'jiangwan-panel',panel.mesh.position.clone(),panel.mesh.position.clone().set(0,0,1),12);
        return { vehicles:result, panelDead:panel.health.dead,panelCollider:panel.collider.isValid() };
    });
    check('bus, scooter and sedan receive impulses and destruction without mutating cached paint', damage.vehicles.every(v => v.dead && v.velocity.y>.5 && v.cacheRoughness===v.before), damage.vehicles);
    check('existing shop panels still open a real collision gap', damage.panelDead && !damage.panelCollider, damage);

    const punches=await page.evaluate(() => {
        const g=window.game, results=[];
        for (const side of [-1,1]) for (const distance of [1.4,4]) {
            g.reset();
            const bus=g.world.alive('car').find(e=>e.mesh.name==='bus'),p=g.player;
            const axis=p.position.clone().set(0,0,1).applyQuaternion(bus.mesh.quaternion);
            p.position.copy(bus.mesh.position).addScaledVector(axis,side*(bus.collider.halfExtents().z+distance));
            p.position.y=1.16;
            p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);
            g.input.yaw=Math.atan2(side*axis.x,side*axis.z);
            g.physics.world.step();g.combat.punch();
            results.push({side,distance,hp:bus.health.hp});
        }
        return results;
    });
    check('real punch selection hits both bus ends and rejects distant punches', punches.every(p=>p.hp===(p.distance<3?150:300)), punches);

    const resets = [];
    for (let i=0;i<4;i++) {
        resets.push(await page.evaluate(() => {
            const g=window.game;g.reset();g.camera.update(1,false);g.presentation.render();return g.snapshot();
        }));
    }
    const baseline=resets[1];
    check('four resets restore entities and keep geometry, textures and physics stable', resets.slice(1).every(s =>
        s.civilians===20 && s.enemies===0 && s.bodies===baseline.bodies && s.colliders===baseline.colliders &&
        s.geometries===baseline.geometries && s.textures===baseline.textures && s.effects===0), resets);
    check('local models and textures load without browser errors', errors.length===0 && failures.length===0, {errors,failures});
} catch (e) {
    process.exitCode=1;
    console.error(e);
    await page.screenshot({path:`${out}/failure.png`});
} finally {
    fs.writeFileSync(`${out}/validation.json`,JSON.stringify({checks,errors,failures},null,2)+'\n');
    console.log(JSON.stringify(checks.map(c=>({name:c.name,pass:c.pass})),null,2));
    const video=page.video();
    await context.close();
    if (video) await video.saveAs(`${out}/gameplay.webm`);
    await browser.close();
}
