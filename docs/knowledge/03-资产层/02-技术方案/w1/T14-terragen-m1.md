---
文档编号: DOC-AST-02-014
标题: T14 地形生成（M1 版）
类型: 方案
状态: 现行
日期: 2026-08-27
作者: my-world 项目组
描述: T14 地形生成（M1 版）——W1 波次任务卡：目标、独占文件、交付物与验收标准
标签: [任务卡, W1, 多Agent]
---

# T14 地形生成（M1 版）

波次: W1（6 并发）| 前置: W0 完成

## 目标
纯函数地形生成器。M1 版只需简单可跑的地形，完整版 W4 由 T41 在本文件内升级（签名不变）。

## 独占文件
- src/world/terragen.ts
- tests/terragen.test.ts

## 契约引用
- 02-技术层/05-接口文档/interfaces.md §8（initTerrain/createChunkData/applyDiffs/surfaceHeight/isTreeColumn 五个导出签名照抄）

## M1 版实现要求
1. `initTerrain(seed)`：用 hashStr→mulberry32 构建 2 个 simplex 噪声（simplex-noise 包 createNoise2D(rng)）：大陆 cont(freq 0.008)、细节 hills(freq 0.03)
2. `createChunkData(cx,cz)`：高度 `h = SEA_LEVEL + floor(cont*8 + hills*3)`
   - y=0 BEDROCK；y< h-3 STONE；(h-3,h) DIRT；y=h GRASS（若 h<SEA_LEVEL 则表层 SAND 且上方填 WATER 至 SEA_LEVEL）
   - 不需要矿石/树/生物群系（W4 加）
3. `applyDiffs(data, diffs)`：遍历 Map 应用 blockId 覆盖
4. surfaceHeight/isTreeColumn：M1 版 isTreeColumn 直接 false，surfaceHeight 与生成公式一致（含水面向 SEA_LEVEL 回退）
5. **禁止 import three**；噪声函数闭包在模块级状态（initTerrain 初始化），createChunkData 保持参数只有 cx,cz

## 验收标准
- 确定性：同 seed 两次 generateChunkData(3,7) 结果逐字节一致
- 高度连续性：相邻列 surfaceHeight 差 ≤3（除 cliff 外抽样 100 对通过率 >95%）
- sea 规则：h<SEA_LEVEL 的列，SEA_LEVEL..h+1 之间为 WATER 或 SAND 正确分层

## 自测命令
`npx vitest run tests/terragen.test.ts`
