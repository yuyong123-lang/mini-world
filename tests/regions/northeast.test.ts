// 东北三省区域单测（W1-A1）：heilongjiang / jilin / liaoning。
// 覆盖：三区域确定性（同 seed 逐字节）、群系特征（黑龙江全图雪原+结冰湖面、
// 吉林长白山地 vs 辽宁平原）、结构锚点特征方块（sophia_church→RED_BRICK、
// chaoxian_house→DARK_TILE、dazhengdian→YELLOW_TILE）、动物表约定、
// 以及旧 dongbei 区域参数零扰动的黄金护栏。
//
// 注意：活动区域是模块级状态——每个用例组 beforeEach 重新 initTerrain；
// 跨 chunk 双算一致性由 tests/structures.test.ts 的自动派生用例覆盖，此处不重复。
import { beforeEach, describe, expect, it } from 'vitest';

import { REGIONS, makeSeedForRegion } from '../../src/data/regions';
import type { StructureKind } from '../../src/data/regions';
import { CHUNK_W, SEA_LEVEL, WORLD_H, voxelIndex } from '../../src/core/constants';
import { BLOCK } from '../../src/blocks/registry';
import { FEATURE_BLOCK, anchorSuitable, structureAnchor } from '../../src/world/structures';
import { biomeAt, createChunkData, initTerrain, surfaceHeight } from '../../src/world/terragen';

const REGION_IDS = ['heilongjiang', 'jilin', 'liaoning'] as const;
type Rid = (typeof REGION_IDS)[number];

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

/**
 * 7×7 chunk 网格的地形起伏统计（山地/平原判据）：
 *   mean = 单 chunk 采样高度极差的均值（平均崎岖度，对脊线落点不敏感）
 *   hmax = 采样最高海拔（山脊振幅的上界体现）
 */
function reliefStats(id: Rid): { mean: number; hmax: number } {
  initTerrain(makeSeedForRegion(id, '777'));
  let sum = 0;
  let n = 0;
  let hmax = 0;
  for (let cx = -3; cx <= 3; cx++) {
    for (let cz = -3; cz <= 3; cz++) {
      let mn = Number.MAX_SAFE_INTEGER;
      let mx = 0;
      for (let lx = 0; lx < CHUNK_W; lx += 2) {
        for (let lz = 0; lz < CHUNK_W; lz += 2) {
          const h = surfaceHeight(cx * CHUNK_W + lx, cz * CHUNK_W + lz);
          if (h < mn) mn = h;
          if (h > mx) mx = h;
          if (h > hmax) hmax = h;
        }
      }
      sum += mx - mn;
      n++;
    }
  }
  return { mean: sum / n, hmax };
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
// 黑龙江：林海雪原（全图雪原 + 结冰湖面 + 圣索菲亚教堂）
// ---------------------------------------------------------------------------

describe('黑龙江 heilongjiang', () => {
  const seed = makeSeedForRegion('heilongjiang', '777'); // = cn_heilongjiang_777
  beforeEach(() => initTerrain(seed));

  it('同 seed 两次生成 (0,0)(2,-3) 逐字节一致', () => {
    for (const [cx, cz] of [[0, 0], [2, -3]] as const) {
      const a = createChunkData(cx, cz);
      initTerrain(seed);
      const b = createChunkData(cx, cz);
      expect(bytesEqual(a, b)).toBe(true);
    }
  }, 30000);

  it('林海雪原：全图强制 snow 群系；chunk 表层无草地/沙地露头；湖面结冰（ICE）', () => {
    for (let x = -210; x <= 210; x += 7) {
      for (let z = -210; z <= 210; z += 7) {
        expect(biomeAt(x, z)).toBe('snow');
      }
    }
    // chunk (0,0) 每列自顶向下第一个非空气块：只允许 SNOW（陆表）/ ICE（冰湖）/
    // 或树与结构的方块（SPRUCE_*、PLANKS、GREY_TILE 等）——绝不许 GRASS/SAND/DIRT 露头
    initTerrain(seed);
    const data = createChunkData(0, 0);
    const bare: ReadonlySet<number> = new Set<number>([BLOCK.GRASS, BLOCK.SAND, BLOCK.DIRT]);
    for (let lx = 0; lx < CHUNK_W; lx++) {
      for (let lz = 0; lz < CHUNK_W; lz++) {
        for (let y = WORLD_H - 1; y >= 1; y--) {
          const v = data[voxelIndex(lx, y, lz)]!;
          if (v === BLOCK.AIR) continue;
          expect(bare.has(v)).toBe(false);
          break;
        }
      }
    }
    // 湖面结冰：7×7 chunk 网格内至少出现一块 ICE（waterTopBlock 生效）
    let ice = 0;
    for (let cx = -3; cx <= 3 && ice === 0; cx++) {
      for (let cz = -3; cz <= 3 && ice === 0; cz++) {
        const d = createChunkData(cx, cz);
        for (let i = 0; i < d.length; i++) {
          if (d[i] === BLOCK.ICE) {
            ice++;
            break;
          }
        }
      }
    }
    expect(ice).toBeGreaterThan(0);
  }, 30000);

  it('结构表 = 雪乡木屋(常见) + 圣索菲亚教堂(稀有)；锚点处 RED_BRICK 特征方块存在', () => {
    const st = REGIONS.heilongjiang!.terrain.structures;
    expect(st).toEqual([
      { kind: 'snow_cabin', cellDensity: 0.18 },
      { kind: 'sophia_church', cellDensity: 0.02 },
    ]);
    expectFeatureBlockAtAnchor(seed, 'sophia_church', 0.02);
  }, 30000);
});

// ---------------------------------------------------------------------------
// 吉林：长白山山地（高山雪线 + 朝鲜族青瓦民居）
// ---------------------------------------------------------------------------

describe('吉林 jilin', () => {
  const seed = makeSeedForRegion('jilin', '777');
  beforeEach(() => initTerrain(seed));

  it('同 seed 两次生成 (0,0)(2,-3) 逐字节一致', () => {
    for (const [cx, cz] of [[0, 0], [2, -3]] as const) {
      const a = createChunkData(cx, cz);
      initTerrain(seed);
      const b = createChunkData(cx, cz);
      expect(bytesEqual(a, b)).toBe(true);
    }
  }, 30000);

  it('长白山地：平均单 chunk 起伏 ≥ 2.5 格且大于辽宁；山脊海拔 ≥ 45；雪原草地混交', () => {
    const jilin = reliefStats('jilin');
    const liaoning = reliefStats('liaoning');
    expect(jilin.mean).toBeGreaterThanOrEqual(2.5);
    expect(jilin.mean).toBeGreaterThan(liaoning.mean);
    expect(jilin.hmax).toBeGreaterThanOrEqual(45);
    // 高山雪线：snowBias 0.45 + tempBias -0.25 → 雪原/草地并存
    let snow = 0;
    let grass = 0;
    for (let x = -210; x <= 210; x += 7) {
      for (let z = -210; z <= 210; z += 7) {
        if (biomeAt(x, z) === 'snow') snow++;
        if (biomeAt(x, z) === 'grass') grass++;
      }
    }
    expect(snow).toBeGreaterThan(0);
    expect(grass).toBeGreaterThan(0);
  }, 30000);

  it('结构表 = 雪乡木屋 + 朝鲜族民居；锚点处 DARK_TILE 特征方块存在', () => {
    const st = REGIONS.jilin!.terrain.structures;
    expect(st).toEqual([
      { kind: 'snow_cabin', cellDensity: 0.12 },
      { kind: 'chaoxian_house', cellDensity: 0.03 },
    ]);
    expectFeatureBlockAtAnchor(seed, 'chaoxian_house', 0.03);
  }, 30000);
});

// ---------------------------------------------------------------------------
// 辽宁：辽河平原（三省最温和 + 沈阳故宫大政殿）
// ---------------------------------------------------------------------------

describe('辽宁 liaoning', () => {
  const seed = makeSeedForRegion('liaoning', '777');
  beforeEach(() => initTerrain(seed));

  it('同 seed 两次生成 (0,0)(2,-3) 逐字节一致', () => {
    for (const [cx, cz] of [[0, 0], [2, -3]] as const) {
      const a = createChunkData(cx, cz);
      initTerrain(seed);
      const b = createChunkData(cx, cz);
      expect(bytesEqual(a, b)).toBe(true);
    }
  }, 30000);

  it('辽河平原：平均单 chunk 起伏 ≤ 2.5 格（相对平缓）；海拔 ≤ 40；草地为主', () => {
    expect(reliefStats('liaoning').hmax).toBeLessThanOrEqual(40);
    expect(reliefStats('liaoning').mean).toBeLessThanOrEqual(2.5);
    let snow = 0;
    let grass = 0;
    for (let x = -210; x <= 210; x += 7) {
      for (let z = -210; z <= 210; z += 7) {
        if (biomeAt(x, z) === 'snow') snow++;
        if (biomeAt(x, z) === 'grass') grass++;
      }
    }
    expect(grass).toBeGreaterThan(snow);
  }, 30000);

  it('结构表 = 雪乡木屋 + 大政殿；锚点处 YELLOW_TILE 特征方块存在', () => {
    const st = REGIONS.liaoning!.terrain.structures;
    expect(st).toEqual([
      { kind: 'snow_cabin', cellDensity: 0.1 },
      { kind: 'dazhengdian', cellDensity: 0.02 },
    ]);
    expectFeatureBlockAtAnchor(seed, 'dazhengdian', 0.02);
  }, 30000);
});

// ---------------------------------------------------------------------------
// 波内约定与旧档护栏
// ---------------------------------------------------------------------------

describe('东北三省波内约定', () => {
  it('虎仅黑吉两区且 weight ≤ 0.05；动物地面含 SNOW 仅黑吉', () => {
    const hlj = REGIONS.heilongjiang!;
    const jl = REGIONS.jilin!;
    const ln = REGIONS.liaoning!;
    for (const def of [hlj, jl]) {
      const tiger = def.animals.find((a) => a.key === 'tiger');
      expect(tiger).toBeDefined();
      expect(tiger!.weight).toBeLessThanOrEqual(0.05);
      expect(def.animalGround).toContain('SNOW');
    }
    expect(ln.animals.find((a) => a.key === 'tiger')).toBeUndefined();
    expect(ln.animalGround).toEqual(['GRASS']);
  });

  it('旧 dongbei 区域（legacy 冻结）参数零扰动：地形/结构表与旧世界逐字段一致', () => {
    const d = REGIONS.dongbei!.terrain;
    expect(d.baseOffset).toBe(1);
    expect(d.contAmp).toBe(5);
    expect(d.hillsAmp).toBe(3);
    expect(d.ridgeAmp).toBe(16);
    expect(d.tempBias).toBe(0);
    expect(d.snowBias).toBe(0);
    expect(d.forceBiome).toBe('snow');
    expect(d.waterTopBlock).toBe('ICE');
    expect(d.trees).toEqual({ chance: 0.014, kinds: [{ kind: 'spruce', weight: 1 }], onBiomes: ['snow'] });
    expect(d.structures).toEqual([{ kind: 'snow_cabin', cellDensity: 0.18 }]);
    expect(REGIONS.dongbei!.animalGround).toEqual(['SNOW', 'GRASS']);
  });

  it('三区域两两之间地形确有差异（同坐标抽样高度向量不同）', () => {
    const probe = (id: Rid): number[] => {
      initTerrain(makeSeedForRegion(id, 'cmp'));
      const hs: number[] = [];
      for (let i = 0; i < 40; i++) hs.push(surfaceHeight(i * 9 - 180, i * 13 - 240));
      return hs;
    };
    const base = probe('heilongjiang');
    for (const other of ['jilin', 'liaoning'] as const) {
      const hs = probe(other);
      const diff = hs.filter((h, i) => h !== base[i]).length;
      expect(diff).toBeGreaterThan(5);
    }
  });

  it('水面高度语义：海平面以下列回退 SEA_LEVEL（三区域共用）', () => {
    initTerrain(makeSeedForRegion('heilongjiang', '777'));
    for (let i = 0; i < 500; i++) {
      const h = surfaceHeight((i * 37) % 400 - 200, (i * 73) % 400 - 200);
      expect(h).toBeGreaterThanOrEqual(SEA_LEVEL);
      expect(h).toBeLessThanOrEqual(WORLD_H - 10);
    }
  });
});
