// world/chunk.ts —— 单个 chunk 的体素存储（16×64×16）
// 契约 §7。不 import three（Worker 迁移前提，见 conventions §3）；
// 渲染句柄以 unknown 存放，经 disposeMeshes 注入的回调归还。
import { CHUNK_W, WORLD_H, voxelIndex } from '../core/constants';

/**
 * Chunk：体素数据 + 网格脏标记 + 渲染挂载句柄。
 *
 * 越界策略（防御式安全）：get 在 lx/lz 不在 0..CHUNK_W-1 或 ly 不在 0..WORLD_H-1
 * 时返回 0(AIR)，set 静默忽略且**不**置 dirty。chunk 层不做钳制/环绕/抛错，
 * 世界坐标→chunk 映射与越界写的外部协调统一由 World 层负责。
 */
export class Chunk {
  readonly cx: number;
  readonly cz: number;
  /** 体素数据，布局 = voxelIndex(lx,ly,lz) 即 x | z<<4 | y<<8，长度 CHUNK_W*WORLD_H*CHUNK_W */
  data: Uint8Array;
  /** 体素被修改后为 true，网格重建方消费后清除 */
  dirty: boolean;
  /** renderer 挂载的 three 对象句柄（opaque/water）；null 表示未挂载 */
  meshes: unknown;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.data = new Uint8Array(CHUNK_W * WORLD_H * CHUNK_W);
    this.dirty = false;
    this.meshes = null;
  }

  /** 读局部体素 id；越界返回 AIR(0)。 */
  get(lx: number, ly: number, lz: number): number {
    if (!inBounds(lx, ly, lz)) return 0;
    return this.data[voxelIndex(lx, ly, lz)];
  }

  /** 写局部体素 id 并自动置 dirty；越界静默忽略且不改数据（见类级 JSDoc 越界策略）。 */
  set(lx: number, ly: number, lz: number, id: number): void {
    if (!inBounds(lx, ly, lz)) return;
    this.data[voxelIndex(lx, ly, lz)] = id;
    this.dirty = true;
  }

  /**
   * 归还渲染资源：仅当已有句柄时调用注入方的 removeChunkMeshes，
   * 然后清空句柄。重复调用安全（幂等）。
   */
  disposeMeshes(rendererLike: { removeChunkMeshes(c: Chunk): void }): void {
    if (this.meshes === null) return;
    rendererLike.removeChunkMeshes(this);
    this.meshes = null;
  }
}

/** 局部坐标是否在 chunk 体内（lx/lz: 0..15, ly: 0..63） */
function inBounds(lx: number, ly: number, lz: number): boolean {
  return (
    lx >= 0 && lx < CHUNK_W &&
    lz >= 0 && lz < CHUNK_W &&
    ly >= 0 && ly < WORLD_H
  );
}
