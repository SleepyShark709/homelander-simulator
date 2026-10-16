# 祖国人 T-pose 单张主视图 · v1

生成日期：2026-10-16。

- 图像：[homelander-tpose-main-view-v1.png](./homelander-tpose-main-view-v1.png)。
- 用途：按用户要求，将四视图参考改为供 Tripo 单图建模使用的一张正面 T-pose 主视图。
- 原始尺寸：1254 × 1254，PNG，保留原始输出。
- 参考输入：[原四视图](./homelander-tpose-four-views-v1.png)左上正面角色；重新生成单张清晰主视图。
- 生成工具：内置 `image_gen.imagegen`，以本地四视图为参考；工具未提供可核验的底层模型版本。
- 视觉检查：单人、单一正面、双臂水平 T-pose；头顶、双手、双脚完整；白色背景，无文字。主代理和独立视觉核验确认蓝衣、红手套/靴子/披风、金色肩饰与腰带延续参考图。
- 状态：图像已保存；本轮未向 Tripo 上传或生成 3D 模型。

## 完整生成提示词

```text
Use case: identity-preserve.
Asset type: a SINGLE main-view input image for image-to-3D character modeling in Tripo.
Input image 1 is a CHARACTER DESIGN REFERENCE ONLY: a four-view reference sheet of Homelander. Use the FRONT character in its TOP LEFT panel as the exact identity, costume and body-proportion master.

Generate a fresh clean high-detail full-body render of that exact same character, by himself, in a straight-on FRONT orthographic T-pose. One person, ONE view, one continuous image. Fill a square canvas efficiently while leaving clear white margins around the hair, fingertips and soles. Every fingertip and both boots must be completely inside the frame. No grid, no panels, no labels, no text, no watermark, no extra characters or detail callouts.

Preserve the reference character's face and slicked-back golden blond hairstyle, mature clean-shaven angular face, athletic believable human proportions, navy woven-texture fitted superhero suit, red-and-gold high collar, two matching gold eagle shoulder pieces, gold eagle belt buckle, long crimson red forearm gloves, and knee-high crimson boots with matching gold trim and gold shin emblems. Reproduce the actual clothing seam layout and proportions of the FRONT reference, not a new variation.
Retain the SAME single cape, attached behind the shoulders and hanging calmly down the back to the mid-lower calves; its red outer edges are visible on both sides of the body, with some red and ivory vertical folds behind the gap between the legs. Keep the cape behind the torso and limbs, straight and gravity-hanging, with no wind. Do not spread the cape or let it cover the hands or boots.

Neutral standard bind T-pose: both arms stretched straight horizontally at shoulder height; elbows and wrists straight; palms down; hands open, fingers straight and slightly separated in a natural anatomically correct way. Legs straight, feet parallel at hip width with a clear gap, head level, eyes forward, neutral expression. Symmetrical upright body, no lean or dramatic stance. Camera exactly centered on the front, orthographic, no perspective or three-quarter rotation.

Studio asset render with sharp garment details, consistent realistic colors, neutral soft even lighting, clear silhouette, no hard shadows or baked dramatic highlights. Background uniform pure white with no horizon, floor graphics or scenery, only an extremely subtle contact shadow directly under the soles if needed. Make this a large high-resolution single-character modeling reference rather than a crop of the original low-resolution panel.
```

