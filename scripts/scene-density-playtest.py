"""Actual input walkthrough plus bounded scene interaction/lifecycle checks."""
from pathlib import Path
import argparse
import json
import math
import time
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:5182/')
parser.add_argument('--output', default='.artifacts/scene-density/playtest')
args = parser.parse_args()
folder=Path(args.output);folder.mkdir(parents=True,exist_ok=True)
checks=[];errors=[];timeline={}
def check(name, passed, data=None):
    checks.append({'name':name,'pass':bool(passed),'data':data})
    print(json.dumps({'check':name,'pass':bool(passed)}),flush=True)
    assert passed, name+': '+str(data)

with sync_playwright() as pw:
    browser=pw.chromium.launch(channel='chrome',headless=True,args=['--use-angle=metal'])
    context=browser.new_context(viewport={'width':1440,'height':900},record_video_dir=str(folder/'raw'),record_video_size={'width':1440,'height':900})
    page=context.new_page()
    video_epoch=time.monotonic()
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.on('console',lambda m: errors.append(m.text) if m.type=='error' else None)
    def state(): return page.evaluate('window.game.snapshot()')
    def prepare(x,y,z,mode='ground',yaw=0):
        page.evaluate('''({x,y,z,mode,yaw})=>{const g=window.game,p=g.player;
          g.input.clear();p.position.set(x,y,z);p.previous.copy(p.position);p.velocity.set(0,0,0);
          p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);p.mode=mode;
          g.input.yaw=yaw;g.input.pitch=-.08;g.physics.world.step();p.sync();g.camera.update(1,false);
        }''',dict(x=x,y=y,z=z,mode=mode,yaw=yaw))
    def move_to(x,z,sprint=False,timeout=20):
        start=time.monotonic()
        page.keyboard.down('KeyW')
        if sprint: page.keyboard.down('Shift')
        while time.monotonic()-start<timeout:
            pos=state()['position'];dx=x-pos[0];dz=z-pos[2]
            if sprint and math.hypot(dx,dz)<8:
                page.keyboard.up('Shift');sprint=False
            if math.hypot(dx,dz)<(3.3 if state()['mode']=='fly' else .85): break
            page.evaluate('(yaw)=>{window.game.input.yaw=yaw}',math.atan2(-dx,-dz))
            page.wait_for_timeout(75)
        page.keyboard.up('KeyW')
        if sprint: page.keyboard.up('Shift')
        page.wait_for_timeout(350)
        pos=state()['position']
        check(f'actual input reaches {x},{z}',math.hypot(pos[0]-x,pos[2]-z)<2.1,pos)
    def aim(point):
        page.evaluate('''([x,y,z])=>{const g=window.game;for(let i=0;i<14;i++){
          const d=g.player.position.clone().set(x,y,z).sub(g.camera.camera.position).normalize();
          g.input.yaw=Math.atan2(-d.x,-d.z);g.input.pitch=Math.asin(d.y);g.camera.update(.016,false);}}''',point)
    try:
        page.goto(args.url);page.wait_for_function('window.game?.world',timeout=90000);page.wait_for_load_state('networkidle')
        geometry=page.evaluate('''async()=>{
          const T=await import('/node_modules/three/build/three.module.js'),g=window.game;
          g.physics.world.step();g.world.group.updateMatrixWorld(true);
          const scene=g.world.group.getObjectByName('Density 66m street sample'),roofs=[];
          for(const [x,z,h] of [[-85,-27,16.26],[-70,-25,22.26],[-43,-26,22.26],[-22,-24,16.26],
            [-84,26,25.26],[-68,24,16.26],[-45,26,19.26],[-22,25,19.26]]){
            const o=new T.Vector3(x,h+8,z),d=new T.Vector3(0,-1,0);
            const visual=new T.Raycaster(o,d).intersectObject(scene,true)[0],physical=g.physics.ray(o,d,12);
            roofs.push({x,z,h,visual:visual?.point.y,physical:physical&&o.y-physical.timeOfImpact});
          }
          const props=g.world.alive('prop').filter(e=>e.mesh.name.startsWith('sample-')&&
            ['seating','bin','cafeSet','pottedPlant','tree'].some(k=>e.mesh.name==='sample-'+k)).map(e=>
            ({name:e.mesh.name,minY:new T.Box3().setFromObject(e.mesh).min.y}));
          return {roofs,props};}''')
        check('eight sample roofs have matching visible and physical landing surfaces',all(
            r['visual'] is not None and r['physical'] is not None and abs(r['visual']-r['h'])<.02 and abs(r['physical']-r['h'])<.02 for r in geometry['roofs']),geometry['roofs'])
        check('nearby furnishings share the raised pavement plane',all(abs(p['minY']-.16)<.015 for p in geometry['props']),geometry['props'])
        prepare(-90,1.26,12,yaw=-math.pi/2)
        await_start=page.locator('#start');await_start.click();page.wait_for_function('window.game.input.active')
        timeline['routeStartSeconds']=time.monotonic()-video_epoch
        move_to(-73,12);move_to(-59,12,True);move_to(-36.5,12)
        # Use the crossing west of the sedan and take off from the open road.
        move_to(-36.5,0);move_to(-30.5,0)
        page.keyboard.press('KeyF');page.keyboard.down('Space')
        page.wait_for_function('window.game.player.position.y>12',timeout=10000)
        page.keyboard.up('Space');page.wait_for_timeout(400)
        move_to(-30.5,-26)
        page.screenshot(path=str(folder/'alley.png'))
        move_to(-30.5,-54);move_to(-58,-54)
        page.screenshot(path=str(folder/'low-flight.png'))
        page.keyboard.down('Space');page.wait_for_function('window.game.player.position.y>29',timeout=10000)
        page.keyboard.up('Space');move_to(-70,-25)
        page.keyboard.down('ControlLeft');page.wait_for_function("window.game.player.mode==='ground'",timeout=10000)
        page.keyboard.up('ControlLeft');page.wait_for_timeout(600)
        roof=state();check('real descending flight lands on the sample roof',21<roof['position'][1]<25,roof)
        page.screenshot(path=str(folder/'roof-landing.png'))
        page.keyboard.press('KeyF');page.keyboard.down('Space');page.wait_for_timeout(1400);page.keyboard.up('Space')
        move_to(-58,0)
        page.keyboard.down('ControlLeft');page.wait_for_function("window.game.player.mode==='ground'",timeout=12000)
        page.keyboard.up('ControlLeft');page.wait_for_timeout(600)
        check('continuous route returns to the street',state()['position'][1]<2,state())
        move_to(-36.5,0);move_to(-36.5,12);move_to(-36.5,30);move_to(-36.5,48);move_to(-36.5,12)
        page.screenshot(path=str(folder/'campus-walk.png'))
        timeline['routeEndSeconds']=time.monotonic()-video_epoch
        page.keyboard.press('Escape');before=state();page.wait_for_timeout(200)
        check('pause freezes the scene clock',state()['time']==before['time'],before)
        # New fixture starts the real storefront interaction; no teleport is used
        # within the continuous route above or while crossing a destroyed pane.
        prepare(-35,1.26,-12,yaw=0)
        page.locator('#start').click();page.wait_for_function('window.game.input.active')
        target=page.evaluate('''()=>{const g=window.game,e=g.world.alive('panel').find(e=>e.mesh.name==='sample-shop-glazing'&&Math.abs(e.mesh.position.x+35)<.2&&e.mesh.position.z<0);return {id:e.id,p:e.mesh.position.toArray()}}''')
        page.keyboard.down('KeyW');page.wait_for_timeout(1600);page.keyboard.up('KeyW');page.wait_for_timeout(200)
        blocked=state();check('intact glass blocks actual movement',-17.15<blocked['position'][2]<-16.5,blocked)
        aim(target['p']);page.mouse.down();page.wait_for_timeout(1100);page.mouse.up()
        broken=page.evaluate('''id=>{const g=window.game,e=g.world.entities.get(id);return {dead:e.health.dead,visible:e.mesh.visible,collision:g.world.byCollider.has(e.collider.handle)}}''',target['id'])
        check('actual laser removes glass and collision',broken['dead'] and not broken['visible'] and not broken['collision'],broken)
        page.evaluate('()=>{window.game.input.yaw=0;window.game.input.pitch=-.08}')
        page.keyboard.down('KeyW');page.wait_for_timeout(1200);page.keyboard.up('KeyW');page.wait_for_timeout(200)
        check('actual movement crosses the destroyed shopfront',state()['position'][2]<-20,state())
        page.screenshot(path=str(folder/'broken-shop.png'))
        page.keyboard.press('Escape');prepare(-88,1.26,13.6,yaw=math.pi)
        bench=page.evaluate("window.game.world.alive('prop').find(e=>e.mesh.name==='sample-seating'&&Math.abs(e.mesh.position.x+88)<.1).id")
        page.locator('#start').click();page.wait_for_function('window.game.input.active')
        page.mouse.down(button='right');page.mouse.up(button='right');page.wait_for_timeout(1500)
        punched=page.evaluate('id=>{const e=window.game.world.entities.get(id);return {dead:e.health.dead,visible:e.mesh.visible}}',bench)
        check('actual right-click punch destroys the imported street seat',punched['dead'] and not punched['visible'],punched)
        # Damage all new prop categories through the real combat hit path and
        # compare a second instance/cached material before/after.
        damage=page.evaluate('''()=>{const g=window.game,result=[];
          const color=o=>{let mesh;o.traverse(c=>{if(!mesh&&c.isMesh)mesh=c});return mesh.material.color?.getHex()};
          for(const name of ['sample-seating','sample-aircon','sample-bin','sample-pottedPlant','sample-tree']){
            const list=g.world.alive('prop').filter(e=>e.mesh.name===name),e=list[0],other=list[1],before=other&&color(other.mesh);
            g.combat.hit(e,200,'sample-'+name,e.mesh.position.clone(),e.mesh.position.clone().set(0,0,1),10);
            result.push({name,dead:e.health.dead,hidden:!e.mesh.visible,otherUnchanged:!other||(!other.health.dead&&color(other.mesh)===before)});
          }
          const gate=g.world.alive('panel').find(e=>e.mesh.name==='sample-service-panel');
          g.combat.hit(gate,200,'sample-gate',gate.mesh.position.clone(),gate.mesh.position.clone().set(0,0,1),10);
          return {props:result,gateRemoved:!gate.collider.isValid()};}''')
        check('new props support damage with isolated instance state',all(p['dead'] and p['hidden'] and p['otherUnchanged'] for p in damage['props']),damage)
        check('service panel opens the side lane',damage['gateRemoved'],damage)
        cars=page.evaluate('''()=>{const g=window.game;return ['bus','scooter','sedan'].map(name=>{
          const e=g.world.alive('car').find(e=>e.mesh.name===name);
          g.combat.hit(e,350,'sample-car-'+name,e.mesh.position.clone(),e.mesh.position.clone().set(1,0,0),17);
          return {name,dead:e.health.dead,velocity:e.body.linvel()};})}''')
        check('all three existing vehicle models retain damage and physics',all(c['dead'] and c['velocity']['y']>.5 for c in cars),cars)
        pursuit=page.evaluate('''()=>{const g=window.game;g.reset();const p=g.player;
          p.position.set(0,15,0);p.previous.copy(p.position);p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);p.mode='fly';
          g.wanted.heat=100;const e=g.world.spawn('soldier',p.position.clone().set(12,.18,0),0);g.physics.world.step();
          for(let i=0;i<180;i++){g.wanted.action();g.step();}
          return {shotAt:e.shotAt,state:g.snapshot()};}''')
        check('existing pursuit still shoots upward across the new street layout',pursuit['shotAt']>0 and pursuit['state']['mode']=='fly' and pursuit['state']['level']==3,pursuit)
        page.keyboard.press('Escape')
        resets=[]
        for _ in range(3):
            page.locator('#reset').click();page.wait_for_timeout(150)
            page.evaluate('()=>{window.game.presentation.render()}');resets.append(state())
        a=resets[0]
        check('three menu resets restore physics, entities and render resources',all(
            s['civilians']==20 and s['enemies']==0 and s['effects']==0 and all(s[k]==a[k] for k in ['bodies','colliders','geometries','textures']) for s in resets),resets)
        check('no browser runtime errors',not errors,errors)
    except Exception as e:
        errors.append(str(e));page.screenshot(path=str(folder/'failure.png'))
    finally:
        video=page.video;context.close();video.save_as(str(folder/'playtest.webm'));browser.close()
        (folder/'report.json').write_text(json.dumps({'method':'Actual keyboard route and laser; fixture placement only before route and separate interaction cases; camera yaw follows route targets; direct combat.hit separately labelled for category coverage','timeline':timeline,'checks':checks,'errors':errors},indent=2)+'\n')
print(json.dumps({'checks':[{k:c[k] for k in ['name','pass']} for c in checks],'errors':errors}))
if errors: raise SystemExit(1)
