import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const folder = '.artifacts/director-round/shop-playtest';
fs.mkdirSync(folder,{recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const context = await browser.newContext({viewport:{width:1440,height:900},
    recordVideo:{dir:`${folder}/raw`,size:{width:1440,height:900}}});
const page = await context.newPage(), checks = [], errors = [];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
const check = (name,pass,data) => {checks.push({name,pass:!!pass,data});assert.ok(pass,name);};
const snapshot = () => page.evaluate(()=>window.game.snapshot());
const aim = async point => page.evaluate(([x,y,z])=>{
    const g=window.game;
    for(let i=0;i<12;i++) {
        const d=g.player.position.clone().set(x,y,z).sub(g.camera.camera.position).normalize();
        g.input.yaw=Math.atan2(-d.x,-d.z); g.input.pitch=Math.asin(d.y);g.camera.update(.016,false);
    }
},point);
try {
    await page.goto('http://127.0.0.1:4173/?qa=1');
    await page.waitForFunction(()=>window.game?.world);
    await page.evaluate(()=>{
        const g=window.game;g.reset();const p=g.player;
        p.position.set(36.5,1.2,-24);p.previous.copy(p.position);
        p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);
        g.input.yaw=0;g.input.pitch=-.08;g.camera.update(.016,false);
    });
    await page.locator('#start').click();await page.waitForFunction(()=>window.game.input.active);
    const pane = await page.evaluate(()=>[...window.game.world.entities.values()].find(e=>
        e.kind==='panel'&&Math.abs(e.mesh.position.x-36.5)<.1&&Math.abs(e.mesh.position.z+31.7)<.1)?.id);
    check('existing shop front has a real breakable pane',Number.isInteger(pane),pane);
    await page.keyboard.down('KeyW');await page.waitForTimeout(1700);await page.keyboard.up('KeyW');
    const blocked=await snapshot();
    check('intact glass blocks real W movement',blocked.position[2]>-31.5&&blocked.position[2]<-29,blocked);
    await aim([36.5,2.4,-31.7]);
    await page.mouse.down();await page.waitForTimeout(950);await page.mouse.up();
    const destroyed=await page.evaluate(id=>{
        const g=window.game,e=g.world.entities.get(id);
        return {dead:e.health.dead,visible:e.mesh.visible,registered:g.world.byCollider.has(e.collider.handle),
            frameChildren:e.mesh.children.length,destruction:g.combat.destroyed};
    },pane);
    check('real laser removes glass and its attached frame/collision',destroyed.dead&&!destroyed.visible&&!destroyed.registered&&destroyed.frameChildren===2,destroyed);
    const shards=await page.evaluate(()=>window.game.effects.list.filter(e=>e.mesh.userData.fragmentType==='glass')
        .map(e=>({physical:!!e.mesh.material.isMeshPhysicalMaterial,transparent:e.mesh.material.transparent,
            thickness:e.mesh.geometry.parameters.height,ignored:window.game.physics.ignored.has(e.colliderHandle)})));
    check('broken glazing produces eight thin transparent physical shards',shards.length===8&&shards.every(s=>s.physical&&s.transparent&&s.thickness===.018&&s.ignored),shards);
    // Only aim is prepared; crossing the threshold must happen through W input.
    await page.evaluate(()=>{window.game.input.yaw=0;window.game.input.pitch=-.06;});
    await page.keyboard.down('KeyW');await page.waitForTimeout(1100);await page.keyboard.up('KeyW');
    const inside=await snapshot();
    check('real W crosses the broken storefront and floor step',inside.position[2]<-33.5&&inside.position[1]>1.3,inside);
    await page.screenshot({path:`${folder}/entered.png`});
    await page.keyboard.press('Escape');
    const paused=await snapshot();await page.waitForTimeout(200);
    check('interior pause freezes gameplay',paused.time===(await snapshot()).time,paused);
    await page.locator('#reset').click();
    const props=await page.evaluate(()=>{
        const g=window.game,props=[...g.world.entities.values()].filter(e=>e.mesh.userData.assetKey==='cafeSet');
        const e=props.find(e=>e.mesh.position.x<38&&e.mesh.position.x>30&&e.mesh.position.z>-30);
        const other=props.find(p=>p!==e),sample=o=>{let mesh;o.traverse(m=>{if(!mesh&&m.isMesh)mesh=m;});return mesh.material.color.getHex();};
        const p=g.player;p.position.copy(e.mesh.position).add({x:0,y:1.2,z:2.1});p.previous.copy(p.position);
        p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);
        g.input.yaw=0;g.input.pitch=-.08;g.camera.update(.016,false);
        return {target:e.id,other:other.id,otherColor:sample(other.mesh),position:e.mesh.position.toArray()};
    });
    await page.locator('#start').click();await page.waitForFunction(()=>window.game.input.active);
    await page.evaluate(()=>{const g=window.game;g.input.yaw=0;g.input.pitch=-.08;g.camera.update(.016,false);});
    await page.mouse.down({button:'right'});await page.mouse.up({button:'right'});await page.waitForTimeout(1450);
    const furniture=await page.evaluate(({target,other})=>{
        const g=window.game,a=g.world.entities.get(target),b=g.world.entities.get(other);let sample;
        b.mesh.traverse(m=>{if(!sample&&m.isMesh)sample=m;});
        return {dead:a.health.dead,visible:a.mesh.visible,otherDead:b.health.dead,otherColor:sample.material.color.getHex()};
    },props);
    check('real punch destroys imported furniture without tinting another instance',furniture.dead&&!furniture.visible&&!furniture.otherDead&&furniture.otherColor===props.otherColor,{props,furniture});
    await page.screenshot({path:`${folder}/furniture.png`});
    await page.keyboard.press('Escape');await page.locator('#reset').click();
    const restored=await page.evaluate(()=>{
        const g=window.game;return {props:[...g.world.entities.values()].filter(e=>e.mesh.userData.assetKey).map(e=>
            ({key:e.mesh.userData.assetKey,dead:e.health.dead,visible:e.mesh.visible})),state:g.snapshot()};
    });
    check('menu reset restores all fourteen imported breakable props',restored.props.length===14&&restored.props.every(p=>!p.dead&&p.visible),restored);
    check('no browser errors in shop playthrough',errors.length===0,errors);
} catch(e) {
    errors.push(String(e));process.exitCode=1;await page.screenshot({path:`${folder}/failure.png`});
} finally {
    const video=page.video();await context.close();await video.saveAs(`${folder}/playtest.webm`);await browser.close();
    fs.writeFileSync(`${folder}/report.json`,JSON.stringify({method:'Fixture preparation positions player/aim; actual browser W, left/right mouse, Escape and menu perform all interactions',checks,errors},null,2));
    console.log(JSON.stringify({checks:checks.map(({name,pass})=>({name,pass})),errors}));
}
