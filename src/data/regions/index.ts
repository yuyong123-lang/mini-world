// data/regions/index.ts —— 区域定义与活动区域状态（中国地图选区系统）
// 纯数据 + 纯逻辑：无 three/DOM 依赖，terragen（含 worldgen Worker）/main/UI 三方共用。
//
// 区域如何进入世界生成：seed 采用 `cn_<regionId>_<random>` 格式，
// terragen.initTerrain(seed) 会调 initRegionFromSeed(seed) 把前缀解析成
// 活动区域参数 —— 主线程与 Worker 各自 init 时自然得到同一区域，
// 因此 Worker 协议（GenInitMsg 只带 seed）无需任何改动。
// 旧 seed（无前缀，如 'mini-world-m1'）解析为 'generic'，其地形参数与
// 历史常量逐位一致 → 旧存档读档后地形重生完全不变。
//
// 目录化组织（W0 契约）：本文件是唯一出口（全部类型 + seed 解析 +
// 活动区域状态 + REGIONS 聚合），区域定义按地理分组放在 parts/ 下：
//   parts/legacy.ts   generic + 旧六区（逐字冻结 = 旧档兼容硬底线）
//   parts/dongbei3.ts … parts/gangao.ts  共 14 个地理组（每波次填一个）
// 聚合顺序 =「legacy 在前、组在后」：后面的组可用同 id 条目覆盖 legacy
// 条目——这就是旧区增强机制（W1 起为旧六区追加标志建筑时只改组文件，
// legacy 永远冻结不动）。
//
// 注意：本目录会被 Worker 打包进依赖图，实体相关类型只允许 import type
// （类型擦除），否则会把 physics/DOM 拖进 Worker。

import type { BiomeKind } from '../../world/terragen';
import type { AnimalSpeciesKey } from '../../entities/animals';
import { BlockRegistry } from '../../blocks/registry';

import { legacyRegions } from './parts/legacy';
import { dongbei3Regions } from './parts/dongbei3';
import { jingjinjiRegions } from './parts/jingjinji';
import { huangheRegions } from './parts/huanghe';
import { mengningRegions } from './parts/mengning';
import { xiyuRegions } from './parts/xiyu';
import { zangRegions } from './parts/zang';
import { east1Regions } from './parts/east1';
import { east2Regions } from './parts/east2';
import { mid1Regions } from './parts/mid1';
import { mid2Regions } from './parts/mid2';
import { taiwanRegions } from './parts/taiwan';
import { xinan1Regions } from './parts/xinan1';
import { xinan2Regions } from './parts/xinan2';
import { gangaoRegions } from './parts/gangao';

/**
 * 可选区域 id（36 值 = generic + 旧东北 dongbei + 34 省级行政区）。
 * - 'generic'：无区域旧世界（参数=历史常量，旧档兼容的唯一回落）
 * - 'dongbei'：D5「在表不在图」——表内逐字冻结保证旧 seed/存档不受影响，
 *   但 W0e 起不再给选区图码（东北在选区层拆为黑吉辽三省）
 * - 其余 34 个省级行政区（23 省 + 5 自治区 + 4 直辖市 + 2 特区）；
 *   注意 shaanxi（陕西）与 shanxi（山西）并存
 */
export type RegionId =
  | 'generic'
  | 'dongbei'
  // ---- 直辖市（4）----
  | 'beijing'
  | 'tianjin'
  | 'shanghai'
  | 'chongqing'
  // ---- 省（23）----
  | 'hebei'
  | 'shanxi'
  | 'liaoning'
  | 'jilin'
  | 'heilongjiang'
  | 'jiangsu'
  | 'zhejiang'
  | 'anhui'
  | 'fujian'
  | 'jiangxi'
  | 'shandong'
  | 'henan'
  | 'hubei'
  | 'hunan'
  | 'guangdong'
  | 'hainan'
  | 'sichuan'
  | 'guizhou'
  | 'yunnan'
  | 'shaanxi'
  | 'gansu'
  | 'qinghai'
  | 'taiwan'
  // ---- 自治区（5）----
  | 'neimenggu'
  | 'guangxi'
  | 'xizang'
  | 'ningxia'
  | 'xinjiang'
  // ---- 特别行政区（2）----
  | 'hongkong'
  | 'aomen';

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

/**
 * 区域结构类别：每种对应 structures.ts 里一个 stamp 函数（50 值 = 现有 7 + 新 43）。
 * 注意：structures.ts 的 FOOTPRINT_R / SLOPE_TOLERANCE / KIND_SALT 三张
 * Record<StructureKind,…> 表与 stamp 分发必须对本联合穷举——W0d 结构内核
 * 重构时按计划第三节补齐半径/坡度容差/盐值并落地各 stamp。
 */
export type StructureKind =
  // ---- 既有 7 种（W0 前已上线，几何与盐值冻结）----
  | 'house' // 川西民居
  | 'siheyuan' // 北京四合院
  | 'palace' // 宫殿（红墙黄瓦，稀有）
  | 'bamboo_house' // 傣族竹楼
  | 'yurt' // 蒙古包
  | 'oasis_farm' // 新疆绿洲农庄
  | 'snow_cabin' // 东北雪乡木屋
  // ---- W1 东北 + 京津冀 ----
  | 'sophia_church' // 圣索菲亚教堂（哈尔滨，红砖墙+绿洋葱穹顶）
  | 'chaoxian_house' // 朝鲜族青瓦民居（吉林）
  | 'dazhengdian' // 沈阳故宫大政殿（八角重檐攒尖，辽宁）
  | 'qinianden' // 祈年殿（天坛，圆形三重檐攒尖、蓝琉璃，北京）
  | 'eyed_wheel' // 天津之眼（跨河摩天轮 Ø11 环+辐条+吊舱）
  | 'xiaoyanglou' // 五大道小洋楼（天津常见）
  | 'zhaozhou_bridge' // 赵州桥（敞肩石拱桥，河北）
  // ---- W2 黄河 + 蒙宁 ----
  | 'yingxian_pagoda' // 应县木塔（八角五层木塔，山西）
  | 'confucius_hall' // 孔庙大成殿（重檐歇山，山东）
  | 'seaweed_house' // 胶东海草房（山东常见）
  | 'pagoda_forest' // 少林塔林（一注多小方塔群，河南）
  | 'dayan_pagoda' // 大雁塔（七层方形砖塔，陕西）
  | 'aobao' // 敖包（石堆圆台+旗杆，内蒙古）
  | 'towers_108' // 108塔群（阶梯三角排列白塔，宁夏）
  // ---- W3 西域 + 青藏 ----
  | 'sugong_tower' // 苏公塔（圆柱土黄砖塔+锥顶，新疆）
  | 'jiayuguan' // 嘉峪关（关城城楼+城墙延伸段，甘肃）
  | 'potala' // 布达拉宫（依山白宫+红宫+金顶，西藏）
  | 'zangdiaofang' // 藏式碉房（青海/西藏常见）
  | 'babao_pagodas' // 塔尔寺八宝塔群（一排白塔，青海）
  // ---- W4 华东 ----
  | 'garden_pavilion' // 苏州园林（亭+廊+月洞门+水池，江苏）
  | 'hui_house' // 徽派马头墙民居（安徽）
  | 'tengwang_pavilion' // 滕王阁（多层绿琉璃歇山，江西）
  | 'pearl_tower' // 东方明珠（三球串联塔+天线，上海）
  | 'shikumen' // 石库门（上海常见）
  | 'leifeng_pagoda' // 雷峰塔（八面五层楼阁塔，浙江）
  | 'tulou' // 圆形土楼 Ø15（福建）
  // ---- W5 中南 + 台湾 ----
  | 'yellow_crane' // 黄鹤楼（五层攒尖金飞檐，湖北）
  | 'yueyang_pavilion' // 岳阳楼（三层盔顶，湖南）
  | 'diaojiaolou' // 湘西吊脚楼（湖南/贵州/海南常见）
  | 'canton_tower' // 广州塔（细腰扭转塔，广东）
  | 'qilou' // 骑楼街（广东/海南常见）
  | 'ganlan_house' // 干栏式木楼（广西常见）
  | 'wind_rain_bridge' // 程阳风雨桥（石墩+木廊+桥头亭，广西）
  | 'taipei_101' // 台北101（竹节退台，台湾）
  | 'minnan_house' // 闽南红砖古厝（台湾常见）
  // ---- W6 西南 + 港澳 ----
  | 'leshan_buddha' // 乐山大佛（依山坐佛，四川）
  | 'hongyadong' // 洪崖洞吊脚楼群（依山多层，重庆常见）
  | 'jiefangbei' // 解放碑（碑体简洁，重庆）
  | 'jiaxiu_pavilion' // 甲秀楼（水中石桥+三层三檐四角攒尖，贵州）
  | 'three_pagodas' // 崇圣寺三塔（一主二辅密檐白塔，云南）
  | 'boc_tower' // 中银大厦（三棱退台玻璃塔，香港）
  | 'hk_tower' // 高层住宅楼（幕墙玻璃，香港常见）
  | 'dasanba' // 大三巴牌坊（巴洛克石立面+阶梯，澳门）
  | 'pastel_house'; // 葡式粉彩小楼（澳门常见）

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

/** 地理分组表：parts/<组>.ts 的导出形状（键 = 该组区域 id，值 = 完整定义） */
export type RegionGroup<K extends RegionId = RegionId> = Record<K, RegionDef>;

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
// 区域表（聚合）
// ---------------------------------------------------------------------------

/**
 * 全部区域定义（36 键 = generic + dongbei + 34 省级行政区）。
 * 聚合顺序：legacy 在最前，其后按地理组展开；后面的组若含与 legacy 同 id
 * 的条目即完成「旧区增强覆盖」（当前 beijing/neimenggu/xinjiang/sichuan/
 * yunnan 五个覆盖位暂指向 legacy 同一对象，W1-W6 逐波替换为增强版）。
 * generic 的每个数值 = terragen 历史常量（BASE_OFFSET=4 / cont×6 / hills×3 /
 * RIDGE_AMP=26 / TREE_CHANCE=0.009 / 阈值偏移 0），保证旧世界逐位复刻。
 */
export const REGIONS: Readonly<Record<RegionId, RegionDef>> = {
  ...legacyRegions,
  ...dongbei3Regions,
  ...jingjinjiRegions,
  ...huangheRegions,
  ...mengningRegions,
  ...xiyuRegions,
  ...zangRegions,
  ...east1Regions,
  ...east2Regions,
  ...mid1Regions,
  ...mid2Regions,
  ...taiwanRegions,
  ...xinan1Regions,
  ...xinan2Regions,
  ...gangaoRegions,
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
