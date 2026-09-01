import { beforeEach, describe, expect, it } from 'vitest';
import { CraftingMatcher, type Recipe } from '../src/items/crafting';
import recipesData from '../src/data/recipes.json';
import { ITEMS, type ItemStack } from '../src/items/items';

const P = ITEMS.BLOCK_PLANKS;
const L = ITEMS.BLOCK_LOG;
const ST = ITEMS.STICK;
const C = ITEMS.BLOCK_COBBLE;

type Grid = (ItemStack | null)[];

/** 便捷构造 2×2 / 3×3 摆盘：items 按行优先填入，null 表示空位，长度不足补空 */
function grid(items: (string | null)[], size: 2 | 3): Grid {
  const out: Grid = new Array(size * size).fill(null);
  for (let i = 0; i < Math.min(items.length, size * size); i++) {
    if (items[i]) out[i] = { key: items[i]!, count: 1 };
  }
  return out;
}

describe('CraftingMatcher（契约 §6）', () => {
  beforeEach(() => {
    CraftingMatcher.load(recipesData as unknown as Recipe[]);
  });

  it('加载内置配方共 28 条', () => {
    const keys = (recipesData as unknown as Recipe[]).map((r) => r.out.key);
    expect(keys).toHaveLength(28);
    expect(keys.filter((k) => k === P)).toHaveLength(1);
    expect(keys.filter((k) => k.startsWith('ITEM_STONE_'))).toHaveLength(2);
  });

  it('原木→木板：shapeless 乱序仍可匹配', () => {
    // 原木摆在任意位置都能匹配
    expect(CraftingMatcher.match(grid([null, null, null, L], 2), 2)?.out.key).toBe(P);
    expect(CraftingMatcher.match(grid([L], 3), 3)?.out.key).toBe(P);
  });

  it('木板×4 → 工作台：shaped 平移后仍可匹配', () => {
    const out = CraftingMatcher.match(grid([P, P, P, P], 2), 2);
    expect(out?.out).toEqual({ key: ITEMS.BLOCK_CRAFT_TABLE, count: 1 });

    // 3×3 里摆在右下角 2×2 区块（索引 4,5,7,8）（平移）
    const shifted = grid([null, null, null, null, P, P, null, P, P], 3);
    expect(CraftingMatcher.match(shifted, 3)?.out.key).toBe(ITEMS.BLOCK_CRAFT_TABLE);
  });

  it('木棍：竖排两格木板可合成且可在盘内任意平移，横排不可', () => {
    const vertical = grid([P, null, null, P, null, null, null, null, null], 3);
    expect(CraftingMatcher.match(vertical, 3)?.out).toEqual({ key: ST, count: 4 });

    // 平移到右下角（配方已裁剪为 1 宽，仍匹配）
    const corner = grid([null, null, null, null, null, P, null, null, P], 3);
    expect(CraftingMatcher.match(corner, 3)?.out.key).toBe(ST);

    // 横排不匹配
    expect(CraftingMatcher.match(grid([P, P], 2), 2)).toBeNull();
  });

  it('size 门禁：3×3 配方在 2×2 摆盘里返回 null', () => {
    const tiny = grid([P, P, P, ST], 2);
    expect(CraftingMatcher.match(tiny, 2)).toBeNull();

    // 反之 2×2 配方在 3×3 里可以匹配（门禁只拦小的）
    const big = grid([P, P, null, P, P, null, null, null, null], 3);
    expect(CraftingMatcher.match(big, 3)?.out.key).toBe(ITEMS.BLOCK_CRAFT_TABLE);
  });

  it('木镐标准形匹配，旋转 90° 不匹配', () => {
    const normal = grid([P, P, P, null, ST, null, null, ST, null], 3);
    expect(CraftingMatcher.match(normal, 3)?.out.key).toBe(ITEMS.WOOD_PICKAXE);

    // 旋转后：板竖排在左、棍横排在中——应无配方命中
    const rotated = grid([ST, P, null, ST, P, null, null, P, null], 3);
    expect(CraftingMatcher.match(rotated, 3)).toBeNull();
  });

  it('木剑竖列可合成；横排/上下颠倒不可（不镜像竖直）', () => {
    // 正确：竖列 板/板/棍（索引 0,3,6）
    expect(CraftingMatcher.match(grid([P, null, null, P, null, null, ST, null, null], 3), 3)
      ?.out.key).toBe(ITEMS.WOOD_SWORD);

    // 上下颠倒：棍在上、板在下——shaped 不允许垂直翻转
    expect(CraftingMatcher.match(grid([ST, null, null, P, null, null, P, null, null], 3), 3))
      .toBeNull();

    // 横排 板棍相邻不成任何配方
    expect(CraftingMatcher.match(grid([P, P, ST], 3), 3)).toBeNull();
  });

  it('allowMirror 的斧头左右两种摆法都能合成', () => {
    // 配方 ["PP","PS",".S"]：刃在左上，柄在右下竖列
    const leftBlade = grid([P, P, null,
                            P, ST, null,
                            null, ST, null], 3);
    expect(CraftingMatcher.match(leftBlade, 3)?.out.key).toBe(ITEMS.WOOD_AXE);

    // 水平镜像 ["PP","SP","S."]：刃在右上，柄在左下竖列
    const rightBlade = grid([P, P, null,
                             ST, P, null,
                             ST, null, null], 3);
    expect(CraftingMatcher.match(rightBlade, 3)?.out.key).toBe(ITEMS.WOOD_AXE);
  });

  it('石制工具走 COBBLE 路径', () => {
    const spick = grid([C, C, C, null, ST, null, null, ST, null], 3);
    expect(CraftingMatcher.match(spick, 3)?.out.key).toBe(ITEMS.STONE_PICKAXE);

    const ssword = grid([C, null, null, C, null, null, ST, null, null], 3);
    expect(CraftingMatcher.match(ssword, 3)?.out).toEqual({ key: ITEMS.STONE_SWORD, count: 1 });
  });

  it('consume 按 matched 形状扣减，归零置 null 且不改原摆盘', () => {
    const g = grid([P, P, P, null, ST, null, null, ST, null], 3);
    g[0]!.count = 3;   // 材料 >1 验证只扣 1
    g[7]!.count = 5;

    const recipe = CraftingMatcher.match(g, 3)!;
    expect(recipe.out.key).toBe(ITEMS.WOOD_PICKAXE);

    const after = CraftingMatcher.consume(g, recipe);
    expect(after[0]).toEqual({ key: P, count: 2 });
    expect(after[1]).toBeNull();
    expect(after[2]).toBeNull();
    expect(after[4]).toBeNull();
    expect(after[6]).toBeNull();
    expect(after[7]).toEqual({ key: ST, count: 4 });
    // 原摆盘对象未被改动
    expect(g[0]).toEqual({ key: P, count: 3 });
    expect(g[7]).toEqual({ key: ST, count: 5 });
  });

  it('shapeless consume：按位置扣减原木；数量不符返回 null', () => {
    const g = grid([null, null, null, null, null, L, null, null, null], 3); // 原木在正中偏下
    const recipe = CraftingMatcher.match(g, 3)!;
    expect(recipe.out).toEqual({ key: P, count: 4 });

    const after = CraftingMatcher.consume(g, recipe);
    expect(after.every((c) => c === null)).toBe(true);
    expect(g[5]).toEqual({ key: L, count: 1 });           // 原摆盘未被动过

    // 两根原木：shapeless 多重集数量不符，无法合成
    const g2 = grid([L, L], 2);
    expect(CraftingMatcher.match(g2, 2)).toBeNull();
  });

  it("'.': 必空格被占用则不可合成；consume 返回新数组且不共享栈引用", () => {
    // 石镐图案的右中空位（索引5）塞了苹果 → 归一化尺寸变化，无法合成
    expect(CraftingMatcher.match(
      grid([C, C, C, null, ST, ITEMS.APPLE, null, ST, null], 3), 3,
    )).toBeNull();

    // 正常消耗后返回全新数组与全新堆叠对象
    const g = grid([C, C, C, null, ST, null, null, ST, null], 3);
    g[4]!.count = 2;
    const r = CraftingMatcher.match(g, 3)!;
    const after = CraftingMatcher.consume(g, r);
    expect(after).not.toBe(g);
    expect(after[4]).toEqual({ key: ST, count: 1 });
    expect(after[4]).not.toBe(g[4]);
    expect(g[4]).toEqual({ key: ST, count: 2 });
  });

  it('材料不符/不足时 match 返回 null', () => {
    // 木镐缺一格木板
    expect(CraftingMatcher.match(
      grid([P, P, null, null, ST, null, null, ST, null], 3), 3,
    )).toBeNull();

    // '.' 必空格被占住
    expect(CraftingMatcher.match(
      grid([P, P, ST, null, ST, null, null, ST, null], 3), 3,
    )).toBeNull();

    // shapeless 多一个干扰物品
    expect(CraftingMatcher.match(grid([L, P], 2), 2)).toBeNull();

    // 空摆盘
    expect(CraftingMatcher.match(grid([], 3), 3)).toBeNull();
  });

  it('gridSize 与 grid 长度不符时返回 null', () => {
    expect(CraftingMatcher.match(grid([P, P, P, P], 2), 3)).toBeNull();
    expect(CraftingMatcher.match(grid([P, P, P, P, P, P, P, P, P], 3), 2)).toBeNull();
  });
});
