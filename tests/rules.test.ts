import { describe, it, expect } from 'vitest';
import { Health, Wanted, limitAxis } from '../src/rules';

describe('damage accounting', () => {
    it('deduplicates both eye rays and never pays twice for a death', () => {
        const hp = new Health(50);
        expect(hp.hit(20, 'laser:1', 0)).toEqual({
            applied: true,
            killed: false,
        });
        expect(hp.hit(20, 'laser:1', 0).applied).toBe(false);
        expect(hp.hp).toBe(30);
        expect(hp.hit(40, 'punch:2', 1).killed).toBe(true);
        expect(hp.hit(40, 'punch:3', 2)).toEqual({
            applied: false,
            killed: false,
        });
    });
    it('allows distinct damage ticks without depending on rendering frequency', () => {
        for (const fps of [30, 60, 144]) {
            const hp = new Health(1000);
            let acc = 0,
                ticks = 0;
            for (let i = 0; i < fps; i++) {
                acc += 1 / fps;
                while (acc >= 0.1 - 1e-10) {
                    acc -= 0.1;
                    hp.hit(20, `laser:${++ticks}`, i / fps);
                }
            }
            expect(hp.hp).toBe(800);
        }
    });
});
describe('wanted lifecycle', () => {
    it('escalates and caps the total enemy budget, then decays through all levels', () => {
        const w = new Wanted();
        w.hit(1, 0);
        expect(w.level).toBe(1);
        expect(w.budget).toBe(4);
        for (let i = 0; i < 3; i++) w.destroyed('civilian');
        expect(w.level).toBe(2);
        expect(w.budget).toBe(8);
        for (let i = 0; i < 10; i++) w.destroyed('police');
        expect(w.heat).toBe(100);
        expect(w.budget).toBe(12);
        w.update(15);
        expect(w.heat).toBe(100);
        w.update(5);
        expect(w.level).toBe(2);
        w.update(10);
        expect(w.level).toBe(1);
        w.update(5);
        expect(w.budget).toBe(0);
    });
    it('empty attacks delay decay without increasing heat; repeated ticks are throttled', () => {
        const w = new Wanted();
        w.hit(1, 0);
        w.hit(1, 0.5);
        expect(w.heat).toBe(1);
        w.hit(1, 1);
        expect(w.heat).toBe(2);
        w.update(14);
        w.action();
        w.update(14);
        expect(w.heat).toBe(2);
    });
    it('decay crossing the quiet deadline uses only eligible time; reset clears credit history', () => {
        const w = new Wanted();
        w.heat = 80;
        w.update(15.1);
        expect(w.heat).toBeCloseTo(79.5);
        w.hit(1, 5);
        w.reset();
        w.hit(1, 0);
        expect(w.heat).toBe(1);
    });
});
it('soft boundary attenuates only outward movement and allows recovery from outside', () => {
    expect(limitAxis(95, 40, 100, 20)).toBe(10);
    expect(limitAxis(95, -40, 100, 20)).toBe(-40);
    expect(Math.abs(limitAxis(-105, -40, 100, 20))).toBe(0);
    expect(limitAxis(-105, 40, 100, 20)).toBe(40);
});
