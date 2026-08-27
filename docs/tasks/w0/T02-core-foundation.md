# T02 核心基座模块

波次: W0（串行，T01 后）| 执行者: 主线程

## 目标
落地全局常量、类型、纯工具函数与事件总线——所有后续任务的依赖底座。

## 独占文件
- src/core/constants.ts / src/core/types.ts / src/core/rng.ts / src/core/events.ts
- tests 中对应 *.test.ts

## 契约引用
- interfaces.md §1（常量数值、函数签名、GameEvents 键全部照抄实现）

## 交付物
1. constants.ts：契约 §1 全部常量 + voxelIndex/worldToChunk/localCoord/chunkKey 四个函数
2. types.ts：ToolType/Vec3/AABBox/BlockHit/MeshArrays 类型定义
3. rng.ts：`mulberry32(seed: number): () => number` PRNG；`hashStr(s: string): number`（字符串→种子）；`hash2(x,z)`,`hash3(x,y,z)` 整数坐标确定性哈希 [0,1)
4. events.ts：泛型 EventBus 类 + GameEvents 类型映射（契约 §11 约定的键）

## 验收标准
- `npx tsc --noEmit` 零错误
- rng/events 单测绿：同 seed 输出序列一致；EventBus on/emit/off 生效
- worldToChunk(-1)==-1；localCoord(-1)==15（负数边界）

## 自测命令
`npx vitest run tests/rng.test.ts tests/events.test.ts`
