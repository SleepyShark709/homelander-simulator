export class UI {
    root = document.querySelector<HTMLDivElement>('#app')!;
    onStart = () => {};
    onReset = () => {};
    onRetry = () => location.reload();
    constructor() {
        this.root.innerHTML = `
      <div id="viewport"></div><div class="vignette"></div>
      <header><div class="brand"><span class="brand-mark">H</span><div>HOMELANDER<small>自由之上 / BLOCK 01</small></div></div><span class="edition">INTERACTIVE SANDBOX <b>VOL. 01</b></span></header>
      <div id="hud" class="hidden"><div class="district"><span class="live-dot"></span> 自由区 <small>200 × 200 M</small></div>
      <div class="wanted"><span id="threat-label">街区平静</span><div id="stars">◇ ◇ ◇</div><div class="heat-track"><i id="heat-fill"></i></div></div>
      <div id="crosshair"><i></i><b></b></div><div id="notice"></div>
      <div class="telemetry"><span id="mode">地面</span><strong id="speed">0 <small>KM/H</small></strong><span id="altitude">海拔 0 M</span><em>∞ 无敌</em></div>
      <div class="powers"><span><kbd>空格</kbd> 跳跃 / 上升</span><span><kbd>F</kbd> 飞行</span><span><kbd>SHIFT</kbd> 超级速度</span><span><kbd>左键</kbd> 镭射</span><span><kbd>右键</kbd> 重拳</span><span><kbd>Q</kbd> 砸地</span><span class="muted"><kbd>ESC</kbd> 暂停</span></div>
      <div id="stats"></div><svg id="map" viewBox="-110 -110 220 220"><rect x="-100" y="-100" width="200" height="200"/><path d="M-100 0H100M0-100V100"/><g id="map-dots"></g><path id="map-player" d="M0 -5L-3 4L0 2L3 4Z"/></svg></div>
      <main id="menu"><div class="eyebrow"><span></span> A SMALL CITY. UNLIMITED POWER.</div><h1>力量之上<br/><em>没有规则。</em></h1><p class="intro">飞越街区，释放镭射，让城市回应你的每一次选择。<br/>一个街区，四种能力，完全自由。</p>
      <div class="menu-actions"><button id="start" disabled>正在准备街区 <span>0%</span></button><button id="reset" class="secondary hidden">重置街区 ↺</button></div><p id="loading">初始化引擎</p>
      <div class="instructions"><div><kbd>W A S D</kbd><span>移动</span></div><div><kbd>鼠标</kbd><span>视角 / 瞄准</span></div><div><kbd>空格 / CTRL</kbd><span>地面跳跃 / 飞行升降</span></div><div><kbd>ESC</kbd><span>暂停 / 释放鼠标</span></div></div>
      <footer><span>本地体验 · 第三人称 3D</span><span>NO LIMITS. NO HEROES.</span></footer></main>`;
        this.el<HTMLButtonElement>('start').onclick = () => this.onStart();
        this.el<HTMLButtonElement>('reset').onclick = () => this.onReset();
    }
    el<T extends HTMLElement = HTMLElement>(id: string) {
        return document.getElementById(id) as T;
    }
    progress(text: string, pct: number) {
        this.el('loading').textContent = text;
        this.el('start').innerHTML = `正在准备街区 <span>${pct}%</span>`;
    }
    ready() {
        this.el<HTMLButtonElement>('start').disabled = false;
        this.el('start').innerHTML = '进入街区 <span>↗</span>';
        this.el('loading').textContent = '点击进入后，鼠标将控制视角。';
    }
    error(message: string) {
        this.el('loading').textContent = message;
        const b = this.el<HTMLButtonElement>('start');
        b.disabled = false;
        b.textContent = '重新加载 ↻';
        b.onclick = () => this.onRetry();
    }
    playing(active: boolean, started = true) {
        this.el('menu').classList.toggle('hidden', active);
        this.el('hud').classList.toggle('hidden', !active);
        this.root.classList.toggle('playing', active);
        if (started) {
            this.el('start').innerHTML = '继续探索 <span>↗</span>';
            this.el('reset').classList.remove('hidden');
            this.el('loading').textContent = '世界已暂停 · 点击继续恢复';
        }
    }
    update(
        level: number,
        heat: number,
        mode: string,
        speed: number,
        altitude: number,
        notice: string,
        civilians: number,
        enemies: number,
    ) {
        this.el('threat-label').textContent = [
            '街区平静',
            '一级追捕 · 警察出动',
            '二级追捕 · 增援抵达',
            '三级追捕 · 军队介入',
        ][level];
        this.el('stars').textContent = [0, 1, 2]
            .map((i) => (i < level ? '◆' : '◇'))
            .join(' ');
        this.el('heat-fill').style.width = `${heat}%`;
        this.el('mode').textContent = mode;
        this.el('speed').innerHTML =
            `${Math.round(speed * 3.6)} <small>KM/H</small>`;
        this.el('altitude').textContent =
            `海拔 ${Math.max(0, altitude).toFixed(0)} M`;
        this.el('notice').textContent = notice;
        this.el('stats').textContent =
            `平民 ${civilians}  /  追捕单位 ${enemies}`;
    }
}
