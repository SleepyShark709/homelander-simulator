# 两段跑步与美术/引擎管线评估

日期：2026-10-14。用户询问普通跑和快跑是否可以使用不同动作，以及 Three.js 的限制、Unity 迁移和 Blender 的作用。评估后用户明确后续仍为 Web 游戏，并认可 Jog/Sprint 预览、授权接入。当前两段已经通过官方工具离线适配给主角；具体实现和全部验收见 [JOG_SPRINT_ADAPTATION.md](./JOG_SPRINT_ADAPTATION.md)。

## 接入前的事实

接入前 `scripts/pack-native-character.mjs` 将主角 jog/sprint 都映射到 addon 原包 Run_Female，两状态不是不同的原始动作。Three.js/PersonVisual 已支持多个独立动作、相位衔接和权重混合；现已用两段独立 Jog/Sprint 实现区分。

本地 base 原包及 native-npc 有两个独立原配动作 Jog / Sprint。addon 主角则包含 Run_Female、被用户否决的 Run_Stealth、特殊动漫跑 Run_Anime；没有第二个已核验适合常规冲刺的片段。两个包的原配网格/骨架/绑定分别完整，但 inverse bind matrices 不同，不能把 base 的 Sprint 直接塞进 addon 主角。改用 base 整套后，也不能直接继续套用 addon 的飞行/悬停/落地动作。

正确接入需要同一骨架的完整动作组合，或在成熟离线工具里做正规适配，再逐帧验证完整模型、蒙皮和所有能力。不得用同名骨骼、复制关键帧或程序手改关节来绕过绑定问题。

## 已做的实际对比

命令：`node scripts/compare-run-clips.mjs`。在现有 Three.js 角色展示渲染器中，用 base 原配模型/蒙皮/66 骨骼分别播放 Jog 和 Sprint，每段 198 个原始通道。骨架独立克隆；没有重定向、没有手写关键帧，也没有混入 addon 角色。

视频 `.artifacts/distinct-runs-preview.mp4` 为并排正面/斜侧视角；截图 `distinct-runs/front.png`、`angle.png` 已检查。该历史预览报告 `distinct-runs-comparison.json` 的 installedInGame=false，描述的是接入前状态。当前主角已使用适配后的两段动作，新视频为 `.artifacts/web-running-final.mp4`。

## 工具各自解决的问题

| 工具 | 作用 | 对当前项目的意义 |
|---|---|---|
| Three.js + Rapier | 浏览器内模型渲染、骨骼动画播放/混合、物理与查询 | 足以分开两段跑步并继续改善角色和画面；动画编辑工作流与较多游戏系统仍需自行集成 |
| Blender | 内容制作与整理；模型、材质、骨架、蒙皮、动作检查和 glTF/GLB 导出 | 可以使用现成人物与动作，不要求从零建模；适合引入统一的离线美术检查/导出步骤 |
| Unity | 完整游戏引擎、场景与 Animator/Blend Tree 编辑工具 | 长期桌面动作游戏的工程工具链更完整；迁移涉及现有控制、战斗、世界和 UI，素材质量仍需保证 |

工程建议（不是已执行的迁移决定）：当前浏览器目标下，优先统一角色/动作资产并完善制作管线。若产品目标转为长期维护的桌面动作游戏，再评估尽早采用 Unity 的收益与迁移成本。Unity 的 Web 发布仍受浏览器平台限制，不能据此假设它会消除 Web 的性能或 API 约束。

## 官方依据

- [Three.js Animation System](https://threejs.org/manual/pages/animation-system.html)：蒙皮骨骼、多 AnimationClip、播放/循环、交叉淡化、同步与独立权重/时间缩放。
- [Unity Animation Blend Trees](https://docs.unity3d.com/Manual/class-BlendTree.html)：按速度混合动作，要求左右脚接触时刻在归一化时间上对齐。
- [Unity Animation Rigging](https://docs.unity3d.com/Manual/com.unity.animation.rigging.html)：可视化约束和 IK 等工作流的工具包。
- [Unity Web technical limitations](https://docs.unity3d.com/Manual/webgl-technical-overview.html)：浏览器发布的图形、托管线程、网络与其他限制。
- [Khronos glTF Blender importer/exporter](https://github.com/KhronosGroup/glTF-Blender-IO)：Blender 与 glTF 场景/网格/动作/纹理的导入导出和往返工作流。

当前瓶颈的归因是结合项目实际资源和代码作出的判断；上述文档说明工具能力，不替代实际项目质量或迁移性能实测。
