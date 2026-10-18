import { chromium } from '@playwright/test';
import fs from 'node:fs';

fs.mkdirSync('.artifacts/cape', { recursive: true });
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
    await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.game?.player?.visual.cape);
    await page.waitForLoadState('networkidle');
    const report=await page.evaluate(async()=>{
        const T=await import('/node_modules/.vite/deps/three.js'),g=window.game;
        g.renderer.setAnimationLoop(null);const render=g.presentation.render.bind(g.presentation);g.presentation.render=()=>{};
        let clock=1000;const checks=[],samples=[];
        const frame=(dt=1/60)=>{clock+=dt*1000;g.frame(clock);};
        const setup=(mode='ground',height=1.03)=>{
            g.reset();const p=g.player;p.mode=mode;p.position.set(0,height,25);p.previous.copy(p.position);
            p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);g.physics.world.step();p.sync();
            g.running=true;g.input.active=true;g.previous=clock;g.accumulator=0;
            return p;
        };
        for(const [name,mode,height,keys] of [
            ['idle','ground',1.03,[]],['walk','ground',1.03,['KeyW']],['sprint','ground',1.03,['KeyW','ShiftLeft']],
            ['flight','fly',40,['KeyW']],['boost','fly',40,['KeyW','ShiftLeft']],
            ['backward','fly',40,['KeyS','ShiftLeft']],['ascend','fly',40,['Space']],
            ['fall','fall',16,[]],['Q landing','fly',16,['KeyQ']],['turn','ground',1.03,['KeyW']],
        ]) {
            const p=setup(mode,height),cape=p.visual.cape;
            for(const key of keys) if(key==='KeyQ')g.input.pressed.add(key);else g.input.keys.add(key);
            let finite=true,pinError=0,stretch=1,renderedStretch=1,bodyPenetration=0,solverPenetration=0,worldPenetration=0,peak;
            for(let i=0;i<150;i++) {
                if(name==='turn')g.input.yaw+=.012;
                if(i===75)g.input.keys.clear();
                frame();
                if(i%6===0) {
                    const s=cape.snapshot();finite&&=s.finite;pinError=Math.max(pinError,s.pinError);
                    if(s.maxStretch>stretch) {
                        stretch=s.maxStretch;
                        if(stretch>2)peak={frame:i,position:p.position.toArray(),link:s.worstLink,
                            points:s.worstLink.map(j=>cape.positions[j].toArray()),
                            colliders:s.worstLink.map(j=>{const hit=g.physics.world.projectPoint(cape.positions[j],false,undefined,undefined,p.collider,undefined,c=>!g.physics.ignored.has(c.handle));
                                return hit&&{inside:hit.isInside,handle:hit.collider.handle,kind:g.world.byCollider.get(hit.collider.handle)?.kind,point:hit.point};})};
                    }
                    bodyPenetration=Math.max(bodyPenetration,s.bodyPenetration);
                    solverPenetration=Math.max(solverPenetration,s.solverPenetration);
                    renderedStretch=Math.max(renderedStretch,s.renderedStretch);
                    p.visual.group.updateMatrixWorld(true);
                    p.visual.model.traverse(mesh=>{
                        if(!mesh.isSkinnedMesh)return;
                        const vertices=[...cape.vertices];
                        for(let j=0;j<vertices.length;j+=29) {
                            const v=mesh.applyBoneTransform(vertices[j],new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertices[j])).applyMatrix4(mesh.matrixWorld);
                            const hit=g.physics.world.projectPoint(v,false,undefined,undefined,p.collider,undefined,c=>!g.physics.ignored.has(c.handle));
                            if(hit?.isInside)worldPenetration=Math.max(worldPenetration,v.distanceTo(hit.point));
                        }
                    });
                }
            }
            checks.push({name:`${name}: finite cloth, attached collar and collision envelope`,
                pass:finite&&pinError<.001&&stretch<2&&renderedStretch<2&&bodyPenetration<.035&&solverPenetration<.035&&worldPenetration<.035,
                finite,pinError,stretch,renderedStretch,bodyPenetration,solverPenetration,worldPenetration,peak});
            samples.push({name,state:p.visual.cape.snapshot()});
        }
        let p=setup('fly',30);g.input.keys.add('KeyW');for(let i=0;i<90;i++)frame();g.running=false;g.input.clear();
        let mesh;p.visual.model.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});
        const before=mesh.geometry.attributes.position.array.slice();for(let i=0;i<120;i++)frame();
        checks.push({name:'pause freezes every geometry value',pass:before.every((n,i)=>n===mesh.geometry.attributes.position.array[i])});
        g.running=true;g.previous=clock;for(let i=0;i<60;i++)frame();
        checks.push({name:'resume keeps cloth finite',pass:p.visual.cape.snapshot().finite});
        const resets=[];
        for(let i=0;i<3;i++) {
            p=setup();g.running=false;g.player.sync();g.presentation.render=render;render();g.presentation.render=()=>{};
            const s=g.snapshot();resets.push({bodies:s.bodies,colliders:s.colliders,civilians:s.civilians,geometries:s.geometries,textures:s.textures});
        }
        checks.push({name:'three resets return to the same entity and GPU resource counts',pass:resets.every(r=>JSON.stringify(r)===JSON.stringify(resets[0])),resets});
        // Keep the actual frame loop for the independent real-time cost sample below.
        g.presentation.render=render;g.running=false;g.input.clear();g.previous=performance.now();
        g.renderer.setAnimationLoop(t=>g.frame(t));
        return {checks,samples};
    });
    if(report.checks.every(c=>c.pass)) {
    await page.locator('#start').click();await page.waitForFunction(()=>window.game.input.active);
    await page.evaluate(()=>{
        window.capePerfActive=true;let previous=performance.now();
        const tick=now=>{
            if(!window.capePerfActive)return;
            const g=window.game;g.input.yaw+=(now-previous)/1000*.8;previous=now;
            if(window.capeStress)g.wanted.action();
            g.input.laser=window.capeStress && g.time%2<1;
            requestAnimationFrame(tick);
        };requestAnimationFrame(tick);
    });
    const timings=[];
    for(const stress of [false,true]) {
        await page.evaluate(stress=>{
            const g=window.game,p=g.player;p.position.set(50,55,30);p.previous.copy(p.position);
            p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);p.mode='fly';
            g.input.clear();g.input.active=true;g.input.keys.add('KeyW');if(stress)g.input.keys.add('ShiftLeft');
            g.wanted.heat=stress?100:0;
            g.input.yaw=0;
            window.capeTimes=[];const cape=p.visual.cape,update=cape.update.bind(cape);
            if(!window.restoreCapeUpdate)window.restoreCapeUpdate=update;
            cape.update=(...args)=>{const t=performance.now();window.restoreCapeUpdate(...args);window.capeTimes.push(performance.now()-t);};
            g.frameTimes=[];window.capeStress=stress;
        },stress);
        await page.waitForTimeout(10000);
        timings.push(await page.evaluate(()=>{
            const percentile=(a,p)=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length*p)];
            const frames=window.game.frameTimes.slice(60),costs=window.capeTimes.slice(60);
            return {stress:window.capeStress,frames:frames.length,frameMedian:percentile(frames,.5),frameP95:percentile(frames,.95),
                capeMedian:percentile(costs,.5),capeP95:percentile(costs,.95),cape:window.game.player.visual.cape.snapshot()};
        }));
    }
    await page.evaluate(()=>window.capePerfActive=false);
    report.checks.push({name:'real-time normal and stress samples stay playable',pass:timings.every(t=>t.frames>100&&t.frameMedian<25&&t.frameP95<40&&t.cape.finite),timings});
    }
    fs.writeFileSync('.artifacts/cape/check.json',JSON.stringify({...report,errors},null,2));
    console.log(JSON.stringify({checks:report.checks,errors},null,2));
    if(errors.length||report.checks.some(c=>!c.pass))process.exitCode=1;
} finally {await browser.close();}
