---
文档编号: DOC-AST-02-005
标题: W4 华东（6 区）
类型: 方案
状态: 现行
日期: 2026-09-01
作者: my-world 项目组
描述: W4 波次任务卡：W4 华东（6 区）——Agent 分工、独占文件与波次验收标准
标签: [任务卡, W4, 多Agent]
---

# W4 华东（6 区）

波次: W4（2 并发）| 前置: W3 完成（波末集成 commit 后）

## 目标
华东六区（江苏/安徽/江西 + 上海/浙江/福建），含 3 个大体量标志（苏州园林 r7 / 土楼 r7 / 东方明珠高塔）。

## 波内共同约定
- 沿海/城市区域地形压平（低 ridgeAmp）防高塔削顶；高度一律 `topClamp`（≤62）
- 植被复用 8 种 TreeKind（江南 tea/bamboo/pagoda 组合）；动物 9 物种改权重
- 测试写到 `tests/regions/<组>.test.ts`，每区 ≤6 用例 + 显式 timeout

## Agent 分工

| Agent | 独占文件 | 产出 | 验收标准 |
|---|---|---|---|
| A1 华东1 | src/data/regions/parts/east1.ts、src/world/buildings/east1.ts、tests/regions/east1.test.ts | jiangsu（garden_pavilion 苏州园林 r7，亭+廊+月洞门+水池；常见复用 house 青瓦）、anhui（hui_house 徽派马头墙民居 r4，DARK_TILE，即标志）、jiangxi（tengwang_pavilion 滕王阁 r5，多层绿琉璃歇山；常见复用 house）；3 个 stamp | 同 seed 确定性；3 kind 特征方块断言命中；跨 chunk 双算一致；r7（garden_pavilion）anchorMargin 断言 |
| A2 华东2 | src/data/regions/parts/east2.ts、src/world/buildings/east2.ts、tests/regions/east2.test.ts | shanghai（pearl_tower 东方明珠 r5，三球串联塔+天线，高 ~26 格 + shikumen 石库门 r4 PASTEL_WALL）、zhejiang（leifeng_pagoda 雷峰塔 r4，八面五层楼阁塔 DARK_TILE；常见复用 house）、fujian（tulou 圆形土楼 r7 Ø15 ringWall+YELLOW_TILE 顶，即标志）；4 个 stamp | 同上 + 高塔削顶断言（东方明珠顶 ≤62，上海地形压平）；r7（tulou）anchorMargin 断言；旧 6 区黄金回归不破 |

## 依赖
- W3 完成（波次串行推进）
- W0 冻结的 kit（ringWall/steppedTower/topClamp）/四张表/switch 分发；本波只用 §4 第 4 步（写函数）+ 特征断言

## 验收命令
```bash
npx tsc --noEmit
npx vitest run tests/regions tests/structures tests/blocks tests/atlas tests/terragen tests/regionPicker
# 波末（主线程串行）
npm test && npm run build
npm run dev   # 冒烟：进 1 个大建筑区（福建土楼 / 上海东方明珠）+ 旧 6 区黄金回归
```
