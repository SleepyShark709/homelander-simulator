import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

class ContactAO extends GTAOPass {
    override render(renderer:T.WebGLRenderer,write:T.WebGLRenderTarget,read:T.WebGLRenderTarget,dt:number,mask:boolean) {
        // Alpha cards already appear in the colour pass. An opaque normal override
        // would turn leaves and hair into rectangles in the occlusion buffer.
        const hidden:T.Object3D[]=[];
        this.scene.traverse(o=>{
            if (o instanceof T.Mesh && o.visible) {
                const materials=Array.isArray(o.material) ? o.material : [o.material];
                if(materials.some(m=>(m as T.MeshStandardMaterial).alphaTest>0 || m.opacity<1)) {hidden.push(o);o.visible=false;}
            }
        });
        const updateShadows=renderer.shadowMap.autoUpdate;
        renderer.shadowMap.autoUpdate=false;
        try {super.render(renderer,write,read,dt,mask);}
        finally {renderer.shadowMap.autoUpdate=updateShadows;hidden.forEach(o=>o.visible=true);}
    }
}

export class CityRenderer {
    composer:EffectComposer;
    color:RenderPass;
    ao:ContactAO;
    output=new OutputPass();
    bloom=new UnrealBloomPass(new T.Vector2(512,512),.16,.3,2.5);
    constructor(public renderer:T.WebGLRenderer,scene:T.Scene,camera:T.Camera) {
        const target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:4});
        this.composer=new EffectComposer(renderer,target);
        this.color=new RenderPass(scene,camera);
        this.ao=new ContactAO(scene,camera);
        this.ao.blendIntensity=.7;
        this.ao.updateGtaoMaterial({radius:1.4,thickness:.3,distanceFallOff:1,samples:8,screenSpaceRadius:false});
        this.ao.updatePdMaterial({samples:8,radius:6});
        this.composer.addPass(this.color);this.composer.addPass(this.ao);this.composer.addPass(this.bloom);this.composer.addPass(this.output);
        renderer.info.autoReset=false;
    }
    camera(camera:T.Camera) { this.color.camera=camera;this.ao.camera=camera; }
    resize(width:number,height:number) {
        const ratio=this.renderer.getPixelRatio();
        this.composer.setPixelRatio(ratio);this.composer.setSize(width,height);
        this.ao.setSize(Math.round(width*ratio*.55),Math.round(height*ratio*.55));
    }
    render(dt=0) {this.renderer.info.reset();this.composer.render(dt);}
    dispose() {this.color.dispose();this.ao.dispose();this.bloom.dispose();this.output.dispose();this.composer.dispose();}
}
