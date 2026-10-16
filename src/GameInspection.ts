import type { Game } from './Game';
import { CONFIG } from './config';

/** Explicit opt-in for production measurements; ordinary play exposes no controls. */
export function installGameInspection(game: Game) {
    const host = window as unknown as Record<string, unknown>;
    host.game = game;
    Object.defineProperty(host, '__THREE_GAME_DIAGNOSTICS__', {
        configurable: true,
        get: () => ({
            renderer: {
                calls: game.renderer.info.render.calls,
                triangles: game.renderer.info.render.triangles,
                geometries: game.renderer.info.memory.geometries,
                textures: game.renderer.info.memory.textures,
            },
            state: game.snapshot(),
            physics: { engine: 'rapier', timestep: CONFIG.step },
            presentation: CONFIG.presentation,
        }),
    });
    host.__THREE_GAME_TEST_HOOKS__ = {
        setPausedForScreenshot(paused: boolean) {
            game.inspectionFrozen = paused;
        },
        hideDebugUi() {
            game.debug = false;
            game.debugEl.classList.add('hidden');
        },
        async setState(state: string) {
            if (!['street', 'flight', 'stress', 'pause', 'storefront', 'interior'].includes(state))
                throw new Error(`Unknown inspection state: ${state}`);
            const deadline = performance.now() + 9000;
            while (!game.world) {
                if (performance.now() > deadline) throw new Error('Inspection assets did not finish loading');
                await new Promise(requestAnimationFrame);
            }
            game.inspectionFrozen = false;
            game.reset();
            const p = game.player;
            if (state === 'storefront' || state === 'interior') {
                p.position.set(state === 'interior' ? 36.5 : 25, state === 'interior' ? 1.55 : 1.2,
                    state === 'interior' ? -36 : -23);
                p.previous.copy(p.position);
                p.body.setTranslation(p.position,true); p.body.setNextKinematicTranslation(p.position);
                game.input.yaw = state === 'interior' ? 0 : -.85;
                game.input.pitch = -.08;
            }
            if (state === 'flight' || state === 'stress') {
                p.position.set(0, 18, 25);
                p.previous.copy(p.position);
                p.body.setTranslation(p.position, true);
                p.body.setNextKinematicTranslation(p.position);
                p.mode = 'fly';
            }
            if (state === 'stress') {
                game.wanted.heat = 100;
                for (let i = 0; i < 12; i++)
                    game.world.spawn(i < 4 ? 'police' : 'soldier',
                        p.position.clone().set(i % 2 ? 12 : -12, .18, -45 + Math.floor(i / 2) * 15), 0);
                game.input.laser = true;
            }
            for (let i = 0; i < 60; i++) {
                game.step();
                p.animate(CONFIG.step, game.time);
            }
            p.sync();
            game.camera.update(CONFIG.step, false);
            game.combat.renderBeams();
            game.running = state !== 'pause';
            game.input.active = state !== 'pause';
            game.started = true;
            game.ui.playing(state !== 'pause', true);
            game.updateUI();
            game.previous = performance.now();
            return { state };
        },
    };
}
