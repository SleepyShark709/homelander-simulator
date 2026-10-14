import { chromium } from '@playwright/test';
import fs from 'node:fs';

const browser = await chromium.launch({ channel:'chrome', headless:true, args:['--use-angle=metal'] });
const page = await browser.newPage({viewport:{width:1440,height:900}}), errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5173/');
await page.waitForFunction(()=>window.game?.player,{timeout:45000});
const report = await page.evaluate(()=>{
    const g=window.game;g.renderer.setAnimationLoop(null);let clock=1000;
    const frame=()=>{clock+=1000/60;g.frame(clock);};
    const checks=[];
    const setup=(y=1.16)=>{
        g.reset();for(const e of g.world.alive('civilian'))g.world.remove(e);
        g.running=true;g.input.active=true;g.ui.playing(true);g.previous=clock;g.accumulator=0;
        const p=g.player;p.position.set(0,y,35);p.previous.copy(p.position);p.velocity.set(0,0,0);p.mode=y>2?'fly':'ground';
        p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);g.physics.world.step();p.sync();g.camera.update(2,false);
        const target=g.world.spawn('civilian',p.position.clone().set(y>2?3:0,.18,y>2?35:32.5),0);
        target.nextThink=999;target.goal=target.mesh.position.clone();
        return target;
    };
    let target=setup(), hits=0, p=g.player, onPunch=p.onPunch;
    p.onPunch=()=>{hits++;onPunch();};g.input.punch=true;
    for(let i=0;i<8;i++)frame();const windupDead=target.health.dead;
    for(let i=0;i<37;i++)frame();const holding=p.visual.current;
    for(let i=0;i<45;i++)frame();
    checks.push({name:'stock punch has windup, one contact, and complete recovery',pass:!windupDead&&hits===1&&target.health.dead&&holding==='punch'&&p.visual.current==='idle',data:{windupDead,hits,holding,final:p.visual.current}});
    target=setup();p=g.player;hits=0;onPunch=p.onPunch;p.onPunch=()=>{hits++;onPunch();};g.input.punch=true;
    for(let i=0;i<5;i++)frame();const beforePause=p.punchTime;g.running=false;
    for(let i=0;i<120;i++)frame();const pauseTime=p.punchTime, pauseHits=hits;
    g.running=true;g.previous=clock;for(let i=0;i<70;i++)frame();
    checks.push({name:'pause freezes pending stock attack and resume does not duplicate it',pass:beforePause===pauseTime&&pauseHits===0&&hits===1&&target.health.dead,data:{beforePause,pauseTime,pauseHits,hits}});
    target=setup(65);p=g.player;let slams=0, held=false, groundedClip=false;const onSlam=p.onSlam;
    p.onSlam=point=>{slams++;onSlam(point);};g.input.pressed.add('KeyQ');
    for(let i=0;i<330;i++){
        frame();if(p.mode==='slam'&&p.visual.actions.get('slam').paused)held=true;
        if(p.mode==='ground'&&p.visual.current==='slam')groundedClip=true;
    }
    checks.push({name:'stock ground pound holds in air and completes after one physical landing',pass:held&&groundedClip&&slams===1&&target.health.dead&&p.mode==='ground'&&p.visual.current==='idle',data:{held,groundedClip,slams,dead:target.health.dead,mode:p.mode,clip:p.visual.current}});
    g.running=false;g.input.clear();
    return {checks};
});
fs.writeFileSync('.artifacts/character-game-check.json',JSON.stringify({...report,errors},null,2));
console.log(JSON.stringify({...report,errors},null,2));
await browser.close();
if(errors.length||report.checks.some(c=>!c.pass))process.exitCode=1;
