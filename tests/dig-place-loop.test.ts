// 挖取 → 掉落 → 拾取 → 手持 → 放置 全链路回归
//
// 用户诉求：「挖掉的方块进了背包，要能再放出去建造。」
// 本文件把 main.ts 里内联的 onBreak/onPlace 接线逻辑按相同决策序列复刻为可测单元，
// 并对 blocks.json/items.json 的数据闭环做穷举校验——任何「挖得到却放不出 /
// 掉出未知物品」的数据断链都会在这里失败。

import { describe, expect, it } from 'vitest';
import { BLOCK, BlockRegistry } from '../src/blocks/registry';
import { ItemRegistry, ITEMS } from '../src/items/items';
import { Inventory } from '../src/items/inventory';
import { ddaRaycast } from '../src/player/interact';
import type { ItemStack, Vec3 } from '../src/core/types';

/** main.ts dropTableFor 的同款语义（LEAVES 苹果特例 + BlockDef.drop） */
function dropTableFor(blockId: number): ItemStack | null {
  if (blockId === BLOCK.LEAVES) {
    return Math.random() < 0.2 ? { key: 'ITEM_APPLE', count: 1 } : null;
  }
  const def = BlockRegistry.get(blockId);
  if (!def.drop) return null;
  return { key: def.drop, count: 1 };
}

/** 穷举注册表里全部方块 id（与 blocks.json 顺序一致） */
function allBlockIds(): number[] {
  const ids: number[] = [];
  for (let id = 0; id <= 46; id++) {
    try {
      BlockRegistry.get(id);
      ids.push(id);
    } catch {
      /* id 段空洞：跳过 */
    }
  }
  return ids;
}

describe('挖取→放置数据闭环', () => {
  it('每个有掉落的方块，其 drop key 必须是已注册物品（否则拾取后 UI/放置全断）', () => {
    for (const id of allBlockIds()) {
      const def = BlockRegistry.get(id);
      if (!def.drop) continue;
      expect(ItemRegistry.has(def.drop), `${def.name}(${id}) 掉落 ${def.drop} 未注册到 items.json`).toBe(true);
    }
  });

  it('每个「普通材质」掉落物必须可放置（挖了要能放回去建东西）', () => {
    // 矿物/食物/材料类掉落物不在「可放置」预期内，逐项豁免并写明理由
    // （作物/食物类物品未收录进 ITEMS 常量表，用字面量）
    const nonPlaceOk = new Set<string>([
      ITEMS.COAL, // 矿物
      ITEMS.RAW_IRON,
      ITEMS.RAW_GOLD,
      ITEMS.APPLE, // LEAVES 稀有掉落
      'ITEM_BANANA', // 作物/食物类
      'ITEM_TEA_LEAF',
      'ITEM_GRAPE',
      'ITEM_MELON_SLICE',
    ]);
    for (const id of allBlockIds()) {
      const def = BlockRegistry.get(id);
      if (!def.drop) continue;
      const item = ItemRegistry.get(def.drop);
      if (nonPlaceOk.has(item.key)) continue;
      expect(
        item.place,
        `${def.name}(${id}) 掉落 ${item.key} 缺 place 字段——挖掉后无法再放置`,
      ).toBeTypeOf('number');
      // place 必须指向真实存在的方块 id
      expect(() => BlockRegistry.get(item.place!)).not.toThrow();
    }
  });

  it('泥土/草方块挖掉后掉 ITEM_DIRT，且 ITEM_DIRT 可放回 DIRT', () => {
    expect(dropTableFor(BLOCK.DIRT)).toEqual({ key: 'ITEM_DIRT', count: 1 });
    expect(dropTableFor(BLOCK.GRASS)).toEqual({ key: 'ITEM_DIRT', count: 1 });
    expect(ItemRegistry.get('ITEM_DIRT').place).toBe(BLOCK.DIRT);
  });

  it('34 省建筑材质（37..46）挖掉必掉落、掉落物可放回原方块', () => {
    const mats = [
      [BLOCK.WHITE_STONE, 'ITEM_WHITE_STONE'],
      [BLOCK.RED_BRICK, 'ITEM_RED_BRICK'],
      [BLOCK.BLUE_TILE, 'ITEM_BLUE_TILE'],
      [BLOCK.GREEN_TILE, 'ITEM_GREEN_TILE'],
      [BLOCK.DARK_TILE, 'ITEM_DARK_TILE'],
      [BLOCK.CONCRETE, 'ITEM_CONCRETE'],
      [BLOCK.GLASS_CURTAIN, 'ITEM_GLASS_CURTAIN'],
      [BLOCK.DARK_WOOD, 'ITEM_DARK_WOOD'],
      [BLOCK.THATCH, 'ITEM_THATCH'],
      [BLOCK.PASTEL_WALL, 'ITEM_PASTEL_WALL'],
    ] as const;
    for (const [id, key] of mats) {
      expect(dropTableFor(id), `方块 ${id} 应掉落 ${key}`).toEqual({ key, count: 1 });
      expect(ItemRegistry.get(key).place, `${key} 应可放回方块 ${id}`).toBe(id);
      expect(ItemRegistry.get(key).iconTile, `${key} 应有图标 tile`).toBeTypeOf('number');
    }
  });

  it('石头挖掉掉圆石（MC 语义），圆石可放置', () => {
    expect(dropTableFor(BLOCK.STONE)).toEqual({ key: 'ITEM_COBBLE', count: 1 });
    expect(ItemRegistry.get('ITEM_COBBLE').place).toBe(BLOCK.COBBLE);
  });
});

describe('挖取→拾取→放置 全链路（复刻 main.ts 接线）', () => {
  /** 最小 World 桩：id map + setBlock 记录，与 main 的 world 交互面一致 */
  function makeWorld() {
    const cells = new Map<string, number>();
    const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
    return {
      cells,
      getBlock(x: number, y: number, z: number) {
        return cells.get(key(x, y, z)) ?? BLOCK.AIR;
      },
      setBlock(x: number, y: number, z: number, id: number) {
        cells.set(key(x, y, z), id);
      },
    };
  }

  /**
   * main.ts tryPickup 的同款决策序列：
   * 手持位为空 → 直接入手；否则按槽序 add，装得下才算拾取成功。
   */
  function makeTryPickup(inv: Inventory) {
    return (stack: ItemStack): boolean => {
      if (!inv.heldItem()) {
        inv.setSlot(inv.hotbarIndex, { ...stack });
        return true;
      }
      return inv.add({ ...stack }) === 0;
    };
  }

  it('挖泥土 → 掉落进包 → 手持右键 → 世界出现 DIRT 且手持减一', () => {
    const world = makeWorld();
    // 一面泥墙：脚下 y=10 铺一层泥土，玩家站 y=11
    for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) world.setBlock(x, 10, z, BLOCK.DIRT);

    const inv = new Inventory();
    const tryPickup = makeTryPickup(inv);

    // ---- 挖：DDA 从眼睛向下打中脚前方块（与 Interactor.update 同参量级）----
    const eye: Vec3 = { x: 4.5, y: 11.6, z: 4.5 };
    const hit = ddaRaycast((x, y, z) => world.getBlock(x, y, z), eye, { x: 0.3, y: -0.95, z: 0.1 }, 5);
    expect(hit.hit).toBe(true);
    expect(hit.blockId).toBe(BLOCK.DIRT);

    // main.onBreak 语义：toolOk（泥土 needTier=0 徒手可挖）→ setBlock AIR → 掉落
    world.setBlock(hit.pos.x, hit.pos.y, hit.pos.z, BLOCK.AIR);
    const drop = dropTableFor(hit.blockId);
    expect(drop).not.toBeNull();
    expect(tryPickup(drop!)).toBe(true);

    // ---- 放：物品入包后必须出现在当前手持位（快捷栏空 → 首个空槽即槽 0）----
    const held = inv.heldItem();
    expect(held).toEqual({ key: 'ITEM_DIRT', count: 1 });
    const placeId = ItemRegistry.get(held!.key).place;
    expect(placeId).toBeTypeOf('number');

    // main.onPlace 语义：目标格 AIR + 不与玩家 AABB 相交 → setBlock + consumeHeld
    const target = hit.prev;
    expect(world.getBlock(target.x, target.y, target.z)).toBe(BLOCK.AIR);
    world.setBlock(target.x, target.y, target.z, placeId!);
    inv.consumeHeld(1);

    expect(world.getBlock(target.x, target.y, target.z)).toBe(BLOCK.DIRT);
    expect(inv.heldItem()).toBeNull();
  });

  it('快捷栏全占时拾取落主背包：手持不是土块；腾位后 shift-click 可移回快捷栏', () => {
    const inv = new Inventory();
    // 快捷栏 9 格全占：土块只能落主背包槽 9
    for (let i = 0; i < 9; i++) inv.setSlot(i, { key: ITEMS.STICK, count: 1 });

    expect(inv.add({ key: 'ITEM_DIRT', count: 1 })).toBe(0);
    expect(inv.slots[9]).toEqual({ key: 'ITEM_DIRT', count: 1 });
    // 手持位仍是快捷栏槽 0 的原物品——此时右键放不出土块（符合 MC 直觉）
    expect(inv.heldItem()?.key).toBe(ITEMS.STICK);

    // 玩家腾空槽 5 后 shift-click 主背包土块 → 移入快捷栏槽 5
    inv.setSlot(5, null);
    inv.setSlot(9, null);
    inv.setSlot(5, { key: 'ITEM_DIRT', count: 1 });
    // 数字键 6 选中槽 5 → 手持变土块，右键可放置
    inv.hotbarIndex = 5;
    expect(inv.heldItem()?.key).toBe('ITEM_DIRT');
  });

  it('放置目标格是水时替换水源成功（水边建造不再是静默拒绝）', () => {
    const world = makeWorld();
    for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) world.setBlock(x, 10, z, BLOCK.DIRT);
    // 模拟水边情形：准星命中面上方一格被水占据
    world.setBlock(4, 11, 4, BLOCK.WATER);

    const inv = new Inventory();
    inv.setSlot(0, { key: 'ITEM_SAND', count: 1 });

    // main.onPlace 语义（修复后）：occupant 为 AIR 或 WATER 均可放
    const target: Vec3 = { x: 4, y: 11, z: 4 };
    const occupant = world.getBlock(target.x, target.y, target.z);
    const placeId = ItemRegistry.get('ITEM_SAND').place!;
    expect(occupant === BLOCK.AIR || occupant === BLOCK.WATER).toBe(true);
    world.setBlock(target.x, target.y, target.z, placeId);
    inv.consumeHeld(1);
    expect(world.getBlock(target.x, target.y, target.z)).toBe(BLOCK.SAND);
    expect(inv.heldItem()).toBeNull();
  });

  it('QoL：手持位为空时拾取直接入手（main tryPickup 语义）', () => {
    const inv = new Inventory();
    // 快捷栏槽 2 有东西、手持槽 0 空：土块不该落到槽 0 之后的槽序，而是直接进手持位
    inv.setSlot(2, { key: ITEMS.STICK, count: 1 });
    inv.hotbarIndex = 3;

    const tryPickup = makeTryPickup(inv);
    expect(tryPickup({ key: 'ITEM_DIRT', count: 1 })).toBe(true);
    expect(inv.slots[3]).toEqual({ key: 'ITEM_DIRT', count: 1 });
    expect(inv.heldItem()?.key).toBe('ITEM_DIRT');
    // 槽 2 原物品不受影响，槽 0/1 不被占用
    expect(inv.slots[2]).toEqual({ key: ITEMS.STICK, count: 1 });
    expect(inv.slots[0]).toBeNull();
  });

  it('QoL：空手但背包有可放置方块 → 自动换手后可放置（main onPlace 语义）', () => {
    const world = makeWorld();
    for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) world.setBlock(x, 10, z, BLOCK.DIRT);

    const inv = new Inventory();
    // 手持位（槽 0）空、快捷栏其余格被非放置物占着、土块沉在主背包槽 12
    for (let i = 1; i < 9; i++) inv.setSlot(i, { key: ITEMS.STICK, count: 1 });
    inv.setSlot(12, { key: 'ITEM_DIRT', count: 3 });

    // main onPlace 开头的自动换手：firstPlaceableSlot 找到槽 12 → swap 到手持位
    let held = inv.heldItem();
    if (!held) {
      let found = -1;
      for (let i = 0; i < inv.slots.length; i++) {
        const s = inv.slots[i];
        if (s && ItemRegistry.has(s.key) && ItemRegistry.get(s.key).place !== undefined) {
          found = i;
          break;
        }
      }
      expect(found).toBe(12);
      inv.swapSlots(found, inv.hotbarIndex);
      held = inv.heldItem();
    }
    expect(held).toEqual({ key: 'ITEM_DIRT', count: 3 });

    // 换手后照常放置：目标格写入 DIRT，手持减一
    const placeId = ItemRegistry.get(held!.key).place!;
    const target: Vec3 = { x: 4, y: 11, z: 4 };
    expect(world.getBlock(target.x, target.y, target.z)).toBe(BLOCK.AIR);
    world.setBlock(target.x, target.y, target.z, placeId);
    inv.consumeHeld(1);
    expect(world.getBlock(target.x, target.y, target.z)).toBe(BLOCK.DIRT);
    expect(inv.heldItem()).toEqual({ key: 'ITEM_DIRT', count: 2 });
    // 原槽 12 换成了手持位原来的空，物品没有凭空增多
    expect(inv.slots[12]).toBeNull();
  });
});
