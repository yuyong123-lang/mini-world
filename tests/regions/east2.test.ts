// 华东2区域单测（W4-A2）：上海（都市平原 + 石库门/东方明珠）/ 浙江（江南山水 +
// 民居/雷峰塔）/ 福建（闽地山海 + 圆形土楼/民居）。
// 覆盖：三区域确定性（同 seed 逐字节）/ 上海地形极平（为高塔压平）+ 福建山地
// 对比（起伏 > 上海）/ 三区域参数与氛围/动物断言 / 四 kind 锚点特征方块
// （跨 chunk 一致性由 structures.test 自动派生覆盖）/ pearl_tower 专测（总高
// ≥24 中心列连续、双球体 GLASS_CURTAIN>30、重复生成一致）/ tulou 专测（8 向
// 射线环形墙完整、内院非实心、重复生成一致）/ leifeng 专测（五层腰檐垂直分布）。
//
// 注意：活动区域是模块级状态——每处 initTerrain 后才可 createChunkData。
import { describe, expect, it } from 'vitest';

import { REGIONS, makeSeedForRegion } from '../../src/data/regions';
import type { StructureKind } from '../../src/data/regions';
import { CHUNK_W, SEA_LEVEL, voxelIndex } from '../../src/core/constants';
import { BLOCK } from '../../src/blocks/registry';
import { anchorSuitable, structureAnchor } from '../../src/world/structures';
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

/** 锚点附近窗口内统计某方块数量 */
function countBlockAround(
  reader: ReturnType<typeof makeReader>,
  anchor: { x: number; z: number },
  radius: number,
  yFrom: number,
  yTo: number,
  id: number,
): number {
  let count = 0;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let y = yFrom; y <= yTo; y++) {
        if (reader.get(anchor.x + dx, y, anchor.z + dz) === id) count++;
      }
    }
  }
  return count;
}

/**
 * 大范围地形统计（海拔极差 / 超出海平面 8 格的高地占比）。
 * 网格固定 → 结果确定，可作跨区域比较基准。
 */
function terrainRange(id: 'shanghai' | 'zhejiang' | 'fujian'): {
  range: number;
  above8: number;
  total: number;
} {
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
}

// ---------------------------------------------------------------------------
// 确定性（区域定制改动的总闸）
// ---------------------------------------------------------------------------

describe('华东2三区域确定性', () => {
  for (const id of ['shanghai', 'zhejiang', 'fujian'] as const) {
    it(`区域 ${id}：同 seed 两次生成 (0,0)(2,-3) 逐字节一致`, () => {
      for (const [cx, cz] of [[0, 0], [2, -3]] as const) {
        initTerrain(makeSeedForRegion(id, 'w4-a2'));
        const a = createChunkData(cx, cz);
        initTerrain(makeSeedForRegion(id, 'w4-a2'));
        const b = createChunkData(cx, cz);
        expect(bytesEqual(a, b)).toBe(true);
      }
    }, 30_000);
  }
});

// ---------------------------------------------------------------------------
// 三区域参数 / 氛围 / 动物断言
// ---------------------------------------------------------------------------

describe('上海 shanghai（W4 定制）', () => {
  it('参数断言：三角洲冲积平原极平 + 行道树 + 石库门/东方明珠结构表', () => {
    const def = REGIONS.shanghai!;
    expect(def.terrain.baseOffset).toBe(0);
    expect(def.terrain.contAmp).toBe(3);
    expect(def.terrain.hillsAmp).toBe(1.5);
    expect(def.terrain.ridgeAmp).toBe(5);
    expect(def.terrain.tempBias).toBe(0.15);
    expect(def.terrain.snowBias).toBe(0.05);
    expect(def.terrain.trees.chance).toBe(0.006);
    expect(def.terrain.trees.kinds).toEqual([
      { kind: 'pagoda', weight: 0.5 },
      { kind: 'oak', weight: 0.5 },
    ]);
    expect(def.terrain.structures).toEqual([
      { kind: 'shikumen', cellDensity: 0.2 },
      { kind: 'pearl_tower', cellDensity: 0.02 },
    ]);
    expect(def.blurb).toContain('东方明珠');
    expect(def.blurb).toContain('外滩');
    expect(def.blurb).toContain('石库门');
  });

  it('氛围与动物：都市亮蓝晴空 + 黄浦江水色；猪/牛/羊出没于草地', () => {
    const def = REGIONS.shanghai!;
    expect(def.atmosphere.fogScale).toBe(1);
    expect(def.atmosphere.waterTint).toBe('#4a7a9a'); // 黄浦江蓝
    expect(def.atmosphere.sky!.noon!.top).toBe('#8ecaf8'); // 都市亮蓝
    expect(def.animals.map((a) => a.key)).toEqual(['pig', 'cow', 'sheep']);
    expect(def.animals.map((a) => a.weight)).toEqual([1, 0.8, 0.5]);
    expect(def.animalGround).toEqual(['GRASS']);
  });
});

describe('浙江 zhejiang（W4 定制）', () => {
  it('参数断言：江南丘陵 + 茶山树种 + 民居/雷峰塔结构表', () => {
    const def = REGIONS.zhejiang!;
    expect(def.terrain.baseOffset).toBe(0);
    expect(def.terrain.contAmp).toBe(3);
    expect(def.terrain.hillsAmp).toBe(3);
    expect(def.terrain.ridgeAmp).toBe(10);
    expect(def.terrain.tempBias).toBe(0.15);
    expect(def.terrain.snowBias).toBe(0.05);
    expect(def.terrain.trees.chance).toBe(0.011);
    expect(def.terrain.trees.kinds).toEqual([
      { kind: 'tea', weight: 0.4 },
      { kind: 'oak', weight: 0.35 },
      { kind: 'pagoda', weight: 0.25 },
    ]);
    expect(def.terrain.structures).toEqual([
      { kind: 'house', cellDensity: 0.16 },
      { kind: 'leifeng_pagoda', cellDensity: 0.02 },
    ]);
    expect(def.atmosphere.fogScale).toBe(0.8); // 西湖烟雨
    expect(def.atmosphere.waterTint).toBe('#3a8a6a'); // 西湖绿
    expect(def.blurb).toContain('雷峰塔');
    expect(def.blurb).toContain('西湖');
    expect(def.blurb).toContain('龙井');
  });
});

describe('福建 fujian（W4 定制）', () => {
  it('参数断言：闽中山地 + 亚热带暖湿 + 土楼/民居结构表', () => {
    const def = REGIONS.fujian!;
    expect(def.terrain.baseOffset).toBe(1);
    expect(def.terrain.contAmp).toBe(4);
    expect(def.terrain.hillsAmp).toBe(5);
    expect(def.terrain.ridgeAmp).toBe(18); // 多山：武夷山/戴云山
    expect(def.terrain.tempBias).toBe(0.2); // 亚热带
    expect(def.terrain.snowBias).toBe(0); // 终年无雪
    expect(def.terrain.trees.chance).toBe(0.012);
    expect(def.terrain.trees.kinds).toEqual([
      { kind: 'palm', weight: 0.4 },
      { kind: 'banana', weight: 0.3 },
      { kind: 'oak', weight: 0.3 },
    ]);
    expect(def.terrain.structures).toEqual([
      { kind: 'tulou', cellDensity: 0.1 },
      { kind: 'house', cellDensity: 0.08 },
    ]);
    expect(def.atmosphere.fogScale).toBe(0.9);
    expect(def.atmosphere.waterTint).toBe('#2a7a9a'); // 东海蓝
    expect(def.animals.map((a) => a.key)).toEqual(['pig', 'cow', 'sheep']);
    expect(def.blurb).toContain('土楼');
    expect(def.blurb).toContain('鼓浪屿');
    expect(def.blurb).toContain('武夷山');
  });

  it('波内约定：三区结构表均「常见 + 稀有」双条目且密度递减', () => {
    for (const id of ['shanghai', 'zhejiang', 'fujian'] as const) {
      const st = REGIONS[id]!.terrain.structures;
      expect(st).toHaveLength(2);
      expect(st[0]!.cellDensity).toBeGreaterThan(st[1]!.cellDensity);
    }
  });
});

// ---------------------------------------------------------------------------
// 地形对比：上海极平（高塔压平）vs 福建山地
// ---------------------------------------------------------------------------

describe('沪闽地形对比', () => {
  it('上海：三角洲冲积平原极平（极差小、无显著高地）', () => {
    const sh = terrainRange('shanghai');
    expect(sh.total).toBeGreaterThan(5000);
    expect(sh.range).toBeLessThanOrEqual(8); // ridgeAmp 5：极平
    expect(sh.above8).toBe(0); // 无超出海平面 8 格以上的高地
  }, 30_000);

  it('福建：闽中山地（起伏显著大于上海、有明显高地）', () => {
    const sh = terrainRange('shanghai');
    const fj = terrainRange('fujian');
    expect(fj.range).toBeGreaterThan(sh.range); // 起伏 > 上海
    expect(fj.range).toBeGreaterThanOrEqual(15);
    expect(fj.above8 / fj.total).toBeGreaterThan(0.005); // 有显著高地
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 四 kind 锚点特征方块（与 structures.test 自动派生用例同窗口）
// ---------------------------------------------------------------------------

const FEATURE_CASES: Array<{
  region: 'shanghai' | 'zhejiang' | 'fujian';
  kind: StructureKind;
  density: number;
  block: number;
}> = [
  { region: 'shanghai', kind: 'shikumen', density: 0.2, block: BLOCK.PASTEL_WALL },
  { region: 'shanghai', kind: 'pearl_tower', density: 0.02, block: BLOCK.CONCRETE },
  { region: 'zhejiang', kind: 'leifeng_pagoda', density: 0.02, block: BLOCK.DARK_TILE },
  { region: 'fujian', kind: 'tulou', density: 0.1, block: BLOCK.GREY_BRICK },
];

describe('华东2结构特征方块', () => {
  for (const { region, kind, density, block } of FEATURE_CASES) {
    const seed = makeSeedForRegion(region, 'w4-feature');
    it(`${region}/${kind}：锚点 ±2、fy..fy+8 窗口内落特征方块（0x${block.toString(16)}）`, () => {
      const anchor = findKindAnchor(seed, kind, density);
      expect(anchor).not.toBeNull();
      const { get } = makeReader(seed);
      const fy = surfaceHeight(anchor!.x, anchor!.z) + 1;
      let seen = false;
      for (let dx = -2; dx <= 2 && !seen; dx++) {
        for (let dz = -2; dz <= 2 && !seen; dz++) {
          for (let y = fy; y <= fy + 8; y++) {
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
});

// ---------------------------------------------------------------------------
// pearl_tower 东方明珠专测：总高 / 中心列连续 / 双球体 / 重复生成一致
// ---------------------------------------------------------------------------

describe('东方明珠 pearl_tower', () => {
  const seed = makeSeedForRegion('shanghai', 'w4-feature');
  const anchor = findKindAnchor(seed, 'pearl_tower', 0.02);
  const fy = anchor ? surfaceHeight(anchor.x, anchor.z) + 1 : 0;

  it('锚点存在且场地足够低（topClamp 不削顶，总高断言前提成立）', () => {
    expect(anchor).not.toBeNull();
    expect(fy).toBeLessThanOrEqual(36); // fy+26 ≤ 62：天线杆不触顶钳制
  }, 30_000);

  it('总高 ≥ 24（中心列自顶部向下连续 ≥ 24：斜腿/塔身/双球体/天线）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    let topY = fy - 1;
    for (let y = 62; y >= fy; y--) {
      if (get(anchor!.x, y, anchor!.z) !== BLOCK.AIR) {
        topY = y;
        break;
      }
    }
    expect(topY - fy).toBeGreaterThanOrEqual(24);
    let run = 0;
    for (let y = topY; y >= fy; y--) {
      if (get(anchor!.x, y, anchor!.z) !== BLOCK.AIR) run++;
      else break;
    }
    expect(run).toBeGreaterThanOrEqual(24); // 中心列向上连续
  }, 30_000);

  it('双球体：GLASS_CURTAIN 计数 > 30（下球 r3 + 上球 r2）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const glass = countBlockAround({ get }, anchor!, 6, fy, fy + 30, BLOCK.GLASS_CURTAIN);
    expect(glass).toBeGreaterThan(30);
  }, 30_000);

  it('重复生成一致（同 seed 两次统计逐项相等）', () => {
    expect(anchor).not.toBeNull();
    const a = countBlockAround(makeReader(seed), anchor!, 6, fy, fy + 30, BLOCK.GLASS_CURTAIN);
    const b = countBlockAround(makeReader(seed), anchor!, 6, fy, fy + 30, BLOCK.CONCRETE);
    const a2 = countBlockAround(makeReader(seed), anchor!, 6, fy, fy + 30, BLOCK.GLASS_CURTAIN);
    const b2 = countBlockAround(makeReader(seed), anchor!, 6, fy, fy + 30, BLOCK.CONCRETE);
    expect(a2).toBe(a);
    expect(b2).toBe(b);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// tulou 圆形土楼专测：环形墙 8 向完整 / 内院非实心 / 重复生成一致
// ---------------------------------------------------------------------------

describe('圆形土楼 tulou', () => {
  const seed = makeSeedForRegion('fujian', 'w4-feature');
  const anchor = findKindAnchor(seed, 'tulou', 0.1);
  const fy = anchor ? surfaceHeight(anchor.x, anchor.z) + 1 : 0;
  /** 夯土拼色三件套 */
  const RAMMED: number[] = [BLOCK.GREY_BRICK, BLOCK.SANDSTONE, BLOCK.COBBLE];

  it('锚点存在', () => {
    expect(anchor).not.toBeNull();
  }, 30_000);

  it('环形墙完整：8 方向射线 r5.5-6.5 段均遇夯土拼色实心', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const DIRS: ReadonlyArray<readonly [number, number]> = [
      [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    for (const [ux, uz] of DIRS) {
      const len = Math.sqrt(ux * ux + uz * uz); // 对角向单位化：沿射线按真实半径采样
      const seen = new Set<string>();
      for (let t = 5.5; t <= 6.5; t += 0.25) {
        seen.add(`${Math.round((t * ux) / len)},${Math.round((t * uz) / len)}`);
      }
      let solid = 0;
      let mixed = 0;
      for (const key of seen) {
        const [dx, dz] = key.split(',').map(Number) as [number, number];
        const d2 = dx * dx + dz * dz;
        if (d2 <= 25 || d2 > 49) continue; // 只统计环带内的采样点（夯土墙厚 2）
        const b = get(anchor!.x + dx, fy + 3, anchor!.z + dz);
        if (b !== BLOCK.AIR) solid++;
        if (RAMMED.includes(b)) mixed++;
      }
      expect(solid).toBeGreaterThan(0); // 射线遇实心
      expect(mixed).toBeGreaterThan(0); // 遇 GREY_BRICK 拼色
    }
  }, 30_000);

  it('环带无缝：r5.5-6.7 整环实心且 GREY_BRICK 为主（夯土拼色主体）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    let holes = 0;
    let grey = 0;
    let other = 0;
    for (let dx = -7; dx <= 7; dx++) {
      for (let dz = -7; dz <= 7; dz++) {
        const d2 = dx * dx + dz * dz;
        if (d2 < 29 || d2 > 45) continue; // 环带内部（避开内外缘的取整锯齿）
        const b = get(anchor!.x + dx, fy + 3, anchor!.z + dz);
        if (b === BLOCK.AIR) holes++;
        else if (b === BLOCK.GREY_BRICK) grey++;
        else other++;
      }
    }
    expect(holes).toBe(0); // 环形墙无缺口
    expect(grey).toBeGreaterThan(other); // GREY_BRICK 为主
    expect(grey).toBeGreaterThan(20);
  }, 30_000);

  it('内院为非实心（锚点上方 fy+2 是 AIR）+ 中央水井（STONE）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    expect(get(anchor!.x, fy + 2, anchor!.z)).toBe(BLOCK.AIR);
    expect(get(anchor!.x, fy, anchor!.z)).toBe(BLOCK.STONE);
  }, 30_000);

  it('重复生成一致（同 seed 两次统计逐项相等）', () => {
    expect(anchor).not.toBeNull();
    const count = (r: ReturnType<typeof makeReader>, id: number): number =>
      countBlockAround(r, anchor!, 8, fy - 2, fy + 8, id);
    const a1 = count(makeReader(seed), BLOCK.GREY_BRICK);
    const a2 = count(makeReader(seed), BLOCK.DARK_TILE);
    const a3 = count(makeReader(seed), BLOCK.RED_DOOR);
    const b1 = count(makeReader(seed), BLOCK.GREY_BRICK);
    const b2 = count(makeReader(seed), BLOCK.DARK_TILE);
    const b3 = count(makeReader(seed), BLOCK.RED_DOOR);
    expect(b1).toBe(a1);
    expect(b2).toBe(a2);
    expect(b3).toBe(a3);
    expect(a3).toBe(4); // 乌漆大门两扇（2 扇 × 2 格高）
  }, 30_000);
});

// ---------------------------------------------------------------------------
// leifeng_pagoda 雷峰塔专测：五层腰檐垂直分布 / 赭红塔身 / 铜制金顶
// ---------------------------------------------------------------------------

describe('雷峰塔 leifeng_pagoda', () => {
  const seed = makeSeedForRegion('zhejiang', 'w4-feature');
  const anchor = findKindAnchor(seed, 'leifeng_pagoda', 0.02);
  const fy = anchor ? surfaceHeight(anchor.x, anchor.z) + 1 : 0;

  it('锚点存在且场地足够低（topClamp 不削顶，五层腰檐断言前提成立）', () => {
    expect(anchor).not.toBeNull();
    expect(fy).toBeLessThanOrEqual(43); // fy+19 ≤ 62：金针不触顶钳制
  }, 30_000);

  it('五层腰檐：DARK_TILE 沿中心列垂直分布 ≥ 5 个不同 y 层', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const ys = new Set<number>();
    for (let y = fy; y <= fy + 20; y++) {
      if (get(anchor!.x, y, anchor!.z) === BLOCK.DARK_TILE) ys.add(y);
    }
    expect(ys.size).toBeGreaterThanOrEqual(5);
  }, 30_000);

  it('赭红塔身 + 白石栏板 + 铜制金顶（RED_BRICK / WHITE_STONE / YELLOW_TILE 计数）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const count = (id: number): number => countBlockAround({ get }, anchor!, 5, fy, fy + 20, id);
    expect(count(BLOCK.RED_BRICK)).toBeGreaterThan(40); // 八角五层赭红塔身
    expect(count(BLOCK.WHITE_STONE)).toBeGreaterThan(30); // 石台基栏板 + 平座矮栏
    expect(count(BLOCK.YELLOW_TILE)).toBeGreaterThanOrEqual(11); // 3×3 金盘 + 顶珠 + 金针
  }, 30_000);
});
