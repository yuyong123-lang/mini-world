// 方块注册表：数字 id ↔ 定义双向查表（契约 §2）
// 数据来自 data/blocks.json，启动时 load 一次。

import rawDefs from '../data/blocks.json';

/** 图集扩展 tile 区（bedrock/water 的补充绘制区，见 atlas ATLAS_TILES） */
type ToolKind = 'pickaxe' | 'axe' | 'shovel' | 'sword';

export interface BlockDef {
  id: number;
  key: string;
  name: string;
  solid: boolean;
  opaque: boolean;
  liquid?: boolean;
  transparent?: boolean;
  emissive?: boolean;
  /** [top, bottom, side] 图集 tile 序号 */
  tex: readonly [number, number, number];
  hardness: number;
  tool?: ToolKind;
  minTier?: 0 | 1 | 2 | 3;
  drop?: string | null;
}

function isValidBlockDef(d: unknown): d is BlockDef {
  const o = d as Record<string, unknown>;
  return (
    typeof o === 'object' && o !== null &&
    typeof o.id === 'number' &&
    typeof o.key === 'string' &&
    typeof o.name === 'string' &&
    typeof o.solid === 'boolean' &&
    typeof o.opaque === 'boolean' &&
    Array.isArray(o.tex) && o.tex.length === 3 &&
    typeof o.hardness === 'number'
  );
}

const byId = new Map<number, BlockDef>();
const byKeyMap = new Map<string, BlockDef>();

/** 方块 id 常量（与 blocks.json 顺序一致） */
export const BLOCK = {
  AIR: 0, BEDROCK: 1, STONE: 2, COBBLE: 3, DIRT: 4, GRASS: 5, SAND: 6,
  SANDSTONE: 7, LOG: 8, PLANKS: 9, LEAVES: 10, GLASS: 11, WATER: 12,
  SNOW: 13, GLOWBLOCK: 14, CRAFT_TABLE: 15,
  ORE_COAL: 16, ORE_IRON: 17, ORE_GOLD: 18,
  WOOL: 19, FURNACE: 20,
  // ---- 中国区域扩展（21..36，分配表见 regions 系统设计文档）----
  BAMBOO: 21, BAMBOO_LEAF: 22, GREY_TILE: 23, GREY_BRICK: 24,
  RED_WALL: 25, YELLOW_TILE: 26, RED_DOOR: 27, BAMBOO_PLANK: 28,
  PALM_LEAF: 29, TEA_LEAVES: 30, POPLAR_LEAVES: 31, GRAPE_VINE: 32,
  MELON: 33, SPRUCE_LOG: 34, SPRUCE_LEAVES: 35, ICE: 36,
} as const;

export const BlockRegistry = {
  load(defs: unknown[] = rawDefs as unknown[]): void {
    byId.clear();
    byKeyMap.clear();
    for (const d of defs) {
      if (!isValidBlockDef(d)) throw new Error(`非法 BlockDef: ${JSON.stringify(d)}`);
      byId.set(d.id, d);
      byKeyMap.set(d.key, d);
    }
  },

  get(id: number): BlockDef {
    const d = byId.get(id);
    if (!d) throw new Error(`未知方块 id: ${id}`);
    return d;
  },

  byKey(key: string): BlockDef {
    const d = byKeyMap.get(key);
    if (!d) throw new Error(`未知方块 key: ${key}`);
    return d;
  },

  count(): number {
    return byId.size;
  },

  /** 加载是否已完成 */
  ready(): boolean {
    return byId.size > 0;
  },
};

// 默认随模块加载冻结数据
BlockRegistry.load();
