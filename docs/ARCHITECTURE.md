# 项目架构

更新时间：2026-10-17。当前规模采用六个职责目录和直接构造的系统协作方式。入口仍为 `src/main.ts`，开发、生产及角色展示 URL 保持现有约定。

## 目录与责任

```text
src/
  main.ts                       # 选择游戏或角色展示，处理启动与 HMR
  app/
    Game.ts                     # 系统装配、固定步、渲染顺序、暂停和重置
    UI.ts                       # 菜单、HUD、小地图 DOM
    CharacterPreview.ts         # 独立角色展示页
    style.css
  core/
    Assets.ts                   # 本地资源加载、缓存、骨架克隆与释放
    Physics.ts                  # Rapier 世界、查询和释放；R 适配门面
    Input.ts                    # 键鼠、边沿输入、焦点和鼠标锁定
    config.ts                   # 集中参数及预算
    math.ts                     # 向量创建/转换、边界速度衰减
  characters/
    Player.ts                   # 玩家状态、运动、攻击时序和画面插值
    PersonVisual.ts             # 角色模型、蒙皮动作播放与混合、眼睛挂点
    CapePhysics.ts              # 主角披风的固定步布料、蒙皮空间变形与碰撞
    Ragdoll.ts                  # NPC 物理倒地、骨架驱动与插值
  gameplay/
    Combat.ts                   # 能力命中、伤害、损毁和归因
    Npcs.ts                     # 平民/敌人 AI、导航、出生、撤离和射击
    rules.ts                    # 热度、预算及伤害去重规则
  render/
    Camera.ts                   # 第三人称跟随与避障
    CityRenderer.ts             # AO、辉光和颜色输出
    SceneLighting.ts            # 天空、灯光、HDR/PMREM 生命周期
    Effects.ts                  # 光束、风线、血液、碎块和冲击圈
  world/
    World.ts                    # 实体注册/查询/销毁、导航查询、物理同步
    entities.ts                 # Entity、Kind、分类；关联对象采用类型引用
    StreetBlock.ts              # 街区搭建、碰撞、初始车辆、路网及静态合批
    Environment.ts              # 城市材质/陈设组合和中文标牌
    CitySurfaces.ts             # 米制 UV、道路分区及 PBR 表面
    StreetProps.ts              # 程序化街道陈设和合批
```

`tests/` 保存规则、物理、资源和架构检查；`scripts/` 保存离线素材管线、浏览器检查和录制；`public/assets/` 与 `.asset-source/` 的用途及摘要约定见 [素材账本](ASSETS.md)。

## 依赖边界

- `app` 负责创建系统、连接回调和管理生命周期。`Game.step()` 的固定步顺序、渲染插值及暂停规则仍集中在同一位置。
- `core` 只依赖基础设施或外部库，不导入具体角色、玩法、世界或界面。参数文件仅保存配置，实体类别归世界数据模型。
- `characters` 的运行时依赖限于 `core` 和本组。数学函数位于 `core/math.ts`，角色和镜头无需为了创建向量导入整个街区。
- 具体角色动画类直接从 `characters/PersonVisual` 导入，资源缓存不转导出角色实现。
- `world/StreetBlock` 接收已有 `StreetWorld` 搭建场景；其 `StreetWorld` 引用仅用于类型，避免构建器与世界实例产生初始化循环。
- `gameplay`、`world`、`render` 按实际需要直接协作。目录表达职责，不假装为完全单向的分层；所有模块级运行时导入仍应无环。仅作类型使用的引用明确写为 `import type` 或 `type` 标记。
- 不增加统一 `index.ts` 转导出、旧路径兼容层、通用 ECS、事件总线或依赖注入容器。当前调用关系能由具体类和参数直接追踪。

## 生命周期和资源所有权

`Game` 持有一个 `Assets` 缓存。重置先暂停和清输入，再清特效/实体/角色实例与城市材质，由 `Assets.disposeScene()` 释放本轮场景的非缓存几何/材质，最后释放物理世界并重建。缓存中的模型、纹理与骨架克隆来源继续复用。

最终退出才调用 `Assets.dispose()` 清空模型/纹理缓存；别名模型共享的资源去重释放。`SceneLighting` 独立管理反射渲染目标：初始房间反射被 HDR 替换时释放旧目标，最终退出时释放当前目标。`World.remove()` 对仍被场景或缓存保留的资源继续执行已有保护，不引入新的引用计数策略。

HUD 接收状态数据，小地图接收坐标、朝向及标记；`UI` 更新自己的 DOM，不持有 `Player` 或世界系统实例。开发用 `window.game` / `window.studio` 及其现有检查入口保留。

`CapePhysics` 在角色动画与整模型变换完成后更新，只写该角色克隆几何中的披风顶点和法线。它用骨骼胶囊处理身体碰撞，通过 `Player` 注入的回调调用 `Physics.constrainSphere` 处理场景，不导入世界或玩法。私有几何由 `PersonVisual.dispose()` 释放，缓存几何和共享纹理保持原有所有权；暂停不推进布料，重置创建新的模拟状态。

## 扩展时放在哪里

| 修改 | 入口 |
|---|---|
| 调速度、攻击时点、物理和效果预算 | `core/config.ts` |
| 新增/替换运行资源 | `core/Assets.ts`；素材管线与来源另在 `scripts/`、素材账本维护 |
| 新动作播放、混合或角色表现 | `characters/PersonVisual.ts`；现成动作先离线适配 |
| 能力命中或追捕规则 | `gameplay/Combat.ts`、`gameplay/rules.ts` |
| 城市布局和初始实体 | `world/StreetBlock.ts` |
| 实体生命周期或物理同步 | `world/World.ts` |
| 光照/HDR/后处理 | `render/SceneLighting.ts`、`render/CityRenderer.ts` |
| 菜单、HUD、小地图 | `app/UI.ts`、`app/style.css` |

新增能力先接入现有具体模块；只有出现独立职责和实际复用需求，再拆新模块。

## 本轮迁移和验证

本轮整理 21 个平铺文件，新增数学、实体模型、街区搭建和场景光照四个职责模块。`Game.ts` 从 427 行缩小到 328 行，`World.ts` 从 454 行缩小到 182 行。14 个文件的实现内容与迁移前逐字节一致，仅修改导入；比对记录为 `.artifacts/architecture/structural-equivalence.json`。固定步、动画采样、数值、网格和第三方素材未重建。

外部路径消费者同步更新：三个已有规则/物理/地面测试，以及通过 HTTP 动态导入角色模块的 `scripts/compare-run-clips.mjs`。历史角色研究中的旧路径/行号仍保留为历史证据；当前源码入口以本文为准。

`tests/architecture.test.ts` 检查运行时导入无环及基础设施/角色边界，`tests/assets-ownership.test.ts` 检查场景清理保护缓存、最终释放对别名去重。独立只读审查确认街区搭建、光照替换/释放、资源清理和小地图生成与迁移前等价。

2026-10-17 验证完成：

| 检查 | 结果 |
|---|---|
| 类型、单元/资产与架构、生产构建 | 8 个测试文件、26 项测试全部通过；类型检查和构建通过 |
| 主角与 NPC | 主角 16 段动作及全身蒙皮/过渡共 17 项、NPC 7 项通过 |
| 实际游戏及城市 | 战斗/姿势/暂停 13 项、环境/车辆/四次重置 10 项、开发与生产冒烟 7 项通过 |
| 生命周期 | 重置保护缓存/HDR/灯光/小地图，最终清空缓存且环境目标仅释放一次，再次初始化和无运行错误，共 4 项通过 |
| 动态源码路径 | `compare-run-clips.mjs` 成功加载迁移后的角色模块，完成两段原配跑姿比较，无运行错误 |
| 干净副本 | 导出 239 个必要文件，在 Node 22.23.2 下重新安装锁定依赖，类型检查、26 项测试和生产构建通过 |

浏览器共 58 项检查通过，另有跑姿比较；汇总为 `.artifacts/architecture/verification.json`，生命周期原始数据为 `lifecycle.json`，干净副本文件清单为 `clean-export.json`。所有浏览器检查串行执行，结束后已关闭测试浏览器并交还城市会话的 GPU 窗口。

本轮只验证架构迁移后的行为等价性，没有重跑完整性能长测；城市会话使用独立冻结副本继续验证，其结论见 [江湾城环境接入](JIANGWAN_ENVIRONMENT.md)。构建仍有现有单包体积提示，本轮没有调整打包或性能策略。
