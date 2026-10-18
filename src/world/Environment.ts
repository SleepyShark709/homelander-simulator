import * as T from 'three';
import type { Assets } from '../core/Assets';
import { CitySurfaces } from './CitySurfaces';
import { StreetProps } from './StreetProps';

export class CityArt {
    asphalt: T.MeshStandardMaterial;
    paving: T.MeshStandardMaterial;
    surfaces: CitySurfaces;
    street: StreetProps;
    plaza: T.MeshStandardMaterial;
    private awnings = new Map<number,T.MeshStandardMaterial>();
    private owned = new Set<T.Material>();
    private textures = new Set<T.Texture>();
    constructor(assets: Assets) {
        this.surfaces = new CitySurfaces(assets);
        this.asphalt = this.surfaces.asphalt;
        this.paving = this.surfaces.paving;
        this.plaza = this.surfaces.stone;
        this.street = new StreetProps(assets.textures.get('foliage/color'), assets.textures);
    }
    sign(text: string, width: number) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 96;
        const c = canvas.getContext('2d')!;
        c.fillStyle = '#142632';
        c.fillRect(0, 0, 512, 96);
        c.fillStyle = '#dcd6bd';
        c.font = '500 32px sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(text, 256, 49);
        const texture = new T.CanvasTexture(canvas);
        texture.colorSpace = T.SRGBColorSpace;
        this.textures.add(texture);
        const material = new T.MeshStandardMaterial({
            map: texture,
            roughness: 0.7,
        });
        this.owned.add(material);
        return new T.Mesh(
            new T.PlaneGeometry(width, (width * 96) / 512),
            material,
        );
    }
    awning(width: number, style = 0) {
        let material = this.awnings.get(style);
        if (!material) {
            const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
            const c = canvas.getContext('2d')!;
            c.fillStyle = '#d9d2bf'; c.fillRect(0,0,256,64);
            c.fillStyle = style === 0 ? '#294d4c' : '#69433a';
            for (let x = 0; x < 256; x += 64) c.fillRect(x,0,32,64);
            const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
            texture.wrapS = T.RepeatWrapping;
            this.textures.add(texture);
            material = new T.MeshStandardMaterial({ map: texture, roughness: .96, envMapIntensity: .2 });
            this.awnings.set(style,material); this.owned.add(material);
        }
        const group = new T.Group(); group.name = 'striped-shop-awning';
        const cloth = new T.BoxGeometry(width,.07,1.2);
        const uv = cloth.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setX(i,uv.getX(i)*width/3);
        const canopy = new T.Mesh(cloth,material);
        canopy.rotation.x = .18; canopy.position.set(0,-.11,.58); canopy.castShadow = true;
        group.add(canopy);
        const valanceGeometry = new T.BoxGeometry(width,.2,.055);
        const valanceUv = valanceGeometry.attributes.uv;
        for (let i = 0; i < valanceUv.count; i++) valanceUv.setX(i,valanceUv.getX(i)*width/3);
        const valance = new T.Mesh(valanceGeometry,material);
        valance.position.set(0,-.32,1.16); valance.castShadow = true; group.add(valance);
        return group;
    }
    dispose() {
        this.surfaces.dispose();
        this.street.dispose();
        this.owned.forEach((m) => m.dispose());
        this.textures.forEach((t) => t.dispose());
    }
}
