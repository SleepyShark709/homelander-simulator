import * as T from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
export { PersonVisual } from './PersonVisual';

export class Assets {
    models = new Map<string, GLTF>();
    textures = new Map<string, T.Texture>();
    async load(progress: (name: string, pct: number) => void) {
        const files: Record<string, string> = {
            person: 'human/native-player.glb',
            civilian2: 'human/native-npc.glb',
            streetLamp: 'street-lamp/street_lamp_01_1k.gltf',
            cafeSet: 'city-details/outdoor_table_chair_set_01/outdoor_table_chair_set_01_2k.gltf',
            pottedPlant: 'city-details/potted_plant_02/potted_plant_02_2k.gltf',
            shopCabinet: 'city-details/drawer_cabinet/drawer_cabinet_2k.gltf',
            shutter: 'city-details/rollershutter_door/rollershutter_door_2k.gltf',
        };
        const loader = new GLTFLoader();
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
        const failure = results.find((r) => r.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
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
}
