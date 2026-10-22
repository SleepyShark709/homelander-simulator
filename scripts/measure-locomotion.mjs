// Offline measurement of unchanged stock locomotion. Contact candidates require
// side-view calibration before being used as a visual acceptance result.
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as T from 'three';
import { loadModel } from '../tests/helpers/load-model.ts';
const source=process.argv[3]??'public/assets/human/homelander.glb', asset=await loadModel(source);
let mesh; asset.scene.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});
asset.scene.updateMatrixWorld(true);
const positions=mesh.geometry.attributes.position, skinIndex=mesh.geometry.attributes.skinIndex, skinWeight=mesh.geometry.attributes.skinWeight;
const samples={};
for(const side of ['l','r']) {
    const footBones=new Set(mesh.skeleton.bones.map((b,i)=>b.name===`foot${side}` || b.name.startsWith(`toes_01${side}`) ? i : -1)); footBones.delete(-1);
    const candidates=[];
    for(let i=0;i<positions.count;i++) {
        let weight=0; for(let j=0;j<4;j++) if(footBones.has(skinIndex.getComponent(i,j)))weight+=skinWeight.getComponent(i,j);
        if(weight>.6 && positions.getY(i)<.13)candidates.push(i);
    }
    if(!candidates.length)throw new Error(`No sole skin: ${side}`);
    const minZ=Math.min(...candidates.map(i=>positions.getZ(i))),maxZ=Math.max(...candidates.map(i=>positions.getZ(i)));
    samples[side]={};
    for(const [part,front] of [['heel',false],['toe',true]]) {
        const subset=candidates.filter(i=>front ? positions.getZ(i)>maxZ-(maxZ-minZ)*.2 : positions.getZ(i)<minZ+(maxZ-minZ)*.2)
            .sort((a,b)=>positions.getY(a)-positions.getY(b)).slice(0,6);
        samples[side][part]=subset;
    }
}
const mixer=new T.AnimationMixer(asset.scene), clips={};
for(const name of (process.argv[4]?.split(',')??['walk','jog','sprint'])) {
    mixer.stopAllAction(); const clip=asset.animations.find(c=>c.name===name), action=mixer.clipAction(clip).play();
    const frames=[], duration=clip.duration, direction=asset.parser.json.extras.locomotion[name].direction??[0,1];
    for(let i=0;i<=Math.round(duration*120);i++) {
        const time=i/120; action.time=time%duration; mixer.update(0);asset.scene.updateMatrixWorld(true);
        const feet={};
        for(const side of ['l','r']) {
            feet[side]={};
            for(const part of ['heel','toe']) {
                const sum=new T.Vector3();
                for(const vertex of samples[side][part]) {
                    const point=new T.Vector3().fromBufferAttribute(positions,vertex);mesh.applyBoneTransform(vertex,point).applyMatrix4(mesh.matrixWorld);sum.add(point);
                }
                feet[side][part]=sum.divideScalar(samples[side][part].length).toArray();
            }
        }
        frames.push({time,feet});
    }
    const contacts={};
    for(const side of ['l','r']) {
        contacts[side]={};
        for(const part of ['heel','toe']) {
            const low=Math.min(...frames.map(f=>f.feet[side][part][1])),windows=[];
            let start;
            for(let i=0;i<frames.length-1;i++) {
                const p=frames[i].feet[side][part],q=frames[i+1].feet[side][part], planted=p[1]<low+.025 && ((q[0]-p[0])*direction[0]+(q[2]-p[2])*direction[1])*120<-.2;
                if(planted && start===undefined)start=i;
                if(!planted && start!==undefined) {if(i-start>=3)windows.push([start/120,i/120]);start=undefined;}
            }
            if(start!==undefined)windows.push([start/120,duration]);
            const speeds=windows.flatMap(([a,b])=>frames.filter(f=>f.time>=a && f.time<b-1/120).map(f=>{const i=Math.round(f.time*120),p=f.feet[side][part],q=frames[i+1].feet[side][part];return -((q[0]-p[0])*direction[0]+(q[2]-p[2])*direction[1])*120;}));
            contacts[side][part]={windows,naturalSpeed:speeds.reduce((a,b)=>a+b,0)/Math.max(1,speeds.length)};
        }
    }
    clips[name]={duration,contacts,frames};
}
const report={source,sha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),method:'fixed skin vertex clusters; near-lowest height and backward material-point motion; candidate windows pending visual calibration',samples,clips};
const out=process.argv[2]??'.artifacts/animation-style/a2/locomotion-measurement.json';fs.mkdirSync(new URL('.',`file://${process.cwd()}/${out}`).pathname,{recursive:true});
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(clips).map(([n,c])=>[n,{duration:c.duration,contacts:c.contacts}]))));
