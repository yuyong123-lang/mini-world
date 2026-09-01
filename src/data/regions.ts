// data/regions.ts —— 区域定义与活动区域状态（中国地图选区系统）
// 纯数据 + 纯逻辑：无 three/DOM 依赖，terragen（含 worldgen Worker）/main/UI 三方共用。
//
// 区域如何进入世界生成：seed 采用 `cn_<regionId>_<random>` 格式，
// terragen.initTerrain(seed) 会调 initRegionFromSeed(seed) 把前缀解析成
// 活动区域参数 —— 主线程与 Worker 各自 init 时自然得到同一区域，
// 因此 Worker 协议（GenInitMsg 只带 seed）无需任何改动。
// 旧 seed（无前缀，如 'mini-world-m1'）解析为 'generic'，其地形参数与
// 历史常量逐位一致 → 旧存档读档后地形重生完全不变。
//
// 注意：本文件会被 Worker 打包进依赖图，实体相关类型只允许 import type
// （类型擦除），否则会把 physics/DOM 拖进 Worker。

import type { BiomeKind } from '../world/terragen';
import type { AnimalSpeciesKey } from '../entities/animals';
import { BlockRegistry } from '../blocks/registry';

/** 可选区域 id；generic 为无区域旧世界（参数=历史常量） */
export type RegionId =
  | 'generic'
  | 'sichuan'
  | 'beijing'
  | 'yunnan'
  | 'neimenggu'
  | 'xinjiang'
  | 'dongbei';

/** 区域树种类别：每种对应 terragen 里一个 stamp 函数（半径全部 ≤2） */
export type TreeKind =
  | 'oak'
  | 'bamboo'
  | 'spruce'
  | 'poplar'
  | 'palm'
  | 'tea'
  | 'pagoda'
  | 'banana';

/** 区域结构类别：每种对应 structures.ts 里一个 stamp 函数 */
export type StructureKind =
  | 'house' // 川西民居
  | 'siheyuan' // 北京四合院
  | 'palace' // 宫殿（红墙黄瓦，稀有）
  | 'bamboo_house' // 傣族竹楼
  | 'yurt' // 蒙古包
  | 'oasis_farm' // 新疆绿洲农庄
  | 'snow_cabin'; // 东北雪乡木屋

/** 单个昼夜关键帧的三色（与 daycycle KEY_* 同构） */
export interface SkyKeyFrame {
  top: string;
  bottom: string;
  fog: string;
}

/** 陆地表层：top = 地表块，sub = 次表层（h-3..h-1） */
export interface RegionSurface {
  top: string;
  sub: string;
}

/** 地形参数（方块以 key 表达；initRegionFromSeed 时预解析成 id） */
export interface RegionTerrain {
  /** 地形基准相对海平面的抬升（替代旧 BASE_OFFSET=4） */
  baseOffset: number;
  /** 大陆层振幅（旧 cont*6） */
  contAmp: number;
  /** 丘陵层振幅（旧 hills*3） */
  hillsAmp: number;
  /** 山脊层最大抬升（旧 RIDGE_AMP=26） */
  ridgeAmp: number;
  /** 加在温度场输出上的偏置，推动 biomeOf 判定 */
  tempBias: number;
  /** 加在沙漠温度阈值上的偏置（负值 → 更多沙漠） */
  desertBias: number;
  /** 加在雪原温度阈值上的偏置（负值 → 更多雪原） */
  snowBias: number;
  /** 全图强制群系（内蒙=草原 / 东北=雪原）；缺省按温度噪声 */
  forceBiome?: BiomeKind;
  /** 梯田量化步长（云南=4）；缺省/0 关闭 */
  terraceStep?: number;
  /** 三群系陆地表层方块（水下列仍恒为沙，保持历史语义） */
  surface: Record<BiomeKind, RegionSurface>;
  /** 水面顶层替换方块（东北='ICE' 湖面结冰）；缺省不替换 */
  waterTopBlock?: string;
  trees: {
    /** 每列成树概率（旧 TREE_CHANCE=0.009） */
    chance: number;
    /** 树种权重表（命中树列后按权重 roll 出具体树种） */
    kinds: Array<{ kind: TreeKind; weight: number }>;
    /** 允许长树的群系 */
    onBiomes: BiomeKind[];
  };
  /** 区域结构表（Phase 6 起 stamp；generic 为空） */
  structures: Array<{ kind: StructureKind; cellDensity: number }>;
}

/** 区域氛围：天空关键帧覆盖 / 雾距缩放 / 水色 tint */
export interface RegionAtmosphere {
  /** 覆盖 daycycle 四关键帧的任意子集；缺省用内置配色 */
  sky?: Partial<Record<'dawn' | 'noon' | 'dusk' | 'night', SkyKeyFrame>>;
  /** 雾距缩放（四川 0.7 雾气 / 新疆 1.25 通透），乘到 FOG_NEAR/FAR */
  fogScale: number;
  /** 水材质 tint 色（#rrggbb）；缺省不 tint */
  waterTint?: string;
}

/** 区域完整定义 */
export interface RegionDef {
  id: RegionId;
  name: string;
  blurb: string;
  /** 选区地图上的像素色块颜色 */
  mapColor: string;
  terrain: RegionTerrain;
  atmosphere: RegionAtmosphere;
  /** 动物刷怪权重表（总权重任意，spawner 内部归一化） */
  animals: Array<{ key: AnimalSpeciesKey; weight: number }>;
  /** 允许刷动物的地面方块 key（如新疆骆驼可刷在 SAND 上） */
  animalGround: string[];
}

/** 运行时地形参数：方块 key 已换算为 id，供 terragen 热路径零查表使用 */
export interface ResolvedRegionTerrain {
  baseOffset: number;
  contAmp: number;
  hillsAmp: number;
  ridgeAmp: number;
  tempBias: number;
  desertBias: number;
  snowBias: number;
  forceBiome: BiomeKind | null;
  terraceStep: number;
  surfaceTop: Record<BiomeKind, number>;
  surfaceSub: Record<BiomeKind, number>;
  waterTopBlock: number | null;
  treeChance: number;
  treeKinds: Array<{ kind: TreeKind; weight: number }>;
  treeOnBiomes: BiomeKind[];
  structures: Array<{ kind: StructureKind; cellDensity: number }>;
}

function blockIdByKey(key: string): number {
  return BlockRegistry.byKey(key).id;
}

function resolveSurface(s: RegionSurface): { top: number; sub: number } {
  return { top: blockIdByKey(s.top), sub: blockIdByKey(s.sub) };
}

/** 把 RegionDef 的方块 key 预解析成 id（initRegionFromSeed 时一次性完成） */
function resolveTerrain(t: RegionTerrain): ResolvedRegionTerrain {
  return {
    baseOffset: t.baseOffset,
    contAmp: t.contAmp,
    hillsAmp: t.hillsAmp,
    ridgeAmp: t.ridgeAmp,
    tempBias: t.tempBias,
    desertBias: t.desertBias,
    snowBias: t.snowBias,
    forceBiome: t.forceBiome ?? null,
    terraceStep: t.terraceStep ?? 0,
    surfaceTop: {
      grass: resolveSurface(t.surface.grass).top,
      desert: resolveSurface(t.surface.desert).top,
      snow: resolveSurface(t.surface.snow).top,
    },
    surfaceSub: {
      grass: resolveSurface(t.surface.grass).sub,
      desert: resolveSurface(t.surface.desert).sub,
      snow: resolveSurface(t.surface.snow).sub,
    },
    waterTopBlock: t.waterTopBlock ? blockIdByKey(t.waterTopBlock) : null,
    treeChance: t.trees.chance,
    treeKinds: t.trees.kinds,
    treeOnBiomes: t.trees.onBiomes,
    structures: t.structures,
  };
}

// ---------------------------------------------------------------------------
// 区域表
// ---------------------------------------------------------------------------

/**
 * 全部区域定义。
 * generic 的每个数值 = terragen 历史常量（BASE_OFFSET=4 / cont×6 / hills×3 /
 * RIDGE_AMP=26 / TREE_CHANCE=0.009 / 阈值偏移 0），保证旧世界逐位复刻。
 */
export const REGIONS: Readonly<Record<RegionId, RegionDef>> = {
  generic: {
    id: 'generic',
    name: '迷你世界',
    blurb: '经典迷你世界：草原、沙漠与雪原自然分布。',
    mapColor: '#7cb464',
    terrain: {
      baseOffset: 4,
      contAmp: 6,
      hillsAmp: 3,
      ridgeAmp: 26,
      tempBias: 0,
      desertBias: 0,
      snowBias: 0,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: { chance: 0.009, kinds: [{ kind: 'oak', weight: 1 }], onBiomes: ['grass'] },
      structures: [],
    },
    atmosphere: { fogScale: 1 },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 1 },
      { key: 'sheep', weight: 1 },
    ],
    animalGround: ['GRASS'],
  },

  // ---- 六个中国区域（地貌/建筑/动植物/氛围复刻自各地特色）----

  /** 四川：盆地丘陵湿润多水，竹林成片 —— 大熊猫栖息地 */
  sichuan: {
    id: 'sichuan',
    name: '四川',
    blurb: '盆地丘陵，雾气氤氲 · 竹林与熊猫之乡 · 美食：火锅、竹笋',
    mapColor: '#4a8f3c',
    terrain: {
      baseOffset: -2, // 盆地多水
      contAmp: 6,
      hillsAmp: 4,
      ridgeAmp: 14,
      tempBias: 0,
      desertBias: 0,
      snowBias: 0.3, // 湿润：雪线更难触发
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.012,
        kinds: [
          { kind: 'bamboo', weight: 0.7 },
          { kind: 'oak', weight: 0.3 },
        ],
        onBiomes: ['grass'],
      },
      structures: [{ kind: 'house', cellDensity: 0.18 }],
    },
    atmosphere: {
      sky: {
        noon: { top: '#a8c4c0', bottom: '#c8d4cc', fog: '#c8d4cc' }, // 盆地雾气
      },
      fogScale: 0.7,
      waterTint: '#5a7a6a',
    },
    animals: [
      { key: 'pig', weight: 0.35 },
      { key: 'cow', weight: 0.35 },
      { key: 'sheep', weight: 0.3 },
    ],
    animalGround: ['GRASS'],
  },

  /** 北京：华北平原，四合院与红墙黄瓦的帝都气象 */
  beijing: {
    id: 'beijing',
    name: '北京',
    blurb: '华北平原 · 四合院与红墙金瓦 · 美食：烤鸭、糖葫芦',
    mapColor: '#b03a2e',
    terrain: {
      baseOffset: 1,
      contAmp: 4,
      hillsAmp: 2,
      ridgeAmp: 8,
      tempBias: 0,
      desertBias: 0.3, // 干冷：沙漠更难出现
      snowBias: 0.4, // 冬季雪原收紧
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: { chance: 0.007, kinds: [{ kind: 'pagoda', weight: 1 }], onBiomes: ['grass'] },
      structures: [
        { kind: 'siheyuan', cellDensity: 0.22 },
        { kind: 'palace', cellDensity: 0.02 },
      ],
    },
    atmosphere: {
      sky: { noon: { top: '#8fc4f5', bottom: '#c8e0f0', fog: '#c8e0f0' } },
      fogScale: 1,
      waterTint: '#4a7a9a',
    },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 1 },
      { key: 'sheep', weight: 1 },
    ],
    animalGround: ['GRASS'],
  },

  /** 云南：热带山地梯田，傣族竹楼与茶树芭蕉 */
  yunnan: {
    id: 'yunnan',
    name: '云南',
    blurb: '热带山地梯田 · 傣家竹楼、大象与孔雀 · 美食：过桥米线',
    mapColor: '#e67e22',
    terrain: {
      baseOffset: 1,
      contAmp: 6,
      hillsAmp: 3,
      ridgeAmp: 22,
      tempBias: 0.35, // 热带：整体偏暖
      desertBias: 0,
      snowBias: 0,
      terraceStep: 4, // 山地梯田量化
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.011,
        kinds: [
          { kind: 'palm', weight: 0.4 },
          { kind: 'banana', weight: 0.3 },
          { kind: 'tea', weight: 0.3 },
        ],
        onBiomes: ['grass'],
      },
      structures: [{ kind: 'bamboo_house', cellDensity: 0.2 }],
    },
    atmosphere: {
      sky: { noon: { top: '#8fd0c0', bottom: '#d8f0d0', fog: '#d0e8d0' } },
      fogScale: 0.9,
      waterTint: '#3a8a6a',
    },
    animals: [
      { key: 'pig', weight: 0.4 },
      { key: 'cow', weight: 0.3 },
      { key: 'sheep', weight: 0.3 },
    ],
    animalGround: ['GRASS'],
  },

  /** 内蒙古：一马平川的大草原，蒙古包与马群羊群 */
  neimenggu: {
    id: 'neimenggu',
    name: '内蒙古',
    blurb: '辽阔草原 · 蒙古包、马群与羊群 · 美食：烤全羊、奶茶',
    mapColor: '#8fd18f',
    terrain: {
      baseOffset: 1,
      contAmp: 3,
      hillsAmp: 1.5,
      ridgeAmp: 0, // 大平原：无山脊
      tempBias: 0,
      desertBias: 0,
      snowBias: 0,
      forceBiome: 'grass',
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: { chance: 0.0015, kinds: [{ kind: 'oak', weight: 1 }], onBiomes: ['grass'] },
      structures: [{ kind: 'yurt', cellDensity: 0.22 }],
    },
    atmosphere: {
      sky: {
        noon: { top: '#9fd0f0', bottom: '#d8e4e8', fog: '#d8e4e8' }, // 天苍苍野茫茫
      },
      fogScale: 1.15,
      waterTint: '#4a8ab0',
    },
    animals: [
      { key: 'sheep', weight: 0.5 },
      { key: 'cow', weight: 0.3 },
      { key: 'pig', weight: 0.2 },
    ],
    animalGround: ['GRASS'],
  },

  /** 新疆：沙漠与绿洲共存，胡杨与葡萄架 */
  xinjiang: {
    id: 'xinjiang',
    name: '新疆',
    blurb: '大漠孤烟 · 绿洲葡萄架与胡杨 · 美食：羊肉串、哈密瓜、馕',
    mapColor: '#d4b46a',
    terrain: {
      baseOffset: 2,
      contAmp: 4,
      hillsAmp: 3,
      ridgeAmp: 10,
      tempBias: 0.2,
      desertBias: -0.5, // 大面积沙漠，绿洲成噪点
      snowBias: 0,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' }, // 绿洲
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: { chance: 0.004, kinds: [{ kind: 'poplar', weight: 1 }], onBiomes: ['grass'] },
      structures: [{ kind: 'oasis_farm', cellDensity: 0.15 }],
    },
    atmosphere: {
      sky: {
        noon: { top: '#a8d0e8', bottom: '#e0d8b8', fog: '#e0d8b8' }, // 大漠晴空
      },
      fogScale: 1.25,
      waterTint: '#5aa0a8',
    },
    animals: [
      { key: 'sheep', weight: 0.4 },
      { key: 'pig', weight: 0.3 },
      { key: 'cow', weight: 0.3 },
    ],
    animalGround: ['GRASS', 'SAND'], // 骆驼可出没于沙漠
  },

  /** 东北：林海雪原，雪乡木屋，猛虎出没 */
  dongbei: {
    id: 'dongbei',
    name: '东北',
    blurb: '林海雪原 · 雪乡木屋与针叶林 · 美食：冻梨、酸菜 · 猛虎出没',
    mapColor: '#a8d4e8',
    terrain: {
      baseOffset: 1,
      contAmp: 5,
      hillsAmp: 3,
      ridgeAmp: 16,
      tempBias: 0,
      desertBias: 0,
      snowBias: 0,
      forceBiome: 'snow',
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      waterTopBlock: 'ICE', // 湖面结冰
      trees: { chance: 0.014, kinds: [{ kind: 'spruce', weight: 1 }], onBiomes: ['snow'] },
      structures: [{ kind: 'snow_cabin', cellDensity: 0.18 }],
    },
    atmosphere: {
      sky: {
        night: { top: '#0a1220', bottom: '#182030', fog: '#202838' }, // 寒夜深远
      },
      fogScale: 0.85,
      waterTint: '#3a5a7a',
    },
    animals: [
      { key: 'sheep', weight: 0.5 },
      { key: 'pig', weight: 0.3 },
      { key: 'cow', weight: 0.2 },
    ],
    animalGround: ['SNOW', 'GRASS'],
  },
};

// ---------------------------------------------------------------------------
// seed ↔ region 与活动区域状态
// ---------------------------------------------------------------------------

const CN_SEED_PREFIX = /^cn_([a-z]+)_/;

/**
 * seed → 区域 id。无 `cn_` 前缀或未知 id 一律回落 'generic'
 * （旧档兼容的唯一入口；非法值兜底，绝不抛错）。
 */
export function regionIdFromSeed(seed: string): RegionId {
  const m = CN_SEED_PREFIX.exec(seed);
  if (!m) return 'generic';
  const id = m[1] as RegionId;
  return Object.prototype.hasOwnProperty.call(REGIONS, id) ? id : 'generic';
}

/** 选区界面产 seed 的唯一入口（杜绝手拼字符串导致主线程/Worker 区域不一致） */
export function makeSeedForRegion(id: RegionId, rand: string): string {
  return `cn_${id}_${rand}`;
}

let active: { def: RegionDef; rt: ResolvedRegionTerrain } | null = null;

/**
 * 解析 seed 并设置模块级活动区域（预解析方块 id）。
 * 由 terragen.initTerrain 调用；与 NoiseSet 同款「模块级单例」模式，
 * 主线程与 Worker 各自 init 一次即完成区域同步。
 */
export function initRegionFromSeed(seed: string): void {
  const def = REGIONS[regionIdFromSeed(seed)];
  active = { def, rt: resolveTerrain(def.terrain) };
}

/** 当前活动区域定义；未初始化抛错（与 requireNoises 同款防御） */
export function currentRegion(): RegionDef {
  if (!active) throw new Error('regions 未初始化：请先经 initTerrain(seed) 初始化活动区域');
  return active.def;
}

/** 当前活动区域的预解析地形参数（terragen 热路径专用） */
export function currentTerrain(): ResolvedRegionTerrain {
  if (!active) throw new Error('regions 未初始化：请先经 initTerrain(seed) 初始化活动区域');
  return active.rt;
}
