# Homelander Simulator · 自由之上

一个在 Web 浏览器中运行的第三人称 3D 街区沙盒。玩家可以自由飞行、使用双眼镭射、重拳、空中砸地和超级速度，攻击 NPC、破坏场景并触发三级追捕。玩家无敌，目前没有声音。

项目保持 **TypeScript + Vite + Three.js + Rapier** 技术栈，以浏览器为发布目标。当前主角采用用户的 Tripo 祖国人模型，经 Blender / Auto-Rig Pro 绑定并离线适配动作，保留服装、肩饰和披风。

## 克隆与运行

已验证环境：Node.js **22.23.2**、npm **10.9.8**、macOS Chrome。

```sh
git clone git@github.com:SleepyShark709/homelander-simulator.git
cd homelander-simulator
npm ci
npm run dev
```

打开终端输出的地址，默认是 <http://127.0.0.1:5173>，点击“进入街区”。首次安装依赖需要联网；运行模型、纹理和物理资源随仓库提供，游戏不请求第三方素材 CDN。建议在 Chrome 中启用硬件加速。

角色展示页：<http://127.0.0.1:5173/?preview=character>。可旋转、缩放，切换主角、平民、警察和士兵，查看走跑、飞行及攻击动作。

当前环境为 Blender 制作的江湾城街区：中文商铺、住宅立面、屋顶设备、公交站与行道树，远景包含高架、江岸和斜拉桥。用户提供的公交、电动车、轿车已减面并接入车辆物理。可编辑源工程为 `.asset-source/jiangwan/jiangwan.blend`；范围、来源、重建和本轮测试见 [江湾城环境接入](docs/JIANGWAN_ENVIRONMENT.md)。

## 操作

| 操作 | 键位 |
|---|---|
| 移动 | WASD |
| 视角、瞄准 | 鼠标 |
| 地面跳跃／行进跳跃 | 空格，按一次跳一次；配合 WASD / Shift |
| 起飞／退出飞行 | F |
| 飞行上升／下降 | 空格／Ctrl |
| 快跑／加速飞行 | 按住 Shift |
| 持续镭射 | 按住左键 |
| 重拳 | 右键 |
| 右勾拳／四连拳／直拳接肘击 | E／R／T |
| 切换垂手／叉腰／背手镭射姿势 | V，静止时按住左键生效 |
| 空中砸地 | Q |
| 暂停、释放鼠标 | Esc |
| 开发性能面板 | 反引号 |

暂停菜单提供继续和重置街区。失焦或丢失鼠标锁定会暂停并清除按键；重置恢复地图、NPC、追捕和临时效果。建筑和车辆损毁在重置前保留。

## 当前角色与动画

主角为 **68 骨骼、双手五指、18 段动作**：十份用户 Mixamo 动作，以及八份现成步行、起飞、悬停、落地、砸地、下落、起跳和跳跃落地动作，经官方 Auto-Rig Pro Remap / Universal GLTF 离线适配。普通跑和 Shift 快跑为独立片段，播放倍率上限 1.35。NPC 保持原有 Mesh2Motion CC0 base 组合。

没有手写骨骼角度、人体关键帧或运行时关节修补。浏览器直接播放 GLB；正常游玩无需 Blender 或商业插件。固定绑定工程、原始动画、蒙皮参考和来源摘要随仓库保留。披风在浏览器中以 231 个节点模拟重力、惯性和气流，上缘固定于肩背，下摆随移动和急停摆动，并与身体及场景碰撞；未做布料自碰撞。参数集中在 `src/core/config.ts` 的 `cape`。

地面空格触发一次跳跃，包含短暂蓄力、腾空和普通落地收势；长按不连跳，空中再按不二段跳。WASD 保持空中方向控制，腾空后可按 F 悬停或 Q 砸地；飞行时空格仍为上升。2026-10-18 本轮通过 64 项测试和 101 项浏览器检查，14.4 秒真实操作演示为 `.artifacts/jump/preview.mp4`。

当前下落使用自然张臂、屈膝的 `Jump_air`，起飞约 0.65 秒进入悬停。自然落差达到 6 米才播放落地收势，低处直接恢复移动；此前受控飞行的高度不计入这一落差。Q 共用落地动作并在实际触地时结算。此前下落修正阶段通过 38 项测试、12 项起落专项及现有动作/战斗/移动/碰撞/生产回归，真实按键录屏在 `.artifacts/flight/preview.mp4`。

2026-10-17 初次接入验证：22 项单元/资产测试、16 段动作共 986 源帧的 Blender → Three.js 实际蒙皮对照、68 骨骼过渡、八组循环、11 组走跑、13 项战斗/姿势/暂停、八项碰撞和七项生产冒烟。下落替换后重新对照 1,057 源帧，最大蒙皮采样误差仍约 0.0097 毫米。方法、动作映射与当前验收边界见 [本轮接入记录](docs/HOMELANDER_INTEGRATION.md)。

2026-10-15 mannequin 历史阶段已加入原地/跑动/冲刺跳跃，修复 F 落地后二次升空，Q 改为同一自然落地收势，并接入四套新的 Poly Haven 真实 PBR。操作与本轮结果见 [跳跃、落地与材质验证](docs/JUMP_LANDING_PBR.md)。

## 测试与构建

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

生产文件生成到 `dist/`，预览默认地址为 <http://127.0.0.1:4173>。当前交付为本地工程和资源，未部署到线上。

浏览器专项检查需要开发服务运行，并安装本机 Chrome：

```sh
node scripts/native-character-check.mjs
node scripts/flight-transitions.mjs
node scripts/character-motion-check.mjs homelander
node scripts/running-continuity.mjs homelander
node scripts/character-game-check.mjs
node scripts/jump-landing-check.mjs final
node scripts/quality-acceptance.mjs
# 此项还需要 npm run preview
node scripts/final-smoke.mjs
```

报告、截图和录屏生成到 `.artifacts/`，不提交到 Git。本机最终视频为 `.artifacts/homelander/gameplay.mp4`，94.52 秒。`node scripts/record-homelander.mjs` 可重录 18 项动作展示及真实键鼠游戏操作，输出 WebM 和时序报告。`node scripts/performance.mjs homelander-performance` 执行 10.5 分钟持续运行及三次重置，性能测试与录屏应串行运行。

资产校验需要 Python 3；离线适配还需 Blender 5.2.2 与已安装的 Auto-Rig Pro 3.78.32：

```sh
"/Applications/Blender.app/Contents/MacOS/Blender" --background --python-exit-code 1 --python scripts/adapt-homelander.py
node scripts/pack-homelander.mjs
python3 scripts/asset-manifest.py
```

输出校验固定输入、适配器和 Blender 蒙皮参考的摘要。不要运行历史 MakeHuman 或 mannequin 导入脚本覆盖当前主角。完整重建说明见 [本轮接入记录](docs/HOMELANDER_INTEGRATION.md) 和 [素材账本](docs/ASSETS.md)。

## 工程结构

| 路径 | 内容 |
|---|---|
| `src/` | 按 `app`、`core`、`characters`、`gameplay`、`render`、`world` 六组组织；入口 `main.ts` |
| `src/core/config.ts` | 速度、能力、物理与效果预算等集中配置 |
| `public/assets/` | 可直接运行的模型、纹理、许可与素材清单 |
| `tests/` | 规则、物理、地面、资产完整性、依赖边界与资源释放测试 |
| `scripts/` | 浏览器回归、录制、资源准备与校验工具 |
| `.asset-source/` | 仅纳入当前测试与适配必需的固定输入、工具快照和输出；其余下载与旧素材忽略 |
| `docs/` | 需求、计划、进度、素材与分阶段验证记录 |

架构边界、资源所有权及扩展入口见 [项目架构](docs/ARCHITECTURE.md)。

2026-10-17 架构整理后，类型检查、26 项测试、生产构建和 58 项浏览器检查通过；独立干净副本重新安装依赖并构建通过。

## 文档与许可

- [城市场景密度 TODO / 换电脑接手入口](TODO.md)：不限定地域的 D0–D7 阶段、样板验收与现有资产复用；[网上资产候选](docs/SCENE_ASSET_CANDIDATES.md)列出许可、格式与待确认模型。
- [城市场景启动提示词](docs/SCENE_DENSITY_START_PROMPT.txt)：可直接复制到下一次任务；首批 A01/A04/A05 已确认，从 D0 推进至 D6 样板审看。
- [协作规则](AGENT.md)：当前约束、模块入口、验证与提交约定。
- [需求](docs/MVP.md)、[实施计划](docs/IMPLEMENTATION_PLAN.md)、[进度](docs/PROGRESS.md)。
- [素材与许可](docs/ASSETS.md)、[第三方许可文件](public/assets/licenses/)、[素材清单](public/assets/manifest.json)。
- [当前祖国人与动作验证](docs/HOMELANDER_INTEGRATION.md)、[历史 Jog / Sprint 验证](docs/JOG_SPRINT_ADAPTATION.md)、[跑步停顿修复](docs/RUNNING_VALIDATION.md)、[角色替换历史](docs/CHARACTER_VALIDATION.md)。
- [整体质量清单](docs/QUALITY_UPGRADE.md)、[工具链评估](docs/ANIMATION_PIPELINE_OPTIONS.md)。

用户 Tripo 模型和 Mixamo 动作不标记为 CC0。Mesh2Motion 美术采用 CC0；Poly Haven、Kenney、历史 CMU 动作及离线工具的许可和来源分别保留。Auto-Rig Pro 商业插件未随仓库分发。未使用 UNDEFEATED 的模型或动画。

2026-10-17 初次接入固定版本在 M2 Pro / 32 GiB、macOS Chrome Metal 上完成 10.5 分钟持续运行和三次重置，常规与压力帧间隔中位数均约 16.7 ms。详细数据及方法见本轮接入记录；Safari 和另一会话的后续城市改动需另行验证。
