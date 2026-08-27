// workers/worldgen.worker.ts —— 地形生成 + 网格化的专用线程（W10/T101）
//
// 依赖前提（architecture §2.3）：terragen / mesher / registry 均为无 DOM、无 three 的
// 纯函数/纯数据模块，可直接在本文件 import，零适配层。
//
// 消息协议见 ../world/worldWorkerBridge.ts（类型与纯逻辑都在那里，worker 只负责接线）：
//   主 → 本 worker: {type:'init', seed} | {type:'gen', cx, cz, diffs, nearby?}
//   本 worker → 主: {type:'chunk', cx, cz, opaque, water, voxels, transfer}
//
// 邻居数据：本线程维护 Map<chunkKey, Uint8Array>（上限 64 条，超过整表清空），
// 缺失时用 terragen 直算补齐——terragen 是确定性纯函数，补算结果与主线程旧同步路径
// 逐位一致，因此网格边界不产生接缝。
//
// 性能：回包走 transferable（voxels + 最多 8 个几何 ArrayBuffer 转移所有权），
// 主线程收到时零拷贝；这是 worker 化收益的大头。
//
// 注意：Vite 以 `new Worker(new URL('../workers/worldgen.worker.ts', import.meta.url),
// { type: 'module' })` 打包本文件；node/vitest 不加载它。

import {
  initWorkerTerrain,
  processGenRequest,
  type MainToWorkerMsg,
} from '../world/worldWorkerBridge';

/** 生成的 chunk 体素数据缓存（key = "cx,cz"）；同时充当 mesher 的邻居数据源 */
const cache = new Map<string, Uint8Array>();

self.onmessage = (ev: MessageEvent<MainToWorkerMsg>): void => {
  const msg = ev.data;
  if (msg.type === 'init') {
    initWorkerTerrain(msg.seed);
    return;
  }
  if (msg.type === 'gen') {
    // 单线程顺序处理：worker 天然按请求序完成，无需请求 id 配对
    const res = processGenRequest(msg, cache);
    (self as unknown as Worker).postMessage(res, res.transfer);
  }
};
