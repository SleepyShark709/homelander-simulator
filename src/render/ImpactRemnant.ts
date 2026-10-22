import * as T from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { CONFIG } from '../core/config';

/** A short visual handoff; the original entity and its collision die immediately. */
export class ImpactRemnant {
    readonly active:Array<{root:T.Object3D; life:number; progress:{value:number}; direction:T.Vector3}>=[];
    constructor(private group:T.Group) {}
    spawn(source:T.Object3D,direction:T.Vector3) {
        if(this.active.length>=CONFIG.superSpeed.bloodBursts)this.remove(this.active[0]);
        source.updateWorldMatrix(true,true);
        const root=clone(source), progress={value:0};
        source.matrixWorld.decompose(root.position,root.quaternion,root.scale);
        root.traverse(object=>{
            if(!(object instanceof T.Mesh))return;
            const adapt=(original:T.Material)=>{
                const material=original.clone();
                material.onBeforeCompile=shader=>{
                    shader.uniforms.impactProgress=progress;
                    shader.vertexShader='varying vec3 impactPosition;\n'+shader.vertexShader;
                    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',
                        'impactPosition=(modelMatrix*vec4(transformed,1.)).xyz;\n#include <project_vertex>');
                    shader.fragmentShader='uniform float impactProgress; varying vec3 impactPosition;\n'+shader.fragmentShader;
                    shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
                        float grain=fract(sin(dot(floor(impactPosition*70.),vec3(12.9898,78.233,43.17)))*43758.5453);
                        if(grain<impactProgress)discard;
                        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.22,.002,.004),impactProgress*.85);`);
                };
                material.customProgramCacheKey=()=> 'impact-remnant';
                return material;
            };
            object.material=Array.isArray(object.material)?object.material.map(adapt):adapt(object.material);
            object.castShadow=false;
        });
        this.group.add(root);
        this.active.push({root,life:CONFIG.superSpeed.impactTransition,progress,direction:direction.clone()});
    }
    update(dt:number) {
        for(const remnant of [...this.active]) {
            remnant.life=Math.max(0,remnant.life-dt);
            remnant.progress.value=1-remnant.life/CONFIG.superSpeed.impactTransition;
            remnant.root.position.addScaledVector(remnant.direction,dt*10);
            if(remnant.life===0)this.remove(remnant);
        }
    }
    private remove(remnant:(typeof this.active)[number]) {
        const materials=new Set<T.Material>(),skeletons=new Set<T.Skeleton>();
        remnant.root.traverse(object=>{
            if(object instanceof T.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);
            if(object instanceof T.SkinnedMesh)skeletons.add(object.skeleton);
        });
        materials.forEach(material=>material.dispose());skeletons.forEach(skeleton=>skeleton.dispose());
        remnant.root.removeFromParent();this.active.splice(this.active.indexOf(remnant),1);
    }
    dispose() {for(const remnant of [...this.active])this.remove(remnant);}
}
