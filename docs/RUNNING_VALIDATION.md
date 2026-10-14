# 持续跑步与动作连续性修复

2026-10-14 当前：已将用户认可的独立 Jog/Sprint 正式适配到主角，保留原物理停顿修复。11 组、10,092 帧连续运动检查通过，含反复 Shift；14 项测试、12 段完整骨架/蒙皮、10 项动作/过渡、能力与生产验证通过。最新视频 `.artifacts/web-running-final.mp4`，方法、实际 NPC 阻挡记录和验证边界见 [JOG_SPRINT_ADAPTATION.md](./JOG_SPRINT_ADAPTATION.md)。以下是此前阶段的历史证据。

日期：2026-10-13。范围：持续普通跑步反复从约 20 多 km/h 归零，以及由此引起的动画停顿。继续使用原配 Mesh2Motion 模型和现成动作，未修改骨骼姿态或动画关键帧。

同日后续：用户否决潜行跑外观，当前动作改为常规 Run_Female；最新跑姿检查和视频见本文末节。下面先保留速度归零定点修复时的证据。

## 复现与原因

修复前通过真实 `Game.frame → Player.step → Rapier → PersonVisual` 调用链持续按住前进，在平坦主街复现。不是 NPC 阻挡或落地收势：移除所有人物后仍发生，停顿时 mode=ground、recovery=0，只有基础地面接触。

| 修复前场景 | 测试长度 | 加速首秒后速度归零帧 |
|---|---:|---:|
| 普通跑步，有平民，60 Hz | 12 秒 | 34 |
| 普通跑步，无平民，60 Hz | 12 秒 | 39 |
| 冲刺，无平民，60 Hz | 4 秒 | 6 |

地面模式每帧额外向下施加重力，碰撞控制器在接触间隙边界有时只返回向上 0.0001 米的修正，丢弃水平位移。Player 随后把被阻挡轴的速度清零，于是重新加速；动画也依次切到 idle、walk、jog 并重启相位。旧 220 米地面 cuboid 在转向时还会返回倾斜接触法线，产生约 2.5–2.7 厘米的上下跳动。

原始证据：`.artifacts/running-before.json`。单独增大 nudge 或换胶囊形状未能消除停顿；抑制已落地帧的重力位移能消除归零。对比记录在 `running-nudge-probe.json`、`running-ground-probe.json`、`flat-contact-probe.json`。

## 当前实现

- Player 在控制器已确认落地时保持垂直速度为零；离开支撑后恢复重力，高台跑下仍会坠落和播放完整落地。
- 基础地面采用向上法线固定的 HalfSpace；可见道路、人行道、墙体、车辆和边界碰撞继续保留。
- Rapier 0.20 对 HalfSpace 的近零位移查询会错误返回半个球半径的向上位移。静止时改用 0.0001 米的非零支撑探测，更新 grounded，但保持请求的静止位置。避免悬停自动上升、待机跳起以及砸地后重复落地。探测距离集中在 `CONFIG.playerSupportProbe`。
- 地面动画采用插值后的水平速度和方向，与当前画面位置同步；垂直重力不再参与站立/走跑片段选择。原动画文件和全部通道保持不变。

## 当前验证

`node scripts/running-continuity.mjs after`：10 项通过，9,372 帧采样。覆盖有/无平民、60/120/144 Hz、不均匀渲染间隔、连续 12 秒普通跑步、转向、冲刺、松键再起跑，以及从 5 米高台跑下、坠落、落地后继续跑。

- 普通跑步加速首秒后约 21.596–21.600 km/h，冲刺约 86.39–86.40 km/h；速度归零帧数为 0。
- 匀速时没有误切 idle/walk；真实渲染位移同步前进，不能只用总路程掩盖停顿。
- 平地稳态高度帧间跳动为 0；头、手、脚位移按 120 Hz 归一化后的最大值约 0.1132 米，小于原有 0.12 米连续性阈值。
- 当前报告：`.artifacts/running-after.json`。

回归已完成：

| 检查 | 结果 |
|---|---|
| `npm test` | 4 文件、13 项通过，含原模型/绑定/动画逐字节完整性 |
| `npm run build` | 类型检查和生产构建通过 |
| `quality-acceptance.mjs` | 8 项通过：路沿、墙边、出拳、飞行、悬停、镜头、起飞、镭射挂点 |
| `character-game-check.mjs` | 3 项通过：攻击完整收势、暂停、砸地一次命中与落地收势 |
| `character-motion-check.mjs running` | 8 项通过：原片段循环与快速走跑过渡 |
| `quality-ragdoll.mjs` | 三类人物通过；最大地面穿入约 1.55 厘米，关节长度变化低于 0.004 米，清理后数量回到基线 |
| `final-smoke.mjs` | 7 项通过，含真实输入、暂停、破坏、空中追捕与生产构建启动 |

以上检查均无运行时异常。生产构建仍有既有的大体积 JS chunk 提示。本次有界修复不替代整个城市质量或长时间性能验收。

## 实际录屏

`node scripts/record-running.mjs` 用真实 W/S/Shift 键盘输入录制。普通跑步稳态 708 个实际渲染帧均处于 ground/jog，速度约 21.56–21.60 km/h，无归零；包含前进、返回、停止、冲刺与恢复普通跑步。

视频：`.artifacts/running-preview.mp4`，H.264、1200×900、21.72 秒、约 4.86 MB。录制报告为 `running-recording.json`；截图与连续跑步周期抽帧在 `.artifacts/running-video/`，已检查。这是归零问题修复时的画面；常规跑姿的新视频见下节。

## 常规跑步动作替换（同日后续）

用户认为潜行跑姿难看。当前主角 jog/sprint 从 `Run_Stealth` 改为同一 addon 原包内的 `Run_Female`。没有跨包混装；原配模型、66 骨骼、绑定矩阵、蒙皮与所选动作的全部 198 个通道仍逐字节保留。

新动作上身更直，屈肘、握拳，左右手与腿交替摆动。整周期 pelvis→spine_03 相对竖直方向的最大角度约 16.99°（潜行跑约 36°），左右手前后轨迹相关系数约 -0.9995。原片段时长约 0.833 秒；运行时按速度调整播放节奏，上限 1.35 倍，集中在 `CONFIG.playerRunAnimationRateMax`，没有改写关键帧。

已审看近景正面、侧面和游戏实操，当前验证：

- `character-motion-check.mjs normal-run`：10 项通过，核对双臂到手指的原配旋转、连续性、普通跑步的上身姿态/交替摆臂、快速状态切换。完整臂链/手指旋转与原片段的误差低于 6e-8 rad，过渡最大位移约 0.0948 米，保留 0.12 米阈值。
- 旧“手腕夹角 <40°”是针对上一姿态的局部代理指标，不能判断常规握拳跑步。新原片段的该向量夹角最大约 56.76°，没有被程序修正；本次以原配完整臂链/手指一致性、全身姿态和实际图像核验替代该单角度判定，没有把其数值提高后冒充旧检查通过。
- `native-character-check.mjs`：当前 12 个片段的完整骨架、双臂/双腿及蒙皮顶点均与原包一致。
- `running-continuity.mjs normal-run`：10 项、9,372 帧通过；速度归零帧为 0，60/120/144 Hz、不均匀间隔、转向、重新起跑、高台坠落均通过；最大归一化姿态位移约 0.1114 米，小于 0.12 米。
- `quality-acceptance.mjs` 8 项、`final-smoke.mjs` 7 项、`npm test` 13 项、类型检查/生产构建及 62 个本地媒体校验通过，无运行时异常。

报告：`.artifacts/character-motion-normal-run.json`、`running-normal-run.json`、`native-character-check.json`、`normal-running-recording.json`。原来的普通跑步速度保持约 21.6 km/h。

最新视频为 `.artifacts/normal-running-preview.mp4`，包含正面/侧面近景和真实 W/S/Shift 游戏输入。录制命令：`node scripts/record-running.mjs normal-running --closeup`。真实普通跑步稳态 708 帧约 21.56–21.60 km/h，全部处于 ground/jog；截图在 `normal-running-video/`，已检查。
