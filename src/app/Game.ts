import * as T from 'three';
import { Assets } from '../core/Assets';
import { Physics, R } from '../core/Physics';
import { StreetWorld } from '../world/World';
import { v } from '../core/math';
import { Effects } from '../render/Effects';
import { Input } from '../core/Input';
import { Player } from '../characters/Player';
import { FollowCamera } from '../render/Camera';
import { Npcs } from '../gameplay/Npcs';
import { Combat } from '../gameplay/Combat';
import { Wanted } from '../gameplay/rules';
import { UI } from './UI';
import { CONFIG } from '../core/config';
import { CityRenderer } from '../render/CityRenderer';
import { SceneLighting } from '../render/SceneLighting';
import { prewarmRagdolls } from '../characters/Ragdoll';
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
    worldTime = 0;
    worldScale = 1;
    superSpeedActive = false;
    accumulator = 0;
    previous = 0;
    running = false;
    started = false;
    generation = 0;
    private abort = new AbortController();
    private disposed = false;
    private lighting: SceneLighting;
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
            this.worldScale = 1;
            this.superSpeedActive = false;
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
        this.lighting = new SceneLighting(this.renderer, this.scene);
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
        await this.assets.load((name, pct) => this.ui.progress(name, pct), this.renderer);
        prewarmRagdolls(this.assets.models.get('civilian2')!.scene);
        this.ui.progress('准备城市反射与光照', 94);
        await this.lighting.loadEnvironment(this.assets.graffitiTrial || this.assets.graffitiCity);
        this.reset();
        this.resize();
        this.ui.ready();
        this.previous = performance.now();
        this.renderer.setAnimationLoop((t) => this.frame(t));
    }
    reset() {
        this.inspectionFrozen = false;
        this.running = false;
        this.input.clear();
        this.generation++;
        this.time = 0;
        this.worldTime = 0;
        this.worldScale = 1;
        this.superSpeedActive = false;
        this.accumulator = 0;
        this.wanted.reset();
        if (this.world) {
            this.effects.dispose();
            for (const e of [...this.world.entities.values()]) this.world.remove(e);
            this.player.visual.dispose();
            this.world.art.dispose();
            this.assets.disposeScene(this.world.group);
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
        this.superSpeedActive = this.player.superSpeedRequested;
        const target = this.superSpeedActive ? CONFIG.superSpeed.worldScale : 1;
        const ramp = dt * (1 - CONFIG.superSpeed.worldScale) /
            (this.superSpeedActive ? CONFIG.superSpeed.enterTime : CONFIG.superSpeed.exitTime);
        this.worldScale += T.MathUtils.clamp(target - this.worldScale, -ramp, ramp);
        const worldDt = dt * this.worldScale;
        this.worldTime += worldDt;
        this.physics.world.timestep = worldDt;
        this.combat.time = this.time;
        this.combat.worldTime = this.worldTime;
        this.player.step(dt);
        this.npcs.update(worldDt, this.worldTime);
        this.physics.world.step();
        this.world.sync();
        this.player.sync();
        this.camera.update(dt, false);
        this.combat.update(dt, this.time);
        this.effects.update(worldDt);
        this.wanted.update(worldDt);
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
                this.player.mode === 'ground' && this.superSpeedActive,
            );
        } else {
            this.player.sync();
            this.effects.wind.visible = false;
            this.camera.update(elapsed, true);
        }
        this.world.updateScenery?.(this.camera.camera);
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
            ground: this.superSpeedActive ? '超级速度 · 慢动作' : '地面',
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
            p.laserPose,
        );
        this.ui.updateMap(p.position, this.input.yaw, [...people, ...enemies].map(e => ({
            position: e.mesh.position, enemy: e.kind !== 'civilian',
        })));
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
            this.assets.disposeScene(this.world.group);
            this.physics.dispose();
        }
        this.assets.dispose();
        this.lighting.dispose();
        this.presentation?.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
        this.debugEl.remove();
    }
    snapshot() {
        return {
            time: this.time,
            worldTime: this.worldTime,
            worldScale: this.worldScale,
            superSpeed: this.superSpeedActive,
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
