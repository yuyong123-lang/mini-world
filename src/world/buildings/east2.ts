// world/buildings/east2.ts —— 华东2组结构 stamp（覆盖区域：上海 / 浙江 / 福建（parts/east2））
//
// 本文件负责的 StructureKind（4 个；W0d 占位骨架 → W4 实装函数体）：
//   - pearl_tower　东方明珠（三球串联塔+天线，上海）｜特征方块 CONCRETE
//   - shikumen　石库门（上海常见）｜特征方块 PASTEL_WALL
//   - leifeng_pagoda　雷峰塔（八面五层楼阁塔，浙江）｜特征方块 DARK_TILE
//   - tulou　圆形土楼 Ø15（福建，r7）｜特征方块 GREY_BRICK
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]；高度封顶一律 kit.topClamp；占位体统一转发 kit.stubStamp
//（绝不 throw，且保证落特征方块）。实装时整体替换函数体即可，表/switch 已冻结。

import { BLOCK } from '../../blocks/registry';

import { stubStamp, type StructPut } from './kit';

/** 东方明珠（三球串联塔+天线，上海）（W4 实装；当前为占位几何，特征方块 CONCRETE） */
export function stampPearlTower(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.CONCRETE, ax, az, fy, heightAt, put); // TODO(W4): pearl_tower 实装
}

/** 石库门（上海常见）（W4 实装；当前为占位几何，特征方块 PASTEL_WALL） */
export function stampShikumen(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.PASTEL_WALL, ax, az, fy, heightAt, put); // TODO(W4): shikumen 实装
}

/** 雷峰塔（八面五层楼阁塔，浙江）（W4 实装；当前为占位几何，特征方块 DARK_TILE） */
export function stampLeifengPagoda(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.DARK_TILE, ax, az, fy, heightAt, put); // TODO(W4): leifeng_pagoda 实装
}

/** 圆形土楼 Ø15（福建，r7）（W4 实装；当前为占位几何，特征方块 GREY_BRICK） */
export function stampTulou(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.GREY_BRICK, ax, az, fy, heightAt, put); // TODO(W4): tulou 实装
}
