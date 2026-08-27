// 背包容器（契约 §5）
// 36 槽 = 9 快捷栏(hotbar, 0..8) + 27 主背包(9..35)

import type { ItemStack } from '../core/types';
import { ItemRegistry } from './items';

export class Inventory {
  slots: (ItemStack | null)[];
  /** 当前手持快捷栏索引 0..8 */
  hotbarIndex = 0;

  constructor(slotCount = 36) {
    this.slots = new Array<ItemStack | null>(slotCount).fill(null);
  }

  /**
   * 放入物品：优先与同 key 且未满 stackMax 的槽位堆叠，
   * 再依序找第一个空槽放入剩余。
   * @returns 未装下的剩余数量；完全入包返回 0。不做自动压缩/左移。
   */
  add(item: ItemStack): number {
    let remain = Math.floor(item.count);
    if (remain <= 0) return 0;

    const max = ItemRegistry.has(item.key) ? ItemRegistry.get(item.key).stackMax : Infinity;

    // 1. 同 key 未满槽堆叠
    for (let i = 0; i < this.slots.length && remain > 0; i++) {
      const s = this.slots[i];
      if (!s || s.key !== item.key || s.count >= max) continue;
      const take = Math.min(max - s.count, remain);
      s.count += take;
      remain -= take;
    }

    // 2. 空槽开新堆
    for (let i = 0; i < this.slots.length && remain > 0; i++) {
      if (this.slots[i]) continue;
      const put = Math.min(max, remain);
      this.slots[i] = { key: item.key, count: put };
      remain -= put;
    }

    return remain;
  }

  /**
   * 从指定槽取出至多 count 个（不自动压缩其余槽位，留下的空位即 null）。
   * @returns 实际取出的堆叠；槽为空返回 null
   */
  takeFrom(slot: number, count = 1): ItemStack | null {
    const s = this.slots[slot];
    if (!s || count <= 0) return null;

    const taken = Math.min(count, s.count);
    s.count -= taken;
    if (s.count <= 0) this.slots[slot] = null;
    return { key: s.key, count: taken };
  }

  /** 直接覆写槽位（传 null 清空） */
  setSlot(slot: number, item: ItemStack | null): void {
    this.slots[slot] = item;
  }

  /** 交换两个槽位内容 */
  swapSlots(a: number, b: number): void {
    const tmp = this.slots[a];
    this.slots[a] = this.slots[b];
    this.slots[b] = tmp;
  }

  /** 当前手持快捷栏物品（hotbarIndex 0..8 → slots 0..8） */
  heldItem(): ItemStack | null {
    return this.slots[this.hotbarIndex] ?? null;
  }

  /**
   * 扣减当前手持物品（吃东西/放置方块）。count 归 0 时置 null。
   * 手持数量不足时只扣掉实际持有的部分。
   */
  consumeHeld(count = 1): void {
    const s = this.heldItem();
    if (!s) return;
    s.count -= count;
    if (s.count <= 0) this.slots[this.hotbarIndex] = null;
  }
}
