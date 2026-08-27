// tests/ui-inventory.test.ts —— T45 背包/合成 UI 逻辑层测试
//
// 策略：项目 devDependencies 无 jsdom / happy-dom，DOM 环境不强求；
// 这里直接对 src/ui/inventoryUI.ts 导出的核心纯函数做单元测试：
//   · handleSlotClick   光标三态（拿/放/合/换）
//   · planShiftMove + applySlotPlan   shift-click 快速转移计划
//   · collectRefundStacks (craftUI)   合成格退回清单
// 组件类的 DOM 行为依赖真实 document，仅以「构造所需的鸭子对象」做最小类型级校验。

import { describe, expect, it } from 'vitest';
import type { ItemStack } from '../src/core/types';
import {
  HOTBAR_SIZE,
  MAIN_START,
  applySlotPlan,
  defaultRenderIcon,
  handleSlotClick,
  sameStack,
  planShiftMove,
} from '../src/ui/inventoryUI';
import { collectRefundStacks, handleCraftSlotClick } from '../src/ui/craftUI';

const st = (key: string, count: number): ItemStack => ({ key, count });

const max64 = (_key: string): number => 64;
const opts = { stackMaxOf: max64 };

describe('handleSlotClick：光标三态', () => {
  const empty = new Array<ItemStack | null>(36).fill(null);

  it('空手点空格 → 无变化', () => {
    const r = handleSlotClick(null, empty, 3, opts);
    expect(r.cursor).toBeNull();
    expect(r.slots[3]).toBeNull();
    expect(r.slots.length).toBe(36);
  });

  it('空手点有货格 → 整堆拿起，原格清空', () => {
    const slots = empty.slice();
    slots[5] = st('ITEM_DIRT', 10);
    const r = handleSlotClick(null, slots, 5, opts);
    expect(r.cursor).toEqual(st('ITEM_DIRT', 10));
    expect(r.slots[5]).toBeNull();
  });

  it('手有货点空格 → 全部放下，手清空', () => {
    const r = handleSlotClick(st('ITEM_LOG', 7), empty, 12, opts);
    expect(r.cursor).toBeNull();
    expect(r.slots[12]).toEqual(st('ITEM_LOG', 7));
  });

  it('同 key 未满 → 合并进格，溢出留手', () => {
    const slots = empty.slice();
    slots[0] = st('ITEM_COBBLE', 60);
    const r = handleSlotClick(st('ITEM_COBBLE', 30), slots, 0, opts);
    expect(r.slots[0]).toEqual(st('ITEM_COBBLE', 64));
    expect(r.cursor).toEqual(st('ITEM_COBBLE', 26));
  });

  it('同 key 恰好填满 → 手清空（无溢出）', () => {
    const slots = empty.slice();
    slots[2] = st('ITEM_SAND', 30);
    const r = handleSlotClick(st('ITEM_SAND', 34), slots, 2, opts);
    expect(r.slots[2]).toEqual(st('ITEM_SAND', 64));
    expect(r.cursor).toBeNull();
  });

  it('同 key 格已满 → 整组交换（等价于放下+拿起）', () => {
    const slots = empty.slice();
    slots[1] = st('ITEM_GLASS', 64);
    const r = handleSlotClick(st('ITEM_GLASS', 5), slots, 1, opts);
    expect(r.slots[1]).toEqual(st('ITEM_GLASS', 5));
    expect(r.cursor).toEqual(st('ITEM_GLASS', 64));
  });

  it('异 key → 交换', () => {
    const slots = empty.slice();
    slots[4] = st('ITEM_DIRT', 3);
    const r = handleSlotClick(st('ITEM_APPLE', 2), slots, 4, opts);
    expect(r.slots[4]).toEqual(st('ITEM_APPLE', 2));
    expect(r.cursor).toEqual(st('ITEM_DIRT', 3));
  });

  it('不可变语义：入参数组与槽内对象不被改动', () => {
    const slots = empty.slice();
    const cell = st('ITEM_DIRT', 10);
    slots[7] = cell;
    const cursor = st('ITEM_STONE', 20);
    const before = JSON.stringify(slots);
    handleSlotClick(cursor, slots, 7, opts);
    expect(JSON.stringify(slots)).toBe(before);
    expect(cell.count).toBe(10);
    expect(cursor.count).toBe(20);
  });

  it('stackMaxOf 注入生效（工具 stackMax=1：一格最多 1 个）', () => {
    const tools = (k: string): number => (k === 'ITEM_WOOD_PICKAXE' ? 1 : 64);
    const slots = empty.slice();
    slots[9] = st('ITEM_WOOD_PICKAXE', 1);
    // 同 key 但格已满(=1) → 交换
    const r = handleSlotClick(st('ITEM_WOOD_PICKAXE', 1), slots, 9, {
      stackMaxOf: tools,
    });
    expect(r.slots[9]).toEqual(st('ITEM_WOOD_PICKAXE', 1));
    expect(r.cursor).toEqual(st('ITEM_WOOD_PICKAXE', 1));
  });

  it('越界 index 安全返回原状', () => {
    const r = handleSlotClick(st('ITEM_DIRT', 1), empty, 999, opts);
    expect(r.cursor).toEqual(st('ITEM_DIRT', 1));
    expect(r.slots.length).toBe(36);
  });
});

describe('planShiftMove / applySlotPlan：shift-click 快速转移', () => {
  const empty = new Array<ItemStack | null>(36).fill(null);

  it('hotbar → main：落入主背包第一个空位', () => {
    const slots = empty.slice();
    slots[0] = st('ITEM_DIRT', 12);
    const plan = planShiftMove(slots, 0, opts);
    expect(plan.length).toBeGreaterThan(0);

    const out = applySlotPlan(slots, 0, plan);
    expect(out[0]).toBeNull(); // 全部移走 → 源格清空
    expect(out[MAIN_START]).toEqual(st('ITEM_DIRT', 12));
    expect(plan.every(([to]) => to >= MAIN_START)).toBe(true); // 只落在主背包区
  });

  it('main → hotbar：回到热栏区第一个空位', () => {
    const slots = empty.slice();
    slots[20] = st('ITEM_LOG', 5);
    const plan = planShiftMove(slots, 20, opts);
    expect(plan.every(([to]) => to < MAIN_START)).toBe(true);

    const out = applySlotPlan(slots, 20, plan);
    expect(out[20]).toBeNull();
    expect(out[0]).toEqual(st('ITEM_LOG', 5));
  });

  it('目标区同 key 未满位先补满，再落空位', () => {
    const slots = empty.slice();
    slots[0] = st('ITEM_DIRT', 30);
    slots[MAIN_START] = st('ITEM_DIRT', 50); // 半满 → 先补 14
    const plan = planShiftMove(slots, 0, opts);
    expect(plan[0][0]).toBe(MAIN_START); // 下标小的堆叠位优先
    expect(plan[0][1]).toBe(14);

    const out = applySlotPlan(slots, 0, plan);
    expect(out[MAIN_START]).toEqual(st('ITEM_DIRT', 64));
    expect(out[MAIN_START + 1]).toEqual(st('ITEM_DIRT', 16)); // 剩余落下一个空位
    expect(out[0]).toBeNull();
  });

  it('多个同 key 半满位全部补满后才启用空位', () => {
    const slots = empty.slice();
    slots[0] = st('ITEM_DIRT', 30);
    slots[MAIN_START] = st('ITEM_DIRT', 50); // 需 14
    slots[MAIN_START + 3] = st('ITEM_DIRT', 40); // 再收 16 → 56
    const plan = planShiftMove(slots, 0, opts);
    expect(plan).toEqual([
      [MAIN_START, 14],
      [MAIN_START + 3, 16],
    ]);

    const out = applySlotPlan(slots, 0, plan);
    expect(out[MAIN_START]).toEqual(st('ITEM_DIRT', 64));
    expect(out[MAIN_START + 3]).toEqual(st('ITEM_DIRT', 56));
    expect(out[0]).toBeNull(); // 30 = 14 + 16 全部移走
  });

  it('跨区满员时保留余量在源格', () => {
    const slots = empty.slice();
    for (let i = MAIN_START; i < 36; i++) slots[i] = st('ITEM_STONE', 64);
    slots[0] = st('ITEM_DIRT', 8); // 目标区全满且无同 key
    const plan = planShiftMove(slots, 0, opts);
    expect(plan).toEqual([]);

    const out = applySlotPlan(slots, 0, plan);
    expect(out[0]).toEqual(st('ITEM_DIRT', 8)); // 原样保留
  });

  it('部分转移：源格剩余数量正确', () => {
    const slots = empty.slice();
    slots[0] = st('ITEM_DIRT', 70); // 超过单格上限的数量无所谓，这里只测拆分
    const plan = planShiftMove(slots, 0, opts);
    const moved = plan.reduce((s, [, n]) => s + n, 0);
    const out = applySlotPlan(slots, 0, plan);
    if (moved === 70) expect(out[0]).toBeNull();
    else expect(out[0]?.count).toBe(70 - moved);
  });

  it('空格 shift-click 返回空计划', () => {
    expect(planShiftMove(empty, 3, opts)).toEqual([]);
  });
});

describe('sameStack 差量判定', () => {
  it('null 与 null 相同、异 key/异 count 判不同', () => {
    expect(sameStack(null, null)).toBe(true);
    expect(sameStack(st('A', 1), st('A', 1))).toBe(true);
    expect(sameStack(st('A', 1), st('B', 1))).toBe(false);
    expect(sameStack(st('A', 1), st('A', 2))).toBe(false);
    expect(sameStack(st('A', 1), null)).toBe(false);
  });
});

describe('craftUI 逻辑层', () => {
  it('collectRefundStacks 收集所有非空材料并克隆', () => {
    const grid: (ItemStack | null)[] = [st('ITEM_PLANKS', 3), null, st('ITEM_STICK', 7), null];
    const refund = collectRefundStacks(grid);
    expect(refund).toEqual([st('ITEM_PLANKS', 3), st('ITEM_STICK', 7)]);
    refund[0].count = 99;
    expect(grid[0]!.count).toBe(3); // 克隆语义，不回写
  });

  it('collectRefundStacks 对空 grid 返回空数组', () => {
    expect(collectRefundStacks([null, null])).toEqual([]);
  });

  it('handleCraftSlotClick 三态与 inventory 版一致（拿→放→换）', () => {
    let grid: (ItemStack | null)[] = [null, null, null, null];

    // 拿起
    grid[0] = st('ITEM_PLANKS', 4);
    let r = handleCraftSlotClick(null, grid, 0);
    expect(r.cursor).toEqual(st('ITEM_PLANKS', 4));
    expect(r.slots[0]).toBeNull();

    // 放下
    r = handleCraftSlotClick(r.cursor!, r.slots, 2);
    expect(r.cursor).toBeNull();
    expect(r.slots[2]).toEqual(st('ITEM_PLANKS', 4));

    // 异 key 交换
    r = handleCraftSlotClick(st('ITEM_STICK', 1), r.slots, 2);
    expect(r.slots[2]).toEqual(st('ITEM_STICK', 1));
    expect(r.cursor).toEqual(st('ITEM_PLANKS', 4));

    // 同 key 合并（合成材料上限固定 64）
    r.slots[2] = st('ITEM_STICK', 63);
    r = handleCraftSlotClick(st('ITEM_STICK', 3), r.slots, 2);
    expect(r.slots[2]).toEqual(st('ITEM_STICK', 64));
    expect(r.cursor).toEqual(st('ITEM_STICK', 2));
  });

  it('越界点击安全', () => {
    const grid: (ItemStack | null)[] = [st('A', 1), null];
    const r = handleCraftSlotClick(st('B', 2), grid, 5);
    expect(r.cursor).toEqual(st('B', 2));
    expect(r.slots[0]).toEqual(st('A', 1));
  });
});

describe('组件可实例化所需鸭子对象（类型层面冒烟）', () => {
  it('InventoryLike 完整形态可满足（不真跑 DOM）', () => {
    const invLike = {
      slots: new Array<ItemStack | null>(36).fill(null),
      hotbarIndex: 0,
      takeFrom: (s: number): ItemStack | null => (s >= 0 ? st('X', 1) : null),
      setSlot: (_s: number, _v: ItemStack | null): void => {},
      swapSlots: (_a: number, _b: number): void => {},
      add: (stk: ItemStack): number => stk.count,
    };
    // 把实例当纯函数入参再走一遍，保证形状匹配而非仅声明
    invLike.slots[0] = st('ITEM_DIRT', 1);
    const r = handleSlotClick(null, invLike.slots, 0, opts);
    expect(r.cursor).toEqual(st('ITEM_DIRT', 1));
    expect(HOTBAR_SIZE).toBe(9);
    expect(defaultRenderIcon).toBeTypeOf('function');
  });
});
