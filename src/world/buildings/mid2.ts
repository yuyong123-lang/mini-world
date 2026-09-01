// world/buildings/mid2.ts —— 中南2组结构 stamp（覆盖区域：广东 / 广西 / 海南（parts/mid2））
//
// 本文件负责的 StructureKind（4 个；W0d 占位骨架 → W5 实装函数体）：
//   - canton_tower　广州塔（细腰扭转塔，广东）｜特征方块 CONCRETE
//   - qilou　骑楼街（广东/海南常见）｜特征方块 RED_BRICK
//   - ganlan_house　干栏式木楼（广西常见）｜特征方块 DARK_WOOD
//   - wind_rain_bridge　程阳风雨桥（石墩+木廊+桥头亭，广西，r8）｜特征方块 DARK_WOOD
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]；高度封顶一律 kit.topClamp；占位体统一转发 kit.stubStamp
//（绝不 throw，且保证落特征方块）。实装时整体替换函数体即可，表/switch 已冻结。

import { BLOCK } from '../../blocks/registry';

import { stubStamp, type StructPut } from './kit';

/** 广州塔（细腰扭转塔，广东）（W5 实装；当前为占位几何，特征方块 CONCRETE） */
export function stampCantonTower(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.CONCRETE, ax, az, fy, heightAt, put); // TODO(W5): canton_tower 实装
}

/** 骑楼街（广东/海南常见）（W5 实装；当前为占位几何，特征方块 RED_BRICK） */
export function stampQilou(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.RED_BRICK, ax, az, fy, heightAt, put); // TODO(W5): qilou 实装
}

/** 干栏式木楼（广西常见）（W5 实装；当前为占位几何，特征方块 DARK_WOOD） */
export function stampGanlanHouse(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.DARK_WOOD, ax, az, fy, heightAt, put); // TODO(W5): ganlan_house 实装
}

/** 程阳风雨桥（石墩+木廊+桥头亭，广西，r8）（W5 实装；当前为占位几何，特征方块 DARK_WOOD） */
export function stampWindRainBridge(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.DARK_WOOD, ax, az, fy, heightAt, put); // TODO(W5): wind_rain_bridge 实装
}
