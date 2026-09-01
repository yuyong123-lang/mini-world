// 西南1川渝区域单测（W6-A1）：四川增强（覆盖 legacy + 乐山大佛 leshan_buddha）/
// 重庆（山城雾都 + 洪崖洞吊脚楼群 hongyadong + 解放碑 jiefangbei）。
// 覆盖：两区域确定性（同 seed 逐字节）/ 四川兼容哨兵（除 terrain.structures 外与
// legacy 逐字段一致且非同一对象）/ 重庆参数断言与山城起伏（> 四川盆地 legacy
// 参照）/ 三 kind 锚点特征方块命中（跨 chunk 双算一致性由 tests/structures.test.ts
// 自动派生覆盖，此处不重复）/ 各 stamp 独有断言（大佛佛头与九曲栈道、洪崖洞
// 灯火成排与三层屋顶、解放碑碑高与四面钟面）/ 重复生成一致 / 水平包络 ≤ 半径。
// 注意：活动区域是模块级状态——每处 initTerrain 后才可 createChunkData。
import { describe, expect, it } from 'vitest';

import { REGIONS, makeSeedForRegion } from '../../src/data/regions';
import type { StructureKind } from '../../src/data/regions';
import { legacyRegions } from '../../src/data/regions/parts/legacy';
import { CHUNK_W, voxelIndex } from '../../src/core/constants';
import { BLOCK } from '../../src/blocks/registry';
import { FEATURE_BLOCK, anchorSuitable, structureAnchor } from '../../src/world/structures';
import { createChunkData, initTerrain, surfaceHeight } from '../../src/world/terragen';
import {
  stampHongyadong,
  stampJiefangbei,
  stampLeshanBuddha,
} from '../../src/world/buildings/xinan1';
import type { StructPut } from '../../src/world/buildings/kit';

const REGION_IDS = ['sichuan', 'chongqing'] as const;
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
        if (!anchorSuitable(a, kind, heightAt)) continue;
        return a;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 纯函数级 stamp 收集器（平地注入；与 tests/regions/mid1.test.ts 同式）
// ---------------------------------------------------------------------------

type Stamp = (
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
) => void;

function stampCollect(stamp: Stamp, ax: number, az: number, fy: number): Map<string, number> {
  const map = new Map<string, number>();
  const put: StructPut = (x, y, z, id) => {
    map.set(`${x},${y},${z}`, id);
  };
  stamp(ax, az, fy, () => fy - 1, put);
  return map;
}

/** 某方块的最大 y（找不到返回 -1） */
function maxYOf(map: Map<string, number>, id: number): number {
  let mx = -1;
  for (const [k, v] of map) {
    if (v !== id) continue;
    const y = Number(k.split(',')[1]!);
    if (y > mx) mx = y;
  }
  return mx;
}

/** 某方块出现过的不同 y 层数 */
function levelsOf(map: Map<string, number>, id: number): Set<number> {
  const ys = new Set<number>();
  for (const [k, v] of map) {
    if (v === id) ys.add(Number(k.split(',')[1]!));
  }
  return ys;
}

/** 窗口（|dx|,|dz| ≤ r × y0..y1）内某方块计数 */
function countAround(
  map: Map<string, number>,
  ax: number,
  az: number,
  r: number,
  y0: number,
  y1: number,
  id: number,
): number {
  let n = 0;
  for (const [k, v] of map) {
    if (v !== id) continue;
    const [x, y, z] = k.split(',');
    if (
      Math.abs(Number(x) - ax) <= r &&
      Math.abs(Number(z) - az) <= r &&
      Number(y) >= y0 &&
      Number(y) <= y1
    ) {
      n++;
    }
  }
  return n;
}

/** 水平包络：全部落块 Chebyshev 距锚点 ≤ r（含出挑硬约束） */
function withinFootprint(map: Map<string, number>, ax: number, az: number, r: number): boolean {
  for (const k of map.keys()) {
    const [x, , z] = k.split(',');
    if (Math.max(Math.abs(Number(x) - ax), Math.abs(Number(z) - az)) > r) return false;
  }
  return true;
}

/** 两次 stamp 落块逐项一致 */
function expectSameStamp(stamp: Stamp, ax: number, az: number, fy: number): void {
  const a = stampCollect(stamp, ax, az, fy);
  const b = stampCollect(stamp, ax, az, fy);
  expect(a.size).toBe(b.size);
  for (const [k, id] of a) expect(b.get(k)).toBe(id);
}

// ---------------------------------------------------------------------------
// 确定性（区域定制改动的总闸）
// ---------------------------------------------------------------------------

describe('川渝两区域确定性', () => {
  for (const id of REGION_IDS) {
    it(`区域 ${id}：同 seed 两次生成 (0,0)(2,-3) 逐字节一致`, () => {
      for (const [cx, cz] of [[0, 0], [2, -3]] as const) {
        initTerrain(makeSeedForRegion(id, 'w6-a1'));
        const a = createChunkData(cx, cz);
        initTerrain(makeSeedForRegion(id, 'w6-a1'));
        const b = createChunkData(cx, cz);
        expect(bytesEqual(a, b)).toBe(true);
      }
    }, 30_000);
  }
});

// ---------------------------------------------------------------------------
// 四川增强：结构表追加乐山大佛，其余字段与 legacy 逐字一致（兼容哨兵）
// ---------------------------------------------------------------------------

describe('四川增强（覆盖 legacy）', () => {
  it('结构表恰好 [川西民居 0.18, 乐山大佛 0.02]（house 照旧 + leshan_buddha 稀有地标）', () => {
    expect(REGIONS.sichuan!.terrain.structures).toEqual([
      { kind: 'house', cellDensity: 0.18 },
      { kind: 'leshan_buddha', cellDensity: 0.02 },
    ]);
  });

  it('兼容哨兵：除 terrain.structures 外与 legacy sichuan 逐字段一致且非同一对象', () => {
    const w6 = REGIONS.sichuan!;
    const old = legacyRegions.sichuan;
    expect(w6).not.toBe(old); // 覆盖生效（不再是 legacy 同一对象）
    expect(w6.terrain).not.toBe(old.terrain);
    expect(w6.id).toBe(old.id);
    expect(w6.name).toBe(old.name);
    expect(w6.blurb).toBe(old.blurb); // 盆地雾气/竹林熊猫 blurb 逐字保留
    expect(w6.mapColor).toBe(old.mapColor);
    expect(w6.animals).toEqual(old.animals); // 动物表逐字保留
    expect(w6.animalGround).toEqual(old.animalGround);
    expect(w6.atmosphere).toEqual(old.atmosphere); // 雾气氛围逐字保留
    expect(w6.terrain.trees).toEqual(old.terrain.trees); // 竹林稀树表逐字保留
    expect(w6.terrain.surface).toEqual(old.terrain.surface);
    for (const k of [
      'baseOffset',
      'contAmp',
      'hillsAmp',
      'ridgeAmp',
      'tempBias',
      'desertBias',
      'snowBias',
    ] as const) {
      expect(w6.terrain[k]).toBe(old.terrain[k]);
    }
    expect(w6.terrain.terraceStep).toBe(old.terrain.terraceStep);
    expect(w6.terrain.forceBiome).toBe(old.terrain.forceBiome);
    expect(w6.terrain.waterTopBlock).toBe(old.terrain.waterTopBlock);
  });
});

// ---------------------------------------------------------------------------
// 重庆：参数定制 + 山城起伏（> 四川盆地 legacy 参照）
// ---------------------------------------------------------------------------

describe('重庆 chongqing（W6 定制）', () => {
  it('参数断言：山城坡地 + 竹木混生 + 洪崖洞/解放碑结构表', () => {
    const def = REGIONS.chongqing!;
    expect(def.terrain.baseOffset).toBe(2);
    expect(def.terrain.contAmp).toBe(4);
    expect(def.terrain.hillsAmp).toBe(5);
    expect(def.terrain.ridgeAmp).toBe(20); // 山城坡地
    expect(def.terrain.tempBias).toBe(0.1);
    expect(def.terrain.desertBias).toBe(0);
    expect(def.terrain.snowBias).toBe(0.15);
    expect(def.terrain.trees).toEqual({
      chance: 0.01,
      kinds: [
        { kind: 'bamboo', weight: 0.5 },
        { kind: 'oak', weight: 0.5 },
      ],
      onBiomes: ['grass'],
    });
    expect(def.terrain.structures).toEqual([
      { kind: 'hongyadong', cellDensity: 0.15 },
      { kind: 'jiefangbei', cellDensity: 0.02 },
    ]);
    expect(def.blurb).toContain('洪崖洞');
    expect(def.blurb).toContain('解放碑');
    expect(def.blurb).toContain('山城夜景');
  });

  it('氛围与动物：雾都青灰 + 雾距 0.7 + 两江浑黄；猪牛羊出没于草地', () => {
    const def = REGIONS.chongqing!;
    expect(def.atmosphere.fogScale).toBe(0.7); // 雾都（同四川盆地雾气量级）
    expect(def.atmosphere.waterTint).toBe('#6a7a5a'); // 长江/嘉陵江浑黄
    expect(def.atmosphere.sky!.noon!.top).toBe('#8fa8b0');
    expect(def.atmosphere.sky!.noon!.fog).toBe('#b8c4c0');
    expect(def.animals.map((a) => a.key)).toEqual(['pig', 'cow', 'sheep']);
    expect(def.animals.map((a) => a.weight)).toEqual([0.6, 0.5, 0.3]);
    expect(def.animalGround).toEqual(['GRASS']);
  });

  it('山城起伏（参数）：山脊/丘陵/基准全面大于四川盆地 legacy 参照', () => {
    const cq = REGIONS.chongqing!.terrain;
    const sc = legacyRegions.sichuan.terrain;
    expect(cq.ridgeAmp).toBeGreaterThan(sc.ridgeAmp);
    expect(cq.hillsAmp).toBeGreaterThan(sc.hillsAmp);
    expect(cq.baseOffset).toBeGreaterThan(sc.baseOffset);
    expect(cq.contAmp + cq.hillsAmp + cq.ridgeAmp).toBeGreaterThan(
      sc.contAmp + sc.hillsAmp + sc.ridgeAmp,
    );
  });

  it('山城起伏（实测）：抽样高度极差大于四川盆地（同抽样网格）', () => {
    const relief = (id: Rid): number => {
      initTerrain(makeSeedForRegion(id, 'w6-relief'));
      let min = Number.MAX_SAFE_INTEGER;
      let max = Number.MIN_SAFE_INTEGER;
      for (let x = -240; x <= 240; x += 6) {
        for (let z = -240; z <= 240; z += 6) {
          const h = surfaceHeight(x, z);
          if (h < min) min = h;
          if (h > max) max = h;
        }
      }
      return max - min;
    };
    expect(relief('chongqing')).toBeGreaterThan(relief('sichuan'));
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 三 kind 锚点特征方块（跨 chunk 硬闸由 tests/structures.test.ts 自动派生覆盖）
// ---------------------------------------------------------------------------

const FEATURE_CASES: Array<{
  region: Rid;
  kind: StructureKind;
  density: number;
  block: number;
}> = [
  { region: 'sichuan', kind: 'leshan_buddha', density: 0.02, block: BLOCK.STONE },
  { region: 'chongqing', kind: 'hongyadong', density: 0.15, block: BLOCK.DARK_WOOD },
  { region: 'chongqing', kind: 'jiefangbei', density: 0.02, block: BLOCK.CONCRETE },
];

describe('川渝结构特征方块', () => {
  for (const { region, kind, density, block } of FEATURE_CASES) {
    const seed = makeSeedForRegion(region, 'w6-feature');
    it(`${region}/${kind}：锚点 ±2 窗口内落特征方块（0x${block.toString(16)}）`, () => {
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

  it('三 kind 均登记特征方块且与表一致', () => {
    expect(FEATURE_BLOCK.leshan_buddha).toBe(BLOCK.STONE);
    expect(FEATURE_BLOCK.hongyadong).toBe(BLOCK.DARK_WOOD);
    expect(FEATURE_BLOCK.jiefangbei).toBe(BLOCK.CONCRETE);
  });
});

// ---------------------------------------------------------------------------
// 各 stamp 独有断言（纯函数级双算，平地注入）
// ---------------------------------------------------------------------------

const AX = 312;
const AZ = -117;
const FY = 21;

describe('乐山大佛 stamp 独有断言', () => {
  const map = stampCollect(stampLeshanBuddha, AX, AZ, FY);

  it('佛头存在：头部区（fy+13..fy+16）STONE 计数 ≥ 30（圆盘 r2 双层 + 颈肩 + 垂耳）', () => {
    expect(countAround(map, AX, AZ, 3, FY + 13, FY + 16, BLOCK.STONE)).toBeGreaterThanOrEqual(30);
  });

  it('螺髻顶：头部圆盘之上仍有 STONE 小堆（fy+17..fy+18）', () => {
    expect(map.get(`${AX},${FY + 18},${AZ - 1}`)).toBe(BLOCK.STONE);
    expect(map.get(`${AX},${FY + 17},${AZ - 1}`)).toBe(BLOCK.STONE);
    expect(maxYOf(map, BLOCK.STONE)).toBeGreaterThanOrEqual(FY + 17); // 总高 ~19
  });

  it('依山三级台基：满 footprint 实心，前坪/佛座台面就位', () => {
    expect(map.get(`${AX},${FY},${AZ}`)).toBe(BLOCK.STONE); // 佛座台基体
    expect(map.get(`${AX},${FY + 6},${AZ}`)).toBe(BLOCK.STONE); // 中台台面
    expect(map.get(`${AX},${FY + 4},${AZ + 4}`)).toBe(BLOCK.STONE); // 前坪铺装
    expect(map.get(`${AX},${FY + 7},${AZ}`)).toBe(BLOCK.GREY_BRICK); // 莲花座盘
    // 前坪以上（无佛体处）保持透空（三级阶梯感）
    expect(map.get(`${AX - 6},${FY + 6},${AZ + 6}`) ?? BLOCK.AIR).toBe(BLOCK.AIR);
  });

  it('九曲栈道：两侧 DARK_WOOD 窄栈道 + 栏杆矮柱（计数 ≥ 20）', () => {
    expect(countAround(map, AX, AZ, 7, FY, FY + 19, BLOCK.DARK_WOOD)).toBeGreaterThanOrEqual(20);
    // 两侧对称：同一相对偏移左右各一块栈道
    expect(map.get(`${AX - 6},${FY + 9},${AZ - 5}`)).toBe(BLOCK.DARK_WOOD);
    expect(map.get(`${AX + 6},${FY + 9},${AZ - 5}`)).toBe(BLOCK.DARK_WOOD);
  });

  it('双手抚膝：手背块落在膝沿上方（fy+7）', () => {
    expect(map.get(`${AX - 3},${FY + 7},${AZ + 3}`)).toBe(BLOCK.STONE);
    expect(map.get(`${AX + 3},${FY + 7},${AZ + 3}`)).toBe(BLOCK.STONE);
  });

  it('水平包络 ≤ 7（含栈道出挑）且重复生成一致', () => {
    expect(withinFootprint(map, AX, AZ, 7)).toBe(true);
    expectSameStamp(stampLeshanBuddha, AX, AZ, FY);
  });
});

describe('洪崖洞吊脚楼群 stamp 独有断言', () => {
  const map = stampCollect(stampHongyadong, AX, AZ, FY);

  it('檐下成排灯笼灯：GLOWBLOCK 计数 ≥ 8（三层檐口 + 柱廊 + 室内）', () => {
    expect(countAround(map, AX, AZ, 8, FY, FY + 20, BLOCK.GLOWBLOCK)).toBeGreaterThanOrEqual(8);
  });

  it('依山三层：DARK_TILE 群顶至少 3 个不同 y 层（逐层后退抬升）', () => {
    expect(levelsOf(map, BLOCK.DARK_TILE).size).toBeGreaterThanOrEqual(3);
  });

  it('底层吊脚柱间透空：前檐立面柱位 DARK_WOOD、柱间透空', () => {
    expect(map.get(`${AX + 3},${FY + 2},${AZ + 7}`)).toBe(BLOCK.DARK_WOOD); // 吊脚柱
    expect(map.get(`${AX + 4},${FY + 2},${AZ + 7}`) ?? BLOCK.AIR).toBe(BLOCK.AIR); // 柱间透空
    expect(map.get(`${AX + 5},${FY + 1},${AZ + 7}`) ?? BLOCK.AIR).toBe(BLOCK.AIR);
  });

  it('吊脚架空：二层楼板由 DARK_WOOD 吊脚柱承托（楼板 PLANKS + 柱网）', () => {
    expect(map.get(`${AX},${FY + 7},${AZ}`)).toBe(BLOCK.PLANKS); // 二层悬挑楼板
    expect(map.get(`${AX},${FY + 5},${AZ + 1}`)).toBe(BLOCK.DARK_WOOD); // 吊脚柱
    // 一层吊脚楼角柱（特征锚点位）
    expect(map.get(`${AX - 2},${FY + 5},${AZ + 2}`)).toBe(BLOCK.DARK_WOOD);
  });

  it('依山实心台基：台体在锚点正下砌实（STONE/GREY_BRICK 混砌）', () => {
    const core = map.get(`${AX},${FY + 2},${AZ}`);
    expect(core === BLOCK.STONE || core === BLOCK.GREY_BRICK).toBe(true);
    expect(map.get(`${AX},${FY + 4},${AZ}`)).toBe(BLOCK.STONE); // 台面铺装
  });

  it('层间石阶踏道贯通：西麓外廊石阶 + 扶手矮柱', () => {
    expect(map.get(`${AX - 7},${FY + 5},${AZ + 4}`)).toBe(BLOCK.STONE);
    expect(map.get(`${AX - 7},${FY + 7},${AZ + 2}`)).toBe(BLOCK.STONE); // 登二层
    expect(map.get(`${AX - 7},${FY + 10},${AZ - 4}`)).toBe(BLOCK.STONE); // 登顶层
    expect(map.get(`${AX - 6},${FY + 6},${AZ + 4}`)).toBe(BLOCK.DARK_WOOD); // 扶手
  });

  it('水平包络 ≤ 7（含出挑）且重复生成一致', () => {
    expect(withinFootprint(map, AX, AZ, 7)).toBe(true);
    expectSameStamp(stampHongyadong, AX, AZ, FY);
  });
});

describe('解放碑 stamp 独有断言', () => {
  const map = stampCollect(stampJiefangbei, AX, AZ, FY);

  it('碑体高耸：总高 ≥ 14（旗杆顶 ≥ fy+14）', () => {
    let topAll = -1;
    for (const k of map.keys()) {
      const y = Number(k.split(',')[1]!);
      if (y > topAll) topAll = y;
    }
    expect(topAll).toBeGreaterThanOrEqual(FY + 14);
    expect(maxYOf(map, BLOCK.CONCRETE)).toBeGreaterThanOrEqual(FY + 14); // 旗杆/亭顶
  });

  it('四面钟面：DARK_TILE 恰 4 块且同 y 层四方各 1', () => {
    const tiles: Array<{ x: number; y: number; z: number }> = [];
    for (const [k, v] of map) {
      if (v !== BLOCK.DARK_TILE) continue;
      const [x, y, z] = k.split(',').map(Number);
      tiles.push({ x: x!, y: y!, z: z! });
    }
    expect(tiles.length).toBe(4);
    expect(new Set(tiles.map((t) => t.y)).size).toBe(1); // 同 y 层
    const y = tiles[0]!.y;
    expect(tiles).toContainEqual({ x: AX, y, z: AZ + 1 });
    expect(tiles).toContainEqual({ x: AX, y, z: AZ - 1 });
    expect(tiles).toContainEqual({ x: AX + 1, y, z: AZ });
    expect(tiles).toContainEqual({ x: AX - 1, y, z: AZ });
  });

  it('台基两层 + 门洞：STONE 台面就位、正面 RED_DOOR 门、碑塔 CONCRETE 实心', () => {
    expect(map.get(`${AX},${FY - 2},${AZ}`)).toBe(BLOCK.STONE); // 下层台面
    expect(map.get(`${AX},${FY - 1},${AZ}`)).toBe(BLOCK.STONE); // 上层台面
    expect(map.get(`${AX},${FY},${AZ}`)).toBe(BLOCK.CONCRETE); // 碑塔
    expect(map.get(`${AX},${FY},${AZ + 1}`)).toBe(BLOCK.RED_DOOR); // 门洞嵌门
    expect(map.get(`${AX - 3},${FY - 1},${AZ - 3}`)).toBe(BLOCK.WHITE_STONE); // 栏板
  });

  it('水平包络 ≤ 3（r3 严格包络）且重复生成一致', () => {
    expect(withinFootprint(map, AX, AZ, 3)).toBe(true);
    expectSameStamp(stampJiefangbei, AX, AZ, FY);
  });
});

describe('川渝三 stamp 纯函数双算一致（几何确定性抽查）', () => {
  it('第二锚点同样确定（几何只依赖 (ax,az,fy)）', () => {
    for (const stamp of [stampLeshanBuddha, stampHongyadong, stampJiefangbei]) {
      expectSameStamp(stamp, AX - 640, AZ + 384, FY + 3);
    }
  });
});
