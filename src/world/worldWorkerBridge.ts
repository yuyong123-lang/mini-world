// world/worldWorkerBridge.ts —— W10/T101 worker 迁移的「纯逻辑层」
//
// 为什么单独一个文件：协议里真正需要被测试的东西只有——
//   ① 消息形状本身（判别联合类型）
//   ② diffs Map ↔ 传输数组的编解码（结构化克隆可拷 Map 但数组更省字节、且保序确定）
//   ③ worker 内「生成→diff 回放→mesh」这条纯计算流水线本身
// 三者都不依赖真实 Worker 全局，node 里即可测试（tests/worker-protocol.test.ts）；
// worldgen.worker.ts 与 world.ts 只负责接线，避免协议知识散落三处。
//
// ---------- 协议相对任务卡的补充（均为向后兼容的可选字段） ----------
// 1. chunk 回包带 voxels: Uint8Array（16KB，随 ArrayBuffer 一并 transfer）：
//    World 的公开契约要求 getBlock/raycast/物理读块数据，而「纯函数复算」意味着主线程
//    也得自己跑一遍 terragen 才拿得到数据——那等于把迁移要省掉的计算又搬回来，
//    所以让 worker 把算好的体素顺手带回。任务卡的字段清单漏了它，属需求缺口非实现偷懒。
// 2. gen 请求可选携带 nearby: 邻居 diffs 列表：
//    T42 同步路径里，mesh 兜底邻 chunk 数据时会回放**那些邻 chunk 自己的** diffs
//    （见 git 历史 world.ts sampleNeighbor）。只发自身 diffs 会丢这段语义 → 贴边缝。
//    3×3 邻域内有编辑时才带上，代价为零。
//
// FIXME(integration): main.ts 不消费 core/settings.viewDistance，World 仍按常量
//   LOAD_RADIUS_CHUNKS(7) 加载；viewDistance(3..8) 与雾距的联动归 settings/render 所有者，
//   本波不能跨文件改动，交集成波收口。

import { CHUNK_W, WORLD_H, chunkKey } from '../core/constants';
import type { MeshArrays } from '../core/types';
import { BLOCK } from '../blocks/registry';
import { createChunkData, initTerrain } from './terragen';
import { meshChunk } from './mesher';
import type { NeighborAccess } from './mesher';

/* ==========================================================================
 * 消息协议（主线程 ⇄ worldgen worker，v1）
 * ========================================================================== */

/** 主 → worker：建立世界（同 seed 必得同地形）。worker 收到前不得响应任何 gen */
export interface GenInitMsg {
  type: 'init';
  seed: string;
}

/** 一份 diffs 的线上形态：[voxelIndex, blockId][]。空 diffs 编码为 [] */
export type DiffArray = [number, number][];

/**
 * 主 → worker：生成 + 网格化一个 chunk。首次加载与 remesh 共用此消息——
 * worker 重放主线程送来的完整 diffs 即可复现与同步路径逐位一致的数据与网格。
 */
export interface GenRequestMsg {
  type: 'gen';
  cx: number;
  cz: number;
  /** **该 chunk 的全部**已知修改（不是增量）：重复发送幂等，因此在途补发是安全的 */
  diffs: DiffArray;
  /**
   * 3×3 邻域内（不含自身）持有 diffs 的 chunk 列表。mesher 的边界剔除/AO 需要
   * 邻 chunk 数据；缺省或空数组表示整个邻域都还没有玩家改动。
   */
  nearby?: NearbyDiffs[];
}

/** 邻居 diffs 条目：绝对坐标定位，worker 直算完 terragen 数据后把这份 diffs 打上去 */
export interface NearbyDiffs {
  cx: number;
  cz: number;
  diffs: DiffArray;
}

export type MainToWorkerMsg = GenInitMsg | GenRequestMsg;

/** worker → 主：一个 chunk 的最终产物（几何 + 体素数据，buffer 全部转移所有权） */
export interface ChunkResultMsg {
  type: 'chunk';
  cx: number;
  cz: number;
  opaque: MeshArrays;
  water: MeshArrays | null;
  /** 该 chunk 的完整体素数据（含 diffs 回放），供主线程写入 Chunk.data */
  voxels: Uint8Array;
  /** 可转移缓冲清单：voxels + 几何 attribute（水非空时共 8 个） */
  transfer: ArrayBufferLike[];
}

export type WorkerToMainMsg = ChunkResultMsg;

/* ==========================================================================
 * worker 内流水线（纯计算，不碰 self/postMessage，方便直测）
 * ========================================================================== */

/**
 * 纯净地形基础缓存的条目上限——超过整表清空（与主线程旧实现同款防膨胀策略）。
 * 只存 terragen 原始输出；玩家 diffs 永远打在「本次请求的临时副本」上，
 * 因此缓存条目永远不会被 postMessage 的 buffer 转移挖空（detached ArrayBuffer 会炸）。
 */
const BASE_CACHE_MAX = 64;

/**
 * 处理一条 gen 请求：取/造纯净地形（自身 + 8 邻居）→ 把各自 diffs 打到副本上
 * → meshChunk → 组装回包。三张表各司其职：
 *
 *   baseCache（跨请求持久） 纯 terragen 输出，供邻域反复复用；
 *   resolved（仅本次请求）  本帧实际参与 mesh 的最终数据（可能含 diff 回放），用完即弃；
 *   回包 voxels            恒为私有副本 —— 它的 buffer 要被转移到主线程，
 *                          若把缓存基底直接送出去，下次复用就会踩到 detached buffer。
 *
 * 幂等性：每条 gen 都带目标及其邻域的完整 diffs 集 ⇒ 解析收敛于同一内容，
 * 重复处理同一请求结果一致；回放是「从纯净底版重放」，不会叠加旧值。
 */
export function processGenRequest(
  req: GenRequestMsg,
  baseCache: Map<string, Uint8Array>,
): ChunkResultMsg {
  const { cx, cz } = req;
  const resolved = new Map<string, Uint8Array>();

  // ① 自身：始终独立副本（buffer 将被 transfer 走，绝不能与缓存共享所有权）
  const voxels = resolveChunkData(cx, cz, req.diffs, baseCache, true);
  resolved.set(chunkKey(cx, cz), voxels);

  // ② 显式声明的邻居编辑 + 其余 8 邻居补齐（mesher 的面剔除/AO 探出 ±1 格含对角）。
  //    补齐循环必须跳过已在 resolved 表里的键 —— 否则会把刚打上去的邻居 diffs
  //    用「无编辑版」整个覆盖掉（正是这类静默覆盖导致贴边缝回归的经典路径）。
  if (req.nearby) {
    for (const n of req.nearby) resolveInto(n.cx, n.cz, n.diffs, baseCache, resolved);
  }
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (dx === 0 && dz === 0) continue;
      const nk = chunkKey(cx + dx, cz + dz);
      if (resolved.has(nk)) continue; // 已按真实 diffs 解析过，不得回退为纯净版
      resolveInto(cx + dx, cz + dz, EMPTY_DIFFS, baseCache, resolved);
    }
  }

  // ③ 网格化（同一套纯函数 mesher，输出与主线程同步路径逐位相同）
  const res = meshChunk(voxels, workerNeighborAccess(resolved), cx, cz);
  return {
    type: 'chunk',
    cx,
    cz,
    opaque: res.opaque,
    water: res.water,
    voxels,
    transfer: transferOf(voxels, res),
  };
}

/** 空 diffs 常量：避免热路径反复分配 [] */
const EMPTY_DIFFS: DiffArray = [];

/** 把 MeshArrays 的 buffer 收进 transfer 清单（worker postMessage 第二参数用） */
export function transferOf(
  voxels: Uint8Array,
  res: { opaque: MeshArrays; water: MeshArrays | null },
): ArrayBufferLike[] {
  const list: ArrayBufferLike[] = [
    voxels.buffer,
    res.opaque.position.buffer,
    res.opaque.uv.buffer,
    res.opaque.color.buffer,
    res.opaque.index.buffer,
  ];
  if (res.water) {
    list.push(
      res.water.position.buffer,
      res.water.uv.buffer,
      res.water.color.buffer,
      res.water.index.buffer,
    );
  }
  return list;
}

/** mesher 的邻居访问器（worker 版）：只查缓存，缺失项由 processGenRequest 预先填好 */
function workerNeighborAccess(cache: Map<string, Uint8Array>): NeighborAccess {
  return {
    get(gx, gy, gz) {
      if (gy < 0) return BLOCK.BEDROCK; // 与 mesher.sampleCell 的 y 兜底规则一致
      if (gy >= WORLD_H) return BLOCK.AIR;
      const data = cache.get(
        chunkKey(Math.floor(gx / CHUNK_W), Math.floor(gz / CHUNK_W)),
      );
      if (!data) return BLOCK.AIR; // 防御性兜底（正常路径不可达），语义同「未加载区」
      const lx = ((gx % CHUNK_W) + CHUNK_W) % CHUNK_W;
      const lz = ((gz % CHUNK_W) + CHUNK_W) % CHUNK_W;
      return data[lx | (lz << 4) | (gy << 8)];
    },
  };
}

/**
 * 解析出一份可用于 mesh 的 chunk 数据，登记进本次请求的 resolved 表：
 * 无 diffs 时与缓存基底共享（mesher 只读）；有 diffs 或 forceCopy 时为独立副本。
 * 缓存永远只存纯净 terragen 底版 —— 见 processGenRequest 的表职责说明。
 */
function resolveInto(
  cx: number,
  cz: number,
  diffs: DiffArray,
  baseCache: Map<string, Uint8Array>,
  resolved: Map<string, Uint8Array>,
): void {
  resolved.set(chunkKey(cx, cz), resolveChunkData(cx, cz, diffs, baseCache, false));
}

/**
 * 单 chunk 数据解析：
 *   ① 基底 = baseCache 命中，否则 terragen 直算并入缓存（容量达上限整表清空）；
 *   ② diffs.length === 0 且不强制拷贝 → 返回基底本体（零拷贝快路径）；
 *   ③ 否则 base.slice() 后回放 diffs（副本独立于缓存，转移所有权安全）。
 * 「从纯底版重放」天然幂等：同一集合重复回放结果相同，新集合覆盖旧集合也不会叠加。
 */
function resolveChunkData(
  cx: number,
  cz: number,
  diffs: DiffArray,
  baseCache: Map<string, Uint8Array>,
  forceCopy: boolean,
): Uint8Array {
  const key = chunkKey(cx, cz);
  let base = baseCache.get(key);
  if (!base) {
    base = createChunkData(cx, cz);
    if (baseCache.size >= BASE_CACHE_MAX) baseCache.clear();
    baseCache.set(key, base);
  }
  if (!forceCopy && diffs.length === 0) return base;
  const data = base.slice();
  applyDiffArray(data, diffs);
  return data;
}

/** applyDiffs 的线上格式版本：terragen.applyDiffs 只吃 Map，这里避免为此绕一圈分配 */
function applyDiffArray(data: Uint8Array, diffs: DiffArray): void {
  for (let i = 0; i < diffs.length; i++) {
    const index = diffs[i][0];
    if (index >= 0 && index < data.length) data[index] = diffs[i][1];
  }
}

/* ==========================================================================
 * diffs 编解码（Map ↔ DiffArray）
 * ========================================================================== */

/**
 * diffs Map → 线上数组。按 voxelIndex 升序排序：同一内容的两次编码产出完全相同的序列，
 * golden 测试可直接 deep-equal。（「完整集合 + 确定序」也是 worker 幂等回放的前提。）
 */
export function encodeDiffs(m: Map<number, number> | undefined): DiffArray {
  if (!m || m.size === 0) return [];
  const out: DiffArray = [];
  for (const [index, id] of m) out.push([index, id]);
  out.sort((a, b) => a[0] - b[0]);
  return out;
}

/** 线上数组 → diffs Map。与 encodeDiffs 严格互逆：decode(encode(m)) 内容等于 m */
export function decodeDiffs(arr: DiffArray): Map<number, number> {
  const m = new Map<number, number>();
  for (let i = 0; i < arr.length; i++) m.set(arr[i][0], arr[i][1]);
  return m;
}

/* ==========================================================================
 * 其它共享小件
 * ========================================================================== */

/** node / 受限环境没有 Worker 构造器时的存活判定（typeof 探测，无全局读取副作用） */
export function isWorkerSupported(): boolean {
  return typeof Worker === 'function';
}

/** worker 侧世界噪声初始化（worker 收到 init 后调用一次；主线程仍由 World 构造器自管） */
export function initWorkerTerrain(seed: string): void {
  initTerrain(seed);
}
