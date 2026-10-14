# 素材与模型账本

核验日期：2026-10-14。用户要求放弃祖国人外观、保持 Web 目标，并认可两段普通跑/快跑。当前采用 Mesh2Motion 原配中性人形，主角 addon 模型、骨架、蒙皮保留；仅 Jog/Sprint 用官方成熟工具离线适配。未手写角色动作，详见 [接入与验证](./JOG_SPRINT_ADAPTATION.md)。

## 当前实际使用

| 资源 | 作者、来源 | 许可 | 本地文件与用途 |
|---|---|---|---|
| 原配人形、66 骨骼、蒙皮、动作与内嵌调色纹理 | [Mesh2Motion 官方 app 仓库](https://github.com/Mesh2Motion/mesh2motion-app)，提交 `653a9698f5f315523072f1c3ff3496100401317b` | CC0；`public/assets/licenses/mesh2motion-cc0.txt` | `human/native-player.glb`（2,098,996 字节），`human/native-npc.glb`（916,728 字节） |
| Jog/Sprint 的离线人体重定向工具 | 同一官方固定提交的未修改 Human Retargeter | MIT；`scripts/vendor/mesh2motion/LICENSE-MIT.MD` | 开发时使用，未打包进游戏 JS；输出经完整骨架/蒙皮对照验证 |
| 沥青、铺装、砖墙 PBR、街道 HDR 与路灯 | [Poly Haven](https://polyhaven.com/)；具体作者、下载地址及 SHA 见 `public/assets/quality-sources.json` 与 `manifest.json` | CC0；`licenses/polyhaven.txt` | `pbr/`、`environment/`、`street-lamp/` |
| 街区建筑、道路、街道陈设、当前车辆主体、武器和能力特效 | 本项目制作 | 本项目产物 | `Environment.ts`、`StreetProps.ts`、`World.ts`、`PersonVisual.ts`、`Effects.ts` |

模型基础高度约 1.83 米，米制、Y 轴向上。主角保留作者的原始调色材质；NPC 通过整体材质色区分，警察为蓝色、士兵为绿色。没有祖国人的金发、战衣、肩饰、腰带或披风，也没有重新制作人体或骨骼。

## 原配资源边界

基础包和附加包各自包含一个完整的蒙皮 mannequin、66 骨骼及动作。两包骨骼同名，但绑定矩阵不同，不能原样跨包复制动画。主角采用 addon 模型/蒙皮/骨架，10 段原配动画不变；认可的 base Jog/Sprint 经官方工具正规适配。NPC 完整采用 base，未改变。

`model-human.glb` 是未蒙皮网格，`rig-human.glb` 是独立骨架模板；二者不是当前游戏角色的运行组合。实际使用的是两个原始动画 GLB 内已经绑定的角色。

每段均为 198 个通道（66 骨骼的位置、旋转、缩放）。几何、权重、绑定矩阵和原配 10+7 段动画采样字节不变；主角 Jog/Sprint 保留官方工具生成的完整输出。每段 extras 保存原名、原包、CC0、固定提交；仅这两段标记 `retargeted:true`，并记录目标绑定、工具、采样率及 adapter SHA。

| 对象 / 游戏片段 | Mesh2Motion 原名 | 原包 |
|---|---|---|
| 主角 idle / walk | Idle_Subtle / Walk_Female | addon |
| 主角 jog / sprint | Jog / Sprint；两段独立原动作，屈肘握拳、交替摆臂，冲刺更前倾 | base → addon（官方离线工具） |
| 主角 punch / shoot / fall | Fighting Right Jab / Fighting Idle（未用于主角射击）/ Glide | addon |
| 主角 takeoff / hover / fly | Levitate Entrance / Levitate Idle / Flying Forward Super | addon |
| 主角 land / slam | Land_Three_Point / Attack_Ground_Pound | addon |
| NPC idle / walk / jog / sprint | Idle_A / Walk / Jog / Sprint | base |
| NPC punch / shoot / fall | Punch_Jab / Pistol_Aim_Neutral / Jump_air | base |

主角有 12 个游戏片段名（12 个不同原片段），NPC 有 7 段。角色展示页只显示当前角色实际支持的动作。NPC 在玩法中不飞行；警察、士兵仍有枪械与射击反馈。

## 运行适配

- 使用 SkeletonUtils 克隆独立骨架；几何与纹理缓存复用，材质逐角色克隆。
- 肢体动作由现成资源提供。运行时负责播放、状态、归一化相位衔接、片段混合、角色朝向和整角色转向倾身；主角跑步随速度调整播放节奏，上限 1.35 倍，集中在 `CONFIG.playerRunAnimationRateMax`。步行和 NPC 保持原速上限，没有运行时关节修姿态。
- 保留双眼镭射能力：静态眼部挂点按原配 head 绑定坐标校准，随骨骼移动，仅在攻击时显示红光。
- NPC 死亡使用 15 部位的 Rapier 布娃娃，由实际受击姿势转入物理；正确处理小写 root 与 head_leaf。
- 四能力、追捕、车辆、暂停和重置不变。当前没有披风。

## 重建与校验

正常运行直接使用 `public/assets/`，无需联网下载模型、Blender 或离线动作工具。重建需 Node/npm、Chrome、保存的 vendor 核心与原包；适配时需运行 `npm run dev`：

```sh
python3 scripts/fetch-mesh2motion.py
node scripts/adapt-native-runs.mjs
node scripts/pack-native-character.mjs
python3 scripts/asset-manifest.py
```

原始包与来源校验在 `.asset-source/mesh2motion/`。适配输出、独立来源记录在 `.asset-source/mesh2motion-adapted-runs/`；pack 核验缓存有效后打包，本身无需 Vite。测试逐字节比较原网格/骨架/蒙皮、原配动画及两段工具输出；全身源动作对照由浏览器检查执行。

运行 `node scripts/native-character-check.mjs` 可在开发服务中逐帧比较实际角色与原包模型，覆盖完整骨架、双臂/双腿和蒙皮顶点；不是仅比较手腕角度。实际验证见 [CHARACTER_VALIDATION.md](./CHARACTER_VALIDATION.md)。当前清单为 62 个本地媒体文件，所有 GLB 及外部依赖已核验。

## 历史资源

旧 MakeHuman 角色、服装、纹理已移出运行目录，备份在 `.asset-source/legacy-makehuman/human/`。来源仍为 [MakeHuman / MPFB2](https://github.com/makehumancommunity/mpfb2) 与[官方 CC0 系统素材包](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html)，许可保留在 `licenses/makehuman.txt` / `makehuman-cc0.txt`。`build-human.py`、`import-mesh2motion.mjs` 是旧方案记录，不能作为当前重建管线；官方未修改的 MIT vendor 核心现在由新的原配骨架适配管线使用。

Kenney [Blocky Characters](https://kenney.nl/assets/blocky-characters)、[City Kit](https://kenney.nl/assets/city-kit-commercial)、[Car Kit](https://kenney.nl/assets/car-kit) 作为早期参考保留，均 CC0，清单标记 `retainedReference`，许可在 `licenses/kenney-*.txt`。当前人物全部使用 Mesh2Motion。

当前人形是作者提供的简化 mannequin，没有精细面部或服装定制。未使用 UNDEFEATED 的模型、动画或其他美术素材。
