# 素材与模型账本

核验日期：2026-10-18。用户最新提供 Tripo 祖国人和十份 Mixamo 动作并授权接入。当前主角为 `human/homelander.glb`，NPC 继续使用 Mesh2Motion base。当前证据与重建见 [祖国人接入](./HOMELANDER_INTEGRATION.md)。

## 当前主角

| 资源 | 来源 | 本地文件 |
|---|---|---|
| 祖国人模型与 ARP 源骨架 | 用户提供的 Tripo FBX；在 Blender 5.2.2 / Auto-Rig Pro 3.78.32 绑定，补齐五指并局部蒙皮 | `.asset-source/homelander/rig.blend` |
| 10 份 Mixamo 动作 | 用户提供的 XBot FBX；原名、导出设置、链接和 SHA-256 见 `actions/manifest.json` | `actions/` |
| 步行、起飞、悬停、落地、原砸地 | Mesh2Motion addon 原片段，CC0；Q 当前共用落地片段 | `.asset-source/mesh2motion/human-addon-animations.glb` |
| 起跳、下落、跳跃落地 | Mesh2Motion base `Jump_Start` / `Jump_air` / `Jump_Land`，CC0，经 ARP 正式适配到主角 | `.asset-source/mesh2motion/human-base-animations.glb` |
| 68 骨骼、18 动作、原 PBR 纹理的运行模型 | 上述资源通过 ARP Remap / Universal GLTF 离线转换；不手写人体关键帧 | `public/assets/human/homelander.glb`，29,211,784 字节 |

用户模型和 Mixamo 动作不标作 CC0；原始来源记录及 Mesh2Motion 许可分别保留。插件为本机开发工具，未打包到游戏。模型米制、Y 向上、正面 +Z；双眼挂点随 `head.x` 导出的 `headx` 移动。主角保留 PBR 材质参数；NPC 使用缓存的织物与制服/迷彩纹理。

运行 GLB 使用四权重线性蒙皮；Blender 参考按同一表示生成。原披风仍为上背单骨绑定，打包只新增披风连通分量的 JSON 元数据，BIN 内的网格、权重、动作和纹理不变。浏览器克隆几何后用 231 节点 XPBD 驱动披风，不改源缓存或身体顶点，不做布料自碰撞。来源、适配器、原始动作和参考数据的校验值位于 `.asset-source/homelander/provenance.json`，其中 `rawBinSha256` 固定原始 BIN。普通运行与测试不依赖 Blender 或 Downloads 目录。

## 当前环境与车辆（2026-10-17）

环境改为本项目在 Blender 5.2.2 中制作的江湾城，参考用户图片的中国滨江街景，并采用简化 GTA 风格。八栋主体、屋顶细节、树木、公交站、高架、江岸及桥梁导出为 `jiangwan/district.glb`，源工程为 `.asset-source/jiangwan/jiangwan.blend`。原始参考图不作为运行纹理，未使用 GTA 原版资源。

三份用户 Tripo FBX 分别转换为 `jiangwan/bus.glb`、`scooter.glb`、`sedan.glb`；合计 63,968 面、1K PBR 贴图，统一米制、Y 向上、车头 +Z，保留等比尺寸。原始 FBX、减面源工程、参考图随 `.asset-source/jiangwan/` 保存，原始摘要和导出统计见 `public/assets/jiangwan/build.json`。用户授权用于本项目，不标为 CC0，具体见 `licenses/jiangwan-source.txt`。

正常运行不依赖 Blender 或 Downloads。离线重建使用 `scripts/build-jiangwan.py`，随后运行 `scripts/asset-manifest.py`。游戏道路继续使用本项目的无重叠地表、Poly Haven PBR 和既有路灯；保留两处可破坏商铺和全部玩法。江湾接入阶段素材清单核验 67 个本地媒体文件；合并后的清单以 manifest 为准。完整证据见 [江湾城环境接入](./JIANGWAN_ENVIRONMENT.md)。

## 2026-10-14 mannequin 基线（当前仅 NPC 继续使用）

| 资源 | 作者、来源 | 许可 | 本地文件与用途 |
|---|---|---|---|
| 原配人形、66 骨骼、蒙皮、动作与内嵌调色纹理 | [Mesh2Motion 官方 app 仓库](https://github.com/Mesh2Motion/mesh2motion-app)，提交 `653a9698f5f315523072f1c3ff3496100401317b` | CC0；`public/assets/licenses/mesh2motion-cc0.txt` | `human/native-player.glb`（2,157,680 字节），`human/native-npc.glb`（916,728 字节） |
| Jog/Sprint 的离线人体重定向工具 | 同一官方固定提交的未修改 Human Retargeter | MIT；`scripts/vendor/mesh2motion/LICENSE-MIT.MD` | 开发时使用，未打包进游戏 JS；输出经完整骨架/蒙皮对照验证 |
| 沥青、铺装、砖墙 PBR、街道 HDR 与路灯 | [Poly Haven](https://polyhaven.com/)；具体作者、下载地址及 SHA 见 `public/assets/quality-sources.json` 与 `manifest.json` | CC0；`licenses/polyhaven.txt` | `pbr/`、`environment/`、`street-lamp/` |
| 咖啡桌椅、盆栽、抽屉柜、卷帘门（四套实际 glTF） | [Poly Haven](https://polyhaven.com/)，James Ray Cock / Rico Cilliers / Ulan Cabanilla / MP | CC0；`licenses/polyhaven.txt` | `city-details/`；2k 材质，原比例米制缩放，三维陈设与可破坏家具 |
| 树皮 PBR | [Bark Brown 02](https://polyhaven.com/a/bark_brown_02)，Rob Tuytel | CC0；`licenses/polyhaven.txt` | `pbr/bark_brown_02/`；1k 颜色 / OpenGL 法线 / 粗糙度 / AO |
| 透明阔叶枝簇 | 本项目通过 GPT 内置图像生成工具制作 | AI 生成项目素材，未标为第三方 CC0 | `foliage/broadleaf-branch-v1.png`；1254² RGBA，提示词、来源与 SHA 见 `foliage/provenance.json` |
| 街区建筑、道路、街道陈设、当前车辆主体、武器和能力特效 | 本项目制作 | 本项目产物 | `src/world/`、`src/characters/PersonVisual.ts`、`src/render/Effects.ts` |

历史 mannequin 基础高度约 1.83 米，米制、Y 轴向上。当前 NPC 通过本地生成的织物、衣裤与鞋、深蓝警服/徽章、绿色迷彩区别，运行时按原绑定空间投影，不改网格或骨架。两张 256² swatch 由 `Assets.textures` 共享缓存，最终退出释放。当前主角以上文祖国人基线为准。

城市混凝土、石材、外墙块材与屋顶现已使用 Poly Haven 的 `concrete_wall_006`、`stone_tiles_02`、`rectangular_facade_tiles`、`asphalt_05`，替换上一轮三组生成贴图；颜色 2k，OpenGL 法线/粗糙度/AO 各 1k，来源扫描宽度两米。原沥青/铺地/砖墙也补齐 AO，共七套四通道 PBR。下载与校验入口为 `fetch-quality-assets.py` / `asset-manifest.py`。NPC 织物/迷彩仍在 `src/characters/NpcMaterials.ts` 本地生成。详细来源、真实画面和验收见 [JUMP_LANDING_PBR.md](./JUMP_LANDING_PBR.md)。

新增近景素材由 `scripts/fetch-city-details.py` 获取官方 API 中指定的模型/纹理版本；逐文件核对官方 MD5，再记录本地 SHA-256。完整依赖与来源保存于 `city-details/sources.json`，不依赖运行时外链。四套模型及依赖共约 18.81 MB，树皮四通道约 2.53 MB。树叶使用 GPT 工具生成，无 Gemini API 依赖。店铺玻璃、条纹布篷、柜台、招牌及照明由本项目搭建，与真实模型组合；不会把程序搭建部分称为扫描模型。14 件新增模型陈设可破坏，另有两座可破坏柜台；卷帘门、树和布篷为静态装饰。实际键鼠进店及破坏验收见 [DIRECTOR_OPTIMIZATION.md](./DIRECTOR_OPTIMIZATION.md)。

## 历史 mannequin 原配资源边界

基础包和附加包各自包含一个完整的蒙皮 mannequin、66 骨骼及动作。两包骨骼同名，但绑定矩阵不同，不能原样跨包复制动画。主角采用 addon 模型/蒙皮/骨架，10 段原配动画不变；认可的 base Jog/Sprint 经官方工具正规适配。NPC 完整采用 base，未改变。

`model-human.glb` 是未蒙皮网格，`rig-human.glb` 是独立骨架模板；二者不是当前游戏角色的运行组合。实际使用的是两个原始动画 GLB 内已经绑定的角色。

每段均为 198 个通道（66 骨骼的位置、旋转、缩放）。几何、权重、绑定矩阵和原配 11+7 段动画采样字节不变；主角 Jog/Sprint 保留官方工具生成的完整输出。每段 extras 保存原名、原包、CC0、固定提交；仅这两段标记 `retargeted:true`，并记录目标绑定、工具、采样率及 adapter SHA。

| 对象 / 游戏片段 | Mesh2Motion 原名 | 原包 |
|---|---|---|
| 主角 idle / walk | Idle_Subtle / Walk_Female | addon |
| 主角 jog / sprint | Jog / Sprint；两段独立原动作，屈肘握拳、交替摆臂，冲刺更前倾 | base → addon（官方离线工具） |
| 主角 punch / shoot / fall | Fighting Right Jab / Fighting Idle（未用于主角射击）/ Glide | addon |
| 主角 takeoff / hover / fly | Levitate Entrance / Levitate Idle / Flying Forward Super | addon |
| 主角 land / slam | Land_Three_Point / Attack_Ground_Pound；F/Q 触地统一从 land 原片段接触部分恢复 | addon |
| 主角 jump | Jump_2；无 root 位移，物理驱动原地/行进跳跃 | addon |
| NPC idle / walk / jog / sprint | Idle_A / Walk / Jog / Sprint | base |
| NPC punch / shoot / fall | Punch_Jab / Pistol_Aim_Neutral / Jump_air | base |

主角有 13 个游戏片段名（13 个不同原片段），NPC 有 7 段。角色展示页只显示当前角色实际支持的动作。NPC 在玩法中不飞行；警察、士兵仍有枪械与射击反馈。

## 历史 mannequin 运行适配

- 使用 SkeletonUtils 克隆独立骨架；几何与纹理缓存复用，材质逐角色克隆。
- 肢体动作由现成资源提供。运行时负责播放、状态、归一化相位衔接、片段混合、角色朝向和整角色转向倾身；攻击层仅筛选原配重拳轨道以保留跑动腿部，不创作关键帧；主角跑步随速度调整播放节奏，上限 1.35 倍，集中在 `CONFIG.playerRunAnimationRateMax`。步行和 NPC 保持原速上限，没有运行时关节修姿态。
- 保留双眼镭射能力：静态眼部挂点按原配 head 绑定坐标校准，随骨骼移动，仅在攻击时显示红光。
- NPC 死亡使用 15 部位的 Rapier 布娃娃，由实际受击姿势转入物理；正确处理小写 root 与 head_leaf。
- 四能力、追捕、车辆、暂停和重置不变。当前没有披风。

## 历史 mannequin 重建与校验

正常运行直接使用 `public/assets/`，无需联网下载模型、Blender 或离线动作工具。重建需 Node/npm、Chrome、保存的 vendor 核心与原包；适配时需运行 `npm run dev`：

```sh
python3 scripts/fetch-mesh2motion.py
node scripts/adapt-native-runs.mjs
node scripts/pack-native-character.mjs
python3 scripts/asset-manifest.py
```

原始包与来源校验在 `.asset-source/mesh2motion/`。适配输出、独立来源记录在 `.asset-source/mesh2motion-adapted-runs/`；pack 核验缓存有效后打包，本身无需 Vite。测试逐字节比较原网格/骨架/蒙皮、原配动画及两段工具输出；全身源动作对照由浏览器检查执行。

运行 `node scripts/native-character-check.mjs` 可在开发服务中逐帧比较实际角色与原包模型，覆盖完整骨架、双臂/双腿和蒙皮顶点；不是仅比较手腕角度。实际验证见 [CHARACTER_VALIDATION.md](./CHARACTER_VALIDATION.md)。当前清单为 113 个本地媒体文件，所有 GLB 及外部依赖已核验。

## 历史资源

旧 MakeHuman 角色、服装、纹理已移出运行目录，备份在 `.asset-source/legacy-makehuman/human/`。来源仍为 [MakeHuman / MPFB2](https://github.com/makehumancommunity/mpfb2) 与[官方 CC0 系统素材包](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html)，许可保留在 `licenses/makehuman.txt` / `makehuman-cc0.txt`。`build-human.py`、`import-mesh2motion.mjs` 是旧方案记录，不能作为当前重建管线；官方未修改的 MIT vendor 核心现在由新的原配骨架适配管线使用。

Kenney [Blocky Characters](https://kenney.nl/assets/blocky-characters)、[City Kit](https://kenney.nl/assets/city-kit-commercial)、[Car Kit](https://kenney.nl/assets/car-kit) 作为早期参考保留，均 CC0，清单标记 `retainedReference`，许可在 `licenses/kenney-*.txt`。当前 NPC 使用 Mesh2Motion，主角来源见上文。

NPC 是作者提供的简化 mannequin。未使用 UNDEFEATED 的模型、动画或其他美术素材。
