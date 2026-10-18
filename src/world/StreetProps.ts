import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Shared materials and merged meshes keep detailed street furniture inexpensive. */
export class StreetProps {
    metal = new T.MeshStandardMaterial({color:0x27343e, roughness:.52, metalness:.7});
    wood = new T.MeshStandardMaterial({color:0x8a6040, roughness:.85});
    stone = new T.MeshStandardMaterial({color:0xa8a69c, roughness:.9});
    chrome = new T.MeshStandardMaterial({color:0xaab4bb, roughness:.24, metalness:.95});
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
    dispose() {
        [this.metal,this.wood,this.bark,this.stone,this.chrome,this.leaves].forEach(m=>m.dispose());
        if (this.ownsLeafMap) this.leafMap.dispose();
    }
}
