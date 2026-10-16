# Tripo 模型交给 Blender 绑骨与蒙皮

核对日期：2026-10-16。模型页面：https://studio.tripo3d.ai/workspace/generate/38eaab4b-ef36-429a-bc7f-9703dd12d9e7

当前匿名访问仅能看到 Tripo 通用登录/生成页，尚未下载、检查或修改实际模型。本文件是交接流程与后续处理建议，不代表模型已经具备合格拓扑、骨架或蒙皮。

## 导出前先确认免费额度

2026-10-16 用户反馈导出弹窗要求订阅。补查官方定价：Free 方案的导出项为 `15 (H2.5 only)`，付费方案为 Unlimited；官方帮助进一步注明每月最多下载 15 个 H2.5 模型。因此先检查本次模型是否为 H2.5，以及账户是否还剩当月导出额度。弹窗本身不能确定当前模型的版本或账户余量，也不能据此承诺该模型一定可免费导出。[Tripo 官方定价](https://www.tripo3d.ai/pricing#compare-plans)、[官方免费方案帮助](https://www.tripo3d.ai/tr/help/billing/which-tripo-ai-plan-is-right-for-me)

若当前模型不属于免费可导出的范围，尚未查到官方免费取回同一 Studio 模型的办法；改用 GLB/FBX/OBJ 格式不能据此保证解除导出限制。可考虑使用免费额度生成 H2.5（前提是账户仍有生成积分，界面提供此版本），或用原始参考图在其它工具重新生成。

两条可供重新生成的路线：

- **TripoSR 本地生成**：官方源码和预训练模型采用 MIT 许可，可以从图片生成并保存本地模型；脚本支持 GLB/OBJ，烘焙纹理需要 `--bake-texture`。不消费 Studio 导出额度，也不能取回原 Studio 模型。官方没有承诺 Apple MPS 支持；无 CUDA 时脚本回退 CPU，本机依赖、速度与内存仍需验证。[官方仓库](https://github.com/VAST-AI-Research/TripoSR)、[运行脚本](https://github.com/VAST-AI-Research/TripoSR/blob/main/run.py)
- **Stable Fast 3D 官方公开演示**：可以尝试单图生成和 GLB 输出，免于先在本机部署；公开托管受登录、排队及 GPU 配额限制，本次未提交生成或验证下载成功。它也会重新生成模型。本地版本官方标注 MPS 为 experimental，许可证为 Stability AI Community License，使用前按用途核对其条款。[官方演示](https://huggingface.co/spaces/stabilityai/stable-fast-3d)、[官方代码与运行说明](https://github.com/Stability-AI/stable-fast-3d)

## 先交接带贴图的原始网格

在 Tripo 模型的导出入口选择 GLB，保存未绑骨的 T-pose 模型原件。官方确认 GLB 支持内嵌贴图，FBX 面向游戏/动画软件，OBJ 适合静态几何编辑；因此本项目先用 GLB 交接网格和外观。若只能导出 FBX/OBJ，应保留下载包中的贴图及相关材质文件，不只移动单独一个模型文件。[Tripo 格式说明](https://www.tripo3d.ai/help/getting-started/what-3d-file-formats-do-you-support)

建议将下载原件放到项目 `assets/models/homelander/tripo-source.glb`。此路径目前仅为建议，文件尚不存在；不要覆盖现有游戏角色。Blender 使用 `File → Import → glTF 2.0 (.glb/.gltf)` 导入。[Blender glTF 文档](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html)

## Blender 处理顺序

1. **保存源文件并检查网格。** 导入后检查材质、UV、法线、米制身高、朝向和物体变换。确认手指、腋下、两腿之间没有错误粘连，尤其检查披风是否与腿部焊接。必要时先修网格/重拓扑，再绑定；已有 UV 和贴图应保留。对静态未绑定的工作副本在开始 rigging 前合理应用 Rotation & Scale，避免对已经绑定的模型盲目 Apply。[Blender Apply](https://docs.blender.org/manual/en/4.5/scene_layout/object/editing/apply.html)

2. **确定正式使用的骨架。** 通用 Blender 路线是启用 Rigify，添加 `Armature → Human` 元骨架，对齐髋、脊柱、肩、肘、腕、膝、踝与手指，再点击 `Generate Rig`。元骨架是生成模板，绑定应使用生成后的 rig；保留元骨架便于调整和重新生成。骨骼对齐时需照顾关节弯曲方向。[Rigify Basic Usage](https://docs.blender.org/manual/en/latest/addons/rigging/rigify/basics.html?highlight=pose+mode)

3. **主体网格初始蒙皮。** 在 Object Mode 先选主体网格，最后选生成的 rig 使其为 active，执行 `Ctrl+P → Armature Deform → With Automatic Weights`。该操作建立骨架变形与骨骼顶点组权重；它不是自动创建骨骼的步骤。自动权重可能在复杂、重叠的几何上产生错误，需要后续 Weight Paint/顶点组修正。[Armature Deform Parent](https://docs.blender.org/manual/en/latest/animation/armatures/skinning/parenting.html)

4. **本角色附件需要单独处理。** 建议把金色鹰肩甲作为硬质部件，采用对应骨骼刚性权重/骨骼父级，避免像布料一样弯折。披风若需要摆动，建议独立网格和专用披风骨链，手工限制权重，避免受腿骨拉扯；若披风与腿部融合，需要先修几何。以上是针对该造型、根据骨骼与权重机制做出的制作建议，尚未检查实际模型。[机制依据](https://docs.blender.org/manual/en/latest/animation/armatures/skinning/parenting.html)

5. **检查变形再交付。** 在 Blender 的临时测试姿态/工作副本中检查抬臂、屈肘、屈膝、转身、手指与披风；测试姿态不作为项目动画。修正后保存可编辑的 `.blend`。人体游戏动作继续使用许可明确的现成片段及成熟适配工具，遵守项目禁止手写人体动作与关节姿态补丁的规则。

6. **导出游戏版本。** 使用 glTF 2.0 的 GLB 输出并保留 skinning data；Rigify 控制 rig 需转换为可播放的变形骨骼数据，按目标检查 `Export Deformation Bones only` 与动画烘焙选项。导出后验证真实骨架、蒙皮、贴图和动画，再放入 Three.js 实际预览。[Blender glTF 导出](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html)

## 与当前游戏的关系

项目当前主角使用 Mesh2Motion addon 的 66 骨骼及现有 13 段动作。新建的 Rigify/Tripo 骨架不会因为骨名相似就自动兼容现有动作。正式绑定前应结合下载模型决定是否以现有骨架作为目标，或采用成熟工具离线重定向；不得直接复制不同绑定矩阵骨架的动画轨道。运行时角色替换、绑定和动画兼容性仍待单独实施与验证。

## 下一步所需材料

实际的 `.glb` 文件（或包含模型、贴图的完整 FBX/OBJ 下载包）。目前的模型工作区 URL 不能代替可访问的源模型文件。

