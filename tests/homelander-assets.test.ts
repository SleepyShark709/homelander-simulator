import { describe, expect, it } from 'vitest';
import { readFileSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const bytes=readFileSync('public/assets/human/homelander.glb');
const length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length).toString());
const bin=bytes.subarray(28+length);
const provenance=JSON.parse(readFileSync('.asset-source/homelander/provenance.json','utf8'));
const hash=(data:Buffer)=>createHash('sha256').update(data).digest('hex');

describe('user Homelander and offline animations',()=>{
    it('identifies only the independent spine-bound cape without changing any source BIN data',()=>{
        const cape=doc.extras.cape, primitive=doc.meshes[0].primitives[0];
        expect(cape.vertexIndices).toHaveLength(5913);
        expect(new Set(cape.vertexIndices).size).toBe(5913);
        expect(hash(bin)).toBe(provenance.rawBinSha256);
        const ja=doc.accessors[primitive.attributes.JOINTS_0],wa=doc.accessors[primitive.attributes.WEIGHTS_0];
        const jo=(doc.bufferViews[ja.bufferView].byteOffset??0)+(ja.byteOffset??0);
        const wo=(doc.bufferViews[wa.bufferView].byteOffset??0)+(wa.byteOffset??0);
        expect(cape.vertexIndices.every((i:number)=>bin.readUInt8(jo+i*4)===cape.anchorJoint&&
            bin.readFloatLE(wo+i*16)===1&&[1,2,3].every(k=>bin.readFloatLE(wo+i*16+k*4)===0))).toBe(true);
    });
    it('packages all ten user actions and eight stock flight/movement/jump actions on one complete rig',()=>{
        expect(doc.skins[0].joints).toHaveLength(68);
        expect(doc.animations.map((a:{name:string})=>a.name).sort()).toEqual([
            'casual_attack','combo_a','combo_b','fall','fly','hover','idle','jog','land',
            'laser_back','laser_hip','punch','slam','sprint','takeoff','walk','jump_start','jump_land',
        ].sort());
        for(const clip of doc.animations){
            expect(clip.extras.retargeted).toBe(true);
            expect(clip.extras.keyframesAuthoredHere).toBe(false);
            for(const node of doc.skins[0].joints)
                expect(clip.channels.filter((c:{target:{node:number}})=>c.target.node===node)).toHaveLength(3);
        }
        expect(doc.extras.headBone).toBe('headx');
        expect(doc.animations.find((a:{name:string})=>a.name==='fall').extras.sourceClip).toMatch(/^Jump_air/);
        for (const [name, source] of [['jump_start', 'Jump_Start'], ['jump_land', 'Jump_Land']]) {
            const clip = doc.animations.find((a:{name:string}) => a.name === name);
            expect(clip.extras.sourceClip.startsWith(source)).toBe(true);
            expect(clip.extras.license).toBe('CC0-1.0');
        }
        expect(doc.materials[0].normalTexture).toBeDefined();
        expect(doc.materials[0].pbrMetallicRoughness.baseColorTexture).toBeDefined();
        expect(doc.materials[0].pbrMetallicRoughness.metallicRoughnessTexture).toBeDefined();
    });
    it('has normalized four-influence skinning and weighted fingers on both hands',()=>{
        const used=new Set<number>();
        for(const mesh of doc.meshes)for(const primitive of mesh.primitives){
            const weights=doc.accessors[primitive.attributes.WEIGHTS_0],joints=doc.accessors[primitive.attributes.JOINTS_0];
            const wv=doc.bufferViews[weights.bufferView],jv=doc.bufferViews[joints.bufferView];
            expect(weights.componentType).toBe(5126);expect(joints.componentType).toBe(5121);
            for(let i=0;i<weights.count;i++){
                let total=0;
                for(let k=0;k<4;k++){
                    const w=bin.readFloatLE((wv.byteOffset??0)+(weights.byteOffset??0)+i*16+k*4);
                    const joint=bin.readUInt8((jv.byteOffset??0)+(joints.byteOffset??0)+i*4+k);
                    expect(w).toBeGreaterThanOrEqual(0);expect(joint).toBeLessThan(68);
                    total+=w;if(w>.01)used.add(joint);
                }
                expect(total).toBeCloseTo(1,5);
            }
        }
        for(const side of ['l','r'])for(const finger of ['thumb','index','middle','ring','pinky'])for(const part of [1,2,3]){
            const joint=doc.skins[0].joints.findIndex((i:number)=>doc.nodes[i].name===`${finger}${part}.${side}`);
            expect(joint).toBeGreaterThanOrEqual(0);expect(used.has(joint)).toBe(true);
        }
    });
    it('matches the saved model, source actions, retargeter and Blender reference evidence',()=>{
        expect(hash(bytes)).toBe(provenance.runtimeSha256);
        expect(hash(readFileSync('scripts/adapt-homelander.py'))).toBe(provenance.adapterSha256);
        expect(hash(readFileSync('.asset-source/homelander/blender-reference.json.gz'))).toBe(provenance.referenceSha256);
        for(const [path,sha] of Object.entries(provenance.inputs))expect(hash(readFileSync(path))).toBe(sha);
        expect(provenance.keyframesAuthoredHere).toBe(false);
        expect(doc.extras.animationSource.sourceSha256).toBe(provenance.inputs['.asset-source/homelander/rig.blend']);
        const generation=JSON.parse(readFileSync('.asset-source/homelander/adaptation.json','utf8')).generation;
        for(const key of ['inputs','adapterSha256','referenceSha256','rawExportSha256'])expect(provenance[key]).toEqual(generation[key]);
    });
    it('rejects stale exports instead of stamping them with the current adapter digest',()=>{
        const folder=mkdtempSync(join(tmpdir(),'homelander-stale-'));
        try{
            const link=(source:string,target:string)=>{mkdirSync(dirname(join(folder,target)),{recursive:true});symlinkSync(resolve(source),join(folder,target));};
            for(const path of Object.keys(provenance.inputs))link(path,path);
            // The committed runtime GLB is enough to reach the input checks; the
            // adapter mismatch must be rejected before any output is written.
            link('public/assets/human/homelander.glb','.artifacts/homelander/homelander-raw.glb');
            link('.asset-source/homelander/adaptation.json','.artifacts/homelander/adaptation.json');
            mkdirSync(join(folder,'scripts'),{recursive:true});
            writeFileSync(join(folder,'scripts/adapt-homelander.py'),'changed adapter');
            const result=spawnSync(process.execPath,[resolve('scripts/pack-homelander.mjs')],{cwd:folder,encoding:'utf8'});
            expect(result.status).not.toBe(0);
            expect(result.stderr).toContain('Stale export adapter');
        }finally{rmSync(folder,{recursive:true,force:true});}
    });
});
