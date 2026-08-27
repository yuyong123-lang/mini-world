// world/world.ts —— 体素读写唯一入口 + 以玩家为中心的流式调度中枢（契约 §7 / 任务卡 T42）
//
// 关键设计（任务卡约定）：
// - World 不 import three、不认识 renderer：网格结果经 onChunkReady 回调交给外部，
//   卸载经 Chunk.disposeMeshes 注入的回调转发为 onChunkUnload。
// - 帧预算：tick = ensureArea(2 个「数据生成+网格」一体单元) + ≤1 个脏块重网格。
// - 玩家修改只写 diffs（键 chunkKey）；chunk 重生成时 applyDiffs 回放，会话内即持久化。
//
// FIXME(contract): interfaces.md §7 只约束了类成员形状，未规定「未 mesh 的 chunk 卸载时
//   是否也要通知」——本实现沿用 Chunk.disposeMeshes 的语义（无 mesh 句柄则不回调），
//   因此接收方必须在 onChunkReady 里把句柄写回 c.meshes 才能收到对应的 onChunkUnload。
//   若集成层希望「一律通知」，需主线程修订契约（改成显式 unload 事件而非 dispose 注入）。
//
// FIXME(spec): T42 文档写「扫描 LOAD_RADIUS 环形区域」（圆形），但其验收期望
//   chunk 数为 (2*7+1)² = 225（方形）。按测试口径取方形（切比雪夫距离），与
//   UNLOAD 判定共用同一度量，避免边界抖动（圆形加载/方形卸载会在环带反复装卸）。

import { BLOCK, BlockRegistry } from '../blocks/registry';
import {
  LOAD_RADIUS_CHUNKS,
  UNLOAD_RADIUS_CHUNKS,
  WORLD_H,
  chunkKey,
  localCoord,
  voxelIndex,
  worldToChunk,
} from '../core/constants';
import type { BlockHit, MeshArrays, Vec3 } from '../core/types';
import { ddaRaycast } from '../player/interact';
import { Chunk } from './chunk';
import { meshChunk } from './mesher';
import type { NeighborAccess } from './mesher';
import {
  applyDiffs,
  createChunkData,
  initTerrain,
  surfaceHeight,
} from './terragen';

/** 新网格构建完成回调（renderer 在此把 three 句柄写回 c.meshes 并挂进场景） */
export type ChunkReadyCallback = (
  c: Chunk,
  opaque: MeshArrays,
  water: MeshArrays | null,
) => void;

/** chunk 卸载回调（renderer 移除 mesh 用）；由 Chunk.disposeMeshes 注入转发 */
export type ChunkUnloadCallback = (c: Chunk) => void;

/** 默认每帧预算：生成+网格一体的 chunk 数（契约：≤2 生成/帧） */
export const FRAME_BUDGET_GEN = 2;
/** 默认每帧预算：脏 chunk 重网格数（契约：≤1 mesh/帧） */
export const FRAME_BUDGET_REMESH = 1;
/** 邻居兜底数据缓存条目上限——超过整表清空（简单防膨胀，非严格 LRU） */
const NEIGHBOR_CACHE_MAX = 64;

export class World {
  seed: string;
  /** "cx,cz" → voxelIndex → blockId（玩家修改的唯一事实来源，重生成时回放） */
  diffs = new Map<string, Map<number, number>>();
  spawnPoint: Vec3;
  /** 已加载 chunk 表（集成/存档层可直接读取） */
  chunks = new Map<string, Chunk>();

  onChunkReady: ChunkReadyCallback | null = null;
  onChunkUnload: ChunkUnloadCallback | null = null;

  /** 网格化期间邻 chunk 数据的兜底缓存（terragen 直算 + diffs 回放） */
  private neighborCache = new Map<string, Uint8Array>();
  /** 待重网格队列（FIFO：setBlock 顺序即处理顺序，单帧只消费头部） */
  private dirtyQueue: string[] = [];
  private dirtyQueued = new Set<string>();

  constructor(seed: string) {
    this.seed = seed;
    initTerrain(seed); // 模块级噪声状态；同 seed 必得同世界
    this.spawnPoint = { x: 8, y: this.findSpawnY(8, 8), z: 8 };
  }

  /**
   * 流式加载：以 (px,pz) 所在 chunk 为中心扫 LOAD_RADIUS 方形区，
   * 缺失者按 dist² 升序补齐，至多 budgetPerFrame 个（每个含数据生成+diff 回放+网格）；
   * 同时把超出 UNLOAD_RADIUS 的 chunk 卸载（dispose meshes 并移出表）。
   */
  ensureArea(px: number, pz: number, budgetPerFrame: number): void {
    const pcx = worldToChunk(px);
    const pcz = worldToChunk(pz);

    // 卸载先行：腾出预算也给「往回走」的场景即时回收（遍历中删除对 Map 安全）
    for (const [key, c] of this.chunks) {
      if (chebyshev(c.cx - pcx, c.cz - pcz) <= UNLOAD_RADIUS_CHUNKS) continue;
      c.disposeMeshes({ removeChunkMeshes: (cc) => this.onChunkUnload?.(cc) });
      this.chunks.delete(key);
    }

    if (!(budgetPerFrame > 0)) return;

    // 待生成清单每帧重建（≤225 项的扫描远比维护增量队列便宜且无状态漂移）
    const pending: { cx: number; cz: number; dx: number; dz: number; d2: number }[] = [];
    for (let dx = -LOAD_RADIUS_CHUNKS; dx <= LOAD_RADIUS_CHUNKS; dx++) {
      for (let dz = -LOAD_RADIUS_CHUNKS; dz <= LOAD_RADIUS_CHUNKS; dz++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        if (this.chunks.has(chunkKey(cx, cz))) continue;
        pending.push({ cx, cz, dx, dz, d2: dx * dx + dz * dz });
      }
    }
    if (pending.length === 0) return;
    // 近处优先；同环用固定次序决出先后，保证逐帧可复现
    pending.sort((a, b) => a.d2 - b.d2 || a.dz - b.dz || a.dx - b.dx);

    const n = Math.min(budgetPerFrame, pending.length);
    for (let i = 0; i < n; i++) this.loadChunk(pending[i].cx, pending[i].cz);
  }

  /** 契约：越界返回 AIR；y<0 也是 AIR（基岩语义由 collide 层自管），未加载区返回 AIR */
  getBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_H) return BLOCK.AIR;
    const c = this.chunks.get(chunkKey(worldToChunk(x), worldToChunk(z)));
    if (!c) return BLOCK.AIR;
    return c.data[voxelIndex(localCoord(x), y, localCoord(z))];
  }

  /** 写 diffs（无论 chunk 是否在场）+ 更新在场数据 + 标脏自身及受面剔除/AO 影响的贴边邻居 */
  setBlock(x: number, y: number, z: number, id: number): void {
    if (y < 0 || y >= WORLD_H) return;
    const cx = worldToChunk(x);
    const cz = worldToChunk(z);
    const lx = localCoord(x);
    const lz = localCoord(z);
    const key = chunkKey(cx, cz);

    let m = this.diffs.get(key);
    if (!m) {
      m = new Map();
      this.diffs.set(key, m);
    }
    m.set(voxelIndex(lx, y, lz), id);

    const live = this.chunks.get(key);
    if (!live) {
      this.neighborCache.delete(key); // 兜底缓存已过时（含旧 diffs），直接作废
      return;                         // 未加载：仅记 diffs（任务卡约定）
    }

    live.data[voxelIndex(lx, y, lz)] = id; // 立即生效（读路径直查 data，不等重网格）
    this.enqueueDirty(cx, cz);
    // 棱边的面剔除与角的 AO 都读邻居：四向 + 四角一并标脏（角只在两轴同时贴边时受影响）
    if (lx === 0) this.enqueueDirty(cx - 1, cz);
    else if (lx === 15) this.enqueueDirty(cx + 1, cz);
    if (lz === 0) this.enqueueDirty(cx, cz - 1);
    else if (lz === 15) this.enqueueDirty(cx, cz + 1);
    if ((lx === 0 || lx === 15) && (lz === 0 || lz === 15)) {
      this.enqueueDirty(cx + (lx === 0 ? -1 : 1), cz + (lz === 0 ? -1 : 1));
    }
  }

  isSolid(x: number, y: number, z: number): boolean {
    return BlockRegistry.get(this.getBlock(x, y, z)).solid;
  }

  /** DDA 射线委托 player/interact.ddaRaycast（禁止另写一份步进逻辑） */
  raycast(origin: Vec3, dir: Vec3, maxDist: number): BlockHit {
    return ddaRaycast((x, y, z) => this.getBlock(x, y, z), origin, dir, maxDist);
  }

  /** 落地点表面上方 2 格：已加载列的最高非空体素与 terragen 公式值取 max 后 +2 */
  findSpawnY(x: number, z: number): number {
    let top = -1;
    const c = this.chunks.get(chunkKey(worldToChunk(x), worldToChunk(z)));
    if (c) {
      const lx = localCoord(x);
      const lz = localCoord(z);
      for (let y = WORLD_H - 1; y >= 0; y--) {
        if (c.data[voxelIndex(lx, y, lz)] !== BLOCK.AIR) {
          top = y;
          break;
        }
      }
    }
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    // 公式值在构造期即可用（不依赖 chunk 加载）；水域列已被回退到 SEA_LEVEL
    return Math.max(top, surfaceHeight(ix, iz)) + 2;
  }

  /** 每帧入口：加载区推进（预算 2）→ 脏块重网格（预算 1） */
  tick(playerPos: Vec3): void {
    this.ensureArea(playerPos.x, playerPos.z, FRAME_BUDGET_GEN);
    this.remeshDirty(FRAME_BUDGET_REMESH);
  }

  /** 生成单个 chunk：createChunkData → applyDiffs → 入表 → 立即网格化 */
  private loadChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const data = createChunkData(cx, cz);
    applyDiffs(data, this.diffs.get(key));
    const c = new Chunk(cx, cz);
    c.data = data;
    this.chunks.set(key, c);
    this.buildMesh(c);
  }

  /** 网格化并把结果交给回调方；World 自身不持有 mesh 句柄 */
  private buildMesh(c: Chunk): void {
    const res = meshChunk(c.data, this.neighborAccess(), c.cx, c.cz);
    this.onChunkReady?.(c, res.opaque, res.water);
    c.dirty = false;
  }

  /** mesher 的邻居访问器：世界坐标采样，越出当前 chunk 时查邻 chunk（缺失则直算兜底） */
  private neighborAccess(): NeighborAccess {
    return {
      get: (gx, gy, gz) => {
        // 与 mesher.sampleCell 的 y 兜底规则保持一致（mesher 已拦截，这里防御性重复）
        if (gy < 0) return BLOCK.BEDROCK;
        if (gy >= WORLD_H) return BLOCK.AIR;
        return this.sampleNeighbor(
          worldToChunk(gx),
          worldToChunk(gz),
          localCoord(gx),
          gy,
          localCoord(gz),
        );
      },
    };
  }

  /** 邻 chunk 数据：优先在场 chunk（始终最新），否则 terragen 直算 + diffs 回放进缓存 */
  private sampleNeighbor(
    cx: number,
    cz: number,
    lx: number,
    ly: number,
    lz: number,
  ): number {
    const key = chunkKey(cx, cz);
    const live = this.chunks.get(key);
    if (live) return live.data[voxelIndex(lx, ly, lz)];

    let data = this.neighborCache.get(key);
    if (!data) {
      data = createChunkData(cx, cz);
      applyDiffs(data, this.diffs.get(key));
      if (this.neighborCache.size >= NEIGHBOR_CACHE_MAX) this.neighborCache.clear();
      this.neighborCache.set(key, data);
    }
    return data[voxelIndex(lx, ly, lz)];
  }

  /** 标脏并入队；chunk 不在场则忽略（其 diffs 已落盘，重新进入加载区时会回放） */
  private enqueueDirty(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const c = this.chunks.get(key);
    if (!c) return;
    c.dirty = true;
    if (this.dirtyQueued.has(key)) return;
    this.dirtyQueued.add(key);
    this.dirtyQueue.push(key);
  }

  /** 单帧最多 budget 个脏 chunk 重网格，FIFO 保证先编辑先重建 */
  private remeshDirty(budget: number): void {
    while (budget > 0 && this.dirtyQueue.length > 0) {
      budget--;
      const key = this.dirtyQueue.shift()!;
      this.dirtyQueued.delete(key);
      const c = this.chunks.get(key);
      if (!c || !c.dirty) continue; // 已卸载/已随重建清除：跳过过期项
      this.buildMesh(c);
    }
  }
}

/** 切比雪夫距离分量（方形区域半径判定共用此函数） */
function chebyshev(dx: number, dz: number): number {
  return Math.max(Math.abs(dx), Math.abs(dz));
}
