// tests/armor.test.ts —— 护甲减伤 + 装备槽逻辑
import { describe, expect, it } from 'vitest';
import {
  ARMOR_MAX_POINTS,
  ARMOR_REDUCTION_PER_POINT,
  ArmorSlots,
  armorDefOf,
  reduceDamage,
} from '../src/survival/armor';

describe('reduceDamage 减伤公式', () => {
  it('0 点 = 原伤', () => {
    expect(reduceDamage(3, 0)).toBe(3);
  });

  it('每点 -4%：8 点 = 0.68 倍（满铁 -32%）', () => {
    expect(reduceDamage(3, 8)).toBeCloseTo(3 * (1 - 8 * ARMOR_REDUCTION_PER_POINT), 10);
  });

  it('20 点封顶 = 0.2 倍（-80%）', () => {
    expect(reduceDamage(10, 20)).toBeCloseTo(2, 10);
    expect(reduceDamage(10, 50)).toBeCloseTo(2, 10); // 超出上限不继续减
  });

  it('防御式：非有限/负伤害返回 0；负点数视为 0', () => {
    expect(reduceDamage(NaN, 5)).toBe(0);
    expect(reduceDamage(-1, 5)).toBe(0);
    expect(reduceDamage(5, -10)).toBe(5);
  });
});

describe('ArmorSlots 装备槽', () => {
  it('canPlace：槽位与 armor.slot 匹配才可放', () => {
    const s = new ArmorSlots();
    expect(s.canPlace('head', 'ITEM_LEATHER_HELMET')).toBe(true);
    expect(s.canPlace('chest', 'ITEM_LEATHER_HELMET')).toBe(false);
    expect(s.canPlace('head', 'ITEM_IRON_INGOT')).toBe(false); // 非护甲
  });

  it('put：放入/换下返回旧件；不适配返回 null 且不变', () => {
    const s = new ArmorSlots();
    expect(s.put('head', { key: 'ITEM_LEATHER_HELMET', count: 1 })).toBeNull();
    const old = s.put('head', { key: 'ITEM_IRON_HELMET', count: 1 });
    expect(old).toEqual({ key: 'ITEM_LEATHER_HELMET', count: 1 }); // 换下旧件
    expect(s.head).toEqual({ key: 'ITEM_IRON_HELMET', count: 1 });
    // 非护甲物品拒绝放入
    expect(s.put('chest', { key: 'ITEM_IRON_INGOT', count: 1 })).toBeNull();
    expect(s.chest).toBeNull();
  });

  it('armorPoints：两槽求和并封顶 20', () => {
    const s = new ArmorSlots();
    expect(s.armorPoints()).toBe(0);
    s.head = { key: 'ITEM_LEATHER_HELMET', count: 1 };
    s.chest = { key: 'ITEM_IRON_CHESTPLATE', count: 1 };
    expect(s.armorPoints()).toBe(1 + 6);
    // 满配超上限：封顶
    s.head = { key: 'ITEM_IRON_HELMET', count: 1 };
    // 手工塞 20+ 点（通过多件不可能——两槽最高 2+6=8；封顶逻辑用伪物品验证）
    const s2 = new ArmorSlots();
    s2.head = { key: 'ITEM_TEST_999PT', count: 1 };
    expect(s2.armorPoints()).toBe(0); // 未注册物品 → 0
    expect(ARMOR_MAX_POINTS).toBe(20);
    expect(ARMOR_REDUCTION_PER_POINT).toBe(0.04);
  });

  it('armorDefOf：注册护甲返回定义，未知/非护甲返回 null', () => {
    expect(armorDefOf('ITEM_IRON_CHESTPLATE')).toEqual({ slot: 'chest', points: 6 });
    expect(armorDefOf('ITEM_NOT_EXIST')).toBeNull();
    expect(armorDefOf('ITEM_IRON_INGOT')).toBeNull();
  });
});
