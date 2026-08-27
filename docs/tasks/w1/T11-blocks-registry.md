# T11 方块注册表

波次: W1（6 并发）| 前置: W0 完成

## 目标
实现方块注册表与 blocks.json 数据。

## 独占文件
- src/blocks/registry.ts
- src/data/blocks.json

## 契约引用
- interfaces.md §2（BlockDef/BlockRegistry 签名照抄）、§3（19 种方块属性全表——**逐行照抄**，不要自己调数值）

## 交付物
1. registry.ts：类型守卫 `isValidBlockDef`、`BlockRegistry.load/get/byKey/count`
2. blocks.json：§3 全表 19 条目，含 tex tile 序号（从 §4 表查）
   - 注意：GRASS 的 drop 是 "ITEM_DIRT"（特例）；LEAVES 特殊处理 drop 为 "ITEM_APPLE"(20%)/无(80%)由掉落逻辑实现，JSON 里写 `"drop": null`；GLASS drop null
3. 单测：加载后 get(0).key=='AIR'；byKey('STONE').minTier==1；count()==19

## 验收标准 / 自测命令
`tsc --noEmit` 零错误 + `npx vitest run tests/blocks.test.ts`
