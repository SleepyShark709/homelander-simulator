"""Actual mouse/keyboard turn, pause and interruption footage in the default city."""
from pathlib import Path
import json
import math
from playwright.sync_api import sync_playwright
out=Path('.artifacts/animation-style/a2');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(channel='chrome',headless=True,args=['--use-angle=metal'])
 context=browser.new_context(viewport={'width':1440,'height':900},record_video_dir=str(out/'turn-video'),record_video_size={'width':1440,'height':900})
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:5184/');page.wait_for_load_state('networkidle');page.wait_for_function('window.game?.player')
 page.locator('#start').click();page.wait_for_function('window.game.input.active')
 page.mouse.move(721,450);page.mouse.move(720,450);mouse_x=720
 page.evaluate('''()=>{window.turnRecording={active:true,stage:'idle',start:performance.now(),samples:[]};const frame=()=>{const r=window.turnRecording,g=window.game,p=g.player;if(!r.active)return;r.samples.push({t:(performance.now()-r.start)/1000,stage:r.stage,time:g.time,clip:p.visual.current,phase:p.visual.actions.get(p.visual.current)?.time,yaw:p.visual.group.rotation.y,inputYaw:g.input.yaw,position:p.position.toArray(),running:g.running,speed:p.velocity.length()});requestAnimationFrame(frame)};requestAnimationFrame(frame)}''')
 def stage(name):page.evaluate('(name)=>window.turnRecording.stage=name',name)
 def rotate(direction):
  global mouse_x
  state=page.evaluate('''()=>({heading:window.game.player.visual.group.rotation.y,yaw:window.game.input.yaw})''')
  error=(state['heading']-math.pi-state['yaw']+math.pi)%(2*math.pi)-math.pi
  mouse_x-=(error+direction*1.4)/.0022
  page.mouse.move(mouse_x,450,steps=18)
  page.wait_for_function('(clip)=>window.game.player.visual.current===clip',arg='turn_l' if direction>0 else 'turn_r',timeout=3000)
 def snapshot():return page.evaluate('''()=>{const g=window.game,p=g.player;return {time:g.time,phase:p.visual.actions.get(p.visual.current)?.time,yaw:p.visual.group.rotation.y,position:p.position.toArray()}}''')
 page.wait_for_timeout(500)
 page.wait_for_function('''()=>!window.game.player.visual.current.startsWith('turn_')&&['turn_l','turn_r'].every(name=>{const a=window.game.player.visual.actions.get(name);return !a.isScheduled()||a.getEffectiveWeight()<.001})''',timeout=5000)
 origin=snapshot()
 stage('left / pause');rotate(1);page.wait_for_timeout(160)
 page.keyboard.press('Escape');page.wait_for_timeout(80);paused=snapshot();page.wait_for_timeout(400);after=snapshot()
 page.locator('#start').click();page.mouse.move(721,450);page.mouse.move(720,450);mouse_x=720;page.wait_for_timeout(1500);left=snapshot();page.screenshot(path=str(out/'turn-left-game.png'))
 stage('right complete');rotate(-1);page.wait_for_timeout(1800);right=snapshot();page.screenshot(path=str(out/'turn-right-game.png'))
 stage('left interrupted by movement');rotate(1);page.wait_for_timeout(160)
 page.keyboard.down('KeyW');page.wait_for_timeout(700);page.keyboard.up('KeyW');page.wait_for_timeout(800)
 stage('right interrupted by punch');rotate(-1);page.wait_for_timeout(160);page.mouse.down(button='right');page.mouse.up(button='right');page.wait_for_timeout(1300)
 stage('settle');page.wait_for_timeout(700)
 samples=page.evaluate('''()=>{window.turnRecording.active=false;return window.turnRecording.samples}''')
 checks=[{'name':'left and right captured clips observed with actual mouse movement','pass':all(any(s['clip']=='turn_'+side for s in samples) for side in ['l','r'])},
 {'name':'standing turn does not translate the physical player','pass':all(abs(left['position'][i]-origin['position'][i])<.001 and abs(right['position'][i]-origin['position'][i])<.001 for i in [0,2])},
 {'name':'left and right both change the heading and retain it after completion','pass':left['yaw']>origin['yaw']+1 and right['yaw']<left['yaw']-1},
 {'name':'pause freezes turn time, heading and position','pass':paused==after},
 {'name':'movement interrupts immediately and retains responsive motion','pass':any(s['stage']=='left interrupted by movement' and s['speed']>5 and not s['clip'].startswith('turn_') for s in samples)},
 {'name':'punch interrupts the turn and recovers','pass':any(s['stage']=='right interrupted by punch' and s['clip']=='punch' for s in samples) and samples[-1]['clip'].startswith('style_idle_')}]
 report={'method':'actual Playwright mouse/keyboard events; default city and NPCs; no pose, direction or coordinate writes','checks':checks,'errors':errors,'origin':origin,'left':left,'right':right,'paused':paused,'after':after,'samples':samples}
 (out/'standing-turn-game.json').write_text(json.dumps(report,indent=2));video=page.video;context.close();video.save_as(str(out/'standing-turn-game.webm'));browser.close()
 print(json.dumps({'checks':checks,'errors':errors}))
 if errors or not all(c['pass'] for c in checks):raise SystemExit(1)
