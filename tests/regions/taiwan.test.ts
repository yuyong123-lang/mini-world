// 台湾区域单测（W5-A3）：台湾（宝岛山海 + 闽南红砖古厝/台北101）。
// 覆盖：区域确定性（同 seed 逐字节）/ 中央山脉起伏 / 参数与氛围/动物断言 /
// 两 kind 锚点特征方块（跨 chunk 一致性由 structures.test 自动派生覆盖）/
// taipei_101 专测（总高 ≥26 中心列连续、8 节如意裙边 GREEN_TILE 垂直分布 ≥6 层、
// GLASS_CURTAIN>80、重复生成一致）/ minnan_house 专测（燕尾脊端点上翘高于屋面
// 中心、红砖主导、凹寿门面 + 石板埕古井、重复生成一致）。
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

/** 大范围地形统计（海拔极差 / 超出海平面 8 格的高地占比） */
function terrainStats(): { range: number; above8: number; total: number } {
  initTerrain(makeSeedForRegion('taiwan', 'w5-stats'));
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

describe('台湾区域确定性', () => {
  it('区域 taiwan：同 seed 两次生成 (0,0)(2,-3) 逐字节一致', () => {
    for (const [cx, cz] of [[0, 0], [2, -3]] as const) {
      initTerrain(makeSeedForRegion('taiwan', 'w5-a3'));
      const a = createChunkData(cx, cz);
      initTerrain(makeSeedForRegion('taiwan', 'w5-a3'));
      const b = createChunkData(cx, cz);
      expect(bytesEqual(a, b)).toBe(true);
    }
  }, 30_000);

  it('地形：中央山脉（起伏 ≥ 12 且有显著高地）', () => {
    const st = terrainStats();
    expect(st.total).toBeGreaterThan(5000);
    expect(st.range).toBeGreaterThanOrEqual(12); // ridgeAmp 14：山海起伏
    expect(st.above8).toBeGreaterThan(0); // 有超出海平面 8 格以上的山地
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 参数 / 氛围 / 动物断言
// ---------------------------------------------------------------------------

describe('台湾 taiwan（W5 定制）', () => {
  it('参数断言：中央山脉 + 西岸平原 + 亚热带 + 古厝/101 结构表', () => {
    const def = REGIONS.taiwan!;
    expect(def.terrain.baseOffset).toBe(1);
    expect(def.terrain.contAmp).toBe(4);
    expect(def.terrain.hillsAmp).toBe(3);
    expect(def.terrain.ridgeAmp).toBe(14); // 中央山脉
    expect(def.terrain.tempBias).toBe(0.25); // 北回归线过岛：亚热带
    expect(def.terrain.snowBias).toBe(0); // 平地终年无雪
    expect(def.terrain.trees.chance).toBe(0.012);
    expect(def.terrain.trees.kinds).toEqual([
      { kind: 'palm', weight: 0.4 },
      { kind: 'oak', weight: 0.35 },
      { kind: 'banana', weight: 0.25 },
    ]);
    expect(def.terrain.structures).toEqual([
      { kind: 'minnan_house', cellDensity: 0.18 },
      { kind: 'taipei_101', cellDensity: 0.02 },
    ]);
    expect(def.blurb).toContain('台北101');
    expect(def.blurb).toContain('日月潭');
    expect(def.blurb).toContain('古厝');
  });

  it('氛围与动物：海岛晴朗 + 台湾海峡水色；猪/牛/羊出没于草地', () => {
    const def = REGIONS.taiwan!;
    expect(def.atmosphere.fogScale).toBe(1);
    expect(def.atmosphere.waterTint).toBe('#2a8a9a'); // 台湾海峡青蓝
    expect(def.atmosphere.sky!.noon!.top).toBe('#8ccdf5'); // 海岛晴朗
    expect(def.animals.map((a) => a.key)).toEqual(['pig', 'cow', 'sheep']);
    expect(def.animals.map((a) => a.weight)).toEqual([0.8, 0.6, 0.4]);
    expect(def.animalGround).toEqual(['GRASS']);
  });
});

// ---------------------------------------------------------------------------
// 两 kind 锚点特征方块（与 structures.test 自动派生用例同窗口）
// ---------------------------------------------------------------------------

const FEATURE_CASES: Array<{
  kind: StructureKind;
  density: number;
  block: number;
}> = [
  { kind: 'minnan_house', density: 0.18, block: BLOCK.RED_BRICK },
  { kind: 'taipei_101', density: 0.02, block: BLOCK.GLASS_CURTAIN },
];

describe('台湾结构特征方块', () => {
  for (const { kind, density, block } of FEATURE_CASES) {
    const seed = makeSeedForRegion('taiwan', 'w5-feature');
    it(`taiwan/${kind}：锚点 ±2、fy..fy+8 窗口内落特征方块（0x${block.toString(16)}）`, () => {
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
// taipei_101 台北101专测：总高 / 竹节裙边垂直分布 / 幕墙体量 / 重复生成一致
// ---------------------------------------------------------------------------

describe('台北101 taipei_101', () => {
  const seed = makeSeedForRegion('taiwan', 'w5-feature');
  const anchor = findKindAnchor(seed, 'taipei_101', 0.02);
  const fy = anchor ? surfaceHeight(anchor.x, anchor.z) + 1 : 0;

  it('锚点存在且场地足够低（topClamp 不削塔身，裙边断言前提成立）', () => {
    expect(anchor).not.toBeNull();
    expect(fy).toBeLessThanOrEqual(36); // fy+25 ≤ 61：8 节裙边全在顶界内
  }, 30_000);

  it('总高 ≥ 26（中心列自顶部向下连续 ≥ 26：核心筒/塔身/尖顶/天线）', () => {
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
    expect(run).toBeGreaterThanOrEqual(26); // 中心列向上连续
  }, 30_000);

  it('竹节如意裙边：GREEN_TILE 沿垂直分布 ≥ 6 个不同 y 层（8 节 × 每 3 高）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const ys = new Set<number>();
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        for (let y = fy; y <= fy + 31; y++) {
          if (get(anchor!.x + dx, y, anchor!.z + dz) === BLOCK.GREEN_TILE) ys.add(y);
        }
      }
    }
    expect(ys.size).toBeGreaterThanOrEqual(6);
  }, 30_000);

  it('玻璃幕墙体量：GLASS_CURTAIN 计数 > 80（裙楼 + 8 节幕墙立面）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const glass = countBlockAround({ get }, anchor!, 4, fy, fy + 31, BLOCK.GLASS_CURTAIN);
    expect(glass).toBeGreaterThan(80);
  }, 30_000);

  it('重复生成一致（同 seed 两次统计逐项相等）', () => {
    expect(anchor).not.toBeNull();
    const count = (r: ReturnType<typeof makeReader>, id: number): number =>
      countBlockAround(r, anchor!, 4, fy, fy + 31, id);
    const a1 = count(makeReader(seed), BLOCK.GLASS_CURTAIN);
    const a2 = count(makeReader(seed), BLOCK.GREEN_TILE);
    const a3 = count(makeReader(seed), BLOCK.CONCRETE);
    const b1 = count(makeReader(seed), BLOCK.GLASS_CURTAIN);
    const b2 = count(makeReader(seed), BLOCK.GREEN_TILE);
    const b3 = count(makeReader(seed), BLOCK.CONCRETE);
    expect(b1).toBe(a1);
    expect(b2).toBe(a2);
    expect(b3).toBe(a3);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// minnan_house 闽南红砖古厝专测：燕尾脊 / 红砖主导 / 门面石埕 / 重复生成一致
// ---------------------------------------------------------------------------

describe('闽南红砖古厝 minnan_house', () => {
  const seed = makeSeedForRegion('taiwan', 'w5-feature');
  const anchor = findKindAnchor(seed, 'minnan_house', 0.18);
  const fy = anchor ? surfaceHeight(anchor.x, anchor.z) + 1 : 0;

  it('锚点存在', () => {
    expect(anchor).not.toBeNull();
  }, 30_000);

  it('燕尾脊：正脊端点上翘块高于屋面中心（马背脊顶），且高于檐口 2 格以上', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    // 屋面中心顶：|dx|≤1、|dz|≤1 的最高非空气块（马背脊抬高段）
    let centerTop = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let y = fy; y <= fy + 9; y++) {
          if (get(anchor!.x + dx, y, anchor!.z + dz) !== BLOCK.AIR) centerTop = Math.max(centerTop, y);
        }
      }
    }
    // 山墙外侧上方（|dx| = 4）：燕尾叉尖
    let tipTop = 0;
    for (const dx of [-4, 4]) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let y = fy; y <= fy + 9; y++) {
          if (get(anchor!.x + dx, y, anchor!.z + dz) !== BLOCK.AIR) tipTop = Math.max(tipTop, y);
        }
      }
    }
    expect(centerTop).toBeGreaterThanOrEqual(fy + 4); // 屋面中心确有脊
    expect(tipTop).toBeGreaterThan(centerTop); // 端点上翘高过屋面中心
    expect(tipTop - (fy + 2)).toBeGreaterThanOrEqual(2); // 高于檐口压边 2 格以上
    // 正脊连续：脊线层 DARK_TILE 横贯面阔（≥5 块）
    let ridgeTiles = 0;
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (get(anchor!.x + dx, fy + 5, anchor!.z + dz) === BLOCK.DARK_TILE) ridgeTiles++;
      }
    }
    expect(ridgeTiles).toBeGreaterThanOrEqual(5);
  }, 30_000);

  it('红砖主导：RED_BRICK 计数 > PASTEL_WALL，且门/窗/门槛齐备', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const count = (id: number): number => countBlockAround({ get }, anchor!, 5, fy - 2, fy + 9, id);
    expect(count(BLOCK.RED_BRICK)).toBeGreaterThan(count(BLOCK.PASTEL_WALL));
    expect(count(BLOCK.RED_BRICK)).toBeGreaterThan(60); // 墙身 + 斗底 + 坡面
    expect(count(BLOCK.RED_DOOR)).toBeGreaterThanOrEqual(2); // 凹寿门（两格高）
    expect(count(BLOCK.GLASS)).toBeGreaterThanOrEqual(3); // 两窗 + 背窗
    expect(get(anchor!.x, fy, anchor!.z + 2)).toBe(BLOCK.STONE); // 石门槛
  }, 30_000);

  it('门前石板埕 + 埕边古井（COBBLE 铺装、井眼空）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    let cobble = 0;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = 2; dz <= 4; dz++) {
        if (get(anchor!.x + dx, fy - 1, anchor!.z + dz) === BLOCK.COBBLE) cobble++;
      }
    }
    expect(cobble).toBeGreaterThanOrEqual(14); // 5×3 埕面
    expect(get(anchor!.x - 2, fy, anchor!.z + 4)).toBe(BLOCK.AIR); // 井眼
  }, 30_000);

  it('重复生成一致（同 seed 两次统计逐项相等）', () => {
    expect(anchor).not.toBeNull();
    const count = (r: ReturnType<typeof makeReader>, id: number): number =>
      countBlockAround(r, anchor!, 5, fy - 2, fy + 9, id);
    const a1 = count(makeReader(seed), BLOCK.RED_BRICK);
    const a2 = count(makeReader(seed), BLOCK.DARK_TILE);
    const a3 = count(makeReader(seed), BLOCK.GREY_BRICK);
    const b1 = count(makeReader(seed), BLOCK.RED_BRICK);
    const b2 = count(makeReader(seed), BLOCK.DARK_TILE);
    const b3 = count(makeReader(seed), BLOCK.GREY_BRICK);
    expect(b1).toBe(a1);
    expect(b2).toBe(a2);
    expect(b3).toBe(a3);
  }, 30_000);
});
