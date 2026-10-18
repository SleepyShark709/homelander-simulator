import * as T from 'three';
import { CONFIG } from '../core/config';

export interface CapeData { anchorJoint: number; pinMinY: number; vertexIndices: number[] }
interface Link { a: number; b: number; length: number; compliance: number; lambda: number }
interface Binding { vertex: number; nodes: number[]; weights: number[]; residual: T.Vector3; weld: number }

// A coarse XPBD cloth drives only the original cape vertices. Body animation,
// skin weights, UVs and the cached source geometry are never edited.
export class CapePhysics {
    enabled = true;
    floorY = 0;
    worldCollision?: (from: T.Vector3, to: T.Vector3, radius: number) => void;
    readonly vertices: ReadonlySet<number>;
    private rest: T.Vector3[] = [];
    private positions: T.Vector3[] = [];
    private previous: T.Vector3[] = [];
    private beforeStep: T.Vector3[] = [];
    private local: T.Vector3[] = [];
    private links: Link[] = [];
    private reverseLinks: Link[] = [];
    private tethers: number[] = [];
    private worldNormals: T.Vector3[] = [];
    private worldOffsets: number[] = [];
    private bindings: Binding[] = [];
    private triangles: number[][] = [];
    private normals: T.Vector3[] = [];
    private original: T.BufferGeometry;
    private skinWorld = new T.Matrix4();
    private lastSkinWorld = new T.Matrix4();
    private accumulator = 0;
    private initialized = false;
    private capsules: Array<{a:T.Bone;b:T.Bone;radius:number;oldA:T.Vector3;oldB:T.Vector3;aNow:T.Vector3;bNow:T.Vector3;simA:T.Vector3;simB:T.Vector3}> = [];
    private a = new T.Vector3();
    private b = new T.Vector3();
    private c = new T.Vector3();
    private normal = new T.Vector3();
    private wind = new T.Vector3();
    private back = new T.Vector3();
    private inverse = new T.Matrix4();
    private config = CONFIG.cape;
    private pinned = CONFIG.cape.columns * CONFIG.cape.pinnedRows;
    constructor(private mesh: T.SkinnedMesh, private data: CapeData) {
        this.original = mesh.geometry;
        mesh.geometry = mesh.geometry.clone();
        (mesh.geometry.attributes.position as T.BufferAttribute).setUsage(T.DynamicDrawUsage);
        (mesh.geometry.attributes.normal as T.BufferAttribute).setUsage(T.DynamicDrawUsage);
        this.vertices = new Set(data.vertexIndices);
        const p = this.original.attributes.position, index = this.original.index!;
        const points = data.vertexIndices.map(i=>new T.Vector3().fromBufferAttribute(p,i));
        const minimum = Math.min(...points.map(v=>v.y)), rows = this.config.rows, columns = this.config.columns;
        const bounds: Array<[number,number]> = [];
        for (let row=0;row<rows;row++) {
            const y = T.MathUtils.lerp(data.pinMinY,minimum,row/(rows-1));
            const band = points.filter(v=>Math.abs(v.y-y)<(data.pinMinY-minimum)/(rows-1));
            const left = Math.min(...band.map(v=>v.x)), right = Math.max(...band.map(v=>v.x));
            bounds.push([left,right]);
            for(let col=0;col<columns;col++) {
                const x=T.MathUtils.lerp(left,right,col/(columns-1));
                const near=band.filter(v=>Math.abs(v.x-x)<(right-left)/(columns-1));
                const z=near.reduce((sum,v)=>sum+v.z,0)/near.length;
                this.rest.push(new T.Vector3(x,y,z));
            }
        }
        const weld = new Map<string,number>();
        for(let k=0;k<points.length;k++) {
            const v=points[k], fy=T.MathUtils.clamp((data.pinMinY-v.y)/(data.pinMinY-minimum)*(rows-1),0,rows-1);
            const row=Math.min(rows-2,Math.floor(fy)), ty=fy-row;
            const left=T.MathUtils.lerp(bounds[row][0],bounds[row+1][0],ty), right=T.MathUtils.lerp(bounds[row][1],bounds[row+1][1],ty);
            const fx=T.MathUtils.clamp((v.x-left)/(right-left)*(columns-1),0,columns-1), col=Math.min(columns-2,Math.floor(fx)), tx=fx-col;
            const nodes=[row*columns+col,row*columns+col+1,(row+1)*columns+col,(row+1)*columns+col+1];
            const weights=[(1-tx)*(1-ty),tx*(1-ty),(1-tx)*ty,tx*ty];
            const center=new T.Vector3(); nodes.forEach((n,j)=>center.addScaledVector(this.rest[n],weights[j]));
            const key=v.toArray().join(',');if(!weld.has(key))weld.set(key,weld.size);
            this.bindings.push({vertex:data.vertexIndices[k],nodes,weights,residual:v.clone().sub(center),weld:weld.get(key)!});
        }
        this.normals=Array.from({length:weld.size},()=>new T.Vector3());
        const byVertex=new Map(this.bindings.map((binding,i)=>[binding.vertex,i]));
        for(let i=0;i<index.count;i+=3) if(this.vertices.has(index.getX(i)))
            this.triangles.push([0,1,2].map(j=>byVertex.get(index.getX(i+j))!));
        const link=(a:number,b:number,compliance:number)=>this.links.push({a,b,length:this.rest[a].distanceTo(this.rest[b]),compliance,lambda:0});
        for(let row=0;row<rows;row++)for(let col=0;col<columns;col++) {
            const i=row*columns+col;
            if(col+1<columns)link(i,i+1,this.config.stretchCompliance);
            if(row+1<rows)link(i,i+columns,this.config.stretchCompliance);
            if(row+1<rows && col+1<columns) {link(i,i+columns+1,this.config.stretchCompliance);link(i+1,i+columns,this.config.stretchCompliance);}
            if(row+2<rows)link(i,i+columns*2,this.config.bendCompliance);
            if(col+2<columns)link(i,i+2,this.config.bendCompliance);
        }
        this.positions=this.rest.map(v=>v.clone());this.previous=this.rest.map(v=>v.clone());
        this.reverseLinks=[...this.links].reverse();
        this.beforeStep=this.rest.map(v=>v.clone());this.local=this.rest.map(v=>v.clone());
        this.worldNormals=this.rest.map(()=>new T.Vector3());this.worldOffsets=this.rest.map(()=>0);
        this.tethers=this.rest.map((v,i)=>v.distanceTo(this.rest[i%columns])*1.025);
        const bones=new Map(mesh.skeleton.bones.map(b=>[b.name,b]));
        for(const [a,b,radius] of [
            ['rootx','spine_03x',.14],['spine_03x','neckx',.10],['neckx','headx',.10],
            ...['l','r'].flatMap(side=>[
                [`shoulder${side}`,`arm_stretch${side}`,.09],
                [`arm_stretch${side}`,`forearm_stretch${side}`,.085],
                [`forearm_stretch${side}`,`hand${side}`,.065],
                [`thigh_stretch${side}`,`leg_stretch${side}`,.105],
                [`leg_stretch${side}`,`foot${side}`,.075],
            ]),
        ] as Array<[string,string,number]>) this.capsules.push({a:bones.get(a)!,b:bones.get(b)!,radius,
            oldA:new T.Vector3(),oldB:new T.Vector3(),aNow:new T.Vector3(),bNow:new T.Vector3(),simA:new T.Vector3(),simB:new T.Vector3()});
    }
    private pose() {
        this.mesh.updateWorldMatrix(true,false);
        const bone=this.mesh.skeleton.bones[this.data.anchorJoint];
        this.skinWorld.copy(this.mesh.matrixWorld).multiply(this.mesh.bindMatrixInverse)
            .multiply(bone.matrixWorld).multiply(this.mesh.skeleton.boneInverses[this.data.anchorJoint]).multiply(this.mesh.bindMatrix);
        for(const capsule of this.capsules) {
            capsule.a.getWorldPosition(capsule.aNow);capsule.b.getWorldPosition(capsule.bNow);
        }
    }
    reset() {
        this.pose();
        for(let i=0;i<this.rest.length;i++) {
            this.positions[i].copy(this.rest[i]).applyMatrix4(this.skinWorld);
            this.previous[i].copy(this.positions[i]);this.beforeStep[i].copy(this.positions[i]);
            this.worldNormals[i].set(0,0,0);
        }
        for(const capsule of this.capsules) {
            capsule.oldA.copy(capsule.aNow);capsule.oldB.copy(capsule.bNow);
            capsule.simA.copy(capsule.aNow);capsule.simB.copy(capsule.bNow);
        }
        this.lastSkinWorld.copy(this.skinWorld);this.accumulator=0;this.initialized=true;
        for(const binding of this.bindings) for(const name of ['position','normal']) {
            const original=this.original.attributes[name], target=this.mesh.geometry.attributes[name];
            target.setXYZ(binding.vertex,original.getX(binding.vertex),original.getY(binding.vertex),original.getZ(binding.vertex));
            target.needsUpdate=true;
        }
    }
    update(dt:number, airVelocity?:T.Vector3) {
        if(!this.enabled)return;
        this.pose();
        this.a.setFromMatrixPosition(this.skinWorld);this.b.setFromMatrixPosition(this.lastSkinWorld);
        if(!this.initialized || this.a.distanceTo(this.b)>this.config.teleportDistance)this.reset();
        if(dt<=0)return;
        const elapsed=Math.min(dt,.05), previousRemainder=this.accumulator;
        this.accumulator+=elapsed;
        let offset=this.config.step-previousRemainder;
        while(this.accumulator>=this.config.step) {
            this.simulate(T.MathUtils.clamp(offset/elapsed,0,1),airVelocity);
            this.accumulator-=this.config.step;offset+=this.config.step;
        }
        this.deform(this.accumulator/this.config.step);
        this.lastSkinWorld.copy(this.skinWorld);
        for(const capsule of this.capsules) {capsule.oldA.copy(capsule.aNow);capsule.oldB.copy(capsule.bNow);}
    }
    private simulate(fraction:number,airVelocity?:T.Vector3) {
        const h=this.config.step, columns=this.config.columns, damping=Math.exp(-this.config.damping*h);
        this.wind.set(.6,0,.25);if(airVelocity)this.wind.add(airVelocity);
        this.back.set(0,0,-1).transformDirection(this.skinWorld);
        for(const capsule of this.capsules) {
            capsule.simA.copy(capsule.oldA).lerp(capsule.aNow,fraction);
            capsule.simB.copy(capsule.oldB).lerp(capsule.bNow,fraction);
        }
        for(let i=0;i<this.positions.length;i++)this.beforeStep[i].copy(this.positions[i]);
        for(let i=0;i<this.positions.length;i++) {
            const p=this.positions[i];
            if(i<this.pinned) {
                this.a.copy(this.rest[i]).applyMatrix4(this.lastSkinWorld);
                this.b.copy(this.rest[i]).applyMatrix4(this.skinWorld);
                p.copy(this.a).lerp(this.b,fraction);this.previous[i].copy(p);continue;
            }
            this.a.copy(p).sub(this.previous[i]);this.previous[i].copy(p);
            const row=Math.floor(i/columns), col=i%columns;
            this.b.copy(this.beforeStep[row*columns+Math.min(columns-1,col+1)]).sub(this.beforeStep[row*columns+Math.max(0,col-1)]);
            this.c.copy(this.beforeStep[Math.min(this.config.rows-1,row+1)*columns+col]).sub(this.beforeStep[(row-1)*columns+col]);
            this.normal.crossVectors(this.b,this.c).normalize();
            this.b.copy(this.wind).addScaledVector(this.a,-1/h);
            const pressure=T.MathUtils.clamp(this.b.dot(this.normal),-55,55);
            const airForce=T.MathUtils.clamp(pressure*Math.abs(pressure)*this.config.airDrag,-this.config.maxAirAcceleration,this.config.maxAirAcceleration);
            p.addScaledVector(this.a,damping).addScaledVector(this.wind,(1-damping)*h).addScaledVector(this.normal,airForce*h*h);
            p.y-=this.config.gravity*h*h;
        }
        for(let i=this.pinned;i<this.positions.length;i++) {
            this.worldNormals[i].set(0,0,0);
            this.findWorldContact(i,this.beforeStep[i],this.positions[i]);
        }
        for(const link of this.links)link.lambda=0;
        for(let iteration=0;iteration<this.config.iterations;iteration++) {
            this.solveLinks(this.positions,iteration);
            for(let i=this.pinned;i<this.positions.length;i++) {
                const anchor=this.positions[i%columns],point=this.positions[i];
                this.a.copy(point).sub(anchor);
                if(this.a.length()>this.tethers[i])point.copy(anchor).add(this.a.setLength(this.tethers[i]));
                this.collideBody(point,fraction);
                this.collideWorld(i,point);
            }
        }
        for(let i=this.pinned;i<this.positions.length;i++) {
            const p=this.positions[i];
            if(this.worldCollision)this.worldCollision(p,p,this.config.thickness);
            else p.y=Math.max(this.floorY+this.config.thickness,p.y);
        }
    }
    private findWorldContact(i:number,from:T.Vector3,point:T.Vector3) {
        if(!this.worldCollision)return;
        const normal=this.worldNormals[i];this.c.copy(point);
        this.worldCollision(from,point,this.config.thickness);
        this.c.subVectors(point,this.c);
        if(this.c.lengthSq()>1e-12) {
            normal.copy(this.c).normalize();this.worldOffsets[i]=normal.dot(point);
        }
    }
    private collideWorld(i:number,point:T.Vector3) {
        if(!this.worldCollision) {point.y=Math.max(this.floorY+this.config.thickness,point.y);return;}
        const normal=this.worldNormals[i],depth=this.worldOffsets[i]-normal.dot(point);
        if(depth>0)point.addScaledVector(normal,depth);
    }
    private solveLinks(points:T.Vector3[],iteration:number) {
        for(const link of iteration%2?this.reverseLinks:this.links) {
            const a=points[link.a],b=points[link.b];
            this.a.copy(b).sub(a);const distance=this.a.length();
            if(distance<1e-9)continue;
            const wa=link.a<this.pinned?0:1,wb=link.b<this.pinned?0:1,alpha=link.compliance/(this.config.step*this.config.step);
            if(!wa&&!wb)continue;
            const dl=(-(distance-link.length)-alpha*link.lambda)/(wa+wb+alpha);
            link.lambda+=dl;this.a.multiplyScalar(dl/distance);
            a.addScaledVector(this.a,-wa);b.addScaledVector(this.a,wb);
        }
    }
    private collideBody(point:T.Vector3,fraction:number) {
        for(const capsule of this.capsules) {
            this.a.copy(capsule.oldA).lerp(capsule.aNow,fraction);
            this.b.copy(capsule.oldB).lerp(capsule.bNow,fraction).sub(this.a);
            this.c.copy(point).sub(this.a);
            const length=this.b.lengthSq(),t=T.MathUtils.clamp(this.c.dot(this.b)/Math.max(length,1e-9),0,1);
            this.a.addScaledVector(this.b,t);this.c.copy(point).sub(this.a);
            const radius=capsule.radius+this.config.bodyPadding,distance=this.c.length();
            if(distance<radius) {
                // Use the nearest surface: pushing an almost touching node to
                // the opposite side of a limb injects a full diameter of motion.
                this.normal.copy(distance>1e-9?this.c:this.back).normalize();
                const correction=radius-distance+.00001;
                point.addScaledVector(this.normal,correction);
            }
        }
    }
    private deform(alpha:number) {
        this.inverse.copy(this.skinWorld).invert();
        this.back.set(0,0,-1).transformDirection(this.skinWorld);
        for(let i=0;i<this.positions.length;i++) {
            if(i<this.pinned)this.local[i].copy(this.rest[i]).applyMatrix4(this.skinWorld);
            else {
                const point=this.local[i].copy(this.beforeStep[i]).lerp(this.positions[i],alpha);
                // Interpolate relative to the collar. World-space interpolation
                // alone trails the current skeleton by one cloth step and pulls
                // the first free row away from its fixed neighbours at speed.
                const anchor=i%this.config.columns;
                this.a.copy(this.rest[anchor]).applyMatrix4(this.skinWorld);
                this.b.copy(this.beforeStep[anchor]).lerp(this.positions[anchor],alpha);
                point.add(this.a).sub(this.b);
                this.findWorldContact(i,this.beforeStep[i],point);
                // The body renders at the current pose; simulation interpolation
                // must not let the delayed cloth pass through that pose.
            }
        }
        for(const link of this.links)link.lambda=0;
        for(let contact=0;contact<this.config.renderIterations;contact++) {
            this.solveLinks(this.local,contact);
            for(let i=this.pinned;i<this.local.length;i++) {
                const point=this.local[i];this.collideBody(point,1);
                this.collideWorld(i,point);
            }
        }
        for(let i=0;i<this.local.length;i++) {
            const point=this.local[i];
            if(i>=this.pinned && this.worldCollision)this.worldCollision(point,point,this.config.thickness);
            point.applyMatrix4(this.inverse);
        }
        const position=this.mesh.geometry.attributes.position,normal=this.mesh.geometry.attributes.normal;
        for(const binding of this.bindings) {
            if(this.original.attributes.position.getY(binding.vertex)>=this.data.pinMinY)continue;
            this.a.copy(binding.residual);binding.nodes.forEach((n,j)=>this.a.addScaledVector(this.local[n],binding.weights[j]));
            position.setXYZ(binding.vertex,this.a.x,this.a.y,this.a.z);
        }
        for(const n of this.normals)n.set(0,0,0);
        for(const triangle of this.triangles) {
            this.a.fromBufferAttribute(position,this.bindings[triangle[0]].vertex);
            this.b.fromBufferAttribute(position,this.bindings[triangle[1]].vertex).sub(this.a);
            this.c.fromBufferAttribute(position,this.bindings[triangle[2]].vertex).sub(this.a);
            this.normal.crossVectors(this.b,this.c);
            for(const i of triangle)this.normals[this.bindings[i].weld].add(this.normal);
        }
        for(const n of this.normals)n.normalize();
        for(const binding of this.bindings) {
            const n=this.normals[binding.weld];normal.setXYZ(binding.vertex,n.x,n.y,n.z);
        }
        position.needsUpdate=true;normal.needsUpdate=true;
        this.inverse.copy(this.mesh.matrixWorld).invert();
        let radius=2;
        for(const p of this.positions) {
            this.a.copy(p).applyMatrix4(this.inverse).sub(this.b.set(0,1,0));radius=Math.max(radius,this.a.length()+.2);
        }
        this.mesh.boundingSphere!.radius=radius;
    }
    snapshot() {
        let stretch=1,renderedStretch=1,pinError=0,bodyPenetration=0,solverPenetration=0,worstLink:number[]=[];
        for(const link of this.links) if(link.compliance===this.config.stretchCompliance) {
            const ratio=this.positions[link.a].distanceTo(this.positions[link.b])/link.length;
            if(ratio>stretch){stretch=ratio;worstLink=[link.a,link.b];}
            renderedStretch=Math.max(renderedStretch,this.local[link.a].distanceTo(this.local[link.b])/link.length);
        }
        const p=this.mesh.geometry.attributes.position,original=this.original.attributes.position;
        for(const binding of this.bindings) if(original.getY(binding.vertex)>=this.data.pinMinY)
            pinError=Math.max(pinError,this.a.fromBufferAttribute(p,binding.vertex)
                .distanceTo(this.b.fromBufferAttribute(original,binding.vertex)));
        for(let i=this.pinned;i<this.local.length;i++) {
            this.a.copy(this.local[i]).applyMatrix4(this.skinWorld);
            for(const capsule of this.capsules) {
                this.b.copy(capsule.bNow).sub(capsule.aNow);this.c.copy(this.a).sub(capsule.aNow);
                const t=T.MathUtils.clamp(this.c.dot(this.b)/Math.max(1e-9,this.b.lengthSq()),0,1);
                this.c.copy(capsule.aNow).addScaledVector(this.b,t);
                bodyPenetration=Math.max(bodyPenetration,capsule.radius+this.config.bodyPadding-this.a.distanceTo(this.c));
                this.b.copy(capsule.simB).sub(capsule.simA);this.c.copy(this.positions[i]).sub(capsule.simA);
                const solverT=T.MathUtils.clamp(this.c.dot(this.b)/Math.max(1e-9,this.b.lengthSq()),0,1);
                this.c.copy(capsule.simA).addScaledVector(this.b,solverT);
                solverPenetration=Math.max(solverPenetration,capsule.radius+this.config.bodyPadding-this.positions[i].distanceTo(this.c));
            }
        }
        return {particles:this.positions.length,maxStretch:stretch,renderedStretch,pinError,bodyPenetration,solverPenetration,worstLink,
            tail:this.positions[this.positions.length-Math.ceil(this.config.columns/2)].toArray(),
            finite:this.positions.every(p=>p.toArray().every(Number.isFinite))};
    }
}
