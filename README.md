# Homelander Simulator · 自由之上

一个在 Web 浏览器中运行的第三人称 3D 街区沙盒。玩家可以自由飞行、使用双眼镭射、重拳、空中砸地和超级速度，攻击 NPC、破坏场景并触发三级追捕。玩家无敌，目前没有声音。

项目保持 **TypeScript + Vite + Three.js + Rapier** 技术栈，以浏览器为发布目标。当前主角采用中性人形，已移除祖国人的服装和披风；正常人体动作优先于外观还原。

## 克隆与运行

已验证环境：Node.js **22.22.0**、npm **10.9.4**、macOS Chrome。

```sh
git clone git@github.com:SleepyShark709/homelander-simulator.git
cd homelander-simulator
npm ci
npm run dev
```

打开终端输出的地址，默认是 <http://127.0.0.1:5173>，点击“进入街区”。首次安装依赖需要联网；运行模型、纹理和物理资源随仓库提供，游戏不请求第三方素材 CDN。建议在 Chrome 中启用硬件加速。

角色展示页：<http://127.0.0.1:5173/?preview=character>。可旋转、缩放，切换主角、平民、警察和士兵，查看走跑、飞行及攻击动作。

## 操作

| 操作 | 键位 |
|---|---|
| 移动 | WASD |
| 视角、瞄准 | 鼠标 |
| 起飞／退出飞行 | F |
| 飞行上升／下降 | 空格／Ctrl |
| 快跑／加速飞行 | 按住 Shift |
| 持续镭射 | 按住左键 |
| 重拳 | 右键 |
| 空中砸地 | Q |
| 暂停、释放鼠标 | Esc |
| 开发性能面板 | 反引号 |

暂停菜单提供继续和重置街区。失焦或丢失鼠标锁定会暂停并清除按键；重置恢复地图、NPC、追捕和临时效果。建筑和车辆损毁在重置前保留。

## 当前角色与动画

角色使用 Mesh2Motion 的 CC0 mannequin、66 骨骼和蒙皮。主角保留 addon 原配模型；普通跑使用 **Jog**，Shift 快跑使用独立的 **Sprint**。这两段 base 动作经过未修改的官方 MIT Human Retargeter 离线适配，其余 10 段主角动画与 NPC 原配组合保留。

没有手写骨骼角度、人体关键帧或关节姿态修补。浏览器直接播放已生成的 GLB；正常游玩无需 Blender 或适配工具。原始动画、工具快照、适配结果及来源记录也随仓库提供，使资产测试与离线重建可以复现。

2026-10-14 已验证：14 项单元/资产测试、12 段完整骨架与蒙皮对照、10 项动作/过渡检查、11 组共 10,092 帧持续运动检查，以及碰撞、飞行、能力、暂停和生产启动回归。自由路段普通跑稳态约 21.6 km/h；场景碰撞仍会阻挡角色。详细方法、首次实操遇 NPC 阻挡的记录和验收边界见 [Jog / Sprint 适配验证](docs/JOG_SPRINT_ADAPTATION.md)。

## 测试与构建

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

生产文件生成到 `dist/`，预览默认地址为 <http://127.0.0.1:4173>。本次 GitHub 推送只交付源码与本地资源，不包含线上部署。

浏览器专项检查需要开发服务运行，并安装本机 Chrome：

```sh
node scripts/native-character-check.mjs
node scripts/character-motion-check.mjs distinct-runs
node scripts/running-continuity.mjs distinct-runs
node scripts/character-game-check.mjs
node scripts/quality-acceptance.mjs
# 此项还需要 npm run preview
node scripts/final-smoke.mjs
```

报告、截图和录屏生成到 `.artifacts/`，不提交到 Git。当前本机录屏为 `.artifacts/web-running-final.mp4`；可用 `node scripts/record-running.mjs web-running --closeup` 重新录制 Jog/Sprint 近景及真实 W/S/Shift 操作，输出 WebM 和时序报告。

资产校验和离线重建需要 Python 3；适配还需要运行中的开发服务与 Chrome：

```sh
node scripts/adapt-native-runs.mjs
node scripts/pack-native-character.mjs
python3 scripts/asset-manifest.py
```

原配网格、绑定及原生动画保持逐字节一致，适配输出校验来源和摘要。不要运行历史 MakeHuman 导入脚本覆盖当前角色。完整重建说明见 [素材账本](docs/ASSETS.md)。

## 工程结构

| 路径 | 内容 |
|---|---|
| `src/` | 游戏生命周期、输入、角色控制、动画、物理、NPC、战斗、城市和 UI |
| `src/config.ts` | 速度、能力、物理与效果预算等集中配置 |
| `public/assets/` | 可直接运行的模型、纹理、许可与素材清单 |
| `tests/` | 规则、物理、地面与资产完整性测试 |
| `scripts/` | 浏览器回归、录制、资源准备与校验工具 |
| `.asset-source/` | 仅纳入当前测试与适配必需的固定输入、工具快照和输出；其余下载与旧素材忽略 |
| `docs/` | 需求、计划、进度、素材与分阶段验证记录 |

## 文档与许可

- [协作规则](AGENT.md)：当前约束、模块入口、验证与提交约定。
- [需求](docs/MVP.md)、[实施计划](docs/IMPLEMENTATION_PLAN.md)、[进度](docs/PROGRESS.md)。
- [素材与许可](docs/ASSETS.md)、[第三方许可文件](public/assets/licenses/)、[素材清单](public/assets/manifest.json)。
- [Jog / Sprint 当前验证](docs/JOG_SPRINT_ADAPTATION.md)、[跑步停顿修复](docs/RUNNING_VALIDATION.md)、[角色替换历史](docs/CHARACTER_VALIDATION.md)。
- [整体质量清单](docs/QUALITY_UPGRADE.md)、[工具链评估](docs/ANIMATION_PIPELINE_OPTIONS.md)。

Mesh2Motion 美术采用 CC0、离线工具采用 MIT；Poly Haven 与 Kenney 素材的许可和来源分别保留。历史 CMU 动作的许可单独记录，不能按 CC0 处理。未使用 UNDEFEATED 的模型或动画。

当前主要验证浏览器为 macOS Chrome；Safari 和当前角色版本的完整长时间城市性能尚未重新验收。历史版本的性能结果不能作为当前版本的实测。
