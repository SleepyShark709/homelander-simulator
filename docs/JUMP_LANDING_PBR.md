# 地面与行进跳跃、统一落地及扫描材质

日期：2026-10-15。覆盖本轮要求：主角跳跃与行进跳跃、F 自由落地后二次升空、Q 触地复用自由落地收势，以及更真实的贴图和阴影。

## 操作与动作

- 地面按空格起跳。原地、普通跑和 Shift 冲刺均可跳，WASD 可以在空中继续调整方向，松开方向键保留起跳水平动量；按住空格不会落地后自动连跳，也没有二段跳。
- 飞行时空格仍为上升，Ctrl 下降；跳跃中 F 可进入飞行，Q 可转为快速砸地。
- `jump` 使用 Mesh2Motion addon 同包 `Jump_2`，时长 1.625 秒、完整 66 骨骼/198 通道，原模型、蒙皮、绑定和原始关键帧保持不变。使用现有无 root 位移片段，由 Rapier 驱动物理高度和前进距离，避免叠加两套位移。
- 起跳速度 9 m/s，重力 24 m/s²；物理步长下实测最高约 1.613 米，普通跑空中水平位移约 4.194 米，冲刺约 16.776 米。跑跳接地后直接混合回 Jog/Sprint，保持水平运动；站立跳和高空落地保留接地收势。
- F 和 Q 触地均进入 `Land_Three_Point` 的接地/恢复部分。Q 保留原空中准备动作、快速下降、一次冲击结算与范围效果；落地后不再继续使用另一套砸地收势。

## 二次升空的实际原因与修复

之前的物理角色已经接触地面，但 `land` 从原片段时间 0 开始播放。它的开头是空中下降部分，实际游戏中导致脚底最高再次离开支撑面约 **1.649 米**；直接播放原片段开头的蒙皮脚底甚至在原点以上约 4 米。旧检查仅断言 `land` 持续一定帧数，没有检查蒙皮脚底高度。

现在接地从原片段 **14/30 秒**的首次脚掌接触时刻进入；恢复时长为剩余 0.908 秒。接地恢复对整个模型做支撑对齐，普通跑步仍保留原片段离地步幅，不改写任何关节或关键帧。

另外，飞行碰撞球半径为 1.35 米，角色脚点约在根位置下 1 米。F 下落触地时同步切回地面碰撞球并下降根位置 0.35 米，使新旧碰撞体底部保持一致，避免碰撞体切换后仍高悬约 35 厘米再慢慢沉下。地面/屋顶的碰撞与支持仍由 Rapier 决定。

## 真实材质与细节

本轮用 Poly Haven 的外部真实材质替换上一轮三组程序纹理，新增四套：

| 素材 | 用途 | 作者/许可 |
|---|---|---|
| [Concrete Wall 006](https://polyhaven.com/a/concrete_wall_006) | 混凝土立面、入口、线脚 | Charlotte Baglioni 摄影、Dario Barresi 处理；CC0 |
| [Rectangular Facade Tiles](https://polyhaven.com/a/rectangular_facade_tiles) | 独立的外墙块材 | Charlotte Baglioni；CC0 |
| [Stone Tiles 02](https://polyhaven.com/a/stone_tiles_02) | 开放广场的石板 | Charlotte Baglioni；CC0 |
| [Asphalt 05](https://polyhaven.com/a/asphalt_05) | 平屋顶的颗粒沥青表面 | Amal Kumar；CC0 |

每套颜色图 2048²，OpenGL 法线/粗糙度/AO 各 1024²。按来源的两米扫描尺度重复，与现有米制几何 UV 对齐。原沥青、铺地、砖墙三套扫描材质也补齐 AO，共七套四通道本地 PBR。没有新增云端运行依赖；下载地址、作者、许可、字节数和 SHA-256 均写入来源与运行清单。

新增立面排水管与固定支架，合并到已有建筑细节批次。当前整合配置保留并行调优结果：阴影图 3072²、范围 ±90 米、normalBias 0.025，AO 分辨率比例 0.6；不恢复全屏泛光。

砸地烟尘曾在接触阴影缓冲形成不透明矩形。`ContactAO` 现排除 Sprite，保留正常透明颜色渲染。加入烟尘前后的法线缓冲逐值比较变化为 0，实际砸地画面已复查无黑色方块。

## 已执行验证

| 检查 | 结果 |
|---|---|
| 类型检查、`npm test`、生产构建 | 当前整合工作区通过；5 文件、15 项测试，包括原配资源与已有帧时钟回归 |
| `jump-landing-check.mjs final` | 8 项通过；F/Q × 街道/屋顶 × 60/120/144 Hz，以及原地/跑步/冲刺跳、松键动量、空中切飞行与 Q、低顶、墙体、禁止二段跳、暂停恢复 |
| 接地高度 | 恢复时脚底相对显示支撑点的额外抬升约 0；街道实际脚底距离碰撞面约 3.81 厘米（含角色控制器偏移） |
| `native-character-check.mjs` | 13 段全骨架和蒙皮对照通过，新增 Jump_2 纳入原配对照 |
| `running-continuity.mjs jump-pbr` | 11 组持续跑步、冲刺、转向、不同刷新率、高台坠落回归通过 |
| `character-motion-check.mjs jump-pbr` / `character-game-check.mjs` | 10 项动作与 3 项攻击/暂停/Q 实际命中检查通过；Q 断言同步为自然落地收势 |
| `quality-acceptance.mjs` / `attack-transitions.mjs` | 8 项碰撞/飞行与 5 项攻击流程通过 |
| `scene-motion-check.mjs scanned-pbr-final` | 7 项、20 组攻击/材质/烟尘阴影检查通过 |
| `visual-regression.mjs` / `final-smoke.mjs` | 8 项能力/追捕/四次重置和 7 项实际操作/生产启动通过 |
| 资源清单 | 本轮 81 文件清单逐文件 SHA/尺寸复核通过；并行导入的新模型不纳入此范围 |

本轮性能为 M2 Pro / Chrome 155 / ANGLE Metal、1440×900，普通与三级追捕压力场景各 20 秒：中位均 16.7 ms，P95 均 16.8 ms，约 60 FPS；普通场景有一帧 83.3 ms，压力场景最大 16.8 ms，无运行时异常。普通/压力 CPU 更新中位 1.6/2.7 ms，渲染提交中位 2.1/3.4 ms。这是短时回归，不代替十分钟持续运行或 Safari 验收。

当前工作区还在并行导入 `city-details/` 和 `foliage/` 资源，全目录 `asset-manifest.py` 在这些新增文件尚未合并来源登记时会失败。本轮没有删除、跳过登记或覆盖并行素材；原 81 文件清单已单独复核（`jump-pbr-asset-check.json`），最新生产构建启动无异常（`jump-pbr-production.json`）。并行素材的最终登记与验收需随其导入工作收口。

主要报告：`.artifacts/jump-landing-before.json`、`jump-landing-final.json`、`scene-motion-scanned-pbr-final.json`、`jump-pbr-normal.json`、`jump-pbr-stress.json`。原配资源、玩法与回归报告沿用各脚本名称。

## 画面与录屏

实际键鼠录屏 `.artifacts/jump-landing-preview.mp4`：H.264、1280×800、24.12 秒、7,902,782 字节；连续展示原地跳、跑跳、冲刺跳、F 自由落地和 Q 快速落地。无模拟速度修改。已检查接地截图及导出视频抽帧，原始 WebM 和每帧位置/状态保存在同目录的 recording 报告。

材质与城市画面：`.artifacts/city-scanned-pbr-final.png`、`facade-scanned-pbr-final.png`。主角与 NPC 仍为原配简化 mannequin；本轮没有替换成人体精细模型，后续美术迭代继续按模型、材质、城市细节和阴影的实际游戏效果验收。
