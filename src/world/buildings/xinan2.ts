// world/buildings/xinan2.ts —— 西南2组结构 stamp（覆盖区域：贵州 / 云南增强（parts/xinan2））
//
// 本文件负责的 StructureKind（2 个；W0d 占位骨架 → W6 实装函数体）：
//   - jiaxiu_pavilion　甲秀楼（水中石桥+三层三檐四角攒尖，贵州）｜特征方块 WHITE_STONE
//   - three_pagodas　崇圣寺三塔（一主二辅密檐白塔，云南）｜特征方块 WHITE_STONE
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]；高度封顶一律 kit.topClamp；占位体统一转发 kit.stubStamp
//（绝不 throw，且保证落特征方块）。实装时整体替换函数体即可，表/switch 已冻结。

import { BLOCK } from '../../blocks/registry';

import { stubStamp, type StructPut } from './kit';

/** 甲秀楼（水中石桥+三层三檐四角攒尖，贵州）（W6 实装；当前为占位几何，特征方块 WHITE_STONE） */
export function stampJiaxiuPavilion(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.WHITE_STONE, ax, az, fy, heightAt, put); // TODO(W6): jiaxiu_pavilion 实装
}

/** 崇圣寺三塔（一主二辅密檐白塔，云南）（W6 实装；当前为占位几何，特征方块 WHITE_STONE） */
export function stampThreePagodas(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.WHITE_STONE, ax, az, fy, heightAt, put); // TODO(W6): three_pagodas 实装
}
