// world/pipeline-m1.ts —— M1 临时装配用的薄适配层：
// createChunkData 来自 terragen（契约 §8），meshNeighborhood 包装 mesher.meshChunk
// 使调用方传「世界坐标取块函数」而不是 NeighborAccess。
// W4(T42) 引入 world.ts 流式调度后本文件删除。

export { createChunkData, initTerrain } from './terragen';

import type { Chunk } from './chunk';
import { meshChunk } from './mesher';
import type { MeshArrays } from '../core/types';

/** 取块包装：世界坐标 → mesher 需要的 NeighborAccess */
export function meshNeighborhood(
  c: Chunk,
  getWorld: (gx: number, gy: number, gz: number) => number,
  cx: number,
  cz: number,
): { opaque: import('../core/types').MeshArrays; water: MeshArrays | null } {
  return meshChunk(c.data, { get: getWorld }, cx, cz);
}
