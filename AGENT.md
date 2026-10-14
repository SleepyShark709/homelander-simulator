# 项目协作与执行规则

更新时间：2026-10-14。仓库：`git@github.com:SleepyShark709/homelander-simulator.git`。

## 阅读入口与项目目标

开始工作先完整阅读本文件、[MVP 需求](docs/MVP.md)、[实施计划](docs/IMPLEMENTATION_PLAN.md) 和 [进度](docs/PROGRESS.md)。整体质量目标见 [QUALITY_UPGRADE.md](docs/QUALITY_UPGRADE.md)，素材来源见 [ASSETS.md](docs/ASSETS.md)。历史完成标记不替代当前需求和当前实测。

实现第三人称 Web 街区沙盒：自由飞行、镭射、重拳、砸地、超级速度、无敌、三级追捕、车辆物理、局部破坏和少量血液。用户确认后续通过 Web 打开，不做桌面 PC 游戏。当前保持 TypeScript、Vite、Three.js、Rapier；场景使用真实 3D 模型，DOM 只负责界面。

用户已放弃祖国人外观。当前采用中性 mannequin，服装附件、金发和披风已移除，能力和玩法保留。不得静默删减已确认范围，也不擅自增加账号、付费服务、声音、引擎迁移或线上部署。

## 当前角色基线

- 主角保留 Mesh2Motion addon 原配网格、66 骨骼、蒙皮、绑定矩阵和材质；NPC 使用 base 完整原配组合。
- 主角普通跑为 base `Jog`，快跑为 base `Sprint`；用户已认可并授权适配。仅这两段通过未修改的 Mesh2Motion MIT Human Retargeter 离线适配到 addon，其他 10 段主角动画与 NPC 原配动画保持不变。
- 两包绑定矩阵不同，骨名相同不代表兼容。禁止原样跨包复制轨道、手写骨骼角度公式、手工人体关键帧或关节修姿态补丁；新动作应来自许可明确的现成资源及成熟适配工具。
- 浏览器直接播放生成的 GLB，无运行时重定向。完整骨架、肩膀、手指、脚趾和实际蒙皮都必须检查，不能以单一手腕角度宣称人体正常。
- 不恢复 MakeHuman、`Run_Stealth` 或旧自制动作。历史导入脚本仅保留记录，不作为当前重建入口。
- 主角跑步播放倍率上限为 1.35，集中在 `CONFIG.playerRunAnimationRateMax`。循环与过渡检查保持 0.12 米/120 Hz 的连续性要求；姿态应对照当前认可的原片段。

当前实现与证据见 [JOG_SPRINT_ADAPTATION.md](docs/JOG_SPRINT_ADAPTATION.md)。旧 MakeHuman 的质量结论已撤回，见 [CHARACTER_RETARGET_HISTORY.md](docs/CHARACTER_RETARGET_HISTORY.md)；不要沿用其通过记录。

## 代码与资源入口

| 模块 | 责任 |
|---|---|
| `src/Game.ts`、`Input.ts`、`UI.ts` | 生命周期、固定步/渲染、输入、开始/暂停/重置 |
| `src/Player.ts`、`Camera.ts`、`Physics.ts` | 移动/飞行、角色碰撞、镜头、Rapier |
| `src/Assets.ts`、`PersonVisual.ts`、`CharacterPreview.ts` | 资源缓存/克隆、骨骼动画播放与混合、角色展示 |
| `src/Combat.ts`、`Effects.ts`、`rules.ts` | 攻击、命中、反馈及规则 |
| `src/World.ts`、`Npcs.ts`、`Ragdoll.ts` | 实体、追捕与 NPC、物理倒地 |
| `src/Environment.ts`、`CityRenderer.ts`、`CitySurfaces.ts`、`StreetProps.ts` | 城市、材质、道路和陈设 |
| `src/config.ts` | 集中参数与预算 |

模型、纹理、许可和运行清单在 `public/assets/`。测试和适配所需的固定开发输入按白名单纳入 `.asset-source/`；缓存、历史素材、`node_modules/`、`dist/` 和 `.artifacts/` 不纳入 Git。第三方许可、版权、出处和固定版本记录必须保留。新增素材先检查许可、格式、骨架、尺寸和实际效果，再标记接入。

当前人物重建顺序（先启动 `npm run dev`，需要本机 Chrome）：

```sh
node scripts/adapt-native-runs.mjs
node scripts/pack-native-character.mjs
python3 scripts/asset-manifest.py
```

适配脚本核对原包、固定 vendor 快照、工具输出和 adapter 摘要；修改输入或适配实现后须重新生成并验证，不能手改缓存冒充工具结果。正常运行与测试无需重新下载或适配素材。

## 修改与协作约定

- 主代理负责方案取舍、所有文件修改和最终验证；子代理只做探索、检索与独立核验。
- 奠基性文档和即将修改的确切代码由主代理亲自完整阅读。只有较重的检索、独立探索或核验有收益时才派探子，任务必须自包含并要求具体出处。
- 子代理每个只用一轮，派生时显式 `fork_turns="none"`，不指定角色等可选覆盖，不复用或追派。最多并行 10 个。
- 派发后等待所有相关探子终态再推进；过程消息不算完成。在途期间不修改其范围内的文件，跨目录检索时冻结工作区修改。依据返回的 `file:line` 点验关键结论，避免重新通读全部检索范围。
- 参数集中配置，保持功能闭环与本地可启动。暂停冻结模拟时间、清除持续输入；重置清理世界实体、旧回调、追捕和临时效果，保留可复用资产缓存。
- 资源克隆保持独立骨架，删除实体不得误释放其他对象共享的几何、纹理或材质。
- 每阶段执行与变更相关的检查，再更新进度和证据。未测项明确标记，不把占位画面、源片段预览或历史性能当作当前游戏验收。

## 已验证的物理注意事项

Rapier 0.20 的查询过滤回调只比较碰撞句柄与 JS 元数据，不调用碰撞体状态 getter；这类 getter 曾残留 WASM 借用状态，导致重置释放失败。回归位于 `tests/physics.test.ts`。

基础地面使用向上法线固定的 HalfSpace，避免大 cuboid 的倾斜接触法线与平地抬升。Rapier 对 HalfSpace 近零位移查询会返回半个球半径的异常向上位移；静止时使用非零支撑探测更新 grounded，同时保持请求的静止位置。已落地帧不重复施加向下重力，失去支撑后恢复重力。探测参数在 `CONFIG.playerSupportProbe`。

地面动画采用插值后的水平速度和方向，与画面位置同步；垂直重力不参与地面走跑选择。修改这条路径必须逐帧检查持续跑步、不同刷新率、转向、停止再起跑、高台坠落/落地，以及悬停、砸地、墙边和倒地回归，不能只验证总路程。证据见 [RUNNING_VALIDATION.md](docs/RUNNING_VALIDATION.md)。NPC 和实体碰撞会阻挡运动，应从实际碰撞记录区分场景阻挡与平地反复归零。

## 验证与交付

基础命令：

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run dev
npm run preview
```

角色/移动相关修改按范围执行 `native-character-check.mjs`、`character-motion-check.mjs`、`running-continuity.mjs`、`character-game-check.mjs` 和 `quality-acceptance.mjs`。物理倒地修改执行 `quality-ragdoll.mjs`；生产启动执行 `final-smoke.mjs`，需要开发与生产预览服务同时运行。脚本位于 `scripts/`，结果输出到 `.artifacts/`；正式结论更新到 `docs/`。

浏览器/GPU 测试与录制顺序执行，性能测试期间关闭其他测试浏览器。原配动作需验证全身变形、循环、状态混合和实际操作画面；攻击需验证一次命中、完整收势和暂停。当前主要验收环境为 macOS Chrome，Safari 和当前版本完整长时间性能仍需单独验证。

提交前检查暂存清单与必要来源文件，保留锁文件和第三方许可；从干净导出验证安装、测试和构建，避免依赖被忽略的本机文件。不要提交凭据、缓存和批量测试输出，不覆盖已有远端历史、不使用强推。推送、部署等对外操作以用户当次授权为准，当前仓库不自动部署。
