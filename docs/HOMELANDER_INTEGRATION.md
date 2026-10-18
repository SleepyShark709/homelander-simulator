# 祖国人模型与动作接入

日期：2026-10-17。范围：将用户的 Tripo / Auto-Rig Pro 角色和 `actions/` 十份 FBX 接入现有 Web 游戏，保留城市、NPC、飞行、战斗、追捕和暂停/重置。

## 当前资源与操作

主角运行资源为 `public/assets/human/homelander.glb`，29,211,784 字节，68 个导出骨骼、18 段动作、三张内嵌 PBR 纹理。NPC 继续使用原有 Mesh2Motion base 组合。两者分别克隆骨架，不共享动作轨道。

| 用户动作 | GLB 片段 | 游戏操作 |
|---|---|---|
| 01 待机 Breathing Idle | idle | 静止；默认垂手镭射 |
| 02 普通跑 Running With Intention | jog | WASD |
| 03 快速跑 Sprint | sprint | WASD + Shift |
| 04 飞行 Flying | fly | 向前加速飞行 |
| 05 随手攻击 Right Hook | casual_attack | E，右勾拳 |
| 06 重击 Uppercut | punch | 右键，上勾重击 |
| 07 四连拳 Punch Combo | combo_a | R，四次命中窗口 |
| 08 直拳接肘击 Jab To Elbow Punch | combo_b | T，两次命中窗口 |
| 09 单手叉腰 Male Standing Pose | laser_hip | V 切换姿势后按住左键 |
| 10 双手背后 Male Standing Pose | laser_back | V 切换姿势后按住左键 |

八段现成动作经同一 ARP 管线适配：Walk_Female → walk、Levitate Entrance → takeoff、Levitate Idle → hover、Land_Three_Point → land、Attack_Ground_Pound → slam、base Jump_air → fall、base Jump_Start → jump_start、base Jump_Land → jump_land。原 slam 片段保留在资源中，Q 当前共用 land。地面空格跳跃；F 起飞/退出飞行，飞行时空格/Ctrl 升降，Q 砸地。真实悬停保留原 Levitate Idle；两份静态镭射姿势仅在静止、无收势时使用，移动镭射继续播放移动动作。

攻击完成收势后回到移动/待机；连招的各次命中由动作时间标记驱动。暂停冻结剩余命中，恢复不重复结算。V 在垂手、叉腰、背手三种姿势间循环。展示页 `/?preview=character` 提供当前动作预览、四种角色及旋转缩放，落地和砸地共用同一片段。

命中标记经手/肘轨迹与逐帧画面复核：上勾重击 35%、右勾拳 40%、四连拳 28/39/50/62%、直拳与肘击 30/65%。原四连拳 18/37/61/82% 有准备/收势阶段误结算，已修正；证据为 `.artifacts/homelander/hit-review.json` 与 `video/hit-contact.png`。同名攻击在上一招结束的同一固定步再触发时，也明确重启动作，避免只有伤害重放、动画停在末帧。

## 绑定与离线适配

Blender 5.2.2 LTS、Auto-Rig Pro 3.78.32。原始 Downloads 文件未覆盖；可编辑交付副本为 `/Users/shark/Downloads/homelander_game_ready.blend`。固定重建输入为 `.asset-source/homelander/rig.blend`。

在原 ARP 身体绑定上使用官方手指构建、Match to Rig 和局部绑定功能补齐双手五指。38 个手部/掌部导出骨骼均纳入骨架，30 个指节均有真实顶点权重。只重新绑定手部 1,611 个顶点，恢复非手部原权重，避免影响身体和披风。导出使用四权重归一的线性蒙皮。

动作来自用户 FBX 和既有 Mesh2Motion 片段，使用官方 Remap / Mixamo FK preset 与 Universal GLTF 离线适配。没有手写人体角度、人体关键帧或运行时关节修姿态。插件原文件未修改、未随仓库分发；脚本仅在进程内兼容 Blender 5.2 新的动作导出 hook 接口。

本次定位并修复：

- Sprint 原文件虽然在清单中标为 in-place，实测含约 3.24 米位移。走跑统一启用官方 In Place，游戏位移继续由角色控制器处理。
- 未键控胸椎曾继承上一段动作，导致部分导出姿态偏差最高约 0.337 米。启用官方 `arp_ge_reset_transforms` 后逐段恢复基准变换；没有通过改骨骼角度掩盖问题。
- 保留 ARP 驱动器，只解除当前 Action。清空整个 animation data 会删除约束所需驱动器，已排除此路径。
- 倒飞贴墙并退出飞行时，旧 1.35 米飞行球形碰撞范围允许披风进入墙约 0.180 米。扩大到 1.6 米后，同场景复测最大穿入为 0；检查门槛未放宽。

披风为原网格的独立连通部分，源文件仍为上背单骨绑定。浏览器当前增加轻量实时布料，见末节；Blender 源工程没有烘焙这套运行时物理。保留原 PBR 材质，不再用 NPC 调色覆盖主角。

## 重建与来源

正常运行和资产测试不需要 Blender 或商业插件。离线重建需自行安装上述 Blender / ARP：

```sh
"/Applications/Blender.app/Contents/MacOS/Blender" --background --python-exit-code 1 --python scripts/adapt-homelander.py
node scripts/pack-homelander.mjs
python3 scripts/asset-manifest.py
```

`adapt-homelander.py` 输出动作工程、原始 GLB 和 Blender evaluated-mesh 参考到 `.artifacts/homelander/`；`pack-homelander.mjs` 添加运行时动作别名、眼睛挂点和来源数据，不更改网格、骨骼或动作采样。

`.asset-source/homelander/provenance.json` 固定输入、适配器、Blender 参考与最终 GLB 的 SHA-256。`adaptation.json` 记录各动作映射。十份用户 FBX 原件及其清单保留在 `actions/`。Tripo / Mixamo 用户资产不标记为 CC0，旧六份 Mesh2Motion 动作的 CC0 来源另行保留；见 `public/assets/licenses/homelander-source.txt` 和 [素材账本](ASSETS.md)。

摘要在 Blender 导出阶段生成，打包时验证输入、适配器、原始 GLB 和参考全部一致；旧缓存不能通过重新打包获得当前摘要。负向资产测试确认适配器不一致时会拒绝打包。补强此检查后重新完整导出，网格/蒙皮/动作二进制与上次已验收文件逐字节一致（BIN SHA-256 `68a6284a28d1222f40ea6f50996aa738c3f7f4583380b694cbcb2eeaf0265132`），仅来源元数据增加。

## 初次接入验证证据（历史基线）

下表为初次接入时的记录；同名工具输出可能已被后续重跑覆盖。当前动作版本以本文末节为准。

测试在 macOS Chrome、Metal GPU 上串行执行。源片段预览、实际键鼠操作与脚本驱动场景分开记录。

| 检查 | 结果与证据 |
|---|---|
| 类型、单元/资产、生产构建 | typecheck、22 项测试、build 通过，包含并行江湾更新的四项资产测试 |
| Blender → Three.js 实际蒙皮 | 16 段、986 源帧，每帧 249 个全身/手指/脚/披风采样；最大误差 0.000009712 米；`.artifacts/homelander/check.json` |
| 全骨架过渡 | 68 骨骼，120 Hz，最大相邻关节位移 0.094986 米，低于 0.12 米门槛；同上 |
| NPC 原配资源 | 七段完整原配骨架/蒙皮对照通过；`.artifacts/native-character-check.json` |
| 循环连续性 | 八组各三个循环，全骨架及实际蒙皮；Sprint 最大关节步长 0.090671 米；`.artifacts/character-motion-homelander.json` |
| 走跑与落地 | 11 组、10,092 帧，含 60/120/144 Hz、不等间隔、转向、松开再跑、Shift 切换和平台坠落；普通跑稳态 21.597–21.600 km/h，归零与错误待机帧均为 0；`.artifacts/running-homelander.json` |
| 战斗、暂停、姿势和悬停 | 13 项通过，含四种攻击的紧接重放回归；`.artifacts/character-game-check.json` |
| 贴墙、地表、飞行和眼睛 | 八项通过；144 Hz 眼睛光束起点跟随；`.artifacts/quality-acceptance.json` |
| 生产与基础能力 | 七项通过，无运行时异常；`.artifacts/final-smoke.json` |
| 本地媒体及依赖摘要 | 67 项通过，含并行城市资源；`public/assets/manifest.json` |
| 干净导出 | 232 文件固定副本，独立 `npm ci`、typecheck、22 项测试、build 通过；`.artifacts/homelander/clean-export.json` |

## 实际键鼠录屏

`.artifacts/homelander/gameplay.mp4`，94.52 秒，前半段为 16 段动作展示，后半段为默认城市与 NPC 中的真实 Playwright 键盘/鼠标事件：WASD、Shift、E/R/T/右键、左键与 V、F/空格/Ctrl、下落/落地、Q 砸地、连招中 Esc 暂停及继续。

游戏实操部分采样 2,908 帧、48.60 秒，实际观察到全部 16 个运行片段；17 项录制检查通过，无页面异常。录制脚本没有改角色坐标、移除 NPC 或直接写入能力状态。逐帧命中复核、预览截图和视频抽帧已人工查看；不能把预览页当成游戏实操。

录屏/持续性能使用干净副本端口 5175，隔离另一个会话正在更新的城市代码；其文件摘要保存在 `clean-export.json`。该副本通过 Node 22.23.2 / npm 10.9.8 的独立安装、22 项测试及构建。临时目录默认 Node 18 不满足现有依赖要求，已用项目 Node 22 重试通过；没有改依赖来绕过版本要求。

```sh
node scripts/record-homelander.mjs
ffmpeg -i .artifacts/homelander/gameplay.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart .artifacts/homelander/gameplay.mp4
```

## 持续性能与三次重置

`.artifacts/homelander-performance.json`：Apple M2 Pro、32 GiB 内存、Chrome 155 headless、ANGLE Metal，1440 × 900、DPR 1。关闭本次其他测试浏览器和录制后串行执行，Blender 窗口最小化。未限制用户其他会话的机器负载，此结果不代表独占机器或其他设备的性能。

共 630 秒：预热 30 秒、常规飞行 120 秒、含追捕/射击/能力/破坏和物理特效的压力场景 120 秒、继续运行 360 秒；后段在第 60/180/300 秒各重置一次。该性能场景由脚本驱动，真实键鼠录屏独立记录。

| 阶段 | 帧数 | rAF 间隔中位数 / P95 / 最大 | CPU 更新中位数 / P95 | 渲染提交中位数 / P95 |
|---|---:|---|---|---|
| 常规 120 秒 | 7,210 | 16.7 / 16.8 / 16.8 ms | 1.8 / 2.3 ms | 2.1 / 3.4 ms |
| 压力 120 秒 | 7,210 | 16.7 / 16.7 / 16.8 ms | 2.9 / 3.8 ms | 2.9 / 4.6 ms |
| 最后一次重置后的约 59 秒 | 3,521 | 16.7 / 16.7 / 16.8 ms | 1.9 / 2.3 ms | 2.3 / 3.0 ms |

帧间隔接近 60 Hz；渲染提交计时不包含 GPU 完成时间。最后一行只统计第三次重置后的窗口，六分钟过程与前两次重置另见报告中的 samples / resets。

三次重置后均为：29 个刚体、239 个碰撞体、20 名平民、0 敌人、0 特效、热度/击杀/破坏为 0；即时渲染均为 411 个几何资源、70 张纹理。性能脚本以本次启动场景为重置基准，替代已过时的 87 碰撞体硬编码。采样 JS 堆随回收波动，结束约 179 MiB；没有由三次重置产生的资源数量累增，也没有页面异常。不能由有限采样证明任意时长均无内存泄漏。

Safari 尚未验证，极端姿势/全部场景的自交不在已验证结论中。并行城市会话后续修改需由其重新验收，不包含在本次固定副本性能结论内。

收口时再次在当前工作区执行 typecheck、22 项测试、build 和七项生产冒烟，全部通过，无运行时异常；角色相关八份代码/GLB 摘要仍与固定副本一致。Blender 工程已在桌面应用中打开确认，下载目录另提供 `homelander_game_ready.glb`，与运行资源逐字节一致。

## 2026-10-17 下落与起落衔接修正（当前）

用户反馈举臂下落、接地后角色突然升高、低处也触发落地、起飞等待过长，以及 Q 应共用落地动作。旧行为由真实模型/物理回归复现：落地片段起始脚底在原点上方约 4.57 米，接地后从头播放导致测试中脚底升高约 3.66 米；原飞行/地面碰撞球的脚底高度另相差 0.6 米。

本次修改：

- `fall` 从 addon `Glide` 改为 base `Jump_air`，经完整 ARP Remap/Universal 导出。双臂向两侧展开、膝盖屈曲；以一次播放并保持末姿处理长时间下落，不重复跳回首帧。新增 base 输入摘要，重新生成全部 16 动作、Blender 蒙皮参考、provenance 和素材清单。
- 物理控制器统一决定落地；记录此次自然下落的最高高度，以实际接触点计算落差。`CONFIG.playerHardLandingHeight = 6` 米，低处直接回移动；屋顶按屋顶高度计算。F 退出飞行时重新记录下落起点，受控飞行和此前主动升降的高度不计入；高空飞行后回到近地再 F 下落的回归已覆盖。自然落地不产生 Q 的伤害。
- `Land_Three_Point` 从 `CONFIG.playerLandingContactTime = 0.45` 秒的脚部接触标记播放收势，跳过原片段的空中下降。按 fall/land 实际混合权重修正整个模型的脚底位置；没有改动骨骼或动画关键帧。走跑仍保留原有腾空和脚底防穿地规则。
- 飞行球与地面球共用角色脚底平面，保留 1.6 米飞行半径；同时设置相对和绝对碰撞体位置，避免 Rapier 在切换当步用到旧偏移。低矮顶棚下继续使用能容纳的较小碰撞形状。
- `CONFIG.playerTakeoffDuration = 0.65` 秒，按此时长播放现有起飞片段并进入悬停，删除模式切换时直接上移 0.13 米的补丁。
- Q 保留快速下降、冲击、伤害和暂停规则，空中保持 land 接触姿势，实际物理接地结算一次后播放剩余收势。低空 Q 可以在首个物理步接地，不强制存在空中渲染帧。展示页的砸地也使用 land。

验证在 macOS Chrome/Metal 串行执行，所有测试浏览器均已关闭：

| 检查 | 当前结果与证据 |
|---|---|
| 类型、单元/资产、构建 | 9 个文件、38 项通过；含新增 12 项真实模型/物理起落检查；`.artifacts/flight/unit-tests.log` |
| 起落专项 | 12 项通过：0.2/1/5.8/6.2/15 米、15 米高屋顶的低高落差、低高 Q/暂停、起飞；`.artifacts/flight/transitions.json` |
| 连续性和脚底 | 起飞约 0.658 秒进入悬停；完整 68 骨骼及蒙皮采样的起落最大步长约 0.104 米/120 Hz，小于 0.12 米门槛；自然接地无向上位置跳变。脚底检查允许显示插值完成接触前一物理步的前两个 120 Hz 采样，随后贴近支撑面 |
| Blender → Three.js | 16 段、1,057 源帧、每帧 249 个蒙皮采样；最大误差约 0.000009712 米；`.artifacts/homelander/check.json` |
| 既有回归 | NPC 7 项、循环 8 项、战斗 13 项、走跑 11 项、移动/飞行/贴墙 8 项、开发/生产冒烟 7 项均通过 |
| 真实输入与视频 | 6 项通过：F/空格/Ctrl 高处下落、高飞后 Ctrl 回到近地再 F、Q、E/R/T。实际游戏视频 `.artifacts/flight/preview.mp4`、轨迹 `real-input.json`、下落截图 `fall.png`；仅录制镜头改为正侧方，未修改角色坐标或能力状态 |
| 干净副本 | 241 个必要文件重新安装锁定依赖，类型检查、38 项测试和生产构建通过；`.artifacts/flight/clean-export.json`、`clean-validation.log` |

本轮浏览器合计 89 项检查通过。额外独立只读审查未发现确定的产品回归；修正了低 Q 首步接地时的验收误判，以及 NPC 来源核验未更新父组世界矩阵的竞态。新增动作未改变 NPC 原资源。

此动作版本没有重跑 10.5 分钟性能长测；前文与城市会话的性能数据均属于各自固定快照，不冒充本轮动作版本的长测结果。

## 2026-10-17 披风实时物理

用户追加要求让披风随运动摆动。保留原披风 5,913 个渲染顶点、UV、PBR 材质和上背单骨权重；`pack-homelander.mjs` 按精确位置焊接与三角形连通性识别披风，只添加 `extras.cape`。原 BIN 的 SHA-256 仍为 `a93e633eab22582132a3e770d7ca38fb0193f237b4dbc36988ab4dde92e8398a`，网格、蒙皮、16 段动作和内嵌纹理逐字节不变，证据为 `.artifacts/cape/source-preservation.json`。

运行时 `CapePhysics` 用 11×21 的粗网格求解重力、惯性、风阻、拉伸/剪切和弯曲约束，以 120 Hz 固定步推进。顶部两行固定，原始肩部顶点保持不动；原细褶皱以残差映射回渲染顶点。方法基于 [PBD](https://matthias-research.github.io/pages/publications/posBasedDyn.pdf) 与 [XPBD](https://matthias-research.github.io/pages/publications/XPBD.pdf) 的位置约束原理，未复制外部实现或添加新的运行依赖。

身体用 13 个随原骨架移动的胶囊近似；场景用 Rapier 球形扫掠和表面投影，迭代期间复用本子步的接触平面，避免重复查询。人物动作与整模型对齐完成后才更新布料；在世界空间模拟，再通过完整蒙皮矩阵的逆变换写回该角色的私有几何。渲染相对领口插值，并联合修正长度和当前身体接触，防止高速时首行被固定点扯长。UV 接缝共用物理位置，披风法线随形变重算；身体顶点、身体法线、骨骼轨道和缓存资源不变。

暂停冻结模拟，传送重建历史状态，角色销毁释放私有几何；NPC 不创建披风。展示页提供与当前动作对应的相对气流，游戏使用真实世界运动。下载目录的 `homelander_game_ready.glb` 已同步元数据；这套物理运行在浏览器代码中，单独打开 GLB 或 Blender 工程不会自动带有布料模拟。

本轮专项在 macOS Chrome/Metal 串行执行：

| 检查 | 结果与证据 |
|---|---|
| 单元、资产、架构、类型与构建 | 10 个文件、54 项测试通过，含 15 项披风测试和 BIN/元数据保护；`.artifacts/cape/unit.log` |
| 实际物理与生命周期 | 14 项通过：站立、步行、冲刺、飞行、加速、倒飞、上升、下落、Q、转向、暂停/恢复与三次重置；`.artifacts/cape/check.json` |
| 变形与碰撞采样 | 10 组各 150 帧，固定顶点误差为 0；求解/显示网格最大局部长度比分别约 1.60/1.63；节点与身体胶囊最大重叠约 1.52 毫米，实际披风顶点场景采样最大穿入为 0 |
| 帧时间短测 | 常规、持续追捕各 10 秒，去除各前 60 帧；帧间隔 median 16.7 ms，P95 分别 16.7/16.8 ms；披风 CPU median 7.7/7.8 ms，P95 8.2/8.3 ms |
| 真实输入与画面 | 7 项通过；18.68 秒实际键盘视频 `.artifacts/cape/preview.mp4`，走跑/转向、起飞、加速、急停、倒飞、下落和暂停；`real-input.json`、`run.png`、`boost.png`、`reverse.png` 与逐段画面已检查 |
| 干净导出 | 245 个必要文件重新安装锁定依赖，类型检查、54 项测试和构建通过；`.artifacts/cape/clean-export.json`、`clean-validation.log` |

现有回归另有 83 项通过：主角源动作与蒙皮 17、NPC 7、循环 8、走跑 11、战斗 13、碰撞 8、起落 12、开发/生产冒烟 7。源动作对照时关闭披风并恢复原几何，单独验证原轨道；披风动态由上述专项和实际游戏检查覆盖。生产冒烟首次因 4173 预览服务未启动而失败，启动后复测通过，失败日志保留为 `final-smoke-preview-off.log`。本轮合计 104 项浏览器检查，无运行时错误；汇总与产品文件摘要为 `.artifacts/cape/verification.json`。独立核验确认私有几何、蒙皮空间变换和资源释放未发现确定缺陷。

该实现不包含布料自碰撞、布料撕裂或布料对人体/刚体的反作用。身体胶囊和粗网格是游戏用近似，不能由采样通过推断任意极端姿态完全无自交。本次只有上述短时性能采样，未重跑 10.5 分钟长测或 Safari 验收。

## 2026-10-18 地面空格跳跃

用户要求新增空格跳跃并增加动作。地面 Space 边沿触发 `jump`，以 0.18 秒准备衔接物理起跳，初速度 9 米/秒，当前固定步下高度约 1.6 米。起跳片段播放 0.65 秒，随后复用 `fall`，实际触地后播放 0.65 秒普通 `jump_land` 收势。参数集中在 `core/config.ts`。大落差仍按 6 米门槛使用原 `land`，Q 仍只在实际接触时结算一次。

新增 base CC0 `Jump_Start → jump_start`、`Jump_Land → jump_land`，经既有 ARP Remap / Universal GLTF 完整重建。源 root 无弹道位移，物理负责位置；按混合权重对齐整模型脚底，不写人体关键帧或关节角。导出保留完整片段，只在播放层调整时长。主角共 18 段动作、68 骨骼，运行 GLB 为 29,211,784 字节；adaptation、来源摘要、Blender 参考和媒体清单均已重建。

Space 每步消费一次，长按不重复，空中按键不排队到落地。WASD 保留水平控制；腾空后 F 可悬停、Q 可砸地。仍在地面准备期时 F 使用正常起飞，Q 不在地面产生砸地。攻击或落地收势期间不能起跳，跳跃期间不启动拳击；飞行时 Space 保持上升。低顶碰撞终止向上速度，跳跃保留较小的地面碰撞球。菜单、HUD 与角色展示页补齐新操作和两段预览。

本次在 macOS Chrome/Metal 串行验证，所有本次测试浏览器均已关闭：

| 检查 | 结果与证据 |
|---|---|
| 类型、单元/资产、构建 | 10 文件、64 项测试通过，含新增 10 项跳跃/准备期切换；类型检查和生产构建通过；`.artifacts/jump/unit.log`、`typecheck.log`、`build.log` |
| 源动作与蒙皮 | 18 段、1,157 源帧，每帧 249 个全身、手指、脚趾及披风采样；最大误差约 0.000009711 米；`.artifacts/homelander/check.json` |
| 保留既有资产 | 网格属性、三角形、绑定矩阵及既有 16 段动画采样逐字节一致；`.artifacts/jump/source-preservation.json` |
| 跳跃与起落专项 | 20 项通过，含站立/移动/屋顶/低顶跳跃、单次触发、暂停、准备期 F、空中 F/Q，以及已有高低落差和 Q；完整 68 骨骼与蒙皮的最大连续步长约 0.114149 米/120 Hz，低于 0.12 米门槛；`.artifacts/flight/transitions.json` |
| 既有行为回归 | NPC 7、循环 8、持续走跑 11、战斗/姿势/暂停 13、移动/碰撞 8、开发/生产冒烟 7 项均通过；`.artifacts/jump/regressions.json` 及对应日志 |
| 真实输入与画面 | 8 项通过，真实 Space/W/F/Q/Esc 与重置，默认城市及 NPC，未改玩家坐标或能力状态；`.artifacts/jump/real-input.json`、14.4 秒 `preview.mp4`，`jump.png` / `landing.png` / 视频抽帧已审看 |
| 资源清单 | 67 个本地媒体的依赖及摘要通过；`public/assets/manifest.json` |

浏览器合计 101 项，汇总和产品文件摘要为 `.artifacts/jump/verification.json`。独立只读核验发现准备期 F 会直接切地面悬停，现已修复并加入物理和全身衔接回归。

早期失败记录保留在 `.artifacts/jump/`：首次脚底检查将接触前的显示插值和恢复跑步后的原片段腾空计入落地收势，已按现有接触前两采样豁免和收势阶段修正，连续性门槛未放宽。Python Playwright 的两次真实输入录制未取得鼠标锁定；改用项目既有 Node Playwright 后录制和八项检查通过，生产启动也通过。本次未重跑完整 18 控件的长录制脚本、干净副本安装、10.5 分钟性能或 Safari；不沿用旧版本结论补全这些未测项。
