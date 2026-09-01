// 华东1三省区域单测（W4-A1）：jiangsu（江南水乡 + 苏州园林）/ anhui（皖南徽派 +
// 马头墙民居）/ jiangxi（赣鄱丘陵 + 滕王阁）。
// 覆盖：三区域确定性（同 seed 逐字节）/ 水乡特征（江苏低海拔水面占比显著大于
// generic 参照）/ 结构表与树表氛围动物参数（安徽徽派民居单结构 0.18 高密度）/
// 三 kind 锚点特征方块（跨 chunk 双算一致性由 tests/structures.test.ts 自动派生
// 覆盖，此处不重复）/ 各 stamp 独有断言（月洞门+水池、马头墙高于屋面、三重绿
// 琉璃檐）。
// 注意：活动区域是模块级状态——每处 initTerrain 后才可 createChunkData。
import { describe, expect, it } from 'vitest';

import { REGIONS, makeSeedForRegion } from '../../src/data/regions';
import type { StructureKind } from '../../src/data/regions';
import { CHUNK_W, SEA_LEVEL, voxelIndex } from '../../src/core/constants';
import { BLOCK } from '../../src/blocks/registry';
import { FEATURE_BLOCK, anchorSuitable, structureAnchor } from '../../src/world/structures';
import { createChunkData, initTerrain, surfaceHeight } from '../../src/world/terragen';
import {
  stampGardenPavilion,
  stampHuiHouse,
  stampTengwangPavilion,
} from '../../src/world/buildings/east1';
import type { StructPut } from '../../src/world/buildings/kit';

const REGION_IDS = ['jiangsu', 'anhui', 'jiangxi'] as const;
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
 * 与 tests/regions/huanghe.test.ts 的 findKindAnchor 同式）。
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

/** 大范围抽样「水面列」占比（surfaceHeight 回退为 SEA_LEVEL 即水下列） */
function waterRatio(seed: string): number {
  initTerrain(seed);
  let water = 0;
  let total = 0;
  for (let x = -210; x <= 210; x += 4) {
    for (let z = -210; z <= 210; z += 4) {
      total++;
      if (surfaceHeight(x, z) <= SEA_LEVEL) water++;
    }
  }
  return water / total;
}

/** 纯函数级 stamp 收集器：平地注入，返回 (x,y,z) → blockId 映射 */
function stampCollect(
  stamp: typeof stampGardenPavilion,
  ax: number,
  az: number,
  fy: number,
): Map<string, number> {
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

// ---------------------------------------------------------------------------
// 确定性（区域定制改动的总闸）
// ---------------------------------------------------------------------------

describe('华东1三省确定性', () => {
  for (const id of REGION_IDS) {
    it(`区域 ${id}：同 seed 两次生成 (0,0)(2,-3) 逐字节一致`, () => {
      for (const [cx, cz] of [[0, 0], [2, -3]] as const) {
        initTerrain(makeSeedForRegion(id, 'w4-a1'));
        const a = createChunkData(cx, cz);
        initTerrain(makeSeedForRegion(id, 'w4-a1'));
        const b = createChunkData(cx, cz);
        expect(bytesEqual(a, b)).toBe(true);
      }
    }, 30_000);
  }
});

// ---------------------------------------------------------------------------
// 区域参数约定：结构表 / 树表 / 氛围 / 动物
// ---------------------------------------------------------------------------

describe('华东1三省区域参数', () => {
  it('江苏：青瓦民居 + 苏州园林；水网低平低振幅；烟雨雾 + 水乡绿水', () => {
    const def = REGIONS.jiangsu!;
    expect(def.terrain.structures).toEqual([
      { kind: 'house', cellDensity: 0.16 },
      { kind: 'garden_pavilion', cellDensity: 0.02 },
    ]);
    expect(def.terrain.baseOffset).toBe(0);
    expect(def.terrain.contAmp).toBe(3);
    expect(def.terrain.hillsAmp).toBe(2);
    expect(def.terrain.ridgeAmp).toBe(6);
    expect(def.terrain.trees.chance).toBe(0.011);
    expect(def.terrain.trees.kinds).toEqual([
      { kind: 'oak', weight: 0.5 },
      { kind: 'pagoda', weight: 0.3 },
      { kind: 'tea', weight: 0.2 },
    ]);
    expect(def.atmosphere.fogScale).toBe(0.8);
    expect(def.atmosphere.waterTint).toBe('#3a8a6a');
    expect(def.animals.map((a) => a.key)).toEqual(['pig', 'cow', 'sheep']);
    expect(def.animalGround).toEqual(['GRASS']);
  });

  it('安徽：徽派民居即标志（恰 1 条 0.18 高密度）；皖南山地振幅；山间云雾', () => {
    const def = REGIONS.anhui!;
    expect(def.terrain.structures).toEqual([{ kind: 'hui_house', cellDensity: 0.18 }]);
    expect(def.terrain.baseOffset).toBe(1);
    expect(def.terrain.contAmp).toBe(4);
    expect(def.terrain.hillsAmp).toBe(4);
    expect(def.terrain.ridgeAmp).toBe(16);
    expect(def.terrain.trees.kinds).toEqual([
      { kind: 'oak', weight: 0.5 },
      { kind: 'tea', weight: 0.3 },
      { kind: 'poplar', weight: 0.2 },
    ]);
    expect(def.atmosphere.fogScale).toBe(0.75);
    expect(def.atmosphere.waterTint).toBe('#3a8a6a');
    expect(def.animals.map((a) => a.key)).toEqual(['pig', 'cow', 'sheep']);
    expect(def.animalGround).toEqual(['GRASS']);
  });

  it('江西：青瓦民居 + 滕王阁；赣鄱丘陵振幅；茶树芭蕉混交', () => {
    const def = REGIONS.jiangxi!;
    expect(def.terrain.structures).toEqual([
      { kind: 'house', cellDensity: 0.15 },
      { kind: 'tengwang_pavilion', cellDensity: 0.02 },
    ]);
    expect(def.terrain.baseOffset).toBe(1);
    expect(def.terrain.contAmp).toBe(4);
    expect(def.terrain.hillsAmp).toBe(3.5);
    expect(def.terrain.ridgeAmp).toBe(14);
    expect(def.terrain.trees.kinds).toEqual([
      { kind: 'oak', weight: 0.4 },
      { kind: 'tea', weight: 0.35 },
      { kind: 'banana', weight: 0.25 },
    ]);
    expect(def.atmosphere.fogScale).toBe(0.9);
    expect(def.animals.map((a) => a.key)).toEqual(['pig', 'cow', 'sheep']);
  });

  it('三区域湿润带气质一致：fogScale 全部 < 1 且低温侧收敛（江南无雪原）', () => {
    for (const id of REGION_IDS) {
      const def = REGIONS[id]!;
      expect(def.atmosphere.fogScale).toBeLessThan(1);
      expect(def.terrain.tempBias).toBeGreaterThan(0);
      expect(def.terrain.snowBias).toBeLessThanOrEqual(0.1);
      expect(def.animals.every((a) => ['pig', 'cow', 'sheep'].includes(a.key))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 水乡特征：江苏水网密集（低海拔水面占比显著大于 generic 参照）
// ---------------------------------------------------------------------------

describe('江苏水乡地形特征', () => {
  it('江苏低海拔水面占比 > 10% 且显著大于 generic 参照（水网低平）', () => {
    const js = waterRatio(makeSeedForRegion('jiangsu', 'water'));
    const g = waterRatio('compat-seed'); // 无前缀 seed → generic 参照
    expect(js).toBeGreaterThan(0.1);
    expect(js).toBeGreaterThan(g + 0.05);
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
  { region: 'jiangsu', kind: 'garden_pavilion', density: 0.02, block: BLOCK.GREY_BRICK },
  { region: 'anhui', kind: 'hui_house', density: 0.18, block: BLOCK.WHITE_STONE },
  { region: 'jiangxi', kind: 'tengwang_pavilion', density: 0.02, block: BLOCK.GREEN_TILE },
];

describe('华东1三省结构特征方块', () => {
  for (const { region, kind, density, block } of FEATURE_CASES) {
    const seed = makeSeedForRegion(region, 'w4-feature');
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

  it('三 kind 均登记特征方块且互不混淆', () => {
    expect(FEATURE_BLOCK.garden_pavilion).toBe(BLOCK.GREY_BRICK);
    expect(FEATURE_BLOCK.hui_house).toBe(BLOCK.WHITE_STONE);
    expect(FEATURE_BLOCK.tengwang_pavilion).toBe(BLOCK.GREEN_TILE);
  });
});

// ---------------------------------------------------------------------------
// 各 stamp 独有断言（纯函数级双算，平地注入）
// ---------------------------------------------------------------------------

const AX = 312;
const AZ = -117;
const FY = 21;

describe('苏州园林 stamp 独有断言', () => {
  it('月洞门：南墙正中门洞上下贯通（AIR）+ DARK_TILE 圆环嵌墙（环外仍是白墙）', () => {
    const map = stampCollect(stampGardenPavilion, AX, AZ, FY);
    const z1 = AZ + 7; // 南墙
    for (let dy = 0; dy <= 2; dy++) {
      expect(map.get(`${AX},${FY + dy},${z1}`)).toBe(BLOCK.AIR); // 门洞（正中贯通）
    }
    // 圆环（圆心 (ax, fy+1)、环带 1.05 < d ≤ 2）：左右肩与上下环石
    expect(map.get(`${AX - 2},${FY + 1},${z1}`)).toBe(BLOCK.DARK_TILE);
    expect(map.get(`${AX + 2},${FY + 1},${z1}`)).toBe(BLOCK.DARK_TILE);
    expect(map.get(`${AX - 1},${FY},${z1}`)).toBe(BLOCK.DARK_TILE);
    expect(map.get(`${AX + 1},${FY + 2},${z1}`)).toBe(BLOCK.DARK_TILE);
    // 环外仍是白墙（圆未出墙洞范围）
    expect(map.get(`${AX - 2},${FY},${z1}`)).toBe(BLOCK.WHITE_STONE);
    expect(map.get(`${AX + 2},${FY + 2},${z1}`)).toBe(BLOCK.WHITE_STONE);
  });

  it('水池注水：WATER 恰 5×4=20 块；园墙压顶 DARK_TILE 存在', () => {
    const map = stampCollect(stampGardenPavilion, AX, AZ, FY);
    let water = 0;
    let tile = 0;
    for (const id of map.values()) {
      if (id === BLOCK.WATER) water++;
      if (id === BLOCK.DARK_TILE) tile++;
    }
    expect(water).toBe(20);
    expect(tile).toBeGreaterThan(0);
  });

  it('园墙齐全：四角 WHITE_STONE 到位（±7 包络 = FOOTPRINT_R）', () => {
    const map = stampCollect(stampGardenPavilion, AX, AZ, FY);
    const R = 7;
    for (const [dx, dz] of [[-R, -R], [R, -R], [-R, R], [R, R]] as const) {
      expect(map.get(`${AX + dx},${FY + 1},${AZ + dz}`)).toBe(BLOCK.WHITE_STONE);
    }
  });
});

describe('徽派马头墙民居 stamp 独有断言', () => {
  it('马头墙：山墙顶 WHITE_STONE 高于屋面 DARK_TILE 最高点', () => {
    const map = stampCollect(stampHuiHouse, AX, AZ, FY);
    expect(maxYOf(map, BLOCK.WHITE_STONE)).toBeGreaterThan(maxYOf(map, BLOCK.DARK_TILE));
  });

  it('门罩 + 朱红大门：南正门 RED_DOOR 上方 DARK_TILE 小瓦檐（3 宽 1 深）', () => {
    const map = stampCollect(stampHuiHouse, AX, AZ, FY);
    const z1 = AZ + 2; // 南墙
    expect(map.get(`${AX},${FY + 1},${z1}`)).toBe(BLOCK.RED_DOOR);
    for (let wx = AX - 1; wx <= AX + 1; wx++) {
      expect(map.get(`${wx},${FY + 2},${z1 + 1}`)).toBe(BLOCK.DARK_TILE);
    }
    expect(map.get(`${AX - 2},${FY + 2},${z1 + 1}`)).toBeUndefined(); // 门罩恰 3 宽
  });
});

describe('滕王阁 stamp 独有断言', () => {
  it('三重绿琉璃檐 + 歇山绿顶：GREEN_TILE 至少 4 个高度层次', () => {
    const map = stampCollect(stampTengwangPavilion, AX, AZ, FY);
    const levels = new Set<number>();
    for (const [k, id] of map) {
      if (id === BLOCK.GREEN_TILE) levels.add(Number(k.split(',')[1]!));
    }
    expect(levels.size).toBeGreaterThanOrEqual(4);
  });

  it('高台基 + 高阁：GREY_BRICK 台基在锚点正下、总高 ≥ 15 格（顶珠封顶）', () => {
    const map = stampCollect(stampTengwangPavilion, AX, AZ, FY);
    expect(map.get(`${AX},${FY - 1},${AZ}`)).toBe(BLOCK.GREY_BRICK); // 上层台面
    expect(maxYOf(map, BLOCK.YELLOW_TILE)).toBeGreaterThanOrEqual(FY + 16); // 顶珠
    expect(maxYOf(map, BLOCK.RED_WALL)).toBeGreaterThanOrEqual(FY + 11); // 三层阁身
  });
});

describe('华东1三 stamp 纯函数双算一致（几何确定性抽查）', () => {
  it('同锚点重复 stamp 两次落块逐项一致', () => {
    for (const stamp of [stampGardenPavilion, stampHuiHouse, stampTengwangPavilion]) {
      const a = stampCollect(stamp, AX, AZ, FY);
      const b = stampCollect(stamp, AX, AZ, FY);
      expect(a.size).toBe(b.size);
      for (const [k, id] of a) expect(b.get(k)).toBe(id);
    }
  });

  it('hash 驱动的假山/竹丛跨锚点同样确定（第二锚点逐项一致）', () => {
    const a = stampCollect(stampGardenPavilion, AX + 512, AZ + 256, FY);
    const b = stampCollect(stampGardenPavilion, AX + 512, AZ + 256, FY);
    expect(a.size).toBe(b.size);
    for (const [k, id] of a) expect(b.get(k)).toBe(id);
  });
});
