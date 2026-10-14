// Uses Mesh2Motion's unmodified MIT human retargeter. No authored poses/keyframes.
// Run with Vite running. --apply installs the baked clips into the shipped GLBs.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const vendorRoot = path.join(root, 'scripts/vendor/mesh2motion');
const codeRoot = path.join(root, '.asset-source/mesh2motion-code');
if (fs.existsSync(path.join(codeRoot, 'core-files.txt'))) {
    const files = fs.readFileSync(path.join(codeRoot, 'core-files.txt'), 'utf8').trim().split('\n');
    for (const file of files) {
        const target = path.join(vendorRoot, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(codeRoot, file), target);
    }
    fs.copyFileSync('.asset-source/mesh2motion/LICENSE-MIT.MD', path.join(vendorRoot, 'LICENSE-MIT.MD'));
    fs.copyFileSync(path.join(codeRoot, 'commit.txt'), path.join(vendorRoot, 'UPSTREAM_COMMIT'));
}
const upstreamCommit = fs.readFileSync(path.join(vendorRoot, 'UPSTREAM_COMMIT'),'utf8').trim();
const output = '.asset-source/mesh2motion-retargeted';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://127.0.0.1:5173/?preview=character');
await page.waitForFunction(() => window.studio?.person, { timeout: 20000 });
const result = await page.evaluate(async () => {
    window.studio.renderer.setAnimationLoop(null);
    const T = await import('/node_modules/.vite/deps/three.js');
    const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const { Rig } = await import('/scripts/vendor/mesh2motion/src/retarget/human-retargeting/Rig.ts');
    const { Retargeter } = await import('/scripts/vendor/mesh2motion/src/retarget/human-retargeting/Retargeter.ts');
    const { HumanChainConfig } = await import('/scripts/vendor/mesh2motion/src/retarget/human-retargeting/HumanChainConfig.ts');
    const loader = new GLTFLoader();
    const bundle = {};
    for (const key of ['base','addon']) bundle[key] = await loader.loadAsync(`/.asset-source/mesh2motion/human-${key}-animations.glb`);
    const template = await loader.loadAsync('/.asset-source/mesh2motion/rig-human.glb');
    const orderedSkeleton = (scene) => {
        scene.updateMatrixWorld(true);
        const bones = [];
        scene.traverse(o => { if (o.isBone) bones.push(o); });
        return new T.Skeleton(bones);
    };
    const mapping = [
        ['idle','base','Idle_A'], ['walk','base','Walk'], ['jog','base','Jog'], ['sprint','base','Sprint'],
        ['punch','base','Punch_Jab'], ['shoot','base','Pistol_Aim_Neutral'], ['fall','base','Jump_air'],
        ['hover','addon','Levitate Idle'], ['fly','addon','Flying Forward Super'],
        ['takeoff','addon','Levitate Entrance'], ['land','addon','Land_Three_Point'], ['slam','addon','Attack_Ground_Pound'],
    ];
    const roles = {};
    for (const role of ['hero','civilian']) {
        const target = await loader.loadAsync(`/.asset-source/mesh2motion-input/${role}.glb`);
        const clips = [];
        let mappingCount = 0;
        for (const [name,key,sourceName] of mapping) {
            const source = template.scene.clone(true);
            const working = target.scene.clone(true);
            const sourceSkeleton = orderedSkeleton(source), targetSkeleton = orderedSkeleton(working);
            const sourceNames = new Set(sourceSkeleton.bones.map(b => b.name));
            const boneMap = new Map(targetSkeleton.bones.filter(b => sourceNames.has(b.name.toLowerCase())).map(b => [b.name,b.name.toLowerCase()]));
            mappingCount = boneMap.size;
            const config = HumanChainConfig.build_custom_source_config(boneMap);
            const sourceRig = new Rig(sourceSkeleton).fromConfig(config);
            const targetRig = new Rig(targetSkeleton).fromConfig(HumanChainConfig.build_custom_target_config(config,boneMap));
            const input = bundle[key].animations.find(a => a.name === sourceName);
            if (!input) throw new Error('Missing upstream animation: '+sourceName);
            const retargeter = new Retargeter(sourceRig,targetRig,input);
            retargeter.action.setLoop(T.LoopOnce,1);
            retargeter.action.clampWhenFinished = true;
            const tracks = retargeter.bake_animation_to_tracks(60);
            const clip = new T.AnimationClip(name,input.duration,tracks);
            clips.push({ ...T.AnimationClip.toJSON(clip), sourceName, bundle:key, license:'CC0-1.0' });
        }
        roles[role] = { mappingCount, clips };
    }
    return roles;
});
await browser.close();
if (errors.length) throw new Error(errors.join('\n'));
for (const [role,data] of Object.entries(result)) fs.writeFileSync(`${output}/${role}.json`, JSON.stringify(data));
console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([role,data]) => [role,{mappedBones:data.mappingCount,clips:data.clips.map(c=>[c.name,c.sourceName,c.duration])}])) ,null,2));

if (process.argv.includes('--apply')) {
    // Append only tool-produced tracks. Preserve original mesh, skin, textures,
    // bind pose and game metadata. No rotation or pose corrections are applied.
    const backup = '.asset-source/mesh2motion-input';
    fs.mkdirSync(backup, { recursive: true });
    for (const [role,data] of Object.entries(result)) {
        const target = `public/assets/human/${role}.glb`;
        if (!fs.existsSync(`${backup}/${role}.glb`)) fs.copyFileSync(target,`${backup}/${role}.glb`);
        const raw = fs.readFileSync(`${backup}/${role}.glb`), jsonLength = raw.readUInt32LE(12);
        const doc = JSON.parse(raw.subarray(20,20+jsonLength));
        const chunks = [raw.subarray(28+jsonLength)];
        let offset = chunks[0].length;
        const accessor = (values,size) => {
            const buffer = Buffer.alloc(values.length*4);
            values.forEach((value,i) => buffer.writeFloatLE(value,i*4));
            const view = doc.bufferViews.length;
            doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:buffer.length});
            chunks.push(buffer);offset += buffer.length;
            const index = doc.accessors.length;
            doc.accessors.push({bufferView:view,componentType:5126,count:values.length/size,type:size===4?'VEC4':size===3?'VEC3':'SCALAR',...(size===1?{min:[values[0]],max:[values.at(-1)]}:{})});
            return index;
        };
        const nodes = new Map(doc.nodes.map((n,i)=>[n.name,i]));
        doc.animations = data.clips.map(clip => {
            const samplers = [], channels = [];
            for (const track of clip.tracks) {
                const [bone,property] = track.name.split('.');
                if (!nodes.has(bone)) throw new Error('Missing target bone: '+bone);
                const input = accessor(track.times,1), output = accessor(track.values,property==='quaternion'?4:3);
                channels.push({sampler:samplers.length,target:{node:nodes.get(bone),path:property==='quaternion'?'rotation':'translation'}});
                samplers.push({input,output,interpolation:'LINEAR'});
            }
            return {name:clip.name,channels,samplers,extras:{source:'Mesh2Motion',sourceClip:clip.sourceName,bundle:clip.bundle,license:clip.license,retargeterCommit:upstreamCommit}};
        });
        doc.extras.locomotion = Object.fromEntries(['walk','jog','sprint'].map((name,i)=>[name,{baseSpeed:[1.5,4,8][i],source:'Mesh2Motion',sourceClip:data.clips.find(c=>c.name===name).sourceName}]));
        doc.extras.animationSource = {author:'Mesh2Motion / contributors',license:'CC0-1.0',url:'https://github.com/Mesh2Motion/mesh2motion-app',retargeter:'Mesh2Motion human swing/twist',keyframesAuthoredHere:false};
        doc.buffers[0].byteLength = offset;
        let json = Buffer.from(JSON.stringify(doc));
        json = Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]);
        const binary = Buffer.concat(chunks), header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
        header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.write('JSON',16);
        binHeader.writeUInt32LE(binary.length);binHeader.write('BIN\0',4);
        fs.writeFileSync(target,Buffer.concat([header,json,binHeader,binary]));
        if (role === 'hero') fs.writeFileSync('public/assets/human/rig-metadata.json',JSON.stringify(doc.extras,null,2)+'\n');
    }
}
