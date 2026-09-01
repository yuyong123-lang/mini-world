// world/buildings/northeast.ts —— 东北组结构 stamp（覆盖区域：黑龙江 / 吉林 / 辽宁（parts/dongbei3））
//
// 本文件负责的 StructureKind（3 个；W0d 占位骨架 → W1 实装函数体）：
//   - sophia_church　圣索菲亚教堂（哈尔滨，红砖墙+绿洋葱穹顶）｜特征方块 RED_BRICK
//   - chaoxian_house　朝鲜族青瓦民居（吉林常见）｜特征方块 DARK_TILE
//   - dazhengdian　沈阳故宫大政殿（八角重檐攒尖，辽宁）｜特征方块 YELLOW_TILE
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]；高度封顶一律 kit.topClamp；占位体统一转发 kit.stubStamp
//（绝不 throw，且保证落特征方块）。实装时整体替换函数体即可，表/switch 已冻结。

import { BLOCK } from '../../blocks/registry';

import { stubStamp, type StructPut } from './kit';

/** 圣索菲亚教堂（哈尔滨，红砖墙+绿洋葱穹顶）（W1 实装；当前为占位几何，特征方块 RED_BRICK） */
export function stampSophiaChurch(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.RED_BRICK, ax, az, fy, heightAt, put); // TODO(W1): sophia_church 实装
}

/** 朝鲜族青瓦民居（吉林常见）（W1 实装；当前为占位几何，特征方块 DARK_TILE） */
export function stampChaoxianHouse(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.DARK_TILE, ax, az, fy, heightAt, put); // TODO(W1): chaoxian_house 实装
}

/** 沈阳故宫大政殿（八角重檐攒尖，辽宁）（W1 实装；当前为占位几何，特征方块 YELLOW_TILE） */
export function stampDazhengdian(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.YELLOW_TILE, ax, az, fy, heightAt, put); // TODO(W1): dazhengdian 实装
}
