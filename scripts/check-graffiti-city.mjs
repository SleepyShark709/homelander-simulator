/** CPU-only checks of the actual private city library, not rendering mocks. */
import fs from 'node:fs';
import path from 'node:path';
import * as T from 'three';

const root = path.resolve(import.meta.dirname,'..');
const folder = path.join(root,'public/assets/graffiti-city');
const model = JSON.parse(fs.readFileSync(path.join(folder,'city.gltf')));
const binary = fs.readFileSync(path.join(folder,'city.bin'));
const layout = model.extras.graffitiCity;
const checks = [];
function check(name,pass,data) {
    checks.push({name,pass:Boolean(pass),data});
    if (!pass) throw new Error(`${name}: ${JSON.stringify(data)}`);
}
const types = {5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
function accessor(index) {
    const a=model.accessors[index],b=model.bufferViews[a.bufferView],Type=types[a.componentType];
    const count={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],values=new Float32Array(a.count*count);
    const stride=b.byteStride ?? count*Type.BYTES_PER_ELEMENT;
    for(let i=0;i<a.count;i++) for(let k=0;k<count;k++) {
        const offset=binary.byteOffset+(b.byteOffset ?? 0)+(a.byteOffset ?? 0)+i*stride+k*Type.BYTES_PER_ELEMENT;
        let value=new Type(binary.buffer,offset,1)[0];
        if(a.normalized) value=a.componentType===5122 ? Math.max(-1,value/32767) :
            a.componentType===5123 ? value/65535 : value;
        values[i*count+k]=value;
    }
    return values;
}
const material = new T.MeshBasicMaterial({side:T.DoubleSide});
function subtree(name) {
    const index=model.nodes.findIndex(n=>n.name===name);
    if(index<0)throw new Error(`Missing ${name}`);
    const visit=i=>{
        const n=model.nodes[i],o=new T.Group();
        if(n.matrix) {o.matrix.fromArray(n.matrix);o.matrix.decompose(o.position,o.quaternion,o.scale);}
        else {o.position.fromArray(n.translation ?? [0,0,0]);o.quaternion.fromArray(n.rotation ?? [0,0,0,1]);o.scale.fromArray(n.scale ?? [1,1,1]);}
        if(n.mesh!==undefined) for(const p of model.meshes[n.mesh].primitives) {
            const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(accessor(p.attributes.POSITION),3));
            if(p.indices!==undefined)g.setIndex(new T.BufferAttribute(new Uint32Array(accessor(p.indices)),1));
            o.add(new T.Mesh(g,material));
        }
        for(const c of n.children ?? [])o.add(visit(c));
        return o;
    };
    const result=visit(index);result.updateMatrixWorld(true);return result;
}
try {
    check('all shared texture dependencies exist',model.images.every(im=>fs.existsSync(path.resolve(folder,im.uri))),model.images.length);
    const roofReports=[];
    for(const [name,p] of Object.entries(layout.prototypes)) {
        const original=subtree(name+'_L0'),roof=subtree(name+'_Roof');
        const bounds=new T.Box3().setFromObject(original),ray=new T.Raycaster();
        let maximum=0,missing=0;
        for(let x=0;x<7;x++)for(let z=0;z<7;z++) {
            const px=T.MathUtils.lerp(bounds.min.x+.8,bounds.max.x-.8,x/6);
            const pz=T.MathUtils.lerp(bounds.min.z+.8,bounds.max.z-.8,z/6);
            ray.set(new T.Vector3(px,bounds.max.y+3,pz),new T.Vector3(0,-1,0));
            const visible=ray.intersectObject(original,true)[0],physical=ray.intersectObject(roof,true)[0];
            if(!visible||!physical)missing++;
            else maximum=Math.max(maximum,Math.abs(visible.point.y-physical.point.y));
        }
        roofReports.push({name,missing,maximum});
        check(`${name} roof collision matches the actual roof`,!missing&&maximum<.02,{missing,maximum});
        for(let lod=1;lod<3;lod++) {
            const actual=new T.Box3().setFromObject(subtree(name+`_L${lod}`));
            check(`${name} L${lod} retains building extent`,actual.min.distanceTo(bounds.min)<.08&&actual.max.distanceTo(bounds.max)<.08);
        }
    }
    const bands=layout.plots;
    const boxes=layout.buildings.map(p=>{
        const size=layout.prototypes[p.prototype].size;
        const c=Math.abs(Math.cos(p.yaw)),s=Math.abs(Math.sin(p.yaw));
        const w=c*size[0]+s*size[2],d=s*size[0]+c*size[2];
        return [p.position[0]-w/2,p.position[0]+w/2,p.position[2]-d/2,p.position[2]+d/2];
    });
    check('all module footprints retain their sidewalk clearance',boxes.every(b=>bands.some(([lo,hi])=>b[0]>=lo-.001&&b[1]<=hi+.001)&&
        bands.some(([lo,hi])=>b[2]>=lo-.001&&b[3]<=hi+.001)));
    const overlaps=[];
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++) {
        const a=boxes[i],b=boxes[j];
        if(Math.min(a[1],b[1])-Math.max(a[0],b[0])>.01&&Math.min(a[3],b[3])-Math.max(a[2],b[2])>.01)overlaps.push([i,j]);
    }
    check('module buildings have no intersecting footprints',overlaps.length===0,overlaps);
    check('the city spans the existing map',boxes.length>=150&&Math.min(...boxes.map(b=>b[0]))<-96&&Math.max(...boxes.map(b=>b[1]))>96,
        {buildings:boxes.length+5,courtyards:layout.courtyards.length});
    const intervals=items=>{
        let length=0,end=-Infinity;
        for(const [lo,hi] of items.sort((a,b)=>a[0]-b[0])) {length+=Math.max(0,hi-Math.max(lo,end));end=Math.max(end,hi);}
        return length;
    };
    const density=[];
    for(const [ix,[x0,x1]] of bands.entries())for(const [iz,[z0,z1]] of bands.entries()) {
        if(ix===2&&iz===2)continue;
        const inside=boxes.filter(b=>b[0]>=x0-.001&&b[1]<=x1+.001&&b[2]>=z0-.001&&b[3]<=z1+.001);
        const area=inside.reduce((sum,b)=>sum+(b[1]-b[0])*(b[3]-b[2]),0);
        const frontage=intervals(inside.filter(b=>Math.abs(b[0]-x0)<.001).map(b=>b.slice(2)))+
            intervals(inside.filter(b=>Math.abs(b[1]-x1)<.001).map(b=>b.slice(2)))+
            intervals(inside.filter(b=>Math.abs(b[2]-z0)<.001).map(b=>b.slice(0,2)))+
            intervals(inside.filter(b=>Math.abs(b[3]-z1)<.001).map(b=>b.slice(0,2)));
        const [a,b]=layout.sidewalkEdges[ix],[c,d]=layout.sidewalkEdges[iz];
        density.push({block:[ix,iz],buildings:inside.length,area,plotArea:(x1-x0)*(z1-z0),
            streetBlockArea:(b-a)*(d-c),coverage:area/((x1-x0)*(z1-z0)),frontage:frontage/(2*(x1-x0+z1-z0))});
    }
    check('each ordinary plot is at least seventy percent occupied',density.every(b=>b.coverage>=.70),density);
    check('street fronts form continuous occupied blocks',density.every(b=>b.frontage>=.78),density.map(b=>({block:b.block,frontage:b.frontage})));
    check('courtyard entries retain flying clearance',layout.courtyards.every(c=>c.entry.width>=3.6),layout.courtyards.map(c=>c.entry.width));
    const output=path.join(root,'.artifacts/graffiti-city/library-check.json');
    fs.writeFileSync(output,JSON.stringify({checks,roofReports,density,scope:'CPU structure only; visual/gameplay checks are separate'},null,2)+'\n');
    console.log(JSON.stringify({checks:checks.length,passed:checks.every(c=>c.pass),roofReports,
        plotCoverage:density.reduce((n,b)=>n+b.area,0)/density.reduce((n,b)=>n+b.plotArea,0),
        streetBlockCoverage:density.reduce((n,b)=>n+b.area,0)/density.reduce((n,b)=>n+b.streetBlockArea,0)}));
} catch(error) {
    fs.writeFileSync(path.join(root,'.artifacts/graffiti-city/library-check-failure.json'),JSON.stringify({checks,error:String(error)},null,2)+'\n');
    throw error;
}
