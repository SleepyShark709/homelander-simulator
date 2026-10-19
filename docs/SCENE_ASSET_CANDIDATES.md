# 城市场景网上资产候选

核验日期：2026-10-19。状态：用户已确认首批 **A01/A04/A05** 用于离线检查与样板试用；A02/A03/A06 保留备选。以下新模型均尚未下载、加工或接入。执行阶段见 [TODO.md](../TODO.md)，完整启动范围见[可复制提示词](SCENE_DENSITY_START_PROMPT.txt)。

用户已取消北京及任何特定城市的地域限制。筛选目标为可信比例、统一城市风格、连续街巷与可复用模块。现有江湾环境、用户车辆、角色和已接入陈设仍是复用基线，见 [江湾记录](JIANGWAN_ENVIRONMENT.md) 和 [素材账本](ASSETS.md)。

## 什么样的许可适合当前交付

- **CC0 优先。** Poly Haven 官方明确允许商用、修改和再分发，包括随自己的作品分享。因此可以保留来源记录后，将相应模型及加工版本纳入公开项目；官网文字、Logo 与预览页本身不自动属于资产许可。[Poly Haven 许可](https://polyhaven.com/license)
- **Unity / Fab 的免费资源需要逐项核对。** Unity 标准 EULA 允许将资产嵌入有实质原创内容的应用并分发，但限制单独资产的再分发，Restricted Assets 还有单独条款。Fab 标准许可明确支持兼容工具，包含 UE 以外工具，同时禁止单独再分发资产；其公开摘要不是完整合同。[Unity EULA §2.2](https://unity.com/legal/as-terms)、[Fab 许可说明](https://www.fab.com/eula)
- **用于成品游戏与公开原始资源是两项判断。** 浏览器游戏发布不自动等于独立资产再分发；将原始模型或单体转换资源作为公开仓库素材供他人复用，则需要相应授权。本项目优先选 CC0；标准商店许可候选在明确交付方式前不纳入公开资源目录。

“免费”是价格，“CC0 / CC-BY”等是资产许可。可转成 GLB 也不代表原有引擎 shader、碰撞或破坏功能会自动转移。以下格式和复杂度为官方页面信息，实际资源完整性与游戏内效果尚未检查。

## 六项清单与已确认首批

以下六项均有官方 CC0 声明。用户已同意首先采用 **A01、A04、A05** 进入离线检查与样板试用；A02/A03/A06 暂未采用。用户选择不等于包内许可/实际资源已核验，也不等于通过游戏验收；三项无需重复询问采用决定，按后续检查清单推进。

| 编号 | 官方资产 / 作者 | 格式与免费范围 | 拟用位置 | 加工与限制 |
|---|---|---|---|---|
| **A01** | [Downtown City MegaKit](https://quaternius.com/packs/downtowncitymegakit.html) / Quaternius | Standard 免费版；OBJ、FBX、glTF；CC0 | 主体沿街建筑、转角、商业首层与街道模块 | 美术偏纽约/波士顿的中层街区，可作为统一基础。免费版不包含全部付费 Source 内容；材质、屋顶/背面完整性、碰撞与破坏面板需离线检查和加工。 |
| **A02** | [Modular Urban Apartments Facade](https://polyhaven.com/a/modular_urban_apartments_facade) / James Ray Cock | 免费；Blend、glTF、FBX 等；CC0 | 公寓街墙、住宅首层与立面变化 | 页面标约 118K 三角面，为整套展示资产的统计。它是立面模块，需自行组装楼体、屋顶和碰撞，并与主风格统一。 |
| **A03** | [Modular Factory Facade](https://polyhaven.com/a/modular_factory_facade) / James Ray Cock | 免费；Blend、glTF、FBX 等；CC0 | 砖混工业侧街、仓储立面与后勤巷 | 页面标约 175K 三角面，包含砖墙、门窗与车库门；按街段需要选取，补齐楼体、屋顶、背面与交互结构。 |
| **A04** | [Exterior Aircon Unit](https://polyhaven.com/a/exterior_aircon_unit) / Monsta3D | 免费；Blend、glTF、FBX 等；CC0 | 建筑侧墙、店铺服务面及设备区 | 官方预览有干净/风化变体，页面约 19K 三角面；检查尺寸、支架、格栅与重复布置成本。 |
| **A05** | [Modular Street Seating](https://polyhaven.com/a/modular_street_seating) / Stuart Attenborrow | 免费；Blend、glTF、FBX 等；CC0 | 广场、树池旁及街边休憩节点 | 直线/弧形座椅模块，页面约 25K 三角面；需按实际模块拆分碰撞和破坏状态，统一新旧程度。 |
| **A06** | [Planter Box 03](https://polyhaven.com/a/planter_box_03) / James Ray Cock | 免费；Blend、glTF、FBX 等；CC0 | 商铺门前、露台、小型绿化节点 | 木质花箱，页面约 13K 三角面；需要配植被，适合有生活感的店前布景。 |

A02–A06 的网页下载尺寸随分辨率/格式选择变化，不等于最终浏览器资源体积；下载后按所需通道、纹理尺寸、模块与距离版本固定交付清单。

### A01 免费版范围的特别核对

官方总览介绍整包超过 300 个模型，并提及付费 Source 的引擎工程和 shader。主代理查看的 **Standard 免费版官方预览标注 153 件资产**，免费格式说明为 OBJ、FBX、glTF。网页通用说明还写有“60–70% 免费”，与整包总数/预览数量不能直接互换；最终以所选免费包的实际文件清单为准，当前不承诺全部 315 个模型免费，也不承诺免费提供 `.blend` 源工程。Source 页说明的 Unity/UE/Godot shader 不视为可直接移植到 Three.js 的功能。[官方产品页](https://quaternius.com/packs/downtowncitymegakit.html)、[免费版内容预览](https://quaternius.com/assets/images/fullres/downtowncitymegakit/standard.jpg)

## 官方预览

下列图片引用作者官方远程预览，没有下载进项目，也不是本游戏实机结果。

### A01：整体街区风格

![Quaternius 官方城市包预览](https://quaternius.com/assets/images/fullres/downtowncitymegakit.jpg)

### A01：Standard 免费版内容

![Quaternius 免费版内容](https://quaternius.com/assets/images/fullres/downtowncitymegakit/standard.jpg)

### A02：公寓立面模块

![Poly Haven 官方公寓模块预览](https://cdn.polyhaven.com/asset_img/primary/modular_urban_apartments_facade.png?height=760&quality=95&v=674719ca)

### A03：工厂立面模块

![Poly Haven 官方工厂模块预览](https://cdn.polyhaven.com/asset_img/primary/modular_factory_facade.png?height=760&quality=95&v=5fa35649)

### A04：空调外机

![Poly Haven 官方空调外机预览](https://cdn.polyhaven.com/asset_img/primary/exterior_aircon_unit.png?height=760&quality=95&v=b4ddc17e)

### A05：公共座椅模块

![Poly Haven 官方座椅预览](https://cdn.polyhaven.com/asset_img/primary/modular_street_seating.png?height=760&quality=95&v=3ce6edf8)

### A06：木质花箱

![Poly Haven 官方花箱预览](https://cdn.polyhaven.com/asset_img/primary/planter_box_03.png?height=760&quality=95&v=d56145b2)

## 商店与其他候选：暂不纳入首批

| 候选 / 证据 | 已核实情况 | 暂缓理由 |
|---|---|---|
| [Fab：City Props Pack — Free Sample Edition](https://www.fab.com/listings/59bc06c7-a293-4282-8b10-cde8fd0d4616) / Little Arts | 免费，页面含座椅、自行车架、站牌与托盘，列 FBX/OBJ，描述另提 Blend；允许个人/商业项目，明确限制原版/修改版独立再分发 | 不是开放许可资源；下载实际格式与公开仓库交付方式未确认。当前 CC0 陈设已有替代项。 |
| [Unity：Lowpoly Modern City Buildings Set](https://assetstore.unity.com/packages/3d/environments/urban/lowpoly-modern-city-buildings-set-64427) / karboosx | 页面为免费、Standard Unity Asset Store EULA | 具体可导出的网格/材质格式和公开资源分发授权未确认；不因免费就列为可公开分发的模型包。 |
| [Poly Haven：Tree Small 02](https://polyhaven.com/a/tree_small_02) | CC0、完整树、支持 glTF/Blend，页面显示约 5M 三角面，并有 LOD 标记 | 需检查具体 LOD、叶片与材质成本后再决定；未下载，不能按低面数行道树承诺。 |
| [Sketchfab：Oak tree](https://sketchfab.com/3d-models/oak-tree-3dc59560f2d24345bdbe65c44636453b) / massive-graphisme | 公开索引显示约 7.1K 三角面、CC Attribution、树皮纹理 | 模型页读取失败，实际许可版本、下载格式和贴图依赖未核实；只记录线索。 |
| [BMW M6 转换记录](https://raw.githubusercontent.com/ErfanMo77/gltf-research-scenes/main/scenes/bmw-m6/gltf/conversion.yaml) / glTF Research Scenes | 转换元数据称源资产 CC0，约 793K 三角面、26 材质，含 glTF core/extended 两版 | 尚未独立追溯完原作者许可链，复杂度高，且已有用户轿车。材质变体不是 LOD；不列为已确认可接入车辆。 |

车辆优先复用当前用户轿车/公交/电动车；新树模型继续筛选或检查现有模型的可复用范围。没有因地域限制取消而自动替换现有模型。[当前车辆与来源](JIANGWAN_ENVIRONMENT.md)

## 用户选择与后续检查

- [x] 2026-10-19 用户确认首批 A01/A04/A05，允许免费版获取、离线检查/加工与样板试用；A02/A03/A06 保留备选，采用或新增替代包再交用户选择。
- [ ] 对选定包保存许可、作者、来源、固定版本/日期与哈希；明确免费子集，不购买付费版。
- [ ] 离线检查真实网格、纹理依赖、尺寸/原点/朝向、模块拼接、材质及各距离版本；按 D3 准备可破坏拆件和简化碰撞。
- [ ] 在样板中验证近中远景、步行/飞行、攻击、暂停和重置，达到 D6 后再推广。

本次仅核对页面事实和官方预览。没有将任何新候选标记为已下载、许可文件已入库、可直接运行或已通过游戏性能/视觉验收。
