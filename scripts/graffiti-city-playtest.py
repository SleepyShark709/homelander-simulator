"""Bounded actual-input city checks and fixed views in the game renderer."""
from pathlib import Path
import argparse
import json
import math
import time
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://127.0.0.1:5196/')
parser.add_argument('--output',default='.artifacts/graffiti-city/game')
args=parser.parse_args();out=Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
checks=[];errors=[];timing={}
def check(name,passed,data=None):
    checks.append({'name':name,'pass':bool(passed),'data':data})
    print(json.dumps({'check':name,'pass':bool(passed)}),flush=True)
    assert passed, name+': '+str(data)

with sync_playwright() as pw:
    browser=pw.chromium.launch(channel='chrome',headless=True,args=['--use-angle=metal'])
    context=browser.new_context(viewport={'width':1440,'height':900},record_video_dir=str(out/'raw'),record_video_size={'width':1440,'height':900})
    page=context.new_page();epoch=time.monotonic()
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
    def state():return page.evaluate('window.game.snapshot()')
    def prepare(x,y,z,yaw=0,mode='ground'):
        page.evaluate('''p=>{const g=window.game,h=g.player;g.inspectionFrozen=false;g.input.clear();
          h.position.set(p.x,p.y,p.z);h.previous.copy(h.position);h.velocity.set(0,0,0);
          h.body.setTranslation(h.position,true);h.body.setNextKinematicTranslation(h.position);h.mode=p.mode;
          g.input.yaw=p.yaw;g.input.pitch=-.08;g.physics.world.step();h.sync();g.camera.update(1,false);}''',dict(x=x,y=y,z=z,yaw=yaw,mode=mode))
    def aim(point):
        page.evaluate('''p=>{const g=window.game;for(let i=0;i<14;i++){
          const d=g.player.position.clone().fromArray(p).sub(g.camera.camera.position).normalize();
          g.input.yaw=Math.atan2(-d.x,-d.z);g.input.pitch=Math.asin(d.y);g.camera.update(.016,false);}}''',point)
    def view(name,position,target):
        page.evaluate('''({position,target})=>{const g=window.game;g.inspectionFrozen=true;
          g.camera.camera.position.fromArray(position);g.camera.camera.lookAt(...target);
          g.camera.camera.updateMatrixWorld(true);g.world.updateScenery(g.camera.camera);g.presentation.render(0);}''',dict(position=position,target=target))
        page.wait_for_timeout(250);page.screenshot(path=str(out/(name+'.png')))
    try:
        started=time.monotonic();page.goto(args.url);page.wait_for_function('window.game?.world',timeout=120000);page.wait_for_load_state('networkidle')
        timing['localLoadSeconds']=time.monotonic()-started
        check('default entrance loads the full city',page.evaluate("window.game.assets.graffitiCity && window.game.world.group.getObjectByName('Graffiti full city').userData.buildings===171"))
        check('twenty civilians and eight original vehicles',page.evaluate("window.game.world.alive('civilian').length===20&&window.game.world.alive('car').length===8"))
        page.locator('#start').click();page.wait_for_function('window.game.input.active');page.wait_for_timeout(1200)
        for name,p,t in [('intersection',[7,3.3,7],[-30,7,-30]),('street-front',[-59,3,-78],[-79,7,-78]),
            ('stairs-front',[39,4.3,57.5],[39,6,39.5]),('city-aerial',[112,73,112],[0,4,0]),('low-flight',[58,19,-14],[28,10,-34])]:view(name,p,t)
        prepare(0,1.1,25);page.wait_for_timeout(350);timing['routeStart']=time.monotonic()-epoch
        before=state()['position'];page.keyboard.down('KeyW');page.wait_for_timeout(2700);page.keyboard.up('KeyW');page.wait_for_timeout(350)
        check('actual walking crosses the original main street',before[2]-state()['position'][2]>12,state())
        page.keyboard.press('KeyF');page.keyboard.down('Space');page.wait_for_timeout(2800);page.keyboard.up('Space')
        check('actual flight rises over city roofs',state()['position'][1]>20,state())
        page.keyboard.down('KeyW');page.keyboard.down('Shift');page.wait_for_timeout(1800);page.keyboard.up('Shift');page.keyboard.up('KeyW')
        page.evaluate('window.game.input.yaw=-Math.PI/2');page.keyboard.down('KeyW');page.wait_for_timeout(1800);page.keyboard.up('KeyW')
        page.keyboard.press('KeyQ');page.wait_for_timeout(2500);timing['routeEnd']=time.monotonic()-epoch
        check('actual Q returns to a street or roof',state()['mode']=='ground',state())
        check('cancelled motion ribbon remains absent',page.evaluate("!window.game.effects.motionTrail&&!window.game.world.group.getObjectByName('continuous-super-speed-trail')"))
        for x,z,yaw in [(-62.8,30,0),(-30,-62.8,-math.pi/2),(62.8,-30,math.pi)]:
            prepare(x,1.26,z,yaw);page.wait_for_timeout(300);before=state()['position']
            page.keyboard.down('KeyW');page.wait_for_timeout(1800);page.keyboard.up('KeyW');page.wait_for_timeout(250)
            after=state()['position']
            check(f'actual walking clears secondary pavement {x},{z}',math.hypot(after[0]-before[0],after[2]-before[2])>8,after)
        prepare(0,1.1,0);page.wait_for_timeout(250);page.keyboard.press('Space');page.wait_for_timeout(300)
        airborne=state()['position'][1];page.wait_for_timeout(1500)
        check('actual ground jump rises and lands',airborne>1.7 and state()['mode']=='ground' and state()['position'][1]<1.5,{'airborne':airborne,'landing':state()})
        roof=page.evaluate('''()=>{const g=window.game,p=g.assets.models.get('graffitiCity').parser.json.extras.graffitiCity.buildings[0];
          const h=g.physics.ray(g.player.position.clone().set(p.position[0],45,p.position[2]),g.player.position.clone().set(0,-1,0),50);
          return {x:p.position[0],z:p.position[2],y:45-h.timeOfImpact}}''')
        prepare(roof['x'],roof['y']+7,roof['z'],mode='fly');page.keyboard.down('ControlLeft')
        page.wait_for_function("window.game.player.mode==='ground'",timeout=10000);page.keyboard.up('ControlLeft');page.wait_for_timeout(600)
        check('actual descending flight lands on an expanded roof',abs(state()['position'][1]-roof['y']-1.1)<.15,state())
        page.screenshot(path=str(out/'roof-landing.png'))
        target=page.evaluate('''()=>{const g=window.game,e=g.world.alive('panel').find(e=>e.mesh.name==='city-courtyard-gate');
          const n=g.player.position.clone().set(0,0,1).applyQuaternion(e.mesh.quaternion);return {id:e.id,p:e.mesh.position.toArray(),n:n.toArray()}}''')
        p,n=target['p'],target['n'];prepare(p[0]+n[0]*2.3,1.1,p[2]+n[2]*2.3,math.atan2(n[0],n[2]))
        page.keyboard.down('KeyW');page.wait_for_timeout(600);page.keyboard.up('KeyW');page.wait_for_timeout(250)
        blocked=state()['position'];signed=(blocked[0]-p[0])*n[0]+(blocked[2]-p[2])*n[2]
        check('intact courtyard gate blocks actual walking',signed>.9,{'signedDistance':signed,'position':blocked})
        aim(p);page.mouse.down();page.wait_for_timeout(900);page.mouse.up()
        check('actual laser removes the gate collider',page.evaluate('id=>{const g=window.game,e=g.world.entities.get(id);return e.health.dead&&!e.mesh.visible&&!g.world.byCollider.has(e.collider.handle)}',target['id']))
        page.evaluate('(yaw)=>{window.game.input.yaw=yaw;window.game.input.pitch=-.08}',math.atan2(n[0],n[2]))
        page.keyboard.down('KeyW');page.wait_for_timeout(650);page.keyboard.up('KeyW');page.wait_for_timeout(250)
        crossed=state()['position'];signed=(crossed[0]-p[0])*n[0]+(crossed[2]-p[2])*n[2]
        check('actual walking crosses the destroyed gate opening',signed<-.9,{'signedDistance':signed,'position':crossed})
        page.screenshot(path=str(out/'broken-gate.png'))
        target=page.evaluate('''()=>{const g=window.game,e=g.world.alive('panel').find(e=>e.mesh.name==='city-shop-glass');
          const n=g.player.position.clone().set(0,0,1).applyQuaternion(e.mesh.quaternion);return {id:e.id,p:e.mesh.position.toArray(),n:n.toArray()}}''')
        p,n=target['p'],target['n'];prepare(p[0]-n[0]*2.6,1.2,p[2]-n[2]*2.6,math.atan2(-n[0],-n[2]))
        aim(p);page.mouse.down();page.wait_for_timeout(1900);page.mouse.up()
        check('actual laser opens the furnished shop glazing',page.evaluate('id=>window.game.world.entities.get(id).health.dead',target['id']))
        page.evaluate('(yaw)=>{window.game.input.yaw=yaw;window.game.input.pitch=-.08}',math.atan2(-n[0],-n[2]))
        page.keyboard.down('KeyW');page.wait_for_timeout(700);page.keyboard.up('KeyW');page.wait_for_timeout(250)
        entered=state()['position'];signed=(entered[0]-p[0])*n[0]+(entered[2]-p[2])*n[2]
        check('actual walking enters the open shop cavity',signed>1,{'signedDistance':signed,'position':entered})
        page.screenshot(path=str(out/'shop-interior.png'))
        cars=page.evaluate('''()=>{const g=window.game;return ['bus','scooter','sedan'].map(name=>{
          const e=g.world.alive('car').find(e=>e.mesh.name===name);
          g.combat.hit(e,350,'city-car-'+name,e.mesh.position.clone(),e.mesh.position.clone().set(1,0,0),17);
          return {name,dead:e.health.dead,velocity:e.body.linvel()};})}''')
        check('three original vehicle models retain damage and rigid-body impulse',all(c['dead'] and c['velocity']['y']>.5 for c in cars),cars)
        pursuit=page.evaluate('''()=>{const g=window.game;g.reset();const p=g.player;
          p.position.set(0,15,0);p.previous.copy(p.position);p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);p.mode='fly';
          g.wanted.heat=100;const e=g.world.spawn('soldier',p.position.clone().set(12,.18,0),0);g.physics.world.step();
          for(let i=0;i<180;i++){g.wanted.action();g.step();}return {shotAt:e.shotAt,state:g.snapshot()};}''')
        check('three-level pursuit reinforces and fires upward',pursuit['shotAt']>0 and pursuit['state']['mode']=='fly' and pursuit['state']['level']==3,pursuit)
        page.keyboard.press('Escape');before=state();page.wait_for_timeout(300)
        check('pause freezes both game clocks',state()['time']==before['time'] and state()['worldTime']==before['worldTime'])
        resets=[]
        for i in range(3):
            page.evaluate('window.game.reset()');page.wait_for_timeout(650);resets.append(state())
        stable=['bodies','colliders','civilians','enemies','geometries','textures']
        check('three resets preserve entities and cached resources',all(all(r[k]==resets[1][k] for k in stable) for r in resets[1:]),resets)
        check('no browser runtime errors',not errors,errors)
    finally:
        (out/'acceptance.json').write_text(json.dumps({'checks':checks,'errors':errors,'timing':timing,
            'scope':'Default full city with current 42-clip shared hero; cancelled MotionTrail remains absent.'},indent=2)+'\n')
        context.close();browser.close()
