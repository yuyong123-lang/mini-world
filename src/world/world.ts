// world/world.ts —— 体素读写唯一入口 + 以玩家为中心的流式调度中枢（契约 §7 / 任务卡 T42、W10/T101）
//
// 关键设计（任务卡约定）：
// - World 不 import three、不认识 renderer：网格结果经 onChunkReady 回调交给外部，
//   卸载经 Chunk.disposeMeshes 注入的回调转发为 onChunkUnload。
// - 帧预算：tick = ensureArea(≤2 个「生成+网格」单元) + ≤1 个脏块重网格；
//   worker 模式下预算约束的是**发出的请求**数，完成是异步的（见下）。
// - 玩家修改只写 diffs（键 chunkKey）；chunk 重生成时 diff 回放，会话内即持久化。
//
// --------------------------------------------------------------------------
// W10/T101：地形生成 + 网格化迁入专用线程
// --------------------------------------------------------------------------
// 数据面三步（createChunkData → applyDiffs → meshChunk）移到
// src/workers/worldgen.worker.ts；纯计算本体在 worldWorkerBridge.processGenRequest，
// 本文件只剩调度骨架 + 回包接入。要点：
//  * 协议（同文件定义）：{type:'init',seed} / {type:'gen',cx,cz,diffs,nearby?} →
//    {type:'chunk',cx,cz,opaque,water,voxels,transfer}；diffs 用 [index,id][] 而非 Map。
//  * 回包走 transferable：voxels + 几何 attribute 的 ArrayBuffer 一并转移所有权，
//    主线程收到时零拷贝（直接喂给 BufferGeometry）。
//  * **在途去重**：同一 cx,cz 未收到回包前绝不重复发送（inFlight/pending 表）；
//    因此 worker 收到的每条 gen 都携带该 chunk 的**全量** diffs，重复处理幂等安全。
//  * **异步到达后的可见性**：pub/sub 只保证「该 chunk 就绪必通知」，但编辑发生在
//    请求之后的部分不在本次回放里 → 编辑路径仍会把它标脏，settle 后由
//    remeshDirty 补一刀（见 settle）。
//  * 回包若晚于卸载（UNLOAD_RADIUS 外）：slot 已删则丢弃，避免复活玩家看不见的 chunk。
//
// -------------------------- 同步降级策略 -----------------------------------
// 以下三种情形走原 T42 同步管线（buildPipelineSync/buildMeshSync，代码原样保留）：
//   1. 显式开关：new World(seed, { workersOff: true })（本模块唯一读开关的地方）
//   2. 环境不支持：typeof Worker !== 'function'（node/vitest —— 测试因此无需 mock，
//      全部经由同步分支验证与浏览器分支共享的调度骨架）
//   3. 运行期失败：构造 Worker 抛错，或 worker 报错（脚本加载失败/CSP 拦截）→
//      销毁通道转同步。已在途的结果可能丢失，对应 chunk 会因再次进入待生成清单而重发。
// 开关判定集中在构造器内的一处，运行态用 this.useWorker 一个布尔驱动所有分支。
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
import {
  encodeDiffs,
  isWorkerSupported,
  type GenInitMsg,
  type GenRequestMsg,
  type NearbyDiffs,
  type WorkerToMainMsg,
} from './worldWorkerBridge';

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
/** 同步降级模式下邻 chunk 兜底数据缓存条目上限（超过整表清空，T42 原语义） */
const NEIGHBOR_CACHE_MAX = 64;

/** worker 通道构造参数（T101）：workersOff 为 true 时禁用 worker、全程同步 */
export interface WorldOptions {
  /** true = 强制走旧同步管线。缺省 false；环境无 Worker 时无论此项如何都会降级 */
  workersOff?: boolean;
}

/** 在途请求的登记项：worker 回包时据此拿到 chunk 坐标快照（chunk 可能已被卸载删除） */
interface PendingSlot {
  cx: number;
  cz: number;
}

export class World {
  seed: string;
  /** "cx,cz" → voxelIndex → blockId（玩家修改的唯一事实来源，重生成时回放） */
  diffs = new Map<string, Map<number, number>>();
  spawnPoint: Vec3;
  /** 已加载 chunk 表（集成/存档层可直接读取） */
  chunks = new Map<string, Chunk>();

  onChunkReady: ChunkReadyCallback | null = null;
  onChunkUnload: ChunkUnloadCallback | null = null;

  // ---- worker 通道状态（同步模式全部保持空/假） ----
  /** 是否走 worker 分支。唯一写点在构造器与 dropWorkerChannel（降级钩子） */
  private useWorker = false;
  private worker: Worker | null = null;
  /** 在途去重：key ∈ 此集合 ⇒ 已发出、尚未收到回包 */
  private inFlight = new Set<string>();
  /** 在途请求的坐标快照（key → cx/cz）；用于卸载竞态下识别过期回包 */
  private pending = new Map<string, PendingSlot>();

  /** 网格化期间邻 chunk 数据的兜底缓存（仅同步模式；terragen 直算 + diffs 回放） */
  private neighborCache = new Map<string, Uint8Array>();
  /** 待重网格队列（FIFO：setBlock 顺序即处理顺序，单帧只消费头部） */
  private dirtyQueue: string[] = [];
  private dirtyQueued = new Set<string>();

  /**
   * @param seed 世界种子（同 seed 必得同世界）
   * @param opts T101 选项。降级总条件：opts.workersOff===true ‖ typeof Worker 缺失 ‖
   *             Worker 构造/运行失败（三者任一）→ 走同步管线，公开行为完全一致。
   */
  constructor(seed: string, opts: WorldOptions = {}) {
    this.seed = seed;
    initTerrain(seed); // 模块级噪声状态；主线程侧也要初始化（findSpawnY 用公式值）

    // ---- 降级开关的唯一判定点 ----
    if (isWorkerSupported() && opts.workersOff !== true) {
      try {
        // Vite 规定的模块 worker 导入语法；构建期被替换为带 hash 的产物 URL
        this.worker = new Worker(
          new URL('../workers/worldgen.worker.ts', import.meta.url),
          { type: 'module' },
        );
        this.worker.onmessage = (ev: MessageEvent) => {
          const msg = ev.data as WorkerToMainMsg | undefined;
          if (!msg || msg.type !== 'chunk') return; // 只认这一种回包；其余忽略
          this.handleWorkerResult(msg);
        };
        this.worker.onerror = () => {
          // 脚本加载失败/运行异常：整体降级，宁可慢也不再丢消息
          // （严格模式会把该事件吞掉，这里仅通道自毁，不在全局抛错）
          this.dropWorkerChannel();
        };
        this.worker.postMessage({ type: 'init', seed } satisfies GenInitMsg);
        this.useWorker = true;
      } catch {
        this.dropWorkerChannel(); // 同步降级（node 环境 new Worker 不是函数也会落到这）
      }
    }

    this.spawnPoint = { x: 8, y: this.findSpawnY(8, 8), z: 8 };
  }

  /**
   * 流式加载：以 (px,pz) 所在 chunk 为中心扫 LOAD_RADIUS 方形区，
   * 缺失者按 dist² 升序补齐，至多 budgetPerFrame 个；同时把超出 UNLOAD_RADIUS 的
   * chunk 卸载（dispose meshes 并移出表）。
   *
   * worker 模式：每个名额=一条 gen 请求（几何稍后由回包送达 onChunkReady）；
   * 同步模式：每个名额=一次完整的数据生成+mesh。
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

  /** 该坐标是否为液体（水）。未加载区域返回 false（与 getBlock→AIR 一致） */
  isLiquid(x: number, y: number, z: number): boolean {
    return BlockRegistry.get(this.getBlock(x, y, z)).liquid === true;
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

  /** 测试/页面卸载用：终止 worker 通道并永久回落同步管线 */
  destroy(): void {
    this.dropWorkerChannel();
  }

  /* ==========================================================================
   * 调度骨架内部件（worker / 同步两种模式共用）
   * ========================================================================== */

  /**
   * 取得一个「生成+网格」名额。worker 模式发请求（在途去重后），同步模式当场算完。
   * 注意：这里没有把名额浪费在已经被 in-flight 覆盖的坐标上——
   * 「chunks 里已有」本身就是回包落地的证据（见 handleWorkerResult 先入表后回调）。
   */
  private loadChunk(cx: number, cz: number): void {
    if (this.useWorker) {
      this.sendGen(cx, cz); // 内部做在途去重；成功时占用一个名额
      return;
    }
    this.buildPipelineSync(cx, cz); // 原同步管线（代码即 T42 实现）
  }

  /** 发送一条 gen 请求；同一 chunk 未回来前绝不重复发送（任务卡：in-flight 去重） */
  private sendGen(cx: number, cz: number): void {
    if (!this.worker || !this.useWorker) return;
    const key = chunkKey(cx, cz);
    if (this.inFlight.has(key)) return;
    this.inFlight.add(key);
    this.pending.set(key, { cx, cz });
    const req: GenRequestMsg = {
      type: 'gen',
      cx,
      cz,
      // 完整 diffs 集 + 邻居 diffs：worker 重放即得与同步路径一致的数据与网格。
      // 「全量」而非增量 ⇒ 该消息天然幂等，任何时刻重发都安全。
      diffs: encodeDiffs(this.diffs.get(key)),
      nearby: this.collectNearbyDiffs(cx, cz),
    };
    this.worker.postMessage(req);
  }

  /** 3×3 邻域里持有 diffs 的 chunk 清单（mesher 边界剔除/AO 需要，空列表为零开销） */
  private collectNearbyDiffs(cx: number, cz: number): NearbyDiffs[] {
    const out: NearbyDiffs[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;
        const nk = chunkKey(cx + dx, cz + dz);
        const m = this.diffs.get(nk);
        if (m && m.size > 0) out.push({ cx: cx + dx, cz: cz + dz, diffs: encodeDiffs(m) });
      }
    }
    return out;
  }

  /**
   * worker 回包落地：填数据 → 入表 → 走与同步管线完全相同的 onChunkReady 路径。
   * 回包先于回调写入 this.chunks ⇒ 回调观察到的世界状态已是最新。
   * 异步缝隙：请求时打上去的 diffs 只覆盖「当时已存在的编辑」；其后再发生的
   * setBlock 会把该 chunk 重新标脏（enqueueDirty），settle 后由 remeshDirty
   * 补发一条 gen 覆盖。脏标记持久存在是正确性的兜底，不依赖任何时序假设。
   * 若回包晚于卸载（pending 槽位已清），直接丢弃——不复活玩家看不见的 chunk。
   */
  private handleWorkerResult(msg: WorkerToMainMsg): void {
    const key = chunkKey(msg.cx, msg.cz);
    const slot = this.pending.get(key);
    this.pending.delete(key);
    this.inFlight.delete(key); // 无论是否过期，这个坐标的名额都已归还
    if (!slot) return;

    const c = this.chunks.get(key) ?? new Chunk(slot.cx, slot.cz);
    c.data = msg.voxels; // 结构化克隆+transfer 到手的完整体素（含 diff 回放）
    this.chunks.set(key, c);
    this.onChunkReady?.(c, msg.opaque, msg.water);

    // 被在途阻塞的相邻重网格项现在可以补发了；回包后立刻清账，
    // 避免让下一帧 tick 的 remeshDirty 预算被延迟一帧才消费。
    this.pumpDeferredRemesh();
  }

  /** 测试用探针：当前有多少条 gen 请求在途（协议层断言依赖它） */
  get pendingRequests(): number {
    return this.inFlight.size;
  }

  /* ==========================================================================
   * 重网格（gen 与 remesh 共用同一条 gen 消息：重放 diffs 即可复现正确结果）
   * ========================================================================== */

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
    // worker 模式下被阻塞的项会重新排队，attempt 上限防止单帧空转死循环
    let attempts = this.dirtyQueue.length;
    while (budget > 0 && attempts > 0 && this.dirtyQueue.length > 0) {
      attempts--;
      const key = this.dirtyQueue.shift()!;
      this.dirtyQueued.delete(key);
      const c = this.chunks.get(key);
      if (!c || !c.dirty) continue; // 已卸载/已随重建清除：跳过过期项
      if (!this.requestMesh(c)) {   // 该坐标仍在途：挂起等待回包后再消费
        this.dirtyQueued.add(key);
        this.dirtyQueue.push(key);
        continue;
      }
      budget--;
    }
  }

  /**
   * 提交一个脏 chunk 的重建。
   * @returns false 表示因在途去重暂时无法提交（调用方应保留其排队位置稍后重试）
   */
  private requestMesh(c: Chunk): boolean {
    if (this.useWorker) {
      const key = chunkKey(c.cx, c.cz);
      if (this.inFlight.has(key)) return false; // 生成结果在路上，重网格合并进后续请求
      c.dirty = false;                          // 网格重建已排定：清标记，防重复入队
      this.sendGen(c.cx, c.cz);
      return true;
    }
    c.dirty = false;
    this.buildMeshSync(c); // 同步管线沿用 T42 行为：当帧内立刻 rebuild + 回调
    return true;
  }

  /** 由 handleWorkerResult 在每次回包落地后调用；同步模式无事可做 */
  private pumpDeferredRemesh(): void {
    if (this.dirtyQueue.length === 0) return;
    this.remeshDirty(FRAME_BUDGET_REMESH);
  }

  /* ==========================================================================
   * 同步降级管线 —— 以下就是 T42 的原始实现，一字未改算法
   * ========================================================================== */

  /** [同步] 生成单个 chunk：createChunkData → applyDiffs → 入表 → 立即网格化 */
  private buildPipelineSync(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const data = createChunkData(cx, cz);
    applyDiffs(data, this.diffs.get(key));
    const c = new Chunk(cx, cz);
    c.data = data;
    this.chunks.set(key, c);
    this.buildMeshSync(c);
  }

  /** [同步] 网格化并把结果交给回调方；World 自身不持有 mesh 句柄 */
  private buildMeshSync(c: Chunk): void {
    const res = meshChunk(c.data, this.neighborAccess(), c.cx, c.cz);
    this.onChunkReady?.(c, res.opaque, res.water);
    c.dirty = false;
  }

  /** [同步] mesher 的邻居访问器：世界坐标采样，越出当前 chunk 时查邻 chunk（缺失则直算兜底） */
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

  /** [同步] 邻 chunk 数据：优先在场 chunk（始终最新），否则 terragen 直算 + diffs 回放进缓存 */
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

  /* ==========================================================================
   * worker 通道生命周期
   * ========================================================================== */

  /** 关闭通道并回到同步分支。可安全重复调用（幂等） */
  private dropWorkerChannel(): void {
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      try {
        this.worker.terminate(); // 忽略个别环境的 NotSupportedError
      } catch {
        /* 已经不可能再收到消息，terminate 失败可接受 */
      }
      this.worker = null;
    }
    this.useWorker = false;
    this.inFlight.clear();
    this.pending.clear();
  }
}

/** 切比雪夫距离分量（方形区域半径判定共用此函数） */
function chebyshev(dx: number, dz: number): number {
  return Math.max(Math.abs(dx), Math.abs(dz));
}
