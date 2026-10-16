import { expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { Game } from '../src/Game';

it('a queued RAF older than resume does not reverse animation blending or simulation time', () => {
    const animate = vi.fn();
    const game = {
        previous: 1010, running: true, inspectionFrozen: false, accumulator: 0, time: 1,
        frameTimes: [] as number[], updateTimes: [], submissionTimes: [],
        player: { sync() {}, animate, visual: { group: { position: new Vector3() } }, renderVelocity: new Vector3() },
        world: { interpolate() {} }, camera: { update() {} },
        combat: { renderBeams() {} }, effects: { speedTrails() {} },
        presentation: { render() {} }, updateUI() {}, step: vi.fn(),
    };
    Game.prototype.frame.call(game as unknown as Game, 1000);
    expect(animate.mock.calls[0][0]).toBe(0);
    expect(game.previous).toBe(1010);
    expect(game.frameTimes).toEqual([]);
    expect(game.step).not.toHaveBeenCalled();
    Game.prototype.frame.call(game as unknown as Game, 1020);
    expect(animate.mock.calls[1][0]).toBeCloseTo(.01);
    expect(game.accumulator).toBeCloseTo(.01);
    expect(game.frameTimes).toEqual([10]);
});
