// T14 地形生成 M1 版单测：未初始化防护 / 确定性 / 分层 / 海洋规则 / diffs / seed 区分度
import { beforeEach, describe, expect, it } from 'vitest';

import { BLOCK } from '../src/blocks/registry';
import { CHUNK_W, SEA_LEVEL, WORLD_H, voxelIndex } from '../src/core/constants';
import {
  applyDiffs,
  createChunkData,
  initTerrain,
  isTreeColumn,
  surfaceHeight,
} from '../src/world/terragen';

const SEED = 'test-seed-42';

/** 逐字节比较两个 TypedArray（避免依赖 Node Buffer 类型） */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * 在 chunk (cx,cz) 内找第一列满足 pred(surfaceHeight) 的列。
 * 注意水面列的 surfaceHeight 已回退为 SEA_LEVEL；需要真实地形高时直接扫数据。
 */
function findColumn(
  cx: number,
  cz: number,
  pred: (sh: number) => boolean,
): { lx: number; lz: number; sh: number } | null {
  for (let lx = 0; lx < CHUNK_W; lx++) {
    for (let lz = 0; lz < CHUNK_W; lz++) {
      const sh = surfaceHeight(cx * CHUNK_W + lx, cz * CHUNK_W + lz);
      if (pred(sh)) return { lx, lz, sh };
    }
  }
  return null;
}

/** 扫描多块 chunk 直到找到满足条件的列，同时返回所在 chunk 坐标 */
function findColumnInChunks(
  maxC: number,
  pred: (sh: number) => boolean,
): { cx: number; cz: number; lx: number; lz: number; sh: number } | null {
  for (let cx = 0; cx < maxC; cx++) {
    for (let cz = 0; cz < maxC; cz++) {
      const col = findColumn(cx, cz, pred);
      if (col) return { cx, cz, ...col };
    }
  }
  return null;
}

/** 在已生成的 chunk 数据中找一列被水覆盖的列，返回其原始地表高 */
function waterColumnIn(data: Uint8Array): { lx: number; lz: number; ground: number } | null {
  for (let lx = 0; lx < CHUNK_W; lx++) {
    for (let lz = 0; lz < CHUNK_W; lz++) {
      if (data[voxelIndex(lx, SEA_LEVEL, lz)] !== BLOCK.WATER) continue;
      // 自海面向下穿透水体，最低一格水的下方即原始地表
      let wy = SEA_LEVEL;
      while (wy > 0 && data[voxelIndex(lx, wy - 1, lz)] === BLOCK.WATER) wy--;
      return { lx, lz, ground: wy - 1 };
    }
  }
  return null;
}

// 放在最前执行：本模块内尚未有人调用过 initTerrain
describe('未初始化防护', () => {
  it('createChunkData / surfaceHeight 未先 initTerrain 时抛错并提示', () => {
    expect(() => createChunkData(0, 0)).toThrowError(/initTerrain/);
    expect(() => surfaceHeight(0, 0)).toThrowError(/initTerrain/);
    initTerrain(SEED); // 初始化一次，供后续用例使用
  });
});

describe('确定性', () => {
  beforeEach(() => initTerrain(SEED));

  it('同 seed 两次 createChunkData(3,7) 逐字节一致', () => {
    const a = createChunkData(3, 7);
    const b = createChunkData(3, 7);
    expect(a.length).toBe(CHUNK_W * WORLD_H * CHUNK_W);
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) throw new Error(`字节不一致 @${i}: ${a[i]} vs ${b[i]}`);
    }
    expect(true).toBe(true);
  });

  it('surfaceHeight 同坐标重复调用一致，且陆地列表层正是 GRASS', () => {
    const x = 51, z = -13;
    expect(surfaceHeight(x, z)).toBe(surfaceHeight(x, z));
    const cx = Math.floor(x / CHUNK_W);
    const cz = Math.floor(z / CHUNK_W);
    const data = createChunkData(cx, cz);
    const h = surfaceHeight(x, z);
    const lid = x - cx * CHUNK_W;
    const ldz = z - cz * CHUNK_W;
    if (h > SEA_LEVEL) {
      // 陆地列未被海面回退，surfaceHeight 即真实地表
      expect(data[voxelIndex(lid, h, ldz)]).toBe(BLOCK.GRASS);
      expect(data[voxelIndex(lid, h - 1, ldz)]).toBe(BLOCK.DIRT);
    } else {
      // 水面列在 SEA_LEVEL 处必是水
      expect(data[voxelIndex(lid, SEA_LEVEL, ldz)]).toBe(BLOCK.WATER);
    }
  });
});

describe('分层结构', () => {
  beforeEach(() => initTerrain(SEED));

  it('陆地列：表层 GRASS、其下 DIRT、底部 BEDROCK、含 STONE', () => {
    // 抽样若干 chunk 直到找到一处海拔略高于海平面的平缓陆地列
    const found = findColumnInChunks(12, (sh) => sh > SEA_LEVEL && sh <= SEA_LEVEL + 6);
    expect(found).not.toBeNull();
    const f = found!;
    const data = createChunkData(f.cx, f.cz);
    // FIXME(debug): temporary column dump
    const dbg: string[] = [];
    for (let y = Math.max(0, f.sh - 6); y <= Math.min(WORLD_H - 1, f.sh + 3); y++) {
      dbg.push(`${y}:${data[voxelIndex(f.lx, y, f.lz)]}`);
    }
    console.info(`DBG col cx=${f.cx} cz=${f.cz} lx=${f.lx} lz=${f.lz} sh=${f.sh} | ${dbg.join(' ')}`);
    console.info(`DBG direct surfaceHeight=${surfaceHeight(f.cx * CHUNK_W + f.lx, f.cz * CHUNK_W + f.lz)}`);

    expect(data[voxelIndex(f.lx, f.sh, f.lz)]).toBe(BLOCK.GRASS);
    expect(data[voxelIndex(f.lx, f.sh - 1, f.lz)]).toBe(BLOCK.DIRT);
    expect(data[voxelIndex(f.lx, 0, f.lz)]).toBe(BLOCK.BEDROCK);

    let hasStone = false;
    for (let y = 1; y < f.sh - 3; y++) {
      if (data[voxelIndex(f.lx, y, f.lz)] === BLOCK.STONE) hasStone = true;
    }
    expect(hasStone).toBe(true);
  });

  it('所有列的非空气最高层落在 [4, WORLD_H-8] 钳制区间内', () => {
    const data = createChunkData(-4, 2);
    for (let lx = 0; lx < CHUNK_W; lx++) {
      for (let lz = 0; lz < CHUNK_W; lz++) {
        let top = -1;
        for (let y = WORLD_H - 1; y >= 0; y--) {
          if (data[voxelIndex(lx, y, lz)] !== BLOCK.AIR) { top = y; break; }
        }
        expect(top).toBeGreaterThanOrEqual(4);
        expect(top).toBeLessThanOrEqual(WORLD_H - 8);
        expect(top).toBeLessThan(WORLD_H);
      }
    }
  });
});

describe('海洋规则', () => {
  beforeEach(() => initTerrain(SEED));

  it('水下列：ground+1..SEA_LEVEL 全为 WATER，原始表层为 SAND，海面上是 AIR', () => {
    let checked = 0;
    for (let cx = 0; cx < 24 && checked === 0; cx++) {
      for (let cz = 0; cz < 24; cz++) {
        const data = createChunkData(cx, cz);
        const col = waterColumnIn(data);
        if (!col) continue;

        expect(col.ground).toBeLessThan(SEA_LEVEL);
        for (let y = col.ground + 1; y <= SEA_LEVEL; y++) {
          expect(data[voxelIndex(col.lx, y, col.lz)]).toBe(BLOCK.WATER);
        }
        expect(data[voxelIndex(col.lx, col.ground, col.lz)]).toBe(BLOCK.SAND);
        expect(data[voxelIndex(col.lx, SEA_LEVEL + 1, col.lz)]).toBe(BLOCK.AIR);
        checked++;
      }
    }
    // ±11 格高度振幅下该 seed 必然存在海洋；找不到说明实现退化
    expect(checked).toBeGreaterThan(0);
  });

  it('水下列的 surfaceHeight 回退为 SEA_LEVEL（spawn 定位于水面之上）', () => {
    for (let cx = 0; cx < 16; cx++) {
      const cz = -cx - 1;
      const data = createChunkData(cx, cz);
      const col = waterColumnIn(data);
      if (!col) continue;
      const wx = cx * CHUNK_W + col.lx;
      const wz = cz * CHUNK_W + col.lz;
      expect(surfaceHeight(wx, wz)).toBe(SEA_LEVEL);
      expect(surfaceHeight(wx, wz)).toBeGreaterThan(col.ground);
      return;
    }
    throw new Error('抽样 16 个 chunk 未发现水域');
  });
});

describe('applyDiffs', () => {
  beforeEach(() => initTerrain(SEED));

  it('按 voxelIndex 覆盖方块 id', () => {
    const data = createChunkData(5, 5);
    const i1 = voxelIndex(3, 40, 9);
    const i2 = voxelIndex(15, 63, 15);
    applyDiffs(data, new Map([[i1, BLOCK.GLOWBLOCK]]));
    applyDiffs(data, new Map([[i2, BLOCK.PLANKS]]));
    expect(data[i1]).toBe(BLOCK.GLOWBLOCK);
    expect(data[i2]).toBe(BLOCK.PLANKS);
  });

  it('undefined 为无操作，多次应用幂等', () => {
    const a = createChunkData(1, 1);
    const b = createChunkData(1, 1);
    applyDiffs(a, undefined);
    const i = voxelIndex(7, 33, 7);
    const m = new Map([[i, BLOCK.SAND]]);
    applyDiffs(b, m);
    applyDiffs(b, m);
    expect(a[i]).not.toBe(BLOCK.SAND);
    expect(b[i]).toBe(BLOCK.SAND);
    expect(createChunkData(1, 1)[i]).not.toBe(BLOCK.SAND);
  });

  it('越界 diff 索引被防御性忽略而不抛错', () => {
    const data = createChunkData(0, 0);
    const snapshot = Uint8Array.from(data);
    applyDiffs(data, new Map([[-1, BLOCK.STONE], [data.length + 5, BLOCK.STONE]]));
    expect(bytesEqual(data, snapshot)).toBe(true);
  });
});

describe('seed 区分度与树判定', () => {
  it('不同 seed 抽样 100 列至少 10 列高度不同', () => {
    initTerrain('a');
    const ha: number[] = [];
    for (let i = 0; i < 100; i++) ha.push(surfaceHeight(i * 3 - 150, i * 7 - 350));

    initTerrain('b');
    let diff = 0;
    for (let i = 0; i < 100; i++) {
      if (surfaceHeight(i * 3 - 150, i * 7 - 350) !== ha[i]) diff++;
    }
    expect(diff).toBeGreaterThanOrEqual(10);
    initTerrain(SEED); // 还原默认 seed
  });

  it('isTreeColumn M1 版恒为 false', () => {
    initTerrain(SEED);
    expect(isTreeColumn(0, 0)).toBe(false);
    expect(isTreeColumn(-1234, 987)).toBe(false);
    expect(isTreeColumn(999999, -999999)).toBe(false);
  });
});

describe('抽样统计与性能', () => {
  beforeEach(() => initTerrain(SEED));

  it('20×20 chunk 表面高度范围抽样 + 单 chunk 生成耗时（输出报告用）', () => {
    // --- 高度范围：覆盖 cx,cz ∈ [-10..9]，共 400 chunk / 102400 列 ---
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let waterCols = 0;
    let totalCols = 0;
    for (let wx = -160; wx < 160; wx++) {
      for (let wz = -160; wz < 160; wz++) {
        const sh = surfaceHeight(wx, wz);
        if (sh < min) min = sh;
        if (sh > max) max = sh;
        if (sh <= SEA_LEVEL) waterCols++;
        totalCols++;
      }
    }
    console.info(
      `[terragen 抽样] seed=${SEED} 采样 ${totalCols} 列 | ` +
      `min=${min} max=${max} | 水面及以下列 ${(waterCols / totalCols * 100).toFixed(2)}%`,
    );

    // --- 分块极值表（供 W4 地形调参参考）：4×4 大区抽样 ---
    const rows: string[] = [];
    for (let bx = -160; bx < 160; bx += 80) {
      const cells: string[] = [];
      for (let bz = -160; bz < 160; bz += 80) {
        let lo = Number.POSITIVE_INFINITY;
        let hi = Number.NEGATIVE_INFINITY;
        for (let dx = 0; dx < 80; dx += 5) {
          for (let dz = 0; dz < 80; dz += 5) {
            const v = surfaceHeight(bx + dx, bz + dz);
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        }
        cells.push(`${lo}-${hi}`);
      }
      rows.push(`x∈[${bx},${bx + 79}]: ${cells.join('  ')}`);
    }
    console.info(`[terragen 极值表] 每 cell 为 80×80 区域的 min-max\n${rows.join('\n')}`);

    // --- 性能：单 chunk 平均耗时目标 < 8ms ---
    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      createChunkData(i % 7, -(i % 11));
      samples.push(performance.now() - t0);
    }
    const avg = samples.reduce((s, v) => s + v, 0) / samples.length;
    samples.sort((a, b) => a - b);
    console.info(
      `[terragen 性能] 50 chunks avg=${avg.toFixed(3)}ms p50=${samples[25].toFixed(3)}ms ` +
      `p95=${samples[47].toFixed(3)}ms max=${samples[samples.length - 1].toFixed(3)}ms`,
    );
    expect(avg).toBeLessThan(8);
    expect(min).toBeGreaterThanOrEqual(SEA_LEVEL - 12); // 公式下界 SEA-8-3
    expect(max).toBeLessThanOrEqual(WORLD_H - 8);
  }, 30000);
});
