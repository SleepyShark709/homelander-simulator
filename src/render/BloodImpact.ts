import * as T from 'three';
import { type Physics, R } from '../core/Physics';
import { CONFIG } from '../core/config';

type Filter = (c:R.Collider)=>boolean;
interface Drop {position:T.Vector3; velocity:T.Vector3; life:number; radius:number; stream:boolean; exclude?:R.Collider; filter?:Filter;}
interface Pool {mesh:T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>; life:number; support?:R.Collider; local:T.Matrix4;}
interface Spray {mesh:T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>; life:number;}
const poolSegments=96;

function liquidMaterial(spray:boolean) {
    const material=new T.MeshStandardMaterial({color:spray?0x92040b:0x590105,roughness:.2,envMapIntensity:spray ? .35 : .08,
        transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide,
        polygonOffset:!spray,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
    material.onBeforeCompile=shader=>{
        shader.vertexShader='varying vec2 bloodUv;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nbloodUv=uv;');
        shader.fragmentShader=`varying vec2 bloodUv;
            float bloodNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
                vec4 h=fract(sin(vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1.,0.),vec2(127.1,311.7)),
                    dot(i+vec2(0.,1.),vec2(127.1,311.7)),dot(i+vec2(1.),vec2(127.1,311.7))))*43758.5453);
                return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);}
            `+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
            float concentration=bloodNoise(bloodUv*11.)*.65+bloodNoise(bloodUv*31.)*.35;
            diffuseColor.rgb*=mix(${spray?'.42,1.25':'.72,1.08'},concentration);
            ${spray ? `float film=smoothstep(.28,.64,concentration+.2*sin(bloodUv.x*26.+bloodUv.y*18.));
                diffuseColor.a*=film*(1.-smoothstep(.55,1.,bloodUv.x));` :
                'diffuseColor.a*=1.-smoothstep(.94,1.,length((bloodUv-.5)*2.));'}`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>\nroughnessFactor=mix(${spray?'.12,.32':'.32,.48'},bloodNoise(bloodUv*17.));`);
    };
    material.customProgramCacheKey=()=>spray?'blood-liquid-film':'blood-wet-residue';
    return material;
}

/** Fixed reusable budgets; all motion and lifetime use world time. */
export class BloodImpact {
    readonly drops:Drop[]=[];
    readonly pools:Pool[]=[];
    readonly sprays:Spray[]=[];
    readonly mesh:T.InstancedMesh;
    private dropCursor=0;
    private poolCursor=0;
    private sprayCursor=0;
    private dummy=new T.Object3D();
    private sprayShape:T.PlaneGeometry;
    constructor(private group:T.Group,private physics:Physics) {
        const count=CONFIG.superSpeed.bloodBursts*CONFIG.superSpeed.bloodDrops;
        this.mesh=new T.InstancedMesh(new T.SphereGeometry(1,8,6),new T.MeshStandardMaterial({color:0x83020a,roughness:.18,envMapIntensity:.4}),count);
        this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); this.mesh.frustumCulled=false;
        this.mesh.name='directional-blood-droplets'; group.add(this.mesh);
        for(let i=0;i<count;i++) this.drops.push({position:new T.Vector3(),velocity:new T.Vector3(),life:0,radius:0,stream:false});
        this.sprayShape=new T.PlaneGeometry(1,1,18,16);
        const surface=this.sprayShape.attributes.position;
        for(let i=0;i<surface.count;i++) {
            const t=surface.getX(i)+.5,width=surface.getY(i);
            surface.setXYZ(i,width*(.18+t*2.3),t*.24+Math.sin(width*15+t*9)*.12*t,t*2.2);
        }
        this.sprayShape.computeVertexNormals();
        for(let i=0;i<CONFIG.superSpeed.bloodBursts;i++) {
            const mesh=new T.Mesh(this.sprayShape.clone(),liquidMaterial(true));
            mesh.visible=false;mesh.frustumCulled=false;mesh.name='impact-liquid-spray';group.add(mesh);
            this.sprays.push({mesh,life:0});
        }
        for(let i=0;i<CONFIG.superSpeed.bloodPools;i++) {
            const geometry=new T.BufferGeometry(), indices:number[]=[];
            geometry.setAttribute('position',new T.BufferAttribute(new Float32Array((poolSegments+2)*3),3).setUsage(T.DynamicDrawUsage));
            geometry.setAttribute('uv',new T.BufferAttribute(new Float32Array((poolSegments+2)*2),2));
            for(let j=1;j<=poolSegments;j++) indices.push(0,j,j+1);
            geometry.setIndex(indices);
            const mesh=new T.Mesh(geometry,liquidMaterial(false));
            mesh.visible=false; mesh.frustumCulled=false; mesh.name='irregular-blood-residue'; group.add(mesh);
            this.pools.push({mesh,life:0,local:new T.Matrix4()});
        }
        this.update(0);
    }
    private ground(point:T.Vector3,exclude:R.Collider,filter:Filter) {
        const hit=this.physics.world.castRayAndGetNormal(new R.Ray(point,{x:0,y:-1,z:0}),30,true,undefined,undefined,exclude,undefined,filter);
        return hit && hit.normal.y>.45 ? {point:point.clone().add(new T.Vector3(0,-hit.timeOfImpact,0)),normal:new T.Vector3().copy(hit.normal),collider:hit.collider} : null;
    }
    private pool(point:T.Vector3,direction:T.Vector3,radius:number,exclude:R.Collider,filter:Filter) {
        const support=this.ground(point,exclude,filter); if(!support) return;
        const pool=this.pools[this.poolCursor++%this.pools.length], positions=pool.mesh.geometry.attributes.position,uv=pool.mesh.geometry.attributes.uv;
        const normal=support.normal, center=support.point.addScaledVector(normal,.012);
        const forward=direction.clone().addScaledVector(normal,-direction.dot(normal));
        if(forward.lengthSq()<.01) forward.set(0,0,1); forward.normalize();
        const side=new T.Vector3().crossVectors(normal,forward).normalize();
        pool.mesh.position.copy(center); pool.mesh.quaternion.identity(); pool.mesh.scale.setScalar(1); positions.setXYZ(0,0,0,0);
        const seed=Math.random()*Math.PI*2;uv.setXY(0,.5,.5);
        for(let i=0;i<=poolSegments;i++) {
            const angle=i%poolSegments/poolSegments*Math.PI*2;
            const irregular=1+.18*Math.sin(angle*3+seed)+.12*Math.sin(angle*7-seed)+.06*Math.sin(angle*13+seed);
            const offset=forward.clone().multiplyScalar(Math.cos(angle)*radius*1.55*irregular)
                .addScaledVector(side,Math.sin(angle)*radius*.75*irregular);
            const origin=center.clone().addScaledVector(normal,.06), length=offset.length();
            const obstruction=this.physics.ray(origin,offset.clone().normalize(),length,exclude,filter);
            if(obstruction) offset.multiplyScalar(Math.max(0,obstruction.timeOfImpact-.03)/length);
            // Clip residue at ledges and walls instead of projecting it through them.
            const edgeSupport=this.ground(center.clone().add(offset).addScaledVector(normal,.12),exclude,filter);
            if(!edgeSupport || edgeSupport.point.distanceTo(center.clone().add(offset))>.2) offset.multiplyScalar(0);
            else offset.copy(edgeSupport.point).addScaledVector(normal,.012).sub(center);
            positions.setXYZ(i+1,offset.x,offset.y,offset.z);
            uv.setXY(i+1,.5+Math.cos(angle)*.5,.5+Math.sin(angle)*.5);
        }
        positions.needsUpdate=true;uv.needsUpdate=true; pool.mesh.geometry.computeVertexNormals();
        pool.support=support.collider;
        pool.mesh.updateMatrix();
        pool.local.copy(new T.Matrix4().compose(new T.Vector3().copy(support.collider.translation()),
            new T.Quaternion().copy(support.collider.rotation()),new T.Vector3(1,1,1))).invert().multiply(pool.mesh.matrix);
        pool.life=CONFIG.superSpeed.bloodLife; pool.mesh.material.opacity=.92; pool.mesh.visible=true;
    }
    spawn(point:T.Vector3,direction:T.Vector3,exclude:R.Collider,filter:Filter) {
        this.pool(point,direction,.7+Math.random()*.2,exclude,filter);
        const spray=this.sprays[this.sprayCursor++%this.sprays.length];
        spray.mesh.position.copy(point);spray.mesh.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),direction.clone().normalize());
        const positions=spray.mesh.geometry.attributes.position,template=this.sprayShape.attributes.position;
        for(let i=0;i<positions.count;i++) {
            const offset=new T.Vector3().fromBufferAttribute(template,i).applyQuaternion(spray.mesh.quaternion),length=offset.length();
            const hit=this.physics.ray(point,offset.clone().normalize(),length,exclude,filter);
            if(hit)offset.multiplyScalar(Math.max(0,hit.timeOfImpact-.025)/length);
            offset.applyQuaternion(spray.mesh.quaternion.clone().invert());positions.setXYZ(i,offset.x,offset.y,offset.z);
        }
        positions.needsUpdate=true;spray.mesh.geometry.computeVertexNormals();spray.life=CONFIG.superSpeed.sprayLife;
        for(let i=0;i<CONFIG.superSpeed.bloodDrops;i++) {
            const drop=this.drops[this.dropCursor++%this.drops.length];
            drop.position.copy(point).add(new T.Vector3((Math.random()-.5)*.55,(Math.random()-.5)*1.25,(Math.random()-.5)*.55));
            drop.velocity.copy(direction).multiplyScalar(18+Math.random()*17)
                .add(new T.Vector3((Math.random()-.5)*11,2+Math.random()*9,(Math.random()-.5)*11));
            drop.stream=i%4===0;drop.radius=drop.stream ? .009+Math.random()*.009 : .004+Math.random()*.019;
            drop.life=.7; drop.exclude=exclude; drop.filter=filter;
        }
        this.update(0);
    }
    update(dt:number) {
        for(let i=0;i<this.drops.length;i++) {
            const drop=this.drops[i]; drop.life=Math.max(0,drop.life-dt);
            if(drop.life>0 && dt>0) {
                drop.velocity.y-=15*dt;
                const delta=drop.velocity.clone().multiplyScalar(dt), length=delta.length();
                const hit=length>0 ? this.physics.ray(drop.position,delta.clone().divideScalar(length),length,drop.exclude,drop.filter) : null;
                if(hit) {
                    drop.position.addScaledVector(delta,hit.timeOfImpact/length);
                    if(i%8===0) this.pool(drop.position.clone().add(new T.Vector3(0,.06,0)),drop.velocity,.14,drop.exclude!,drop.filter!);
                    drop.life=0;
                } else drop.position.add(delta);
            }
            this.dummy.position.copy(drop.position); this.dummy.scale.setScalar(drop.life>0 ? drop.radius : 0);
            if(drop.life>0 && drop.velocity.lengthSq()>.01) {
                this.dummy.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),drop.velocity.clone().normalize());
                this.dummy.scale.y=drop.stream?Math.min(.45,drop.velocity.length()*.012):drop.radius*2.2;
            }
            this.dummy.updateMatrix(); this.mesh.setMatrixAt(i,this.dummy.matrix);
        }
        this.mesh.instanceMatrix.needsUpdate=true;
        for(const spray of this.sprays) {
            spray.life=Math.max(0,spray.life-dt);
            const age=CONFIG.superSpeed.sprayLife-spray.life;
            spray.mesh.visible=spray.life>0;
            spray.mesh.scale.setScalar(.45+.55*T.MathUtils.smoothstep(age,0,CONFIG.superSpeed.sprayLife*.55));
            spray.mesh.material.opacity=.65*T.MathUtils.smoothstep(spray.life,0,CONFIG.superSpeed.sprayLife*.65);
        }
        for(const pool of this.pools) {
            pool.life=Math.max(0,pool.life-dt);
            if(pool.life>0 && pool.support) {
                // All getters are outside query predicates. Preserve collider-local
                // residue on moving cars and discard it if its support is removed.
                if(!pool.support.isValid()) pool.life=0;
                else new T.Matrix4().compose(new T.Vector3().copy(pool.support.translation()),
                    new T.Quaternion().copy(pool.support.rotation()),new T.Vector3(1,1,1))
                    .multiply(pool.local).decompose(pool.mesh.position,pool.mesh.quaternion,pool.mesh.scale);
            }
            pool.mesh.visible=pool.life>0;
            pool.mesh.scale.multiplyScalar(.14+.86*T.MathUtils.smoothstep(CONFIG.superSpeed.bloodLife-pool.life,0,CONFIG.superSpeed.poolSpreadTime));
            pool.mesh.material.opacity=.92*Math.min(1,pool.life/4);
        }
    }
    dispose() {
        this.mesh.geometry.dispose(); (this.mesh.material as T.Material).dispose(); this.mesh.removeFromParent();
        this.sprayShape.dispose();
        for(const spray of this.sprays){spray.mesh.geometry.dispose();spray.mesh.material.dispose();spray.mesh.removeFromParent();}
        for(const pool of this.pools) {pool.mesh.geometry.dispose();pool.mesh.material.dispose();pool.mesh.removeFromParent();}
    }
}
