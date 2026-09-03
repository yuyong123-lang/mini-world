---
文档编号: DOC-AST-02-003
标题: W2 黄河 + 蒙宁（6 区）
类型: 方案
状态: 现行
日期: 2026-09-01
作者: my-world 项目组
描述: W2 波次任务卡：W2 黄河 + 蒙宁（6 区）——Agent 分工、独占文件与波次验收标准
标签: [任务卡, W2, 多Agent]
---

# W2 黄河 + 蒙宁（6 区）

波次: W2（2 并发）| 前置: W1 完成（波末集成 commit 后）

## 目标
黄河中下游四省（晋/鲁/豫/陕）+ 内蒙古增强 + 宁夏，共 6 区。

## 波内共同约定
- 植被复用 8 种 TreeKind；动物 9 物种改权重；西北方向区域 animalGround 含 SAND
- 高度一律 `topClamp`（≤62）；未列新 kind 的常见建筑一律复用既有 kind（青瓦/青砖/黄土民居 → house，四合院 → siheyuan）
- 测试写到 `tests/regions/<组>.test.ts`，每区 ≤6 用例 + 显式 timeout

## Agent 分工

| Agent | 独占文件 | 产出 | 验收标准 |
|---|---|---|---|
| A1 黄河 | src/data/regions/parts/huanghe.ts、src/world/buildings/huanghe.ts、tests/regions/huanghe.test.ts | shanxi（yingxian_pagoda 应县木塔 r5，八角五层木塔 DARK_WOOD；常见复用 siheyuan）、shandong（confucius_hall 孔庙大成殿 r5 重檐歇山 + seaweed_house 胶东海草房 r4 THATCH 即标志）、henan（pagoda_forest 少林塔林 r7 一注多小方塔群；常见复用 house）、shaanxi（dayan_pagoda 大雁塔 r4 七层方形砖塔；常见复用 siheyuan）；共 5 个 stamp | 同 seed 确定性；5 kind 特征方块断言命中；跨 chunk 双算一致；r7（pagoda_forest）anchorMargin 边距断言 |
| A2 蒙宁 | src/data/regions/parts/mengning.ts、src/world/buildings/mengning.ts、tests/regions/mengning.test.ts | neimenggu 增强（structures 表追加 aobao 敖包 r3，石堆圆台+旗杆；蒙古包 yurt 不动）、ningxia（towers_108 108塔群 r7 阶梯三角排列白塔 + WHITE_STONE；常见复用 house）；2 个 stamp | 同上 + neimenggu 既有结构判定零扰动（新 kind 独立 KIND_SALT）；旧 6 区黄金回归不破 |

## 依赖
- W1 完成（波次串行推进，避免同轮全量测试互扰）
- W0 冻结的 kit/四张表/switch 分发；本波只用 §4 第 4 步（写函数）+ 特征断言

## 验收命令
```bash
npx tsc --noEmit
npx vitest run tests/regions tests/structures tests/blocks tests/atlas tests/terragen tests/regionPicker
# 波末（主线程串行）
npm test && npm run build
npm run dev   # 冒烟：进 1 个大建筑区（henan 塔林 / 宁夏 108塔）+ 旧 6 区黄金回归
```
