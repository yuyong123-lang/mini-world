// 蒙宁区域单测（W2-A2）：内蒙古增强（覆盖 legacy + 敖包 aobao）/ 宁夏（西北
// 黄河灌区 + 沙漠边缘 + 108塔群 towers_108）。
// 覆盖：两区域确定性（同 seed 逐字节）/ 内蒙古兼容哨兵（除 terrain.structures
// 外与 legacy 逐字段一致且非同一对象）/ 宁夏参数与沙漠边缘统计（desertBias
// 0.3 下 SAND 群系可出现且草地为主）/ 两 kind 锚点特征方块（aobao→STONE、
// towers_108→WHITE_STONE）/ towers_108 专测（塔数 ≥40、重复生成一致、阶梯感）。
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

// ---------------------------------------------------------------------------
// 确定性（区域定制改动的总闸）
// ---------------------------------------------------------------------------

describe('蒙宁两区域确定性', () => {
  for (const id of ['neimenggu', 'ningxia'] as const) {
    it(`区域 ${id}：同 seed 两次生成 (0,0)(2,-3) 逐字节一致`, () => {
      for (const [cx, cz] of [[0, 0], [2, -3]] as const) {
        initTerrain(makeSeedForRegion(id, 'w2-a2'));
        const a = createChunkData(cx, cz);
        initTerrain(makeSeedForRegion(id, 'w2-a2'));
        const b = createChunkData(cx, cz);
        expect(bytesEqual(a, b)).toBe(true);
      }
    }, 30_000);
  }
});

// ---------------------------------------------------------------------------
// 内蒙古增强：结构表追加敖包，其余字段与 legacy 逐字一致（兼容哨兵）
// ---------------------------------------------------------------------------

describe('内蒙古增强（覆盖 legacy）', () => {
  it('结构表恰好 [蒙古包 0.22, 敖包 0.03]（yurt 照旧 + aobao 稀有地标）', () => {
    expect(REGIONS.neimenggu!.terrain.structures).toEqual([
      { kind: 'yurt', cellDensity: 0.22 },
      { kind: 'aobao', cellDensity: 0.03 },
    ]);
  });

  it('兼容哨兵：除 terrain.structures 外与 legacy neimenggu 逐字段一致且非同一对象', () => {
    const w2 = REGIONS.neimenggu!;
    const old = legacyRegions.neimenggu;
    expect(w2).not.toBe(old); // 覆盖生效（不再是 legacy 同一对象）
    expect(w2.terrain).not.toBe(old.terrain);
    expect(w2.id).toBe(old.id);
    expect(w2.name).toBe(old.name);
    expect(w2.blurb).toBe(old.blurb);
    expect(w2.mapColor).toBe(old.mapColor);
    expect(w2.animals).toEqual(old.animals); // 动物表逐字保留
    expect(w2.animalGround).toEqual(old.animalGround);
    expect(w2.atmosphere).toEqual(old.atmosphere); // 氛围逐字保留（天苍苍野茫茫）
    expect(w2.terrain.trees).toEqual(old.terrain.trees); // 稀树表逐字保留
    expect(w2.terrain.surface).toEqual(old.terrain.surface);
    for (const k of [
      'baseOffset',
      'contAmp',
      'hillsAmp',
      'ridgeAmp',
      'tempBias',
      'desertBias',
      'snowBias',
    ] as const) {
      expect(w2.terrain[k]).toBe(old.terrain[k]);
    }
    expect(w2.terrain.forceBiome).toBe(old.terrain.forceBiome); // 全图草原强制逐字保留
    expect(w2.terrain.waterTopBlock).toBe(old.terrain.waterTopBlock);
  });
});

// ---------------------------------------------------------------------------
// 宁夏：参数定制 + 沙漠边缘统计
// ---------------------------------------------------------------------------

describe('宁夏 ningxia（W2 定制）', () => {
  it('参数断言：黄河灌区缓岭 + 沙漠边缘偏置 + 杨树稀树 + 民居/108塔结构表', () => {
    const def = REGIONS.ningxia!;
    expect(def.terrain.baseOffset).toBe(1);
    expect(def.terrain.contAmp).toBe(3);
    expect(def.terrain.hillsAmp).toBe(3);
    expect(def.terrain.ridgeAmp).toBe(10);
    expect(def.terrain.tempBias).toBe(0.1);
    expect(def.terrain.desertBias).toBe(0.3); // 沙漠边缘（只留一线沙带）
    expect(def.terrain.snowBias).toBe(0.1);
    expect(def.terrain.trees).toEqual({
      chance: 0.004,
      kinds: [{ kind: 'poplar', weight: 1 }],
      onBiomes: ['grass'],
    });
    expect(def.terrain.structures).toEqual([
      { kind: 'house', cellDensity: 0.12 },
      { kind: 'towers_108', cellDensity: 0.02 },
    ]);
    expect(def.blurb).toContain('108塔');
    expect(def.blurb).toContain('西夏王陵');
    expect(def.blurb).toContain('塞上江南');
  });

  it('氛围与动物：干燥亮黄天空 + 通透雾 + 黄河水色；滩羊/骆驼/牛出没于草地与沙地', () => {
    const def = REGIONS.ningxia!;
    expect(def.atmosphere.fogScale).toBe(1.2);
    expect(def.atmosphere.waterTint).toBe('#8a7a4a'); // 黄河
    expect(def.atmosphere.sky!.noon!.top).toBe('#a8c8e8');
    expect(def.atmosphere.sky!.noon!.bottom).toBe('#e8e0b0');
    expect(def.animals.map((a) => a.key)).toEqual(['sheep', 'camel', 'cow']);
    expect(def.animalGround).toEqual(['GRASS', 'SAND']); // 骆驼可出没于沙带
  });

  it('沙漠边缘：SAND 群系可出现（desertBias 0.3 下有沙带）且草地为主', () => {
    initTerrain(makeSeedForRegion('ningxia', 't1'));
    let desert = 0;
    let grass = 0;
    let total = 0;
    for (let x = -300; x <= 300; x += 5) {
      for (let z = -300; z <= 300; z += 5) {
        total++;
        const b = biomeAt(x, z);
        if (b === 'desert') desert++;
        if (b === 'grass') grass++;
      }
    }
    expect(total).toBeGreaterThan(5000);
    expect(desert).toBeGreaterThan(0); // 沙漠边缘：沙带可出现
    expect(grass).toBeGreaterThan(desert * 20); // 灌区草地远多于沙带（塞上江南）
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 两 kind 锚点特征方块（参照 findAnchor 模式）
// ---------------------------------------------------------------------------

const FEATURE_CASES: Array<{
  region: 'neimenggu' | 'ningxia';
  kind: StructureKind;
  density: number;
  block: number;
}> = [
  { region: 'neimenggu', kind: 'aobao', density: 0.03, block: BLOCK.STONE },
  { region: 'ningxia', kind: 'towers_108', density: 0.02, block: BLOCK.WHITE_STONE },
];

describe('蒙宁结构特征方块', () => {
  for (const { region, kind, density, block } of FEATURE_CASES) {
    const seed = makeSeedForRegion(region, 'w2-feature');
    it(`${region}/${kind}：锚点附近落特征方块（0x${block.toString(16)}）`, () => {
      const anchor = findKindAnchor(seed, kind, density);
      expect(anchor).not.toBeNull();
      const { get } = makeReader(seed);
      const fy = surfaceHeight(anchor!.x, anchor!.z) + 1;
      let seen = false;
      for (let dx = -3; dx <= 3 && !seen; dx++) {
        for (let dz = -3; dz <= 3 && !seen; dz++) {
          for (let y = fy; y <= fy + 10; y++) {
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
// towers_108 专测：塔数（每塔恰 1 块 YELLOW_TILE 塔珠）/ 确定性 / 阶梯感
// ---------------------------------------------------------------------------

describe('108塔群阵列', () => {
  const seed = makeSeedForRegion('ningxia', 'w2-feature');

  it('塔数 ≥ 40（阵列规模，108 的体素压缩版）且 WHITE_STONE 大量使用', () => {
    const anchor = findKindAnchor(seed, 'towers_108', 0.02);
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    // 每塔恰 1 块 YELLOW_TILE 塔珠 → 塔珠数 = 塔数；阵列 span ±7 → ±9 窗口全覆盖
    const pearls = countBlockAround({ get }, anchor!, 9, 10, 55, BLOCK.YELLOW_TILE);
    expect(pearls.count).toBeGreaterThanOrEqual(40);
    const white = countBlockAround({ get }, anchor!, 9, 10, 55, BLOCK.WHITE_STONE);
    expect(white.count).toBeGreaterThan(250); // 特征块大量使用
  }, 30_000);

  it('重复生成塔数一致（确定性）', () => {
    const anchor = findKindAnchor(seed, 'towers_108', 0.02);
    expect(anchor).not.toBeNull();
    const first = countBlockAround(makeReader(seed), anchor!, 9, 10, 55, BLOCK.YELLOW_TILE);
    const second = countBlockAround(makeReader(seed), anchor!, 9, 10, 55, BLOCK.YELLOW_TILE);
    expect(second.count).toBe(first.count);
    expect(first.count).toBeGreaterThan(0);
  }, 30_000);

  it('阶梯感：最高塔行 y ≥ 最低塔行 y + 5（依山抬升）', () => {
    const anchor = findKindAnchor(seed, 'towers_108', 0.02);
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const pearls = countBlockAround({ get }, anchor!, 9, 10, 55, BLOCK.YELLOW_TILE);
    expect(pearls.maxY).toBeGreaterThanOrEqual(pearls.minY + 5);
  }, 30_000);
});
