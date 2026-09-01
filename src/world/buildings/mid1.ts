// world/buildings/mid1.ts —— 中南1组结构 stamp（覆盖区域：湖北 / 湖南（parts/mid1））
//
// 本文件负责的 StructureKind（3 个；W0d 占位骨架 → W5 实装函数体）：
//   - yellow_crane　黄鹤楼（五层攒尖金飞檐，湖北）｜特征方块 YELLOW_TILE
//   - yueyang_pavilion　岳阳楼（三层盔顶，湖南）｜特征方块 YELLOW_TILE
//   - diaojiaolou　湘西吊脚楼（湖南/贵州/海南常见）｜特征方块 DARK_WOOD
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]；高度封顶一律 kit.topClamp；占位体统一转发 kit.stubStamp
//（绝不 throw，且保证落特征方块）。实装时整体替换函数体即可，表/switch 已冻结。

import { BLOCK } from '../../blocks/registry';

import { stubStamp, type StructPut } from './kit';

/** 黄鹤楼（五层攒尖金飞檐，湖北）（W5 实装；当前为占位几何，特征方块 YELLOW_TILE） */
export function stampYellowCrane(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.YELLOW_TILE, ax, az, fy, heightAt, put); // TODO(W5): yellow_crane 实装
}

/** 岳阳楼（三层盔顶，湖南）（W5 实装；当前为占位几何，特征方块 YELLOW_TILE） */
export function stampYueyangPavilion(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.YELLOW_TILE, ax, az, fy, heightAt, put); // TODO(W5): yueyang_pavilion 实装
}

/** 湘西吊脚楼（湖南/贵州/海南常见）（W5 实装；当前为占位几何，特征方块 DARK_WOOD） */
export function stampDiaojiaolou(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.DARK_WOOD, ax, az, fy, heightAt, put); // TODO(W5): diaojiaolou 实装
}
