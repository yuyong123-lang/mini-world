// world/buildings/east1.ts —— 华东1组结构 stamp（覆盖区域：江苏 / 安徽 / 江西（parts/east1））
//
// 本文件负责的 StructureKind（3 个；W0d 占位骨架 → W4 实装函数体）：
//   - garden_pavilion　苏州园林（亭+廊+月洞门+水池，江苏，r7）｜特征方块 GREY_BRICK
//   - hui_house　徽派马头墙民居（安徽）｜特征方块 WHITE_STONE
//   - tengwang_pavilion　滕王阁（多层绿琉璃歇山，江西）｜特征方块 GREEN_TILE
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]；高度封顶一律 kit.topClamp；占位体统一转发 kit.stubStamp
//（绝不 throw，且保证落特征方块）。实装时整体替换函数体即可，表/switch 已冻结。

import { BLOCK } from '../../blocks/registry';

import { stubStamp, type StructPut } from './kit';

/** 苏州园林（亭+廊+月洞门+水池，江苏，r7）（W4 实装；当前为占位几何，特征方块 GREY_BRICK） */
export function stampGardenPavilion(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.GREY_BRICK, ax, az, fy, heightAt, put); // TODO(W4): garden_pavilion 实装
}

/** 徽派马头墙民居（安徽）（W4 实装；当前为占位几何，特征方块 WHITE_STONE） */
export function stampHuiHouse(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.WHITE_STONE, ax, az, fy, heightAt, put); // TODO(W4): hui_house 实装
}

/** 滕王阁（多层绿琉璃歇山，江西）（W4 实装；当前为占位几何，特征方块 GREEN_TILE） */
export function stampTengwangPavilion(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.GREEN_TILE, ax, az, fy, heightAt, put); // TODO(W4): tengwang_pavilion 实装
}
