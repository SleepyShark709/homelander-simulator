import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Shared materials and merged meshes keep detailed street furniture inexpensive. */
export class StreetProps {
    metal = new T.MeshStandardMaterial({color:0x27343e, roughness:.52, metalness:.7});
    wood = new T.MeshStandardMaterial({color:0x8a6040, roughness:.85});
    stone = new T.MeshStandardMaterial({color:0xa8a69c, roughness:.9});
    rubber = new T.MeshStandardMaterial({color:0x131718, roughness:.9});
    chrome = new T.MeshStandardMaterial({color:0xaab4bb, roughness:.24, metalness:.95});
    glass = new T.MeshPhysicalMaterial({color:0x172936, roughness:.14, metalness:.4, clearcoat:1,side:T.DoubleSide});
    paints = [0x354858,0x8b3030,0xc0bdb5,0x242a31,0xa68d3e].map(color =>
        new T.MeshPhysicalMaterial({color,metalness:.5,roughness:.28,clearcoat:1,clearcoatRoughness:.12}));
    leafMap: T.Texture;
    leaves: T.MeshStandardMaterial;
    bark: T.MeshStandardMaterial;
    private ownsLeafMap = false;
    constructor(leafTexture?: T.Texture, barkTextures?: Map<string,T.Texture>) {
        this.bark = new T.MeshStandardMaterial({ color: 0xddd1bd, roughness: 1,
            map: barkTextures?.get('bark_brown_02/color'),
            normalMap: barkTextures?.get('bark_brown_02/normal'),
            normalScale: new T.Vector2(.65,.65),
            roughnessMap: barkTextures?.get('bark_brown_02/roughness'),
            aoMap: barkTextures?.get('bark_brown_02/ao'), aoMapIntensity: .6 });
        if (leafTexture) this.leafMap = leafTexture;
        else {
        const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
        const c=canvas.getContext('2d')!;
        c.strokeStyle='#6b7347';c.lineWidth=2;
        c.beginPath();c.moveTo(12,114);c.bezierCurveTo(52,91,79,63,113,14);c.stroke();
        for(let i=0;i<8;i++) {
            const t=i/8,x=23+t*78,y=102-t*76;
            for(const side of [-1,1]) {
                c.save();c.translate(x+side*10,y+side*7);c.rotate(-.6+side*.65);
                c.fillStyle=i%2 ? '#638044' : '#789350';c.beginPath();c.ellipse(0,0,7,17,0,0,Math.PI*2);c.fill();
                c.strokeStyle='#b2be7d';c.lineWidth=.65;c.beginPath();c.moveTo(0,-13);c.lineTo(0,13);c.stroke();c.restore();
            }
        }
        this.leafMap=new T.CanvasTexture(canvas);this.leafMap.colorSpace=T.SRGBColorSpace;
        this.ownsLeafMap = true;
        }
        this.leaves=new T.MeshStandardMaterial({map:this.leafMap,alphaTest:.4,side:T.DoubleSide,roughness:.85});
    }
    private batch(parts: Map<T.Material,T.BufferGeometry[]>, material:T.Material, geo:T.BufferGeometry) {
        if (!geo.attributes.uv) {
            const p=geo.attributes.position,uv=new Float32Array(p.count*2);
            for(let i=0;i<p.count;i++) {uv[i*2]=p.getX(i);uv[i*2+1]=p.getY(i);}
            geo.setAttribute('uv',new T.BufferAttribute(uv,2));
        }
        const list=parts.get(material) ?? [];list.push(geo);parts.set(material,list);
    }
    private box(parts:Map<T.Material,T.BufferGeometry[]>, material:T.Material, size:number[], position:number[]) {
        this.batch(parts,material,new T.BoxGeometry(...size as [number,number,number]).translate(...position as [number,number,number]));
    }
    private finish(parts:Map<T.Material,T.BufferGeometry[]>) {
        const group=new T.Group();
        for(const [material,geometries] of parts) {
            const mesh=new T.Mesh(mergeGeometries(geometries)!,material);
            geometries.forEach(g=>g.dispose());mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
        }
        return group;
    }
    bench() {
        const parts=new Map<T.Material,T.BufferGeometry[]>();
        for(let i=0;i<5;i++) this.box(parts,this.wood,[1.85,.06,.075],[0,.51,-.2+i*.095]);
        for(let i=0;i<4;i++) this.box(parts,this.wood,[1.85,.075,.065],[0,.68+i*.095,-.25]);
        for(const side of [-1,1]) {
            this.box(parts,this.metal,[.065,.52,.45],[side*.69,.26,0]);
            this.box(parts,this.metal,[.065,.55,.065],[side*.69,.77,-.25]);
            this.box(parts,this.metal,[.085,.065,.51],[side*.85,.78,0]);
        }
        return this.finish(parts);
    }
    bin() {
        const parts=new Map<T.Material,T.BufferGeometry[]>();
        this.batch(parts,this.metal,new T.CylinderGeometry(.28,.25,.91,24).translate(0,.49,0));
        this.batch(parts,this.chrome,new T.TorusGeometry(.28,.028,6,32).rotateX(Math.PI/2).translate(0,.97,0));
        for(let i=0;i<20;i++) {
            const angle=i*Math.PI/10;
            this.box(parts,this.stone,[.018,.67,.018],[Math.cos(angle)*.278,.48,Math.sin(angle)*.278]);
        }
        return this.finish(parts);
    }
    trafficLight() {
        const parts=new Map<T.Material,T.BufferGeometry[]>();
        this.batch(parts,this.metal,new T.CylinderGeometry(.075,.105,3.7,16).translate(0,1.85,0));
        this.box(parts,this.metal,[.32,.94,.23],[0,3.23,0]);
        for(const [i,color] of [0xaa2d23,0xb89232,0x54a467].entries()) {
            const material=new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:i===2 ?.9:.06,roughness:.4});
            const lamp=new T.CylinderGeometry(.094,.094,.025,16).rotateX(Math.PI/2).translate(0,3.52-i*.28,.128);
            this.batch(parts,material,lamp);
        }
        return this.finish(parts);
    }
    tree(seed:number) {
        let state=seed+547;const rand=()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296;};
        const parts=new Map<T.Material,T.BufferGeometry[]>();
        const trunk = new T.CylinderGeometry(.12,.27,3.6,12);
        const uv = trunk.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setY(i,uv.getY(i)*3.6);
        this.batch(parts,this.bark,trunk.translate(0,1.8,0));
        for(let i=0;i<9;i++) {
            const angle=i*Math.PI*2/9,a=new T.Vector3(0,2.1+i*.13,0),b=new T.Vector3(Math.cos(angle)*1.4,3.8+rand(),Math.sin(angle)*1.4);
            const branch=new T.CylinderGeometry(.025,.09,a.distanceTo(b),8);
            const branchUv = branch.attributes.uv;
            for (let j = 0; j < branchUv.count; j++) branchUv.setY(j,branchUv.getY(j)*a.distanceTo(b));
            branch.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize()));
            branch.translate(...a.clone().add(b).multiplyScalar(.5).toArray() as [number,number,number]);this.batch(parts,this.bark,branch);
        }
        const group=this.finish(parts),foliage=new T.InstancedMesh(new T.PlaneGeometry(1.05,1.05),this.leaves,260);
        const dummy=new T.Object3D();
        for(let i=0;i<260;i++) {
            const angle=rand()*Math.PI*2,vertical=rand()*2-1,r=Math.pow(rand(),.33)*2.35;
            dummy.position.set(Math.cos(angle)*r*Math.sqrt(1-vertical*vertical),4.3+vertical*r*.73,Math.sin(angle)*r*Math.sqrt(1-vertical*vertical));
            dummy.rotation.set(rand()*Math.PI,rand()*Math.PI*2,rand()*Math.PI);dummy.scale.setScalar(.65+rand()*.65);dummy.updateMatrix();foliage.setMatrixAt(i,dummy.matrix);
            foliage.setColorAt(i,new T.Color(.86+rand()*.12,.88+rand()*.1,.80+rand()*.15));
        }
        foliage.castShadow=foliage.receiveShadow=true;group.add(foliage);return group;
    }
    car(variant:number) {
        const parts=new Map<T.Material,T.BufferGeometry[]>(),paint=this.paints[variant%this.paints.length];
        // Eight cross-sections give the bonnet, cabin and boot a continuous silhouette.
        const sections=[[-2.12,.78,.53],[-1.98,.89,.66],[-1.4,.91,.73],[-.9,.90,.76],[.8,.91,.74],[1.5,.89,.65],[1.98,.81,.55],[2.1,.73,.5]];
        const vertices:number[]=[],indices:number[]=[];
        for(const [z,w,h] of sections) for(const [x,y] of [[-w,.35],[-w,h-.07],[-w+.09,h],[w-.09,h],[w,h-.07],[w,.35]]) vertices.push(x,y,z);
        for(let row=0;row<sections.length-1;row++) for(let col=0;col<6;col++) {
            const a=row*6+col,b=row*6+(col+1)%6,c=a+6,d=b+6;indices.push(a,c,b,b,c,d);
        }
        for(const row of [0,sections.length-1]) for(let c=1;c<5;c++)
            indices.push(row*6,row*6+(row ? c+1 : c),row*6+(row ? c : c+1));
        const body=new T.BufferGeometry();body.setAttribute('position',new T.Float32BufferAttribute(vertices,3));body.setIndex(indices);body.computeVertexNormals();this.batch(parts,paint,body);
        const cv:number[]=[],ci:number[]=[];
        for(const [z,h,w] of [[-1.08,.76,.76],[-.51,1.36,.56],[.43,1.37,.56],[.96,.75,.76]])
            cv.push(-.77,.73,z,-w,h,z,w,h,z,.77,.73,z);
        for(let row=0;row<3;row++) for(let col=0;col<4;col++) {
            const a=row*4+col,b=row*4+(col+1)%4,c=a+4,d=b+4;ci.push(a,c,b,b,c,d);
        }
        const cabin=new T.BufferGeometry();cabin.setAttribute('position',new T.Float32BufferAttribute(cv,3));cabin.setIndex(ci);cabin.computeVertexNormals();this.batch(parts,paint,cabin);
        const window = (points:number[]) => {
            const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));
            geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();this.batch(parts,this.glass,geometry);
        };
        for(const side of [-1,1]) {
            for(const z of [-.26,.21]) {
                window([side*.758,.8,z-.215, side*.758,.8,z+.215, side*.594,1.29,z+.215, side*.594,1.29,z-.215]);
                this.box(parts,this.chrome,[.022,.018,.44],[side*.776,.8,z]);
            }
            this.box(parts,this.metal,[.06,.08,.15],[side*.82,.96,.57]);
            for(const z of [-1.34,1.30]) {
                const wheel=new T.CylinderGeometry(.29,.29,.19,48).rotateZ(Math.PI/2).translate(side*.88,.30,z);this.batch(parts,this.rubber,wheel);
                const rim=new T.CylinderGeometry(.2,.2,.025,32).rotateZ(Math.PI/2).translate(side*.988,.30,z);this.batch(parts,this.chrome,rim);
                for(let spoke=0;spoke<10;spoke++) {
                    const geometry=new T.BoxGeometry(.034,.29,.025).rotateX(spoke*Math.PI/5).translate(side*1.004,.3,z);this.batch(parts,this.metal,geometry);
                }
            }
            this.box(parts,this.chrome,[.1,.025,.19],[side*.918,.72,-.13]);
            this.box(parts,this.chrome,[.1,.025,.19],[side*.918,.72,.64]);
        }
        window([- .71,.83,.916,.71,.83,.916,.515,1.32,.484,-.515,1.32,.484]);
        window([-.71,.83,-1.023,-.515,1.31,-.564,.515,1.31,-.564,.71,.83,-1.023]);
        this.box(parts,this.metal,[1.4,.16,.04],[0,.49,2.105]);
        this.box(parts,this.chrome,[1.75,.035,.04],[0,.33,2.08]);
        this.box(parts,this.chrome,[1.7,.035,.04],[0,.33,-2.10]);
        const light=new T.MeshPhysicalMaterial({color:0xe3e4d6,roughness:.17,metalness:.25,clearcoat:1});
        const rear=new T.MeshPhysicalMaterial({color:0xa32a23,roughness:.2,clearcoat:1});
        for(const side of [-1,1]) {
            this.box(parts,light,[.33,.12,.045],[side*.61,.6,2.035]);
            this.box(parts,rear,[.32,.10,.045],[side*.62,.57,-2.125]);
        }
        return this.finish(parts);
    }
    dispose() {
        [this.metal,this.wood,this.bark,this.stone,this.rubber,this.chrome,this.glass,this.leaves,...this.paints].forEach(m=>m.dispose());
        if (this.ownsLeafMap) this.leafMap.dispose();
    }
}
