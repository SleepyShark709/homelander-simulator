export class UI {
    root = document.querySelector<HTMLDivElement>('#app')!;
    onStart = () => {};
    onReset = () => {};
    onRetry = () => location.reload();
    constructor() {
        const controls = [
            ['W A S D', '移动'], ['鼠标', '视角 / 瞄准'],
            ['F', '起飞 / 下落'], ['空格', '地面跳跃 / 飞行上升'], ['CTRL', '飞行下降'],
            ['SHIFT', '疾跑 / 飞行加速'], ['左键', '按住镭射'],
            ['右键', '上勾重击'], ['E', '右勾拳'], ['R', '四连拳'],
            ['T', '直拳接肘击'], ['Q', '空中砸地'],
            ['V', '切换镭射姿势'], ['ESC', '暂停 / 释放鼠标'],
        ].map(([key, label]) => `<span class="key-hint"><kbd>${key}</kbd><span>${label}</span></span>`).join('');
        const poseHint = '垂手 → 叉腰 → 背手 · 静止按住左键生效';
        this.root.innerHTML = `
      <div id="viewport"></div><div class="vignette"></div>
      <header><div class="brand"><span class="brand-mark">H</span><div>HOMELANDER<small>自由之上 / BLOCK 01</small></div></div><span class="edition">INTERACTIVE SANDBOX <b>VOL. 01</b></span></header>
      <div id="hud" class="hidden"><div class="district"><span class="live-dot"></span> 自由区 <small>200 × 200 M</small></div>
      <div class="wanted"><span id="threat-label">街区平静</span><div id="stars">◇ ◇ ◇</div><div class="heat-track"><i id="heat-fill"></i></div></div>
      <div id="crosshair"><i></i><b></b></div><div id="notice"></div>
      <div class="telemetry"><span id="mode">地面</span><strong id="speed">0 <small>KM/H</small></strong><span id="altitude">海拔 0 M</span><em>∞ 无敌</em></div>
      <div class="powers" aria-label="操作快捷键">${controls}<div class="pose-hint"><span>已选镭射姿势：<b id="laser-pose">垂手</b></span><small>${poseHint}</small></div></div>
      <div id="stats"></div><svg id="map" viewBox="-110 -110 220 220"><rect x="-100" y="-100" width="200" height="200"/><path d="M-100 0H100M0-100V100"/><g id="map-dots"></g><path id="map-player" d="M0 -5L-3 4L0 2L3 4Z"/></svg></div>
      <main id="menu"><div class="eyebrow"><span></span> A SMALL CITY. UNLIMITED POWER.</div><h1>力量之上<br/><em>没有规则。</em></h1><p class="intro">飞越街区，释放镭射，让城市回应你的每一次选择。<br/>一个街区，四种能力，完全自由。</p>
      <div class="menu-actions"><button id="start" disabled>正在准备街区 <span>0%</span></button><button id="reset" class="secondary hidden">重置街区 ↺</button></div><p id="loading">初始化引擎</p>
      <div class="instructions" aria-label="完整操作说明">${controls}</div><p class="pose-instructions">镭射姿势：${poseHint}</p>
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
        laserPose: number,
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
        this.el('laser-pose').textContent = ['垂手', '叉腰', '背手'][laserPose];
    }
    updateMap(
        position: { x: number; z: number },
        yaw: number,
        markers: Array<{ position: { x: number; z: number }; enemy: boolean }>,
    ) {
        this.el('map-player').setAttribute(
            'transform',
            `translate(${position.x},${position.z}) rotate(${(-yaw * 180) / Math.PI})`,
        );
        this.el('map-dots').innerHTML = markers.map(marker =>
            `<circle cx="${marker.position.x}" cy="${marker.position.z}" r="1.5" class="${marker.enemy ? 'enemy' : ''}"/>`,
        ).join('');
    }
}
