# W0 契约波（34 省扩展 · 基础设施）

波次: W0（5 并发，波末主线程串行集成）| 前置: 无 | 状态: 执行中

> 完成记录:（空——各 Agent 完成后由主线程逐项打勾）

## 目标
一次冻结全部基础设施，使 W1-W6 可在**零交叉文件**下并发（每 agent 恰好 1 parts + 1 buildings + 1 测试）：

- 10 个新方块（id 37-46 / tile 98-107，全部 `drop:null` → items/recipes 零改动）
- structures.ts 收缩为内核（锚点/校验/四张 Record 表 50 kind/switch 分发）+ buildings/ 拆分（kit + classic + 14 组骨架），旧 7 stamp 几何逐字节不变
- regions.ts 拆目录（index + parts/legacy 冻结 + 14 组占位 + 35 个 RegionId 一次写全）
- 选区像素图扩 34 色块 + main.ts VALID 派生化
- 本套契约与任务卡文档

契约依据：[contracts/buildings.md](../contracts/buildings.md)（kit 清单/铁律/anchorMargin/接入四步）。

## Agent 分工

| Agent | 独占文件 | 产出 | 验收标准 |
|---|---|---|---|
| A1 方块 | src/data/blocks.json、src/blocks/registry.ts、src/blocks/atlas.ts、tests/blocks.test.ts、tests/atlas.test.ts | 10 新方块（WHITE_STONE/RED_BRICK/BLUE_TILE/GREEN_TILE/DARK_TILE/CONCRETE/GLASS_CURTAIN/DARK_WOOD/THATCH/PASTEL_WALL，tile 98-107）；BLOCK 表与 ATLAS_TILES/PAINTER_TABLE/EXPECTED_TILES 三处**同 commit 同步** | `vitest run tests/blocks tests/atlas` 绿（count 37→47 断言过）；GLASS_CURTAIN 与 GLASS 同透明通道（opaque:false） |
| A2 结构内核 | src/world/structures.ts、src/world/buildings/**（kit.ts、classic.ts、14 组骨架）、tests/structures.test.ts | 内核：MAX_STRUCT_RADIUS 6→8（仅扫描边距）+ `anchorMargin` 导出 + 四张表（FOOTPRINT_R/SLOPE_TOLERANCE/KIND_SALT/FEATURE_BLOCK）50 kind 一次写全 + switch 分发；kit 10 工具（contracts §2）；classic 纯搬家；14 组骨架=导出全部本组 stamp 函数（函数体占位空实现） | `vitest run tests/structures tests/terragen` 绿：旧 7 stamp 黄金断言逐字节过；锚点边距断言改用 `anchorMargin(kind)`；旧世界锚点逐位不变 |
| A3 regions 拆目录 | src/data/regions.ts → src/data/regions/{index.ts, parts/*.ts}、tests/regions.test.ts | index：全部类型 + seed 解析 + 活动区域状态 + `REGIONS` 聚合（`...legacy, ...groupDongbei, ...` **一次写全 14 组**）；parts/legacy.ts：generic + 旧 6 区**逐字冻结**（dongbei「在表不在图」，ICE 水面/spruce/盐值 0x77 原样）；14 组占位文件（导出空组对象）；35 个 RegionId 全写 | 路径 `../data/regions` 的全部引用方零改动（tsc 全绿）；`vitest run tests/regions` 黄金用例原样过 |
| A4 选区图 | src/ui/regionPicker.ts、src/main.ts（仅 consumeNextRegionId）、tests/regionPicker.test.ts | 34 色块像素图（区域码 `'2'..'9'+'a'..'z'` 恰 34 槽；col=(lon−73)/1.29°, row=(54−lat)/0.9°；港澳京津沪 2×2 微块手嵌；CELL 6→7）；模块级硬校验（行宽/码集/每码 ≥2 像素且 4-连通，画错启动即抛）；main.ts 的手写 VALID Set 改 `new Set(Object.keys(REGIONS))` | `vitest run tests/regionPicker` 绿（纯数据校验，node 可安全 import）；PICKABLE 派生继续成立 |
| A5 文档 | docs/tasks/w0-contract.md ~ w7-final.md、docs/contracts/buildings.md、docs/architecture.md §6、docs/contracts/conventions.md §8-§9 | 本套增量文档（波次卡 8 张 + 契约 + 架构增补 + 规则追加） | 与计划文件第四节波次表一致；主线程评审通过 |

## 依赖
- A1 → A2（FEATURE_BLOCK/新 stamp 引用新方块 id）
- A3 → A2/A4（StructureKind/RegionId 类型；Object.keys(REGIONS) 派生）
- A1/A2/A3 之间以本卡为准并行开发，类型冲突由 A3 的 RegionId 全集先落地消解（A3 优先合入）

## 波内共同约定（W1-W6 沿用）
- 每波验收：`npx tsc --noEmit` + `vitest run tests/regions tests/structures tests/blocks tests/atlas tests/terragen tests/regionPicker`
- 波末主线程串行集成：全量 `npm test`（Windows 负载噪声假超时重跑即过）+ `npm run build` + dev 冒烟（含 1 个大建筑区）+ 旧 6 区黄金回归
- 波内禁并行跑全量测试；冻结文件后续波次禁改（conventions.md §9）

## 验收命令
```bash
npx tsc --noEmit
npx vitest run tests/regions tests/structures tests/blocks tests/atlas tests/terragen tests/regionPicker
# 波末（主线程串行）
npm test && npm run build
```

> 备注：计划文件 W0 行写「9 个 buildings 骨架」为早期数字，以第四节波次表 **14 组**为准。
