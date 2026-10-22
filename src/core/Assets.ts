import * as T from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { CONFIG } from './config';

export class Assets {
    models = new Map<string, GLTF>();
    textures = new Map<string, T.Texture>();
    readonly graffitiTrial = new URLSearchParams(globalThis.location?.search ?? '').get('scene') === 'graffiti';
    graffitiCity = false;
    async load(progress: (name: string, pct: number) => void, renderer?: T.WebGLRenderer) {
        const query = new URLSearchParams(globalThis.location?.search ?? '');
        if (renderer && !this.graffitiTrial && query.get('scene') !== 'legacy' && !query.has('whitebox')) {
            const available = await fetch('/assets/graffiti-city/build.json');
            this.graffitiCity = available.ok && Boolean(available.headers.get('content-type')?.includes('json'));
        }
        const requested = new URLSearchParams(globalThis.location?.search ?? '').get('heroStyle');
        const style = requested === 'restrained' || requested === 'commanding' ? requested : 'natural';
        const styleSample = requested !== 'baseline';
        const files: Record<string, string> = {
            person: styleSample ? 'human/homelander-style.glb' : 'human/homelander.glb',
            civilian2: 'human/native-npc.glb',
            streetLamp: 'street-lamp/street_lamp_01_1k.gltf',
            cafeSet: 'city-details/outdoor_table_chair_set_01/outdoor_table_chair_set_01_2k.gltf',
            pottedPlant: 'city-details/potted_plant_02/potted_plant_02_2k.gltf',
            shopCabinet: 'city-details/drawer_cabinet/drawer_cabinet_2k.gltf',
            shutter: 'city-details/rollershutter_door/rollershutter_door_2k.gltf',
            district: 'jiangwan/district.glb',
            sceneWhitebox: 'scene-density/whitebox.glb',
            aircon: 'scene-density/aircon.glb',
            seating: 'scene-density/seating.glb',
            bus: 'jiangwan/bus.glb',
            scooter: 'jiangwan/scooter.glb',
            sedan: 'jiangwan/sedan.glb',
        };
        if (this.graffitiCity) files.graffitiCity = 'graffiti-city/city.gltf';
        else files.sceneDensity = this.graffitiTrial ? 'graffiti-stairs/scene.gltf' : 'scene-density/street-sample.glb';
        const loader = new GLTFLoader();
        let compressed: import('three/addons/loaders/KTX2Loader.js').KTX2Loader | undefined;
        if (this.graffitiTrial || this.graffitiCity) {
            if (!renderer) throw new Error('写实场景需要主渲染器检测压缩纹理支持');
            const { KTX2Loader } = await import('three/addons/loaders/KTX2Loader.js');
            compressed = new KTX2Loader().setTranscoderPath('/assets/graffiti-stairs/basis/')
                .setWorkerLimit(CONFIG.graffitiTrial.textureWorkers).detectSupport(renderer);
            loader.setKTX2Loader(compressed);
        }
        let count = 0;
        const results = await Promise.allSettled(
            Object.entries(files).map(async ([key, file]) => {
                try {
                    this.models.set(
                        key,
                        await loader.loadAsync(`/assets/${file}`),
                    );
                } catch {
                    throw new Error(`模型加载失败：${file}`);
                }
                progress(
                    `载入模型 · ${file}`,
                    10 + Math.round((++count / Object.keys(files).length) * 80),
                );
            }),
        );
        compressed?.dispose();
        const failure = results.find((r) => r.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
        if (styleSample) this.models.get('person')!.parser.json.extras.activeStyleProfile = style;
        this.models.set('police',this.models.get('civilian2')!);
        this.models.set('soldier',this.models.get('civilian2')!);
        const textureLoader = new T.TextureLoader();
        const surfaces: Record<string, string> = {};
        for (const [name, diffuse] of [['worn_asphalt','diff'],['concrete_pavement','diff'],['brick_wall_003','diffuse'],
            ['concrete_wall_006','diff'],['stone_tiles_02','diff'],['rectangular_facade_tiles','diff'],['asphalt_05','diff']]) {
            for (const [channel, stem, size] of [['color',diffuse,'2k'],['normal','nor_gl','1k'],['roughness','rough','1k'],['ao','ao','1k']])
                surfaces[`${name}/${channel}`] = `pbr/${name}/${name}_${stem}_${size}.jpg`;
        }
        surfaces['foliage/color'] = 'foliage/broadleaf-branch-v1.png';
        for (const [channel, stem] of [['color','diff'],['normal','nor_gl'],['roughness','rough'],['ao','ao']])
            surfaces[`bark_brown_02/${channel}`] = `pbr/bark_brown_02/bark_brown_02_${stem}_1k.jpg`;
        await Promise.all(Object.entries(surfaces).map(async ([key, path]) => {
            const texture = await textureLoader.loadAsync(`/assets/${path}`);
            texture.colorSpace = key.endsWith('/color') ? T.SRGBColorSpace : T.NoColorSpace;
            texture.wrapS = texture.wrapT = T.RepeatWrapping;
            // New scans cover two metres; the shared geometry UV unit is four.
            if (['concrete_wall_006','stone_tiles_02','rectangular_facade_tiles','asphalt_05'].includes(key.split('/')[0]))
                texture.repeat.set(2, 2);
            texture.anisotropy = 8;
            this.textures.set(key, texture);
        }));
    }
    clone(key: string) {
        const source = this.models.get(key);
        if (!source) throw new Error(`缺失模型 ${key}`);
        const result = cloneSkeleton(source.scene) as T.Group;
        result.traverse((o) => {
            if (o instanceof T.Mesh) {
                o.castShadow = true;
                o.receiveShadow = true;
            }
        });
        return result;
    }
    fit(key: string, size: T.Vector3) {
        const model = this.clone(key),
            bounds = new T.Box3().setFromObject(model),
            dimensions = bounds.getSize(new T.Vector3());
        const center = bounds.getCenter(new T.Vector3());
        model.position.set(-center.x, -bounds.min.y, -center.z);
        const pivot = new T.Group();
        pivot.add(model);
        pivot.scale.set(
            size.x / dimensions.x,
            size.y / dimensions.y,
            size.z / dimensions.z,
        );
        return pivot;
    }
    /** Preserve scanned proportions, ground the asset, and isolate damage tint. */
    prop(key: string, height: number, variant = 0) {
        const model = this.clone(key);
        if (key === 'shutter') {
            const selected = model.children[variant % model.children.length];
            for (const child of [...model.children]) if (child !== selected) child.removeFromParent();
        }
        const bounds = new T.Box3().setFromObject(model);
        const center = bounds.getCenter(new T.Vector3());
        const size = bounds.getSize(new T.Vector3());
        model.position.sub(new T.Vector3(center.x, bounds.min.y, center.z));
        model.traverse(o => {
            if (!(o instanceof T.Mesh)) return;
            o.userData.keepSharedGeometry = true;
            o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
        });
        const pivot = new T.Group();
        pivot.name = `detail-${key}`;
        pivot.userData.assetKey = key;
        pivot.add(model);
        pivot.scale.setScalar(height / size.y);
        return pivot;
    }
    disposeScene(group: T.Group) {
        const sharedGeometry = new Set<T.BufferGeometry>(),
            sharedMaterial = new Set<T.Material>();
        for (const g of this.models.values())
            g.scene.traverse((o) => {
                if (o instanceof T.Mesh) {
                    sharedGeometry.add(o.geometry);
                    for (const m of Array.isArray(o.material)
                        ? o.material
                        : [o.material])
                        sharedMaterial.add(m);
                }
            });
        const geometries = new Set<T.BufferGeometry>(),
            materials = new Set<T.Material>();
        group.traverse((o) => {
            if (o instanceof T.InstancedMesh) o.dispose();
            if (o instanceof T.Mesh) {
                geometries.add(o.geometry);
                for (const m of Array.isArray(o.material)
                    ? o.material
                    : [o.material])
                    materials.add(m);
            }
        });
        for (const g of geometries) if (!sharedGeometry.has(g)) g.dispose();
        for (const m of materials) if (!sharedMaterial.has(m)) m.dispose();
    }
    dispose() {
        const geometries = new Set<T.BufferGeometry>(),
            materials = new Set<T.Material>(),
            textures = new Set<T.Texture>();
        for (const asset of this.models.values())
            asset.scene.traverse((o) => {
                if (o instanceof T.Mesh) {
                    geometries.add(o.geometry);
                    for (const m of Array.isArray(o.material)
                        ? o.material
                        : [o.material]) {
                        materials.add(m);
                        for (const value of Object.values(m))
                            if (value instanceof T.Texture) textures.add(value);
                    }
                }
            });
        geometries.forEach((g) => g.dispose());
        materials.forEach((m) => m.dispose());
        textures.forEach((t) => t.dispose());
        this.models.clear();
        this.textures.forEach(t=>t.dispose());
        this.textures.clear();
    }
}
