// world/structures.ts —— 结构内核（W0d 收缩版，docs/contracts/buildings.md §1，此后冻结）
//
// 职责：STRUCT_CELL / 锚点选点 / 地形校验 / 树压制判定 / 四张 Record 表 /
//       FEATURE_BLOCK / stampStructure switch 分发。几何实现全部外置：
//       terragen.ts → structures.ts → buildings/*（依赖方向禁反转）。
//
// 跨 chunk 一致性设计（与 terragen.stampTree 同一哲学）：
//   结构决策只读 (锚点坐标, 确定性哈希, 地形公式)，绝不读 chunk 数据。
//   每个 chunk 独立重算同一结构 → 落在自己范围内的体素逐位一致。
//
// 锚点选点：世界按 STRUCT_CELL×STRUCT_CELL 粗网格分 cell；
//   hash2(cellX*salt1+kindSalt, cellZ*salt2) < cellDensity 命中 →
//   第二路哈希在 cell 内留足边距取偏移（footprint 必不跨 cell）。
//   每 chunk 只需扫描覆盖自身 ±MAX_STRUCT_RADIUS 的候选 cell。
//
// 本文件不 import terragen（避免循环依赖）：地形高度经 heightAt 回调注入，
// stamp 输出经 put 回调落块（terragen 侧构造只写本 chunk 的闭包）。

import { BLOCK } from '../blocks/registry';
import { SEA_LEVEL } from '../core/constants';
import { hash2 } from '../core/rng';
import type { StructureKind } from '../data/regions';

import {
  stampBambooHouse,
  stampHouse,
  stampOasisFarm,
  stampPalace,
  stampSiheyuan,
  stampSnowCabin,
  stampYurt,
} from './buildings/classic';
import { stampChaoxianHouse, stampDazhengdian, stampSophiaChurch } from './buildings/northeast';
import {
  stampEyedWheel,
  stampQinianden,
  stampXiaoyanglou,
  stampZhaozhouBridge,
} from './buildings/jingjin';
import {
  stampConfuciusHall,
  stampDayanPagoda,
  stampPagodaForest,
  stampSeaweedHouse,
  stampYingxianPagoda,
} from './buildings/huanghe';
import { stampAobao, stampTowers108 } from './buildings/mengning';
import { stampJiayuguan, stampSugongTower } from './buildings/frontier';
import { stampBabaoPagodas, stampPotala, stampZangdiaofang } from './buildings/tibet';
import { stampGardenPavilion, stampHuiHouse, stampTengwangPavilion } from './buildings/east1';
import {
  stampLeifengPagoda,
  stampPearlTower,
  stampShikumen,
  stampTulou,
} from './buildings/east2';
import { stampDiaojiaolou, stampYellowCrane, stampYueyangPavilion } from './buildings/mid1';
import {
  stampCantonTower,
  stampGanlanHouse,
  stampQilou,
  stampWindRainBridge,
} from './buildings/mid2';
import { stampMinnanHouse, stampTaipei101 } from './buildings/taiwan';
import { stampHongyadong, stampJiefangbei, stampLeshanBuddha } from './buildings/xinan1';
import { stampJiaxiuPavilion, stampThreePagodas } from './buildings/xinan2';
import { stampBocTower, stampDasanba, stampHkTower, stampPastelHouse } from './buildings/greaterba';
import { type StructPut } from './buildings/kit';

/** stamp 回调类型（实现在 kit.ts，原 structures.ts 公共面保留） */
export type { StructPut };

/** 结构锚点粗网格边长（格） */
export const STRUCT_CELL = 32;
/**
 * 全部结构 footprint 的最大半径（土楼/嘉峪关/布达拉宫等 r8）。
 * 仅作 terragen cell 扫描边距；结构自身的 cell 内边距见 anchorMargin。
 */
export const MAX_STRUCT_RADIUS = 8;

/**
 * 各结构 footprint 半径（= floor(max(宽,深)/2)，含出挑屋檐/桥墩；上限 8；
 * 地基/树压制/锚点边距以此为准）。旧 7 种 ≤6 逐字冻结（旧档兼容硬底线），
 * 新 44 种见计划第三节；半径 >6 的 kind 靠 anchorMargin 机制保 footprint 不跨 cell。
 */
const FOOTPRINT_R: Readonly<Record<StructureKind, number>> = {
  // ---- 既有 7 种（冻结）----
  house: 4, // 7×5
  siheyuan: 6, // 11×11
  palace: 5, // 9×9
  bamboo_house: 4, // 5×7
  yurt: 3, // 5×5 圆
  oasis_farm: 4, // 6×6
  snow_cabin: 4, // 5×6
  // ---- W1 东北 + 京津冀 ----
  sophia_church: 5,
  chaoxian_house: 4,
  dazhengdian: 5,
  qinianden: 6,
  eyed_wheel: 6,
  xiaoyanglou: 4,
  zhaozhou_bridge: 7,
  // ---- W2 黄河 + 蒙宁 ----
  yingxian_pagoda: 5,
  confucius_hall: 5,
  seaweed_house: 4,
  pagoda_forest: 7,
  dayan_pagoda: 4,
  aobao: 3,
  towers_108: 7,
  // ---- W3 西域 + 青藏 ----
  sugong_tower: 3,
  jiayuguan: 8,
  potala: 8,
  zangdiaofang: 4,
  babao_pagodas: 7,
  // ---- W4 华东 ----
  garden_pavilion: 7,
  hui_house: 4,
  tengwang_pavilion: 5,
  pearl_tower: 5,
  shikumen: 4,
  leifeng_pagoda: 4,
  tulou: 7,
  // ---- W5 中南 + 台湾 ----
  yellow_crane: 5,
  yueyang_pavilion: 4,
  diaojiaolou: 4,
  canton_tower: 4,
  qilou: 5,
  ganlan_house: 4,
  wind_rain_bridge: 8,
  taipei_101: 3,
  minnan_house: 4,
  // ---- W6 西南 + 港澳 ----
  leshan_buddha: 7,
  hongyadong: 7,
  jiefangbei: 3,
  jiaxiu_pavilion: 5,
  three_pagodas: 5,
  boc_tower: 4,
  hk_tower: 4,
  dasanba: 5,
  pastel_house: 4,
};

/**
 * 各结构允许的地形高差（中心 vs 四角）。
 * 默认 2；桥类 3（可跨沟）；依山建筑 3-4（就山势分层）；现代高塔 2（地基整体浇筑）。
 * 旧 7 种逐字冻结。
 */
const SLOPE_TOLERANCE: Readonly<Record<StructureKind, number>> = {
  // ---- 既有 7 种（冻结）----
  house: 2,
  siheyuan: 2,
  palace: 2,
  bamboo_house: 4, // 梯田台阶（4 格）上架空竹柱可落脚
  yurt: 2,
  oasis_farm: 2,
  snow_cabin: 2,
  // ---- 新 44 种（W1-W6 各波按此容差设计几何）----
  sophia_church: 2,
  chaoxian_house: 2,
  dazhengdian: 2,
  qinianden: 2,
  eyed_wheel: 2,
  xiaoyanglou: 2,
  zhaozhou_bridge: 3, // 桥：跨沟谷容差放宽
  yingxian_pagoda: 2,
  confucius_hall: 2,
  seaweed_house: 2,
  pagoda_forest: 2,
  dayan_pagoda: 2,
  aobao: 2,
  towers_108: 2,
  sugong_tower: 2,
  jiayuguan: 3, // 关城依山
  potala: 4, // 依山建筑群
  zangdiaofang: 2,
  babao_pagodas: 2,
  garden_pavilion: 2,
  hui_house: 2,
  tengwang_pavilion: 2,
  pearl_tower: 2,
  shikumen: 2,
  leifeng_pagoda: 2,
  tulou: 2,
  yellow_crane: 2,
  yueyang_pavilion: 2,
  diaojiaolou: 2,
  canton_tower: 2,
  qilou: 2,
  ganlan_house: 2,
  wind_rain_bridge: 3, // 桥：跨沟谷容差放宽
  taipei_101: 2,
  minnan_house: 2,
  leshan_buddha: 3, // 依山凿佛
  hongyadong: 4, // 依山吊脚楼群
  jiefangbei: 2,
  jiaxiu_pavilion: 2,
  three_pagodas: 2,
  boc_tower: 2,
  hk_tower: 2,
  dasanba: 2,
  pastel_house: 2,
};

/** 结构类型哈希盐：不同 kind 在同一 cell 各自独立判定（四合院/宫殿可同 cell 竞争） */
const KIND_SALT: Readonly<Record<StructureKind, number>> = {
  // ---- 既有 7 种（冻结，0x11..0x77）----
  house: 0x11,
  siheyuan: 0x22,
  palace: 0x33,
  bamboo_house: 0x44,
  yurt: 0x55,
  oasis_farm: 0x66,
  snow_cabin: 0x77,
  // ---- 新 44 种（自 0x88 顺延，顺序 = StructureKind 联合分组顺序）----
  // W1 东北 + 京津冀
  sophia_church: 0x88,
  chaoxian_house: 0x89,
  dazhengdian: 0x8a,
  qinianden: 0x8b,
  eyed_wheel: 0x8c,
  xiaoyanglou: 0x8d,
  zhaozhou_bridge: 0x8e,
  // W2 黄河 + 蒙宁
  yingxian_pagoda: 0x8f,
  confucius_hall: 0x90,
  seaweed_house: 0x91,
  pagoda_forest: 0x92,
  dayan_pagoda: 0x93,
  aobao: 0x94,
  towers_108: 0x95,
  // W3 西域 + 青藏
  sugong_tower: 0x96,
  jiayuguan: 0x97,
  potala: 0x98,
  zangdiaofang: 0x99,
  babao_pagodas: 0x9a,
  // W4 华东
  garden_pavilion: 0x9b,
  hui_house: 0x9c,
  tengwang_pavilion: 0x9d,
  pearl_tower: 0x9e,
  shikumen: 0x9f,
  leifeng_pagoda: 0xa0,
  tulou: 0xa1,
  // W5 中南 + 台湾
  yellow_crane: 0xa2,
  yueyang_pavilion: 0xa3,
  diaojiaolou: 0xa4,
  canton_tower: 0xa5,
  qilou: 0xa6,
  ganlan_house: 0xa7,
  wind_rain_bridge: 0xa8,
  taipei_101: 0xa9,
  minnan_house: 0xaa,
  // W6 西南 + 港澳
  leshan_buddha: 0xab,
  hongyadong: 0xac,
  jiefangbei: 0xad,
  jiaxiu_pavilion: 0xae,
  three_pagodas: 0xaf,
  boc_tower: 0xb0,
  hk_tower: 0xb1,
  dasanba: 0xb2,
  pastel_house: 0xb3,
};

/**
 * 各 kind 的特征方块 id：stamp 落块中必须实际包含该方块，
 * structures.test 的「锚点特征方块存在」断言以此为锚（旧 7 种 = 原手写测试表）。
 */
export const FEATURE_BLOCK: Readonly<Record<StructureKind, number>> = {
  // ---- 既有 7 种 ----
  house: BLOCK.GREY_TILE, // 青瓦顶
  siheyuan: BLOCK.GREY_BRICK, // 青砖围墙
  palace: BLOCK.YELLOW_TILE, // 黄琉璃檐
  bamboo_house: BLOCK.BAMBOO_PLANK, // 竹板地板
  yurt: BLOCK.WOOL, // 毡墙
  oasis_farm: BLOCK.GRAPE_VINE, // 葡萄棚
  snow_cabin: BLOCK.SPRUCE_LOG, // 井干木墙
  // ---- W1 东北 + 京津冀 ----
  sophia_church: BLOCK.RED_BRICK,
  chaoxian_house: BLOCK.DARK_TILE,
  dazhengdian: BLOCK.YELLOW_TILE,
  qinianden: BLOCK.BLUE_TILE,
  eyed_wheel: BLOCK.CONCRETE,
  xiaoyanglou: BLOCK.PASTEL_WALL,
  zhaozhou_bridge: BLOCK.WHITE_STONE,
  // ---- W2 黄河 + 蒙宁 ----
  yingxian_pagoda: BLOCK.DARK_WOOD,
  confucius_hall: BLOCK.YELLOW_TILE,
  seaweed_house: BLOCK.THATCH,
  pagoda_forest: BLOCK.GREY_BRICK,
  dayan_pagoda: BLOCK.GREY_BRICK,
  aobao: BLOCK.STONE,
  towers_108: BLOCK.WHITE_STONE,
  // ---- W3 西域 + 青藏 ----
  sugong_tower: BLOCK.SANDSTONE,
  jiayuguan: BLOCK.GREY_BRICK,
  potala: BLOCK.RED_WALL,
  zangdiaofang: BLOCK.GREY_BRICK,
  babao_pagodas: BLOCK.WHITE_STONE,
  // ---- W4 华东 ----
  garden_pavilion: BLOCK.GREY_BRICK,
  hui_house: BLOCK.WHITE_STONE,
  tengwang_pavilion: BLOCK.GREEN_TILE,
  pearl_tower: BLOCK.CONCRETE,
  shikumen: BLOCK.PASTEL_WALL,
  leifeng_pagoda: BLOCK.DARK_TILE,
  tulou: BLOCK.GREY_BRICK,
  // ---- W5 中南 + 台湾 ----
  yellow_crane: BLOCK.YELLOW_TILE,
  yueyang_pavilion: BLOCK.YELLOW_TILE,
  diaojiaolou: BLOCK.DARK_WOOD,
  canton_tower: BLOCK.CONCRETE,
  qilou: BLOCK.RED_BRICK,
  ganlan_house: BLOCK.DARK_WOOD,
  wind_rain_bridge: BLOCK.DARK_WOOD,
  taipei_101: BLOCK.GLASS_CURTAIN,
  minnan_house: BLOCK.RED_BRICK,
  // ---- W6 西南 + 港澳 ----
  leshan_buddha: BLOCK.STONE,
  hongyadong: BLOCK.DARK_WOOD,
  jiefangbei: BLOCK.CONCRETE,
  jiaxiu_pavilion: BLOCK.WHITE_STONE,
  three_pagodas: BLOCK.WHITE_STONE,
  boc_tower: BLOCK.GLASS_CURTAIN,
  hk_tower: BLOCK.GLASS_CURTAIN,
  dasanba: BLOCK.WHITE_STONE,
  pastel_house: BLOCK.PASTEL_WALL,
};

/**
 * cell 内锚点偏移边距 = max(6, footprint 半径)。
 * 旧 kind 半径 ≤6 → 恒 6 → span=20 → 旧世界锚点逐位不变（旧档兼容硬底线）；
 * 大半径 kind（r7/r8）边距=自身半径 → footprint 必不跨 cell，跨 chunk 双算一致。
 */
export function anchorMargin(kind: StructureKind): number {
  return Math.max(6, FOOTPRINT_R[kind]);
}

/**
 * cell 级确定性锚点：hash 密度命中 → cell 内留边距偏移。
 * 返回 null = 该 cell 无此结构。同输入永远同输出（跨 chunk 重算一致的前提）。
 */
export function structureAnchor(
  cellX: number,
  cellZ: number,
  kind: StructureKind,
  density: number,
): { x: number; z: number } | null {
  const s1 = KIND_SALT[kind];
  if (hash2(cellX * 31 + s1, cellZ * 17 - s1) >= density) return null;
  const m = anchorMargin(kind);
  const span = STRUCT_CELL - 2 * m;
  const ox = m + Math.floor(hash2(cellX + 101 + s1, cellZ - 7) * span);
  const oz = m + Math.floor(hash2(cellX - 13, cellZ + 57 + s1) * span);
  return { x: cellX * STRUCT_CELL + ox, z: cellZ * STRUCT_CELL + oz };
}

/**
 * 锚点地形校验：陆上 + footprint 四角与中心高差 ≤ 容差（坡地拒绝，建筑不悬空/不劈山）。
 * heightAt 由调用方注入（= terragen.terrainHeight 的包装，含区域参数）。
 */
export function anchorSuitable(
  a: { x: number; z: number },
  kind: StructureKind,
  heightAt: (x: number, z: number) => number,
): boolean {
  const r = FOOTPRINT_R[kind];
  const tol = SLOPE_TOLERANCE[kind];
  const h0 = heightAt(a.x, a.z);
  if (h0 <= SEA_LEVEL) return false;
  for (const [dx, dz] of [[-r, -r], [r, -r], [-r, r], [r, r]] as const) {
    const h = heightAt(a.x + dx, a.z + dz);
    if (Math.abs(h - h0) > tol) return false;
  }
  return true;
}

/**
 * 列是否落在任一候选结构 footprint（含 1 格余量）内——树压制判定用。
 * 仅在树密度哈希命中后调用（调用方保证），成本可忽略。
 */
export function insideStructureFootprint(
  x: number,
  z: number,
  structures: ReadonlyArray<{ kind: StructureKind; cellDensity: number }>,
): boolean {
  const cellX = Math.floor(x / STRUCT_CELL);
  const cellZ = Math.floor(z / STRUCT_CELL);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (const s of structures) {
        const a = structureAnchor(cellX + dx, cellZ + dz, s.kind, s.cellDensity);
        if (!a) continue;
        const r = FOOTPRINT_R[s.kind] + 1;
        if (Math.abs(x - a.x) <= r && Math.abs(z - a.z) <= r) return true;
      }
    }
  }
  return false;
}

/**
 * 在锚点处 stamp 一座建筑（switch 分发到 buildings/* 的几何实现）。
 * @param fy 地板层 Y（= 锚点地表高 + 1，调用方算好）
 * @param heightAt 地形高度注入（地基垫脚用）
 * @param put 落块回调（overwrite=true 可覆盖树/地形但永不覆盖基岩——terragen 侧保证）
 *
 * stamp 内部约定（契约 §3）：先清出内部空间（AIR, overwrite）→ 地基垫脚 → 墙体/顶
 * → 装饰；高度封顶一律 kit.topClamp。所有几何只依赖 (ax, az, fy) 与 heightAt。
 */
export function stampStructure(
  kind: StructureKind,
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  switch (kind) {
    // ---- 旧 7 种（buildings/classic.ts，几何冻结）----
    case 'house':
      stampHouse(ax, az, fy, heightAt, put);
      break;
    case 'siheyuan':
      stampSiheyuan(ax, az, fy, heightAt, put);
      break;
    case 'palace':
      stampPalace(ax, az, fy, heightAt, put);
      break;
    case 'bamboo_house':
      stampBambooHouse(ax, az, fy, heightAt, put);
      break;
    case 'yurt':
      stampYurt(ax, az, fy, heightAt, put);
      break;
    case 'oasis_farm':
      stampOasisFarm(ax, az, fy, heightAt, put);
      break;
    case 'snow_cabin':
      stampSnowCabin(ax, az, fy, heightAt, put);
      break;
    // ---- W1 东北 ----
    case 'sophia_church':
      stampSophiaChurch(ax, az, fy, heightAt, put);
      break;
    case 'chaoxian_house':
      stampChaoxianHouse(ax, az, fy, heightAt, put);
      break;
    case 'dazhengdian':
      stampDazhengdian(ax, az, fy, heightAt, put);
      break;
    // ---- W1 京津冀 ----
    case 'qinianden':
      stampQinianden(ax, az, fy, heightAt, put);
      break;
    case 'eyed_wheel':
      stampEyedWheel(ax, az, fy, heightAt, put);
      break;
    case 'xiaoyanglou':
      stampXiaoyanglou(ax, az, fy, heightAt, put);
      break;
    case 'zhaozhou_bridge':
      stampZhaozhouBridge(ax, az, fy, heightAt, put);
      break;
    // ---- W2 黄河 ----
    case 'yingxian_pagoda':
      stampYingxianPagoda(ax, az, fy, heightAt, put);
      break;
    case 'confucius_hall':
      stampConfuciusHall(ax, az, fy, heightAt, put);
      break;
    case 'seaweed_house':
      stampSeaweedHouse(ax, az, fy, heightAt, put);
      break;
    case 'pagoda_forest':
      stampPagodaForest(ax, az, fy, heightAt, put);
      break;
    case 'dayan_pagoda':
      stampDayanPagoda(ax, az, fy, heightAt, put);
      break;
    // ---- W2 蒙宁 ----
    case 'aobao':
      stampAobao(ax, az, fy, heightAt, put);
      break;
    case 'towers_108':
      stampTowers108(ax, az, fy, heightAt, put);
      break;
    // ---- W3 西域 ----
    case 'sugong_tower':
      stampSugongTower(ax, az, fy, heightAt, put);
      break;
    case 'jiayuguan':
      stampJiayuguan(ax, az, fy, heightAt, put);
      break;
    // ---- W3 青藏 ----
    case 'potala':
      stampPotala(ax, az, fy, heightAt, put);
      break;
    case 'zangdiaofang':
      stampZangdiaofang(ax, az, fy, heightAt, put);
      break;
    case 'babao_pagodas':
      stampBabaoPagodas(ax, az, fy, heightAt, put);
      break;
    // ---- W4 华东1 ----
    case 'garden_pavilion':
      stampGardenPavilion(ax, az, fy, heightAt, put);
      break;
    case 'hui_house':
      stampHuiHouse(ax, az, fy, heightAt, put);
      break;
    case 'tengwang_pavilion':
      stampTengwangPavilion(ax, az, fy, heightAt, put);
      break;
    // ---- W4 华东2 ----
    case 'pearl_tower':
      stampPearlTower(ax, az, fy, heightAt, put);
      break;
    case 'shikumen':
      stampShikumen(ax, az, fy, heightAt, put);
      break;
    case 'leifeng_pagoda':
      stampLeifengPagoda(ax, az, fy, heightAt, put);
      break;
    case 'tulou':
      stampTulou(ax, az, fy, heightAt, put);
      break;
    // ---- W5 中南1 ----
    case 'yellow_crane':
      stampYellowCrane(ax, az, fy, heightAt, put);
      break;
    case 'yueyang_pavilion':
      stampYueyangPavilion(ax, az, fy, heightAt, put);
      break;
    case 'diaojiaolou':
      stampDiaojiaolou(ax, az, fy, heightAt, put);
      break;
    // ---- W5 中南2 ----
    case 'canton_tower':
      stampCantonTower(ax, az, fy, heightAt, put);
      break;
    case 'qilou':
      stampQilou(ax, az, fy, heightAt, put);
      break;
    case 'ganlan_house':
      stampGanlanHouse(ax, az, fy, heightAt, put);
      break;
    case 'wind_rain_bridge':
      stampWindRainBridge(ax, az, fy, heightAt, put);
      break;
    // ---- W5 台湾 ----
    case 'taipei_101':
      stampTaipei101(ax, az, fy, heightAt, put);
      break;
    case 'minnan_house':
      stampMinnanHouse(ax, az, fy, heightAt, put);
      break;
    // ---- W6 西南1 ----
    case 'leshan_buddha':
      stampLeshanBuddha(ax, az, fy, heightAt, put);
      break;
    case 'hongyadong':
      stampHongyadong(ax, az, fy, heightAt, put);
      break;
    case 'jiefangbei':
      stampJiefangbei(ax, az, fy, heightAt, put);
      break;
    // ---- W6 西南2 ----
    case 'jiaxiu_pavilion':
      stampJiaxiuPavilion(ax, az, fy, heightAt, put);
      break;
    case 'three_pagodas':
      stampThreePagodas(ax, az, fy, heightAt, put);
      break;
    // ---- W6 港澳 ----
    case 'boc_tower':
      stampBocTower(ax, az, fy, heightAt, put);
      break;
    case 'hk_tower':
      stampHkTower(ax, az, fy, heightAt, put);
      break;
    case 'dasanba':
      stampDasanba(ax, az, fy, heightAt, put);
      break;
    case 'pastel_house':
      stampPastelHouse(ax, az, fy, heightAt, put);
      break;
  }
}
