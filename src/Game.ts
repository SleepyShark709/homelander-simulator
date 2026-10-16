import * as T from 'three';
import { Assets } from './Assets';
import { Physics, R } from './Physics';
import { StreetWorld, v } from './World';
import { Effects } from './Effects';
import { Input } from './Input';
import { Player } from './Player';
import { FollowCamera } from './Camera';
import { Npcs } from './Npcs';
import { Combat } from './Combat';
import { Wanted } from './rules';
import { UI } from './UI';
import { CONFIG } from './config';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { CityRenderer } from './CityRenderer';
import { prewarmRagdolls } from './Ragdoll';
import { installGameInspection } from './GameInspection';

export class Game {
    renderer = new T.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
    });
    scene = new T.Scene();
    assets = new Assets();
    ui = new UI();
    input: Input;
    physics!: Physics;
    world!: StreetWorld;
    player!: Player;
    camera!: FollowCamera;
    effects!: Effects;
    npcs!: Npcs;
    combat!: Combat;
    wanted = new Wanted();
    time = 0;
    accumulator = 0;
    previous = 0;
    running = false;
    started = false;
    generation = 0;
    private abort = new AbortController();
    private disposed = false;
    private environmentTarget?: T.WebGLRenderTarget;
    frameTimes: number[] = [];
    updateTimes: number[] = [];
    submissionTimes: number[] = [];
    debug = false;
    inspectionFrozen = false;
    presentation?: CityRenderer;
    debugEl = document.createElement('div');
    constructor() {
        this.renderer.setClearColor(0xb8c9cc);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = T.PCFSoftShadowMap;
        this.renderer.toneMapping = T.AgXToneMapping;
        this.renderer.toneMappingExposure = CONFIG.presentation.exposure;
        document
            .getElementById('viewport')!
            .appendChild(this.renderer.domElement);
        this.input = new Input(this.renderer.domElement);
        this.input.onPause = () => {
            this.running = false;
            this.player?.clearBufferedAttack();
            this.world?.freezeInterpolation();
            this.accumulator = 0;
            this.effects?.hideBeams();
            this.ui.playing(false, this.started);
        };
        this.input.onResume = () => {
            this.running = true;
            this.started = true;
            this.previous = performance.now();
            this.accumulator = 0;
            this.ui.playing(true);
        };
        this.ui.onStart = () =>
            this.input
                .resume()
                .catch(
                    () =>
                        (this.ui.el('loading').textContent =
                            '浏览器暂未允许捕获鼠标，请稍等几秒后再次点击继续。'),
                );
        this.ui.onReset = () => {
            this.input.pause();
            this.reset();
        };
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
        window.addEventListener('resize', () => this.resize(), {
            signal: this.abort.signal,
        });
        this.debugEl.id = 'debug';
        this.debugEl.className = 'hidden';
        document.body.appendChild(this.debugEl);
        window.addEventListener(
            'keydown',
            (e) => {
                if (e.code === 'Backquote') {
                    this.debug = !this.debug;
                    this.debugEl.classList.toggle('hidden', !this.debug);
                }
            },
            { signal: this.abort.signal },
        );
        if (import.meta.env.DEV || new URLSearchParams(location.search).get('qa') === '1')
            installGameInspection(this);
    }
    async init() {
        this.ui.progress('初始化物理引擎', 5);
        await R.init();
        await this.assets.load((name, pct) => this.ui.progress(name, pct));
        prewarmRagdolls(this.assets.models.get('civilian2')!.scene);
        this.ui.progress('准备城市反射与光照', 94);
        const hdr = await new HDRLoader().loadAsync('/assets/pbr/urban_street_03_1k.hdr');
        const pmrem = new T.PMREMGenerator(this.renderer);
        const environment = pmrem.fromEquirectangular(hdr);
        this.environmentTarget?.dispose();
        this.environmentTarget = environment;
        this.scene.environment = environment.texture;
        this.scene.environmentIntensity = CONFIG.presentation.environment;
        hdr.dispose();
        pmrem.dispose();
        this.reset();
        this.resize();
        this.ui.ready();
        this.previous = performance.now();
        this.renderer.setAnimationLoop((t) => this.frame(t));
    }
    disposeScene(group: T.Group) {
        const sharedGeometry = new Set<T.BufferGeometry>(),
            sharedMaterial = new Set<T.Material>();
        for (const g of this.assets.models.values())
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
    reset() {
        this.inspectionFrozen = false;
        this.running = false;
        this.input.clear();
        this.generation++;
        this.time = 0;
        this.accumulator = 0;
        this.wanted.reset();
        if (this.world) {
            this.effects.dispose();
            for (const e of [...this.world.entities.values()]) this.world.remove(e);
            this.player.visual.dispose();
            this.world.art.dispose();
            this.disposeScene(this.world.group);
            this.scene.remove(this.world.group);
            this.physics.dispose();
        }
        this.physics = new Physics();
        this.world = new StreetWorld(this.physics, this.assets);
        this.scene.add(this.world.group);
        this.player = new Player(
            this.physics,
            this.assets,
            this.input,
            this.world.group,
        );
        this.camera = new FollowCamera(this.physics, this.player);
        if (this.presentation) this.presentation.camera(this.camera.camera);
        else this.presentation=new CityRenderer(this.renderer,this.scene,this.camera.camera);
        this.effects = new Effects(this.world.group, this.physics);
        this.npcs = new Npcs(
            this.world,
            this.physics,
            this.player,
            this.wanted,
            this.effects,
            this.camera.camera,
        );
        this.combat = new Combat(
            this.world,
            this.physics,
            this.player,
            this.wanted,
            this.effects,
            this.npcs,
            this.camera.camera,
        );
        this.physics.world.step();
        this.input.yaw = 0;
        this.input.pitch = -0.12;
        this.resize();
        this.ui.playing(false, this.started);
    }
    resize() {
        const scale = Math.min(
            devicePixelRatio,
            1.5,
            1920 / Math.max(innerWidth, innerHeight),
        );
        this.renderer.setPixelRatio(scale);
        this.renderer.setSize(innerWidth, innerHeight);
        this.presentation?.resize(innerWidth,innerHeight);
        if (this.camera) {
            this.camera.camera.aspect = innerWidth / innerHeight;
            this.camera.camera.updateProjectionMatrix();
        }
    }
    step() {
        const dt = CONFIG.step;
        this.time += dt;
        this.combat.time = this.time;
        this.player.step(dt);
        this.npcs.update(dt, this.time);
        this.physics.world.step();
        this.world.sync();
        this.player.sync();
        this.camera.update(dt, false);
        this.combat.update(dt, this.time);
        this.effects.update(dt);
        this.wanted.update(dt);
    }
    frame(now: number) {
        if (this.inspectionFrozen) {
            this.previous = now;
            this.presentation!.render(0);
            return;
        }
        const cpuStart = performance.now();
        // Resume/setup can finish after an already queued RAF timestamp. Never
        // send a negative delta into animation weights or the fixed-step clock.
        const rawFrameMs = Math.max(0, now - this.previous);
        const elapsed = Math.min(0.1, rawFrameMs / 1000);
        this.previous = Math.max(now, this.previous);
        if (this.running) {
            if (rawFrameMs > 0) this.frameTimes.push(rawFrameMs);
            if (this.frameTimes.length > 36000) this.frameTimes.shift();
            this.accumulator += elapsed;
            let count = 0;
            while (this.accumulator >= CONFIG.step && count++ < 5) {
                this.step();
                this.accumulator -= CONFIG.step;
            }
            if (count >= 5) this.accumulator = 0;
            this.player.sync(Math.min(1, this.accumulator / CONFIG.step));
            this.world.interpolate(Math.min(1, this.accumulator / CONFIG.step));
            const renderTime=this.time-CONFIG.step+this.accumulator;
            this.player.animate(elapsed, renderTime);
            this.camera.update(elapsed, false, true);
            this.combat.renderBeams();
            this.effects.speedTrails(
                this.player.visual.group.position.clone().add(v(0,1,0)),
                this.player.renderVelocity,
                renderTime,
            );
        } else {
            this.player.sync();
            this.effects.wind.visible = false;
            this.camera.update(elapsed, true);
        }
        const updateEnd = performance.now();
        this.presentation!.render(elapsed);
        if (this.running) {
            this.updateTimes.push(updateEnd - cpuStart);
            this.submissionTimes.push(performance.now() - updateEnd);
            if (this.updateTimes.length > 36000) this.updateTimes.shift();
            if (this.submissionTimes.length > 36000)
                this.submissionTimes.shift();
        }
        if (Math.floor(now / 100) !== Math.floor((now - elapsed * 1000) / 100))
            this.updateUI();
    }
    updateUI() {
        const p = this.player,
            people = this.world.alive('civilian'),
            enemies = this.world
                .alive()
                .filter((e) => e.kind === 'police' || e.kind === 'soldier');
        const notice =
            Math.max(Math.abs(p.position.x), Math.abs(p.position.z)) > 79
                ? '接近街区边界 · 向内转向'
                : p.position.y > 70
                  ? '接近飞行高度上限'
                  : '';
        const modes = {
            ground: '地面',
            jump: '跳跃',
            takeoff: '蓄力起飞',
            fly: p.velocity.length() > 18 ? '加速飞行' : '空中悬停',
            fall: '自然下落',
            slam: '空中砸地',
        };
        this.ui.update(
            this.wanted.level,
            this.wanted.heat,
            modes[p.mode],
            p.velocity.length(),
            p.position.y - 1,
            notice,
            people.length,
            enemies.length,
        );
        document
            .getElementById('map-player')!
            .setAttribute(
                'transform',
                `translate(${p.position.x},${p.position.z}) rotate(${(-this.input.yaw * 180) / Math.PI})`,
            );
        document.getElementById('map-dots')!.innerHTML = [...people, ...enemies]
            .map(
                (e) =>
                    `<circle cx="${e.mesh.position.x}" cy="${e.mesh.position.z}" r="1.5" class="${e.kind === 'civilian' ? '' : 'enemy'}"/>`,
            )
            .join('');
        if (this.debug) {
            const last = this.frameTimes.slice(-120),
                avg =
                    last.reduce((a, b) => a + b, 0) / Math.max(1, last.length);
            this.debugEl.textContent = `${(1000 / avg).toFixed(0)} FPS · ${avg.toFixed(1)} ms\nDraws ${this.renderer.info.render.calls} · Triangles ${this.renderer.info.render.triangles}\nBodies ${this.physics.world.bodies.len()} · Effects ${this.effects.list.length}\nTime ${this.time.toFixed(1)} · Heat ${this.wanted.heat.toFixed(1)}`;
        }
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.renderer.setAnimationLoop(null);
        this.input.dispose();
        this.abort.abort();
        if (this.world) {
            this.effects.dispose();
            for (const e of [...this.world.entities.values()]) this.world.remove(e);
            this.player.visual.dispose();
            this.world.art.dispose();
            this.disposeScene(this.world.group);
            this.physics.dispose();
        }
        const geometries = new Set<T.BufferGeometry>(),
            materials = new Set<T.Material>(),
            textures = new Set<T.Texture>();
        for (const asset of this.assets.models.values())
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
        this.assets.models.clear();
        this.assets.textures.forEach(t=>t.dispose());
        this.assets.textures.clear();
        this.environmentTarget?.dispose();
        this.presentation?.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
        this.debugEl.remove();
    }
    snapshot() {
        return {
            time: this.time,
            generation: this.generation,
            running: this.running,
            position: this.player.position.toArray(),
            mode: this.player.mode,
            heat: this.wanted.heat,
            level: this.wanted.level,
            civilians: this.world.alive('civilian').length,
            enemies: this.world
                .alive()
                .filter((e) => e.kind === 'police' || e.kind === 'soldier')
                .length,
            kills: this.combat.kills,
            destroyed: this.combat.destroyed,
            bodies: this.physics.world.bodies.len(),
            colliders: this.physics.world.colliders.len(),
            effects: this.effects.list.length,
            geometries: this.renderer.info.memory.geometries,
            textures: this.renderer.info.memory.textures,
            drawCalls: this.renderer.info.render.calls,
            triangles: this.renderer.info.render.triangles,
        };
    }
}
