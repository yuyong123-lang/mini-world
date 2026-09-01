// world/buildings/taiwan.ts —— 台湾组结构 stamp（覆盖区域：台湾（parts/taiwan））
//
// 本文件负责的 StructureKind（2 个；W0d 占位骨架 → W5 实装函数体）：
//   - taipei_101　台北101（竹节退台，~28 格）｜特征方块 GLASS_CURTAIN
//   - minnan_house　闽南红砖古厝（台湾常见）｜特征方块 RED_BRICK
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]；高度封顶一律 kit.topClamp；占位体统一转发 kit.stubStamp
//（绝不 throw，且保证落特征方块）。实装时整体替换函数体即可，表/switch 已冻结。

import { BLOCK } from '../../blocks/registry';

import { stubStamp, type StructPut } from './kit';

/** 台北101（竹节退台，~28 格）（W5 实装；当前为占位几何，特征方块 GLASS_CURTAIN） */
export function stampTaipei101(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.GLASS_CURTAIN, ax, az, fy, heightAt, put); // TODO(W5): taipei_101 实装
}

/** 闽南红砖古厝（台湾常见）（W5 实装；当前为占位几何，特征方块 RED_BRICK） */
export function stampMinnanHouse(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.RED_BRICK, ax, az, fy, heightAt, put); // TODO(W5): minnan_house 实装
}
