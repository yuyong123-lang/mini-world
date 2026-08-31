// survival/armor.ts —— 护甲装备与减伤（2 槽：头盔 + 胸甲）
//
// 数值口径（MC 风格简化）：每点护甲减 4% 伤害、上限 20 点（=-80%）。
// 只作用于怪物伤害（stats.damageFromMob 入口）；摔落/饿伤不经过该入口，
// 天然豁免——与 MC 一致。
//
// 装备数据（ArmorSlots）是「背包装备区」的事实来源，由 main 负责存档回灌
// （save v2 的可选 armor 字段）与 UI 注入（inventoryUI 装备区）。

import { ItemRegistry } from '../items/items';
import type { ItemStack } from '../core/types';

/** 每点护甲的伤害减免比例 */
export const ARMOR_REDUCTION_PER_POINT = 0.04;
/** 护甲点数上限 */
export const ARMOR_MAX_POINTS = 20;

/** 装备槽位 */
export type ArmorSlot = 'head' | 'chest';

/**
 * 减伤纯函数：dmg × (1 - 0.04 × clamp(points, 0, 20))，下限 0。
 * 非有限伤害按 0 处理（防御式）。
 */
export function reduceDamage(dmg: number, points: number): number {
  if (!Number.isFinite(dmg) || dmg <= 0) return 0;
  const p = Number.isFinite(points) ? Math.min(ARMOR_MAX_POINTS, Math.max(0, points)) : 0;
  return dmg * Math.max(0, 1 - ARMOR_REDUCTION_PER_POINT * p);
}

/** 物品的护甲定义（ItemDef.armor 的鸭子读取） */
export interface ArmorDefLike {
  slot: ArmorSlot;
  points: number;
}

/** 读物品的护甲定义；非护甲物品返回 null */
export function armorDefOf(key: string): ArmorDefLike | null {
  if (!ItemRegistry.has(key)) return null;
  const def = ItemRegistry.get(key) as unknown as { armor?: ArmorDefLike };
  return def.armor ?? null;
}

/** 双槽装备容器（head/chest 各一格） */
export class ArmorSlots {
  head: ItemStack | null = null;
  chest: ItemStack | null = null;

  /** 当前总护甲点数（两槽求和，非法值防御式忽略） */
  armorPoints(): number {
    let pts = 0;
    for (const s of [this.head, this.chest]) {
      if (!s) continue;
      const def = armorDefOf(s.key);
      if (def && Number.isFinite(def.points) && def.points > 0) pts += def.points;
    }
    return Math.min(ARMOR_MAX_POINTS, pts);
  }

  /** 该物品是否适配该槽位 */
  canPlace(slot: ArmorSlot, key: string): boolean {
    const def = armorDefOf(key);
    return def?.slot === slot;
  }

  /**
   * 放入装备（自动校验槽位适配）；@returns 被换下的旧件（无则 null），不适配返回 null 且不变。
   */
  put(slot: ArmorSlot, s: ItemStack | null): ItemStack | null {
    if (s && !this.canPlace(slot, s.key)) return null;
    const old = this[slot];
    this[slot] = s;
    return old;
  }
}
