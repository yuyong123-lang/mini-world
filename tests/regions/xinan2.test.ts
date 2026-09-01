// 西南2区域单测（W6-A2）：贵州（苗岭山地 + 苗寨吊脚楼/甲秀楼）/ 云南增强（覆盖
// legacy + 崇圣寺三塔）。
// 覆盖：两区域确定性（同 seed 逐字节）/ 云南兼容哨兵（除 terrain.structures 外与
// legacy 逐字段一致且非同一对象、structures 恰两条）/ 贵州参数断言（ridgeAmp 17、
// fogScale 0.8、结构表两条含 diaojiaolou）/ 四 kind 锚点特征方块（跨 chunk 一致性
// 由 tests/structures.test.ts 自动派生覆盖）/ three_pagodas 专测（三塔密檐沿 3 个
// 不同 x 位置垂直分布：主塔中心列 ≥8 层檐、两辅塔位各 ≥5 层；主塔总高 ≥16 > 辅塔）
// / jiaxiu_pavilion 专测（三重檐 ≥3 个不同 y 层；桥贯通 ax±4 桥面实心）/
// 两地标重复生成一致。
//
// 注意：活动区域是模块级状态——每处 initTerrain 后才可 createChunkData。
import { describe, expect, it } from 'vitest';

import { REGIONS, makeSeedForRegion } from '../../src/data/regions';
import type { StructureKind } from '../../src/data/regions';
import { legacyRegions } from '../../src/data/regions/parts/legacy';
import { CHUNK_W, voxelIndex } from '../../src/core/constants';
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

/** 单列上某方块出现的不同 y 层数（密檐/重檐垂直分布断言用） */
function yLevelsAt(
  reader: ReturnType<typeof makeReader>,
  x: number,
  z: number,
  yFrom: number,
  yTo: number,
  id: number,
): number[] {
  const ys: number[] = [];
  for (let y = yFrom; y <= yTo; y++) {
    if (reader.get(x, y, z) === id) ys.push(y);
  }
  return ys;
}

/** 单列最高非空气块（总高断言用） */
function topSolidY(
  reader: ReturnType<typeof makeReader>,
  x: number,
  z: number,
  fy: number,
): number {
  for (let y = 62; y >= fy; y--) {
    if (reader.get(x, y, z) !== BLOCK.AIR) return y;
  }
  return fy - 1;
}

// ---------------------------------------------------------------------------
// 确定性（区域定制改动的总闸）
// ---------------------------------------------------------------------------

describe('黔滇两区域确定性', () => {
  for (const id of ['guizhou', 'yunnan'] as const) {
    it(`区域 ${id}：同 seed 两次生成 (0,0)(2,-3) 逐字节一致`, () => {
      for (const [cx, cz] of [[0, 0], [2, -3]] as const) {
        initTerrain(makeSeedForRegion(id, 'w6-a2'));
        const a = createChunkData(cx, cz);
        initTerrain(makeSeedForRegion(id, 'w6-a2'));
        const b = createChunkData(cx, cz);
        expect(bytesEqual(a, b)).toBe(true);
      }
    }, 30_000);
  }
});

// ---------------------------------------------------------------------------
// 云南增强：结构表追加三塔，其余字段与 legacy 逐字一致（兼容哨兵）
// ---------------------------------------------------------------------------

describe('云南增强（覆盖 legacy）', () => {
  it('结构表恰好 [傣族竹楼 0.2, 崇圣寺三塔 0.035]（bamboo_house 照旧 + 稀有地标）', () => {
    expect(REGIONS.yunnan!.terrain.structures).toEqual([
      { kind: 'bamboo_house', cellDensity: 0.2 },
      // 0.035：云南水面占比高，0.02 在 ±16 cell 扫描窗内无可着陆锚点（见 parts/xinan2.ts 注）
      { kind: 'three_pagodas', cellDensity: 0.035 },
    ]);
  });

  it('兼容哨兵：除 terrain.structures 外与 legacy yunnan 逐字段一致且非同一对象', () => {
    const w6 = REGIONS.yunnan!;
    const old = legacyRegions.yunnan;
    expect(w6).not.toBe(old); // 覆盖生效（不再是 legacy 同一对象）
    expect(w6.terrain).not.toBe(old.terrain);
    expect(w6.id).toBe(old.id);
    expect(w6.name).toBe(old.name);
    expect(w6.blurb).toBe(old.blurb);
    expect(w6.mapColor).toBe(old.mapColor);
    expect(w6.animals).toEqual(old.animals); // 动物表逐字保留
    expect(w6.animalGround).toEqual(old.animalGround);
    expect(w6.atmosphere).toEqual(old.atmosphere); // 氛围逐字保留
    expect(w6.terrain.trees).toEqual(old.terrain.trees); // 棕榈/芭蕉/茶树逐字保留
    expect(w6.terrain.surface).toEqual(old.terrain.surface);
    for (const k of [
      'baseOffset',
      'contAmp',
      'hillsAmp',
      'ridgeAmp',
      'tempBias',
      'desertBias',
      'snowBias',
      'terraceStep', // 梯田量化逐字保留
    ] as const) {
      expect(w6.terrain[k]).toBe(old.terrain[k]);
    }
    expect(w6.terrain.forceBiome).toBe(old.terrain.forceBiome);
    expect(w6.terrain.waterTopBlock).toBe(old.terrain.waterTopBlock);
  });
});

// ---------------------------------------------------------------------------
// 贵州：参数定制（W6）
// ---------------------------------------------------------------------------

describe('贵州 guizhou（W6 定制）', () => {
  it('参数断言：苗岭山地起伏 + 湿润亚热带偏置 + 竹杉茶混交 + 吊脚楼/甲秀楼结构表', () => {
    const def = REGIONS.guizhou!;
    expect(def.terrain.baseOffset).toBe(1);
    expect(def.terrain.contAmp).toBe(4);
    expect(def.terrain.hillsAmp).toBe(4.5);
    expect(def.terrain.ridgeAmp).toBe(17);
    expect(def.terrain.tempBias).toBe(0.1);
    expect(def.terrain.desertBias).toBe(0);
    expect(def.terrain.snowBias).toBe(0.1);
    expect(def.terrain.trees).toEqual({
      chance: 0.011,
      kinds: [
        { kind: 'bamboo', weight: 0.4 },
        { kind: 'oak', weight: 0.35 },
        { kind: 'tea', weight: 0.25 },
      ],
      onBiomes: ['grass'],
    });
    expect(def.terrain.structures).toEqual([
      { kind: 'diaojiaolou', cellDensity: 0.16 }, // 复用湘西吊脚楼作苗寨吊脚楼
      { kind: 'jiaxiu_pavilion', cellDensity: 0.02 }, // 甲秀楼（稀有地标）
    ]);
    expect(def.atmosphere.fogScale).toBe(0.8); // 黔山云雾
    expect(def.atmosphere.waterTint).toBe('#3a8a6a');
    expect(def.animals.map((a) => a.key)).toEqual(['pig', 'cow', 'sheep']);
    expect(def.animals.map((a) => a.weight)).toEqual([0.8, 0.5, 0.4]);
    expect(def.animalGround).toEqual(['GRASS']);
    expect(def.blurb).toContain('甲秀楼');
    expect(def.blurb).toContain('黄果树');
    expect(def.blurb).toContain('千户苗寨');
  });

  it('波内约定：结构表「常见 + 稀有」双条目且密度递减', () => {
    const st = REGIONS.guizhou!.terrain.structures;
    expect(st).toHaveLength(2);
    expect(st[0]!.cellDensity).toBeGreaterThan(st[1]!.cellDensity);
  });
});

// ---------------------------------------------------------------------------
// 四 kind 锚点特征方块（与 structures.test 自动派生用例同窗口）
// ---------------------------------------------------------------------------

const FEATURE_CASES: Array<{
  region: 'guizhou' | 'yunnan';
  kind: StructureKind;
  density: number;
  block: number;
}> = [
  { region: 'guizhou', kind: 'diaojiaolou', density: 0.16, block: BLOCK.DARK_WOOD },
  { region: 'guizhou', kind: 'jiaxiu_pavilion', density: 0.02, block: BLOCK.WHITE_STONE },
  { region: 'yunnan', kind: 'bamboo_house', density: 0.2, block: BLOCK.BAMBOO_PLANK },
  { region: 'yunnan', kind: 'three_pagodas', density: 0.035, block: BLOCK.WHITE_STONE },
];

describe('黔滇结构特征方块', () => {
  for (const { region, kind, density, block } of FEATURE_CASES) {
    const seed = makeSeedForRegion(region, 'struct-test'); // 与 structures.test 派生用例同 seed
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
// 崇圣寺三塔 three_pagodas 专测：三塔密檐垂直分布 / 主辅错落 / 塔院 / 确定性
// ---------------------------------------------------------------------------

describe('崇圣寺三塔 three_pagodas', () => {
  const seed = makeSeedForRegion('yunnan', 'struct-test'); // 与 structures.test 派生用例同 seed
  const anchor = findKindAnchor(seed, 'three_pagodas', 0.035);
  const fy = anchor ? surfaceHeight(anchor.x, anchor.z) + 1 : 0;

  it('锚点存在且场地足够低（topClamp 不削顶，主塔塔珠完整）', () => {
    expect(anchor).not.toBeNull();
    expect(fy).toBeLessThanOrEqual(40); // fy+21 ≤ 62（w6-feature 实测锚点远低于此）
  }, 30_000);

  it('三塔密檐沿 3 个不同 x 位置垂直分布：主塔中心列 ≥8 层檐、两辅塔位各 ≥5 层', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const main = yLevelsAt({ get }, anchor!.x, anchor!.z, fy, fy + 22, BLOCK.DARK_TILE);
    expect(main.length).toBeGreaterThanOrEqual(8); // 主塔 10 层密檐
    const auxE = yLevelsAt({ get }, anchor!.x - 4, anchor!.z + 3, fy, fy + 12, BLOCK.DARK_TILE);
    const auxW = yLevelsAt({ get }, anchor!.x + 4, anchor!.z + 3, fy, fy + 12, BLOCK.DARK_TILE);
    expect(auxE.length).toBeGreaterThanOrEqual(5); // 辅塔 6 层密檐
    expect(auxW.length).toBeGreaterThanOrEqual(5);
    expect(new Set([anchor!.x, anchor!.x - 4, anchor!.x + 4]).size).toBe(3); // 三个不同 x 位置
  }, 30_000);

  it('主辅错落：主塔总高 ≥16 且高于两辅塔（千寻塔居中冠绝）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const mainTop = topSolidY({ get }, anchor!.x, anchor!.z, fy);
    const auxETop = topSolidY({ get }, anchor!.x - 4, anchor!.z + 3, fy);
    const auxWTop = topSolidY({ get }, anchor!.x + 4, anchor!.z + 3, fy);
    expect(mainTop - fy).toBeGreaterThanOrEqual(16);
    expect(mainTop).toBeGreaterThan(auxETop);
    expect(mainTop).toBeGreaterThan(auxWTop);
  }, 30_000);

  it('塔院：WHITE_STONE 大量使用 + 后角常青 2 株 + 主塔南向小龛透空', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const white = countBlockAround({ get }, anchor!, 6, fy - 1, fy + 22, BLOCK.WHITE_STONE);
    expect(white).toBeGreaterThan(150); // 主塔塔身 + 栏板 + 辅塔 + 塔珠（实测 ~190）
    const leaves = countBlockAround({ get }, anchor!, 6, fy, fy + 5, BLOCK.SPRUCE_LEAVES);
    expect(leaves).toBeGreaterThanOrEqual(20); // 2 株常青（各 11 块叶）
    expect(get(anchor!.x, fy, anchor!.z + 2)).toBe(BLOCK.AIR); // 南向小龛 1×2
    expect(get(anchor!.x, fy + 1, anchor!.z + 2)).toBe(BLOCK.AIR);
  }, 30_000);

  it('重复生成一致（同 seed 两次统计逐项相等）', () => {
    expect(anchor).not.toBeNull();
    const count = (id: number): number =>
      countBlockAround(makeReader(seed), anchor!, 6, fy - 1, fy + 22, id);
    const a1 = count(BLOCK.WHITE_STONE);
    const a2 = count(BLOCK.DARK_TILE);
    const a3 = count(BLOCK.SPRUCE_LEAVES);
    const b1 = count(BLOCK.WHITE_STONE);
    const b2 = count(BLOCK.DARK_TILE);
    const b3 = count(BLOCK.SPRUCE_LEAVES);
    expect(b1).toBe(a1);
    expect(b2).toBe(a2);
    expect(b3).toBe(a3);
    expect(a2).toBeGreaterThan(150); // 密檐薄盘（主塔 10 层 + 辅塔 12 层）
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 甲秀楼 jiaxiu_pavilion 专测：三重檐 / 浮玉桥贯通 / 桥头石狮 / 确定性
// ---------------------------------------------------------------------------

describe('甲秀楼 jiaxiu_pavilion', () => {
  const seed = makeSeedForRegion('guizhou', 'struct-test'); // 与 structures.test 派生用例同 seed
  const anchor = findKindAnchor(seed, 'jiaxiu_pavilion', 0.02);
  const fy = anchor ? surfaceHeight(anchor.x, anchor.z) + 1 : 0;

  it('锚点存在且场地足够低（topClamp 不削顶，顶珠完整）', () => {
    expect(anchor).not.toBeNull();
    expect(fy).toBeLessThanOrEqual(47); // fy+14 ≤ 62（w6-feature 实测锚点远低于此）
  }, 30_000);

  it('三重檐：楼体中心列 DARK_TILE 檐盘 ≥3 个不同 y 层（三重四角攒尖）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const levels = yLevelsAt({ get }, anchor!.x, anchor!.z, fy, fy + 15, BLOCK.DARK_TILE);
    expect(levels.length).toBeGreaterThanOrEqual(3);
    expect(levels[levels.length - 1]! - levels[0]!).toBeGreaterThanOrEqual(6); // 层间距拉开
  }, 30_000);

  it('浮玉桥贯通：ax±4 桥面（fy 层）沿桥轴连续实心', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    for (let dx = -4; dx <= 4; dx++) {
      expect(get(anchor!.x + dx, fy, anchor!.z)).not.toBe(BLOCK.AIR);
    }
  }, 30_000);

  it('桥头石狮 2 座 + 桥栏望柱：COBBLE/GREY_BRICK/WHITE_STONE 就位', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    for (const s of [-1, 1] as const) {
      expect(get(anchor!.x + s * 5, fy + 1, anchor!.z + 1)).toBe(BLOCK.COBBLE); // 狮身
      expect(get(anchor!.x + s * 5, fy + 3, anchor!.z + 1)).toBe(BLOCK.GREY_BRICK); // 狮头
      expect(get(anchor!.x + s * 5, fy + 1, anchor!.z - 1)).toBe(BLOCK.WHITE_STONE); // 望柱
    }
    const rail = countBlockAround({ get }, anchor!, 5, fy + 1, fy + 1, BLOCK.WHITE_STONE);
    expect(rail).toBeGreaterThanOrEqual(8); // 矮栏 + 望柱 + 楼体墙（桥栏层）
  }, 30_000);

  it('重复生成一致（同 seed 两次统计逐项相等）', () => {
    expect(anchor).not.toBeNull();
    const count = (id: number): number =>
      countBlockAround(makeReader(seed), anchor!, 5, fy, fy + 15, id);
    const a1 = count(BLOCK.WHITE_STONE);
    const a2 = count(BLOCK.DARK_TILE);
    const a3 = count(BLOCK.STONE);
    const b1 = count(BLOCK.WHITE_STONE);
    const b2 = count(BLOCK.DARK_TILE);
    const b3 = count(BLOCK.STONE);
    expect(b1).toBe(a1);
    expect(b2).toBe(a2);
    expect(b3).toBe(a3);
    expect(a2).toBeGreaterThan(80); // 三重檐盘 + 攒尖
  }, 30_000);
});
