import { describe, expect, it, vi } from 'vitest';
import { BLOCK } from '../src/blocks/registry';
import { CHUNK_W, WORLD_H } from '../src/core/constants';
import { Chunk } from '../src/world/chunk';

describe('Chunk set/get 往返', () => {
  it('普通坐标写入后读出一致', () => {
    const c = new Chunk(0, 0);
    c.set(3, 10, 7, BLOCK.STONE);
    expect(c.get(3, 10, 7)).toBe(BLOCK.STONE);
    // 未写处保持 AIR
    expect(c.get(3, 11, 7)).toBe(BLOCK.AIR);
  });

  it('四角边界 (0,0,0) 与 (15,63,15)', () => {
    const c = new Chunk(2, -5);
    c.set(0, 0, 0, BLOCK.BEDROCK);
    c.set(CHUNK_W - 1, WORLD_H - 1, CHUNK_W - 1, BLOCK.GLOWBLOCK);
    expect(c.get(0, 0, 0)).toBe(BLOCK.BEDROCK);
    expect(c.get(15, 63, 15)).toBe(BLOCK.GLOWBLOCK);
    // 其余两角也可写读
    c.set(15, 0, 15, BLOCK.DIRT);
    c.set(0, 63, 0, BLOCK.LOG);
    expect(c.get(15, 0, 15)).toBe(BLOCK.DIRT);
    expect(c.get(0, 63, 0)).toBe(BLOCK.LOG);
  });

  it('布局按 x | z<<4 | y<<8 展开：64 层同 (x,z) 不互串', () => {
    const c = new Chunk(0, 0);
    for (let y = 0; y < WORLD_H; y++) c.set(1, y, 2, y + 1);
    for (let y = 0; y < WORLD_H; y++) expect(c.get(1, y, 2)).toBe(y + 1);
    // 相邻 (x,z) 未受影响
    expect(c.get(2, 5, 2)).toBe(BLOCK.AIR);
    expect(c.get(1, 5, 3)).toBe(BLOCK.AIR);
  });

  it('data 尺寸为 16×64×16 = 16384 且全零初始化', () => {
    const c = new Chunk(-9, 9);
    expect(c.data).toBeInstanceOf(Uint8Array);
    expect(c.data.length).toBe(CHUNK_W * WORLD_H * CHUNK_W);
    expect(c.data.every((v) => v === 0)).toBe(true);
  });
});

describe('Chunk 越界防御', () => {
  it('越界 get 一律返回 AIR(0)', () => {
    const c = new Chunk(0, 0);
    expect(c.get(-1, 0, 0)).toBe(0);
    expect(c.get(16, 0, 0)).toBe(0);
    expect(c.get(0, -1, 0)).toBe(0);
    expect(c.get(0, 64, 0)).toBe(0);
    expect(c.get(0, 0, -1)).toBe(0);
    expect(c.get(0, 0, 16)).toBe(0);
  });

  it('越界 set 不抛错、不改 data、不置 dirty', () => {
    const c = new Chunk(0, 0);
    c.set(1, 1, 1, BLOCK.STONE); // 先放一个真实值，越界写不得波及
    const before = c.data.slice();
    const dirtyBefore = c.dirty;
    expect(() => {
      c.set(-1, 0, 0, 9);
      c.set(16, 0, 0, 9);
      c.set(0, -1, 0, 9);
      c.set(0, 64, 0, 9);
      c.set(0, 0, -1, 9);
      c.set(0, 0, 16, 9);
    }).not.toThrow();
    expect(c.data).toEqual(before);
    expect(c.dirty).toBe(dirtyBefore);
    expect(c.get(1, 1, 1)).toBe(BLOCK.STONE);
  });
});

describe('Chunk dirty 标记', () => {
  it('初始为 false，set 后为 true', () => {
    const c = new Chunk(4, 4);
    expect(c.dirty).toBe(false);
    c.set(0, 0, 0, BLOCK.STONE);
    expect(c.dirty).toBe(true);
  });

  it('dirty 可被外部消费方复位（网格重建后清脏）', () => {
    const c = new Chunk(0, 0);
    c.set(5, 6, 7, BLOCK.SAND);
    c.dirty = false;
    expect(c.dirty).toBe(false);
  });
});

describe('Chunk disposeMeshes', () => {
  it('meshes 非 null 时调用注入对象并清空句柄', () => {
    const c = new Chunk(0, 0);
    c.meshes = { marker: 'opaque-group' };
    const rendererLike = { removeChunkMeshes: vi.fn() };
    c.disposeMeshes(rendererLike);
    expect(rendererLike.removeChunkMeshes).toHaveBeenCalledTimes(1);
    expect(rendererLike.removeChunkMeshes).toHaveBeenCalledWith(c);
    expect(c.meshes).toBeNull();
  });

  it('meshes 为 null 时完全不调用、且重复调用幂等', () => {
    const c = new Chunk(0, 0);
    const rendererLike = { removeChunkMeshes: vi.fn() };
    c.disposeMeshes(rendererLike);
    expect(rendererLike.removeChunkMeshes).not.toHaveBeenCalled();

    c.meshes = { g: 1 };
    c.disposeMeshes(rendererLike);
    c.disposeMeshes(rendererLike);
    expect(rendererLike.removeChunkMeshes).toHaveBeenCalledTimes(1);
  });
});

describe('Chunk 内存冒烟：1000 个实例数据区互不串扰', () => {
  it('new 1000 个 chunk 各自写入后逐一校验', () => {
    const N = 1000;
    type Expect = [x: number, y: number, z: number, id: number][];
    const chunks: { c: Chunk; exp: Expect }[] = [];
    for (let i = 0; i < N; i++) {
      const c = new Chunk(i % 31, -(i % 17));
      // 第三个点位与两角错开，避免自身覆盖造成假阳性
      let px = i % 16;
      const py = (i >> 1) % 64;
      let pz = (i * 3) % 16;
      while ((px === 0 && py === 0 && pz === 0) || (px === 15 && py === 63 && pz === 15)) {
        px = (px + 1) % 16;
      }
      const a = (i % 254) + 1;         // 角点 id
      const b = ((i * 7) % 254) + 1;   // 对角 id（同一 id）
      c.set(0, 0, 0, a);
      c.set(15, 63, 15, b);
      c.set(px, py, pz, b);
      chunks.push({ c, exp: [[0, 0, 0, a], [15, 63, 15, b], [px, py, pz, b]] });
    }
    for (let i = 0; i < N; i++) {
      for (const [x, y, z, id] of chunks[i].exp) {
        expect(chunks[i].c.get(x, y, z), `chunk #${i} @${x},${y},${z}`).toBe(id);
      }
    }
    expect(chunks.reduce((s, e) => s + e.c.data.byteLength, 0)).toBe(
      N * CHUNK_W * WORLD_H * CHUNK_W,
    );
  });
});
