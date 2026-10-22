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
    const checks=[], idle=clip=>['idle','style_idle_a','style_idle_b'].includes(clip), land=clip=>['land','style_land_from_back'].includes(clip);
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
    checks.push({name:'stock punch has windup, one contact, and complete recovery',pass:!windupDead&&hits===1&&target.health.dead&&holding==='punch'&&idle(p.visual.current),data:{windupDead,hits,holding,final:p.visual.current}});
    target=setup();p=g.player;hits=0;onPunch=p.onPunch;p.onPunch=()=>{hits++;onPunch();};g.input.punch=true;
    for(let i=0;i<5;i++)frame();const beforePause=p.punchTime;g.running=false;
    for(let i=0;i<120;i++)frame();const pauseTime=p.punchTime, pauseHits=hits;
    g.running=true;g.previous=clock;for(let i=0;i<70;i++)frame();
    checks.push({name:'pause freezes pending stock attack and resume does not duplicate it',pass:beforePause===pauseTime&&pauseHits===0&&hits===1&&target.health.dead,data:{beforePause,pauseTime,pauseHits,hits}});
    target=setup(65);p=g.player;let slams=0, held=false, groundedClip=false;const onSlam=p.onSlam;
    p.onSlam=point=>{slams++;onSlam(point);};g.input.pressed.add('KeyQ');
    for(let i=0;i<330;i++){
        frame();if(p.mode==='slam'&&land(p.visual.current)&&p.visual.actions.get(p.visual.current).paused)held=true;
        if(p.mode==='ground'&&land(p.visual.current))groundedClip=true;
    }
    checks.push({name:'stock ground pound holds in air and completes after one physical landing',pass:held&&groundedClip&&slams===1&&target.health.dead&&p.mode==='ground'&&idle(p.visual.current),data:{held,groundedClip,slams,dead:target.health.dead,mode:p.mode,clip:p.visual.current}});
    for(const [key,clip,contacts] of [['KeyE','casual_attack',1],['KeyR','combo_a',4],['KeyT','combo_b',2]]){
        target=setup();p=g.player;let hits=0;const original=p.onPunch;
        p.onPunch=()=>{hits++;original();};g.input.pressed.add(key);
        const frames=Math.ceil((p.visual.actionDuration(clip)+.5)*60);let played=false;
        for(let i=0;i<frames;i++){frame();played||=p.visual.current===clip;}
        checks.push({name:`${key}: ${clip} plays, contacts and recovers`,pass:played&&hits===contacts&&target.health.dead&&idle(p.visual.current),data:{played,hits,contacts,dead:target.health.dead,final:p.visual.current}});
    }
    setup();p=g.player;let comboHits=0;const original=p.onPunch;
    p.onPunch=()=>{comboHits++;original();};g.input.pressed.add('KeyR');
    for(let i=0;i<30;i++)frame();const beforeComboPause={remaining:p.punchTime,hits:comboHits};
    g.running=false;for(let i=0;i<120;i++)frame();
    const comboFrozen=p.punchTime===beforeComboPause.remaining&&comboHits===beforeComboPause.hits;
    g.running=true;g.previous=clock;for(let i=0;i<180;i++)frame();
    checks.push({name:'combo pause preserves all pending contacts without duplication',pass:comboFrozen&&comboHits===4,data:{comboFrozen,comboHits}});
    for(const [key,clip,contacts] of [['KeyE','casual_attack',1],['KeyR','combo_a',4],['KeyT','combo_b',2],[null,'punch',1]]){
        setup();p=g.player;let hits=0;const original=p.onPunch;
        p.onPunch=()=>{hits++;original();};
        const trigger=()=>{if(key)g.input.pressed.add(key);else g.input.punch=true;};
        trigger();for(let i=0;i<3&&!p.punchTime;i++)frame();
        for(let i=0;i<Math.ceil(p.visual.actionDuration(clip)*60)+3&&p.punchTime>1/60;i++)frame();
        const firstHits=hits;
        // Accept the next request in the fixed step that finishes the first attack,
        // without an intervening idle render to reset the action name.
        p.punchTime=1/120;trigger();p.step(1/60);p.sync();p.animate(1/60,g.time);
        const action=p.visual.punchFull,restarted=action.time<.05&&!action.paused&&p.punchTime>p.visual.actionDuration(clip)-.05;
        for(let i=0;i<Math.ceil((p.visual.actionDuration(clip)+.5)*60);i++)frame();
        checks.push({name:`${clip}: consecutive attacks restart both pose and contacts`,pass:restarted&&firstHits===contacts&&hits===contacts*2&&idle(p.visual.current),data:{restarted,firstHits,hits,expected:contacts*2}});
    }
    setup();p=g.player;g.input.laser=true;const poses=[];
    for(let i=0;i<3;i++){g.input.pressed.add('KeyV');for(let f=0;f<20;f++)frame();poses.push(p.visual.current);}
    checks.push({name:'V cycles the three stationary laser poses',pass:poses.join(',')==='laser_hip,laser_back,idle'&&p.visual.eyes.every(e=>e.visible),data:{poses}});
    g.input.laser=false;g.input.pressed.add('KeyF');for(let i=0;i<180;i++)frame();
    checks.push({name:'F still enters genuine hover after laser poses',pass:p.mode==='fly'&&['hover','style_hover_b'].includes(p.visual.current),data:{mode:p.mode,clip:p.visual.current}});
    g.running=false;g.input.clear();
    return {checks};
});
fs.writeFileSync('.artifacts/character-game-check.json',JSON.stringify({...report,errors},null,2));
console.log(JSON.stringify({...report,errors},null,2));
await browser.close();
if(errors.length||report.checks.some(c=>!c.pass))process.exitCode=1;
