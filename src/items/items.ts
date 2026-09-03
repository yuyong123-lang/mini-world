// 物品定义与注册表（契约 §5）
// 数据来自 data/items.json，模块加载时 load 一次。
// ItemStack 规范类型复用 core/types.ts（勿另建）。
//
// iconTile 分配约定（与 blocks/atlas.ts ATLAS_TILES 一致，新增图标连续顺延）：
//   44 羊毛(方块/物品共用) | 45 生牛肉 | 46 生羊肉 | 47 皮革 | 48 生猪排
//   49 铁锭 | 50 金锭 | 51-53 熟肉 | 55-56 熔炉 | 57+ 工具/武器/护甲/弓箭

import rawDefs from '../data/items.json';
import type { ItemStack, ToolType } from '../core/types';

export type { ItemStack };

/** 工具属性：tier 木=1 石=2 铁=3；speedMul 木×2 石×4 铁×6 */
export interface ToolSpec {
  type: ToolType;
  tier: 1 | 2 | 3;
  speedMul: number;
  damage: number;
}

export interface ItemDef {
  /** 物品唯一 key，如 'ITEM_PLANKS' */
  key: string;
  /** 中文名（UI 用） */
  name: string;
  /** 堆叠上限：普通 64，工具 1 */
  stackMax: number;
  /** 可放置时对应的 BlockDef.id（blocks.json）；不可放置则缺省 */
  place?: number;
  tool?: ToolSpec;
  /** 食用恢复饥饿值 */
  food?: { hunger: number };
  /** 远程武器标记：持有此物品时右键为蓄力拉弓（数值走 bow.ts 常量曲线） */
  bow?: { minCharge: number; fullCharge: number };
  /** 图集 tile 作图标；未定义则 UI 用纯色块 css 显示 */
  iconTile?: number;
}

/** 物品 key 常量表：逻辑名 → 物品 key（照契约 §5 形式） */
export const ITEMS = {
  // —— 可放置类（place = blocks.json 对应 id）——
  BLOCK_STONE: 'ITEM_STONE',
  BLOCK_COBBLE: 'ITEM_COBBLE',
  BLOCK_DIRT: 'ITEM_DIRT',
  BLOCK_SAND: 'ITEM_SAND',
  BLOCK_SANDSTONE: 'ITEM_SANDSTONE',
  BLOCK_LOG: 'ITEM_LOG',
  BLOCK_PLANKS: 'ITEM_PLANKS',
  BLOCK_LEAVES: 'ITEM_LEAVES',
  BLOCK_GLASS: 'ITEM_GLASS',
  BLOCK_SNOW: 'ITEM_SNOW',
  BLOCK_GLOWBLOCK: 'ITEM_GLOWBLOCK',
  BLOCK_CRAFT_TABLE: 'ITEM_CRAFT_TABLE',
  // —— 34 省建筑材质（挖掉可放回，掉落配对见 blocks.json 37..46）——
  BLOCK_WHITE_STONE: 'ITEM_WHITE_STONE',
  BLOCK_RED_BRICK: 'ITEM_RED_BRICK',
  BLOCK_BLUE_TILE: 'ITEM_BLUE_TILE',
  BLOCK_GREEN_TILE: 'ITEM_GREEN_TILE',
  BLOCK_DARK_TILE: 'ITEM_DARK_TILE',
  BLOCK_CONCRETE: 'ITEM_CONCRETE',
  BLOCK_GLASS_CURTAIN: 'ITEM_GLASS_CURTAIN',
  BLOCK_DARK_WOOD: 'ITEM_DARK_WOOD',
  BLOCK_THATCH: 'ITEM_THATCH',
  BLOCK_PASTEL_WALL: 'ITEM_PASTEL_WALL',
  // —— 矿物 ——
  COAL: 'ITEM_COAL',
  RAW_IRON: 'ITEM_RAW_IRON',
  RAW_GOLD: 'ITEM_RAW_GOLD',
  IRON_INGOT: 'ITEM_IRON_INGOT',
  GOLD_INGOT: 'ITEM_GOLD_INGOT',
  // —— 功能方块 ——
  BLOCK_FURNACE: 'ITEM_FURNACE',
  // —— 食物 ——
  APPLE: 'ITEM_APPLE',
  RAW_PORK: 'ITEM_RAW_PORK',
  RAW_BEEF: 'ITEM_RAW_BEEF',
  RAW_MUTTON: 'ITEM_RAW_MUTTON',
  COOKED_PORK: 'ITEM_COOKED_PORK',
  COOKED_BEEF: 'ITEM_COOKED_BEEF',
  COOKED_MUTTON: 'ITEM_COOKED_MUTTON',
  // —— 动物产物 / 中间材料 ——
  LEATHER: 'ITEM_LEATHER',
  WOOL: 'ITEM_WOOL',
  // —— 中间材料 ——
  STICK: 'ITEM_STICK',
  // —— 工具 ——
  WOOD_PICKAXE: 'ITEM_WOOD_PICKAXE',
  WOOD_AXE: 'ITEM_WOOD_AXE',
  WOOD_SWORD: 'ITEM_WOOD_SWORD',
  STONE_PICKAXE: 'ITEM_STONE_PICKAXE',
  STONE_SWORD: 'ITEM_STONE_SWORD',
  IRON_SWORD: 'ITEM_IRON_SWORD',
  IRON_PICKAXE: 'ITEM_IRON_PICKAXE',
  IRON_AXE: 'ITEM_IRON_AXE',
  // —— 远程武器 ——
  BOW: 'ITEM_BOW',
  ARROW: 'ITEM_ARROW',
  // —— 护甲 ——
  LEATHER_HELMET: 'ITEM_LEATHER_HELMET',
  LEATHER_CHESTPLATE: 'ITEM_LEATHER_CHESTPLATE',
  IRON_HELMET: 'ITEM_IRON_HELMET',
  IRON_CHESTPLATE: 'ITEM_IRON_CHESTPLATE',
} as const;

export type ItemKey = typeof ITEMS[keyof typeof ITEMS];

const defsByKey = new Map<string, ItemDef>();

function isValidItemDef(d: unknown): d is ItemDef {
  const o = d as Record<string, unknown>;
  return (
    typeof o === 'object' && o !== null &&
    typeof o.key === 'string' && o.key.length > 0 &&
    typeof o.name === 'string' &&
    typeof o.stackMax === 'number' && o.stackMax > 0
  );
}

export const ItemRegistry = {
  /** 启动时从 items.json 加载全部物品定义（默认自动加载内置数据） */
  load(defs: unknown[] = rawDefs as unknown[]): void {
    defsByKey.clear();
    for (const d of defs) {
      if (!isValidItemDef(d)) throw new Error(`非法 ItemDef: ${JSON.stringify(d)}`);
      defsByKey.set(d.key, d);
    }
  },

  get(key: string): ItemDef {
    const d = defsByKey.get(key);
    if (!d) throw new Error(`未知物品 key: ${key}`);
    return d;
  },

  has(key: string): boolean {
    return defsByKey.has(key);
  },

  count(): number {
    return defsByKey.size;
  },

  ready(): boolean {
    return defsByKey.size > 0;
  },

  /** 该物品可放置时对应的方块 id，否则返回 undefined */
  placeBlockId(key: string): number | undefined {
    return defsByKey.get(key)?.place;
  },
};

// 默认随模块加载冻结数据
ItemRegistry.load();

/** 便捷构造 ItemStack */
export function stack(key: string, count: number): ItemStack {
  return { key, count };
}
