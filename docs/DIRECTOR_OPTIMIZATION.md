# 城市素材与游戏质量改进

日期：2026-10-16。使用已安装的 `threejs-game-director`，结合 graphics、debug/profiler、QA 技能；读取 gameplay/UI 与相应材质、视觉评分和验收参考。用户后续明确优先关注还原度、素材和游戏质量，因此停止追加性能测试，恢复原有 4096² 阴影与 0.7 AO 精度。本轮交付围绕近景资产、店铺交互和真实操作。

## 游戏内改动

- 接入四套 Poly Haven CC0 真实三维资源：户外桌椅、盆栽、抽屉柜、卷帘门。保留原比例、纹理与几何，按自然米制尺寸放入现有街区；两个既有店铺增加 14 件可破坏模型陈设，四处立面安装卷帘门。卷帘门、树和布篷是静态装饰。
- 店面改用透明玻璃，增加横梁、竖框和条纹布篷，可以从街上看见内部。玻璃破坏时连同附属窗框隐藏，并移除同一碰撞体，保留原有可穿越入口。碎片采用会旋转、碰撞和清理的薄三角玻璃片，替代店面破坏时的不透明方块。
- 两个店铺补齐石面柜台、肋板、店内招牌与暖色局部照明。柜台可破坏，前方过道留空，实际角色能经过已有台阶进入。
- 使用 GPT 内置图像工具生成有真实 alpha 的阔叶枝簇，替换原先简化叶片；保留现有立体树干/枝条及交错叶片结构。树干与枝条使用 Poly Haven 扫描树皮的颜色、法线、粗糙度、AO。没有生成或替换角色。
- 城市窗户改为双面平面，保留窗框、室内深度着色与原有碰撞；底层窗更宽，保留入口，并加入不同百叶高度和室内色温。该几何改进保留，未继续降低画质参数。
- 新模型逐实例克隆材质，避免击打一件家具使其他实例变暗；共享源几何和纹理保留在缓存中，销毁/重置不误释放它们。
- 修复排队 RAF 时间戳早于恢复时钟的边界，避免负 delta 进入原配动画混合。布娃娃物理包围余量由 0.035 米增至 0.045 米，修复实测士兵蒙皮轻微穿地；没有修改骨骼姿态或动画轨道。

沿用当前主角原网格、66 骨骼、绑定、蒙皮、材质和 13 段现有动作；两段 Jog/Sprint 继续使用此前认可的官方离线适配。NPC、飞行、超级速度、跳跃、镭射、重拳、砸地、无敌、三级追捕、车辆物理与局部破坏保留。没有增加声音、账号、付费服务、引擎迁移或部署。

## 来源与重建

| 新素材 | 作者 / 来源 | 接入方式 |
|---|---|---|
| 桌椅 | James Ray Cock / [Outdoor Table Chair Set 01](https://polyhaven.com/a/outdoor_table_chair_set_01) | 2k glTF，室内/室外六套 |
| 盆栽 | Rico Cilliers / [Potted Plant 02](https://polyhaven.com/a/potted_plant_02) | 2k glTF，四盆；碰撞仅包围低矮花盆 |
| 抽屉柜 | Ulan Cabanilla / [Drawer Cabinet](https://polyhaven.com/a/drawer_cabinet) | 2k glTF，四柜 |
| 卷帘门 | MP / [Rollershutter Door](https://polyhaven.com/a/rollershutter_door) | 2k glTF 中两款独立门，选择性克隆 |
| 树皮 | Rob Tuytel / [Bark Brown 02](https://polyhaven.com/a/bark_brown_02) | 1k PBR 四通道 |
| 阔叶枝簇 | 本项目 / GPT 内置 `image_gen` | 1254² RGBA，清晰 alpha；不是第三方扫描资源 |

Poly Haven 的模型和纹理均按[官方 CC0 许可](https://polyhaven.com/license)使用。四套模型及依赖约 18.81 MB，树皮约 2.53 MB；全部本地加载。脚本先验证官方 API 记录的 MD5，再固定本地 SHA-256，保存完整依赖；作者、地址与许可保留在 `public/assets/licenses/polyhaven.txt`、`city-details/sources.json` 和媒体清单。生成树叶的完整提示词、原始分辨率、用途和 SHA 在 `public/assets/foliage/provenance.json`，没有伪标为 CC0。

```sh
python3 scripts/fetch-city-details.py
python3 scripts/asset-manifest.py
npm test
npm run build
```

图像生成并不限定 Gemini。所安装 skill 的便捷脚本采用 Gemini API，而当前宿主直接提供 GPT 图像生成工具；本轮树叶通过后者生成，无需 Gemini key。

## 真实操作验收

主要环境：macOS Chrome，生产预览 `http://127.0.0.1:4173`。普通生产页面不暴露调试控制；只有 DEV 或显式 `?qa=1` 提供游戏快照、真实场景准备和截图冻结接口。

- 生产键鼠验收：19 项通过。W 行走，F/Space 起飞，Ctrl 下降，Q 砸地/恢复，Esc 暂停并清输入；右键近身击杀、八次左键镭射击杀，通过实际伤害跨越三级追捕并补至 12 个敌人；三次真实菜单重置恢复实体与资源基线。
- 店铺专项：9 项通过。真实 W 被完整玻璃挡住；左键打碎玻璃并清除框架/碰撞；继续 W 从室外走至店内约 z=-36.23、y=1.50，跨越原有地台。右键破坏导入桌椅，另一实例颜色与生命保持；暂停冻结，菜单重置恢复全部 14 件模型陈设。新增碎片检查验证薄透明玻璃与物理代理。
- 单元测试 17 项通过，包含时间戳边界、素材实例材质隔离、原比例缩放与卷帘门变体；113 个本地媒体文件及所有模型依赖/哈希通过。类型检查、生产构建通过。
- 当前素材接入后，质量能力/碰撞验收、视觉玩法回归、生产冒烟、生产输入和运动录制均通过，详见 `.artifacts/director-round/verification/quality-results.json`。原配全身/循环/跑步/攻击衔接检查在同轮前段完成通过，后续素材工作未改其网格或动作；不将源片段预览当作游戏实操。
- 布娃娃首次检查发现约 27.30 mm 穿地，超过既有 25 mm 阈值。调整实际碰撞体余量后，三类角色各 15 个部位、暂停/恢复和关节/清理检查通过；最深约 23.42 mm，阈值未放宽。报告为 `.artifacts/quality-ragdoll.json` 与 `director-round/ragdoll-fixed.log`。
- 独立只读审查未发现新增素材共享资源、实例损伤、碰撞注册或重置路径的具体缺陷；浏览器实测由主代理完成。

测试使用固定靶标/起点准备，移动、攻击、暂停、菜单均由真实 Playwright 键盘/鼠标事件触发；属于自动化实操，未宣称人工手玩。运动视频涵盖站立、跑步、冲刺、悬停与高速飞行中的原配重拳，以及镭射、砸地和暂停。店铺视频另覆盖玻璃破坏与实际进出。

最终六态画面已逐张查看，运动视频已导出并抽帧复核，当前 manifest 覆盖检查通过。

最终画面与报告：`.artifacts/director-round/quality-final-inspection/` 的 street、storefront、interior、flight、stress、pause 六态；`.artifacts/director-round/playtest/report.json`、`shop-playtest/report.json`；视频 `.artifacts/director-preview.mp4` 与 `.artifacts/director-shop-preview.mp4`。截图准备后冻结模拟继续渲染，不能单靠这些截图证明运动或玩法。

## 视觉核验与边界

按技能 0–3 标准对实际游戏画面评分；原始起点已留图，角色保持用户认可的简化 mannequin。分数是对画面的人工判断，像素非空白检查不替代美术评价。

| 类别及本游戏对应 | 起点 → 当前 | 依据 / 仍有差距 |
|---|---:|---|
| 美术方向 | 1.8 → 2.0 | 近景石材、深绿店面、布篷与家具统一，远景楼群仍重复 |
| 主角 | 1.5 → 1.5 | 保留原模型/动作，没有面部与服装定制 |
| 敌人 | 2.0 → 2.0 | 保留平民、警察、士兵材质区分与射击反馈 |
| 交互物 | 2.0 → 2.2 | 实际桌椅/柜子、透明玻璃、破坏框架和薄碎片 |
| 世界 | 1.8 → 2.2 | 前景树与室外陈设、可进入店铺及室内柜台；街区远景还较规则 |
| 材质 | 2.0 → 2.3 | 四套真实模型、树皮 PBR 与细叶 alpha，原有七套城市 PBR 保留 |
| 光照 | 2.0 → 2.1 | 原高精度阴影/AO，店内灯具与对应照明消除漆黑顶面 |
| 特效/运动 | 2.0 → 2.1 | 原配运动完整保留，修复负 delta，店面碎片材质/形状明确 |
| UI | 2.3 → 2.3 | 沿用已有 HUD，六态布局与暂停检查 |
| 渲染证据 | 2.0 → 2.0 | 当前六态像素/静态 renderer 诊断；按用户要求未追加帧率/显存/长测 |

平均 1.94 → 2.07。未达到该 skill 的 Premium 每项 ≥2、平均 ≥2.3，不能称为 AAA 或完成整个城市的写实重制。进一步差距集中在重复的远景建筑、车辆与主角的细节，而不是再降低渲染精度。本轮近景质量和交互完成有界改进。

六态截图均非空白、无 page/console error，状态确认、视口与 run ID 匹配；每张 JSON 保留颜色熵、边缘、亮度及静态 renderer 诊断。通用 inspector 的 300 calls / 750k triangles / 60 textures 起始预算仍有超项：本项目保留整座街区、原角色、动态阴影/AO，并新增近景真实资源。未把这些标记为预算通过，也没有用旧测量代表最终版性能。

此前窗户/低成本配置的 GPU 对比与 630 秒长测属于用户调整优先级前的历史记录，保存在 `before-corrected/`、`after-corrected/` 和 `.artifacts/director-performance.json`。之后增加了素材并恢复阴影/AO，旧数值不作为当前版本性能结论。当前也没有 Safari、跨设备或新素材完整长测的验收声明。

## 本轮复验入口

```sh
npm run dev
npm run preview
node scripts/director-shop-playtest.mjs
node scripts/director-playtest.mjs
GAME_URL='http://127.0.0.1:4173/?qa=1' node scripts/record-scene-upgrade.mjs director
node scripts/director-capture.mjs
python3 ~/.codex/skills/threejs-game-director/scripts/check_evidence.py . --manifest .artifacts/director-round/evidence.json
```

浏览器检查顺序执行。`scripts/director-verify.mjs` 默认只执行功能/运动/画面回归，性能长测须显式 `RUN_PERFORMANCE=1`；本轮后续未设置该开关。最终 manifest 为 `director-quality-20261016-final-v2`，旧报告保留但不混入当前覆盖检查。
