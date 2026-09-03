---
文档编号: DOC-AST-02-024
标题: T44 物品/背包/合成系统
类型: 方案
状态: 现行
日期: 2026-08-27
作者: my-world 项目组
描述: T44 物品/背包/合成系统——W4 波次任务卡：目标、独占文件、交付物与验收标准
标签: [任务卡, W4, 多Agent]
---

# T44 物品/背包/合成系统

波次: W4（5 并发）| 前置: W3 完成

## 目标
数据驱动的物品定义、背包容器、配方匹配——资源闭环的规则核心。

## 独占文件
- src/items/items.ts / src/items/inventory.ts / src/items/crafting.ts
- src/data/items.json / src/data/recipes.json
- tests/inventory.test.ts / tests/crafting.test.ts

## 契约引用
- 02-技术层/05-接口文档/interfaces.md §5 ItemDef/ItemStack/ItemRegistry/Inventory 全部签名照抄
- 02-技术层/05-接口文档/interfaces.md §6 Recipe/CraftingMatcher 签名照抄

## 交付物
1. items.json：契约 §5 列出的全部物品（place 类 12 个 + 矿物 3 个 + 食物 APPLE/PORK + 工具 WOOD_PICKAXE/WOOD_AXE/WOOD_SWORD/STONE_PICKAXE/STONE_SWORD + 中间材料 ITEM_STICK）
   - place 字段填对应 BlockDef id；tool 按 §5 数值（木×2/石×4 速度，拳1/木剑5/石剑7 伤害）
   - stackMax：工具=1 其余=64；iconTile 引用契约 §4 图标 tile（工具类暂用彩色纯色块，W10 打磨）
2. inventory.ts：Inventory 类全方法；add 自动堆叠优先同 key 同槽再开新位，满则返回剩余数量
3. crafting.ts：
   - shaped 匹配：把 grid 提取为 itemKey 矩阵 → 裁剪空行空列归一化 → 与 recipe.shaped(map 映射后的标准形) 比对尺寸+逐格
   - shapeless：多重集比对
   - consume：按 matched 形状每格扣 1
4. recipes.json 内置配方（见架构 §2.7）：LOG→4 PLANKS(2×2 shapeless)、PLANKS×4→CRAFT_TABLE(2×2 shaped)、PLANKS×2竖→4 STICK、板棍组合→木镐/斧/剑(3×3)、COBBLE+棍→石镐/石剑(3×3)
5. 单测：堆叠上限、add 跨槽溢出返回、shaped 平移匹配、镜像不匹配（除非声明）、shapeless 顺序无关、consume 扣减正确、3×3 配方在 2×2 里不可合成

## 验收标准 / 自测命令
`tsc --noEmit` + `npx vitest run tests/inventory.test.ts tests/crafting.test.ts`
