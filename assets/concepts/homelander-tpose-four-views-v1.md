# 祖国人 T-pose 四视图 · v1

生成日期：2026-10-16。

- 文件：[homelander-tpose-four-views-v1.png](./homelander-tpose-four-views-v1.png)
- 原始尺寸：1254 × 1254 像素，PNG；保留原始输出，未缩放或后期改图。
- 用途：游戏 3D 角色建模的造型、服装、材质及比例参考。
- 生成入口：内置 `image_gen.imagegen`，非 CLI/API。
- 模型记录：用户指定 Image 2.5；当前工具不暴露模型版本选择或返回可核验的模型版本，因此不能确认本图由 Image 2.5 生成。
- 来源：本次 AI 生成；角色为 The Boys 的 Homelander（祖国人）。
- 构图：左上 FRONT、右上 BACK、左下 LEFT、右下 RIGHT；同张参考板生成四个视角。

## 视觉核验与建模约定

主代理复核及独立视觉核验未发现明确的主要服装跨视角冲突。四格的人物身高比例、金色后梳短发、蓝色纹理战衣、金色鹰形肩饰与腰带、红色长手套和高靴基本一致。正背面双臂水平，侧面保持相同 T-pose；侧面手臂朝向观察方向，手掌与手臂自然重叠。

披风为同一件肩部固定、自然垂落的国旗披风。背面展现星区与红白竖条，正面和侧面的大部分花纹受遮挡。建模时固定披风底边在小腿中下段、挂点在肩饰后下方，靴面徽章位于前/外侧，避免把正常遮挡当成新增或缺失部件。被披风遮住的背部战衣未展示，不能从这张图确认其完整结构。

本图是视觉参考；图中遮挡与生成纹样不提供精确几何尺寸、拓扑、骨架或纹理展开。后续建立模型时以一个统一的三维结构和一套纹理控制四面细节。本轮仅产出参考图，游戏当前 mannequin、绑定与动作基线保持原状，未生成或接入新 3D 模型。

## 完整生成提示词

```text
Use case: stylized-concept.
Asset type: production character turnaround reference sheet for a game 3D model.
Create a high-resolution, very crisp, realistic PBR-style 3D character model reference of HOMELANDER (The Boys, recognizable live-action costume), one and exactly the SAME character rendered from FOUR strictly orthographic views. This is a technical modeling sheet, with controlled studio lighting and accurate readable costume construction.

LAYOUT:
A clean 2 by 2 grid on a uniform very light neutral gray background. Top left FRONT, top right BACK, bottom left LEFT, bottom right RIGHT. A small understated uppercase label centered underneath each model reading exactly "FRONT", "BACK", "LEFT", "RIGHT". No other typography. Each view shows the COMPLETE character including every fingertip, hair, soles and cape hem, with ample clear margin. Exactly the same pixel height, same scale, upright vertical axis and ground baseline relative to each cell. Front and back have identical widths and proportions. The side panels must be true opposite profiles of this SAME pose, not three-quarter views and not copies facing the same direction. LEFT shows the character's anatomical left side; RIGHT shows his anatomical right side. Use consistent flat orthographic camera projection, no perspective, no camera roll, no foreshortening.

POSE:
Neutral bind T-pose in EVERY view, both upper arms extended exactly horizontally at shoulder height, elbows straight, wrists straight, open hands with fingers relaxed and slightly separated, palms facing down. Legs straight, feet parallel hip-width apart, soles flat, head level, neutral facial expression, looking along the body's forward axis. Side views are genuine 90 degree camera rotations around the exact same fixed T-posed body: the outstretched arms project along the viewing axis and may naturally overlap; DO NOT bend the arms down or change to A-pose just to reveal the torso. No pose differences between panels.

LOCKED CHARACTER DESIGN IN ALL FOUR PANELS:
One adult fair-skinned white male in his early forties, short slicked-back golden blond hair with a consistent side part and hairline, blue eyes, clean shaven angular face, strong jaw. Athletic muscular build with believable human anatomy and consistent body and head proportions, approximately eight heads tall, no exaggerated bodybuilder physique.
Deep navy blue fitted superhero suit with fine small-scale woven/hex texture, high fitted collar edged in muted gold, consistent chest, abdomen, hip, elbow and knee seam layout and panel shapes. Matching ornate antique gold eagle-shaped shoulder pieces, rigid and symmetrical, identical sculpted shapes and mounting points in every view. Recognizable centered gold belt with eagle motif and matching belt width all around. Long dark crimson red fitted gloves extending over the forearms to just below the elbows, identical cuff height and subtle seam placement on both arms. Matching knee-high dark crimson boots with consistent restrained gold trim, toe shape, shaft height, low heel and sole thickness. No weapons, no added jewelry.
A single American-flag cape attached at the same two gold shoulder mounts behind the neck, hanging calmly by gravity down the back, hem at lower calf height above the boots' soles. In back view clearly show the blue canton with small white stars at the upper portion and consistent red/ivory vertical stripe construction down the length of the cape. Keep cape dimensions, mount spacing, stripe width/count, pattern orientation, hem height, material thickness and soft vertical folds the same across back and profiles. Show only the physically visible cape edges in front view, without wrapping it around the legs or arms. Cape stays behind the body, no wind, no flutter, no extra cape. Profiles consistently reveal the SAME cape hanging slightly clear behind the back.

RENDERING:
Professional realistic game character reference, full material color, fine garment detail, neutral diffuse studio illumination equally balanced from front and back, minimal contact shadow, sharp silhouette and surface details. No strong directional shadows, no cinematic grading, no glowing eyes or lasers. Every panel must look like an orthographic render of one identical textured 3D model simply rotated by exactly 90 degrees, not four different concept variations. Give precision and cross-view consistency priority over drama. Avoid cropped limbs, clipped fingers, extra digits, extra limbs, mismatched faces, changed hair, changed costume details, perspective and heroic poses. Prefer a large square canvas suitable for detailed inspection.
```

