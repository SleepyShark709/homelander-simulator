import { chromium } from '@playwright/test';
import fs from 'node:fs';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5173/');
await page.waitForFunction(()=>window.game?.player,{timeout:45000});
const report=await page.evaluate(()=>{
    const g=window.game;g.renderer.setAnimationLoop(null);g.presentation.render=()=>{};
    const checks=[],profiles=[];let clock=1000;
    const setup=(air=false)=>{
        g.reset();for(const e of [...g.world.entities.values()])if(e.person)g.world.remove(e);
        g.running=true;g.input.active=true;g.previous=clock;
        const p=g.player;p.position.set(0,air?25:1.03,45);p.previous.copy(p.position);p.mode=air?'fly':'ground';
        p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);g.physics.world.step();p.sync();
        return p;
    };
    for(const hz of [60,120,144,'uneven']) for(const motion of ['idle','run','sprint','hover','boost']) {
        const air=['hover','boost'].includes(motion),p=setup(air);
        if(['run','sprint','boost'].includes(motion))g.input.keys.add('KeyW');
        if(['sprint','boost'].includes(motion))g.input.keys.add('ShiftLeft');
        let t=0,frames=0,hits=0,started=false,repeat=false,phaseError=0,returnClip=false,maxPose=0,previous;
        const onPunch=p.onPunch;p.onPunch=()=>{hits++;onPunch();};
        const joints=[];p.visual.model.traverse(o=>{if(o.isBone)joints.push(o);});
        while(t<4) {
            const dt=hz==='uneven'?[1/144,1/120,1/30,1/90,1/60][frames%5]:1/hz;
            if(t>.7&&!started){g.input.punch=true;started=true;}
            // Queue a second punch on the final simulation step of the first.
            if(started&&!repeat&&p.punchTime>0&&p.punchTime<=1/60+1e-6){g.input.punch=true;repeat=true;}
            t+=dt;clock+=dt*1000;g.frame(clock);frames++;
            if(p.punchTime>0&&p.visual.punchFull) {
                const expected=Math.max(0,p.visual.actionDuration('punch')-p.punchTime-Math.max(0,p.simulationTime-(g.time-1/60+g.accumulator)));
                phaseError=Math.max(phaseError,Math.abs(p.visual.punchFull.time-expected));
            }
            if(t>3&&p.punchTime===0&&p.visual.current!=='punch')returnClip=true;
            p.visual.group.updateMatrixWorld(true);
            const pose=joints.map(j=>p.visual.group.worldToLocal(j.getWorldPosition(j.position.clone())));
            if(previous)maxPose=Math.max(maxPose,...pose.map((q,j)=>q.distanceTo(previous[j])/dt/120));
            previous=pose;
        }
        profiles.push({hz,motion,hits,repeat,phaseError,returnClip,maxPose,final:p.visual.current});
    }
    checks.push({name:'actual fixed-step attacks hit once per punch, repeat and recover in all movement modes',pass:profiles.every(p=>p.hits===2&&p.repeat&&p.returnClip),profiles});
    checks.push({name:'rendered punch phase follows interpolated simulation time at all refresh rates',pass:profiles.every(p=>p.phaseError<=1/120+1e-5),maxError:Math.max(...profiles.map(p=>p.phaseError))});
    checks.push({name:'actual gameplay attack transitions retain the 0.12 m at 120 Hz continuity limit',pass:profiles.every(p=>p.maxPose<.12),maxNormalizedStep:Math.max(...profiles.map(p=>p.maxPose))});
    const p=setup(true);g.input.punch=true;let hits=0;p.onPunch=()=>hits++;
    for(let i=0;i<6;i++){clock+=1000/120;g.frame(clock);}
    const before={remaining:p.punchTime,phase:p.visual.punchFull.time};g.running=false;
    for(let i=0;i<240;i++){clock+=1000/120;g.frame(clock);}
    const after={remaining:p.punchTime,phase:p.visual.punchFull.time};
    g.running=true;g.previous=clock;
    for(let i=0;i<160;i++){clock+=1000/120;g.frame(clock);}
    checks.push({name:'pausing an airborne attack freezes both layers and preserves one pending hit',pass:before.remaining===after.remaining&&before.phase===after.phase&&hits===1,before,after,hits});
    // A real descent to the street during the punch must still play landing recovery.
    const landing=setup(true);landing.position.y=9.3;landing.previous.copy(landing.position);landing.body.setTranslation(landing.position,true);
    g.input.punch=true;g.input.pressed.add('KeyF');let sawLand=false;
    for(let i=0;i<250;i++){clock+=1000/120;g.frame(clock);if(landing.visual.baseCurrent==='land')sawLand=true;}
    checks.push({name:'an airborne punch can fall, land and return to standing',pass:sawLand&&landing.mode==='ground'&&landing.visual.current==='idle',sawLand,mode:landing.mode,clip:landing.visual.current});
    return {checks};
});
fs.writeFileSync('.artifacts/attack-transitions.json',JSON.stringify({...report,errors},null,2));
console.log(JSON.stringify({checks:report.checks.map(({profiles,...check})=>check),errors},null,2));
await browser.close();
if(errors.length||report.checks.some(c=>!c.pass))process.exitCode=1;
