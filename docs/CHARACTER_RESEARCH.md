# 主角模型、动作与披风方案调研

日期：2026-10-12。范围：角色实现、免费素材候选、原版 UNDEFEATED 的公开制作资料。本文保留选型调研；用户确认采用的 Mesh2Motion 已完成实际接入，最新状态见下节。

## 最新：直接使用原配人形

用户再次否决保留 MakeHuman 外观的手臂折叠，并明确放弃祖国人外观。当前直接采用 Mesh2Motion 原配 mannequin：主角使用 addon 包的完整模型/绑定/动作，NPC 使用 base 包的完整组合，均 66 骨骼，无手写动作或重定向。两包绑定矩阵不同，不能凭同名骨骼混装。祖国人服装附件和披风已移除。

逐字节比较、完整骨架与实际蒙皮对照、最终画面见 CHARACTER_VALIDATION.md；当前素材与重建入口见 ASSETS.md。旧报告与视频保留为历史失败材料。

## 用户确认后的实际接入（被后续反馈否决）

用户观看原配动作预览后确认“这个可以，就用这个”。主角及 NPC 已接入 12 段 Mesh2Motion CC0 现成动画，保留 MakeHuman 外观和蒙皮，采用固定提交 `653a9698f5f315523072f1c3ff3496100401317b` 的官方 MIT Human Rig / Retargeter 重定向核心。没有编写角色关键帧、骨骼角度公式或肢体修姿态补丁。

动作映射、重建流程与许可见 [ASSETS.md](./ASSETS.md)，运行与画面证据见 [CHARACTER_VALIDATION.md](./CHARACTER_VALIDATION.md)。原配人偶试播视频仍是选型材料；最终视频 `.artifacts/player-motion-preview.mp4` 展示的是实际祖国人模型和游戏输入。

## 最新用户约束与实际核验

用户明确禁止自行写动作。下文早期建议中的“专门制作动作”已被这一约束覆盖：以后采用现成动画与成熟绑定工具，不能继续用角度公式、手工关键帧或修姿态补丁来补齐。

新增首选：[Mesh2Motion](https://mesh2motion.org/) 是免费开源的自动绑定和动画工具，代码 MIT，模型、骨架与动画 CC0；支持 GLB 导入/导出。官方资产许可见 [项目 README](https://github.com/Mesh2Motion/mesh2motion-app#licenses)。

已从官方 app 仓库下载 `static/animations/human-base-animations.glb`（87 段）、`human-addon-animations.glb`（75 段）及配套 rig/model，保存在 `.asset-source/mesh2motion/`。下载 URL、SHA-256、字节数和许可文件均在该目录 `provenance.json` 中。Human 配置来源：[RigConfig.ts](https://github.com/Mesh2Motion/mesh2motion-app/blob/main/src/lib/RigConfig.ts)。

在当前 Three.js 展示环境中实际播放原配模型/骨架的 Jog、Sprint、Punch_Jab、Levitate Entrance、Levitate Idle、Flying Forward Super、Land_Three_Point、Attack_Ground_Pound，共 8 段原始动画，无 pageerror。预览视频 `.artifacts/stock-motion-preview.mp4`，报告 `.artifacts/stock-motion-preview.json`，复现命令 `node scripts/stock-motion-preview.mjs`。这是素材试播；没有修改动作关键帧，没有重定向，也尚未接入祖国人模型或最终游戏。原配展示人偶的外观不作为最终主角美术。

上述原配试播是确认选型之前的阶段记录；之后的重定向和游戏接入已完成，不能用人偶试播替代最终主角验证。

## 结论

可以复用现成角色与动画，Three.js 足以实现更自然的第三人称角色。建议把升级对象定义为完整的角色制作流程：人体与战衣、统一骨架、成熟动作片段、连续动作混合、专门制作的飞行动作、带惯性的披风。只换 GLB 人体不会解决现有动作和披风的问题。

纯免费、CC0 的优先候选是 Quaternius Universal Base Characters 的 Superhero 男性基底与 Universal Animation Library 的免费 Standard 版。该角色偏风格化，不能据此认定比当前 MakeHuman 更写实；最终外观应在角色展示页比较后决定。若坚持当前写实方向，也可以精修现有 MakeHuman 人体，在 Blender 中制作完整战衣、附件和披风，并替换动作来源。

## 选型前的代码事实（历史基线）

- 披风是 `PlaneGeometry(0.9, 1.35, 12, 20)`，挂到 `spine_03`；不是模型自带的蒙皮服装。见 [PersonVisual.ts](../src/PersonVisual.ts) 第 141–175 行。
- 每帧按速度和正弦函数重写披风顶点，另外进行身体胶囊和地面排斥；没有记录布料粒子的上一帧位置或速度，因此没有真实惯性。见同文件第 347–397 行。单一胸骨挂载与解析波浪可能产生用户描述的“搭在身上”观感，这是基于结构的推断。
- 步行、慢跑和奔跑已有 CMU 动作来源；飞行、悬停、拳击、起飞和落地等仍由简单骨骼角度公式生成。见 [build-human.py](../scripts/build-human.py) 第 263–308 行。
- 运行时已有动作淡入淡出和移动步相继承，但按速度阈值选单一移动片段；高速飞行还使用模型整体前倾。见 PersonVisual.ts 第 250–332 行。自然动作仍需要改善胸腔、骨盆、肩部、重心、手脚细节以及启动、停止和转向。
- 新模型需要适配骨骼、动作名称、眼睛挂点与材质；当前代码依赖项目骨骼名和 GLB 自定义元数据。替换资源路径不是完整接入方案。见 [Assets.ts](../src/Assets.ts)、PersonVisual.ts 第 51–63、141–204、287–314 行。

## 免费候选与边界

| 候选 | 作者/官方确认的内容 | 对本项目的价值与限制 |
|---|---|---|
| [Quaternius Universal Base Characters](https://quaternius.itch.io/universal-base-characters) | 成人 Superhero 等基础体型、Humanoid 绑定；CC0；有免费 Standard 包，完整 Source 包收费。作者另列 FBX/glTF 格式及约 13k 三角面平均复杂度。 | 最适合做免费英雄基底候选，风格偏 stylized。需要制作战衣、发型细节和披风，不能宣称免费包已包含完整祖国人。当前免费包的具体文件仍需下载核验。格式来源：[作者主页](https://quaternius.com/packs/universalbasecharacters.html)。 |
| [Universal Animation Library](https://quaternius.itch.io/universal-animation-library) / [Library 2](https://quaternius.itch.io/universal-animation-library-2) | CC0，统一人形骨架，移动、战斗等动作；有原地/根运动版本，Standard 免费，其他版本收费。作者确认 Base Characters 与动作库兼容。 | 可用于替换移动与部分攻击片段。宣传的 120+/130+ 是产品整体描述，不能算作免费版全部内容；特殊超人飞行与砸地动作仍需制作。 |
| [Adobe Mixamo](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) | Adobe ID 用户免费，无需 Creative Cloud 订阅；角色与动画可免版税用于游戏等个人、商业项目；双足人形自动绑定。 | 可作为成熟动作来源，也可对自定义人体绑定。不是开源或 CC0，需要账号。官方提示大型衣物/附属物可能导致绑定失败，主体与披风应分别处理。账号地区可用性以官方 FAQ 为准。 |
| [Blender Studio Human Base Meshes](https://www.blender.org/download/demo-files/) | 官方提供免费 CC0 人体基础网格包。 | 写实定制的备选，仍需制作服装、绑定、动画和游戏导出，不是可直接替换的完整英雄。 |

未核实到“金发、蓝战衣、红披风、正常成人比例、完整超人动作、明确免费许可”全部同时满足的现成角色。模型是否适用不能只看宣传图，还要检查实际免费包的权重、材质、动画、比例与文件许可。

## 原版 UNDEFEATED 的已知实现

Epic 的 2018 年开发者采访确认：开发使用 UE4；主要复用 Marketplace 资产并调整材质与纹理，主角也是购买的角色资产；动画制作使用 Allright Rig；动画系统使用 Advanced Locomotion System，并为本作优化状态机。采访没有公开可复用的主角源文件或足以确认披风实现的资料。

来源：[Epic 官方采访](https://www.unrealengine.com/blog/ue4-undefeated?lang=ja)，关于引擎、动画制作、素材和状态机分别位于正文第 41、44、47–54、64 行。该资料描述开发期流程，不能当成最终发行版每个细节的完整技术说明。原版游戏身份见 [Steam App 1116960](https://store.steampowered.com/app/1116960/UNDEFEATED/)。

可以借鉴“成熟角色资产 + 专门制作的英雄动作 + 完整状态机”的工作流。Allright Rig 和 ALS 是其 UE 工作流的一部分，不能作为现成 Three.js 模块直接接入。不能把 UE 常见的布料、IK 或根运动技术推断成该游戏实际使用的方案。

## 选型前的制作建议（现成动作约束优先）

以下是早期工程建议，不是 UNDEFEATED 已证实的实现。涉及自行制作动作的内容已被用户的新约束覆盖，当前动作方案以顶部已接入的 Mesh2Motion 管线为准；模型与披风的建议仍属于独立美术改进。

1. **完整角色资产**：在 Blender 中统一人体、贴合战衣、靴子、肩饰、领口与披风；刚性附件可以仍是独立网格，但需要经过建模并正确附着，衣物使用合适的蒙皮权重。
2. **统一动作骨架**：使用免费 Standard 动作或 Mixamo 作为来源，统一骨架后导出 GLB；补齐启动、停止、转向与攻击收势。飞行需要专门制作起飞、悬停、前进、加速、转弯、下降和落地动作。
3. **连续混合**：根据速度、方向与转向混合动作，同步步相；让头部瞄准与躯干、腿部动作有适当分层。Three.js 支持动画权重、交叉淡入淡出和叠加混合，相关能力需在本项目组织成控制逻辑。来源：[AnimationAction 官方文档](https://threejs.org/docs/pages/AnimationAction.html)。
4. **披风**：在双肩/领口制作真实连接与褶皱；以少量披风骨骼链驱动，保留上一帧状态，用弹簧/阻尼响应加速度与转向，加入身体和地面约束。若骨骼方案不足，再评估低分辨率位置约束布料；不把升级默认扩展为完整布料仿真。
5. **浏览器导出与适配**：统一米制、Y 向上，导出身体蒙皮和烘焙动作；显式映射骨骼、动作与双眼挂点。先检查展示页，再接玩家与能力系统。

## 建议的下一步与验证标准

先制作一个连续 30–60 秒的主角对比展示，覆盖近景外观、步行/奔跑/转弯、起飞/悬停/加速/降落、出拳和披风惯性，再确定最终人体基底。静止时观察领口与双肩连接，移动时观察肩胯反向转动、脚底滑动和披风滞后。通过画面审看后再完成游戏内替换，并回归双眼镭射、重拳命中时机、碰撞、暂停和重置。

现有 Three.js/Rapier 路线可以支持这套角色升级；不需要为了修复肢体僵硬迁移引擎。是否接近参考游戏的最终观感，只能由实际连续画面与目标设备性能验证，不能由素材名称或本次调研代替。
