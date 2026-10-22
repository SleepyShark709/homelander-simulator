"""Real Player/KCC animation with a diagnostic flat support; no main-world state edits."""
from pathlib import Path
import json
import base64
from playwright.sync_api import sync_playwright
out=Path('.artifacts/animation-style/a2');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(channel='chrome',headless=True,args=['--use-angle=metal'])
 page=browser.new_page(viewport={'width':1280,'height':900});errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.goto('http://127.0.0.1:5184/');page.wait_for_load_state('networkidle');page.wait_for_function('window.game?.player',timeout=90000)
 report=page.evaluate('''async()=>{
 const T=await import('/node_modules/.vite/deps/three.js'),{Physics,R}=await import('/src/core/Physics.ts'),{Player}=await import('/src/characters/Player.ts'),{CONFIG}=await import('/src/core/config.ts');
 const g=window.game;g.renderer.setAnimationLoop(null);
 const contract=g.assets.models.get('person').parser.json.extras.locomotionContract, reports=[];
 for(const [label,name,speed] of [['jog','jog',CONFIG.walk],['super-speed','jog',CONFIG.sprint]]) {
  const physics=new Physics();physics.world.timestep=1/120;physics.world.createCollider(new R.ColliderDesc(new R.HalfSpace(new T.Vector3(0,1,0))));
  const input={keys:new Set(['KeyW']),pressed:new Set(),yaw:0,pitch:0,laser:false,shift:label==='super-speed',punch:false,take(k){return this.pressed.delete(k)}};
  const group=new T.Group(),p=new Player(physics,g.assets,input,group);p.position.set(0,1.03,0);p.previous.copy(p.position);p.body.setTranslation(p.position,true);p.body.setNextKinematicTranslation(p.position);physics.world.step();
  if(p.visual.cape)p.visual.cape.enabled=false;
  let mesh;p.visual.model.traverse(o=>{if(o.isSkinnedMesh)mesh=o});
  let time=0;const traces=[],segments=[],active=new Map(), captures=[];
  const scene=new T.Scene();scene.background=new T.Color(0x87949f);scene.add(group,new T.HemisphereLight(0xffffff,0x515a5d,3));const light=new T.DirectionalLight(0xffffff,3);light.position.set(3,5,2);scene.add(light);const grid=new T.GridHelper(100,200,0x333333,0x5d6872);grid.position.y=.03;scene.add(grid);const camera=new T.PerspectiveCamera(40,1.5,.1,200);g.renderer.setSize(960,640,false);let previous, maxPoseStep=0;
  const frame=(speed)=>{time+=1/120;p.velocity.set(0,0,-speed);p.step(1/120);physics.world.step();p.sync();p.animate(1/120,time)};
  for(let i=0;i<180;i++)frame(speed);
  for(let i=0;i<360;i++) {
   frame(speed);p.visual.group.updateMatrixWorld(true);
   const action=p.visual.actions.get(name),t=action.time,weights=p.visual.baseWeights;
   if((weights.get(name)??0)<.999)continue;
   const bones=mesh.skeleton.bones.map(b=>b.getWorldPosition(new T.Vector3()).sub(p.visual.group.position));
   if(previous)maxPoseStep=Math.max(maxPoseStep,...bones.map((v,j)=>v.distanceTo(previous[j])));previous=bones;
   const feet={};
   for(const side of ['l','r'])for(const part of ['heel','toe']) {
    const key=side+'/'+part,indices=contract.samples[side][part],sum=new T.Vector3();
    for(const vertex of indices){const pt=new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertex);mesh.applyBoneTransform(vertex,pt).applyMatrix4(mesh.matrixWorld);sum.add(pt)}
    sum.divideScalar(indices.length);feet[key]=sum.toArray();
    const windows=contract.clips[name].supportCandidates[side][part].windows;
    const planted=windows.some(([a,b])=>t>=a&&t<b);
    if(planted) {
     const s=active.get(key);
     if(s){s.path+=Math.hypot(sum.x-s.previous.x,sum.z-s.previous.z);s.previous.copy(sum);s.end=time;s.samples++;}
     else active.set(key,{foot:key,complete:i>0,start:time,end:time,path:0,first:sum.clone(),previous:sum.clone(),samples:1});
    } else if(active.has(key)){const s=active.get(key);segments.push({...s,first:s.first.toArray(),last:s.previous.toArray(),previous:undefined,net:Math.hypot(s.previous.x-s.first.x,s.previous.z-s.first.z)});active.delete(key)}
   }
   if(label==='super-speed' && i<72 && i%6===0){camera.position.copy(p.visual.group.position).add(new T.Vector3(3.8,1.15,0));camera.lookAt(p.visual.group.position.clone().add(new T.Vector3(0,.8,0)));g.renderer.render(scene,camera);captures.push({frame:i,clipTime:t,image:g.renderer.domElement.toDataURL('image/png')});}
   traces.push({time,clipTime:t,position:p.position.toArray(),actualSpeed:p.velocity.length(),rate:action.getEffectiveTimeScale(),feet});
  }
  const stats={};for(const foot of ['l/heel','l/toe','r/heel','r/toe']){const values=segments.filter(s=>s.foot===foot&&s.complete&&s.samples>=3).map(s=>s.path).sort((a,b)=>a-b);stats[foot]={segments:values.length,median:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)],max:values.at(-1)}}
  reports.push({label,name,captures,requestedSpeed:speed,method:'unchanged skin material-point clusters; fixed support windows; complete observed contiguous subsegments; no root or leg correction',stats,maxPoseStep,segments,traces});
  p.visual.dispose();physics.dispose();
 }
 return {method:'diagnostic isolated flat HalfSpace, real Player/KCC and runtime assets; support candidates still require side-view calibration',reports};
}''')
 browser.close();report['errors']=errors
 for entry in report['reports']:
  for shot in entry.pop('captures',[]):
   (out/f"contact-{entry['label']}-{shot['frame']:03}.png").write_bytes(base64.b64decode(shot['image'].split(',')[1]))
 (out/'ground-contact.json').write_text(json.dumps(report,indent=2))
 print(json.dumps({r['label']:r['stats'] for r in report['reports']}))
