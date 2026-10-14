import { CONFIG, type Kind } from './config';

export class Wanted {
    heat = 0;
    quiet = 0;
    private credited = new Map<number, number>();
    get level() {
        return this.heat >= 80
            ? 3
            : this.heat >= 30
              ? 2
              : this.heat > 0
                ? 1
                : 0;
    }
    get budget() {
        return [0, 4, 8, 12][this.level];
    }
    action() {
        this.quiet = 0;
    }
    hit(id: number, time: number) {
        this.action();
        if (time - (this.credited.get(id) ?? -Infinity) >= 1) {
            this.heat = Math.min(100, this.heat + 1);
            this.credited.set(id, time);
        }
    }
    destroyed(kind: Kind) {
        this.action();
        this.heat = Math.min(
            100,
            this.heat + (kind === 'panel' || kind === 'prop' ? 5 : 10),
        );
    }
    update(dt: number) {
        const before = this.quiet;
        this.quiet += dt;
        const decayTime = Math.max(
            0,
            this.quiet - Math.max(before, CONFIG.quietDelay),
        );
        this.heat = Math.max(0, this.heat - decayTime * CONFIG.heatDecay);
    }
    reset() {
        this.heat = 0;
        this.quiet = 0;
        this.credited.clear();
    }
    forget(id: number) {
        this.credited.delete(id);
    }
}

export class Health {
    private attacks = new Map<string, number>();
    constructor(public hp: number) {}
    get dead() {
        return this.hp <= 0;
    }
    hit(
        damage: number,
        token: string,
        time: number,
    ): { applied: boolean; killed: boolean } {
        if (this.dead || this.attacks.has(token))
            return { applied: false, killed: false };
        this.attacks.set(token, time);
        for (const [key, t] of this.attacks)
            if (time - t > 3) this.attacks.delete(key);
        this.hp = Math.max(0, this.hp - damage);
        return { applied: true, killed: this.dead };
    }
}

/** Fade only outward velocity; inward and tangential movement remain available. */
export function limitAxis(
    position: number,
    speed: number,
    edge: number,
    buffer: number,
) {
    if (position * speed <= 0) return speed;
    return (
        speed * Math.max(0, Math.min(1, (edge - Math.abs(position)) / buffer))
    );
}
