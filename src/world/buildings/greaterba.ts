// world/buildings/greaterba.ts —— 港澳组结构 stamp（覆盖区域：香港 / 澳门（parts/gangao））
//
// 本文件负责的 StructureKind（4 个；W0d 占位骨架 → W6 实装函数体）：
//   - boc_tower　中银大厦（三棱退台玻璃塔，香港）｜特征方块 GLASS_CURTAIN
//   - hk_tower　高层住宅楼（幕墙玻璃，香港常见）｜特征方块 GLASS_CURTAIN
//   - dasanba　大三巴牌坊（巴洛克石立面+阶梯，澳门）｜特征方块 WHITE_STONE
//   - pastel_house　葡式粉彩小楼（澳门常见）｜特征方块 PASTEL_WALL
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]；高度封顶一律 kit.topClamp；占位体统一转发 kit.stubStamp
//（绝不 throw，且保证落特征方块）。实装时整体替换函数体即可，表/switch 已冻结。

import { BLOCK } from '../../blocks/registry';

import { stubStamp, type StructPut } from './kit';

/** 中银大厦（三棱退台玻璃塔，香港）（W6 实装；当前为占位几何，特征方块 GLASS_CURTAIN） */
export function stampBocTower(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.GLASS_CURTAIN, ax, az, fy, heightAt, put); // TODO(W6): boc_tower 实装
}

/** 高层住宅楼（幕墙玻璃，香港常见）（W6 实装；当前为占位几何，特征方块 GLASS_CURTAIN） */
export function stampHkTower(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.GLASS_CURTAIN, ax, az, fy, heightAt, put); // TODO(W6): hk_tower 实装
}

/** 大三巴牌坊（巴洛克石立面+阶梯，澳门）（W6 实装；当前为占位几何，特征方块 WHITE_STONE） */
export function stampDasanba(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.WHITE_STONE, ax, az, fy, heightAt, put); // TODO(W6): dasanba 实装
}

/** 葡式粉彩小楼（澳门常见）（W6 实装；当前为占位几何，特征方块 PASTEL_WALL） */
export function stampPastelHouse(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.PASTEL_WALL, ax, az, fy, heightAt, put); // TODO(W6): pastel_house 实装
}
