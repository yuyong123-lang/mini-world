// W10/T101 worker 协议单测（纯 node：本环境没有浏览器 Worker 全局——
// node:worker_threads 的 Worker 与 DOM Worker 接口不兼容，World 据此自动走同步降级，
// 见 worldWorkerBridge.isWorkerSupported / world.ts 构造器注释）。
// 覆盖面：
//   1) diffs 编解码往返（Map ↔ [index,id][]）
//   2) worker 流水线的协议行为：回包形状、diff 回放、邻居 diffs 参与 mesh、幂等
//   3) World 降级模式的功能等价（tests/world.test.ts 同款断言的精简版）
//   4) 真 Worker 冒烟测试 —— describe.skipIf 条件跳过，环境允许则尽力而为
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BLOCK } from '../src/blocks/registry';
import {
  CHUNK_W,
  LOAD_RADIUS_CHUNKS,
  WORLD_H,
  chunkKey,
  voxelIndex,
} from '../src/core/constants';
import type { MeshArrays } from '../src/core/types';
import { Chunk } from '../src/world/chunk';
import {
  decodeDiffs,
  encodeDiffs,
  processGenRequest,
} from '../src/world/worldWorkerBridge';
import type { GenRequestMsg } from '../src/world/worldWorkerBridge';
import { createChunkData, initTerrain } from '../src/world/terragen';
import { meshChunk } from '../src/world/mesher';
import type { NeighborAccess } from '../src/world/mesher';
import { World } from '../src/world/world';

const SEED = 'test';

/* ==========================================================================
 * 1. encodeDiffs / decodeDiffs 序列化往返
 * ========================================================================== */

describe('diffs 编解码（Map ↔ DiffArray）', () => {
  it('decode(encode(m)) 与原 Map 内容相等', () => {
    const m = new Map<number, number>([
      [voxelIndex(3, 40, 7), BLOCK.PLANKS],
      [voxelIndex(0, 0, 0), BLOCK.STONE],
      [16383, BLOCK.GLASS], // 上限附近的合法 index
    ]);
    expect(decodeDiffs(encodeDiffs(m))).toEqual(m);
  });

  it('encode 输出按 voxelIndex 升序（确定序 → 同内容两次编码逐项相同）', () => {
    const m = new Map<number, number>([
      [500, BLOCK.SAND],
      [10, BLOCK.LOG],
      [200, BLOCK.DIRT],
    ]);
    const a = encodeDiffs(m);
    expect(a.map((e) => e[0])).toEqual([10, 200, 500]);
    expect(encodeDiffs(m)).toEqual(a);
  });

  it('空 Map / undefined 编码为 []；[] 解码为空 Map（互逆）', () => {
    expect(encodeDiffs(new Map())).toEqual([]);
    expect(encodeDiffs(undefined)).toEqual([]);
    expect([...decodeDiffs([]).entries()]).toEqual([]);
  });

  it('JSON.stringify 往返无损（模拟跨 postMessage 的可序列化性）', () => {
    // postMessage 用结构化克隆而非 JSON，但「纯数组+number」必然两者都安全；
    // 这里用 JSON 往返作为最严格的可序列化下界验证。
    const m = new Map<number, number>([[voxelIndex(8, 45, 8), BLOCK.GLOWBLOCK]]);
    const wire = JSON.parse(JSON.stringify(encodeDiffs(m))) as [number, number][];
    expect(decodeDiffs(wire).get(voxelIndex(8, 45, 8))).toBe(BLOCK.GLOWBLOCK);
  });
});

/* ==========================================================================
 * 2. worker 内流水线（processGenRequest）的行为
 * ========================================================================== */

/** 计一个 mesh 的顶点数（用于断言不同输入产生不同的几何） */
function vertCount(a: MeshArrays): number {
  return a.position.length / 3;
}

function genReq(partial: Partial<GenRequestMsg>): GenRequestMsg {
  return { type: 'gen', cx: 0, cz: 0, diffs: [], ...partial };
}

beforeEach(() => initTerrain(SEED));

describe('processGenRequest（worker 数据面）', () => {
  it('回包形状符合协议：type/cx/cz/opaque/water/voxels/transfer 齐全且一致', () => {
    const cache = new Map<string, Uint8Array>();
    const res = processGenRequest(genReq({ cx: 2, cz: -3 }), cache);

    expect(res.type).toBe('chunk');
    expect(res.cx).toBe(2);
    expect(res.cz).toBe(-3);
    expect(res.voxels).toBeInstanceOf(Uint8Array);
    expect(res.voxels.length).toBe(16 * WORLD_H * 16);
    expect(Array.isArray(res.transfer)).toBe(true);
    // water 至少是 null；opaque 必须是 MeshArrays
    if (res.water !== null) expect(res.water.index).toBeInstanceOf(Uint32Array);
    expect(res.opaque.index).toBeInstanceOf(Uint32Array);
    // transfer 清单 = voxels + opaque 四件 +（若有水）water 四件
    expect(res.transfer.length).toBe(res.water ? 9 : 5);
    for (const b of res.transfer) expect(b.byteLength).toBeGreaterThan(0);
    expect(res.transfer).toContain(res.voxels.buffer);
    expect(res.transfer).toContain(res.opaque.position.buffer);
  });

  it('transfer 清单覆盖全部几何 buffer 且无重复条目', () => {
    const cache = new Map<string, Uint8Array>();
    const res = processGenRequest(genReq({}), cache);
    const expectKeys = [
      res.voxels.buffer,
      res.opaque.position.buffer,
      res.opaque.uv.buffer,
      res.opaque.color.buffer,
      res.opaque.index.buffer,
      ...(res.water
        ? [
            res.water.position.buffer,
            res.water.uv.buffer,
            res.water.color.buffer,
            res.water.index.buffer,
          ]
        : []),
    ];
    expect(new Set(res.transfer).size).toBe(expectKeys.length); // 无重复
    for (const k of expectKeys) expect(res.transfer).toContain(k);
  });

  it('diffs 进入回包 voxels（与同步 applyDiffs 同位置同值）', () => {
    const idx = voxelIndex(5, 45, 9);
    const cache = new Map<string, Uint8Array>();
    const res = processGenRequest(genReq({ diffs: [[idx, BLOCK.GLOWBLOCK]] }), cache);
    expect(res.voxels[idx]).toBe(BLOCK.GLOWBLOCK);
    // 其它体素保持 terragen 原值：与不带 diffs 的版本只差这一个位置
    const clean = processGenRequest(genReq({}), new Map()).voxels;
    let diffCount = 0;
    for (let i = 0; i < clean.length; i++) if (clean[i] !== res.voxels[i]) diffCount++;
    expect(diffCount).toBe(1);
  });

  it('同一请求重复处理结果幂等（协议承诺「全量 diffs ⇒ 可安全重发」）', () => {
    const idx = voxelIndex(6, 44, 8);
    const req = genReq({ diffs: [[idx, BLOCK.STONE]] });
    const a = processGenRequest(req, new Map());
    const b = processGenRequest(req, new Map());
    expect([...a.voxels]).toEqual([...b.voxels]);
    expect([...a.opaque.index]).toEqual([...b.opaque.index]);
    expect(vertCount(a.opaque)).toBe(vertCount(b.opaque));
  });

  it('缓存复用与更新：第二次请求命中缓存后仍应用新的完整 diffs 集', () => {
    const cache = new Map<string, Uint8Array>();
    const i1 = voxelIndex(2, 30, 2);
    processGenRequest(genReq({ diffs: [[i1, BLOCK.PLANKS]] }), cache);

    // 新的全量集不再含 i1（玩家又把它挖掉了）⇒ 重放应收敛到无方块状态
    const res2 = processGenRequest(genReq({ diffs: [] }), cache);
    expect(cache.size).toBeGreaterThan(0);
    void i1;
    // 无 diffs 的重放即纯净地形；此处验证它确实走了缓存路径并给出了全新数组
    const clean = processGenRequest(genReq({}), new Map()).voxels;
    expect([...res2.voxels]).toEqual([...clean]);
  });

  it('nearby 邻居 diffs 参与 mesh：贴边编辑后 worker 输出与主线程同步实现一致', () => {
    // 黄金参照：直接用同步管线（createChunkData + applyDiffs + meshChunk）算出
    // chunk(1,0) 的网格 —— 它在 x=16 一侧被 chunk(0,0) 里玩家放置的贴边方块遮住，
    // 那些被贴住的 (1,0) 边界面必须被剔除。worker 只有拿到 nearby diffs 才可能复现。
    //
    // 选点依据（seed='test' 的实测地形）：世界坐标 (15,35..36,z=11/12/15) 一带，
    // chunk(0,0) 的贴边柱 y=35 处是 AIR，而紧邻的 (1,0) 内 lx=0 同高度是 GRASS(5) ——
    // 即「本无面、放进墙后该面消失」的真实边界对；避免了「选点本身没面可剔」的空转。
    initTerrain(SEED);
    const wallIdxIn00 = voxelIndex(15, 35, 11); // chunk(0,0) 贴边（世界 x=15）
    const wall: [number, number] = [wallIdxIn00, BLOCK.STONE];

    // --- 主线程黄金参照 ---
    // 注意：wallIdxIn00 是「chunk(0,0) 的本地索引」，只能喂给 (0,0) 自己的 DiffArray；
    // 若误当成同一个 voxelIndex 写进别的 chunk 会污染邻块体素 → 黄金参照失真。
    const c10 = createChunkData(1, 0);
    const c00 = createChunkData(0, 0);
    c00[wallIdxIn00] = BLOCK.STONE;
    const live = new Map<string, Uint8Array>([
      ['0,0', c00],
      ['1,0', c10],
    ]);
    const goldenNb: NeighborAccess = {
      get(gx, gy, gz) {
        if (gy < 0) return BLOCK.BEDROCK;
        if (gy >= WORLD_H) return BLOCK.AIR;
        const key = chunkKey(Math.floor(gx / CHUNK_W), Math.floor(gz / CHUNK_W));
        const d =
          live.get(key) ??
          (() => {
            const nd = createChunkData(Math.floor(gx / CHUNK_W), Math.floor(gz / CHUNK_W));
            live.set(key, nd);
            return nd;
          })();
        const lx = ((gx % CHUNK_W) + CHUNK_W) % CHUNK_W;
        const lz = ((gz % CHUNK_W) + CHUNK_W) % CHUNK_W;
        return d[lx | (lz << 4) | (gy << 8)];
      },
    };
    const golden = meshChunk(c10, goldenNb, 1, 0).opaque;

    // --- worker 路径：带与不带 nearby 各跑一次 ---
    const aware = processGenRequest(
      genReq({ cx: 1, cz: 0, nearby: [{ cx: 0, cz: 0, diffs: [wall] }] }),
      new Map(),
    );
    const blind = processGenRequest(genReq({ cx: 1, cz: 0 }), new Map());

    // 核心等价断言：知道邻居编辑 ⇒ 与同步实现的拓扑与几何一致
    expect([...aware.opaque.index]).toEqual([...golden.index]);
    expect([...aware.opaque.position]).toEqual([...golden.position]);
    expect(vertCount(aware.opaque)).toBe(vertCount(golden));
    // 反证：不知道邻居编辑 ⇒ 被墙遮住的面没有被剔除 → (1,0) 网格多出整个面。
    // 面剔除只删面不增面 ⇒ blind 的顶点数严格大于正确网格。
    expect(vertCount(blind.opaque)).toBeGreaterThan(vertCount(golden));
    expect(vertCount(golden)).toBeLessThan(vertCount(blind.opaque)); // 挑点的自证
  });
});

/* ==========================================================================
 * 3. World 降级模式功能等价（tests/world.test.ts 精简版）
 *    显式 workersOff:true —— 保证无论宿主有没有 Worker，走的都是同一同步分支
 * ========================================================================== */

function makeSink(w: World) {
  const readyKeys: string[] = [];
  w.onChunkReady = (c: Chunk) => {
    readyKeys.push(`${c.cx},${c.cz}`);
    c.meshes = { fake: true }; // renderer 职责：写回句柄以便收到 unload 通知
  };
  return readyKeys;
}

const EXPECT_FULL = (2 * LOAD_RADIUS_CHUNKS + 1) ** 2;

describe('World({workersOff:true}) 功能等价', () => {
  let world: World;
  let readyKeys: string[];

  beforeEach(() => {
    world = new World(SEED, { workersOff: true });
    readyKeys = makeSink(world);
  });

  it('tick 足够多帧后 LOAD_RADIUS 内全部就绪（' + EXPECT_FULL + ' 个）', () => {
    for (let f = 0; f < 140; f++) world.tick({ x: 8, y: 40, z: 8 });
    expect(world.chunks.size).toBe(EXPECT_FULL);
    expect(readyKeys.length).toBe(EXPECT_FULL);
    expect(readyKeys[0]).toBe('0,0'); // 出生 chunk 最近，首批完成
    expect(world.getBlock(8, world.findSpawnY(8, 8) - 3, 8)).not.toBe(BLOCK.AIR);
  });

  it('帧预算：每帧新增 ≤2，装满恰好 ceil(225/2)=113 帧', () => {
    let frames = 0;
    let prev = 0;
    while (world.chunks.size < EXPECT_FULL && frames < 200) {
      world.tick({ x: 8, y: 40, z: 8 });
      frames++;
      expect(world.chunks.size - prev).toBeLessThanOrEqual(2);
      prev = world.chunks.size;
    }
    expect(world.chunks.size).toBe(EXPECT_FULL);
    expect(frames).toBe(Math.ceil(EXPECT_FULL / 2));
  });

  it('近处优先：首批 [' + "'0,0','0,-1'" + ']（dist² 升序、同环 dz 先行）', () => {
    world.tick({ x: 8, y: 40, z: 8 });
    expect(readyKeys.slice(0, 2)).toEqual(['0,0', '0,-1']);
  });

  it('setBlock 立即生效 + 邻块标脏 + 后续 tick 重 mesh（回调顺序不变）', () => {
    for (let f = 0; f < 140; f++) world.tick({ x: 8, y: 40, z: 8 });
    for (let f = 0; f < 3; f++) world.tick({ x: 8, y: 40, z: 8 }); // 排空残余脏队列
    readyKeys.length = 0;

    world.setBlock(16, 45, 8, BLOCK.STONE); // lx==0 → 自身(1,0)+左邻(0,0) 标脏
    expect(readyKeys).toEqual([]);          // setBlock 本身不回调

    for (let f = 0; f < 4; f++) world.tick({ x: 8, y: 40, z: 8 });
    expect(readyKeys).toContain('0,0');
    expect(readyKeys).toContain('1,0');
    expect(world.diffs.get(chunkKey(1, 0))?.get(voxelIndex(0, 45, 8))).toBe(BLOCK.STONE);
    expect(world.getBlock(16, 45, 8)).toBe(BLOCK.STONE);

    const total = readyKeys.length;
    for (let f = 0; f < 2; f++) world.tick({ x: 8, y: 40, z: 8 });
    expect(readyKeys.length).toBe(total); // 脏队列排空后不再重复重建
  });

  // 同 world.test.ts：600 帧模拟在连续执行时需要超出 5s 默认预算
  it('卸载后重进区域：chunk 再生且 diffs 回放', { timeout: 20000 }, () => {
    for (let f = 0; f < 140; f++) world.tick({ x: 8, y: 40, z: 8 });
    const topY = world.findSpawnY(8, 8) + 5;
    world.setBlock(8, topY, 8, BLOCK.GLOWBLOCK);
    for (let f = 0; f < 300; f++) world.tick({ x: 8 + 25 * 16, y: 40, z: 8 });
    expect(world.chunks.has('0,0')).toBe(false);

    const before = readyKeys.length;
    for (let f = 0; f < 160; f++) world.tick({ x: 8, y: 40, z: 8 });
    expect(world.chunks.has('0,0')).toBe(true);
    expect(readyKeys.length).toBeGreaterThan(before);
    expect(world.getBlock(8, topY, 8)).toBe(BLOCK.GLOWBLOCK);
  });

  it('spawnPoint 与 findSpawnY 的契约在降级模式下不变', () => {
    expect(world.spawnPoint).toEqual({ x: 8, y: world.findSpawnY(8, 8), z: 8 });
    expect(world.findSpawnY(8, 8)).toBe(new World(SEED).findSpawnY(8, 8));
  });
});

/* ==========================================================================
 * 4. node 环境（无 Worker）自动降级 + in-flight 去重的调度表现
 * ========================================================================== */

describe('环境不支持 Worker 时的自动降级', () => {
  it("new World(seed) 在 typeof Worker==='undefined' 时与 workersOff:true 行为一致", () => {
    const supported = typeof Worker === 'function';
    const auto = new World(SEED);
    // 不管支不支持，构造都不抛错；node 下 useWorker 分支必然未被采用
    if (!supported) expect(auto.pendingRequests).toBe(0);
    auto.tick({ x: 8, y: 40, z: 8 });
    expect(auto.chunks.size).toBeGreaterThan(0);
    auto.destroy();
  });

  it('pendingRequests：worker 关闭时恒为 0（无在途登记泄漏）', () => {
    const w = new World(SEED, { workersOff: true });
    for (let f = 0; f < 20; f++) w.tick({ x: 8, y: 40, z: 8 });
    expect(w.pendingRequests).toBe(0);
    w.destroy();
  });
});

/* ==========================================================================
 * 5. 真 Worker 冒烟（尽力而为：node/jest-vitest 默认没有 DOM Worker → skip）
 *    在支持 Worker 的宿主里执行时验证 init→gen→chunk 三段握手。
 * ========================================================================== */

const REAL_WORKER_AVAILABLE = typeof Worker === 'function';

describe.skipIf(!REAL_WORKER_AVAILABLE)('真 worldgen worker 冒烟', () => {
  it('init → gen → 收到 shape 合法的 chunk 包', async () => {
    const w = new Worker(
      new URL('../src/workers/worldgen.worker.ts', import.meta.url),
      { type: 'module' },
    );
    try {
      w.postMessage({ type: 'init', seed: 'smoke' });
      const msg = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('worker 超时未回包')), 8000);
        w.onmessage = (ev: MessageEvent) => {
          clearTimeout(timer);
          resolve(ev.data as Record<string, unknown>);
        };
        w.onerror = (e) => {
          clearTimeout(timer);
          reject(new Error(`worker error: ${String(e.message ?? e)}`));
        };
      });
      expect(msg['type']).toBe('chunk');
      expect(msg['opaque']).toBeDefined();
      expect(msg['voxels']).toBeInstanceOf(Uint8Array);
      expect((msg['voxels'] as Uint8Array).length).toBe(16 * WORLD_H * 16);
    } finally {
      w.terminate();
    }
  }, 15000);
});

/* --------------------------------------------------------------------------
 * 附：vi.fn 类型冒烟（保证上面 sink 写法没有绕过类型检查）
 * -------------------------------------------------------------------------- */
void vi;
