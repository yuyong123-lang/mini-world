// world/buildings/huanghe.ts —— 黄河组结构 stamp（覆盖区域：山西 / 山东 / 河南 / 陕西（parts/huanghe））
//
// 本文件负责的 StructureKind（5 个；W0d 占位骨架 → W2 实装函数体）：
//   - yingxian_pagoda　应县木塔（八角五层木塔，山西）｜特征方块 DARK_WOOD
//   - confucius_hall　孔庙大成殿（重檐歇山，山东）｜特征方块 YELLOW_TILE
//   - seaweed_house　胶东海草房（山东常见）｜特征方块 THATCH
//   - pagoda_forest　少林塔林（一注多小方塔群，河南，r7）｜特征方块 GREY_BRICK
//   - dayan_pagoda　大雁塔（七层方形砖塔，陕西）｜特征方块 GREY_BRICK
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]；高度封顶一律 kit.topClamp；占位体统一转发 kit.stubStamp
//（绝不 throw，且保证落特征方块）。实装时整体替换函数体即可，表/switch 已冻结。

import { BLOCK } from '../../blocks/registry';

import { stubStamp, type StructPut } from './kit';

/** 应县木塔（八角五层木塔，山西）（W2 实装；当前为占位几何，特征方块 DARK_WOOD） */
export function stampYingxianPagoda(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.DARK_WOOD, ax, az, fy, heightAt, put); // TODO(W2): yingxian_pagoda 实装
}

/** 孔庙大成殿（重檐歇山，山东）（W2 实装；当前为占位几何，特征方块 YELLOW_TILE） */
export function stampConfuciusHall(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.YELLOW_TILE, ax, az, fy, heightAt, put); // TODO(W2): confucius_hall 实装
}

/** 胶东海草房（山东常见）（W2 实装；当前为占位几何，特征方块 THATCH） */
export function stampSeaweedHouse(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.THATCH, ax, az, fy, heightAt, put); // TODO(W2): seaweed_house 实装
}

/** 少林塔林（一注多小方塔群，河南，r7）（W2 实装；当前为占位几何，特征方块 GREY_BRICK） */
export function stampPagodaForest(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.GREY_BRICK, ax, az, fy, heightAt, put); // TODO(W2): pagoda_forest 实装
}

/** 大雁塔（七层方形砖塔，陕西）（W2 实装；当前为占位几何，特征方块 GREY_BRICK） */
export function stampDayanPagoda(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.GREY_BRICK, ax, az, fy, heightAt, put); // TODO(W2): dayan_pagoda 实装
}
