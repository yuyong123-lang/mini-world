// tests/furnace.test.ts —— 熔炉系统单测：燃料热值 / tickFurnace 全规则 / 容器
import { describe, expect, it } from 'vitest';
import {
  SMELT_SECONDS,
  emptyFurnaceState,
  fuelSeconds,
  smeltResult,
  tickFurnace,
  FurnaceSystem,
  type FurnaceState,
} from '../src/furnace/furnace';
import { ITEMS } from '../src/items/items';

function mk(partial: Partial<FurnaceState>): FurnaceState {
  return { ...emptyFurnaceState(), ...partial };
}

describe('fuelSeconds / smeltResult 纯表查询', () => {
  it('燃料热值：煤 80 / 木板·原木 15 / 木棍 5 / 未知 0', () => {
    expect(fuelSeconds(ITEMS.COAL)).toBe(80);
    expect(fuelSeconds(ITEMS.BLOCK_PLANKS)).toBe(15);
    expect(fuelSeconds(ITEMS.BLOCK_LOG)).toBe(15);
    expect(fuelSeconds(ITEMS.STICK)).toBe(5);
    expect(fuelSeconds('ITEM_NOT_A_FUEL')).toBe(0);
    expect(fuelSeconds(ITEMS.RAW_IRON)).toBe(0); // 矿石不是燃料
  });

  it('烧炼产物：矿石→锭、生肉→熟肉；不可烧为 null', () => {
    expect(smeltResult(ITEMS.RAW_IRON)).toEqual({ key: ITEMS.IRON_INGOT, count: 1 });
    expect(smeltResult(ITEMS.RAW_GOLD)).toEqual({ key: ITEMS.GOLD_INGOT, count: 1 });
    expect(smeltResult(ITEMS.RAW_PORK)).toEqual({ key: ITEMS.COOKED_PORK, count: 1 });
    expect(smeltResult(ITEMS.RAW_BEEF)).toEqual({ key: ITEMS.COOKED_BEEF, count: 1 });
    expect(smeltResult(ITEMS.RAW_MUTTON)).toEqual({ key: ITEMS.COOKED_MUTTON, count: 1 });
    expect(smeltResult(ITEMS.IRON_INGOT)).toBeNull(); // 锭不可再烧
    expect(smeltResult('ITEM_ANYTHING')).toBeNull();
    expect(SMELT_SECONDS).toBe(10);
  });
});

describe('tickFurnace 推进规则', () => {
  it('无燃料+有输入：不点燃、进度冻结', () => {
    const s = mk({ input: { key: ITEMS.RAW_IRON, count: 3 } });
    tickFurnace(s, 5);
    expect(s.burnLeft).toBe(0);
    expect(s.progress).toBe(0);
    expect(s.input).toEqual({ key: ITEMS.RAW_IRON, count: 3 });
  });

  it('有燃料无输入：不预燃（空烧不点新火）', () => {
    const s = mk({ fuel: { key: ITEMS.COAL, count: 2 } });
    tickFurnace(s, 5);
    expect(s.burnLeft).toBe(0);
    expect(s.fuel).toEqual({ key: ITEMS.COAL, count: 2 }); // 燃料未消耗
  });

  it('点燃：燃尽后扣 1 燃料，burnTotal 取燃料热值', () => {
    const s = mk({
      input: { key: ITEMS.RAW_IRON, count: 1 },
      fuel: { key: ITEMS.COAL, count: 2 },
    });
    tickFurnace(s, 0.1);
    expect(s.fuel).toEqual({ key: ITEMS.COAL, count: 1 }); // 扣了 1 个煤
    expect(s.burnTotal).toBe(80);
    expect(s.burnLeft).toBeCloseTo(80 - 0.1, 5);
  });

  it('progress 满 → 输入-1、产出入格、进度清零', () => {
    const s = mk({
      input: { key: ITEMS.RAW_IRON, count: 2 },
      fuel: { key: ITEMS.COAL, count: 1 },
      progress: SMELT_SECONDS - 0.5,
    });
    tickFurnace(s, 0.6);
    expect(s.progress).toBe(0);
    expect(s.input).toEqual({ key: ITEMS.RAW_IRON, count: 1 });
    expect(s.output).toEqual({ key: ITEMS.IRON_INGOT, count: 1 });
  });

  it('最后一个输入烧完置 null；输出异种满载时冻结进度', () => {
    // 异种输出：进度不推进（SMELT 前夜也不产出）
    const s = mk({
      input: { key: ITEMS.RAW_IRON, count: 1 },
      fuel: { key: ITEMS.COAL, count: 1 },
      output: { key: ITEMS.GOLD_INGOT, count: 64 },
      progress: SMELT_SECONDS - 0.1,
    });
    tickFurnace(s, 0.3);
    expect(s.progress).toBe(SMELT_SECONDS - 0.1); // 未推进
    expect(s.input).toEqual({ key: ITEMS.RAW_IRON, count: 1 }); // 未消耗
  });

  it('同种输出可合并累计', () => {
    const s = mk({
      input: { key: ITEMS.RAW_IRON, count: 1 },
      fuel: { key: ITEMS.COAL, count: 1 },
      output: { key: ITEMS.IRON_INGOT, count: 5 },
      progress: SMELT_SECONDS - 0.2,
    });
    tickFurnace(s, 0.3);
    expect(s.output).toEqual({ key: ITEMS.IRON_INGOT, count: 6 });
  });

  it('拔走输入：火焰继续烧（不灭火），burnLeft 递减到 0', () => {
    const s = mk({
      fuel: { key: ITEMS.COAL, count: 1 },
      burnLeft: 79.5,
      burnTotal: 80,
    });
    tickFurnace(s, 0.5);
    expect(s.burnLeft).toBeCloseTo(79, 5);
    expect(s.progress).toBe(0);
  });

  it('换燃料不清进度：燃尽续燃期间进度保持', () => {
    const s = mk({
      input: { key: ITEMS.RAW_IRON, count: 3 },
      fuel: { key: ITEMS.COAL, count: 1 },
      progress: 3.3,
    });
    tickFurnace(s, 0.4);
    expect(s.progress).toBeCloseTo(3.7, 5);
  });

  it('dt<=0 不推进', () => {
    const s = mk({ burnLeft: 10, burnTotal: 80, progress: 1 });
    tickFurnace(s, 0);
    tickFurnace(s, -1);
    expect(s.burnLeft).toBe(10);
    expect(s.progress).toBe(1);
  });
});

describe('FurnaceSystem 容器', () => {
  it('get 幂等建空态；take 取走并移除', () => {
    const sys = new FurnaceSystem();
    const a = sys.get('8,30,8');
    expect(a.input).toBeNull();
    expect(sys.get('8,30,8')).toBe(a); // 同一实例

    a.input = { key: ITEMS.RAW_IRON, count: 1 };
    const taken = sys.take('8,30,8');
    expect(taken?.input).toEqual({ key: ITEMS.RAW_IRON, count: 1 });
    expect(sys.take('8,30,8')).toBeUndefined(); // 已移除
  });

  it('tick 推进全部炉子', () => {
    const sys = new FurnaceSystem();
    const s1 = sys.get('1,1,1');
    s1.input = { key: ITEMS.RAW_IRON, count: 1 };
    s1.fuel = { key: ITEMS.COAL, count: 1 };
    const s2 = sys.get('2,2,2');
    s2.input = { key: ITEMS.RAW_GOLD, count: 1 };
    s2.fuel = { key: ITEMS.COAL, count: 1 };
    sys.tick(0.2);
    expect(s1.burnLeft).toBeGreaterThan(0);
    expect(s2.burnLeft).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 熔炉 UI 纯函数：输出格「只许拿」三态
// ---------------------------------------------------------------------------

import { takeOnlySlotClick } from '../src/ui/furnaceUI';

describe('takeOnlySlotClick（输出格只许拿）', () => {
  it('手空 + 有产物 → 整堆拿起', () => {
    const stack = { key: 'ITEM_IRON_INGOT', count: 3 };
    const res = takeOnlySlotClick(null, stack);
    expect(res.cursor).toEqual({ key: 'ITEM_IRON_INGOT', count: 3 });
    expect(res.placed).toBe(stack);
  });

  it('手上有任何物品 → 拒绝（placed 为 null）', () => {
    const stack = { key: 'ITEM_IRON_INGOT', count: 3 };
    const res = takeOnlySlotClick({ key: 'ITEM_COAL', count: 1 }, stack);
    expect(res.cursor).toEqual({ key: 'ITEM_COAL', count: 1 }); // 手持原样
    expect(res.placed).toBeNull(); // 产物未被拿走
  });

  it('无产物 → no-op', () => {
    const res = takeOnlySlotClick(null, null);
    expect(res.cursor).toBeNull();
    expect(res.placed).toBeNull();
  });
});
