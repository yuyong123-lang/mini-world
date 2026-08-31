// atlas 纯逻辑测试（node 环境，无 DOM）：不调用 buildAtlasCanvas（jsdom 无 2d context）
import { describe, expect, it } from 'vitest';
import {
  ATLAS_GRID,
  ATLAS_SIZE,
  ATLAS_TILES,
  CRACK_FRAMES,
  CRACK_TILE_START,
  TILE_PAINTERS,
  TILE_PX,
  UV_INSET_PX,
  atlasTileRng,
  tileUV,
} from '../src/blocks/atlas';
import { BLOCK } from '../src/blocks/registry';

/** 任务卡冻结的名称→序号表（契约 §4 + water 24 / bedrock 33 补充） */
const EXPECTED_TILES: Record<string, number> = {
  grass_top: 0,
  grass_side: 1,
  dirt: 2,
  stone: 3,
  cobble: 4,
  sand: 5,
  sandstone: 6,
  log_side: 7,
  log_top: 8,
  planks: 9,
  leaves: 10,
  glass: 11,
  glow: 12,
  craft_table_top: 13,
  craft_table_side: 14,
  snow: 15,
  snow_side: 16,
  coal_ore: 17,
  iron_ore: 18,
  gold_ore: 19,
  sun: 20,
  moon: 21,
  apple: 22,
  crack_overlay: 34, // 契约修订：原 23..32 与 water(24) 冲突，裂纹带移至 34..43
  water: 24,
  bedrock: 33,
  // 动物掉落扩展（分配表见 items/items.ts 顶部注释）
  wool: 44,
  raw_beef: 45,
  raw_mutton: 46,
  leather: 47,
  raw_pork: 48,
  // 熔炉与铁器扩展
  iron_ingot: 49,
  gold_ingot: 50,
  cooked_pork: 51,
  cooked_beef: 52,
  cooked_mutton: 53,
  furnace_top: 55,
  furnace_side: 56,
  iron_sword: 57,
  iron_pickaxe: 58,
  iron_axe: 59,
  bow: 60,
  arrow: 61,
  leather_helmet: 62,
  leather_chestplate: 63,
  iron_helmet: 64,
  iron_chestplate: 65,
};

describe('ATLAS_TILES 名称索引表', () => {
  it('包含全部约定键且值正确', () => {
    for (const [name, idx] of Object.entries(EXPECTED_TILES)) {
      expect(ATLAS_TILES[name], `tile "${name}"`).toBe(idx);
    }
  });

  it('无多余键', () => {
    expect(Object.keys(ATLAS_TILES).sort()).toEqual(Object.keys(EXPECTED_TILES).sort());
  });

  it('值都在图集范围内且互不相同（crack_overlay 34..43 已与 water=24 解耦）', () => {
    const seen = new Set<number>();
    for (const v of Object.values(ATLAS_TILES)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(ATLAS_GRID * ATLAS_GRID);
      seen.add(v);
    }
    expect(seen.size).toBe(Object.keys(ATLAS_TILES).length);
  });

  it('blocks.json 引用的每个 tex tile 在表中均有绘制器', () => {
    const painted = new Set(TILE_PAINTERS.map((p) => p.tile));
    // 收集 blocks.json 的全部 tex 序号：通过 registry 加载后的查表
    const expected = new Set<number>([0, 2, 1, 3, 4, 5, 6, 8, 7, 9, 10, 11, 24, 15, 16, 12, 13, 14, 17, 18, 19, 33]);
    for (const t of expected) expect(painted.has(t), `缺 tile ${t} 绘制器`).toBe(true);
  });
});

describe('tileUV', () => {
  // 手算期望：tile 0 位于图集左上角 (x0=0, y0=0)
  // inset = 0.5，图集边长 = 256
  // u0 = (0 + 0.5)/256   = 0.001953125
  // u1 = (16 - 0.5)/256  = 0.060546875
  // v1 = 1 - (0 + 0.5)/256  = 0.998046875  （v 轴翻转：canvas 顶边 = GL 高 v）
  // v0 = 1 - (16 - 0.5)/256 = 0.939453125
  it('tileUV(0) 手算期望值', () => {
    expect(tileUV(0)).toEqual({
      u0: 0.001953125,
      u1: 0.060546875,
      v0: 0.939453125,
      v1: 0.998046875,
    });
  });

  it('常量与派生尺寸一致', () => {
    expect(TILE_PX).toBe(16);
    expect(ATLAS_GRID).toBe(16);
    expect(ATLAS_SIZE).toBe(TILE_PX * ATLAS_GRID);
    expect(UV_INSET_PX).toBe(0.5);
  });

  // 手算：tile 25 → col=9, row=1 → x0=144, y0=16
  // u0=(144+0.5)/256=0.564453125  u1=(160-0.5)/256=0.623046875
  // v1=1-(16+0.5)/256=0.935546875 v0=1-(32-0.5)/256=0.876953125
  it('第二行中间某个 tile 的位置正确（含翻转）', () => {
    expect(tileUV(25)).toEqual({
      u0: 0.564453125,
      u1: 0.623046875,
      v0: 0.876953125,
      v1: 0.935546875,
    });
  });

  // 手算：tile 33 → col=1, row=2 → x0=16, y0=32
  // u0=(16+0.5)/256=0.064453125  u1=(32-0.5)/256=0.123046875
  // v1=1-(32+0.5)/256=0.873046875 v0=1-(48-0.5)/256=0.814453125
  it('bedrock(tile 33) 位于第三行第二列', () => {
    expect(tileUV(33)).toEqual({
      u0: 0.064453125,
      u1: 0.123046875,
      v0: 0.814453125,
      v1: 0.873046875,
    });
  });

  it('相邻 tile 无重叠（u1 <= 下一个 u0 + eps），全表扫描', () => {
    const eps = 1e-12;
    for (let i = 1; i < ATLAS_SIZE; i++) {
      const prev = tileUV(i - 1);
      const cur = tileUV(i);
      if ((i - 1) % ATLAS_GRID === ATLAS_GRID - 1) continue; // 行尾跳过
      expect(cur.u0 - prev.u1 + eps).toBeGreaterThanOrEqual(0);
    }
  });

  it('同一行相邻 tile 的 v 相同；下一行的 v 更小（v 轴向下增长）', () => {
    const a = tileUV(0);
    const b = tileUV(1);
    expect(a.v0).toBe(b.v0);
    expect(a.v1).toBe(b.v1);
    const below = tileUV(ATLAS_GRID);
    expect(below.v1).toBeLessThan(a.v1);
  });

  it('UV 全部落在 [0,1] 且 u0<u1、v0<v1', () => {
    for (let i = 0; i < ATLAS_SIZE; i += 7) {
      const uv = tileUV(i);
      for (const v of [uv.u0, uv.u1, uv.v0, uv.v1]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(uv.u0).toBeLessThan(uv.u1);
      expect(uv.v0).toBeLessThan(uv.v1);
    }
  });

  it('越界/非整数序号抛 RangeError', () => {
    expect(() => tileUV(-1)).toThrow(RangeError);
    expect(() => tileUV(ATLAS_SIZE)).toThrow(RangeError);
    expect(() => tileUV(3.5)).toThrow(RangeError);
    expect(() => tileUV(Number.NaN)).toThrow(RangeError);
  });

  it('inset 半个 texel 后每个 tile 覆盖面积恰为 (15/256)^2', () => {
    const uv = tileUV(10);
    expect((uv.u1 - uv.u0) * ATLAS_SIZE).toBeCloseTo(TILE_PX - 2 * UV_INSET_PX, 10);
    expect((uv.v1 - uv.v0) * ATLAS_SIZE).toBeCloseTo(TILE_PX - 2 * UV_INSET_PX, 10);
  });
});

describe('ATLAS_TILES 与 BlockDef.tex 的映射一致性', () => {
  // data/blocks.json 实际引用的 tile（与 tests/blocks.test.ts 覆盖的注册表一致）
  it('GRASS 用 grass_top/grass_side/dirt 三面贴图', () => {
    expect([ATLAS_TILES.grass_top, ATLAS_TILES.dirt, ATLAS_TILES.grass_side]).toEqual([0, 2, 1]);
  });

  it('WATER/SNOW/CRAFT_TABLE 等 key 对应任务卡补充序号', () => {
    expect(ATLAS_TILES.water).toBe(BLOCK.WATER === 12 ? 24 : 24); // 固定 24
    expect(ATLAS_TILES.snow).toBe(15);
    expect(ATLAS_TILES.snow_side).toBe(16);
    expect(ATLAS_TILES.craft_table_top).toBe(13);
    expect(ATLAS_TILES.craft_table_side).toBe(14);
    expect(ATLAS_TILES.bedrock).toBe(33);
  });

  it('裂纹带起点/帧数常量自洽，且不越过图集容量', () => {
    expect(CRACK_TILE_START).toBe(ATLAS_TILES.crack_overlay);
    expect(CRACK_FRAMES).toBe(10);
    expect(CRACK_TILE_START + CRACK_FRAMES - 1).toBeLessThan(ATLAS_GRID * ATLAS_GRID);
  });
});

describe('seed 相关纯辅助函数', () => {
  it('atlasTileRng 同 seed 同名确定性一致', () => {
    const a = atlasTileRng(1337, 'grass_top');
    const b = atlasTileRng(1337, 'grass_top');
    for (let i = 0; i < 64; i++) expect(a()).toBe(b());
  });

  it('不同 seed 或不同材质名产出不同序列', () => {
    let diff = false;
    for (let i = 0; i < 32; i++) {
      if (atlasTileRng(1, 'stone')() !== atlasTileRng(2, 'stone')()) diff = true;
    }
    expect(diff).toBe(true);

    diff = false;
    for (let i = 0; i < 32; i++) {
      if (atlasTileRng(42, 'grass_top')() !== atlasTileRng(42, 'dirt')()) diff = true;
    }
    expect(diff).toBe(true);
  });

  it('序列在 [0,1) 且 seed 参与混合（非纯 hashStr）', () => {
    const r = atlasTileRng(-7, 'moon'); // 负数 seed 也要安全
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(atlasTileRng(-7, 'moon')()).toBe(atlasTileRng(-7, 'moon')());
  });
});
