# W5 中南（6 区）

波次: W5（3 并发）| 前置: W4 完成（波末集成 commit 后）

## 目标
中南六区（湖北/湖南 + 广东/广西/海南 + 台湾），含 3 座高塔（广州塔 ~28 格 / 台北101 ~28 格）与 r8 风雨桥。

## 波内共同约定
- 沿海/岛屿地形压平（低 ridgeAmp）防高塔削顶；海南 animalGround 含 SAND、孔雀入滇琼
- 植被复用 8 种 TreeKind（岭南 banana/palm 组合）；高度一律 `topClamp`（≤62）
- 测试写到 `tests/regions/<组>.test.ts`，每区 ≤6 用例 + 显式 timeout

## Agent 分工

| Agent | 独占文件 | 产出 | 验收标准 |
|---|---|---|---|
| A1 中南1 | src/data/regions/parts/mid1.ts、src/world/buildings/mid1.ts、tests/regions/mid1.test.ts | hubei（yellow_crane 黄鹤楼 r5，五层攒尖金飞檐 YELLOW_TILE；常见复用 house）、hunan（diaojiaolou 湘西吊脚楼 r4 DARK_WOOD 即标志 + yueyang_pavilion 岳阳楼 r4 三层盔顶）；3 个 stamp | 同 seed 确定性；3 kind 特征方块断言命中；跨 chunk 双算一致 |
| A2 中南2 | src/data/regions/parts/mid2.ts、src/world/buildings/mid2.ts、tests/regions/mid2.test.ts | guangdong（canton_tower 广州塔 r4 细腰扭转塔 ~28 格 + qilou 骑楼街 r5 RED_BRICK 柱廊）、guangxi（wind_rain_bridge 程阳风雨桥 r8，石墩+木廊+桥头亭 + ganlan_house 干栏式木楼 r4 THATCH 顶）、hainan（**全复用无新 stamp**：常见 diaojiaolou、稀有 qilou）；4 个 stamp | 同上 + 高塔削顶断言（广州塔顶 ≤62）；r8（wind_rain_bridge）anchorMargin=8 断言、footprint 不跨 cell；hainan 只写 RegionDef 复用 kind |
| A3 台湾 | src/data/regions/parts/taiwan.ts、src/world/buildings/taiwan.ts、tests/regions/taiwan.test.ts | taiwan（taipei_101 台北101 r3，竹节退台 ~28 格 steppedTower + minnan_house 闽南红砖古厝 r4 RED_BRICK 即标志）；2 个 stamp | 同上 + 高塔削顶断言；旧 6 区黄金回归不破 |

## 依赖
- W4 完成（波次串行推进）
- W0 冻结的 kit（steppedTower/topClamp）/四张表/switch 分发；本波只用 §4 第 4 步（写函数）+ 特征断言
- 三 agent 文件互斥；波内禁并行跑全量测试（波末主线程串行集成）

## 验收命令
```bash
npx tsc --noEmit
npx vitest run tests/regions tests/structures tests/blocks tests/atlas tests/terragen tests/regionPicker
# 波末（主线程串行）
npm test && npm run build
npm run dev   # 冒烟：进 1 个大建筑区（广西风雨桥 r8 / 广东广州塔）+ 旧 6 区黄金回归
```
