// 中南1两湖区城单测（W5-A1）：hubei（江汉平原 + 黄鹤楼）/ hunan（湘西山水 +
// 湘西吊脚楼 + 岳阳楼）。
// 覆盖：两区域确定性（同 seed 逐字节）/ 参数断言（hunan 起伏全面大于 hubei）/
// 三 kind 锚点特征方块命中（跨 chunk 双算一致性由 tests/structures.test.ts 自动
// 派生覆盖，此处不重复）/ 各 stamp 独有断言（黄鹤楼五层金檐盘 + 大攒尖、岳阳楼
// 黄琉璃盔顶、吊脚楼吊脚架空）/ 重复生成一致。
// 注意：活动区域是模块级状态——每处 initTerrain 后才可 createChunkData。
import { describe, expect, it } from 'vitest';

import { REGIONS, makeSeedForRegion } from '../../src/data/regions';
import type { StructureKind } from '../../src/data/regions';
import { CHUNK_W, voxelIndex } from '../../src/core/constants';
import { BLOCK } from '../../src/blocks/registry';
import { FEATURE_BLOCK, anchorSuitable, structureAnchor } from '../../src/world/structures';
import { createChunkData, initTerrain, surfaceHeight } from '../../src/world/terragen';
import {
  stampDiaojiaolou,
  stampYellowCrane,
  stampYueyangPavilion,
} from '../../src/world/buildings/mid1';
import type { StructPut } from '../../src/world/buildings/kit';

const REGION_IDS = ['hubei', 'hunan'] as const;
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

/** 纯函数级 stamp 收集器：平地注入，返回 (x,y,z) → blockId 映射 */
type Stamp = (
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
) => void;

function stampCollect(
  stamp: Stamp,
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

/** 中心列 (ax,az) 上某方块的垂直层数（distinct y） */
function columnLevels(map: Map<string, number>, id: number): Set<number> {
  const ys = new Set<number>();
  for (const [k, v] of map) {
    if (v !== id) continue;
    const [x, y, z] = k.split(',');
    if (Number(x) === AX && Number(z) === AZ) ys.add(Number(y));
  }
  return ys;
}

// ---------------------------------------------------------------------------
// 确定性（区域定制改动的总闸）
// ---------------------------------------------------------------------------

describe('中南1两湖确定性', () => {
  for (const id of REGION_IDS) {
    it(`区域 ${id}：同 seed 两次生成 (0,0)(2,-3) 逐字节一致`, () => {
      for (const [cx, cz] of [[0, 0], [2, -3]] as const) {
        initTerrain(makeSeedForRegion(id, 'w5-a1'));
        const a = createChunkData(cx, cz);
        initTerrain(makeSeedForRegion(id, 'w5-a1'));
        const b = createChunkData(cx, cz);
        expect(bytesEqual(a, b)).toBe(true);
      }
    }, 30_000);
  }
});

// ---------------------------------------------------------------------------
// 区域参数约定：结构表 / 树表 / 氛围 / 动物（hunan 起伏 > hubei）
// ---------------------------------------------------------------------------

describe('中南1两湖区域参数', () => {
  it('湖北：青瓦民居 + 黄鹤楼；江汉平原低平低振幅；江城水汽雾青 + 长江浊青', () => {
    const def = REGIONS.hubei!;
    expect(def.terrain.structures).toEqual([
      { kind: 'house', cellDensity: 0.15 },
      { kind: 'yellow_crane', cellDensity: 0.02 },
    ]);
    expect(def.terrain.baseOffset).toBe(0);
    expect(def.terrain.contAmp).toBe(3);
    expect(def.terrain.hillsAmp).toBe(2.5);
    expect(def.terrain.ridgeAmp).toBe(9);
    expect(def.terrain.trees.chance).toBe(0.01);
    expect(def.terrain.trees.kinds).toEqual([
      { kind: 'oak', weight: 0.5 },
      { kind: 'pagoda', weight: 0.3 },
      { kind: 'poplar', weight: 0.2 },
    ]);
    expect(def.atmosphere.fogScale).toBe(0.85);
    expect(def.atmosphere.waterTint).toBe('#4a7a7a');
    expect(def.atmosphere.sky?.noon).toBeDefined();
    expect(def.animals.map((a) => a.key)).toEqual(['pig', 'cow', 'sheep']);
    expect(def.animalGround).toEqual(['GRASS']);
  });

  it('湖南：湘西吊脚楼 0.18 高密度 + 岳阳楼；武陵山脊振幅；湘水烟云', () => {
    const def = REGIONS.hunan!;
    expect(def.terrain.structures).toEqual([
      { kind: 'diaojiaolou', cellDensity: 0.18 },
      { kind: 'yueyang_pavilion', cellDensity: 0.02 },
    ]);
    expect(def.terrain.baseOffset).toBe(1);
    expect(def.terrain.contAmp).toBe(4);
    expect(def.terrain.hillsAmp).toBe(4);
    expect(def.terrain.ridgeAmp).toBe(16);
    expect(def.terrain.trees.chance).toBe(0.011);
    expect(def.terrain.trees.kinds).toEqual([
      { kind: 'oak', weight: 0.45 },
      { kind: 'banana', weight: 0.3 },
      { kind: 'tea', weight: 0.25 },
    ]);
    expect(def.atmosphere.fogScale).toBe(0.85);
    expect(def.atmosphere.waterTint).toBe('#4a7a6a');
    expect(def.animals.map((a) => a.key)).toEqual(['pig', 'cow', 'sheep']);
    expect(def.animalGround).toEqual(['GRASS']);
  });

  it('hunan 起伏全面大于 hubei（湘西山地 vs 江汉平原）', () => {
    const hb = REGIONS.hubei!.terrain;
    const hn = REGIONS.hunan!.terrain;
    expect(hn.contAmp).toBeGreaterThan(hb.contAmp);
    expect(hn.hillsAmp).toBeGreaterThan(hb.hillsAmp);
    expect(hn.ridgeAmp).toBeGreaterThan(hb.ridgeAmp);
    expect(hn.contAmp + hn.hillsAmp + hn.ridgeAmp).toBeGreaterThan(
      hb.contAmp + hb.hillsAmp + hb.ridgeAmp,
    );
  });

  it('两区域江城水汽带气质一致：fogScale < 1 且特征地标各就位', () => {
    for (const id of REGION_IDS) {
      const def = REGIONS[id]!;
      expect(def.atmosphere.fogScale).toBeLessThan(1);
      expect(def.terrain.tempBias).toBeGreaterThan(0);
      expect(def.terrain.snowBias).toBeLessThanOrEqual(0.1);
      expect(def.terrain.structures.some((s) => s.cellDensity >= 0.15)).toBe(true); // 常见民居
      expect(def.terrain.structures.some((s) => s.cellDensity <= 0.02)).toBe(true); // 稀有地标
      expect(def.animals.every((a) => ['pig', 'cow', 'sheep'].includes(a.key))).toBe(true);
    }
  });
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
  { region: 'hubei', kind: 'yellow_crane', density: 0.02, block: BLOCK.YELLOW_TILE },
  { region: 'hunan', kind: 'yueyang_pavilion', density: 0.02, block: BLOCK.YELLOW_TILE },
  { region: 'hunan', kind: 'diaojiaolou', density: 0.18, block: BLOCK.DARK_WOOD },
];

describe('中南1两湖结构特征方块', () => {
  for (const { region, kind, density, block } of FEATURE_CASES) {
    const seed = makeSeedForRegion(region, 'w5-feature');
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
    expect(FEATURE_BLOCK.yellow_crane).toBe(BLOCK.YELLOW_TILE);
    expect(FEATURE_BLOCK.yueyang_pavilion).toBe(BLOCK.YELLOW_TILE);
    expect(FEATURE_BLOCK.diaojiaolou).toBe(BLOCK.DARK_WOOD);
  });
});

// ---------------------------------------------------------------------------
// 各 stamp 独有断言（纯函数级双算，平地注入）
// ---------------------------------------------------------------------------

const AX = 312;
const AZ = -117;
const FY = 21;

describe('黄鹤楼 stamp 独有断言', () => {
  it('五层金飞檐：中心列 YELLOW_TILE 檐盘垂直分布 ≥ 5 层', () => {
    const map = stampCollect(stampYellowCrane, AX, AZ, FY);
    const levels = columnLevels(map, BLOCK.YELLOW_TILE);
    expect(levels.size).toBeGreaterThanOrEqual(5);
  });

  it('蛇山高台基 + 大攒尖：总高 ≥ 18 格；台基 GREY_BRICK 在锚点正下', () => {
    const map = stampCollect(stampYellowCrane, AX, AZ, FY);
    let topAll = -1;
    for (const k of map.keys()) {
      const y = Number(k.split(',')[1]!);
      if (y > topAll) topAll = y;
    }
    expect(topAll).toBeGreaterThanOrEqual(FY + 18); // 总高
    expect(maxYOf(map, BLOCK.YELLOW_TILE)).toBeGreaterThanOrEqual(FY + 18); // 攒尖/宝顶
    expect(map.get(`${AX},${FY - 1},${AZ}`)).toBe(BLOCK.GREY_BRICK); // 上层台面
    expect(map.get(`${AX},${FY - 2},${AZ}`)).toBe(BLOCK.GREY_BRICK); // 下层台面
  });

  it('飞檐标志：每层檐盘四角上翘块（一层檐角在 fy+4 抬升）', () => {
    const map = stampCollect(stampYellowCrane, AX, AZ, FY);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      expect(map.get(`${AX + sx * 4},${FY + 4},${AZ + sz * 3}`)).toBe(BLOCK.YELLOW_TILE);
    }
  });
});

describe('岳阳楼 stamp 独有断言', () => {
  it('黄琉璃盔顶：顶部最高 3 格内 YELLOW_TILE 计数 > 0（顶珠/顶针/圆冠）', () => {
    const map = stampCollect(stampYueyangPavilion, AX, AZ, FY);
    const top = maxYOf(map, BLOCK.YELLOW_TILE);
    expect(top).toBeGreaterThan(0);
    let count = 0;
    for (const [k, id] of map) {
      if (id !== BLOCK.YELLOW_TILE) continue;
      const y = Number(k.split(',')[1]!);
      if (y >= top - 2) count++; // 最高 3 格
    }
    expect(count).toBeGreaterThan(0);
  });

  it('盔顶伞状收分：YELLOW_TILE 垂直层次 ≥ 5（门匾 + 盔顶盘/冠/珠）', () => {
    const map = stampCollect(stampYueyangPavilion, AX, AZ, FY);
    const levels = new Set<number>();
    for (const [k, id] of map) {
      if (id === BLOCK.YELLOW_TILE) levels.add(Number(k.split(',')[1]!));
    }
    expect(levels.size).toBeGreaterThanOrEqual(5);
    expect(map.get(`${AX},${FY + 2},${AZ + 2}`)).toBe(BLOCK.YELLOW_TILE); // 一层门匾
  });

  it('纯木楼体：DARK_WOOD 通柱贯穿三层（(±1,±1) 列连续）', () => {
    const map = stampCollect(stampYueyangPavilion, AX, AZ, FY);
    for (let y = FY; y <= FY + 9; y++) {
      expect(map.get(`${AX + 1},${y},${AZ + 1}`)).toBe(BLOCK.DARK_WOOD);
      expect(map.get(`${AX - 1},${y},${AZ - 1}`)).toBe(BLOCK.DARK_WOOD);
    }
  });
});

describe('湘西吊脚楼 stamp 独有断言', () => {
  it('吊脚架空：前半部楼板下 2 格高度处非实心通透（柱间可穿行）', () => {
    const map = stampCollect(stampDiaojiaolou, AX, AZ, FY);
    const px = AX + 1;
    const pz = AZ + 2; // 前半部（无柱列）
    expect(map.get(`${px},${FY + 2},${pz}`)).toBe(BLOCK.PLANKS); // 楼板（悬挑）
    // 收集器未落块 = 世界中天然空气（吊脚架空不垫实）→ 楼板下 2 格均非实心
    expect(map.get(`${px},${FY + 1},${pz}`) ?? BLOCK.AIR).toBe(BLOCK.AIR);
    expect(map.get(`${px},${FY},${pz}`) ?? BLOCK.AIR).toBe(BLOCK.AIR);
  });

  it('吊脚柱：前半部角柱 DARK_WOOD 连续 3 格撑起楼板', () => {
    const map = stampCollect(stampDiaojiaolou, AX, AZ, FY);
    for (let y = FY - 1; y <= FY + 1; y++) {
      expect(map.get(`${AX - 3},${y},${AZ + 3}`)).toBe(BLOCK.DARK_WOOD);
    }
  });

  it('L 形错落平面：前半部偏西出挑（东南缺口无楼板）+ 走栏 + 晒衣竹竿', () => {
    const map = stampCollect(stampDiaojiaolou, AX, AZ, FY);
    expect(map.get(`${AX + 2},${FY + 2},${AZ + 2}`)).toBeUndefined(); // L 缺口
    expect(map.get(`${AX - 3},${FY + 2},${AZ + 3}`)).toBe(BLOCK.PLANKS); // 悬挑楼板
    expect(map.get(`${AX - 2},${FY + 3},${AZ + 3}`)).toBe(BLOCK.WOOL); // 靠椅横栏
    expect(map.get(`${AX - 1},${FY + 3},${AZ + 4}`)).toBe(BLOCK.LOG); // 晒衣竹竿
  });

  it('重复生成一致：同锚点两次 stamp 落块逐项一致', () => {
    const a = stampCollect(stampDiaojiaolou, AX, AZ, FY);
    const b = stampCollect(stampDiaojiaolou, AX, AZ, FY);
    expect(a.size).toBe(b.size);
    for (const [k, id] of a) expect(b.get(k)).toBe(id);
  });
});

describe('中南1三 stamp 纯函数双算一致（几何确定性抽查）', () => {
  it('同锚点重复 stamp 两次落块逐项一致', () => {
    for (const stamp of [stampYellowCrane, stampYueyangPavilion, stampDiaojiaolou]) {
      const a = stampCollect(stamp, AX, AZ, FY);
      const b = stampCollect(stamp, AX, AZ, FY);
      expect(a.size).toBe(b.size);
      for (const [k, id] of a) expect(b.get(k)).toBe(id);
    }
  });

  it('第二锚点同样确定（跨 cell 几何只依赖 (ax,az,fy)）', () => {
    for (const stamp of [stampYellowCrane, stampYueyangPavilion, stampDiaojiaolou]) {
      const a = stampCollect(stamp, AX - 640, AZ + 384, FY + 3);
      const b = stampCollect(stamp, AX - 640, AZ + 384, FY + 3);
      expect(a.size).toBe(b.size);
      for (const [k, id] of a) expect(b.get(k)).toBe(id);
    }
  });
});
