import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Assets } from '../core/Assets';
import { PersonVisual } from '../characters/PersonVisual';

export async function characterPreview() {
    const app = document.querySelector<HTMLDivElement>('#app')!;
    app.innerHTML = `<div id="viewport"></div><div class="studio-bar"><a href="/">← 返回街区</a><strong>角色展示 <small>HOMELANDER</small></strong><span>拖动旋转 · 滚轮缩放</span></div><div class="studio-controls"><button data-pose="ground">待机</button><button data-pose="walk">步行</button><button data-pose="jog">奔跑</button><button data-pose="sprint">冲刺</button><button data-pose="jump_start">起跳</button><button data-pose="jump_land">跳跃落地</button><button data-pose="takeoff">起飞</button><button data-pose="fly">悬停</button><button data-pose="boost">高速飞行</button><button data-pose="fall">下落</button><button data-pose="land">落地</button><button data-pose="punch">上勾重击</button><button data-pose="casual_attack">右勾拳</button><button data-pose="combo_a">四连拳</button><button data-pose="combo_b">直拳接肘击</button><button data-pose="laser_hip">叉腰镭射姿势</button><button data-pose="laser_back">背手镭射姿势</button><button data-pose="slam">砸地</button><select aria-label="角色" id="studio-role"><option value="hero">主角</option><option value="civilian">平民</option><option value="police">警察</option><option value="soldier">士兵</option></select></div><p id="studio-loading">正在加载角色</p>`;
    const renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.AgXToneMapping;
    renderer.toneMappingExposure = 1.0;
    document.getElementById('viewport')!.appendChild(renderer.domElement);
    const scene = new T.Scene();
    scene.background = new T.Color(0x111923);
    scene.fog = new T.Fog(0x111923, 8, 25);
    const room = new RoomEnvironment(),
        pmrem = new T.PMREMGenerator(renderer),
        target = pmrem.fromScene(room, 0.03);
    room.dispose();
    pmrem.dispose();
    scene.environment = target.texture;
    scene.environmentIntensity = 0.7;
    scene.add(new T.HemisphereLight(0xc2dfff, 0x514033, 1.2));
    const key = new T.DirectionalLight(0xffe3c2, 2.2);
    key.position.set(3, 5, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0002;
    scene.add(key);
    const rim = new T.DirectionalLight(0x7aa4ff, 1.6);
    rim.position.set(-3, 2, -4);
    scene.add(rim);
    const ground = new T.Mesh(
        new T.CircleGeometry(30, 64),
        new T.MeshStandardMaterial({ color: 0x202a35, roughness: 0.8 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const pedestal = new T.Mesh(
        new T.CylinderGeometry(0.9, 0.92, 0.05, 64),
        new T.MeshStandardMaterial({
            color: 0x354553,
            roughness: 0.5,
            metalness: 0.15,
        }),
    );
    pedestal.position.y = 0.025;
    pedestal.receiveShadow = true;
    scene.add(pedestal);
    const camera = new T.PerspectiveCamera(
        39,
        innerWidth / innerHeight,
        0.05,
        50,
    );
    camera.position.set(2.2, 1.7, 3.8);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.02, 0);
    controls.enableDamping = true;
    controls.minDistance = 1.0;
    controls.maxDistance = 7;
    controls.maxPolarAngle = Math.PI * 0.88;
    controls.update();
    const assets = new Assets();
    await assets.load(
        (name, pct) =>
            (document.getElementById('studio-loading')!.textContent =
                `角色准备中 ${pct}%`),
    );
    document.getElementById('studio-loading')!.remove();
    let person = new PersonVisual(assets, 'hero');
    person.group.position.y = 0.05;
    scene.add(person.group);
    let pose = 'ground';
    const supportedPoses = () => {
        const names: Record<string,string> = {jump_start:'jump_start',jump_land:'jump_land',ground:'idle',walk:'walk',jog:'jog',sprint:'sprint',takeoff:'takeoff',fly:'hover',boost:'fly',fall:'fall',land:'land',punch:'punch',slam:'land',casual_attack:'casual_attack',combo_a:'combo_a',combo_b:'combo_b',laser_hip:'laser_hip',laser_back:'laser_back'};
        for (const button of document.querySelectorAll<HTMLButtonElement>('[data-pose]'))
            button.hidden = !person.actions.has(names[button.dataset.pose!]);
    };
    supportedPoses();
    for (const button of document.querySelectorAll<HTMLButtonElement>(
        '[data-pose]',
    ))
        button.onclick = () => {
            pose = button.dataset.pose!;
            person.current = '';
            person.cape?.reset();
            document
                .querySelectorAll('[data-pose]')
                .forEach((b) => b.classList.toggle('selected', b === button));
        };
    document.querySelector<HTMLSelectElement>('#studio-role')!.onchange = (
        e,
    ) => {
        person.dispose();
        person = new PersonVisual(
            assets,
            (e.target as HTMLSelectElement).value as PersonVisual['role'],
            2,
        );
        person.group.position.y = 0.05;
        scene.add(person.group);
        pose = 'ground';
        supportedPoses();
    };
    let prev = performance.now();
    const airVelocity = new T.Vector3();
    renderer.setAnimationLoop((now) => {
        const dt = Math.min(0.05, (now - prev) / 1000);
        prev = now;
        const movementSpeed: Record<string, number> = { walk: 1.5, jog: 4, sprint: 12, boost: 40 };
        // The stage is stationary; provide the air flow of the previewed movement.
        airVelocity.set(0,pose==='fall'?12:0,-(movementSpeed[pose]??0));
        person.update(dt, now / 1000, ['walk','jog','sprint'].includes(pose) ? 'ground' : pose === 'slam' ? 'slamPreview' : pose, movementSpeed[pose] ?? 0, false, 0, ['casual_attack','combo_a','combo_b','laser_hip','laser_back'].includes(pose) ? pose : '', airVelocity);
        controls.update();
        renderer.render(scene, camera);
    });
    window.addEventListener('resize', () => {
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(innerWidth, innerHeight);
    });
    if (import.meta.env.DEV)
        (window as unknown as { studio: unknown }).studio = {
            get person() { return person; },
            scene,
            camera,
            renderer,
            controls,
        };
}
