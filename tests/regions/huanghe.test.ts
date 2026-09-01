// 黄河四省区域单测（W2-A1）：shanxi（黄土高原 + 应县木塔）/ shandong（泰山胶东 +
// 孔庙大成殿/海草房）/ henan（中原沃野 + 少林塔林）/ shaanxi（关中秦岭 + 大雁塔）。
// 覆盖：四区域确定性（同 seed 逐字节）/ 区域地形特征（山西沟壑 vs 河南平原）/
// 结构表与树表氛围动物约定（陕西 panda 稀有位 ≤0.08）/ 五 kind 锚点特征方块
// / 塔林独有断言（同一锚点重复 stamp 塔数一致、任一塔 ≥3 层）。
// 注意：活动区域是模块级状态——每处 initTerrain 后才可 createChunkData；
// 跨 chunk 双算一致性由 tests/structures.test.ts 的自动派生用例覆盖，此处不重复。
import { describe, expect, it } from 'vitest';

import { REGIONS, makeSeedForRegion } from '../../src/data/regions';
import type { StructureKind } from '../../src/data/regions';
import { CHUNK_W, SEA_LEVEL, voxelIndex } from '../../src/core/constants';
import { BLOCK } from '../../src/blocks/registry';
import { FEATURE_BLOCK, anchorSuitable, structureAnchor } from '../../src/world/structures';
import { createChunkData, initTerrain, surfaceHeight } from '../../src/world/terragen';
import {
  stampConfuciusHall,
  stampDayanPagoda,
  stampPagodaForest,
  stampSeaweedHouse,
  stampYingxianPagoda,
} from '../../src/world/buildings/huanghe';
import type { StructPut } from '../../src/world/buildings/kit';

const REGION_IDS = ['shanxi', 'shandong', 'henan', 'shaanxi'] as const;
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
 * 与 tests/regions/northeast.test.ts 的 findKindAnchor 同式）。
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
        if (!anchorSuitable(a, kind, heightAt)) continue;
        return a;
      }
    }
  }
  return null;
}

/**
 * 7×7 chunk 网格的地形起伏统计（山地/平原判据）：
 *   mean = 单 chunk 采样高度极差的均值（平均崎岖度）
 *   range = 大范围抽样海拔极差（山脊振幅的体现）
 */
function reliefStats(id: Rid): { mean: number; range: number; hmax: number } {
  initTerrain(makeSeedForRegion(id, '777'));
  let sum = 0;
  let n = 0;
  let gmin = Number.MAX_SAFE_INTEGER;
  let gmax = 0;
  for (let cx = -3; cx <= 3; cx++) {
    for (let cz = -3; cz <= 3; cz++) {
      let mn = Number.MAX_SAFE_INTEGER;
      let mx = 0;
      for (let lx = 0; lx < CHUNK_W; lx += 2) {
        for (let lz = 0; lz < CHUNK_W; lz += 2) {
          const h = surfaceHeight(cx * CHUNK_W + lx, cz * CHUNK_W + lz);
          if (h < mn) mn = h;
          if (h > mx) mx = h;
        }
      }
      sum += mx - mn;
      n++;
    }
  }
  for (let x = -200; x <= 200; x += 5) {
    for (let z = -200; z <= 200; z += 5) {
      const h = surfaceHeight(x, z);
      if (h < gmin) gmin = h;
      if (h > gmax) gmax = h;
    }
  }
  return { mean: sum / n, range: gmax - gmin, hmax: gmax };
}

// ---------------------------------------------------------------------------
// 确定性（区域定制改动的总闸）
// ---------------------------------------------------------------------------

describe('黄河四省确定性', () => {
  for (const id of REGION_IDS) {
    it(`区域 ${id}：同 seed 两次生成 (0,0)(2,-3) 逐字节一致`, () => {
      for (const [cx, cz] of [[0, 0], [2, -3]] as const) {
        initTerrain(makeSeedForRegion(id, 'w2-a1'));
        const a = createChunkData(cx, cz);
        initTerrain(makeSeedForRegion(id, 'w2-a1'));
        const b = createChunkData(cx, cz);
        expect(bytesEqual(a, b)).toBe(true);
      }
    }, 30_000);
  }
});

// ---------------------------------------------------------------------------
// 区域参数约定：结构表 / 树表 / 氛围 / 动物
// ---------------------------------------------------------------------------

describe('黄河四省区域参数', () => {
  it('山西：晋中大院 + 应县木塔；杨树混交；干燥微黄天空 + 黄河土黄水色', () => {
    const def = REGIONS.shanxi!;
    expect(def.terrain.structures).toEqual([
      { kind: 'siheyuan', cellDensity: 0.12 },
      { kind: 'yingxian_pagoda', cellDensity: 0.02 },
    ]);
    expect(def.terrain.trees.chance).toBe(0.008);
    expect(def.terrain.trees.kinds).toEqual([
      { kind: 'oak', weight: 0.6 },
      { kind: 'poplar', weight: 0.4 },
    ]);
    expect(def.terrain.hillsAmp).toBe(5);
    expect(def.terrain.ridgeAmp).toBe(16);
    expect(def.atmosphere.fogScale).toBe(1.1);
    expect(def.atmosphere.waterTint).toBe('#8a7a4a');
    expect(def.animals.map((a) => a.key)).toEqual(['sheep', 'cow', 'pig']);
    expect(def.animalGround).toEqual(['GRASS']);
  });

  it('山东：海草房 + 孔庙大成殿；国槐混交；海蓝水色', () => {
    const def = REGIONS.shandong!;
    expect(def.terrain.structures).toEqual([
      { kind: 'seaweed_house', cellDensity: 0.15 },
      { kind: 'confucius_hall', cellDensity: 0.02 },
    ]);
    expect(def.terrain.trees.kinds).toEqual([
      { kind: 'oak', weight: 0.6 },
      { kind: 'pagoda', weight: 0.4 },
    ]);
    expect(def.terrain.trees.chance).toBe(0.01);
    expect(def.atmosphere.fogScale).toBe(1);
    expect(def.atmosphere.waterTint).toBe('#3a6a9a'); // 渤海蓝
    expect(def.animals.map((a) => a.key)).toEqual(['pig', 'cow', 'sheep']);
  });

  it('河南：民居 + 少林塔林；低振幅平原参数', () => {
    const def = REGIONS.henan!;
    expect(def.terrain.structures).toEqual([
      { kind: 'house', cellDensity: 0.15 },
      { kind: 'pagoda_forest', cellDensity: 0.02 },
    ]);
    expect(def.terrain.trees.kinds).toEqual([
      { kind: 'pagoda', weight: 0.5 },
      { kind: 'oak', weight: 0.5 },
    ]);
    expect(def.terrain.contAmp).toBe(3);
    expect(def.terrain.hillsAmp).toBe(2.5);
    expect(def.terrain.ridgeAmp).toBe(8);
    expect(def.atmosphere.fogScale).toBe(1);
    expect(def.animals.map((a) => a.key)).toEqual(['pig', 'cow', 'sheep']);
  });

  it('陕西：关中民居 + 大雁塔；杨树混交；秦岭大熊猫稀有位 ≤ 0.08', () => {
    const def = REGIONS.shaanxi!;
    expect(def.terrain.structures).toEqual([
      { kind: 'siheyuan', cellDensity: 0.15 },
      { kind: 'dayan_pagoda', cellDensity: 0.02 },
    ]);
    expect(def.terrain.trees.kinds).toEqual([
      { kind: 'poplar', weight: 0.6 },
      { kind: 'oak', weight: 0.4 },
    ]);
    expect(def.terrain.desertBias).toBe(0.25);
    expect(def.atmosphere.fogScale).toBe(1.05);
    const panda = def.animals.find((a) => a.key === 'panda');
    expect(panda).toBeDefined();
    expect(panda!.weight).toBeLessThanOrEqual(0.08);
    expect(def.animals.filter((a) => a.key === 'panda').length).toBe(1);
    expect(def.animalGround).toEqual(['GRASS']);
  });

  it('四区域动物表均不引入雪原/沙地特有物种（家畜为主），地面限定 GRASS', () => {
    for (const id of REGION_IDS) {
      const def = REGIONS[id]!;
      for (const a of def.animals) {
        expect(['pig', 'cow', 'sheep', 'panda']).toContain(a.key);
        expect(a.weight).toBeGreaterThan(0);
      }
      expect(def.animalGround).toEqual(['GRASS']);
    }
  });
});

// ---------------------------------------------------------------------------
// 地形特征：山西沟壑 vs 河南平原
// ---------------------------------------------------------------------------

describe('黄河四省地形特征', () => {
  it('山西沟壑（hillsAmp 5 / ridgeAmp 16）起伏显著大于河南平原', () => {
    const sx = reliefStats('shanxi');
    const hn = reliefStats('henan');
    expect(sx.mean).toBeGreaterThan(hn.mean);
    expect(sx.range).toBeGreaterThan(hn.range + 4); // 大范围海拔极差差距明显
  }, 30_000);

  it('河南中原沃野平缓：大范围海拔极差 ≤ 14 格、平均单 chunk 起伏 ≤ 2.5 格', () => {
    const hn = reliefStats('henan');
    expect(hn.range).toBeLessThanOrEqual(14);
    expect(hn.mean).toBeLessThanOrEqual(2.5);
  }, 30_000);

  it('山东有泰山类山脊、陕西有秦岭类山脊（大范围海拔极差 ≥ 14 格）', () => {
    expect(reliefStats('shandong').range).toBeGreaterThanOrEqual(14);
    expect(reliefStats('shaanxi').range).toBeGreaterThanOrEqual(14);
  }, 30_000);

  it('四区域抽样高度全部钳制在 [SEA_LEVEL, WORLD_H-10]', () => {
    for (const id of REGION_IDS) {
      initTerrain(makeSeedForRegion(id, 'clamp'));
      for (let i = 0; i < 800; i++) {
        const h = surfaceHeight((i * 37) % 400 - 200, (i * 73) % 400 - 200);
        expect(h).toBeGreaterThanOrEqual(SEA_LEVEL);
        expect(h).toBeLessThanOrEqual(54); // WORLD_H − 10
      }
    }
  });

  it('四区域两两之间地形确有差异（同坐标抽样高度向量不同）', () => {
    const probe = (id: Rid): number[] => {
      initTerrain(makeSeedForRegion(id, 'cmp'));
      const hs: number[] = [];
      for (let i = 0; i < 40; i++) hs.push(surfaceHeight(i * 9 - 180, i * 13 - 240));
      return hs;
    };
    const base = probe('shanxi');
    for (const other of ['shandong', 'henan', 'shaanxi'] as const) {
      const hs = probe(other);
      const diff = hs.filter((h, i) => h !== base[i]).length;
      expect(diff).toBeGreaterThan(5);
    }
  });
});

// ---------------------------------------------------------------------------
// 五 kind 锚点特征方块（跨 chunk 硬闸由 tests/structures.test.ts 自动派生覆盖）
// ---------------------------------------------------------------------------

const FEATURE_CASES: Array<{
  region: Rid;
  kind: StructureKind;
  density: number;
  block: number;
}> = [
  { region: 'shanxi', kind: 'yingxian_pagoda', density: 0.02, block: BLOCK.DARK_WOOD },
  { region: 'shandong', kind: 'confucius_hall', density: 0.02, block: BLOCK.YELLOW_TILE },
  { region: 'shandong', kind: 'seaweed_house', density: 0.15, block: BLOCK.THATCH },
  { region: 'henan', kind: 'pagoda_forest', density: 0.02, block: BLOCK.GREY_BRICK },
  { region: 'shaanxi', kind: 'dayan_pagoda', density: 0.02, block: BLOCK.GREY_BRICK },
];

describe('黄河四省结构特征方块', () => {
  for (const { region, kind, density, block } of FEATURE_CASES) {
    const seed = makeSeedForRegion(region, 'w2-feature');
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

  it('五 kind 均登记特征方块且互不混淆（DARK_WOOD/THATCH 专属）', () => {
    expect(FEATURE_BLOCK.yingxian_pagoda).toBe(BLOCK.DARK_WOOD);
    expect(FEATURE_BLOCK.confucius_hall).toBe(BLOCK.YELLOW_TILE);
    expect(FEATURE_BLOCK.seaweed_house).toBe(BLOCK.THATCH);
    expect(FEATURE_BLOCK.pagoda_forest).toBe(BLOCK.GREY_BRICK);
    expect(FEATURE_BLOCK.dayan_pagoda).toBe(BLOCK.GREY_BRICK);
  });
});

// ---------------------------------------------------------------------------
// 塔林独有断言：确定性塔数 + 层数下限（直接对 stamp 做纯函数级双算）
// ---------------------------------------------------------------------------

/** 收集 stamp 落块（纯函数，不依赖活动区域；地形用平地注入） */
function stampForest(ax: number, az: number, fy: number): Map<string, number> {
  const map = new Map<string, number>();
  const put: StructPut = (x, y, z, id) => {
    map.set(`${x},${y},${z}`, id);
  };
  stampPagodaForest(ax, az, fy, () => fy - 1, put);
  return map;
}

/** 塔数 = GREY_BRICK 宝珠数（每塔顶恰一块：上方无块、下方踩在 DARK_TILE 顶层窄檐上） */
function countTowers(map: Map<string, number>): number {
  let n = 0;
  for (const [k, id] of map) {
    if (id !== BLOCK.GREY_BRICK) continue;
    const [x, y, z] = k.split(',').map(Number) as [number, number, number];
    if (map.has(`${x},${y + 1},${z}`)) continue; // 上方有块 → 非塔顶
    if (map.get(`${x},${y - 1},${z}`) !== BLOCK.DARK_TILE) continue; // 不在檐上 → 非宝珠
    n++;
  }
  return n;
}

describe('少林塔林 stamp 独有断言', () => {
  const AX = 312;
  const AZ = -117;
  const FY = 21;

  it('同一锚点重复生成两次：落块逐项一致，塔数一致且在 7~9 座', () => {
    const a = stampForest(AX, AZ, FY);
    const b = stampForest(AX, AZ, FY);
    expect(a.size).toBe(b.size);
    for (const [k, id] of a) expect(b.get(k)).toBe(id);
    const towers = countTowers(a);
    expect(towers).toBe(countTowers(b));
    expect(towers).toBeGreaterThanOrEqual(7);
    expect(towers).toBeLessThanOrEqual(9);
  });

  it('任一塔 ≥ 3 层（中心主塔密檐层数 = DARK_TILE 檐盘数）', () => {
    const map = stampForest(AX, AZ, FY);
    let floors = 0;
    for (let y = FY; y <= FY + 16; y++) {
      if (map.get(`${AX},${y},${AZ}`) === BLOCK.DARK_TILE) floors++;
    }
    expect(floors).toBeGreaterThanOrEqual(3);
    expect(floors).toBeLessThanOrEqual(5);
  });

  it('不同锚点塔数独立派生（两锚点各落在 7~9 座）', () => {
    const a = stampForest(AX, AZ, FY);
    const c = stampForest(AX + 512, AZ + 256, FY);
    for (const map of [a, c]) {
      const towers = countTowers(map);
      expect(towers).toBeGreaterThanOrEqual(7);
      expect(towers).toBeLessThanOrEqual(9);
    }
  });

  it('其余四 stamp 同样满足纯函数双算一致（几何确定性抽查）', () => {
    const run = (stamp: typeof stampYingxianPagoda): Map<string, number> => {
      const map = new Map<string, number>();
      const put: StructPut = (x, y, z, id) => {
        map.set(`${x},${y},${z}`, id);
      };
      stamp(AX, AZ, FY, () => FY - 1, put);
      return map;
    };
    for (const stamp of [stampYingxianPagoda, stampConfuciusHall, stampSeaweedHouse, stampDayanPagoda]) {
      const a = run(stamp);
      const b = run(stamp);
      expect(a.size).toBe(b.size);
      for (const [k, id] of a) expect(b.get(k)).toBe(id);
    }
  });
});
