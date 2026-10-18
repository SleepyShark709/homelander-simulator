export class Input {
    keys = new Set<string>();
    pressed = new Set<string>();
    laser = false;
    punch = false;
    yaw = 0;
    pitch = -0.12;
    active = false;
    onPause = () => {};
    onResume = () => {};
    private abort = new AbortController();
    constructor(private canvas: HTMLCanvasElement) {
        const options = { signal: this.abort.signal };
        document.addEventListener(
            'keydown',
            (e) => {
                if (!this.active) return;
                if (e.code === 'Escape') {
                    this.pause();
                    return;
                }
                if (
                    ['Space', 'ControlLeft', 'ControlRight', 'Tab'].includes(
                        e.code,
                    )
                )
                    e.preventDefault();
                if (!e.repeat) this.pressed.add(e.code);
                this.keys.add(e.code);
            },
            options,
        );
        document.addEventListener(
            'keyup',
            (e) => this.keys.delete(e.code),
            options,
        );
        document.addEventListener(
            'mousemove',
            (e) => {
                if (!this.active) return;
                this.yaw -= e.movementX * 0.0022;
                this.pitch = Math.max(
                    -1.25,
                    Math.min(1.15, this.pitch - e.movementY * 0.0022),
                );
            },
            options,
        );
        document.addEventListener(
            'mousedown',
            (e) => {
                if (!this.active) return;
                e.preventDefault();
                if (e.button === 0) this.laser = true;
                if (e.button === 2) this.punch = true;
            },
            options,
        );
        document.addEventListener(
            'mouseup',
            (e) => {
                if (e.button === 0) this.laser = false;
            },
            options,
        );
        canvas.addEventListener(
            'contextmenu',
            (e) => e.preventDefault(),
            options,
        );
        document.addEventListener(
            'pointerlockchange',
            () => {
                this.active = document.pointerLockElement === canvas;
                this.clear();
                if (this.active) this.onResume();
                else this.onPause();
            },
            options,
        );
        window.addEventListener('blur', () => this.pause(), options);
        document.addEventListener(
            'visibilitychange',
            () => {
                if (document.hidden) this.pause();
            },
            options,
        );
    }
    get shift() {
        return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    }
    take(code: string) {
        const value = this.pressed.has(code);
        this.pressed.delete(code);
        return value;
    }
    clear() {
        this.keys.clear();
        this.pressed.clear();
        this.laser = false;
        this.punch = false;
    }
    async resume() {
        await this.canvas.requestPointerLock();
    }
    pause() {
        this.active = false;
        this.clear();
        if (document.pointerLockElement) document.exitPointerLock();
        this.onPause();
    }
    dispose() {
        this.abort.abort();
    }
}
