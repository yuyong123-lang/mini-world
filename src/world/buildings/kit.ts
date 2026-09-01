// world/buildings/kit.ts —— 结构几何公共工具（契约 docs/contracts/buildings.md §2，冻结）
//
// 前 5 个工具（foundation/clearBox/wallsRect/slab/gableRoof）自 structures.ts 原样迁出
// （签名/实现逐字不变）；后 5 个为 W0 新增；stubStamp 为新 kind 占位几何。
//
// 铁律（§3）：只依赖参数与 put 回调——绝不读 chunk、绝不 import three / DOM /
// terragen / regions 的运行时值（buildings/*.ts 在 worldgen Worker 内运行）。
// 地形高度经 heightAt 回调注入；输出只经 StructPut 回调落块。

import { BLOCK } from '../../blocks/registry';

/** stamp 回调：只写本 chunk 的落块闭包由 terragen 构造注入 */
export type StructPut = (
  wx: number,
  y: number,
  wz: number,
  id: number,
  overwrite: boolean,
) => void;

/** heightAt 注入类型（= terragen.terrainHeight 的包装，含区域参数） */
export type HeightAt = (x: number, z: number) => number;

/** 地基：[x0..x1]×[z0..z1] 每列从地表垫到地板层下沿（斜坡自动垫脚） */
export function foundation(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  fy: number,
  mat: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  for (let wx = x0; wx <= x1; wx++) {
    for (let wz = z0; wz <= z1; wz++) {
      const ch = heightAt(wx, wz);
      for (let y = ch + 1; y < fy; y++) put(wx, y, wz, mat, true);
    }
  }
}

/** 清空长方体区域（内部空间；永不动基岩——put 侧保证） */
export function clearBox(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  put: StructPut,
): void {
  for (let wx = x0; wx <= x1; wx++) {
    for (let y = y0; y <= y1; y++) {
      for (let wz = z0; wz <= z1; wz++) put(wx, y, wz, BLOCK.AIR, true);
    }
  }
}

/** 空心墙：矩形四边 [y0..y1] 层（不含内部） */
export function wallsRect(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y0: number,
  y1: number,
  mat: number,
  put: StructPut,
): void {
  for (let y = y0; y <= y1; y++) {
    for (let wx = x0; wx <= x1; wx++) {
      put(wx, y, z0, mat, true);
      put(wx, y, z1, mat, true);
    }
    for (let wz = z0; wz <= z1; wz++) {
      put(x0, y, wz, mat, true);
      put(x1, y, wz, mat, true);
    }
  }
}

/** 实心平板（屋顶/地板）：[x0..x1]×[z0..z1] @y */
export function slab(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  mat: number,
  put: StructPut,
): void {
  for (let wx = x0; wx <= x1; wx++) {
    for (let wz = z0; wz <= z1; wz++) put(wx, y, wz, mat, true);
  }
}

/** 双坡屋顶：沿 X 轴屋脊，两侧逐行外挑下探（zFrom→zTo 向两侧） */
export function gableRoof(
  x0: number,
  x1: number,
  ridgeZ: number,
  baseY: number,
  halfDepth: number,
  mat: number,
  put: StructPut,
): void {
  for (let d = 0; d <= halfDepth; d++) {
    slab(x0 - (d > 0 ? 1 : 0), ridgeZ - d, x1 + (d > 0 ? 1 : 0), ridgeZ - d, baseY - d, mat, put);
    slab(x0 - (d > 0 ? 1 : 0), ridgeZ + d, x1 + (d > 0 ? 1 : 0), ridgeZ + d, baseY - d, mat, put);
  }
}

// ---------------------------------------------------------------------------
// W0 新增工具
// ---------------------------------------------------------------------------

/** 顶高钳制：min(fy+h, 62)（WORLD_H−2），防高塔削顶；新 stamp 高度封顶一律走它 */
export function topClamp(fy: number, h: number): number {
  return Math.min(fy + h, 62);
}

/** 四坡/攒尖顶：方形逐层内收下探（庑殿/攒尖/盔顶的基形；已收至一点则止） */
export function hipRoof(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  baseY: number,
  mat: number,
  put: StructPut,
): void {
  for (let d = 0; x0 + d <= x1 - d && z0 + d <= z1 - d; d++) {
    slab(x0 + d, z0 + d, x1 - d, z1 - d, baseY - d, mat, put);
  }
}

/** 圆环墙：以 (cx,cz) 为心、半径 r 的圆环（厚约 1.5 格），[y0..y1] 层（土楼/敖包/塔身） */
export function ringWall(
  cx: number,
  cz: number,
  r: number,
  y0: number,
  y1: number,
  mat: number,
  put: StructPut,
): void {
  const ri = Math.max(0, r - 1.6); // 内径（r<2 时近似实心圆台）
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) === r && Math.abs(dz) === r) continue; // 去四角（同树冠/蒙古包轮廓）
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r || d2 < ri * ri) continue;
      for (let y = y0; y <= y1; y++) put(cx + dx, y, cz + dz, mat, true);
    }
  }
}

/** 方形退台塔身：floors 层、每层 3 格高，半径自 r 逐层收 shrink（楼阁塔/竹节塔基形） */
export function steppedTower(
  cx: number,
  cz: number,
  r: number,
  baseY: number,
  floors: number,
  shrink: number,
  mat: number,
  put: StructPut,
): void {
  const FLOOR_H = 3;
  for (let f = 0; f < floors; f++) {
    const rr = r - f * shrink;
    if (rr < 1) break;
    const y0 = baseY + f * FLOOR_H;
    const y1 = y0 + FLOOR_H - 1;
    wallsRect(cx - rr, cz - rr, cx + rr, cz + rr, y0, y1, mat, put);
    slab(cx - rr, cz - rr, cx + rr, cz + rr, y1, mat, put); // 层檐/楼板
  }
}

/** 拱券/桥洞：在墙面 z 上沿 x0..x1 落半圆拱券石（mat），并清出拱下净空（城门洞/桥洞） */
export function arch(
  x0: number,
  x1: number,
  y: number,
  z: number,
  mat: number,
  put: StructPut,
): void {
  const r = (x1 - x0) / 2;
  const mid = x0 + r;
  for (let x = x0; x <= x1; x++) {
    const dx = Math.abs(x - mid);
    const top = Math.round(Math.sqrt(Math.max(0, r * r - dx * dx)));
    put(x, y + top, z, mat, true); // 券顶石
    if (dx >= r - 1) {
      put(x, y, z, mat, true); // 拱脚
      put(x, y + 1, z, mat, true);
    }
    for (let yy = y; yy < y + top; yy++) put(x, yy, z, BLOCK.AIR, true); // 净空
  }
}

// ---------------------------------------------------------------------------
// 占位几何（W1-W6 各波实装前的保险兜底）
// ---------------------------------------------------------------------------

/**
 * 极简占位 stamp：3×3 石台 + LOG 旗杆 + 特征方块旗（featureBlock）。
 * 新区域 def 当前 structures 为空数组 → 正常生成流不会走到这里；万一被调
 * （配置失误/测试探针）也绝不 throw，且保证落一个特征方块供断言命中。
 * 各组 stamp 占位体统一转发本函数，W1-W6 实装时整体替换函数体。
 */
export function stubStamp(
  featureBlock: number,
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  foundation(ax - 1, az - 1, ax + 1, az + 1, fy, BLOCK.STONE, heightAt, put);
  slab(ax - 1, az - 1, ax + 1, az + 1, fy, BLOCK.STONE, put);
  const top = topClamp(fy, 4);
  for (let y = fy + 1; y <= top; y++) put(ax, y, az, BLOCK.LOG, true);
  put(ax, top + 1, az, featureBlock, true);
}
