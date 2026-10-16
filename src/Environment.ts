import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Assets } from './Assets';
import { CitySurfaces, metreBox } from './CitySurfaces';
import { StreetProps } from './StreetProps';
import { windowMaterial } from './WindowMaterial';

export class CityArt {
    asphalt: T.MeshStandardMaterial;
    paving: T.MeshStandardMaterial;
    plaza: T.MeshStandardMaterial;
    surfaces: CitySurfaces;
    street: StreetProps;
    private owned = new Set<T.Material>();
    private textures = new Set<T.Texture>();
    private facades = new Map<number,{concrete:T.MeshStandardMaterial;trim:T.MeshStandardMaterial;glass:T.MeshPhysicalMaterial}>();
    private awnings = new Map<number,T.MeshStandardMaterial>();
    constructor(assets: Assets) {
        this.surfaces = new CitySurfaces(assets);
        this.street = new StreetProps(assets.textures.get('foliage/color'), assets.textures);
        this.asphalt = this.surfaces.asphalt;
        this.paving = this.surfaces.paving;
        this.plaza = this.surfaces.stone;
    }
    architecture(
        width: number,
        height: number,
        depth: number,
        variant: number,
        background = false,
        crown = false,
    ) {
        const group = new T.Group();
        const solids: {position: T.Vector3; size: T.Vector3}[] = [];
        group.userData.solids = solids;
        const style = variant % 4;
        let facade=this.facades.get(style);
        if(!facade) {
        const surface = style === 0 ? this.surfaces.brick : style === 2 ? this.surfaces.cladding : this.surfaces.concrete;
        const concrete = surface.clone();
        concrete.color.set([0xc3ad98, 0xc2ccd0, 0xe4d7bc, 0xa3b1b8][style]);
        concrete.name = `facade-${style}`;
        const trim = new T.MeshStandardMaterial({
            color: 0x56616a,
            map: this.surfaces.concrete.map,
            normalMap: this.surfaces.concrete.normalMap,
            normalScale: new T.Vector2(.3, .3),
            roughnessMap: this.surfaces.concrete.roughnessMap,
            aoMap: this.surfaces.concrete.aoMap,
            aoMapIntensity: .6,
            roughness: 0.9,
            metalness: 0.08,
        });
        const glass = windowMaterial(style===1 ? 0x506877 : 0x364b58);
        [concrete, trim, glass].forEach((m) => this.owned.add(m));
        facade={concrete,trim,glass};this.facades.set(style,facade);
        }
        const {concrete,trim,glass}=facade;
        const walls: T.BufferGeometry[] = [],
            details: T.BufferGeometry[] = [],
            paneTransforms: T.Matrix4[] = [],
            paneColors: T.Color[] = [];
        const box = (
            list: T.BufferGeometry[],
            w: number,
            h: number,
            d: number,
            x: number,
            y: number,
            z: number,
        ) => {
            const g = metreBox(w, h, d, style === 0 ? 3.5 : 4);
            g.translate(x, y, z);
            list.push(g);
        };
        box(walls, width, height, depth, 0, height / 2, 0);
        const floors = Math.max(2, Math.round(height / (style === 2 ? 3.5 : 3.25))),
            storey = height / floors;
        for (let floor = 0; floor < floors; floor++) {
            const y = storey * floor + storey * 0.55;
            for (let face = 0; face < 4; face++) {
                const storefront = floor === 0 && !background;
                const extent = face < 2 ? width : depth,
                    cols = Math.floor((extent - 0.8) / (storefront ? 3.8 : 2.7)),
                    spacing = (extent - 0.8) / cols;
                for (let col = 0; col < cols; col++) {
                    const offset = -extent / 2 + 0.4 + spacing * (col + 0.5),
                        sign = face % 2 ? -1 : 1;
                    // Leave the existing entrance and its collision footprint clear.
                    if (storefront && face === 0 && Math.abs(offset) < 2.2) continue;
                    const paneWidth = spacing * (storefront ? .82 : style === 1 ? .94 : .63);
                    const paneHeight = storey * (storefront ? .74 : style === 1 ? .84 : .63);
                    const position =
                        face < 2
                            ? new T.Vector3(
                                  offset,
                                  y,
                                  sign * (depth / 2 + 0.012),
                              )
                            : new T.Vector3(
                                  sign * (width / 2 + 0.012),
                                  y,
                                  offset,
                              );
                    const rotation = new T.Quaternion().setFromAxisAngle(
                        new T.Vector3(0, 1, 0),
                        face < 2 ? 0 : Math.PI / 2,
                    );
                    paneTransforms.push(
                        new T.Matrix4().compose(
                            position,
                            rotation,
                            new T.Vector3(paneWidth, paneHeight, 0.035),
                        ),
                    );
                    const tone =
                        0.64 +
                        ((floor * 17 + col * 7 + variant * 11 + face * 3) % 9) * 0.042;
                    paneColors.push(new T.Color(tone, tone, tone));
                    if (storefront && style % 2 === 0 && (face === 0 || face === 2)) {
                        const canopy = this.awning(paneWidth + .2, style);
                        canopy.position.copy(position); canopy.position.y = storey - .03;
                        canopy.rotation.y = face === 2 ? Math.PI / 2 : 0;
                        group.add(canopy);
                        solids.push({
                            position: canopy.position.clone().add(new T.Vector3(face === 2 ? .6 : 0, -.15, face === 0 ? .6 : 0)),
                            size: new T.Vector3(face === 2 ? 1.25 : paneWidth + .2, .5, face === 0 ? 1.25 : paneWidth + .2),
                        });
                    }
                    if (!background && style !== 1) {
                        const pw = paneWidth + .10, ph = paneHeight + .10;
                        const frame = face < 2;
                        box(details, frame ? pw : 0.12, 0.10, frame ? 0.12 : pw,
                            position.x, y-ph/2, position.z);
                        box(details, frame ? pw : 0.12, 0.10, frame ? 0.12 : pw,
                            position.x, y+ph/2, position.z);
                        for (const edge of [-1,1]) box(details, frame ? 0.08 : 0.10, ph, frame ? 0.10 : 0.08,
                            position.x+(frame ? edge*pw/2 : 0), y, position.z+(frame ? 0 : edge*pw/2));
                        box(details, frame ? pw : 0.12, 0.055, frame ? 0.12 : pw,
                            position.x, y, position.z);
                    }
                }
            }
            box(
                details,
                width + 0.03,
                style === 2 ? 0.24 : 0.08,
                0.045,
                0,
                storey * (floor + 1) - 0.11,
                depth / 2 + 0.04,
            );
            box(
                details,
                width + 0.03,
                0.08,
                0.045,
                0,
                storey * (floor + 1) - 0.11,
                -depth / 2 - 0.04,
            );
            box(
                details,
                0.045,
                0.08,
                depth,
                width / 2 + 0.04,
                storey * (floor + 1) - 0.11,
                0,
            );
            box(
                details,
                0.045,
                0.08,
                depth,
                -width / 2 - 0.04,
                storey * (floor + 1) - 0.11,
                0,
            );
        }
        if (!background) {
            // Drainpipes and brackets give close façades a readable silhouette
            // and cast real shadows while remaining inside the existing hull.
            for (const side of [-1, 1]) {
                const pipe = new T.CylinderGeometry(.055, .055, height, 8);
                pipe.translate(side * (width / 2 - .18), height / 2, depth / 2 + .075);
                details.push(pipe);
                for (let y = 1; y < height; y += 3.2)
                    box(details, .18, .08, .14, side * (width / 2 - .18), y, depth / 2 + .06);
            }
            // Ground-floor shops, deep lintels, stone piers and vertical façade rhythm.
            for (const side of [-1,1]) {
                for (let x=-width/2+0.55; x<width/2; x+=style===2 ? 3.7 : 5.4)
                    box(walls,0.22,height,0.16,x,height/2,side*(depth/2+0.04));
                box(walls,width+0.18,0.35,0.20,0,3.35,side*(depth/2+0.04));
                box(details,width,0.13,0.15,0,0.45,side*(depth/2+0.04));
            }
            if (style===0 || style===2) {
                box(walls,width+0.2,0.45,depth+0.2,0,height-0.22,0);
                box(details,width+0.23,0.09,depth+0.23,0,height-0.5,0);
            }
            for (let i=0;i<3;i++) {
                const x=-width*.24+i*width*.24, y=height+0.65, z=-depth*.18;
                box(details,2.1,1.3,1.5,x,y,z);
                solids.push({position:new T.Vector3(x,y,z),size:new T.Vector3(2.1,1.3,1.5)});
                for(let slat=0;slat<7;slat++) box(walls,1.75,0.045,0.05,x,y-0.43+slat*.14,z+0.77);
            }
            const rooftop = new T.Mesh(metreBox(width-.5,.035,depth-.5),this.surfaces.roof);
            rooftop.position.y=height+.018; rooftop.receiveShadow=true; group.add(rooftop);
            const lift=new T.Mesh(metreBox(3.7,2.4,4.0),concrete);
            lift.position.set(width*.28,height+1.2,-depth*.28);lift.castShadow=true;group.add(lift);
            solids.push({position:lift.position.clone(),size:new T.Vector3(3.7,2.4,4.0)});
        }
        // Parapets share the existing rooftop collision height; equipment stays on the roof.
        for (const side of [-1,1]) {
            box(details,width,0.55,0.22,0,height+.275,side*(depth/2-.11));
            box(details,0.22,0.55,depth,side*(width/2-.11),height+.275,0);
            if (!background) {
                solids.push({position:new T.Vector3(0,height+.275,side*(depth/2-.11)),size:new T.Vector3(width,.55,.22)});
                solids.push({position:new T.Vector3(side*(width/2-.11),height+.275,0),size:new T.Vector3(.22,.55,depth)});
            }
        }
        const create = (parts: T.BufferGeometry[], material: T.Material) => {
            const geometry = mergeGeometries(parts)!;
            parts.forEach((p) => p.dispose());
            const mesh = new T.Mesh(geometry, material);
            mesh.castShadow = !background;
            mesh.receiveShadow = !background;
            group.add(mesh);
        };
        create(walls, concrete);
        create(details, trim);
        const panes = new T.InstancedMesh(
            // Interior mapping supplies depth; hidden box faces did five times
            // the useful work across tens of thousands of skyline windows.
            new T.PlaneGeometry(1, 1),
            glass,
            paneTransforms.length,
        );
        paneTransforms.forEach((m, i) => {
            panes.setMatrixAt(i, m);
            panes.setColorAt(i, paneColors[i]);
        });
        panes.receiveShadow = !background;
        group.add(panes);
        if (!background) {
            const entrance = new T.Mesh(
                new T.BoxGeometry(3.8, 2.7, 0.07),
                glass,
            );
            entrance.position.set(0, 1.35, depth / 2 + 0.035);
            group.add(entrance);
            const canopy = new T.Mesh(metreBox(4.4, 0.15, 1.6), trim);
            canopy.position.set(0, 2.8, depth / 2 + 0.6);
            canopy.castShadow = true;
            group.add(canopy);
            solids.push({position:canopy.position.clone(),size:new T.Vector3(4.4,.15,1.6)});
            for(const x of [-1.75,1.75]) {
                const frame = new T.Mesh(metreBox(.12,2.72,.14),trim);
                frame.position.set(x,1.36,depth/2+.07);group.add(frame);
            }
            const entrySign=this.sign(style===0 ? 'MARKET & CO.' : style===2 ? 'CITY HALL' : 'LOBBY',3.6);
            entrySign.position.set(0,3.02,depth/2+.085);group.add(entrySign);
        }
        if(style===1 && height>25 && !crown) {
            const w=width*.58,h=height*.28,d=depth*.58;
            const upper=this.architecture(w,h,d,variant,true,true);
            upper.position.set(-width*.12,height,-depth*.12);
            upper.traverse(o=>{if(o instanceof T.Mesh)o.castShadow=o.receiveShadow=!background;});
            group.add(upper);
            if(!background) solids.push({position:upper.position.clone().add(new T.Vector3(0,h/2,0)),size:new T.Vector3(w,h,d)});
        }
        return group;
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
