---
文档编号: DOC-AST-02-027
标题: T52 M2 集成：合成链验收补全
类型: 方案
状态: 现行
日期: 2026-08-27
作者: my-world 项目组
描述: T52 M2 集成：合成链验收补全——W5 波次任务卡：目标、独占文件、交付物与验收标准
标签: [任务卡, W5, 多Agent]
---

# T52 M2 集成：合成链验收补全

波次: W5（串行续接 T51）| 前置: T51 完成

## 步骤
1. 检查配方面板打开条件：对 CRAFT_TABLE 叫键 → CraftUI.open(mode 3)（T23 已提供 onUseCraftTable 回调）
2. 配方解锁验证清单（人工过一遍，不通处修复）：
   - LOG → 4 PLANKS（随身 2×2 可做）
   - PLANKS×4 → CRAFT_TABLE（2×2）
   - 放置工作台右键 → 3×3：木镐(3板2棍T形)、木斧、木剑(2板1棍)
   - 采 COBBLE → 石镐(3圆石2棍)、石剑 → 能采铁矿(minTier=2 通过)
   - STICK 由 2 板竖排出 4 根
3. 修补发现的断裂点（允许动 items.json/recipes.json/crafting.ts 的映射问题级别缺陷）
4. 顺手统一 toast 文案为中文

## M2 补充验收
- [ ] 石镐可以挖 ORE_IRON 且掉 ITEM_RAW_IRON
- [ ] 2×2 无法合成木镐（size 门禁生效）
- [ ] 工作台上的合成在关面板后格内材料退回背包

## 完成动作
git commit --amend 或单独 commit 均可
