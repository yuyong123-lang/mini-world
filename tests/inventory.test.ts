import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/items/inventory';
import { ItemRegistry, ITEMS, stack } from '../src/items/items';

describe('Inventory（契约 §5）', () => {
  it('初始 36 槽全空，hotbarIndex 默认 0', () => {
    const inv = new Inventory();
    expect(inv.slots.length).toBe(36);
    expect(inv.slots.every((s) => s === null)).toBe(true);
    expect(inv.hotbarIndex).toBe(0);
    expect(inv.heldItem()).toBeNull();
  });

  it('add 同 key 未满槽优先堆叠，不入新槽', () => {
    const inv = new Inventory();
    inv.setSlot(3, stack(ITEMS.BLOCK_DIRT, 10));
    const remain = inv.add(stack(ITEMS.BLOCK_DIRT, 20));

    expect(remain).toBe(0);
    expect(inv.slots[3]).toEqual({ key: ITEMS.BLOCK_DIRT, count: 30 });
    // 其余槽仍空
    expect(inv.slots.filter(Boolean).length).toBe(1);
  });

  it('add 跨槽：满槽堆叠后剩余开新位', () => {
    const inv = new Inventory();
    inv.setSlot(0, stack(ITEMS.BLOCK_STONE, 60));
    const remain = inv.add(stack(ITEMS.BLOCK_STONE, 30));

    expect(remain).toBe(0);
    expect(inv.slots[0]!.count).toBe(64);
    expect(inv.slots[1]).toEqual({ key: ITEMS.BLOCK_STONE, count: 26 });
  });

  it('add 溢出返回未装下数量', () => {
    // 满包：36 格全部堆满煤炭，无法再装入任何物品
    const full = new Inventory();
    for (let i = 0; i < 36; i++) full.setSlot(i, stack(ITEMS.COAL, 64));
    expect(full.add(stack(ITEMS.APPLE, 100))).toBe(100);
    expect(full.add(stack(ITEMS.COAL, 7))).toBe(7);

    // 半满：同槽堆到上限后无空位，装不下部分返回剩余
    const inv = new Inventory();
    inv.setSlot(0, stack(ITEMS.APPLE, 60));
    for (let i = 1; i < 36; i++) inv.setSlot(i, stack(ITEMS.BLOCK_COBBLE, 64));
    const remain = inv.add(stack(ITEMS.APPLE, 10));   // 4 进槽0 剩 6 无处可放
    expect(remain).toBe(6);
    expect(inv.slots[0]).toEqual({ key: ITEMS.APPLE, count: 64 });
  });

  it('takeFrom 取出指定数量，归零置 null；不自动左移压缩', () => {
    const inv = new Inventory();
    inv.add(stack(ITEMS.STICK, 6));
    const got = inv.takeFrom(0, 4);
    expect(got).toEqual({ key: ITEMS.STICK, count: 4 });
    expect(inv.slots[0]).toEqual({ key: ITEMS.STICK, count: 2 });

    const rest = inv.takeFrom(0, 99); // 超额只取现有
    expect(rest?.count).toBe(2);
    expect(inv.slots[0]).toBeNull();

    expect(new Inventory().takeFrom(5)).toBeNull();
  });

  it('setSlot / swapSlots 保持槽位稳定（无自动压缩）', () => {
    const inv = new Inventory();
    inv.add(stack(ITEMS.APPLE, 1));   // 槽 0
    inv.add(stack(ITEMS.BLOCK_LOG, 2));     // 槽 1

    inv.swapSlots(0, 1);
    expect(inv.slots[0]?.key).toBe(ITEMS.BLOCK_LOG);
    expect(inv.slots[1]?.key).toBe(ITEMS.APPLE);

    inv.setSlot(1, null);
    expect(inv.slots[1]).toBeNull();
    expect(inv.slots[0]?.key).toBe(ITEMS.BLOCK_LOG); // 不前移
  });

  it('heldItem 跟随 hotbarIndex 切换，consumeHeld 扣减并清空', () => {
    const inv = new Inventory();
    inv.setSlot(2, stack(ITEMS.APPLE, 3));
    inv.hotbarIndex = 2;
    expect(inv.heldItem()?.key).toBe(ITEMS.APPLE);

    inv.consumeHeld();          // 吃一个
    expect(inv.heldItem()?.count).toBe(2);
    inv.consumeHeld(2);         // 一口气吃完
    expect(inv.slots[2]).toBeNull();
    expect(inv.heldItem()).toBeNull();
  });

  it('consumeHeld 在空手时为 no-op；放方块扣 1 不影响其他格', () => {
    const inv = new Inventory();
    inv.hotbarIndex = 7;
    expect(() => inv.consumeHeld()).not.toThrow();

    inv.setSlot(7, stack(ITEMS.BLOCK_PLANKS, 10));
    inv.setSlot(8, stack(ITEMS.WOOD_PICKAXE, 1));
    inv.consumeHeld();
    expect(inv.slots[7]?.count).toBe(9);
    expect(inv.slots[8]?.count).toBe(1);
  });
});

describe('items.json 数据完整性', () => {
  it('加载全部 75 个物品定义', () => {
    expect(ItemRegistry.count()).toBe(75);
  });

  it('place 类物品的 place 与 blocks.json id 对齐（抽查）', () => {
    expect(ItemRegistry.get(ITEMS.BLOCK_STONE).place).toBe(2);
    expect(ItemRegistry.get(ITEMS.BLOCK_CRAFT_TABLE).place).toBe(15);
    expect(ItemRegistry.get(ITEMS.RAW_IRON).place).toBeUndefined();
  });

  it('工具数值与 stackMax=1', () => {
    expect(ItemRegistry.get(ITEMS.WOOD_PICKAXE)).toMatchObject({
      stackMax: 1,
      tool: { type: 'pickaxe', tier: 1, speedMul: 2, damage: 2 },
    });
    expect(ItemRegistry.get(ITEMS.STONE_SWORD).tool).toMatchObject({ tier: 2, damage: 7 });
    expect(ItemRegistry.get(ITEMS.WOOD_AXE).tool!.speedMul).toBe(2);
    expect(ItemRegistry.get(ITEMS.STONE_PICKAXE).tool!.speedMul).toBe(4);
  });

  it('食物与不可放置物', () => {
    expect(ItemRegistry.get(ITEMS.APPLE).food?.hunger).toBe(2);
    expect(ItemRegistry.get(ITEMS.RAW_PORK).food?.hunger).toBe(3);
    expect(ItemRegistry.get(ITEMS.STICK).place).toBeUndefined();
    expect(ItemRegistry.has('ITEM_NOT_EXIST')).toBe(false);
  });
});
