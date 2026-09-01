// 中南2区域单测（W5-A2）：广东（珠三角 + 骑楼街/广州塔）/ 广西（喀斯特峰林 +
// 干栏木楼/程阳风雨桥）/ 海南（热带海岛 + 高脚屋/骑楼老街）。
// 覆盖：三区域确定性（同 seed 逐字节）/ 三区域参数与氛围/动物断言（广西起伏 >
// 广东、海南 tempBias 三区最大）/ 地形对比（桂 > 粤）/ 四 kind 锚点特征方块
//（跨 chunk 一致性由 structures.test 自动派生覆盖）/ canton_tower 专测（总高
// ≥26、腰身收分、格构材料计数）/ qilou 专测（底层柱廊透空 + 楼板悬挑）/
// wind_rain_bridge 专测（桥面贯通 + 三亭顶珠 + 石墩落地）/ ganlan_house 专测
//（全架空 + 茅草顶）。
//
// 注意：活动区域是模块级状态——每处 initTerrain 后才可 createChunkData。
import { describe, expect, it } from 'vitest';

import { REGIONS, makeSeedForRegion } from '../../src/data/regions';
import type { StructureKind } from '../../src/data/regions';
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

/**
 * 大范围地形统计（海拔极差）。网格固定 → 结果确定，可作跨区域比较基准。
 */
function terrainRange(id: 'guangdong' | 'guangxi' | 'hainan'): { range: number } {
  initTerrain(makeSeedForRegion(id, 'cmp-range'));
  let min = Number.MAX_SAFE_INTEGER;
  let max = 0;
  for (let x = -200; x <= 200; x += 5) {
    for (let z = -200; z <= 200; z += 5) {
      const h = surfaceHeight(x, z);
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  return { range: max - min };
}

// ---------------------------------------------------------------------------
// 确定性（区域定制改动的总闸）
// ---------------------------------------------------------------------------

describe('中南2三区域确定性', () => {
  for (const id of ['guangdong', 'guangxi', 'hainan'] as const) {
    it(`区域 ${id}：同 seed 两次生成 (0,0)(2,-3) 逐字节一致`, () => {
      for (const [cx, cz] of [[0, 0], [2, -3]] as const) {
        initTerrain(makeSeedForRegion(id, 'w5-a2'));
        const a = createChunkData(cx, cz);
        initTerrain(makeSeedForRegion(id, 'w5-a2'));
        const b = createChunkData(cx, cz);
        expect(bytesEqual(a, b)).toBe(true);
      }
    }, 30_000);
  }
});

// ---------------------------------------------------------------------------
// 三区域参数 / 氛围 / 动物断言
// ---------------------------------------------------------------------------

describe('广东 guangdong（W5 定制）', () => {
  it('参数断言：珠三角低平 + 湿热偏置 + 椰芭榕树种 + 骑楼街/广州塔结构表', () => {
    const def = REGIONS.guangdong!;
    expect(def.terrain.baseOffset).toBe(0);
    expect(def.terrain.contAmp).toBe(3);
    expect(def.terrain.hillsAmp).toBe(2.5);
    expect(def.terrain.ridgeAmp).toBe(8);
    expect(def.terrain.tempBias).toBe(0.25);
    expect(def.terrain.snowBias).toBe(0);
    expect(def.terrain.trees.chance).toBe(0.012);
    expect(def.terrain.trees.kinds).toEqual([
      { kind: 'palm', weight: 0.4 },
      { kind: 'banana', weight: 0.3 },
      { kind: 'oak', weight: 0.3 },
    ]);
    expect(def.terrain.structures).toEqual([
      { kind: 'qilou', cellDensity: 0.18 },
      { kind: 'canton_tower', cellDensity: 0.02 },
    ]);
    expect(def.atmosphere.fogScale).toBe(1);
    expect(def.atmosphere.waterTint).toBe('#4a8a7a'); // 珠江水色
    expect(def.animals.map((a) => a.key)).toEqual(['pig', 'cow', 'sheep']);
    expect(def.animals.map((a) => a.weight)).toEqual([0.9, 0.6, 0.4]);
    expect(def.animalGround).toEqual(['GRASS']);
    expect(def.blurb).toContain('广州塔');
    expect(def.blurb).toContain('骑楼');
    expect(def.blurb).toContain('早茶');
  });
});

describe('广西 guangxi（W5 定制）', () => {
  it('参数断言：喀斯特峰林陡峭 + 亚热带 + 芭蕉樟棕树种 + 干栏/风雨桥结构表', () => {
    const def = REGIONS.guangxi!;
    expect(def.terrain.baseOffset).toBe(1);
    expect(def.terrain.contAmp).toBe(4);
    expect(def.terrain.hillsAmp).toBe(4);
    expect(def.terrain.ridgeAmp).toBe(18); // 峰林陡峭：全波最高
    expect(def.terrain.tempBias).toBe(0.2);
    expect(def.terrain.snowBias).toBe(0);
    expect(def.terrain.trees.chance).toBe(0.012);
    expect(def.terrain.trees.kinds).toEqual([
      { kind: 'banana', weight: 0.4 },
      { kind: 'oak', weight: 0.35 },
      { kind: 'palm', weight: 0.25 },
    ]);
    expect(def.terrain.structures).toEqual([
      { kind: 'ganlan_house', cellDensity: 0.18 }, // 0.18：硬闸锚点可行性（见 parts/mid2.ts 注）
      { kind: 'wind_rain_bridge', cellDensity: 0.02 },
    ]);
    expect(def.atmosphere.fogScale).toBe(0.85); // 漓江烟雨
    expect(def.atmosphere.waterTint).toBe('#3a9a8a'); // 漓江青
    expect(def.animals.map((a) => a.key)).toEqual(['pig', 'cow', 'sheep']);
    expect(def.animals.map((a) => a.weight)).toEqual([0.8, 0.6, 0.4]);
    expect(def.animalGround).toEqual(['GRASS']);
    expect(def.blurb).toContain('桂林山水');
    expect(def.blurb).toContain('程阳风雨桥');
    expect(def.blurb).toContain('干栏');
  });
});

describe('海南 hainan（W5 定制）', () => {
  it('参数断言：热带海岛（tempBias 三区最大）+ 沙岸偏置 + 椰林最密 + 高脚屋/骑楼结构表', () => {
    const def = REGIONS.hainan!;
    expect(def.terrain.baseOffset).toBe(1);
    expect(def.terrain.contAmp).toBe(3);
    expect(def.terrain.hillsAmp).toBe(2);
    expect(def.terrain.ridgeAmp).toBe(6);
    expect(def.terrain.tempBias).toBe(0.35); // 全图最热
    expect(def.terrain.desertBias).toBe(-0.1); // 沙岸
    expect(def.terrain.snowBias).toBe(0);
    expect(def.terrain.trees.chance).toBe(0.014); // 椰林最密
    expect(def.terrain.trees.kinds).toEqual([
      { kind: 'palm', weight: 0.6 },
      { kind: 'banana', weight: 0.4 },
    ]);
    expect(def.terrain.structures).toEqual([
      { kind: 'diaojiaolou', cellDensity: 0.15 }, // 复用湘西吊脚楼作高脚屋
      { kind: 'qilou', cellDensity: 0.02 }, // 复用骑楼作海口骑楼老街
    ]);
    expect(def.atmosphere.fogScale).toBe(1.1); // 海风通透
    expect(def.atmosphere.waterTint).toBe('#2a9aa8'); // 南海碧蓝
    expect(def.animals.map((a) => a.key)).toEqual(['pig', 'cow', 'peacock', 'sheep']);
    expect(def.animals.map((a) => a.weight)).toEqual([0.7, 0.6, 0.5, 0.2]);
    expect(def.animalGround).toEqual(['GRASS', 'SAND']);
    expect(def.blurb).toContain('椰风海韵');
    expect(def.blurb).toContain('骑楼老街');
    expect(def.blurb).toContain('天涯海角');
  });

  it('波内约定：三区结构表均「常见 + 稀有」双条目且密度递减', () => {
    for (const id of ['guangdong', 'guangxi', 'hainan'] as const) {
      const st = REGIONS[id]!.terrain.structures;
      expect(st).toHaveLength(2);
      expect(st[0]!.cellDensity).toBeGreaterThan(st[1]!.cellDensity);
    }
  });

  it('跨区对比：广西起伏 > 广东；海南 tempBias 三区最大', () => {
    const gd = REGIONS.guangdong!;
    const gx = REGIONS.guangxi!;
    const hn = REGIONS.hainan!;
    expect(gx.terrain.ridgeAmp).toBeGreaterThan(gd.terrain.ridgeAmp);
    expect(hn.terrain.tempBias).toBeGreaterThan(gd.terrain.tempBias);
    expect(hn.terrain.tempBias).toBeGreaterThan(gx.terrain.tempBias);
  });
});

// ---------------------------------------------------------------------------
// 地形对比：桂西峰林 vs 珠三角平原
// ---------------------------------------------------------------------------

describe('粤桂地形对比', () => {
  it('广西：喀斯特峰林起伏显著大于广东珠三角', () => {
    const gd = terrainRange('guangdong');
    const gx = terrainRange('guangxi');
    expect(gx.range).toBeGreaterThan(gd.range); // 起伏 > 广东
    expect(gx.range).toBeGreaterThanOrEqual(12);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 四 kind 锚点特征方块（与 structures.test 自动派生用例同窗口）
// ---------------------------------------------------------------------------

const FEATURE_CASES: Array<{
  region: 'guangdong' | 'guangxi' | 'hainan';
  kind: StructureKind;
  density: number;
  block: number;
}> = [
  { region: 'guangdong', kind: 'qilou', density: 0.18, block: BLOCK.RED_BRICK },
  { region: 'guangdong', kind: 'canton_tower', density: 0.02, block: BLOCK.CONCRETE },
  { region: 'guangxi', kind: 'ganlan_house', density: 0.15, block: BLOCK.DARK_WOOD },
  { region: 'guangxi', kind: 'wind_rain_bridge', density: 0.02, block: BLOCK.DARK_WOOD },
  { region: 'hainan', kind: 'qilou', density: 0.02, block: BLOCK.RED_BRICK },
];

describe('中南2结构特征方块', () => {
  for (const { region, kind, density, block } of FEATURE_CASES) {
    const seed = makeSeedForRegion(region, 'w5-feature');
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
// canton_tower 广州塔专测：总高 / 腰身收分 / 格构材料 / 重复生成一致
// ---------------------------------------------------------------------------

describe('广州塔 canton_tower', () => {
  const seed = makeSeedForRegion('guangdong', 'w5-feature');
  const anchor = findKindAnchor(seed, 'canton_tower', 0.02);
  const fy = anchor ? surfaceHeight(anchor.x, anchor.z) + 1 : 0;

  it('锚点存在且场地足够低（topClamp 不削顶，总高断言前提成立）', () => {
    expect(anchor).not.toBeNull();
    expect(fy).toBeLessThanOrEqual(34); // fy+28 ≤ 62：天线杆不触顶钳制
  }, 30_000);

  it('总高 ≥ 26（中心列顶部天线的最高实心块距地 ≥ 26）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    let topY = fy - 1;
    for (let y = 62; y >= fy; y--) {
      if (get(anchor!.x, y, anchor!.z) !== BLOCK.AIR) {
        topY = y;
        break;
      }
    }
    expect(topY - fy).toBeGreaterThanOrEqual(26);
  }, 30_000);

  it('腰身收分：fy+15 层实心圆半径 < fy+3 层半径（小蛮腰）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    /** 该高度层内非空气的最大半径²（锚点 ±5 窗口） */
    const radius2At = (y: number): number => {
      let best = 0;
      for (let dx = -5; dx <= 5; dx++) {
        for (let dz = -5; dz <= 5; dz++) {
          if (get(anchor!.x + dx, y, anchor!.z + dz) !== BLOCK.AIR) {
            best = Math.max(best, dx * dx + dz * dz);
          }
        }
      }
      return best;
    };
    const base = radius2At(fy + 3); // 底部塔座段（r3）
    const waist = radius2At(fy + 15); // 细腰段（r1）
    expect(base).toBeGreaterThanOrEqual(9); // 底座半径 ≥ 3
    expect(waist).toBeLessThan(base); // 收腰
  }, 30_000);

  it('格构塔身：GLASS_CURTAIN + CONCRETE 计数 > 60', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const glass = countBlockAround({ get }, anchor!, 5, fy, fy + 30, BLOCK.GLASS_CURTAIN);
    const concrete = countBlockAround({ get }, anchor!, 5, fy, fy + 30, BLOCK.CONCRETE);
    expect(glass).toBeGreaterThan(10);
    expect(concrete).toBeGreaterThan(10);
    expect(glass + concrete).toBeGreaterThan(60);
  }, 30_000);

  it('重复生成一致（同 seed 两次统计逐项相等）', () => {
    expect(anchor).not.toBeNull();
    const count = (id: number): number => countBlockAround(makeReader(seed), anchor!, 5, fy, fy + 30, id);
    const a1 = count(BLOCK.GLASS_CURTAIN);
    const a2 = count(BLOCK.CONCRETE);
    const b1 = count(BLOCK.GLASS_CURTAIN);
    const b2 = count(BLOCK.CONCRETE);
    expect(b1).toBe(a1);
    expect(b2).toBe(a2);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// qilou 骑楼街专测：底层柱廊透空 / 楼板悬挑 / 山花女儿墙
// ---------------------------------------------------------------------------

describe('骑楼街 qilou', () => {
  const seed = makeSeedForRegion('guangdong', 'w5-feature');
  const anchor = findKindAnchor(seed, 'qilou', 0.18);
  const fy = anchor ? surfaceHeight(anchor.x, anchor.z) + 1 : 0;
  const COLS = [-5, -2, 1, 4]; // 4 根骑楼柱（相对锚点 x 偏移）
  const z1 = anchor ? anchor.z + 2 : 0; // 前沿柱廊排
  const z0 = anchor ? anchor.z - 2 : 0; // 背排

  it('锚点存在', () => {
    expect(anchor).not.toBeNull();
  }, 30_000);

  it('底层柱廊透空：柱位 RED_BRICK、柱间 fy 层为 AIR（沿街人行道贯通）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    for (const dx of COLS) {
      expect(get(anchor!.x + dx, fy, z1)).toBe(BLOCK.RED_BRICK); // 骑楼柱
    }
    for (let dx = -5; dx <= 4; dx++) {
      if (COLS.includes(dx)) continue;
      expect(get(anchor!.x + dx, fy, z1)).toBe(BLOCK.AIR); // 柱间净空
      expect(get(anchor!.x + dx, fy + 1, z1)).toBe(BLOCK.AIR);
    }
  }, 30_000);

  it('二层楼板悬挑压在柱廊上（骑楼的「楼」）+ 粉彩墙 + 山花女儿墙高出屋面', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    expect(get(anchor!.x, fy + 3, z1)).toBe(BLOCK.RED_BRICK); // 楼板悬挑
    expect(get(anchor!.x - 2, fy + 4, z1)).toBe(BLOCK.RED_BRICK); // 与底层对位的壁柱带
    expect(get(anchor!.x, fy + 4, z0)).toBe(BLOCK.PASTEL_WALL); // 二层粉彩墙（背排）
    // 山花女儿墙：柱廊排 fy+7（压檐）以上至少一段 PASTEL_WALL/RED_BRICK 高出屋面
    let parapet = 0;
    for (let dx = -5; dx <= 4; dx++) {
      const b = get(anchor!.x + dx, fy + 8, z1);
      if (b === BLOCK.PASTEL_WALL || b === BLOCK.RED_BRICK) parapet++;
    }
    expect(parapet).toBeGreaterThan(0);
  }, 30_000);

  it('重复生成一致（同 seed 两次统计逐项相等）', () => {
    expect(anchor).not.toBeNull();
    const count = (id: number): number =>
      countBlockAround(makeReader(seed), anchor!, 6, fy - 1, fy + 10, id);
    const a1 = count(BLOCK.RED_BRICK);
    const a2 = count(BLOCK.PASTEL_WALL);
    const a3 = count(BLOCK.DARK_TILE);
    const b1 = count(BLOCK.RED_BRICK);
    const b2 = count(BLOCK.PASTEL_WALL);
    const b3 = count(BLOCK.DARK_TILE);
    expect(b1).toBe(a1);
    expect(b2).toBe(a2);
    expect(b3).toBe(a3);
    expect(a1).toBeGreaterThan(40); // 柱/店面砖墙/楼板/壁柱
  }, 30_000);
});

// ---------------------------------------------------------------------------
// wind_rain_bridge 程阳风雨桥专测：桥面贯通 / 三亭顶珠 / 石墩
// ---------------------------------------------------------------------------

describe('程阳风雨桥 wind_rain_bridge', () => {
  const seed = makeSeedForRegion('guangxi', 'w5-feature');
  const anchor = findKindAnchor(seed, 'wind_rain_bridge', 0.02);
  const fy = anchor ? surfaceHeight(anchor.x, anchor.z) + 1 : 0;

  it('锚点存在且场地足够低（topClamp 不削顶）', () => {
    expect(anchor).not.toBeNull();
    expect(fy).toBeLessThanOrEqual(46); // fy+16 ≤ 62：亭顶不触顶钳制
  }, 30_000);

  it('桥面贯通：ax±7 两端之间沿桥面（fy+3）连续实心', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    for (let dx = -7; dx <= 7; dx++) {
      expect(get(anchor!.x + dx, fy + 3, anchor!.z)).not.toBe(BLOCK.AIR);
    }
  }, 30_000);

  it('三亭标定：YELLOW_TILE 顶珠计数 ≥ 3；桥体 DARK_WOOD 为主', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const yellow = countBlockAround({ get }, anchor!, 8, fy, fy + 18, BLOCK.YELLOW_TILE);
    const wood = countBlockAround({ get }, anchor!, 8, fy, fy + 8, BLOCK.DARK_WOOD);
    expect(yellow).toBeGreaterThanOrEqual(3); // 两端亭 + 桥中亭
    expect(wood).toBeGreaterThan(80); // 桥面板 + 平台 + 廊柱 + 亭身
  }, 30_000);

  it('石墩落地：中心墩在 (ax, fy, az) 为 STONE', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    expect(get(anchor!.x, fy, anchor!.z)).toBe(BLOCK.STONE);
    expect(get(anchor!.x - 5, fy, anchor!.z)).toBe(BLOCK.STONE);
    expect(get(anchor!.x + 5, fy, anchor!.z)).toBe(BLOCK.STONE);
  }, 30_000);

  it('重复生成一致（同 seed 两次统计逐项相等）', () => {
    expect(anchor).not.toBeNull();
    const count = (id: number): number => countBlockAround(makeReader(seed), anchor!, 8, fy - 2, fy + 16, id);
    const a1 = count(BLOCK.DARK_WOOD);
    const a2 = count(BLOCK.DARK_TILE);
    const a3 = count(BLOCK.YELLOW_TILE);
    const b1 = count(BLOCK.DARK_WOOD);
    const b2 = count(BLOCK.DARK_TILE);
    const b3 = count(BLOCK.YELLOW_TILE);
    expect(b1).toBe(a1);
    expect(b2).toBe(a2);
    expect(b3).toBe(a3);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// ganlan_house 干栏式木楼专测：全架空 / 茅草顶 / 架空柱
// ---------------------------------------------------------------------------

describe('干栏式木楼 ganlan_house', () => {
  const seed = makeSeedForRegion('guangxi', 'w5-feature');
  const anchor = findKindAnchor(seed, 'ganlan_house', 0.15);
  const fy = anchor ? surfaceHeight(anchor.x, anchor.z) + 1 : 0;

  it('锚点存在', () => {
    expect(anchor).not.toBeNull();
  }, 30_000);

  it('全架空：中心列楼板下 2 格 AIR + 楼板 PLANKS + 架空柱 DARK_WOOD 落地', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    expect(get(anchor!.x, fy + 2, anchor!.z)).toBe(BLOCK.AIR); // 楼板下透空
    expect(get(anchor!.x, fy + 3, anchor!.z)).toBe(BLOCK.AIR);
    expect(get(anchor!.x, fy + 4, anchor!.z)).toBe(BLOCK.PLANKS); // 楼板
    expect(get(anchor!.x, fy, anchor!.z + 2)).toBe(BLOCK.DARK_WOOD); // 架空柱
    expect(get(anchor!.x, fy + 1, anchor!.z + 2)).toBe(BLOCK.DARK_WOOD);
  }, 30_000);

  it('茅草歇山顶：THATCH 计数 > 20（大双坡通长）', () => {
    expect(anchor).not.toBeNull();
    const { get } = makeReader(seed);
    const thatch = countBlockAround({ get }, anchor!, 5, fy, fy + 14, BLOCK.THATCH);
    expect(thatch).toBeGreaterThan(20);
  }, 30_000);

  it('重复生成一致（同 seed 两次统计逐项相等）', () => {
    expect(anchor).not.toBeNull();
    const count = (id: number): number => countBlockAround(makeReader(seed), anchor!, 5, fy - 1, fy + 12, id);
    const a1 = count(BLOCK.THATCH);
    const a2 = count(BLOCK.DARK_WOOD);
    const a3 = count(BLOCK.PLANKS);
    const b1 = count(BLOCK.THATCH);
    const b2 = count(BLOCK.DARK_WOOD);
    const b3 = count(BLOCK.PLANKS);
    expect(b1).toBe(a1);
    expect(b2).toBe(a2);
    expect(b3).toBe(a3);
  }, 30_000);
});
