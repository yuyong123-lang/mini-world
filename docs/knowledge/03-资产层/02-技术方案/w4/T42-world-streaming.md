---
文档编号: DOC-AST-02-022
标题: T42 World 流式加载中枢
类型: 方案
状态: 现行
日期: 2026-08-27
作者: my-world 项目组
描述: T42 World 流式加载中枢——W4 波次任务卡：目标、独占文件、交付物与验收标准
标签: [任务卡, W4, 多Agent]
---

# T42 World 流式加载中枢

波次: W4（5 并发）| 前置: W3 完成

## 目标
以玩家为中心的无限世界调度：加载/卸载/diff 记录/raycast 委托 DDA。

## 网关文件
- src/world/world.ts
- tests/world.test.ts

## 契约引用
- 02-技术层/05-接口文档/interfaces.md §7 World 类签名照抄；RENDER_RADIUS 6 / LOAD 7 / UNLOAD 9 / 帧预算（≤2 生成+≤1 mesh/帧）

## 交付物
1. constructor(seed)：diffs Map、chunk Map、spawnPoint = (8, findSpawnY(8,8), 8)
2. ensureArea(px, pz, budgetPerFrame)：
   - 扫描 LOAD_RADIUS 环形区域缺失 chunk → 入 pendingQueue 按 dist 排序
   - 每帧处理 ≤budget 个：createChunkData → applyDiffs(玩家 diff + …) → 构造 Chunk；随后 mesher 对 dirty 队列重建网格 ≤1/chunk 帧（调用渲染器挂载经回调注入的 meshSink 回调 `onChunkReady(chunk, opaque, water)`）
   - UNLOAD_RADIUS 外 dispose meshes + 移除引用
3. getBlock/setBlock/isSolid：未加载 chunk 返回 AIR/isSolid false；setBlock 写 diffs["cx,cz"]、标脏自身；若 lx==0/15 或 lz==0/15 则对应邻 chunk 也标脏
4. raycast：委托 player/interact.ddaRaycast 纯函数（避免重复实现）
5. findSpawnY(x,z)：surfaceHeight 与已加载数据取 max，+2
6. tick(playerPos)：调 ensureArea(budget=2)

> 关键设计：mesher/renderer 的调用点通过回调注入（onChunkReady / onChunkUnload），World 不 import three/mesher 之外的渲染模块。M1 的临时静态生成逻辑届时由 main.ts 改为调 world.ensureArea。

## 验收标准
- 单测（用内存 fake world sink）：ensureArea 每帧预算不超限；离场后 chunk 卸载；setBlock 的 diff 记录键值正确；lx==0 时邻 chunk 标脏
- tsc --noEmit 零错误

## 自测命令
`npx vitest run tests/world.test.ts`
