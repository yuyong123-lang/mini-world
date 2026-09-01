// 京津冀区域单测（W1-A2）：北京增强（覆盖 legacy + 祈年殿）/ 天津（小洋楼 +
// 天津之眼）/ 河北（民居 + 赵州桥）。
// 覆盖：三区域确定性 / 北京兼容哨兵（除 structures 外与 legacy 逐字段一致）/
// 区域地形特征（天津平缓、河北有山）/ 四 kind 特征方块锚点断言 / 大半径
// kind（r6/r7）anchorMargin 边距。
// 注意：活动区域是模块级状态——每处 initTerrain 后才可 createChunkData。
import { describe, expect, it } from 'vitest';

import { REGIONS, makeSeedForRegion } from '../../src/data/regions';
import type { StructureKind } from '../../src/data/regions';
import { legacyRegions } from '../../src/data/regions/parts/legacy';
import { CHUNK_W, SEA_LEVEL, voxelIndex } from '../../src/core/constants';
import { BLOCK } from '../../src/blocks/registry';
import { STRUCT_CELL, anchorMargin, anchorSuitable, structureAnchor } from '../../src/world/structures';
import { createChunkData, initTerrain, surfaceHeight } from '../../src/world/terragen';

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
 * 按 kind 找锚点：先扫 ±6 cell，稀有 kind（cellDensity≈0.02）放宽到 ±16
 * 再找一次（与 tests/structures.test.ts 的 findKindAnchor 同模式）。
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
        if (!anchorSuitable(a, kind, heightAt)) continue; // 与生成流同一校验
        return a;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 确定性（区域定制改动的总闸）
// ---------------------------------------------------------------------------

describe('京津冀三区域确定性', () => {
  for (const id of ['beijing', 'tianjin', 'hebei'] as const) {
    it(`区域 ${id}：同 seed 两次生成 (0,0)(2,-3) 逐字节一致`, () => {
      for (const [cx, cz] of [[0, 0], [2, -3]] as const) {
        initTerrain(makeSeedForRegion(id, 'w1-a2'));
        const a = createChunkData(cx, cz);
        initTerrain(makeSeedForRegion(id, 'w1-a2'));
        const b = createChunkData(cx, cz);
        expect(bytesEqual(a, b)).toBe(true);
      }
    }, 30_000);
  }
});

// ---------------------------------------------------------------------------
// 北京增强：结构表追加祈年殿，其余字段与 legacy 逐字一致（兼容哨兵）
// ---------------------------------------------------------------------------

describe('北京增强（覆盖 legacy）', () => {
  it('结构表含三种 kind，qinianden 密度 0.015', () => {
    const s = REGIONS.beijing!.terrain.structures;
    expect(s).toEqual([
      { kind: 'siheyuan', cellDensity: 0.22 },
      { kind: 'palace', cellDensity: 0.02 },
      { kind: 'qinianden', cellDensity: 0.015 },
    ]);
  });

  it('兼容哨兵：除 terrain.structures 外与 legacy beijing 逐字段一致', () => {
    const w1 = REGIONS.beijing!;
    const old = legacyRegions.beijing;
    expect(w1).not.toBe(old); // 覆盖生效（不再是 legacy 同一对象）
    expect(w1.id).toBe(old.id);
    expect(w1.name).toBe(old.name);
    expect(w1.blurb).toBe(old.blurb);
    expect(w1.mapColor).toBe(old.mapColor);
    expect(w1.animals).toEqual(old.animals); // 动物表逐字保留
    expect(w1.animalGround).toEqual(old.animalGround);
    expect(w1.atmosphere).toEqual(old.atmosphere); // 氛围逐字保留
    expect(w1.terrain.trees).toEqual(old.terrain.trees); // pagoda 树表逐字保留
    expect(w1.terrain.surface).toEqual(old.terrain.surface);
    for (const k of [
      'baseOffset',
      'contAmp',
      'hillsAmp',
      'ridgeAmp',
      'tempBias',
      'desertBias',
      'snowBias',
    ] as const) {
      expect(w1.terrain[k]).toBe(old.terrain[k]);
    }
  });
});

// ---------------------------------------------------------------------------
// 天津 / 河北区域特征
// ---------------------------------------------------------------------------

describe('天津 / 河北区域特征', () => {
  it('天津：滨海平原低起伏（baseOffset 0 / ridgeAmp 6）+ 小洋楼/摩天轮结构表', () => {
    const def = REGIONS.tianjin!;
    expect(def.terrain.baseOffset).toBe(0);
    expect(def.terrain.contAmp).toBe(3);
    expect(def.terrain.hillsAmp).toBe(1.5);
    expect(def.terrain.ridgeAmp).toBe(6);
    expect(def.terrain.trees.kinds).toEqual([
      { kind: 'pagoda', weight: 0.5 },
      { kind: 'oak', weight: 0.5 },
    ]);
    expect(def.terrain.structures).toEqual([
      { kind: 'xiaoyanglou', cellDensity: 0.2 },
      { kind: 'eyed_wheel', cellDensity: 0.02 },
    ]);
    expect(def.atmosphere.fogScale).toBe(1.05);
    expect(def.atmosphere.waterTint).toBe('#4a7a9a'); // 海河蓝
  });

  it('河北：太行山脚（ridgeAmp 12）+ 民居/赵州桥结构表 + horse 出没', () => {
    const def = REGIONS.hebei!;
    expect(def.terrain.baseOffset).toBe(1);
    expect(def.terrain.ridgeAmp).toBe(12);
    expect(def.terrain.snowBias).toBe(0.35);
    expect(def.terrain.structures).toEqual([
      { kind: 'house', cellDensity: 0.15 },
      { kind: 'zhaozhou_bridge', cellDensity: 0.02 },
    ]);
    expect(def.animals.map((a) => a.key)).toEqual(['pig', 'cow', 'sheep', 'horse']);
    expect(def.atmosphere.waterTint).toBe('#4a7a9a');
  });

  it('地形对比：天津平缓（无高地）、河北有山（有显著高地）', () => {
    const probe = (id: 'tianjin' | 'hebei'): { range: number; above8: number; total: number } => {
      initTerrain(makeSeedForRegion(id, 'cmp-range'));
      let min = Number.MAX_SAFE_INTEGER;
      let max = 0;
      let above8 = 0;
      let total = 0;
      for (let x = -200; x <= 200; x += 5) {
        for (let z = -200; z <= 200; z += 5) {
          const h = surfaceHeight(x, z);
          total++;
          if (h < min) min = h;
          if (h > max) max = h;
          if (h > SEA_LEVEL + 8) above8++;
        }
      }
      return { range: max - min, above8, total };
    };
    const tj = probe('tianjin');
    const hb = probe('hebei');
    // 天津：滨海平原（ridgeAmp 6）——极差小、无超出海平面 8 格以上的高地
    expect(tj.range).toBeLessThanOrEqual(9);
    expect(tj.above8).toBe(0);
    // 河北：太行山脚（ridgeAmp 12）——有显著高地，整体极差也更大
    expect(hb.above8 / hb.total).toBeGreaterThan(0.005);
    expect(hb.range).toBeGreaterThan(tj.range);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 四 kind 特征方块锚点断言（参照 tests/structures.test.ts 的 findAnchor 模式；
// 跨 chunk 一致性已由 structures.test 自动派生覆盖，此处不重复）
// ---------------------------------------------------------------------------

const FEATURE_CASES: Array<{
  region: 'beijing' | 'tianjin' | 'hebei';
  kind: StructureKind;
  density: number;
  block: number;
}> = [
  { region: 'beijing', kind: 'qinianden', density: 0.015, block: BLOCK.BLUE_TILE },
  { region: 'tianjin', kind: 'eyed_wheel', density: 0.02, block: BLOCK.CONCRETE },
  { region: 'tianjin', kind: 'xiaoyanglou', density: 0.2, block: BLOCK.PASTEL_WALL },
  { region: 'hebei', kind: 'zhaozhou_bridge', density: 0.02, block: BLOCK.WHITE_STONE },
];

describe('京津冀结构特征方块', () => {
  for (const { region, kind, density, block } of FEATURE_CASES) {
    const seed = makeSeedForRegion(region, 'w1-feature');
    it(`${region}/${kind}：锚点附近落特征方块（0x${block.toString(16)}）`, () => {
      const anchor = findKindAnchor(seed, kind, density);
      expect(anchor).not.toBeNull();
      const { get } = makeReader(seed);
      const fy = surfaceHeight(anchor!.x, anchor!.z) + 1;
      let seen = false;
      for (let dx = -5; dx <= 5 && !seen; dx++) {
        for (let dz = -5; dz <= 5 && !seen; dz++) {
          for (let y = fy; y <= fy + 14; y++) {
            if (get(anchor!.x + dx, y, anchor!.z + dz) === block) {
              seen = true;
              break;
            }
          }
        }
      }
      expect(seen).toBe(true);
    }, 30_000);
  }

  it('大半径 kind（r6/r7）锚点偏移含 anchorMargin 边距（footprint 不跨 cell）', () => {
    for (const [kind, m] of [
      ['qinianden', 6],
      ['eyed_wheel', 6],
      ['zhaozhou_bridge', 7],
    ] as const) {
      expect(anchorMargin(kind)).toBe(m);
      for (let i = 0; i < 20; i++) {
        const a = structureAnchor(i, -i, kind, 1);
        if (!a) continue;
        expect(a.x).toBeGreaterThanOrEqual(i * STRUCT_CELL + m);
        expect(a.x).toBeLessThan((i + 1) * STRUCT_CELL - m);
        expect(a.z).toBeGreaterThanOrEqual(-i * STRUCT_CELL + m);
        expect(a.z).toBeLessThan((i + 1) * STRUCT_CELL - m);
      }
    }
  });
});
