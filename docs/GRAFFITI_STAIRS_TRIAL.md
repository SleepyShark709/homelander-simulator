# Graffiti Stairs 本机写实样板

2026-10-22 历史小场景记录。用户随后认可本机质感并授权接入原地图、扩建全城；当前版本见[全城记录](GRAFFITI_CITY_INTEGRATION.md)，以下保留试用阶段的证据与边界。付费候选仍须先展示具体效果、价格和本项目接入证据，再取得购买确认。

## 来源与范围

- 作者 Bala；[作者展示](https://blenderartists.org/t/free-graffiti-stairs-marseille-style-street-scene-blender-fbx/1655163)、[Gumroad 免费领取](https://balaanimationstudios.gumroad.com/l/graffiti-stairs)、[Superhive 商品](https://superhivemarket.com/products/graffiti-stairs-free-street-scene)。本次领取总价 US$0，无账号注册或银行卡付款。
- 采用已烘焙的 2K FBX 包。ZIP 264,218,851 bytes，SHA-256 `6a6b07dd309e4d8f977c2e5be3dbcd1e184f0c7714b407da0378d651bb518565`；FBX SHA-256 `b4a65119bbbaff077cc4eed8ed4648dd2a28654fd245d180626155ffc0f0190f`。ZIP CRC 与解包路径检查通过。
- 作者允许个人/商业游戏；包内 README 要求不转卖或重新上传场景本身。本机试用不视作公开 Git 源资产或公开 Web 分发许可已获确认。原始输入、派生运行文件、领取凭据均保留在忽略路径；不记录邮箱、订单访问 token 或私有下载 URL。
- 作者列 Poly Haven 纹理与 AI graffiti；整套场景不是 CC0。当前源码内默认街区保持可启动，只有 `?scene=graffiti` 请求本机私有资源。

## 可重复加工

本机输入 `.asset-source/graffiti-stairs/fbx-2k/GraffitiStairs_2K_FBX/`，输出先到 `.artifacts/graffiti-stairs/`。安装已有依赖后使用 Node 22、Pillow Python：

```sh
node scripts/build-graffiti-stairs.mjs
python3 scripts/pack-graffiti-stairs.py
```

纹理编码工具固定 Khronos KTX-Software 4.4.2，使用官方 Darwin arm64 pkg，仅解包到 `.artifacts/tools/ktx-4.4.2/runtime/`，未系统安装。[官方发行](https://github.com/KhronosGroup/KTX-Software/releases/tag/v4.4.2)；pkg SHA-256 `500bd8f9d63358c3f3a0d83b724c8574436a72c37dc0e4bad90ec1ca38032c3c`。几何量化固定 `@gltf-transform/cli@4.5.1`，运行时 Three.js 0.186.0。

- 官方 FBXLoader / GLTFExporter，按 FBX UnitScaleFactor 换算米制；保留作者空间关系，只将下街移到既有出生点附近。实际模型约 28.4 × 52.5 米，高约 23 米。
- 原 FBX 的逐面材质组直转产生 118,657 primitives。官方 `mergeVertices(1e-7)` / `mergeGroups` 合并完整顶点记录及相同材质组，保留三角面/材质归属，导出 251 primitives、171 个被使用材质；几何从 136,162,064 降至 48,647,908 bytes，未做轮廓简化。
- FBX 旧 ShininessExponent / ReflectionFactor 贴图通道不受 FBXLoader 直接支持；根据作者烘焙文件补回标准 PBR。白色底色因子避免重复乘 FBX 的 0.8 漫反射。ORM 为 R=AO、G=roughness、B=metallic；20 个楼梯 tile 缺失的金属图按原非金属设为 0。
- 保留源图尺寸，UASTC quality 2 + lossless Zstd 6 + mip。复现 exporter 的 image.flipY，并为无显式 TANGENT 的材质反转法线绿通道，配套 GLTFLoader 的导数切线约定；未采用统一降为 1K 或历史 32 MB 限额。
- 原 Window_Glass 为旧 Phong 透明材质。按 Blender FBX 正式导出的 `shininess=((1-roughness)*10)^2` 反推原 roughness≈.05，避免 GLTFExporter 默认 roughness=1；保留源颜色/透明度。未自行加入折射或额外玻璃 shader。
- 碰撞从量化后实际三角面和完整世界矩阵构建，使用 Rapier internal-edge 修正；下街以外另有低于路面的支撑面。复用原公交/轿车/电动车动态物理；NPC 导航限制在下街。当前不是完整城市推广，未把新窗玻璃/墙面标记为可破坏实体。

## 当前核验

- 静态独立检查已完成；发现的法线绿通道转换已修复。
- 新 CPU 测试验证 normalized Int16 顶点、嵌套旋转/平移/缩放的实际射线碰撞，以及两次重建保留三种车辆刚体。
- 510 张 KTX2 全部编码完成，当前目录约 608 MB；全源贴图直接展开估算约 10.35 GiB，压缩格式包含 mip 的最坏 GPU 贴图预算约 1.56 GiB，后者不是已测显存占用。
- 原楼梯 AO JPG 自带黑色烘焙剪影。原图接触表与游戏逐通道隔离确认后，仅楼梯取消坏 AO 引用，保留原色/法线/粗糙度与游戏 GTAO；其他材质 AO 保留。前后隔离截图在 `.artifacts/graffiti-stairs/game/`。
- 初版 15 个导航点被既有 `(i*5+8)%length` 选成 3 个出生位置，产生人群重叠与低帧率；现为 27 个避开玩家/车位的点，真实 Npcs 构造测试保证 20 个独立出生点。增援入口在现有 28 米安全半径之外，外围地面与玩家最低脚面对齐到 −.02 米。
- 最新冻结源码 818 个项目文件，另加入本机私有包。主角 SHA-256 `d99e306a56968284dba1ea08384ad970dfb7c2a09b918dac33c1760b8c60e296`，未修改骨架/动作或其碰撞。
- Chrome / Metal，1440×900、DPR 1，10 秒前街稳态 600 帧：p50 16.7 ms、p95 16.8 ms；CPU 更新 p50 9.1 ms / p95 9.5 ms，渲染提交 p50 2.4 ms / p95 2.8 ms。本机首载约 6.15 秒。只代表此设备/机位/短样本；Safari、移动端、互联网加载与长期运行未测。
- 7 项接入检查通过：下街行走；墙体阻挡/视线遮挡；起飞上升与砸地；近战计分；追捕增援出生；暂停冻结两个时间域；三次重置保持初始实体与缓存资源数量。没有控制台/page 错误。证据 `.artifacts/graffiti-stairs/game/acceptance.json`，前视/斜侧/飞行图和实录同目录。

- 最终干净副本：`npm ci`、类型检查、20 文件 / 119 项 CPU 测试、生产构建通过；独立清单验证 123 份公开媒体及依赖/哈希，并确认不包含私有 Graffiti 文件。当前源码/资产与已测冻结副本逐字节一致性见 `final-integrity.json`。
- 生产启动另验证两种入口：暂时移走私有目录时，默认街区仍正常且没有任何私有请求；恢复后试用入口可正常载入 KTX2、20 NPC 和三种车辆，无 page 错误。证据 `game/production-smoke.json`。
- 实际硬件字符串为 `ANGLE Metal Renderer: Apple M2 Pro`。外围脚底实测 y≈.010、地面 −.020，间隙约 .030 米，符合 KCC offset；未出现原先 .24 米悬高。`game/hardware-recording.json`。
- 18 秒真实游戏短片：`game/graffiti-gameplay.mp4`，显示街面、起飞、低空/屋顶方向观察、返回与镭射；只裁去载入段并转码，没有更换场景画面或合成动作。固定实拍为 `game/stairs-front.png`、`game/street-angle.png`、`game/flight-overview.png`。

## 未通过与后续边界

窄梯步行没有闭环。原测试先撞售货亭，已用源几何水平踏面恢复正确折返路径并重新验证；原地面 Ball 半径 1.1 米在首段停止，后三段净宽约 1.96–2.08 米也小于其直径。仅浏览器临时换 Capsule(.65,.35) 能走完第一段，但仍卡第二段首级；未把这个实验固化进人物代码，也未关闭墙体碰撞或放宽 KCC 断言。证据 `stair-audit-summary.md`、`game/stair-route-first.json`、`game/stair-route.json`，均在 `.artifacts/graffiti-stairs/`。

新窗玻璃/墙面仍为静态几何，未接成可破坏实体；原角色/NPC 的既有验收边界保持。该版本是完整小场景的本机视觉试用，不是已完成的 50–70 米双侧街道或全图推广。D6 待用户看实际效果与上述问题修复，D7 不推进。付费购买仍须用户确认具体商品/效果/价格/接入验证。


## 本机打开与换机

当前生产预览：`http://127.0.0.1:5194/?scene=graffiti`，原街区为同端口不加 scene 参数。服务来自 `.artifacts/graffiti-stairs/frozen/`，静态录像与结果也留在同一 trial 目录。换电脑时需要从已领取入口重新取得原包并运行脚本，或合规复制本机私有输入/运行目录；默认游戏安装和构建不要求这些文件。公开交付另核许可，不提交账号信息、凭据或下载 token。
