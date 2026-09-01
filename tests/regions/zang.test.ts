// 青藏区域单测（W3-A2）：青海（青海湖高原 + 塔尔寺八宝塔群/藏式碉房）/
// 西藏（雪域屋脊 + 布达拉宫/藏式碉房）。
// 覆盖：两区域确定性（同 seed 逐字节）/ 高原特征（西藏平均海拔高于 generic、
// 雪原占比大幅领先 generic）/ 三 kind 锚点特征方块（zangdiaofang→GREY_BRICK、
// babao_pagodas→WHITE_STONE、potala→RED_WALL）/ potala 专测（总高 ≥18、
// 白宫体量 > 红宫体量、重复生成一致）/ babao 专测（白塔数恰好 8 = 宝珠计数）。
//
// 注意：活动区域是模块级状态——每处 initTerrain 后才可 createChunkData；
// 跨 chunk 双算一致性由 tests/structures.test.ts 的自动派生用例覆盖，此处不重复。
import { describe, expect, it } from 'vitest';

import { REGIONS, makeSeedForRegion } from '../../src/data/regions';
import type { StructureKind } from '../../src/data/regions';
import { CHUNK_W, voxelIndex } from '../../src/core/constants';
import { BLOCK } from '../../src/blocks/registry';
import { FEATURE_BLOCK, anchorSuitable, structureAnchor } from '../../src/world/structures';
import { biomeAt, createChunkData, initTerrain, surfaceHeight } from '../../src/world/terragen';

/** 逐字节比较（避免依赖 Node Buffer 类型） */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** 世界坐标读取器：从 (cx,cz) 为中心的 3×3 chunk 拼接视图读体素 */
function makeReader(seed: string) {
  initTerrain(seed);
  const cache = new Map<string, Uint8Array>();
  const get = (wx: number, y: number, wz: number): number => {
    const cx = Math.floor(wx / CHUNK_W);
    const cz = Math.floor(wz / CHUNK_W);
    const key = `${cx},${cz}`;
    let d = cache.get(key);
    if (!d) {
      d = createChunkData(cx, cz);
      cache.set(key, d);
    }
    return d[voxelIndex(wx - cx * CHUNK_W, y, wz - cz * CHUNK_W)]!;
  };
  return { get };
}

/**
 * 按 kind 找第一个通过地形校验的锚点（先扫 ±6 cell，稀有密度放宽到 ±16，
 * 与 tests/structures.test.ts 的 findKindAnchor 同式）。
 */
function findKindAnchor(
  seed: string,
  kind: StructureKind,
  cellDensity: number,
): { x: number; z: number } | null {
  initTerrain(seed);
  const heightAt = (x: number, z: number): number => surfaceHeight(x, z);
  for (const range of [6, 16]) {
    for (let cellX = -range; cellX <= range; cellX++) {
      for (let cellZ = -range; cellZ <= range; cellZ++) {
        const a = structureAnchor(cellX, cellZ, kind, cellDensity);
        if (!a) continue;
        if (!anchorSuitable(a, kind, (x, z) => heightAt(x, z))) continue;
        return a;
      }
    }
  }
  return null;
}

/** 锚点附近窗口内统计某方块数量（含 min/max 落层） */
function countBlockAround(
  reader: ReturnType<typeof makeReader>,
  anchor: { x: number; z: number },
  radius: number,
  yFrom: number,
  yTo: number,
  id: number,
): { count: number; minY: number; maxY: number } {
  let count = 0;
  let minY = Number.MAX_SAFE_INTEGER;
  let maxY = Number.MIN_SAFE_INTEGER;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let y = yFrom; y <= yTo; y++) {
        if (reader.get(anchor.x + dx, y, anchor.z + dz) === id) {
          count++;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }
  return { count, minY, maxY };
}

/**
 * 大范围地形统计（海拔均值 / 最高海拔 / 群系计数）。
 * 网格固定 → 结果确定，可作跨区域比较基准。
 */
function terrainStats(id: 'qinghai' | 'xizang' | 'generic'): {
  mean: number;
  hmax: number;
  snow: number;
  grass: number;
  total: number;
} {
  initTerrain(makeSeedForRegion(id, 'w3-stat'));
  let sum = 0;
  let n = 0;
  let hmax = 0;
  let snow = 0;
  let grass = 0;
  let total = 0;
  for (let x = -300; x <= 300; x += 6) {
    for (let z = -300; z <= 300; z += 6) {
      const h = surfaceHeight(x, z);
      sum += h;
      n++;
      if (h > hmax) hmax = h;
      const b = biomeAt(x, z);
      if (b === 'snow') snow++;
      if (b === 'grass') grass++;
      total++;
    }
  }
  return { mean: sum / n, hmax, snow, grass, total };
}

/** 结构锚点特征方块断言：锚点 ±2、fy..fy+8 窗口内必须出现 FEATURE_BLOCK[kind] */
function expectFeatureBlockAtAnchor(seed: string, kind: StructureKind, density: number): void {
  const anchor = findKindAnchor(seed, kind, density);
  expect(anchor).not.toBeNull();
  const { get } = makeReader(seed);
  const feature = FEATURE_BLOCK[kind];
  const fy = surfaceHeight(anchor!.x, anchor!.z) + 1;
  let seen = false;
  for (let dx = -2; dx <= 2 && !seen; dx++) {
    for (let dz = -2; dz <= 2 && !seen; dz++) {
      for (let y = fy; y <= fy + 8; y++) {
        if (get(anchor!.x + dx, y, anchor!.z + dz) === feature) {
          seen = true;
          break;
        }
      }
    }
  }
  expect(seen).toBe(true);
}

// ---------------------------------------------------------------------------
// 确定性（区域定制改动的总闸）
// ---------------------------------------------------------------------------

describe('青藏两区域确定性', () => {
  for (const id of ['qinghai', 'xizang'] as const) {
    it(`区域 ${id}：同 seed 两次生成 (0,0)(2,-3) 逐字节一致`, () => {
      for (const [cx, cz] of [[0, 0], [2, -3]] as const) {
        initTerrain(makeSeedForRegion(id, 'w3-a2'));
        const a = createChunkData(cx, cz);
        initTerrain(makeSeedForRegion(id, 'w3-a2'));
        const b = createChunkData(cx, cz);
        expect(bytesEqual(a, b)).toBe(true);
      }
    }, 30_000);
  }
});

// ---------------------------------------------------------------------------
// 青海：参数定制 + 高原牧歌统计
// ---------------------------------------------------------------------------

describe('青海 qinghai（W3 定制）', () => {
  it('参数断言：高海拔台地 + 高原雪线 + 云杉稀树 + 碉房/八宝塔结构表', () => {
    const def = REGIONS.qinghai!;
    expect(def.terrain.baseOffset).toBe(4);
    expect(def.terrain.contAmp).toBe(4);
    expect(def.terrain.hillsAmp).toBe(3);
    expect(def.terrain.ridgeAmp).toBe(14);
    expect(def.terrain.tempBias).toBe(-0.15);
    expect(def.terrain.snowBias).toBe(0.4);
    expect(def.terrain.trees).toEqual({
      chance: 0.005,
      kinds: [{ kind: 'spruce', weight: 1 }],
      onBiomes: ['grass'],
    });
    expect(def.terrain.structures).toEqual([
      { kind: 'zangdiaofang', cellDensity: 0.15 },
      { kind: 'babao_pagodas', cellDensity: 0.02 },
    ]);
    expect(def.blurb).toContain('八宝');
    expect(def.blurb).toContain('青海湖');
  });

  it('氛围与动物：高原湛蓝天空 + 极通透雾 + 青海湖青水色；羊/牦牛/马出没于草地与雪线', () => {
    const def = REGIONS.qinghai!;
    expect(def.atmosphere.fogScale).toBe(1.3);
    expect(def.atmosphere.waterTint).toBe('#3a8ab0'); // 青海湖青
    expect(def.atmosphere.sky!.noon!.top).toBe('#2f66c0'); // 高原湛蓝（高透明）
    expect(def.animals.map((a) => a.key)).toEqual(['sheep', 'cow', 'horse']);
    expect(def.animalGround).toEqual(['GRASS', 'SNOW']); // 牲畜可上雪线草场
  });

  it('高原湖盆：雪原成片（远超 generic）且草地仍为牧歌主角之一', () => {
    const qh = terrainStats('qinghai');
    const gn = terrainStats('generic');
    expect(qh.total).toBeGreaterThan(5000);
    expect(qh.snow).toBeGreaterThan(gn.snow * 4); // 雪线大幅下压（snowBias 0.4 + 高寒）
    expect(qh.grass).toBeGreaterThan(1000); // 高原草场仍在
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 西藏：参数定制 + 雪域屋脊统计
// ---------------------------------------------------------------------------

describe('西藏 xizang（W3 定制）', () => {
  it('参数断言：世界屋脊基准 + 雪山山脊 + 云杉极稀 + 碉房/布达拉宫结构表', () => {
    const def = REGIONS.xizang!;
    expect(def.terrain.baseOffset).toBe(5); // 全区最高基准
    expect(def.terrain.contAmp).toBe(5);
    expect(def.terrain.hillsAmp).toBe(4);
    expect(def.terrain.ridgeAmp).toBe(18);
    expect(def.terrain.tempBias).toBe(-0.2);
    expect(def.terrain.snowBias).toBe(0.5);
    expect(def.terrain.trees).toEqual({
      chance: 0.003,
      kinds: [{ kind: 'spruce', weight: 1 }],
      onBiomes: ['grass'],
    });
    expect(def.terrain.structures).toEqual([
      { kind: 'zangdiaofang', cellDensity: 0.13 },
      { kind: 'potala', cellDensity: 0.02 },
    ]);
    expect(def.blurb).toContain('布达拉宫');
    expect(def.blurb).toContain('大昭寺');
    expect(def.blurb).toContain('雪域');
  });

  it('氛围与动物：神圣深蓝夜空 + 极通透雾 + 高原湖水色；牦牛为首出没于草地与雪原', () => {
    const def = REGIONS.xizang!;
    expect(def.atmosphere.fogScale).toBe(1.35);
    expect(def.atmosphere.waterTint).toBe('#3a7a9a');
    expect(def.atmosphere.sky!.night!.top).toBe('#060a1c'); // 神圣深蓝夜空
    expect(def.animals.map((a) => a.key)).toEqual(['cow', 'sheep', 'horse']);
    expect(def.animals[0]!.weight).toBe(2); // 牦牛（高原主角）
    expect(def.animalGround).toEqual(['GRASS', 'SNOW']);
  });

  it('世界屋脊：平均海拔高于 generic、最高海拔顶到钳制上限、雪原为全图主导群系', () => {
    const xz = terrainStats('xizang');
    const gn = terrainStats('generic');
    expect(xz.total).toBeGreaterThan(5000);
    expect(xz.mean).toBeGreaterThan(gn.mean); // 高海拔（baseOffset 5 + 高原台地）
    expect(xz.hmax).toBeGreaterThanOrEqual(54); // 雪山山脊顶到 MAX_HEIGHT
    expect(xz.snow).toBeGreaterThan(gn.snow * 5); // 雪线大幅下压（snowBias 0.5 + 高寒）
    expect(xz.snow).toBeGreaterThan(xz.grass); // 雪原为主（实测 ~62% vs ~38%）
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 三 kind 锚点特征方块（与 structures.test 自动派生用例同窗口）
// ---------------------------------------------------------------------------

const FEATURE_CASES: Array<{
  region: 'qinghai' | 'xizang';
  kind: StructureKind;
  density: number;
  block: number;
}> = [
  { region: 'qinghai', kind: 'zangdiaofang', density: 0.15, block: BLOCK.GREY_BRICK },
  { region: 'qinghai', kind: 'babao_pagodas', density: 0.02, block: BLOCK.WHITE_STONE },
  { region: 'xizang', kind: 'zangdiaofang', density: 0.13, block: BLOCK.GREY_BRICK },
  { region: 'xizang', kind: 'potala', density: 0.02, block: BLOCK.RED_WALL },
];

describe('青藏结构特征方块', () => {
  for (const { region, kind, density, block } of FEATURE_CASES) {
    const seed = makeSeedForRegion(region, 'w3-feature');
    it(`${region}/${kind}：锚点 ±2、fy..fy+8 窗口内落特征方块（0x${block.toString(16)}）`, () => {
      expectFeatureBlockAtAnchor(seed, kind, density);
    }, 30_000);
  }
});

// ---------------------------------------------------------------------------
// potala 布达拉宫专测：总高 / 白宫 > 红宫体量 / 重复生成一致
// ---------------------------------------------------------------------------

describe('布达拉宫 potala', () => {
  const seed = makeSeedForRegion('xizang', 'w3-feature');
  const anchor = findKindAnchor(seed, 'potala', 0.02);
  const fy = anchor ? surfaceHeight(anchor.x, anchor.z) + 1 : 0;

  it('锚点存在且场地足够低（topClamp 不削顶，总高断言前提成立）', () => {
    expect(anchor).not.toBeNull();
    expect(fy).toBeLessThanOrEqual(41); // fy+22 ≤ 63：金顶群不触顶钳制
  }, 30_000);

  it('总高 ≥ 18（锚点中心列：宫区台地 + 白宫 + 红宫 + 女儿墙）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    let topY = fy - 1;
    for (let y = 62; y >= fy; y--) {
      if (get(anchor!.x, y, anchor!.z) !== BLOCK.AIR) {
        topY = y;
        break;
      }
    }
    expect(topY - fy).toBeGreaterThanOrEqual(18);
  }, 30_000);

  it('白宫体量 > 红宫体量（WHITE_STONE 计数 > RED_WALL 计数；实测 ~6 倍）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const white = countBlockAround({ get }, anchor!, 8, fy, Math.min(fy + 30, 63), BLOCK.WHITE_STONE);
    const red = countBlockAround({ get }, anchor!, 8, fy, Math.min(fy + 30, 63), BLOCK.RED_WALL);
    expect(white.count).toBeGreaterThan(200); // 白宫大体积主楼 + 群楼
    expect(red.count).toBeGreaterThan(30); // 红宫体 + 朱红檐带
    expect(white.count).toBeGreaterThan(red.count);
  }, 30_000);

  it('重复生成一致（同 seed 两次统计逐项相等）', () => {
    expect(anchor).not.toBeNull();
    const first = makeReader(seed);
    const second = makeReader(seed);
    for (const id of [BLOCK.WHITE_STONE, BLOCK.RED_WALL, BLOCK.YELLOW_TILE, BLOCK.GREY_BRICK]) {
      const a = countBlockAround(first, anchor!, 8, fy, Math.min(fy + 30, 63), id);
      const b = countBlockAround(second, anchor!, 8, fy, Math.min(fy + 30, 63), id);
      expect(b.count).toBe(a.count);
    }
  }, 30_000);
});

// ---------------------------------------------------------------------------
// babao_pagodas 塔尔寺八宝塔群专测：白塔数恰好 8 / 重复生成一致
// ---------------------------------------------------------------------------

describe('塔尔寺八宝塔群 babao_pagodas', () => {
  const seed = makeSeedForRegion('qinghai', 'w3-feature');

  it('白塔数恰好 8（每塔恰 1 块 YELLOW_TILE 宝珠）且 WHITE_STONE 大量使用', () => {
    const anchor = findKindAnchor(seed, 'babao_pagodas', 0.02);
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const pearls = countBlockAround({ get }, anchor!, 8, 10, 55, BLOCK.YELLOW_TILE);
    expect(pearls.count).toBe(8); // 八宝如意塔：一字排开 8 座
    const white = countBlockAround({ get }, anchor!, 8, 10, 55, BLOCK.WHITE_STONE);
    expect(white.count).toBeGreaterThan(100); // 8 座白塔 + 石台基的用块量级
  }, 30_000);

  it('重复生成塔数一致（确定性）', () => {
    const anchor = findKindAnchor(seed, 'babao_pagodas', 0.02);
    expect(anchor).not.toBeNull();
    const first = countBlockAround(makeReader(seed), anchor!, 8, 10, 55, BLOCK.YELLOW_TILE);
    const second = countBlockAround(makeReader(seed), anchor!, 8, 10, 55, BLOCK.YELLOW_TILE);
    expect(second.count).toBe(first.count);
    expect(first.count).toBe(8);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 波内约定
// ---------------------------------------------------------------------------

describe('青藏波内约定', () => {
  it('两区结构表均「常见民居 + 稀有地标」双条目，密度递减', () => {
    for (const id of ['qinghai', 'xizang'] as const) {
      const st = REGIONS[id]!.terrain.structures;
      expect(st).toHaveLength(2);
      expect(st[0]!.cellDensity).toBeGreaterThan(st[1]!.cellDensity);
    }
  });

  it('两区树表只留云杉且仅长在草地（高山草甸稀树）', () => {
    for (const id of ['qinghai', 'xizang'] as const) {
      const trees = REGIONS[id]!.terrain.trees;
      expect(trees.kinds).toEqual([{ kind: 'spruce', weight: 1 }]);
      expect(trees.onBiomes).toEqual(['grass']);
      expect(trees.chance).toBeLessThanOrEqual(0.005);
    }
    expect(REGIONS.xizang!.terrain.trees.chance).toBeLessThan(REGIONS.qinghai!.terrain.trees.chance);
  });
});
