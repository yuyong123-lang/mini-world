---
文档编号: DOC-AST-02-021
标题: T41 地形生成完整版
类型: 方案
状态: 现行
日期: 2026-08-27
作者: my-world 项目组
描述: T41 地形生成完整版——W4 波次任务卡：目标、独占文件、交付物与验收标准
标签: [任务卡, W4, 多Agent]
---

# T41 地形生成完整版

波次: W4（5 并发）| 前置: W3 完成（terragen 已存在 M1 版）

## 目标
升级 terragen 到完整版：山脉/海洋/沙滩/沙漠/雪原/矿脉/树。签名不变。

## 独占文件
- src/world/terragen.ts（在 M1 版基础上重写内部实现）
- tests/terragen.test.ts（扩充用例）

## 契约引用
- 02-技术层/05-接口文档/interfaces.md §8 五导出不变；01-项目层/03-架构设计/architecture.md §2.4 公式与参数全按文档执行

## 交付物
1. 新增第三个噪声（山脊 ridge：`1 - |noise|`，freq 0.01）+ 温度噪声（偏移种子，freq 0.0015）
2. 高度公式：`h = SEA+4 + cont*6 + hills*3 + smoothstep(0.25,0.65,cont)*ridge^1.6*26`
3. 生物群系判定 + 表层方块：
   - `t > 0.55 && h > SEA+1` → 沙漠: SAND 表层 ×4 深、无树
   - `t < -0.55 || h > 52` → 雪: SNOW 表层
   - 否则草地 GRASS
4. 矿石：hash3 阈值法（确定性），煤 y∈[8,48] p~1.2%、铁 y∈[4,32] p~0.8%、金 y∈[2,16] p~0.35% 替换 STONE
5. 树：isTreeColumn(x,z) = hash2(x,z)<p 且该列是草地表面且坡度允许；树干 LOG 高 4-6(hash 决定)；
   叶球半径 2（相对干顶两层结构）。**跨 chunk 边界的树叶块也必须生成**——本 chunk 内凡是落在树影响范围内的体素都计算（允许其他 chunk 的树的叶伸进来：对每列检查邻近 ±2 范围内是否存在 isTreeColumn 列并由此推导叶子位置）
6. applyDiffs 在最后应用（玩家改动最优先）

## 验收标准
- 同 seed 确定性不变；测 chunks (0,0),(5,-3),(-7,7) 数据一致
- 海洋：抽 h<SEA 的列水柱完整至 SEA_LEVEL
- 抽样 400 列：沙漠区无树、雪原表层 SNOW、草地表层 GRASS 正确率 >98%
- 树连通性：任一 LOG 方块的相邻列上方存在其配套 LEAVES（抽样 50 棵）

## 自测命令
`npx vitest run tests/terragen.test.ts`
