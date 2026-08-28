// T42 World 流式调度单测（纯 node，无 three 对象——onChunkReady/onChunkUnload 用 vi.fn() 收集）
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BLOCK } from '../src/blocks/registry';
import {
  LOAD_RADIUS_CHUNKS,
  SEA_LEVEL,
  WORLD_H,
  chunkKey,
  voxelIndex,
} from '../src/core/constants';
import type { Vec3 } from '../src/core/types';
import { Chunk } from '../src/world/chunk';
import type { MeshArrays } from '../src/core/types';
import { World } from '../src/world/world';

const SEED = 'test';

/** 收集回调的 sink：记录 ready 的 chunk 键序与 unload 的 chunk 引用 */
function makeSink(world: World) {
  const readyKeys: string[] = [];
  const unloaded: Chunk[] = [];
  world.onChunkReady = vi.fn(
    (c: Chunk, _o: MeshArrays, _w: MeshArrays | null) => {
      readyKeys.push(`${c.cx},${c.cz}`);
      // renderer 的职责：把句柄写回 chunk.meshes（卸载通知依赖该句柄非空）
      c.meshes = { fake: true };
    },
  );
  world.onChunkUnload = vi.fn((c: Chunk) => {
    unloaded.push(c);
  });
  return { readyKeys, unloaded };
}

/** 模拟帧循环：从 (x,z) 连续 tick n 帧 */
function runFrames(w: World, pos: Vec3, n: number): void {
  for (let i = 0; i < n; i++) w.tick(pos);
}

/** LOAD_RADIUS 方形区应有的 chunk 总数（切比雪夫度量） */
const EXPECT_FULL = (2 * LOAD_RADIUS_CHUNKS + 1) ** 2;

let world: World;
let sink: ReturnType<typeof makeSink>;

beforeEach(() => {
  world = new World(SEED);
  sink = makeSink(world);
});

describe('构造与出生点', () => {
  it('findSpawnY 不抛错且为合理值（SEA_LEVEL..WORLD_H-6 区间）', () => {
    const y = world.findSpawnY(8, 8);
    expect(Number.isFinite(y)).toBe(true);
    // surfaceHeight 水域回退 SEA_LEVEL、陆地上限 WORLD_H-8，+2 后落在此区间
    expect(y).toBeGreaterThanOrEqual(SEA_LEVEL + 2);
    expect(y).toBeLessThanOrEqual(WORLD_H - 8 + 2);
    expect(world.spawnPoint).toEqual({ x: 8, y: world.findSpawnY(8, 8), z: 8 });
  });

  it('同 seed 的 findSpawnY 确定性一致', () => {
    expect(new World(SEED).findSpawnY(8, 8)).toBe(new World(SEED).findSpawnY(8, 8));
  });
});

describe('ensureArea 流式加载', () => {
  // 装满 225 chunk 需要 ceil(225/2)=113 帧；给足余量后应恰好全部就绪且不超额
  it('tick 足够多帧后 LOAD_RADIUS 内全部 ready：onChunkReady 共 ' + EXPECT_FULL + ' 次', () => {
    runFrames(world, { x: 8, y: 40, z: 8 }, 140);
    expect(world.chunks.size).toBe(EXPECT_FULL);
    expect(sink.readyKeys.length).toBe(EXPECT_FULL);
    // 出生 chunk 必在首批加载完（dist 最小）
    expect(sink.readyKeys[0]).toBe('0,0');
    // 加载区内任取一点可读出非空气地表
    expect(world.getBlock(8, world.findSpawnY(8, 8) - 3, 8)).not.toBe(BLOCK.AIR);
  });

  it('帧预算：单次 tick 新增 ≤2 个 chunk，装满恰好用 ceil(225/2)=113 帧', () => {
    let frames = 0;
    let prev = 0;
    while (world.chunks.size < EXPECT_FULL && frames < 200) {
      world.tick({ x: 8, y: 40, z: 8 });
      frames++;
      const grown = world.chunks.size - prev;
      expect(grown).toBeLessThanOrEqual(2);
      prev = world.chunks.size;
    }
    expect(world.chunks.size).toBe(EXPECT_FULL);
    expect(frames).toBe(Math.ceil(EXPECT_FULL / 2)); // 无空转：每帧都满负荷
  });

  it('近处优先：首批取 dist² 最小的两个，同环按 (dz,dx) 固定次序', () => {
    const firstBatch: string[] = [];
    const origReady = world.onChunkReady!;
    world.onChunkReady = (c, o, w) => {
      firstBatch.push(`${c.cx},${c.cz}`);
      origReady(c, o, w);
    };
    world.tick({ x: 8, y: 40, z: 8 });
    expect(firstBatch).toEqual(['0,0', '0,-1']); // d²=0 优先；d²=1 中 dz 最小者
  });

  it('同心环推进：3 帧后近环（d²≤1）全部就绪、远块缺席', () => {
    for (let f = 0; f < 3; f++) world.tick({ x: 8, y: 40, z: 8 });
    expect(world.chunks.size).toBe(6);
    for (const k of ['0,0', '0,-1', '0,1', '-1,0', '1,0']) {
      expect(world.chunks.has(k)).toBe(true);
    }
    expect(world.chunks.has('1,1')).toBe(false); // d²=2 的排在其后
  });
});

describe('卸载', () => {
  it('玩家移动到远处反复 tick 后原 chunk 触发 onChunkUnload 并移出表', () => {
    runFrames(world, { x: 8, y: 40, z: 8 }, 140);
    expect(world.chunks.has('0,0')).toBe(true);

    const FAR = { x: 8 + 20 * 16, y: 40, z: 8 }; // 移动 20 chunk → 远超 UNLOAD_RADIUS(9)
    runFrames(world, FAR, 250);

    expect(sink.unloaded.length).toBeGreaterThan(0);
    const keys = new Set(sink.unloaded.map((c) => `${c.cx},${c.cz}`));
    expect(keys.has('0,0')).toBe(true);
    expect(world.chunks.has('0,0')).toBe(false);
    expect(sink.unloaded[0].meshes).toBe(null); // dispose 已归还句柄
  });

  // 600 帧世界模拟叠加 GC 压力，5s 默认预算在全文件连续跑时不够（隔离跑 ~2s）
  it('卸载后重进该区域：chunk 重新生成且玩家 diff 被回放', { timeout: 20000 }, () => {
    runFrames(world, { x: 8, y: 40, z: 8 }, 140);
    // 在出生柱顶放一个方块再卸载走人
    const topY = world.findSpawnY(8, 8) + 5;
    world.setBlock(8, topY, 8, BLOCK.GLOWBLOCK);
    runFrames(world, { x: 8 + 25 * 16, y: 40, z: 8 }, 300);
    expect(world.chunks.has('0,0')).toBe(false);

    const readyBefore = sink.readyKeys.length;
    runFrames(world, { x: 8, y: 40, z: 8 }, 160);
    expect(world.chunks.has('0,0')).toBe(true);
    expect(sink.readyKeys.length).toBeGreaterThan(readyBefore); // 重新 mesh 过
    expect(world.getBlock(8, topY, 8)).toBe(BLOCK.GLOWBLOCK);   // diff 回放成功
  });
});

describe('setBlock / diffs / 标脏传播', () => {
  beforeEach(() => {
    runFrames(world, { x: 8, y: 40, z: 8 }, 140); // 预加载满
    runFrames(world, { x: 8, y: 40, z: 8 }, 3);   // 排空残余脏队列
    sink.readyKeys.length = 0;                    // 清空计数，只看后续重建
  });

  it('diffs 记录正确的 chunkKey 与 voxelIndex，且数据立即生效', () => {
    world.setBlock(8, 45, 8, BLOCK.PLANKS);
    const m = world.diffs.get(chunkKey(0, 0));
    expect(m).toBeDefined();
    expect(m!.get(voxelIndex(8, 45, 8))).toBe(BLOCK.PLANKS);
    expect(world.getBlock(8, 45, 8)).toBe(BLOCK.PLANKS);
  });

  it('lx==0 时邻 chunk 进脏队列：再 tick 后该邻 chunk 重 mesh（onChunkReady 再收到）', () => {
    // setBlock 本身不回调；重建发生在后续 tick（预算 1/帧）
    runFrames(world, { x: 8, y: 40, z: 8 }, 3); // 排空 beforeEach 遗留
    sink.readyKeys.length = 0;
    world.setBlock(16, 45, 8, BLOCK.STONE); // lx==0 → 自身(1,0) + 左邻(0,0) 标脏
    expect(sink.readyKeys).toEqual([]);     // 同步阶段不产生网格回调

    runFrames(world, { x: 8, y: 40, z: 8 }, 4);
    expect(sink.readyKeys).toContain('0,0'); // 邻 chunk 重 mesh
    expect(sink.readyKeys).toContain('1,0'); // 自身重 mesh
    expect(world.getBlock(15, 45, 8)).toBe(BLOCK.AIR); // 写入的是 x=16 不是 x=15
    expect(world.getBlock(16, 45, 8)).toBe(BLOCK.STONE);

    // 再等 2 帧：无新增重建（脏队列已排空、未重复入队）
    const total = sink.readyKeys.length;
    runFrames(world, { x: 8, y: 40, z: 8 }, 2);
    expect(sink.readyKeys.length).toBe(total);
  });

  it('角块写入（两轴同时贴边）对角邻 chunk 也标脏', () => {
    runFrames(world, { x: 8, y: 40, z: 8 }, 3);
    sink.readyKeys.length = 0;
    world.setBlock(16, 44, 16, BLOCK.STONE); // (0,0) 角 → 4 个受影响邻居标脏
    runFrames(world, { x: 8, y: 40, z: 8 }, 6);
    for (const k of ['0,0', '1,0', '0,1', '1,1']) {
      expect(sink.readyKeys).toContain(k);
    }
  });

  it('未加载区域 setBlock 只记 diffs 不炸、不产生回调；加载后回放', () => {
    const away = new World(SEED);
    const s2 = makeSink(away);
    void s2;
    away.setBlock(500, 40, 500, BLOCK.GLASS); // chunk (31,31) 未加载
    expect(away.chunks.has('31,31')).toBe(false);
    expect(away.diffs.get(chunkKey(31, 31))?.get(voxelIndex(4, 40, 4))).toBe(BLOCK.GLASS);
    expect(away.onChunkReady).not.toHaveBeenCalled();

    runFrames(away, { x: 500, y: 40, z: 500 }, 100);
    expect(away.getBlock(500, 40, 500)).toBe(BLOCK.GLASS);
  });
});

describe('getBlock / isSolid 边界', () => {
  it('未加载区域返回 AIR(0)', () => {
    expect(world.getBlock(3000, 30, 3000)).toBe(BLOCK.AIR);
    expect(world.getBlock(-7777, 10, 123)).toBe(BLOCK.AIR);
  });

  it('y<0 与 y>=WORLD_H 均返回 AIR（契约：越界 AIR）', () => {
    world.tick({ x: 8, y: 40, z: 8 });
    expect(world.getBlock(8, -1, 8)).toBe(BLOCK.AIR);
    expect(world.getBlock(8, WORLD_H, 8)).toBe(BLOCK.AIR);
  });

  it('isSolid(y=100)==false；地表下方必有实体方块', () => {
    runFrames(world, { x: 8, y: 40, z: 8 }, 140);
    expect(world.isSolid(8, 100, 8)).toBe(false);
    expect(world.isSolid(8, world.findSpawnY(8, 8) - 3, 8)).toBe(true);
  });

  it('diffs 只保留最后写入值（同体素覆盖）', () => {
    world.tick({ x: 8, y: 40, z: 8 }); // 至少加载玩家柱所在 chunk
    world.setBlock(9, 50, 9, BLOCK.SAND);
    world.setBlock(9, 50, 9, BLOCK.LOG);
    expect(world.diffs.get(chunkKey(0, 0))!.size).toBe(1);
    expect(world.getBlock(9, 50, 9)).toBe(BLOCK.LOG);
  });
});

describe('raycast', () => {
  it('从 spawn 向下打中非 AIR 地表方块', () => {
    runFrames(world, { x: 8, y: 40, z: 8 }, 140);
    const hit = world.raycast(
      { x: 8.5, y: world.spawnPoint.y, z: 8.5 },
      { x: 0, y: -1, z: 0 },
      32,
    );
    expect(hit.hit).toBe(true);
    expect(hit.blockId).not.toBe(BLOCK.AIR);
    expect(hit.blockId).not.toBe(BLOCK.WATER);
    expect(hit.pos.x).toBe(8);
    expect(hit.pos.z).toBe(8);
    expect(hit.normal.y).toBe(1); // 从上方打中顶面
  });

  it('朝天空射线 miss', () => {
    runFrames(world, { x: 8, y: 40, z: 8 }, 140);
    const hit = world.raycast({ x: 8.5, y: 40, z: 8.5 }, { x: 0, y: 1, z: 0 }, 64);
    expect(hit.hit).toBe(false);
    expect(hit.blockId).toBe(BLOCK.AIR);
  });

  it('零向量方向 miss 而不抛错（委托 ddaRaycast 的病态输入防御）', () => {
    runFrames(world, { x: 8, y: 40, z: 8 }, 1);
    expect(world.raycast({ x: 8.5, y: 40, z: 8.5 }, { x: 0, y: 0, z: 0 }, 5).hit).toBe(false);
  });
});
