# 拟真视觉改版 · 2026-10-10

用户已授权整体增强拟真感，参考原版 [UNDEFEATED（Steam App 1116960）](https://store.steampowered.com/app/1116960/UNDEFEATED/)。此改版覆盖先前的方块人物风格决定。

## 目标

- 主角与 NPC 使用正常成人比例、平滑人体网格、蒙皮骨骼和可见面部；主角保持金发、蓝战衣、红披风。
- 飞行增加前倾、转向倾身、悬停和腿部姿态，披风随速度展开；高速镜头适量拉远，保持瞄准稳定。
- 城市使用约 3 米层高的立面、玻璃反射、混凝土与沥青表面细节、屋顶设备和街道陈设，避免巨型窗户与玩具比例。
- 白天蓝天、柔和远景雾、接触阴影与环境反射；能量效果保持清晰，颜色与场景统一。
- 浏览器本地运行、四种能力、无敌、破坏、NPC 与三级追捕按原玩法继续验收。

## 素材选择

采用 MakeHuman/MPFB2 官方 CC0 的 hm08 人体网格、男性/肌肉形变和游戏骨骼权重。官方皮肤、短发、眼睛、NPC 衣服与主角靴子从原作者公开系统素材包中提取。生成 53 骨骼的本地 GLB，包含人体材质分区和拟合的独立服装网格，9 段动作由本项目制作。模型是正式接入角色，运行时不依赖在线服务或账号。详细出处、输入与转换方式见 [ASSETS.md](./ASSETS.md)。

- [官方资产许可](https://static.makehumancommunity.org/about/license.html)
- [官方基础网格](https://raw.githubusercontent.com/makehumancommunity/mpfb2/master/src/mpfb/data/3dobjs/base.obj)
- [官方系统素材包](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html)

## 执行清单

- [x] 核验参考游戏、人体基础网格与许可
- [x] 导出蒙皮人形、服装分区、皮肤/头发与动画
- [x] 接入主角和 NPC，验证独立骨架与双眼挂点
- [x] 改善飞行姿态、披风、镜头与能量反馈
- [x] 改善城市立面、材质、天空和灯光
- [x] 浏览器截图审查、玩法回归、性能与重置检查

完成证据见 [VISUAL_VALIDATION.md](./VISUAL_VALIDATION.md)，含最终资产短时采样、完整持续运行与测试顺序。

## 参考观察与工程决定

参考截图显示正常成人轮廓、前倾飞行、玻璃幕墙、混凝土梁与蓝天。项目将这些作为比例、姿态与材质的标准；具体建筑与角色采用本项目有授权的素材制作。
