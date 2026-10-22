# 城市场景网上资产候选

核验日期：2026-10-21。状态：用户已确认首批 **A01/A04/A05**，现已下载、归档许可/哈希、离线加工并接入 66 米样板；实际免费子集与证据见[样板记录](SCENE_DENSITY_REVIEW.md)。A02/A03/A06 保留备选，未采用。执行阶段见 [TODO.md](../TODO.md)，完整启动范围见[可复制提示词](SCENE_DENSITY_START_PROMPT.txt)。

用户已取消北京及任何特定城市的地域限制。筛选目标为可信比例、统一城市风格、连续街巷与可复用模块。现有江湾环境、用户车辆、角色和已接入陈设仍是复用基线，见 [江湾记录](JIANGWAN_ENVIRONMENT.md) 和 [素材账本](ASSETS.md)。

## 什么样的许可适合当前交付

- **CC0 优先。** Poly Haven 官方明确允许商用、修改和再分发，包括随自己的作品分享。因此可以保留来源记录后，将相应模型及加工版本纳入公开项目；官网文字、Logo 与预览页本身不自动属于资产许可。[Poly Haven 许可](https://polyhaven.com/license)
- **Unity / Fab 的免费资源需要逐项核对。** Unity 标准 EULA 允许将资产嵌入有实质原创内容的应用并分发，但限制单独资产的再分发，Restricted Assets 还有单独条款。Fab 标准许可明确支持兼容工具，包含 UE 以外工具，同时禁止单独再分发资产；其公开摘要不是完整合同。[Unity EULA §2.2](https://unity.com/legal/as-terms)、[Fab 许可说明](https://www.fab.com/eula)
- **用于成品游戏与公开原始资源是两项判断。** 浏览器游戏发布不自动等于独立资产再分发；将原始模型或单体转换资源作为公开仓库素材供他人复用，则需要相应授权。本项目优先选 CC0；标准商店许可候选在明确交付方式前不纳入公开资源目录。

“免费”是价格，“CC0 / CC-BY”等是资产许可。可转成 GLB 也不代表原有引擎 shader、碰撞或破坏功能会自动转移。以下候选格式和复杂度保留官方页面信息；首批 A01/A04/A05 的实际包与游戏检查以样板记录为准，其他候选尚未离线核验。

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

## 2026-10-21 写实方向候选复核

用户否决现有 A01 样板的简陋感，要求 GTA 式写实。A01 的历史采用记录保留，当前不作为下一版写实主体；A04/A05 与既有资源按实际效果复用。建议 A02 主街公寓 + A03 后巷/服务建筑，二者来自同一作者 James Ray Cock、同一 Hidden Alley 集合，已实际查看官方预览。**用户随后明确否决这两套外观，认为仍像 demo；此提议不采用，未下载。**

| 候选 | 写实用途与边界 | 官方 API 统计 |
|---|---|---|
| A02 / Modular Urban Apartments Facade | 有厚度的窗框/窗洞、门、檐口、墙脚与转角，作为公寓街墙基础；并非完整建筑 | 118,215 三角面（整套）；glTF 主文件+引用依赖合计 1K 16.49 MB / 2K 41.43 MB；[元数据](https://api.polyhaven.com/info/modular_urban_apartments_facade)、[文件表](https://api.polyhaven.com/files/modular_urban_apartments_facade) |
| A03 / Modular Factory Facade | 砖墙、工业窗、门、装卸口、墙柱和转角，适合后巷/服务面；并非完整工厂 | 175,014 三角面（整套）；glTF 主文件+引用依赖合计 1K 17.63 MB / 2K 49.59 MB；[元数据](https://api.polyhaven.com/info/modular_factory_facade)、[文件表](https://api.polyhaven.com/files/modular_factory_facade) |

大小为官方 `size` 求和的十进制下载量，不是最终运行体积或显存。官方资产许可均为 [CC0](https://polyhaven.com/license)，可保留原始/加工资产随项目分发；官网预览图不自动属于模型 CC0。尚未检查实际网格拆分、背面、UV、材质数、透明排序、碰撞或游戏性能。

新方向需在本游戏镜头下证明几何和材质细节，不能凭高面数或官方渲染图宣称达到 GTA 质量。原 66 米双侧样板范围不变，先做局部街角验证，之后返工整段。

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
- [x] 对选定包保存许可、作者、来源、固定版本/日期与哈希；A01 实际 153 glTF，明确免费子集，未购买付费版。
- [x] 离线检查真实网格、纹理依赖、尺寸/原点/朝向、模块拼接和材质；D3 准备独立玻璃/侧巷面板及近景陈设碰撞。没有将未制作的距离版本标作完成。
- [x] 在样板中完成近中远景、步行/飞行、攻击、暂停和重置检查，保存八机位与原速连续录像；D6 等待用户认可后才进入 D7。

上方候选比较保留 2026-10-19 页面研究；2026-10-21 首批实际输入与样板已落地。下载/离线核验不等于用户已认可场景质量，也不代表新增素材通过性能长测；D6 和 D7 以样板记录为准。

## 当前写实选型状态

2026-10-21：用户进一步否决 A02/A03，要求 GTA 成品游戏式真实感。上述免费模块研究保留为历史，不能继续当作已认可方向。新的完整街景参考、现有画面五类缺口、商业格式/许可边界与未定事项见 [最新返工记录](SCENE_DENSITY_REVIEW.md#2026-10-21-再次审看候选-a02a03-亦不达标)。Leartes New York City Streets / KitBash3D Manhattan 仅为已核验的质量参考，尚未确定采用，不自动授权购买或下载。

## 2026-10-22：免费写实与付费候选复核

用户允许考虑付费，但明确采购前要看具体效果与价格、确认可接入当前 Web 游戏，实际购买前再由用户确认；允许评估不等于授权付款。GTA 式真实感要求不因免费或付费改变，A01/A02/A03 的否决状态保持。

| 候选 | 官方效果/当前价格 | 交付规格与未验证项 | 状态 |
|---|---|---|---|
| **Graffiti Stairs / Bala** | [作者多角度展示](https://blenderartists.org/t/free-graffiti-stairs-marseille-style-street-scene-blender-fbx/1655163)；[官方下载](https://superhivemarket.com/products/graffiti-stairs-free-street-scene)；**US$0** | 六栋旧楼、楼梯/栏杆、街道、售货亭；Blend 724 MB，烘焙 FBX 2K 252 MB / 4K 771 MB；底色/法线/粗糙度/金属度/AO 图片，作者说明无需 Decal Beast 插件即可打开。已完成 2K→glTF/KTX2 本机试用，7 项接入检查通过；窄梯步行未过、公开分发许可待核，实机见试用记录 | 用户已确认试用；US$0 领取 2K FBX，本机转换/实测见 [记录](GRAFFITI_STAIRS_TRIAL.md) |
| Urban Streets And Alleys / Free poly | [官方预览与取得入口](https://www.blendkit.com/asset-gallery-detail/d96dddfe-c04b-410b-9244-fb90ede9c271/)；免费 | 1.3 GiB Blender/Cycles 场景，需免费账号/插件获取；页面 CC0 标签与 [2026 平台条款](https://www.blendkit.com/terms-and-conditions-2026/) 的再分发约束存在待澄清事项；材质烘焙、完整度和 Web 未验 | 保留次选，不按 CC0 标签直接入库 |
| **City Streets – Modular Pack / PropHaus** | [官方商品与效果](https://www.fab.com/listings/8b29843a-a98d-4f86-9c3f-8ec9b511347a)；[官方卖家报价](https://www.fab.com/sellers/PropHaus?sort_by=-relevance)显示 **US$129.99 起、未税** | UE + USD；官方浏览器附加文件列三份 USD 共 12.41 GB；20 预建建筑、1,039 网格、最高 4K、示例地图。USD 是否含完整布局/外置标准 PBR/玻璃及可用 LOD 未核实，展示依赖 UE5 Lumen/Nanite；宣传车辆/人群不包含 | 规格候选，尚不列入可采购清单 |

Graffiti Stairs 作者明确允许个人/商业游戏，但商城是 Royalty Free；[平台条款](https://support.superhivemarket.com/article/49-standard-royalty-free-license)不自动授权公开再分发源模型或可复用资源。游戏使用和公开 Git 模型交付需分别核对；尚未确认本项目具体 Web 交付形式。免费不等于 CC0，付费也不等于可以公开源模型。

另核验了免费的 `street city (7) for games FREE`：虽有现成 GLB/93.2K 面，但只读视觉核验认为贴图和烘焙明暗仍偏旧款写实游戏，不作为当前 GTA 目标的首推。Deezl Manhattan Modular City 虽为 US$19.99 且提供 Blender/FBX，但空街/重复立面明显，同样不推荐。没有因为格式容易或价格低降低视觉门槛。

本轮没有找到已经证明同时满足完整 GTA 式街区品质、当前 Web 实测与公开源/GLB 再分发要求的现成免费整包；这不证明不存在，也不否定用免费资产与自行制作达到更高质量。

### 接入确认与采购门槛

当前 `Assets.ts` 直接通过 GLTFLoader 读取 GLB/glTF 与标准 PBR；默认未配置 Draco/Meshopt；本机 Graffiti 试用分支新增 KTX2 解码器，现样板使用 KHR_mesh_quantization。FBX/Blend/USD 需离线转换；UE 材质/蓝图、Lumen/Nanite 不能直接随网格进入 Web。既有场景脚本的 1K 缩图与 32 MB 样板限额不自动作为新写实资产的优化目标，需以画面和实际预算决定。

采购建议需要具体商品/授权档位/含税或未税价格、官方多视角/实机效果及许可结论。通过许可允许的代表性文件，在当前游戏验证几何/标准 PBR/透明/比例/碰撞、近地/低空/屋顶画面、加载/帧时间及暂停重置后，才可称该样本接入通过；规格与宣传视频只支持兼容性候选判断。有样本通过也不能未经检查把结论扩大到整包。没有文件实测时明确标“未验证”，不把购买本身当作验证前提。任何购买均等待用户对具体方案的明确确认。

官方效果图（远程引用，未下载）：

![Graffiti Stairs 作者展示](https://blenderartists.org/uploads/default/original/4X/8/d/d/8dd4d4b5f64e38feb521244e4dba8d67ee685fa7.jpeg)

![PropHaus 官方 UE 街景展示](https://media.fab.com/image_previews/gallery_images/06b25a60-596c-4a66-affc-ab27d1876618/f07399c8-7947-471f-a5f1-8f4248e6f16c.jpg)

## 2026-10-22：Graffiti 试用确认与相似免费资源

用户已认可 Graffiti Stairs 展示并授权先试；2K 包免费领取已完成，未创建账号或付款。当前加工和实际游戏证据见 [独立记录](GRAFFITI_STAIRS_TRIAL.md)，不以商品展示替代本机效果。

另找到同作者 [Abandoned Industrial Building Scene](https://superhivemarket.com/products/industrial-building-scene) 的 US$0 Free Sample Building（完整场景另售 US$9）。免费样本只有一栋楼，主要为 Blender 文件，尚未验证 FBX/烘焙 PBR 和当前 Web；保留相似风格参考，未获采用、未领取。当前没有新增已核实可直接替代整套街区的同级免费场景，不重复推荐已被否决的低细节包。


## 2026-10-22：全图扩建决定

用户已认可 Graffiti Stairs 本机质感并授权全城扩建。又核对同作者 [Simple Old Building Generator](https://balaanimationstudios.gumroad.com/l/GeometrynodesBuildingGenerator) 的免费页面，未能确认完整烘焙材质、导出与许可范围；上述工业楼免费 sample 同样未接入。未找到已经核实可直接补齐同风格全城的新增免费整包，因此本轮通过 Blender MCP 拆分、修改并扩展已认可的六栋源建筑，保留原 UV/PBR。没有领取或购买新候选；成果和实际边界见[全城记录](GRAFFITI_CITY_INTEGRATION.md)。
