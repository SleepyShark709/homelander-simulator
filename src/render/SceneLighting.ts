import * as T from 'three';
import { CONFIG } from '../core/config';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export class SceneLighting {
    private environmentTarget?: T.WebGLRenderTarget;
    constructor(private renderer: T.WebGLRenderer, private scene: T.Scene) {
        this.scene.background = new T.Color(0x9fbad0);
        this.scene.fog = new T.FogExp2(0xa8bfd0, CONFIG.presentation.fogDensity);
        this.scene.add(new T.HemisphereLight(0xc8e2ff, 0x62594c, CONFIG.presentation.skyFill));
        const sky = new Sky();
        sky.scale.setScalar(1000);
        sky.material.uniforms.turbidity.value = 3.2;
        sky.material.uniforms.rayleigh.value = 1.5;
        sky.material.uniforms.mieCoefficient.value = 0.004;
        sky.material.uniforms.mieDirectionalG.value = 0.8;
        sky.material.uniforms.sunPosition.value.set(-0.5, 0.7, 0.35);
        this.scene.add(sky);
        const environment = new RoomEnvironment();
        const pmrem = new T.PMREMGenerator(this.renderer);
        const reflected = pmrem.fromScene(environment, 0.04);
        this.scene.environment = reflected.texture;
        this.scene.environmentIntensity = CONFIG.presentation.environment;
        environment.dispose();
        pmrem.dispose();
        this.environmentTarget = reflected;
        const sun = new T.DirectionalLight(0xffedda, CONFIG.presentation.sunlight);
        sun.position.set(-45, 80, 40);
        sun.castShadow = true;
        sun.shadow.mapSize.set(CONFIG.presentation.shadowMapSize, CONFIG.presentation.shadowMapSize);
        Object.assign(sun.shadow.camera, {
            left: -CONFIG.presentation.shadowExtent,
            right: CONFIG.presentation.shadowExtent,
            top: CONFIG.presentation.shadowExtent,
            bottom: -CONFIG.presentation.shadowExtent,
            near: 1,
            far: 200,
        });
        sun.shadow.bias = -0.00012;
        sun.shadow.normalBias = CONFIG.presentation.shadowNormalBias;
        this.scene.add(sun);
    }
    async loadEnvironment(graffiti = new URLSearchParams(location.search).get('scene') === 'graffiti') {
        const hdr = await new HDRLoader().loadAsync(graffiti ? '/assets/graffiti-stairs/environment.hdr' : '/assets/pbr/urban_street_03_1k.hdr');
        const pmrem = new T.PMREMGenerator(this.renderer);
        const environment = pmrem.fromEquirectangular(hdr);
        this.environmentTarget?.dispose();
        this.environmentTarget = environment;
        this.scene.environment = environment.texture;
        this.scene.environmentIntensity = CONFIG.presentation.environment;
        hdr.dispose();
        pmrem.dispose();
    }
    dispose() {
        this.environmentTarget?.dispose();
    }
}
