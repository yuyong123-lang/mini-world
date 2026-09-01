// world/buildings/frontier.ts —— 西域组结构 stamp（覆盖区域：新疆增强 / 甘肃（parts/xiyu））
//
// 本文件负责的 StructureKind（2 个；W0d 占位骨架 → W3 实装函数体）：
//   - sugong_tower　苏公塔（圆柱土黄砖塔+锥顶，新疆）｜特征方块 SANDSTONE
//   - jiayuguan　嘉峪关（关城城楼+城墙延伸段，甘肃，r8）｜特征方块 GREY_BRICK
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]；高度封顶一律 kit.topClamp；占位体统一转发 kit.stubStamp
//（绝不 throw，且保证落特征方块）。实装时整体替换函数体即可，表/switch 已冻结。

import { BLOCK } from '../../blocks/registry';

import { stubStamp, type StructPut } from './kit';

/** 苏公塔（圆柱土黄砖塔+锥顶，新疆）（W3 实装；当前为占位几何，特征方块 SANDSTONE） */
export function stampSugongTower(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.SANDSTONE, ax, az, fy, heightAt, put); // TODO(W3): sugong_tower 实装
}

/** 嘉峪关（关城城楼+城墙延伸段，甘肃，r8）（W3 实装；当前为占位几何，特征方块 GREY_BRICK） */
export function stampJiayuguan(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.GREY_BRICK, ax, az, fy, heightAt, put); // TODO(W3): jiayuguan 实装
}
