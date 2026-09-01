// world/buildings/xinan1.ts —— 西南1组结构 stamp（覆盖区域：四川增强 / 重庆（parts/xinan1））
//
// 本文件负责的 StructureKind（3 个；W0d 占位骨架 → W6 实装函数体）：
//   - leshan_buddha　乐山大佛（依山坐佛，四川，r7）｜特征方块 STONE
//   - hongyadong　洪崖洞吊脚楼群（依山多层，重庆常见，r7）｜特征方块 DARK_WOOD
//   - jiefangbei　解放碑（碑体简洁，重庆）｜特征方块 CONCRETE
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]；高度封顶一律 kit.topClamp；占位体统一转发 kit.stubStamp
//（绝不 throw，且保证落特征方块）。实装时整体替换函数体即可，表/switch 已冻结。

import { BLOCK } from '../../blocks/registry';

import { stubStamp, type StructPut } from './kit';

/** 乐山大佛（依山坐佛，四川，r7）（W6 实装；当前为占位几何，特征方块 STONE） */
export function stampLeshanBuddha(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.STONE, ax, az, fy, heightAt, put); // TODO(W6): leshan_buddha 实装
}

/** 洪崖洞吊脚楼群（依山多层，重庆常见，r7）（W6 实装；当前为占位几何，特征方块 DARK_WOOD） */
export function stampHongyadong(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.DARK_WOOD, ax, az, fy, heightAt, put); // TODO(W6): hongyadong 实装
}

/** 解放碑（碑体简洁，重庆）（W6 实装；当前为占位几何，特征方块 CONCRETE） */
export function stampJiefangbei(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.CONCRETE, ax, az, fy, heightAt, put); // TODO(W6): jiefangbei 实装
}
