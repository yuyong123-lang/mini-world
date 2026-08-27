# T101 Web Worker 迁移

波次: W10（4 并发）| 前置: W9 完成。本波 T101 **独占** world.ts 的修改权。

## 目标
terragen/mesher 移入 Worker，主线程只剩几何上传。

## 独占文件（本波互斥，其他任务勿动 world.ts）
- src/workers/worldgen.worker.ts（新建：import terragen/mesher，消息协议处理）
- src/world/world.ts（改为通过 worker 请求 chunk 数据）
- 主线程侧接收逻辑（world.ts 内部）

## 设计
1. 消息协议：
   - 主→worker: `{type:'init', seed}` | `{type:'gen', cx, cz, diffs: Array<[index,id]>}`
   - worker→主: `{type:'chunk', cx, cz, data: Uint8Array}` | `{type:'mesh', cx, cz, opaque: MeshArrays, water}` 
   - worker→worker 内部流程：gen 完成 → 立即 mesh（邻居数据缺失时用 terragen 直算邻居数据临时填充——纯函数可重入）
   - 注意结构化克隆传输 TypedArray 用 transferable 提高性能：postMessage(..., [buffers])
2. world.ts 改造：
   - ensureArea 发 gen 请求而非同步生成；帧预算照旧（发出请求数 ≤2/帧）
   - 收到结果后走原 meshSink 回调路径不变
   - **降级开关 Settings.workersOff == true 时回退旧同步路径**（代码保留同步分支）
3. meshChunk 需要邻居数据——worker 内维护最近生成的 chunk 数据缓存 Map<key, Uint8Array>（LRU ~256 个），缺失时用 terragen 现算邻 chunk 数据
4. 单测：worker 协议层用 vitest mock（import.meta.host 不支持真 worker 的环境下只测序列化往返正确性）

## 验收标准
- 开 worker 后功能等同 M4 结束状态；冷启动加载速度不劣化
- workersOff 降级开关功能完整

## 自测命令
`npx tsc --noEmit` + `npx vitest run`（全量回归）
