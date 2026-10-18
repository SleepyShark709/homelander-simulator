# 江湾城 Blender 环境接入

2026-10-17。根据用户江湾城参考图制作的原创、简化 GTA 风格街区，保持现有 Web 沙盒玩法。未使用 GTA 原版模型或纹理。此记录仅覆盖本轮环境与车辆；角色接入另见 HOMELANDER_INTEGRATION.md。

## 交付与范围

- `.asset-source/jiangwan/jiangwan.blend`：米制可编辑环境，含八栋主体建筑、玻璃高楼远景、中文店招、窗笼、空调、水箱、屋顶设备、树木、公交站、高架、江岸栏杆与斜拉桥。另含仅供 Blender 预览的道路、车辆、灯光和相机。
- `.asset-source/jiangwan/{bus,scooter,sedan}.blend`：减面并保留 PBR 贴图的车辆源工程。三个用户原始 FBX 和参考图一同保存，不依赖 Downloads 目录。
- `public/assets/jiangwan/`：游戏用四份 GLB、自包含纹理及 `build.json`。环境 GLB 不含预览地面或车辆，防止重复道路和动态实体。
- `scripts/build-jiangwan.py`：Blender 5.2.2 LTS 离线建模、车辆转换与导出入口。

八栋主体和两处开放商铺沿用原街区占地。可游玩区域仍是约 200 × 200 米，主角、NPC、追捕、能力和破坏保留。江面、桥梁、高架及远景建筑位于边界之外，为背景景观；没有新增驾驶、交通或建筑室内。当前视觉采用简化模型，不等同于 GTA 的原版资产精度。

## 车辆处理

| 用户 FBX 短 ID | 接入车型 | 长度 | 三角面 |
|---|---|---:|---:|
| c66a0788 | 绿色公交 | 10.5 m | 23,994 |
| c27d6be5 | 踏板电动车 | 1.95 m | 15,979 |
| 43709bee | 白色轿车 | 4.6 m | 23,995 |

原始模型合计约 896,096 三角面，各含四张 4K PBR 贴图。经 Blender 减面后合计 63,968 面，贴图统一缩至 1K；保持等比尺度，Y 向上、车头 +Z、地面原点。场景中放置一辆公交、两辆电动车、五辆轿车，保留物理冲量和损毁变色。碰撞盒按导出模型实际包围盒建立，实体与刚体一起旋转。

车辆来自用户提供的 Tripo 输出，用户授权在本项目使用；没有声明其为 CC0 或推定更广泛的再分发许可。原始输入 SHA-256 见 `build.json`，说明见 `public/assets/licenses/jiangwan-source.txt`。

## 接入约定

Blender 内为 Z 向上，构建脚本按 `(game.x, -game.z, game.y)` 建模，导出标准 Y 向上 GLB。建筑主体、屋顶设备、女儿墙、树干和公交站等实体的盒碰撞作为空节点 extras 一起导出，由游戏读取，避免视觉和碰撞使用两份独立蓝图。

保留原有道路与铺装的互斥分区。离线合并的模型跳过运行时静态合批，以保护缓存共享的几何、材质和纹理。单个车辆损毁克隆材质；重置复用完好缓存。删除被取代的程序化建筑与车辆生成器。天空泛光在实际画面中导致街景发白，已降低泛光强度和提高阈值。

## 重建和验证

```sh
"/Applications/Blender.app/Contents/MacOS/Blender" -b --python-exit-code 1 --python scripts/build-jiangwan.py
python3 scripts/asset-manifest.py
npm run typecheck
npm test
npm run build
# 启动 npm run dev 后，浏览器/GPU 检查串行执行：
node scripts/jiangwan-check.mjs --record
node scripts/quality-acceptance.mjs
node scripts/ground-flicker.mjs
# final-smoke 另需 npm run preview
node scripts/final-smoke.mjs
node scripts/performance.mjs jiangwan-performance
```

中文店招在构建时使用本机 macOS STHeiti Medium，随后转换为网格，不分发字体文件。正常游戏运行无需 Blender 或字体。

截图与视频使用实际游戏渲染，不以 Blender 离线渲染替代浏览器验收。

## 环境接入快照的验证证据

环境约 299,989 三角面，120 个导出盒碰撞；四份运行 GLB 合计约 28.8 MB。浏览器动态场景还包含既有角色、道路和陈设，不能用环境自身面数代替整帧渲染数量。

| 检查 | 结果与证据 |
|---|---|
| 类型、单元/资产、构建 | 类型检查、21 项测试、生产构建通过 |
| 后续架构迁移回归 | 架构会话另验证 26 项测试、生产构建和 58 项浏览器检查，包含本轮城市 10 项与四次重置；详见 ARCHITECTURE.md。本节性能仍属于迁移前冻结快照，不代替后续角色修改的性能验证 |
| 独立干净副本 | 232 个交付文件重新安装依赖后，typecheck/test/build/素材清单校验通过；`.artifacts/jiangwan/clean-export.json` |
| 资源来源与离线导出 | 67 个本地媒体依赖及 SHA 校验通过；GLB 纹理自含，车辆各三张运行纹理为 1024²（粗糙度与金属通道合并），环境三张为 256² |
| 新环境专项 | 10 项检查通过：真实键盘飞行/暂停、八栋屋顶的可见表面与物理表面、三车贴地/旋转碰撞、损毁、商铺缺口、公交端部重拳、四次重置与加载；`.artifacts/jiangwan/validation.json` |
| 既有移动与飞行 | 8 项通过，包含路沿、店铺、墙边、飞行碰撞、连续镜头及眼部光束；`.artifacts/quality-acceptance.json` |
| 地面闪烁 | 五种视角、25,127 次采样，错误表面与交替闪烁均为 0；`.artifacts/ground-jiangwan.json` |
| 生产启动 | 7 项通过；`.artifacts/final-smoke.json` |
| 独立常规/压力采样 | M2 Pro、32 GB、macOS 27.0.1、Chrome 155、1440×900，各 120 秒；两组 median/P95 均约 16.7 ms，最高追捕维持 12 名敌人 |

独立核验发现公交长度超过旧重拳中心距离阈值。修复前车头、车尾贴近挥拳均保持 300 HP，修复后均降至 150；正式回归还检查距离车端 4 米的挥拳不能命中。车辆按碰撞盒最近点判断距离，并对同一个命中点检查墙体遮挡。所有车辆车头 +Z 的实际顶点/UV 投影已独立确认。

原长测曾因另一个 GPU 测试启动而主动中止；开发服务长测另出现 `window.game` 调试入口丢失，冻结开发服务也复现，确切触发原因未确认。原始失败保留于 `.artifacts/jiangwan/performance-overlap.log`、`performance-reloaded.json` 和 `performance-frozen-failed.json`，均不作为通过依据。

最终使用独立 5177 静态生产构建，副本仅启用开发遥测入口，游戏逻辑、GLB、物理与渲染参数不变。完成 30 秒预热、120 秒常规、120 秒压力、360 秒持续操作，共 630 秒；三个阶段齐全、三次重置恢复、运行错误为空，导航记录仅有首次加载一次。报告为 `.artifacts/jiangwan-performance.json`，摘要与可复现测试脚本保存在 `.artifacts/jiangwan/`。该结果属于架构迁移及后续飞行/下落动作修改之前的城市冻结快照；四份城市/车辆 GLB 与交付版本逐字节一致。

| 阶段 | 帧间隔 median / P95 / max | 结论 |
|---|---|---|
| 常规 120 秒 | 16.7 / 16.7 / 16.8 ms | 满足常规目标 |
| 最高追捕压力 120 秒 | 16.7 / 16.7 / 16.8 ms | 满足压力目标 |
| 持续操作末段（第三次重置后约 60 秒） | 16.7 / 33.3 / 50.1 ms | 中位约 60 FPS，仍有长帧，不能表述为全程稳定 60 FPS |

三次重置均恢复为 29 刚体、239 碰撞体、20 平民、0 敌人、0 临时效果；预热后的几何 411、纹理 70 也一致。持续操作中的资源数量保持有界，JS heap 随回收波动，没有观察到持续增长。尚未针对长测末段长帧做进一步优化，后续角色修改、不同分辨率和其他平台需另验。

实机截图位于 `.artifacts/jiangwan/{street,aerial,rooftop,bus,sedan,scooter,river}.png`，预览为 `preview.mp4`；视频含真实键盘飞行与静态环境机位，不替代完整玩法长时间人工验收。Safari 未做实机验收。
