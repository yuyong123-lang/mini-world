// world/buildings/tibet.ts —— 藏区组结构 stamp（覆盖区域：西藏 / 青海（parts/zang））
//
// 本文件负责的 StructureKind（3 个；W0d 占位骨架 → W3 实装函数体）：
//   - potala　布达拉宫（依山白宫+红宫+金顶，西藏，r8）｜特征方块 RED_WALL
//   - zangdiaofang　藏式碉房（青海/西藏常见）｜特征方块 GREY_BRICK
//   - babao_pagodas　塔尔寺八宝塔群（一排白塔，青海，r7）｜特征方块 WHITE_STONE
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]；高度封顶一律 kit.topClamp；占位体统一转发 kit.stubStamp
//（绝不 throw，且保证落特征方块）。实装时整体替换函数体即可，表/switch 已冻结。

import { BLOCK } from '../../blocks/registry';

import { stubStamp, type StructPut } from './kit';

/** 布达拉宫（依山白宫+红宫+金顶，西藏，r8）（W3 实装；当前为占位几何，特征方块 RED_WALL） */
export function stampPotala(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.RED_WALL, ax, az, fy, heightAt, put); // TODO(W3): potala 实装
}

/** 藏式碉房（青海/西藏常见）（W3 实装；当前为占位几何，特征方块 GREY_BRICK） */
export function stampZangdiaofang(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.GREY_BRICK, ax, az, fy, heightAt, put); // TODO(W3): zangdiaofang 实装
}

/** 塔尔寺八宝塔群（一排白塔，青海，r7）（W3 实装；当前为占位几何，特征方块 WHITE_STONE） */
export function stampBabaoPagodas(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.WHITE_STONE, ax, az, fy, heightAt, put); // TODO(W3): babao_pagodas 实装
}
