# W1 东北 + 京津冀（6 区）

波次: W1（2 并发）| 前置: W0 契约全部冻结

## 目标
东北三省拆分（黑龙江/吉林/辽宁）+ 京津冀（北京增强/天津/河北）落地，首波检验「1 parts + 1 buildings + 1 测试」所有权模型与 anchorMargin 大半径机制。

## 波内共同约定
- 植被只复用 8 种 TreeKind（不动 CANOPY_R/MARGIN）；动物只用 9 物种改权重；东北两区 animalGround 含 SNOW
- 高度一律 `topClamp`（≤62）；结构/植被 stamp 决策只读 (锚点哈希, 地形公式)，绝不读 chunk
- 测试写到 `tests/regions/<组>.test.ts`，每区 ≤6 用例 + 显式 timeout

## Agent 分工

| Agent | 独占文件 | 产出 | 验收标准 |
|---|---|---|---|
| A1 东北 | src/data/regions/parts/dongbei.ts、src/world/buildings/northeast.ts、tests/regions/dongbei.test.ts | heilongjiang / jilin / liaoning 三个 RegionDef（雪原：低 ridgeAmp + SNOW 表层 + spruce 树表）；3 个 stamp：sophia_church 索菲亚教堂（r5，红砖墙+绿洋葱穹顶）、chaoxian_house 朝鲜族民居（r4，黛瓦）、dazhengdian 大政殿（r5，八角重檐攒尖）；常见复用 snow_cabin；虎仅黑吉且 weight ≤0.05 | 同 seed 确定性；3 kind 特征方块断言（FEATURE_BLOCK）命中；跨 chunk 双算一致；dongbei 旧档参数零扰动 |
| A2 京津冀 | src/data/regions/parts/jingjinji.ts、src/world/buildings/jingjin.ts、tests/regions/jingjinji.test.ts | beijing 增强（structures 表追加 qinianden 祈年殿 r6，圆形三重檐攒尖+蓝琉璃，cellDensity ~0.02；地形/植被字段不动）、tianjin（eyed_wheel 天津之眼 r6 跨河摩天轮 Ø11 环+辐条+吊舱；xiaoyanglou 五大道小洋楼 r4）、hebei（zhaozhou_bridge 赵州桥 r7 敞肩石拱桥+WHITE_STONE）；北京常见复用 siheyuan | 同上 + 大半径 kind（r6/r7）anchor 落点含 anchorMargin 边距断言；旧 6 区黄金回归不破 |

## 依赖
- W0：kit 工具、classic、四张表 50 kind、switch 分发已就位；35 个 RegionId、34 色选区图可点选本波区域
- 本波两 agent 文件互斥，无交叉；波末主线程串行集成

## 验收命令
```bash
npx tsc --noEmit
npx vitest run tests/regions tests/structures tests/blocks tests/atlas tests/terragen tests/regionPicker
# 波末（主线程串行）
npm test && npm run build
npm run dev   # 冒烟：进 1 个大建筑区（hebei 赵州桥 r7）+ 旧 6 区黄金回归
```
