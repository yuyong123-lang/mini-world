// 西域区域单测（W3-A1）：甘肃（河西走廊定制 + 嘉峪关 jiayuguan）/ 新疆增强
// （覆盖 legacy + 苏公塔 sugong_tower）。
// 覆盖：两区域确定性（同 seed 逐字节）/ 新疆兼容哨兵（除 terrain.structures
// 外与 legacy 逐字段一致且非同一对象）/ 甘肃参数断言与祁连山雪线统计 /
// 两 kind 锚点特征方块（sugong_tower→SANDSTONE、jiayuguan→GREY_BRICK）/
// 苏公塔专测（塔身环墙 + 收分锥顶 + 塔门）/ 嘉峪关专测（城楼高度 ≥12、
// 大券门洞贯通、两翼长城贴地形、点将台旗杆、重复生成一致）。
//
// 注意：活动区域是模块级状态——每处 initTerrain 后才可 createChunkData；
// 跨 chunk 双算一致性由 tests/structures.test.ts 的自动派生用例覆盖，此处不重复。
import { describe, expect, it } from 'vitest';

import { REGIONS, makeSeedForRegion } from '../../src/data/regions';
import type { StructureKind } from '../../src/data/regions';
import { legacyRegions } from '../../src/data/regions/parts/legacy';
import { CHUNK_W, voxelIndex } from '../../src/core/constants';
import { BLOCK } from '../../src/blocks/registry';
import { anchorSuitable, structureAnchor } from '../../src/world/structures';
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

/** 结构锚点特征方块断言：锚点 ±2、fy..fy+8 窗口内必须出现 FEATURE 方块 */
function expectFeatureBlockAtAnchor(
  seed: string,
  kind: StructureKind,
  density: number,
  feature: number,
): void {
  const anchor = findKindAnchor(seed, kind, density);
  expect(anchor).not.toBeNull();
  const { get } = makeReader(seed);
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

describe('西域两区域确定性', () => {
  for (const id of ['gansu', 'xinjiang'] as const) {
    it(`区域 ${id}：同 seed 两次生成 (0,0)(2,-3) 逐字节一致`, () => {
      for (const [cx, cz] of [[0, 0], [2, -3]] as const) {
        initTerrain(makeSeedForRegion(id, 'w3-a1'));
        const a = createChunkData(cx, cz);
        initTerrain(makeSeedForRegion(id, 'w3-a1'));
        const b = createChunkData(cx, cz);
        expect(bytesEqual(a, b)).toBe(true);
      }
    }, 30_000);
  }
});

// ---------------------------------------------------------------------------
// 新疆增强：结构表追加苏公塔，其余字段与 legacy 逐字一致（兼容哨兵）
// ---------------------------------------------------------------------------

describe('新疆增强（覆盖 legacy）', () => {
  it('结构表恰好 [绿洲农庄 0.15, 苏公塔 0.03]（oasis_farm 照旧 + sugong_tower 稀有地标）', () => {
    expect(REGIONS.xinjiang!.terrain.structures).toEqual([
      { kind: 'oasis_farm', cellDensity: 0.15 },
      { kind: 'sugong_tower', cellDensity: 0.03 },
    ]);
  });

  it('兼容哨兵：除 terrain.structures 外与 legacy xinjiang 逐字段一致且非同一对象', () => {
    const w3 = REGIONS.xinjiang!;
    const old = legacyRegions.xinjiang;
    expect(w3).not.toBe(old); // 覆盖生效（不再是 legacy 同一对象）
    expect(w3.terrain).not.toBe(old.terrain);
    expect(w3.id).toBe(old.id);
    expect(w3.name).toBe(old.name);
    expect(w3.blurb).toBe(old.blurb);
    expect(w3.mapColor).toBe(old.mapColor);
    expect(w3.animals).toEqual(old.animals); // 动物表逐字保留
    expect(w3.animalGround).toEqual(old.animalGround); // 骆驼可出没沙漠
    expect(w3.atmosphere).toEqual(old.atmosphere); // 大漠晴空 + 通透雾逐字保留
    expect(w3.terrain.trees).toEqual(old.terrain.trees); // 胡杨稀树表逐字保留
    expect(w3.terrain.surface).toEqual(old.terrain.surface);
    for (const k of [
      'baseOffset',
      'contAmp',
      'hillsAmp',
      'ridgeAmp',
      'tempBias',
      'desertBias',
      'snowBias',
    ] as const) {
      expect(w3.terrain[k]).toBe(old.terrain[k]);
    }
    expect(w3.terrain.forceBiome).toBe(old.terrain.forceBiome);
    expect(w3.terrain.waterTopBlock).toBe(old.terrain.waterTopBlock);
    expect(w3.terrain.terraceStep).toBe(old.terrain.terraceStep);
  });
});

// ---------------------------------------------------------------------------
// 甘肃：河西走廊定制（参数断言 + 祁连山雪线统计）
// ---------------------------------------------------------------------------

describe('甘肃 gansu（W3 定制）', () => {
  it('参数断言：祁连山缓岭 + 极稀疏胡杨 + 民居/嘉峪关结构表', () => {
    const def = REGIONS.gansu!;
    expect(def.terrain.baseOffset).toBe(1);
    expect(def.terrain.contAmp).toBe(4);
    expect(def.terrain.hillsAmp).toBe(3);
    expect(def.terrain.ridgeAmp).toBe(12); // 祁连山余脉
    expect(def.terrain.tempBias).toBe(0.1);
    expect(def.terrain.desertBias).toBe(-0.35); // 负值 = 放宽沙漠阈值（terragen 语义），河西大漠
    expect(def.terrain.snowBias).toBe(0.2); // 祁连山雪线
    expect(def.terrain.trees).toEqual({
      chance: 0.003, // 极稀疏（大漠孤烟）
      kinds: [{ kind: 'poplar', weight: 1 }],
      onBiomes: ['grass'],
    });
    expect(def.terrain.structures).toEqual([
      { kind: 'house', cellDensity: 0.1 },
      { kind: 'jiayuguan', cellDensity: 0.02 },
    ]);
    expect(def.blurb).toContain('嘉峪关');
    expect(def.blurb).toContain('敦煌莫高窟');
    expect(def.blurb).toContain('河西走廊');
  });

  it('氛围与动物：大漠孤烟沙金地平 + 通透雾 + 戈壁浑黄水色；驼队/羊马出没于草地与沙地', () => {
    const def = REGIONS.gansu!;
    expect(def.atmosphere.fogScale).toBe(1.25);
    expect(def.atmosphere.waterTint).toBe('#8a7a4a');
    expect(def.atmosphere.sky!.noon!.top).toBe('#a8c4e0');
    expect(def.atmosphere.sky!.noon!.bottom).toBe('#e8d8a0'); // 沙金地平
    expect(def.animals.map((a) => a.key)).toEqual(['camel', 'sheep', 'horse', 'pig', 'panda']);
    expect(def.animals.map((a) => a.weight)).toEqual([1.2, 1.2, 0.5, 0.3, 0.06]);
    expect(def.animalGround).toEqual(['GRASS', 'SAND']);
  });

  it('祁连山雪线：雪原斑显著多于 generic 参照（snowBias 0.2 + 山脊抬升），且群系以草地为主', () => {
    const probe = (id: 'gansu' | 'generic'): { snow: number; grass: number; total: number } => {
      initTerrain(makeSeedForRegion(id, 't1'));
      let snow = 0;
      let grass = 0;
      let total = 0;
      for (let x = -210; x <= 210; x += 4) {
        for (let z = -210; z <= 210; z += 4) {
          total++;
          const b = biomeAt(x, z);
          if (b === 'snow') snow++;
          if (b === 'grass') grass++;
        }
      }
      return { snow, grass, total };
    };
    const gs = probe('gansu');
    const gen = probe('generic');
    expect(gs.total).toBeGreaterThan(5000);
    expect(gs.snow).toBeGreaterThan(0); // 祁连山雪原斑可出现
    expect(gs.snow).toBeGreaterThan(gen.snow); // 雪线显著低于 generic（高山雪原更多）
    expect(gs.grass).toBeGreaterThan(gs.snow * 2); // 走廊草地为主
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 两 kind 锚点特征方块（参照 findAnchor 模式；跨 chunk 由 structures.test 派生）
// ---------------------------------------------------------------------------

const FEATURE_CASES: Array<{
  region: 'gansu' | 'xinjiang';
  kind: StructureKind;
  density: number;
  block: number;
}> = [
  { region: 'xinjiang', kind: 'sugong_tower', density: 0.03, block: BLOCK.SANDSTONE },
  { region: 'gansu', kind: 'jiayuguan', density: 0.02, block: BLOCK.GREY_BRICK },
];

describe('西域结构特征方块', () => {
  for (const { region, kind, density, block } of FEATURE_CASES) {
    const seed = makeSeedForRegion(region, 'w3-feature');
    it(`${region}/${kind}：锚点附近落特征方块（0x${block.toString(16)}）`, () => {
      expectFeatureBlockAtAnchor(seed, kind, density, block);
    }, 30_000);
  }
});

// ---------------------------------------------------------------------------
// sugong_tower 专测：圆柱塔身 + 收分锥顶 + 塔门 + 确定性
// ---------------------------------------------------------------------------

describe('苏公塔 sugong_tower', () => {
  const seed = makeSeedForRegion('xinjiang', 'w3-feature');

  it('塔身环墙（SANDSTONE 大量）+ 塔心竖井 + 收分锥顶宝珠', () => {
    const anchor = findKindAnchor(seed, 'sugong_tower', 0.03);
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const fy = surfaceHeight(anchor!.x, anchor!.z) + 1;
    const tcz = anchor!.z - 1; // 塔心（北偏 1 格）
    // 塔身 SANDSTONE 大量使用（环墙 12 列 × 10 层 + 顶盘/殿身）
    const sand = countBlockAround({ get }, anchor!, 3, fy, fy + 14, BLOCK.SANDSTONE);
    expect(sand).toBeGreaterThan(120);
    // 塔心竖井（环墙围出，1 格宽）：塔身段为空，顶盘封顶
    expect(get(anchor!.x, fy + 5, tcz)).toBe(BLOCK.AIR);
    expect(get(anchor!.x, fy + 10, tcz)).toBe(BLOCK.SANDSTONE); // 顶盘（收分起点）
    expect(get(anchor!.x, fy + 11, tcz)).toBe(BLOCK.SANDSTONE); // 收分层
    expect(get(anchor!.x, fy + 12, tcz)).toBe(BLOCK.GREY_BRICK); // 宝珠
    expect(get(anchor!.x, fy + 13, tcz)).toBe(BLOCK.GREY_BRICK); // 宝珠顶
    // 塔身狭长窗洞（东向 1×2）与南向塔门（通礼拜殿）
    expect(get(anchor!.x + 2, fy + 3, tcz)).toBe(BLOCK.AIR);
    expect(get(anchor!.x + 2, fy + 4, tcz)).toBe(BLOCK.AIR);
    expect(get(anchor!.x, fy, tcz + 2)).toBe(BLOCK.AIR);
    expect(get(anchor!.x, fy + 1, tcz + 2)).toBe(BLOCK.AIR);
  }, 30_000);

  it('重复生成逐位一致（同锚点两次统计相同）', () => {
    const anchor = findKindAnchor(seed, 'sugong_tower', 0.03);
    expect(anchor).not.toBeNull();
    initTerrain(seed);
    const fy = surfaceHeight(anchor!.x, anchor!.z) + 1;
    const first = countBlockAround(makeReader(seed), anchor!, 3, fy, fy + 14, BLOCK.SANDSTONE);
    const second = countBlockAround(makeReader(seed), anchor!, 3, fy, fy + 14, BLOCK.SANDSTONE);
    expect(second).toBe(first);
    expect(first).toBeGreaterThan(0);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// jiayuguan 专测：城楼高度 ≥12 / 大券门洞贯通 / 两翼长城贴地形 / 确定性
// ---------------------------------------------------------------------------

describe('嘉峪关 jiayuguan', () => {
  const seed = makeSeedForRegion('gansu', 'w3-feature');

  it('中央城楼：锚点中心列自券顶向上连续 10 格实心，楼顶高度 ≥ fy+12（实际 fy+14）', () => {
    const anchor = findKindAnchor(seed, 'jiayuguan', 0.02);
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const fy = surfaceHeight(anchor!.x, anchor!.z) + 1;
    const cx = anchor!.x;
    const cz = anchor!.z + 5; // 城楼中心列（骑南墙正门上方）
    // 连续性：券顶带(fy+3) 至上檐(fy+12) 无空气（城台 + 两层柱墙 + 两重檐）
    for (let y = fy + 3; y <= fy + 12; y++) {
      expect(get(cx, y, cz)).not.toBe(BLOCK.AIR);
    }
    // 高度：城楼最高实心块 ≥ fy+12（正脊 fy+14）
    let maxY = 0;
    for (let y = fy; y <= fy + 16; y++) {
      if (get(cx, y, cz) !== BLOCK.AIR) maxY = y;
    }
    expect(maxY - fy).toBeGreaterThanOrEqual(12);
    // 三色组合：夯土城台 GREY_BRICK / 柱墙 RED_WALL / 琉璃檐 YELLOW_TILE
    const materials = new Set<number>();
    for (let y = fy; y <= fy + 14; y++) materials.add(get(cx, y, cz));
    expect(materials.has(BLOCK.GREY_BRICK)).toBe(true);
    expect(materials.has(BLOCK.RED_WALL)).toBe(true);
    expect(materials.has(BLOCK.YELLOW_TILE)).toBe(true);
  }, 30_000);

  it('大券门洞：3 宽贯通南北，洞内 2 格高为 AIR，前后洞口开放', () => {
    const anchor = findKindAnchor(seed, 'jiayuguan', 0.02);
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const fy = surfaceHeight(anchor!.x, anchor!.z) + 1;
    const cx = anchor!.x;
    // 城台厚 3（az+4..az+6）：洞内 3 宽 × 2 格高全空（券洞贯通南北）
    for (let z = anchor!.z + 4; z <= anchor!.z + 6; z++) {
      for (const dx of [-1, 0, 1]) {
        expect(get(cx + dx, fy, z)).toBe(BLOCK.AIR);
        expect(get(cx + dx, fy + 1, z)).toBe(BLOCK.AIR);
      }
    }
    // 前后洞口开放（可从城外直通城内）
    expect(get(cx, fy, anchor!.z + 3)).toBe(BLOCK.AIR);
    expect(get(cx, fy, anchor!.z + 7)).toBe(BLOCK.AIR);
  }, 30_000);

  it('两翼长城延伸段：东西各两列逐列落地（base = heightAt+1，墙身高 4）', () => {
    const anchor = findKindAnchor(seed, 'jiayuguan', 0.02);
    expect(anchor).not.toBeNull();
    initTerrain(seed);
    const heightAt = (x: number, z: number): number => surfaceHeight(x, z);
    const { get } = makeReader(seed);
    const wall = new Set<number>([BLOCK.GREY_BRICK, BLOCK.SANDSTONE]);
    for (const s of [-1, 1]) {
      for (const dx of [7, 8]) {
        const wx = anchor!.x + s * dx;
        const wz = anchor!.z;
        const base = heightAt(wx, wz) + 1; // 每列按地形落地（长城随山势起伏）
        expect(wall.has(get(wx, base, wz))).toBe(true); // 墙脚
        expect(wall.has(get(wx, base + 3, wz))).toBe(true); // 墙头（高 4）
      }
    }
  }, 30_000);

  it('城内点将台与旗杆：东北角 GREY_BRICK 方台两层 + LOG 旗杆 + WOOL 旗', () => {
    const anchor = findKindAnchor(seed, 'jiayuguan', 0.02);
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const fy = surfaceHeight(anchor!.x, anchor!.z) + 1;
    // 点将台（3×3 两层，落在锚点特征窗口内）
    expect(get(anchor!.x + 2, fy, anchor!.z - 2)).toBe(BLOCK.GREY_BRICK);
    expect(get(anchor!.x + 3, fy + 1, anchor!.z - 3)).toBe(BLOCK.GREY_BRICK);
    expect(get(anchor!.x + 4, fy + 1, anchor!.z - 4)).toBe(BLOCK.GREY_BRICK);
    // 旗杆 + 旗
    expect(get(anchor!.x + 3, fy + 2, anchor!.z - 3)).toBe(BLOCK.LOG);
    expect(get(anchor!.x + 3, fy + 4, anchor!.z - 3)).toBe(BLOCK.LOG);
    expect(get(anchor!.x + 4, fy + 4, anchor!.z - 3)).toBe(BLOCK.WOOL);
  }, 30_000);

  it('特征块 GREY_BRICK 大量使用且重复生成一致（确定性）', () => {
    const anchor = findKindAnchor(seed, 'jiayuguan', 0.02);
    expect(anchor).not.toBeNull();
    initTerrain(seed);
    const fy = surfaceHeight(anchor!.x, anchor!.z) + 1;
    const first = countBlockAround(makeReader(seed), anchor!, 9, fy, fy + 16, BLOCK.GREY_BRICK);
    const second = countBlockAround(makeReader(seed), anchor!, 9, fy, fy + 16, BLOCK.GREY_BRICK);
    expect(second).toBe(first);
    expect(first).toBeGreaterThan(150); // 城垣/城台/点将台的夯土主体
  }, 30_000);
});
