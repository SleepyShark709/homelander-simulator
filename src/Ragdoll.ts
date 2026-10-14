import * as T from 'three';
import { Physics, R, vec } from './Physics';
import type { PersonVisual } from './PersonVisual';
import { CONFIG } from './config';

type PartName='pelvis'|'chest'|'head'|`upperarm_${'l'|'r'}`|`lowerarm_${'l'|'r'}`|`hand_${'l'|'r'}`|`thigh_${'l'|'r'}`|`calf_${'l'|'r'}`|`foot_${'l'|'r'}`;
type Part={name:PartName;body:R.RigidBody;collider:R.Collider;position:T.Vector3;previous:T.Vector3;rotation:T.Quaternion;previousRotation:T.Quaternion};
type Binding={bone:T.Bone;part:Part;position:T.Vector3;rotation:T.Quaternion};
const sampled=new WeakMap<T.BufferGeometry,Map<PartName,number[]>>();
const directions:T.Vector3[]=[];
for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)if(x||y||z)directions.push(new T.Vector3(x,y,z));
function region(name:string):PartName {
    if(name.startsWith('head')||name.startsWith('neck'))return 'head';
    if(name==='spine_02'||name==='spine_03'||name.startsWith('clavicle'))return 'chest';
    const side=name.endsWith('_l')?'l':'r';
    for(const part of ['upperarm','lowerarm','hand','thigh','calf','foot'] as const)if(name.startsWith(part))return `${part}_${side}`;
    if(name.startsWith('ball'))return `foot_${side}`;
    if(name.startsWith('thumb')||name.startsWith('index')||name.startsWith('middle')||name.startsWith('ring')||name.startsWith('pinky'))return `hand_${side}`;
    return 'pelvis';
}
function collisionSamples(mesh:T.SkinnedMesh) {
    const geometry=mesh.geometry,cached=sampled.get(geometry);if(cached)return cached;
    const points=geometry.attributes.position,weights=geometry.attributes.skinWeight,joints=geometry.attributes.skinIndex;
    const sets=new Map<PartName,{indices:number[]; extrema:number[];values:number[]}>();
    const used=geometry.index ? new Set(geometry.index.array) : new Set(Array.from({length:points.count},(_,i)=>i));
    for(const i of used) {
        let best=0;for(let j=1;j<4;j++)if(weights.getComponent(i,j)>weights.getComponent(i,best))best=j;
        const name=region(mesh.skeleton.bones[joints.getComponent(i,best)].name);
        const group=sets.get(name)??{indices:[],extrema:Array(26).fill(i),values:Array(26).fill(-Infinity)};sets.set(name,group);
        const x=points.getX(i),y=points.getY(i),z=points.getZ(i);
        for(let d=0;d<26;d++) {
            const v=directions[d],value=x*v.x+y*v.y+z*v.z;
            if(value>group.values[d]){group.values[d]=value;group.extrema[d]=i;}
        }
    }
    const result=new Map<PartName,number[]>();for(const [name,group] of sets)result.set(name,[...new Set(group.extrema)]);
    sampled.set(geometry,result);return result;
}
export function prewarmRagdolls(model:T.Object3D) {model.traverse(o=>{if(o instanceof T.SkinnedMesh)collisionSamples(o);});}

/** Physics bodies are fitted to the struck pose, including clothes and accessories. */
export class Ragdoll {
    parts=new Map<PartName,Part>();
    bindings:Binding[]=[];
    root:Part;
    private renderAlpha=1;
    constructor(private physics:Physics,private person:PersonVisual,velocity:T.Vector3,angular:T.Vector3) {
        person.mixer.timeScale=0;person.group.updateMatrixWorld(true);
        const skeleton: T.Bone[]=[];person.model.traverse(o=>{if(o instanceof T.Bone)skeleton.push(o);});
        const clouds=new Map<PartName,T.Vector3[]>();
        const add=(name:PartName,p:T.Vector3)=>{const points=clouds.get(name)??[];points.push(p);clouds.set(name,points);};
        person.model.traverse(o=>{
            if(!(o instanceof T.Mesh))return;
            if(o instanceof T.SkinnedMesh) {
                for(const [name,indices] of collisionSamples(o))for(const i of indices) {
                    const p=new T.Vector3().fromBufferAttribute(o.geometry.attributes.position,i);o.applyBoneTransform(i,p).applyMatrix4(o.matrixWorld);add(name,p);
                }
            } else {
                let parent:T.Object3D|null=o.parent;while(parent && !(parent instanceof T.Bone))parent=parent.parent;
                if(!parent)return;const name=region(parent.name),positions=o.geometry.attributes.position;
                // Small rigid attachments (hair, eyes, helmet and weapon) belong to
                // their attached body part and cannot pass through the street.
                for(let i=0;i<positions.count;i+=Math.max(1,Math.floor(positions.count/80)))add(name,new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld));
            }
        });
        const mainBone=(name:PartName)=>person.model.getObjectByName(name==='chest'?'spine_03':name)!;
        const masses:Record<string,number>={pelvis:9,chest:20,head:5,upperarm:2,lowerarm:1.3,hand:.6,thigh:5,calf:3,foot:1};
        for(const [name,points] of clouds) {
            const center=new T.Vector3();points.forEach(p=>center.add(p));center.multiplyScalar(1/points.length);
            const rotation=mainBone(name).getWorldQuaternion(new T.Quaternion()),inverse=rotation.clone().invert();
            const local=new Float32Array(points.flatMap(p=>p.clone().sub(center).applyQuaternion(inverse).toArray()));
            const descriptor=R.ColliderDesc.roundConvexHull(local,CONFIG.ragdollMargin);
            if(!descriptor)throw new Error(`身体碰撞轮廓生成失败：${name}`);
            const body=physics.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(center.x,center.y,center.z).setRotation(rotation).setLinearDamping(.6).setAngularDamping(1.6).setAdditionalSolverIterations(CONFIG.ragdollSolverIterations).setCcdEnabled(true));
            const collider=physics.world.createCollider(descriptor.setMass(masses[name.split('_')[0]]).setFriction(.85).setRestitution(.02),body);
            this.parts.set(name,{name,body,collider,position:center,previous:center.clone(),rotation,previousRotation:rotation.clone()});
        }
        this.root=this.parts.get('pelvis')!;
        for(const bone of skeleton) {
            if(bone.name.toLowerCase()==='root')continue;const part=this.parts.get(region(bone.name))!;
            const inverse=part.rotation.clone().invert();
            this.bindings.push({bone,part,position:bone.getWorldPosition(new T.Vector3()).sub(part.position).applyQuaternion(inverse),rotation:inverse.multiply(bone.getWorldQuaternion(new T.Quaternion()))});
        }
        const depth=(o:T.Object3D):number=>o.parent ? 1+depth(o.parent) : 0;
        this.bindings.sort((a,b)=>depth(a.bone)-depth(b.bone));
        const connect=(parentName:PartName,childName:PartName,pivotName:string,type:'fixed'|'ball'|'hinge',bend=0,axis?:T.Vector3)=>{
            const a=this.parts.get(parentName)!,b=this.parts.get(childName)!,pivot=person.model.getObjectByName(pivotName)!.getWorldPosition(new T.Vector3());
            const qa=a.rotation.clone().invert(),qb=b.rotation.clone().invert();
            const pa=pivot.clone().sub(a.position).applyQuaternion(qa),pb=pivot.clone().sub(b.position).applyQuaternion(qb);
            let data:R.JointData;
            if(type==='fixed')data=R.JointData.fixed(pa,qa,pb,qb);
            else if(type==='ball')data=R.JointData.spherical(pa,pb);
            else data=R.JointData.revoluteWithAxes(pa,pb,axis!.clone().applyQuaternion(qa),axis!.clone().applyQuaternion(qb));
            const joint=physics.world.createImpulseJoint(data,a.body,b.body,true);joint.setContactsEnabled(false);
            if(type==='hinge') {
                const frame=new T.Quaternion().setFromUnitVectors(new T.Vector3(1,0,0),axis!);
                joint.setFrameX1(qa.clone().multiply(frame));joint.setFrameX2(qb.clone().multiply(frame));
                (joint as R.RevoluteImpulseJoint).setLimits(-bend+.025,2.55-bend);
            }
        };
        connect('pelvis','chest','spine_02','fixed');connect('chest','head','neck_01','fixed');
        for(const side of ['l','r'] as const) {
            connect('chest',`upperarm_${side}`,`upperarm_${side}`,'ball');
            connect('pelvis',`thigh_${side}`,`thigh_${side}`,'ball');
            for(const [parent,child,end] of [['upperarm','lowerarm','hand'],['thigh','calf','foot']] as const) {
                const first=mainBone(`${parent}_${side}`).getWorldPosition(new T.Vector3()),pivot=mainBone(`${child}_${side}`).getWorldPosition(new T.Vector3()),last=mainBone(`${end}_${side}`).getWorldPosition(new T.Vector3());
                const incoming=pivot.clone().sub(first).normalize(),outgoing=last.clone().sub(pivot).normalize(),axis=new T.Vector3().crossVectors(incoming,outgoing);
                if(axis.lengthSq()<.0001)axis.set(1,0,0).applyQuaternion(person.group.getWorldQuaternion(new T.Quaternion()));axis.normalize();
                const bend=Math.acos(T.MathUtils.clamp(incoming.dot(outgoing),-1,1));
                connect(`${parent}_${side}`,`${child}_${side}`,`${child}_${side}`,'hinge',bend,axis);
                connect(`${child}_${side}`,`${end}_${side}`,`${end}_${side}`,'fixed');
            }
        }
        for(const part of this.parts.values()) {
            part.body.setLinvel(velocity.clone().add(new T.Vector3().crossVectors(angular,part.position.clone().sub(this.root.position))),true);
            part.body.setAngvel(angular,true);
        }
        person.model.position.set(0,0,0);person.model.rotation.set(0,0,0);this.pose(1);
    }
    capture() {
        for(const part of this.parts.values()) {
            part.previous.copy(part.position);part.previousRotation.copy(part.rotation);
            part.position.copy(vec(part.body.translation()));part.rotation.copy(part.body.rotation());
        }
    }
    pose(alpha:number) {
        this.renderAlpha=alpha;
        this.person.group.position.copy(this.root.previous).lerp(this.root.position,alpha).add(new T.Vector3(0,-1,0));
        this.person.group.quaternion.identity();this.person.group.updateMatrixWorld(true);
        for(const binding of this.bindings) {
            const {bone,part}=binding,rotation=part.previousRotation.clone().slerp(part.rotation,alpha);
            const position=part.previous.clone().lerp(part.position,alpha).add(binding.position.clone().applyQuaternion(rotation));
            const parent=bone.parent!;
            bone.position.copy(position.applyMatrix4(parent.matrixWorld.clone().invert()));
            bone.quaternion.copy(parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(rotation).multiply(binding.rotation));
            bone.updateMatrixWorld(true);
        }
    }
    freezeInterpolation() {
        // Continue from the pose visible when the player paused. The physics
        // bodies stay frozen; the first resumed render cannot rewind a step.
        for(const part of this.parts.values()) {
            part.previous.lerp(part.position,this.renderAlpha);
            part.previousRotation.slerp(part.rotation,this.renderAlpha);
            part.position.copy(part.previous);part.rotation.copy(part.previousRotation);
        }
    }
    dispose() {for(const part of this.parts.values())if(part.body.isValid())this.physics.world.removeRigidBody(part.body);}
}
