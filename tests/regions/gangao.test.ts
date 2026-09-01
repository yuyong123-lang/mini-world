// 港澳区域单测（W6-A3）：香港（维港高楼 + 太平山：中银大厦/高层住宅楼）/
// 澳门（葡式半岛：大三巴牌坊/葡式粉彩小楼）。
// 覆盖：两区域确定性（同 seed 逐字节）/ 参数与氛围/动物断言 / 地形对比
//（hongkong 太平山起伏 vs aomen 极平缓——大三巴需要平地）/ 4 kind 锚点特征
// 方块（跨 chunk 一致性由 structures.test 自动派生覆盖）/ boc_tower 专测
//（总高 ≥22、中心列宽度沿高至少两次收窄、水晶幕墙体量、重复生成一致）/
// hk_tower 专测（霓虹招牌商铺层 + 幕墙窗阵体量）/ dasanba 专测（立面高宽比
// 9×≥12 + 底层三门洞）/ pastel_house 专测（白色石膏窗框 + 碎石路小院）。
//
// 注意：活动区域是模块级状态——每处 initTerrain 后才可 createChunkData。
import { describe, expect, it } from 'vitest';

import { REGIONS, makeSeedForRegion } from '../../src/data/regions';
import type { RegionId, StructureKind } from '../../src/data/regions';
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

/** 大范围地形统计（海拔极差 / 超出海平面 8 格的高地占比 / 陆地占比） */
function terrainStats(id: 'hongkong' | 'aomen', rand: string): {
  range: number;
  above8: number;
  land: number;
  total: number;
} {
  initTerrain(makeSeedForRegion(id, rand));
  let min = Number.MAX_SAFE_INTEGER;
  let max = 0;
  let above8 = 0;
  let land = 0;
  let total = 0;
  for (let x = -200; x <= 200; x += 5) {
    for (let z = -200; z <= 200; z += 5) {
      const h = surfaceHeight(x, z);
      total++;
      if (h < min) min = h;
      if (h > max) max = h;
      if (h > SEA_LEVEL + 8) above8++;
      if (h > SEA_LEVEL) land++;
    }
  }
  return { range: max - min, above8, land, total };
}

// ---------------------------------------------------------------------------
// 确定性（区域定制改动的总闸）
// ---------------------------------------------------------------------------

describe('港澳区域确定性', () => {
  for (const id of ['hongkong', 'aomen'] as const) {
    it(`区域 ${id}：同 seed 两次生成 (0,0)(2,-3) 逐字节一致`, () => {
      for (const [cx, cz] of [[0, 0], [2, -3]] as const) {
        initTerrain(makeSeedForRegion(id, 'w6-a3'));
        const a = createChunkData(cx, cz);
        initTerrain(makeSeedForRegion(id, 'w6-a3'));
        const b = createChunkData(cx, cz);
        expect(bytesEqual(a, b)).toBe(true);
      }
    }, 30_000);
  }

  it('地形对比：香港太平山起伏显著（range ≥ 10 且有高地），澳门极平缓（range ≤ 8）', () => {
    const hk = terrainStats('hongkong', 'w6-stats');
    const am = terrainStats('aomen', 'w6-stats');
    expect(hk.total).toBeGreaterThan(5000);
    expect(hk.range).toBeGreaterThanOrEqual(10); // ridgeAmp 12：太平山
    expect(hk.above8).toBeGreaterThan(0); // 有超出海平面 8 格以上的山地
    expect(am.range).toBeLessThanOrEqual(8); // ridgeAmp 4：大三巴需要平地
    expect(hk.range).toBeGreaterThan(am.range + 4); // 两特区地形确有分化
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 参数 / 氛围 / 动物断言
// ---------------------------------------------------------------------------

describe('香港 hongkong（W6 定制）', () => {
  it('参数断言：维港贴海 + 太平山 + 亚热带 + 住宅塔/中银大厦结构表', () => {
    const def = REGIONS.hongkong!;
    expect(def.terrain.baseOffset).toBe(0);
    expect(def.terrain.contAmp).toBe(3);
    expect(def.terrain.hillsAmp).toBe(4);
    expect(def.terrain.ridgeAmp).toBe(12); // 太平山
    expect(def.terrain.tempBias).toBe(0.25); // 亚热带海洋性
    expect(def.terrain.snowBias).toBe(0); // 终年无雪
    expect(def.terrain.trees.chance).toBe(0.005); // 城市绿化
    expect(def.terrain.trees.kinds).toEqual([
      { kind: 'pagoda', weight: 0.5 },
      { kind: 'oak', weight: 0.5 },
    ]);
    expect(def.terrain.structures).toEqual([
      { kind: 'hk_tower', cellDensity: 0.2 },
      { kind: 'boc_tower', cellDensity: 0.02 },
    ]);
    expect(def.blurb).toContain('中银大厦');
    expect(def.blurb).toContain('维多利亚港');
    expect(def.blurb).toContain('霓虹');
  });

  it('氛围与动物：都市亮丽现代亮蓝 + 维港水色；猪/牛/羊出没于草地', () => {
    const def = REGIONS.hongkong!;
    expect(def.atmosphere.fogScale).toBe(1.05);
    expect(def.atmosphere.waterTint).toBe('#3a7a9a'); // 维多利亚港
    expect(def.atmosphere.sky!.noon!.top).toBe('#7cc4f4'); // 现代亮蓝
    expect(def.animals.map((a) => a.key)).toEqual(['pig', 'cow', 'sheep']);
    expect(def.animals.map((a) => a.weight)).toEqual([0.6, 0.5, 0.4]);
    expect(def.animalGround).toEqual(['GRASS']);
  });
});

describe('澳门 aomen（W6 定制）', () => {
  it('参数断言：葡式半岛极平缓 + 亚热带 + 粉彩小楼/大三巴结构表', () => {
    const def = REGIONS.aomen!;
    expect(def.terrain.baseOffset).toBe(0);
    expect(def.terrain.contAmp).toBe(3);
    expect(def.terrain.hillsAmp).toBe(1.5); // 极平缓
    expect(def.terrain.ridgeAmp).toBe(4); // 大三巴需要整片平地
    expect(def.terrain.ridgeAmp).toBeLessThan(REGIONS.hongkong!.terrain.ridgeAmp);
    expect(def.terrain.tempBias).toBe(0.25);
    expect(def.terrain.snowBias).toBe(0);
    expect(def.terrain.trees.chance).toBe(0.005);
    expect(def.terrain.trees.kinds).toEqual([{ kind: 'pagoda', weight: 1 }]); // 妈阁庙前古榕
    expect(def.terrain.structures).toEqual([
      { kind: 'pastel_house', cellDensity: 0.18 },
      { kind: 'dasanba', cellDensity: 0.02 },
    ]);
    expect(def.blurb).toContain('大三巴');
    expect(def.blurb).toContain('妈阁庙');
    expect(def.blurb).toContain('碎石路');
  });

  it('氛围与动物：南欧暖阳（地平线偏暖白）+ 青碧水色；猪/牛/羊出没于草地', () => {
    const def = REGIONS.aomen!;
    expect(def.atmosphere.fogScale).toBe(1.1);
    expect(def.atmosphere.waterTint).toBe('#2a8a9a');
    expect(def.atmosphere.sky!.noon!.bottom).toBe('#f5efe0'); // 暖白地平线
    expect(def.animals.map((a) => a.key)).toEqual(['pig', 'cow', 'sheep']);
    expect(def.animals.map((a) => a.weight)).toEqual([0.6, 0.5, 0.4]);
    expect(def.animalGround).toEqual(['GRASS']);
  });
});

// ---------------------------------------------------------------------------
// 4 kind 锚点特征方块（与 structures.test 自动派生用例同窗口）
// ---------------------------------------------------------------------------

const FEATURE_CASES: Array<{
  region: Extract<RegionId, 'hongkong' | 'aomen'>;
  kind: StructureKind;
  density: number;
  block: number;
}> = [
  { region: 'hongkong', kind: 'hk_tower', density: 0.2, block: BLOCK.GLASS_CURTAIN },
  { region: 'hongkong', kind: 'boc_tower', density: 0.02, block: BLOCK.GLASS_CURTAIN },
  { region: 'aomen', kind: 'pastel_house', density: 0.18, block: BLOCK.PASTEL_WALL },
  { region: 'aomen', kind: 'dasanba', density: 0.02, block: BLOCK.WHITE_STONE },
];

describe('港澳结构特征方块', () => {
  for (const { region, kind, density, block } of FEATURE_CASES) {
    const seed = makeSeedForRegion(region, 'w6-feature');
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
// boc_tower 中银大厦专测：总高 / 三段收窄 / 水晶幕墙体量 / 重复生成一致
// ---------------------------------------------------------------------------

describe('中银大厦 boc_tower', () => {
  const seed = makeSeedForRegion('hongkong', 'w6-feature');
  const anchor = findKindAnchor(seed, 'boc_tower', 0.02);
  const fy = anchor ? surfaceHeight(anchor.x, anchor.z) + 1 : 0;

  it('锚点存在且场地足够低（topClamp 不削塔身，总高断言前提成立）', () => {
    expect(anchor).not.toBeNull();
    expect(fy).toBeLessThanOrEqual(36); // fy+26 ≤ 62：尖杆全在顶界内
  }, 30_000);

  it('总高 ≥ 22（中心列自顶部向下连续 ≥ 22：水晶塔身逐段收至尖杆）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    let topY = fy - 1;
    for (let y = 62; y >= fy; y--) {
      if (get(anchor!.x, y, anchor!.z) !== BLOCK.AIR) {
        topY = y;
        break;
      }
    }
    let run = 0;
    for (let y = topY; y >= fy; y--) {
      if (get(anchor!.x, y, anchor!.z) !== BLOCK.AIR) run++;
      else break;
    }
    expect(run).toBeGreaterThanOrEqual(22); // 中心列向上连续
  }, 30_000);

  it('三棱塔节节收窄：fy / fy+8 / fy+16 三个高度横排实心宽度严格递减（至少两次收窄）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const widthAt = (y: number): number => {
      let w = 0;
      for (let dx = -4; dx <= 4; dx++) {
        if (get(anchor!.x + dx, y, anchor!.z) !== BLOCK.AIR) w++;
      }
      return w;
    };
    const w0 = widthAt(fy); // 底段边长 8 → 宽 9
    const w1 = widthAt(fy + 8); // 第二段边长 6 → 宽 7
    const w2 = widthAt(fy + 16); // 第三段边长 4 → 宽 5
    expect(w0).toBeGreaterThan(w1); // 第一次收窄
    expect(w1).toBeGreaterThan(w2); // 第二次收窄
  }, 30_000);

  it('水晶幕墙体量：GLASS_CURTAIN 计数 > 200（四段内芯 + X 交叉幕墙）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const glass = countBlockAround({ get }, anchor!, 4, fy, fy + 26, BLOCK.GLASS_CURTAIN);
    expect(glass).toBeGreaterThan(200);
  }, 30_000);

  it('重复生成一致（同 seed 两次统计逐项相等）', () => {
    expect(anchor).not.toBeNull();
    const count = (r: ReturnType<typeof makeReader>, id: number): number =>
      countBlockAround(r, anchor!, 4, fy, fy + 26, id);
    const a1 = count(makeReader(seed), BLOCK.GLASS_CURTAIN);
    const a2 = count(makeReader(seed), BLOCK.CONCRETE);
    const a3 = count(makeReader(seed), BLOCK.STONE);
    const b1 = count(makeReader(seed), BLOCK.GLASS_CURTAIN);
    const b2 = count(makeReader(seed), BLOCK.CONCRETE);
    const b3 = count(makeReader(seed), BLOCK.STONE);
    expect(b1).toBe(a1);
    expect(b2).toBe(a2);
    expect(b3).toBe(a3);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// hk_tower 高层住宅楼专测：霓虹招牌商铺层 / 幕墙窗阵 / 重复生成一致
// ---------------------------------------------------------------------------

describe('高层住宅楼 hk_tower', () => {
  const seed = makeSeedForRegion('hongkong', 'w6-feature');
  const anchor = findKindAnchor(seed, 'hk_tower', 0.2);
  const fy = anchor ? surfaceHeight(anchor.x, anchor.z) + 1 : 0;

  it('锚点存在', () => {
    expect(anchor).not.toBeNull();
  }, 30_000);

  it('底部商铺层：PASTEL_WALL 墙（2 高）+ 招牌砖条 + GLOWBLOCK 灯箱 ≥ 2', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const count = (id: number): number => countBlockAround({ get }, anchor!, 4, fy, fy + 1, id);
    expect(count(BLOCK.PASTEL_WALL)).toBeGreaterThanOrEqual(20); // 商铺外壳 2 高
    expect(count(BLOCK.RED_BRICK)).toBeGreaterThanOrEqual(1); // 霓虹招牌砖条
    expect(count(BLOCK.GLOWBLOCK)).toBeGreaterThanOrEqual(2); // 灯箱 + 店内灯
  }, 30_000);

  it('幕墙窗阵：GLASS_CURTAIN 计数 > 40（每层一排窗 × 18 层）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const glass = countBlockAround({ get }, anchor!, 4, fy, fy + 22, BLOCK.GLASS_CURTAIN);
    expect(glass).toBeGreaterThan(40);
  }, 30_000);

  it('重复生成一致（同 seed 两次统计逐项相等）', () => {
    expect(anchor).not.toBeNull();
    const count = (r: ReturnType<typeof makeReader>, id: number): number =>
      countBlockAround(r, anchor!, 4, fy, fy + 22, id);
    const a1 = count(makeReader(seed), BLOCK.GLASS_CURTAIN);
    const a2 = count(makeReader(seed), BLOCK.CONCRETE);
    const a3 = count(makeReader(seed), BLOCK.PASTEL_WALL);
    const b1 = count(makeReader(seed), BLOCK.GLASS_CURTAIN);
    const b2 = count(makeReader(seed), BLOCK.CONCRETE);
    const b3 = count(makeReader(seed), BLOCK.PASTEL_WALL);
    expect(b1).toBe(a1);
    expect(b2).toBe(a2);
    expect(b3).toBe(a3);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// dasanba 大三巴牌坊专测：立面高宽比 / 三门洞 / 石造主体 / 重复生成一致
// ---------------------------------------------------------------------------

describe('大三巴牌坊 dasanba', () => {
  const seed = makeSeedForRegion('aomen', 'w6-feature');
  const anchor = findKindAnchor(seed, 'dasanba', 0.02);
  const fy = anchor ? surfaceHeight(anchor.x, anchor.z) + 1 : 0;

  it('锚点存在且场地足够低（山花顶不被削）', () => {
    expect(anchor).not.toBeNull();
    expect(fy).toBeLessThanOrEqual(48); // fy+14 ≤ 62
  }, 30_000);

  it('巴洛克立面高宽比：底宽 9（一层 ax±4 通长）且墙顶高 ≥ 12（四层叠收 + 山花）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    // 底宽：二层窗台层（fy+1）横排左右缘正好落在 ax±4
    let left = 99;
    let right = -99;
    for (let dx = -5; dx <= 5; dx++) {
      if (get(anchor!.x + dx, fy + 1, anchor!.z) !== BLOCK.AIR) {
        left = Math.min(left, dx);
        right = Math.max(right, dx);
      }
    }
    expect(left).toBe(-4);
    expect(right).toBe(4);
    expect(right - left + 1).toBe(9);
    // 墙顶：立面上最高实心块 ≥ fy+12（山花基行）
    let topBlock = 0;
    for (let dx = -4; dx <= 4; dx++) {
      for (let y = fy; y <= fy + 14; y++) {
        if (get(anchor!.x + dx, y, anchor!.z) !== BLOCK.AIR) topBlock = Math.max(topBlock, y);
      }
    }
    expect(topBlock).toBeGreaterThanOrEqual(fy + 12);
  }, 30_000);

  it('底层三门洞：中门与两侧门在 fy 层均为 AIR 洞', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    for (const dx of [-2, 0, 2]) {
      expect(get(anchor!.x + dx, fy, anchor!.z)).toBe(BLOCK.AIR);
    }
  }, 30_000);

  it('石造主体：WHITE_STONE 计数 > 10（单片立面扣除壁柱/门龛后的汉白玉主体量）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const stone = countBlockAround({ get }, anchor!, 5, fy - 1, fy + 14, BLOCK.WHITE_STONE);
    expect(stone).toBeGreaterThan(10);
  }, 30_000);

  it('重复生成一致（同 seed 两次统计逐项相等）', () => {
    expect(anchor).not.toBeNull();
    const count = (r: ReturnType<typeof makeReader>, id: number): number =>
      countBlockAround(r, anchor!, 5, fy - 1, fy + 14, id);
    const a1 = count(makeReader(seed), BLOCK.WHITE_STONE);
    const a2 = count(makeReader(seed), BLOCK.GREY_BRICK);
    const a3 = count(makeReader(seed), BLOCK.STONE);
    const b1 = count(makeReader(seed), BLOCK.WHITE_STONE);
    const b2 = count(makeReader(seed), BLOCK.GREY_BRICK);
    const b3 = count(makeReader(seed), BLOCK.STONE);
    expect(b1).toBe(a1);
    expect(b2).toBe(a2);
    expect(b3).toBe(a3);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// pastel_house 葡式粉彩小楼专测：白色石膏窗框 / 碎石路小院 / 重复生成一致
// ---------------------------------------------------------------------------

describe('葡式粉彩小楼 pastel_house', () => {
  const seed = makeSeedForRegion('aomen', 'w6-feature');
  const anchor = findKindAnchor(seed, 'pastel_house', 0.18);
  const fy = anchor ? surfaceHeight(anchor.x, anchor.z) + 1 : 0;

  it('锚点存在', () => {
    expect(anchor).not.toBeNull();
  }, 30_000);

  it('白色石膏窗框：WHITE_STONE 计数 ≥ 12（两窗 3×3 框 ×2 层 + 门框 + 拱顶心）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const white = countBlockAround({ get }, anchor!, 4, fy - 1, fy + 9, BLOCK.WHITE_STONE);
    expect(white).toBeGreaterThanOrEqual(12);
  }, 30_000);

  it('葡式碎石路小院：门前 5×4 波浪铺装（COBBLE ≥ 6）+ 路灯（LOG + GLOWBLOCK）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    let cobble = 0;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = 1; dz <= 4; dz++) {
        if (get(anchor!.x + dx, fy - 1, anchor!.z + dz) === BLOCK.COBBLE) cobble++;
      }
    }
    expect(cobble).toBeGreaterThanOrEqual(6); // (dx+dz+off)%4 波浪图案约半数
    expect(get(anchor!.x - 2, fy, anchor!.z + 4)).toBe(BLOCK.LOG); // 路灯柱
    expect(get(anchor!.x - 2, fy + 2, anchor!.z + 4)).toBe(BLOCK.GLOWBLOCK); // 灯顶
  }, 30_000);

  it('重复生成一致（同 seed 两次统计逐项相等）', () => {
    expect(anchor).not.toBeNull();
    const count = (r: ReturnType<typeof makeReader>, id: number): number =>
      countBlockAround(r, anchor!, 4, fy - 1, fy + 9, id);
    const a1 = count(makeReader(seed), BLOCK.WHITE_STONE);
    const a2 = count(makeReader(seed), BLOCK.PASTEL_WALL);
    const a3 = count(makeReader(seed), BLOCK.RED_BRICK);
    const b1 = count(makeReader(seed), BLOCK.WHITE_STONE);
    const b2 = count(makeReader(seed), BLOCK.PASTEL_WALL);
    const b3 = count(makeReader(seed), BLOCK.RED_BRICK);
    expect(b1).toBe(a1);
    expect(b2).toBe(a2);
    expect(b3).toBe(a3);
  }, 30_000);
});
