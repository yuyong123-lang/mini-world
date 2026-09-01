// world/buildings/mengning.ts —— 蒙宁组结构 stamp（覆盖区域：内蒙古增强 / 宁夏（parts/mengning））
//
// 本文件负责的 StructureKind（2 个；W0d 占位骨架 → W2 实装函数体）：
//   - aobao　敖包（石堆圆台+旗杆，内蒙古）｜特征方块 STONE
//   - towers_108　108塔群（阶梯三角排列白塔，宁夏，r7）｜特征方块 WHITE_STONE
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]；高度封顶一律 kit.topClamp；占位体统一转发 kit.stubStamp
//（绝不 throw，且保证落特征方块）。实装时整体替换函数体即可，表/switch 已冻结。

import { BLOCK } from '../../blocks/registry';

import { stubStamp, type StructPut } from './kit';

/** 敖包（石堆圆台+旗杆，内蒙古）（W2 实装；当前为占位几何，特征方块 STONE） */
export function stampAobao(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.STONE, ax, az, fy, heightAt, put); // TODO(W2): aobao 实装
}

/** 108塔群（阶梯三角排列白塔，宁夏，r7）（W2 实装；当前为占位几何，特征方块 WHITE_STONE） */
export function stampTowers108(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.WHITE_STONE, ax, az, fy, heightAt, put); // TODO(W2): towers_108 实装
}
