# W3 西域高原（4 区）

波次: W3（2 并发）| 前置: W2 完成（波末集成 commit 后）

## 目标
西域（新疆增强/甘肃）+ 青藏高原（西藏/青海），共 4 区；含两个 r8 最大体量建筑（嘉峪关/布达拉宫）。

## 波内共同约定
- 青藏区域 animalGround 含 SNOW、西北含 SAND；植被复用 8 种 TreeKind
- 依山建筑用高 SLOPE_TOLERANCE（potala 4）；高度一律 `topClamp`（≤62）
- 测试写到 `tests/regions/<组>.test.ts`，每区 ≤6 用例 + 显式 timeout

## Agent 分工

| Agent | 独占文件 | 产出 | 验收标准 |
|---|---|---|---|
| A1 西域 | src/data/regions/parts/xiyu.ts、src/world/buildings/frontier.ts、tests/regions/xiyu.test.ts | xinjiang 增强（structures 表追加 sugong_tower 苏公塔 r3，圆柱土黄砖塔+锥顶；绿洲农庄 oasis_farm 不动）、gansu（jiayuguan 嘉峪关 r8，关城城楼+城墙延伸段；常见复用 house 黄土民居）；2 个 stamp | 同 seed 确定性；2 kind 特征方块断言命中；跨 chunk 双算一致；r8（jiayuguan）anchorMargin=8 边距断言、footprint 不跨 cell |
| A2 藏区 | src/data/regions/parts/zang.ts、src/world/buildings/tibet.ts、tests/regions/zang.test.ts | xizang（potala 布达拉宫 r8，依山白宫+红宫+金顶，宽 ~16 格，SLOPE_TOLERANCE=4；zangdiaofang 藏式碉房 r4 即常见）、qinghai（babao_pagodas 塔尔寺八宝塔群 r7 一排白塔 + WHITE_STONE；常见复用 zangdiaofang）；3 个 stamp（zangdiaofang 两区共用） | 同上 + 坡地锚点宽容断言（高差 4 仍可落地）；r7/r8 anchorMargin 断言；旧 6 区黄金回归不破 |

## 依赖
- W2 完成（波次串行推进）
- W0 冻结的 kit/四张表/switch 分发；本波只用 §4 第 4 步（写函数）+ 特征断言

## 验收命令
```bash
npx tsc --noEmit
npx vitest run tests/regions tests/structures tests/blocks tests/atlas tests/terragen tests/regionPicker
# 波末（主线程串行）
npm test && npm run build
npm run dev   # 冒烟：进 1 个大建筑区（甘肃嘉峪关 / 西藏布达拉宫）+ 旧 6 区黄金回归
```
