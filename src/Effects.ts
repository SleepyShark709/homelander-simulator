import * as T from 'three';
import { Physics, R, vec } from './Physics';
import { v } from './World';
interface Effect {
    mesh: T.Mesh | T.Sprite;
    life: number;
    duration: number;
    body?: R.RigidBody;
    colliderHandle?: number;
    velocity?: T.Vector3;
    ring?: boolean;
    gravity?: number;
    opacity?: number;
    startSize?: number;
    growth?: number;
}
export class Effects {
    list: Effect[] = [];
    beams: T.Mesh[] = [];
    halos: T.Mesh[] = [];
    laserLights: T.PointLight[] = [];
    smoke: T.CanvasTexture;
    wind: T.LineSegments;
    constructor(
        public group: T.Group,
        public physics: Physics,
    ) {
        const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
        const context=canvas.getContext('2d')!;
        for(let i=0;i<9;i++) {
            const x=40+Math.sin(i*2.7)*24,y=64+Math.cos(i*3.1)*23,r=25+i%3*6;
            const gradient=context.createRadialGradient(x,y,0,x,y,r);
            gradient.addColorStop(0,'rgba(210,199,174,0.4)');gradient.addColorStop(.5,'rgba(183,177,160,0.18)');gradient.addColorStop(1,'rgba(183,177,160,0)');
            context.fillStyle=gradient;context.fillRect(0,0,128,128);
        }
        this.smoke=new T.CanvasTexture(canvas);this.smoke.colorSpace=T.SRGBColorSpace;
        const windGeometry = new T.BufferGeometry();
        windGeometry.setAttribute(
            'position',
            new T.BufferAttribute(new Float32Array(24 * 6), 3),
        );
        this.wind = new T.LineSegments(
            windGeometry,
            new T.LineBasicMaterial({
                color: 0xc3e3ef,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                blending: T.AdditiveBlending,
            }),
        );
        this.wind.visible = false;
        this.wind.frustumCulled = false;
        group.add(this.wind);
        for (let i = 0; i < 2; i++) {
            const beam = new T.Mesh(
                new T.CylinderGeometry(0.026, 0.026, 1, 16),
                new T.MeshBasicMaterial({
                    color: new T.Color(22,0.28,0.12),
                    transparent: true,
                    opacity: 0.95,
                }),
            );
            beam.visible = false;
            this.beams.push(beam);
            group.add(beam);
            const halo = new T.Mesh(
                new T.CylinderGeometry(0.085, 0.085, 1, 6),
                new T.MeshBasicMaterial({
                    color: 0xff1926,
                    transparent: true,
                    opacity: 0.16,
                    blending: T.AdditiveBlending,
                    depthWrite: false,
                }),
            );
            halo.visible = false;
            this.halos.push(halo);
            group.add(halo);
            const light=new T.PointLight(0xff4c29,0,7,2);
            this.laserLights.push(light);group.add(light);
        }
    }
    beam(index: number, a: T.Vector3, b: T.Vector3) {
        const m = this.beams[index],
            d = b.clone().sub(a);
        m.visible = true;
        m.position.copy(a).addScaledVector(d, 0.5);
        m.scale.y = d.length();
        m.quaternion.setFromUnitVectors(v(0, 1, 0), d.normalize());
        const halo = this.halos[index];
        halo.visible = true;
        halo.position.copy(m.position);
        halo.quaternion.copy(m.quaternion);
        halo.scale.copy(m.scale);
        this.laserLights[index].position.copy(b);
        this.laserLights[index].intensity=22;
    }
    hideBeams() {
        for (const b of [...this.beams, ...this.halos]) b.visible = false;
        this.laserLights.forEach(l=>l.intensity=0);
    }
    speedTrails(position: T.Vector3, velocity: T.Vector3, time: number) {
        const speed = velocity.length();
        this.wind.visible = speed > 18;
        if (!this.wind.visible) return;
        this.wind.position.copy(position);
        this.wind.quaternion.setFromUnitVectors(
            v(0, 0, 1),
            velocity.clone().normalize(),
        );
        const pos = this.wind.geometry.attributes.position;
        for (let i = 0; i < 24; i++) {
            const angle = i * 2.399,
                r = 1.05 + (i % 4) * 0.31,
                z = ((time * speed * 0.55 + i * 1.37) % 7) - 4;
            const x = Math.cos(angle) * r,
                y = Math.sin(angle) * r;
            pos.setXYZ(i * 2, x, y, z);
            pos.setXYZ(i * 2 + 1, x, y, z - Math.min(1.1, speed * 0.025));
        }
        pos.needsUpdate = true;
        (this.wind.material as T.LineBasicMaterial).opacity = Math.min(
            0.28,
            (speed - 18) / 90,
        );
    }
    add(e: Effect) {
        this.group.add(e.mesh);
        this.list.push(e);
    }
    particles(p: T.Vector3, color: number, count = 6, blood = false) {
        for (let i = 0; i < count; i++) {
            if (this.list.filter((e) => !e.body && !e.ring).length >= 100)
                break;
            const m = new T.Mesh(
                new T.IcosahedronGeometry(blood ? 0.06 : 0.055, 0),
                new T.MeshBasicMaterial({ color, transparent: true }),
            );
            m.position.copy(p);
            this.add({
                mesh: m,
                life: blood ? 1.5 : 0.4,
                duration: blood ? 1.5 : 0.4,
                velocity: v(
                    (Math.random() - 0.5) * 4,
                    Math.random() * 4,
                    (Math.random() - 0.5) * 4,
                ),
            });
        }
    }
    fragments(p: T.Vector3, color: number, size = 1) {
        for (let i = 0; i < 8; i++) {
            if (this.list.filter((e) => e.body).length >= 60) {
                const old = this.list.find((e) => e.body);
                if (old) this.remove(old);
            }
            const s = 0.12 + Math.random() * 0.18,
                mesh = new T.Mesh(
                    new T.BoxGeometry(s * 2, s * 2, s * 2),
                    new T.MeshStandardMaterial({ color, roughness: 1 }),
                );
            const q = p
                .clone()
                .add(
                    v(
                        (Math.random() - 0.5) * size,
                        (Math.random() - 0.5) * size,
                        (Math.random() - 0.5) * size,
                    ),
                );
            const body = this.physics.world.createRigidBody(
                R.RigidBodyDesc.dynamic()
                    .setTranslation(q.x, q.y, q.z)
                    .setLinearDamping(0.4),
            );
            const collider = this.physics.world.createCollider(
                R.ColliderDesc.cuboid(s, s, s)
                    .setMass(0.3)
                    .setCollisionGroups(0x00020001),
                body,
            );
            this.physics.ignored.add(collider.handle);
            body.setLinvel(
                v(
                    (Math.random() - 0.5) * 8,
                    Math.random() * 7,
                    (Math.random() - 0.5) * 8,
                ),
                true,
            );
            mesh.position.copy(q);
            mesh.castShadow = true;
            this.add({
                mesh,
                body,
                colliderHandle: collider.handle,
                life: 6,
                duration: 6,
            });
        }
    }
    ring(p: T.Vector3) {
        const m = new T.Mesh(
            new T.RingGeometry(0.9, 1, 48),
            new T.MeshBasicMaterial({
                color: 0xffcf8f,
                side: T.DoubleSide,
                transparent: true,
                opacity: 0.8,
            }),
        );
        m.rotation.x = -Math.PI / 2;
        m.position.copy(p).add(v(0, 0.07, 0));
        this.add({ mesh: m, life: 0.6, duration: 0.6, ring: true });
        for(let i=0;i<12;i++) {
            const angle=i*Math.PI/6;
            const material=new T.SpriteMaterial({map:this.smoke,color:0xd7ceba,transparent:true,depthWrite:false,opacity:.5});
            const sprite=new T.Sprite(material);sprite.position.copy(p).add(v(Math.cos(angle)*.4,.22,Math.sin(angle)*.4));
            sprite.scale.setScalar(.7);
            this.add({mesh:sprite,life:1.3,duration:1.3,velocity:v(Math.cos(angle)*5,1.1,Math.sin(angle)*5),gravity:.4,opacity:.5,startSize:.7,growth:2.7});
        }
    }
    tracer(a: T.Vector3, b: T.Vector3) {
        const d = b.clone().sub(a),
            m = new T.Mesh(
                new T.CylinderGeometry(0.013, 0.013, d.length(), 4),
                new T.MeshBasicMaterial({ color: 0xffd99b, transparent: true }),
            );
        m.position.copy(a).addScaledVector(d, 0.5);
        m.quaternion.setFromUnitVectors(v(0, 1, 0), d.normalize());
        this.add({ mesh: m, life: 0.08, duration: 0.08 });
    }
    update(dt: number) {
        for (const e of [...this.list]) {
            e.life -= dt;
            if (e.life <= 0) {
                this.remove(e);
                continue;
            }
            if (e.body) {
                e.mesh.position.copy(vec(e.body.translation()));
                e.mesh.quaternion.copy(e.body.rotation());
            }
            if (e.velocity) {
                e.velocity.y -= (e.gravity ?? 15) * dt;
                e.mesh.position.addScaledVector(e.velocity, dt);
                if (e.mesh.position.y < 0.05) {
                    e.mesh.position.y = 0.05;
                    e.velocity.set(0, 0, 0);
                }
            }
            if (e.ring)
                e.mesh.scale.setScalar(1 + (1 - e.life / e.duration) * 8);
            if(e.growth) e.mesh.scale.setScalar(e.startSize!+(1-e.life/e.duration)*e.growth);
            const m = e.mesh.material as T.Material;
            m.opacity = (e.opacity ?? 1)*Math.min(1, (e.life / e.duration) * 2);
        }
    }
    remove(e: Effect) {
        if (e.colliderHandle !== undefined)
            this.physics.ignored.delete(e.colliderHandle);
        if (e.body) this.physics.world.removeRigidBody(e.body);
        e.mesh.removeFromParent();
        if(e.mesh instanceof T.Mesh)e.mesh.geometry.dispose();
        (e.mesh.material as T.Material).dispose();
        this.list.splice(this.list.indexOf(e), 1);
    }
    dispose() {
        for (const e of [...this.list]) this.remove(e);
        this.wind.geometry.dispose();
        (this.wind.material as T.Material).dispose();
        this.wind.removeFromParent();
        this.smoke.dispose();
        this.laserLights.forEach(l=>l.removeFromParent());
        for (const b of [...this.beams, ...this.halos]) {
            b.geometry.dispose();
            (b.material as T.Material).dispose();
            b.removeFromParent();
        }
    }
}
