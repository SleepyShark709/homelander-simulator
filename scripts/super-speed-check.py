"""Staged NPC/falling-prop diagnostic, then real keyboard input with city retained."""
from pathlib import Path
import json
import sys
from playwright.sync_api import sync_playwright
out=Path(sys.argv[1] if len(sys.argv)>1 else '.artifacts/animation-style/a2');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(channel='chrome',headless=True,args=['--use-angle=metal'])
 context=browser.new_context(viewport={'width':1440,'height':900},record_video_dir=str(out/'video'),record_video_size={'width':1440,'height':900})
 page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.goto('http://127.0.0.1:5184/');page.wait_for_load_state('networkidle');page.wait_for_function('window.game?.player',timeout=90000)
 fixture=page.evaluate('''async()=>{
  const T=await import('/node_modules/.vite/deps/three.js'),g=window.game;
  const people=g.world.alive('civilian').slice(0,4),zs=[14,10,6,2];
  people.forEach((e,i)=>{const p=new T.Vector3(0,1.03,zs[i]);e.body.setTranslation(p,true);e.body.setNextKinematicTranslation(p);e.mesh.position.set(0,.03,zs[i]);e.goal.set(0,0,-70);e.nextThink=1e6;});
  g.physics.world.step();g.world.sync();
  return {ids:people.map(e=>e.id),method:'Only initial NPC arrangement is staged. Default city and other NPCs retained; subsequent motion and attacks use actual keyboard events.'};
 }''')
 page.locator('#start').click();page.wait_for_function('window.game.input.active')
 page.evaluate('''()=>{window.speedRecording={active:true,start:performance.now(),samples:[]};const frame=()=>{const r=window.speedRecording,g=window.game;if(!r.active)return;r.samples.push({t:(performance.now()-r.start)/1000,...g.snapshot(),speed:g.player.velocity.length(),clip:g.player.visual.current,cancelledTrail:!!g.effects.motionTrail||!!g.world.group.getObjectByName('continuous-super-speed-trail'),bloodDrops:g.effects.blood.drops.filter(d=>d.life>0).length,bloodPools:g.effects.blood.pools.filter(p=>p.life>0).length});requestAnimationFrame(frame)};requestAnimationFrame(frame)}''')
 page.wait_for_timeout(1800)
 page.evaluate('''async()=>{const T=await import('/node_modules/.vite/deps/three.js');window.game.effects.fragments(new T.Vector3(2,12,18),0x9faaa9,1)}''')
 page.keyboard.down('KeyW');page.wait_for_timeout(800)
 page.keyboard.down('Shift');page.wait_for_timeout(1100)
 try:
  page.wait_for_function('(ids)=>ids.every(id=>!window.game.world.entities.has(id))',arg=fixture['ids'],timeout=4000)
 except Exception:
  state=page.evaluate('''(ids)=>({samples:window.speedRecording.samples,snapshot:window.game.snapshot(),velocity:window.game.player.velocity.toArray(),input:[...window.game.input.keys],targets:ids.map(id=>{const e=window.game.world.entities.get(id);return {id,position:e?.mesh.position.toArray(),dead:e?.health.dead}})})''',fixture['ids'])
  (out/'speed-failed-state.json').write_text(json.dumps(state,indent=2));page.screenshot(path=str(out/'speed-failed-state.png'));video=page.video;context.close();video.save_as(str(out/'super-speed-failed.webm'));browser.close();raise
 page.screenshot(path=str(out/'super-speed-active.png'))
 page.keyboard.up('Shift');page.keyboard.up('KeyW');page.wait_for_timeout(900)
 page.keyboard.down('KeyS');page.wait_for_timeout(1200);page.keyboard.up('KeyS');page.wait_for_timeout(900)
 page.screenshot(path=str(out/'blood-residue-game.png'))
 page.mouse.down(button='left')
 for keys in [['KeyA'],['KeyD'],['KeyS'],['KeyA','KeyW'],['KeyD','KeyS'],['KeyA','Shift']]:
  for key in keys:page.keyboard.down(key)
  page.wait_for_timeout(1000)
  for key in reversed(keys):page.keyboard.up(key)
 page.mouse.up(button='left');page.wait_for_timeout(500)
 before=page.evaluate('''()=>{const g=window.game;return {...g.snapshot(),life:g.effects.blood.pools.map(p=>p.life)}}''')
 page.keyboard.press('Escape');page.wait_for_timeout(100)
 paused=page.evaluate('''()=>{const g=window.game;return {...g.snapshot(),life:g.effects.blood.pools.map(p=>p.life)}}''')
 page.wait_for_timeout(700)
 after=page.evaluate('''()=>{const g=window.game;return {...g.snapshot(),life:g.effects.blood.pools.map(p=>p.life)}}''')
 page.locator('#start').click();page.wait_for_timeout(1000)
 samples=page.evaluate('''()=>{window.speedRecording.active=false;return window.speedRecording.samples}''')
 resets=[]
 for i in range(3):
  page.keyboard.press('Escape');page.evaluate('window.game.reset()');page.wait_for_timeout(150)
  resets.append(page.evaluate('''()=>({...window.game.snapshot(),pools:window.game.effects.blood.pools.filter(p=>p.life>0).length,drops:window.game.effects.blood.drops.filter(d=>d.life>0).length,keys:window.game.input.keys.size})'''))
 checks=[{'name':'world reaches .05 while player accelerates past 8m/s','pass':any(s['worldScale']<.051 and s['speed']>8 for s in samples)},
 {'name':'cancelled motion ribbon is absent throughout actual input','pass':all(not s['cancelledTrail'] for s in samples)},
 {'name':'four staged people killed and removed','pass':max(s['kills'] for s in samples)>=4},
 {'name':'directional burst and residue both visible','pass':any(s['bloodDrops']>0 and s['bloodPools']>0 for s in samples)},
 {'name':'world restores after Shift release','pass':samples[-1]['worldScale']==1 and not samples[-1]['superSpeed']},
 {'name':'pause freezes both times and effect life','pass':all(paused[k]==after[k] for k in ['time','worldTime','worldScale','superSpeed','position','kills','effects','life'])},
 {'name':'three resets clear both domains and effects','pass':all(s['worldTime']==0 and s['time']==0 and s['worldScale']==1 and s['pools']==0 and s['drops']==0 and s['keys']==0 for s in resets)}]
 report={'fixture':fixture,'checks':checks,'errors':errors,'beforePause':before,'paused':paused,'afterPause':after,'resets':resets,'samples':samples}
 (out/'super-speed-game.json').write_text(json.dumps(report,indent=2))
 video=page.video;context.close();video.save_as(str(out/'super-speed-game.webm'));browser.close()
 print(json.dumps({'checks':checks,'errors':errors}))
 if errors or not all(c['pass'] for c in checks):raise SystemExit(1)
