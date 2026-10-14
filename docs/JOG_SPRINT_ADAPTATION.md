# 主角 Jog / Sprint 接入与验证

日期：2026-10-14。用户认可 base 原配 Jog/Sprint 并排预览，明确后续仍在 Web 打开，授权接入主角并完成适配与验证。当前已经接入；保留 TypeScript、Vite、Three.js、Rapier。没有引擎迁移，也没有自制人体动作。

## 资源与适配

主角继续使用 addon 原配的 7,399 顶点、66 骨骼、绑定矩阵、蒙皮和材质。基础包与附加包骨名/层级相同，但绑定坐标、骨长、权重和网格不同，原始动作不能跨包直接复制。

| 游戏状态 | 已选原动作 | 原时长 | 接入方式 |
|---|---|---:|---|
| jog，普通跑 | base Jog | 1.1667 秒 | Mesh2Motion 官方工具离线适配至 addon |
| sprint，快跑 | base Sprint | 0.8333 秒 | 同上，独立动作；并非同片段提速 |
| 其余 10 段主角动作 | addon 原配待机、步行、攻击、飞行和落地等 | 保留原值 | 全部动画采样逐字节保留 |
| NPC 7 段动作 | base 原配组合 | 保留原值 | 完整原配组合，未改变 |

原始 CC0 美术与 MIT 代码均固定在 Mesh2Motion commit `653a9698f5f315523072f1c3ff3496100401317b`。原包 SHA：base `406eb0a8dc4ab366e623b79b6e3005a4951392e1bda78ae39c1099d31147733c`；addon `a0d64d555e0d492026b72d58bf8e16c5e86779295f9093e376dcc001915c2c95`。许可见 `public/assets/licenses/mesh2motion-cc0.txt`、`scripts/vendor/mesh2motion/LICENSE-MIT.MD`。

`scripts/adapt-native-runs.mjs` 调用未修改的官方 Rig/Retargeter，先从 inverse bind matrices 恢复各自真实中立姿态，再做官方 swing/twist 和 pelvis 位移映射。配置覆盖肩胛、手指、脚趾与叶骨，共 65 个映射骨；相同且静态的 root 单独断言并保留。骨骼和链按父先于子的顺序处理；3 段脊柱分别使用官方逐关节链映射，避免首尾插值改变原作者的中间脊柱动作。

按 120 Hz 捕获工具实际输出，包含真实 t=0 与 clamped endpoint，生成 66×3=198 个位置/旋转/缩放通道。原 Jog/Sprint 没有真实缩放动画；目标骨长与中立缩放保持原配。没有添加手写姿态、关节角度公式或旋转补丁。程序生成的采样记录工具结果，不是新创作动作。

输入 SHA、12 个固定 vendor 核心文件的完整性、adapter SHA 和输出轨道 SHA 均写入 `.asset-source/mesh2motion-adapted-runs/provenance.json`。打包核对独立来源记录与输出摘要，拒绝失效缓存，仅允许 jog/sprint 进入跨 bind 分支。输出 `public/assets/human/native-player.glb` 为 2,098,996 字节；NPC 为 916,728 字节。MIT 工具和原始开发输入不进入生产运行目录。

## 循环与切换

原作者两段动作都按左脚、右脚顺序落地，归一化脚掌最低点分别约 Jog 0.161/0.661、Sprint 0.175/0.718；没有半周期颠倒。保持既有归一化相位衔接与 0.24 秒平滑权重混合，播放倍率上限 1.35。没有为了对齐而改写关键帧或脚部姿势。

Sprint 所有原轨道首尾相同。Jog 原片段存在两个左臂轻微旋转尾差，适配保留了作者循环特点；脚部首尾连续。整周期播放、跨循环和反复按下/松开 Shift 已包含在连续运动检查中。

旧 Run_Female 的“上身角度 <25°”只适用于上一跑姿，不能套用到用户已认可的前倾 Sprint。本轮比较选中原片段的完整变形、上身角度和摆臂相位；原有 0.12 米/120 Hz 连续性阈值、速度不归零和权重归一要求保留。

## 已执行验证

| 检查 | 结果 |
|---|---|
| `npm test` | 4 文件、14 项通过；原网格/骨架/权重/绑定逐字节一致，原配 10+7 段动画不变，两跑步与工具输出一致 |
| `npm run build` | 类型检查和生产构建通过；既有大 JS chunk 提示保留 |
| `adapt-native-runs.mjs` | 两段全部 66 骨骼的 bind-relative 蒙皮变形旋转对照最大误差分别 0.07994° / 0.07903°，低于 0.15° |
| `native-character-check.mjs` | 12 段各采样 241 帧，包括采样点之间；全骨架、14 条肢体链和蒙皮顶点通过；两跑步变形参考误差 <0.08° |
| `character-motion-check.mjs distinct-runs` | 10 项通过；完整双臂/手指、手腕连续性、选中姿态、交替摆臂、快速切换；权重总和约 1，最大位移 0.08530 米/120 Hz |
| `running-continuity.mjs distinct-runs` | 11 组、10,092 帧通过；60/120/144 Hz、不均匀间隔、转向、停止再起跑、反复 Shift、高台跑下/坠落/落地 |
| `quality-acceptance.mjs` | 8 项通过；路沿、墙边步行/出拳、前后飞行、悬停镜头、起飞和 144 Hz 镭射挂点 |
| `character-game-check.mjs` | 3 项通过；重拳一次命中/完整收势、暂停、65 米砸地与落地收势 |
| `final-smoke.mjs` | 7 项通过；真实键鼠、暂停、破坏、空中追捕和生产资源启动；首次预览服务缺失后已补启并完整复测 |
| `asset-manifest.py` | 62 个本地媒体依赖与 SHA 校验通过；dist 主角 GLB 与 public 完全一致 |

普通跑匀速最低约 21.596 km/h，冲刺约 86.389 km/h。稳态速度归零帧、错误动作帧为 0，平地物理高度跳动为 0。所有运动场景最大归一化姿态位移 0.08548 米/120 Hz，低于原有 0.12 米阈值。全部成功检查无运行时异常。

主要报告：`.artifacts/run-adaptation.json`、`native-character-check.json`、`character-motion-distinct-runs.json`、`running-distinct-runs.json`、`quality-acceptance.json`、`character-game-check.json`、`final-smoke.json`。

## 真实操作与画面

两次录制都使用当前主角与实际 W/S/Shift 输入。首次 `record-running.mjs web-running --closeup` 的返回路线出现一次与横穿 NPC 相撞的短暂阻挡，严格无停顿断言失败；未隐藏这份失败报告和视频。抽帧 `web-running-video/inspect-05.png`、`inspect-06.png` 可见 NPC 挡在人物/镜头前，随后横穿离开，速度恢复。该次未记录碰撞句柄，归因依据是实际画面，不冒充过滤回调实测。

录制脚本已增加位置、按键和碰撞记录。第二次 `record-running.mjs web-running-diagnostic` 两项检查通过：普通跑稳态 708 帧保持 21.55294–21.60 km/h，全部 ground/jog；实际 Shift 的 Sprint 稳态 81 帧，松开后回到 Jog。报告 `web-running-diagnostic-recording.json` 保存完整时序和碰撞数据。

交付 `.artifacts/web-running-final.mp4`：H.264、1200×900、32.44 秒、8,789,392 字节。前 10.8 秒取首次录制的 Jog/Sprint 正面/侧面近景，后续接完整第二次实操录制；没有调整游戏速度或动作时间。原始两段 webm、报告与抽帧均保留。已审看正面/侧面与实际普通跑、快跑、恢复普通跑画面；没有发现额外关节折叠或蒙皮扭转。

## 重建

正常游玩无需联网或安装 Blender。离线重建需本机 Chrome、Node/npm 依赖、保存的原包和官方代码副本，以及运行中的 `npm run dev`：

```sh
python3 scripts/fetch-mesh2motion.py # 仅开发输入缺失时下载固定原包
node scripts/adapt-native-runs.mjs
node scripts/pack-native-character.mjs
python3 scripts/asset-manifest.py
npm test
npm run build
```

修改适配或来源后须重新执行完整骨架/蒙皮、循环/过渡、跑步连续性和能力检查。当前验收为 macOS Chrome；没有为此轮重新执行完整长时间城市性能测试或 Safari 实机验收。
