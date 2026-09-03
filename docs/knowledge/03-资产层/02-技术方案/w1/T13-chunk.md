---
文档编号: DOC-AST-02-013
标题: T13 Chunk 数据结构
类型: 方案
状态: 现行
日期: 2026-08-27
作者: my-world 项目组
描述: T13 Chunk 数据结构——W1 波次任务卡：目标、独占文件、交付物与验收标准
标签: [任务卡, W1, 多Agent]
---

# T13 Chunk 数据结构

波次: W1（6 并发）| 前置: W0 完成

## 目标
体素世界的基本存储单元。

## 独占文件
- src/world/chunk.ts

## 契约引用
- 02-技术层/05-接口文档/interfaces.md §7（Chunk 类签名照抄；不 import three）

## 交付物
1. Chunk 类：`data = new Uint8Array(CHUNK_W*CHUNK_W*WORLD_H)`；get/set 走 voxelIndex
2. dirty 标记、cx/cz 只读字段
3. 单测：set 后 get 一致；坐标 (15,63,15) 与 (0,0,0) 边界；越界抛 Error 或安全 clamp（二选一并注释说明）

## 验收标准 / 自测命令
`tsc --noEmit` + `npx vitest run tests/chunk.test.ts`
