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
        for (const [name, diffuse] of [['worn_asphalt','diff'],['concrete_pavement','diff'],['brick_wall_003','diffuse']]) {
            for (const [channel, stem, size] of [['color',diffuse,'2k'],['normal','nor_gl','1k'],['roughness','rough','1k']])
                surfaces[`${name}/${channel}`] = `pbr/${name}/${name}_${stem}_${size}.jpg`;
        }
        await Promise.all(Object.entries(surfaces).map(async ([key, path]) => {
            const texture = await textureLoader.loadAsync(`/assets/${path}`);
            texture.colorSpace = key.endsWith('/color') ? T.SRGBColorSpace : T.NoColorSpace;
            texture.wrapS = texture.wrapT = T.RepeatWrapping;
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
}
