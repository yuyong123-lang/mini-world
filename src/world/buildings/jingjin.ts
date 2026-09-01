// world/buildings/jingjin.ts —— 京津冀组结构 stamp（覆盖区域：北京增强 / 天津 / 河北（parts/jingjinji））
//
// 本文件负责的 StructureKind（4 个；W0d 占位骨架 → W1 实装函数体）：
//   - qinianden　天坛祈年殿（圆形三重檐攒尖、蓝琉璃，北京）｜特征方块 BLUE_TILE
//   - eyed_wheel　天津之眼（跨河摩天轮 Ø11 环+辐条+吊舱）｜特征方块 CONCRETE
//   - xiaoyanglou　五大道小洋楼（天津常见）｜特征方块 PASTEL_WALL
//   - zhaozhou_bridge　赵州桥（敞肩石拱桥，河北，r7）｜特征方块 WHITE_STONE
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]；高度封顶一律 kit.topClamp；占位体统一转发 kit.stubStamp
//（绝不 throw，且保证落特征方块）。实装时整体替换函数体即可，表/switch 已冻结。

import { BLOCK } from '../../blocks/registry';

import { stubStamp, type StructPut } from './kit';

/** 天坛祈年殿（圆形三重檐攒尖、蓝琉璃，北京）（W1 实装；当前为占位几何，特征方块 BLUE_TILE） */
export function stampQinianden(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.BLUE_TILE, ax, az, fy, heightAt, put); // TODO(W1): qinianden 实装
}

/** 天津之眼（跨河摩天轮 Ø11 环+辐条+吊舱）（W1 实装；当前为占位几何，特征方块 CONCRETE） */
export function stampEyedWheel(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.CONCRETE, ax, az, fy, heightAt, put); // TODO(W1): eyed_wheel 实装
}

/** 五大道小洋楼（天津常见）（W1 实装；当前为占位几何，特征方块 PASTEL_WALL） */
export function stampXiaoyanglou(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.PASTEL_WALL, ax, az, fy, heightAt, put); // TODO(W1): xiaoyanglou 实装
}

/** 赵州桥（敞肩石拱桥，河北，r7）（W1 实装；当前为占位几何，特征方块 WHITE_STONE） */
export function stampZhaozhouBridge(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  stubStamp(BLOCK.WHITE_STONE, ax, az, fy, heightAt, put); // TODO(W1): zhaozhou_bridge 实装
}
