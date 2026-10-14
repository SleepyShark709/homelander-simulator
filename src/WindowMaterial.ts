import * as T from 'three';

/** Interior mapping adds view-dependent room depth to repeated façade windows. */
export function windowMaterial(color:number) {
    const material=new T.MeshPhysicalMaterial({color,metalness:.38,roughness:.18,clearcoat:.7,clearcoatRoughness:.14,envMapIntensity:1.15});
    material.customProgramCacheKey=()=> 'city-interior-window-v1';
    material.onBeforeCompile=shader=>{
        shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
            varying vec2 vRoomUv;
            varying vec3 vRoomRay;
            varying float vRoomFace;
        `).replace('#include <begin_vertex>',`#include <begin_vertex>
            vec3 roomCamera=(inverse(modelMatrix)*vec4(cameraPosition,1.0)).xyz;
            float depthScale=0.025;
            #ifdef USE_INSTANCING
                roomCamera=(inverse(instanceMatrix)*vec4(roomCamera,1.0)).xyz;
                depthScale=length(instanceMatrix[2].xyz)/max(length(instanceMatrix[0].xyz),0.01);
            #endif
            vRoomUv=uv;
            vRoomRay=position-roomCamera;
            vRoomRay.z*=depthScale;
            vRoomFace=abs(normal.z);
        `);
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
            varying vec2 vRoomUv;
            varying vec3 vRoomRay;
            varying float vRoomFace;
        `).replace('#include <color_fragment>',`#include <color_fragment>
            vec3 ray=normalize(vec3(vRoomRay.xy,-max(abs(vRoomRay.z),0.001)));
            vec2 roomStart=vRoomUv-0.5;
            vec2 sides=(mix(vec2(-0.5),vec2(0.5),step(vec2(0.0),ray.xy))-roomStart)/(ray.xy+vec2(0.0001));
            float back=-0.85/ray.z;
            float travel=min(back,min(sides.x,sides.y));
            vec3 roomHit=vec3(roomStart,0.0)+ray*travel;
            float roomTone=0.8;
            #ifdef USE_INSTANCING_COLOR
                roomTone=vColor.r;
            #endif
            vec3 roomColor=vec3(0.21,0.205,0.185)*(0.55+roomTone*0.5);
            if(abs(roomHit.y)>0.48)roomColor=roomHit.y<0.0 ? vec3(0.055,0.061,0.065) : vec3(0.29,0.29,0.26);
            if(abs(roomHit.x)>0.48)roomColor*=0.65;
            if(travel>=back-0.001) {
                float desk=step(abs(roomHit.x),0.34)*step(roomHit.y,-0.10)*step(-0.36,roomHit.y);
                roomColor=mix(roomColor,vec3(0.055,0.043,0.033),desk);
                float screen=step(abs(roomHit.x-0.12),0.10)*step(abs(roomHit.y+0.025),0.09);
                roomColor=mix(roomColor,vec3(0.045,0.072,0.086),screen);
            }
            float blind=step(roomTone,0.71)*step(0.72,fract(vRoomUv.y*17.0));
            roomColor=mix(roomColor,vec3(0.19,0.20,0.19),blind*0.65);
            diffuseColor.rgb=mix(diffuseColor.rgb,roomColor,vRoomFace*0.64);
        `);
    };
    return material;
}
