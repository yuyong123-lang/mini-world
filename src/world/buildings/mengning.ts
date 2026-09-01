// world/buildings/mengning.ts —— 蒙宁组结构 stamp（覆盖区域：内蒙古增强 / 宁夏（parts/mengning））
//
// 本文件负责的 StructureKind（2 个）：
//   - aobao　敖包（石堆圆台+旗杆，内蒙古，r3）｜特征方块 STONE
//   - towers_108　108塔群（阶梯三角排列白塔，宁夏，r7）｜特征方块 WHITE_STONE
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]（aobao 3 / towers_108 7）；高度封顶一律 kit.topClamp；输出只经
// put 回调；同输入两次 stamp 逐位一致（内部"随机"一律 hash2，不接 rng 流）。

import { BLOCK } from '../../blocks/registry';
import { hash2 } from '../../core/rng';

import { ringWall, topClamp, type HeightAt, type StructPut } from './kit';

// ---------------------------------------------------------------------------
// aobao —— 敖包（内蒙古稀有地标，r3）
// ---------------------------------------------------------------------------

/**
 * 敖包：石堆圆台 + 经杆彩旗。r3 石堆基座（自地表垫起，斜坡自动垫脚）→
 * r2/r1 逐层收分到台顶（STONE 主体混 COBBLE 拼色，逐块确定性 hash 二选一
 * 营造石堆质感）；基座外缘一圈 COBBLE 矮石栏（东南留 3 格缺口为出入口）；
 * 台顶中心 LOG 经杆竖 5 格，杆顶压 1 块 STONE 石帽，四向斜挂确定性配色彩旗
 * （白哈达 WOOL / 红 RED_WALL / 黄 YELLOW_TILE / 蓝 BLUE_TILE，各向 1-2 块）。
 * 总高 ~9 格（石帽 fy+8）。
 */
export function stampAobao(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 9);
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  /** 石堆拼色块：STONE 主体混 COBBLE（逐块确定性 hash 二选一） */
  const cairn = (x: number, y: number, z: number): void => {
    putC(x, y, z, hash2(x * 5 + y * 11, z * 7 - y * 3) < 0.6 ? BLOCK.STONE : BLOCK.COBBLE);
  };
  /** 实心圆盘一层：以 (ax,az) 为心、半径 r @ y */
  const disc = (r: number, y: number): void => {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > r * r) continue;
        cairn(ax + dx, y, az + dz);
      }
    }
  };

  // ---- r3 石堆基座（自地表垫到 fy，斜坡自动垫脚）----
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      if (dx * dx + dz * dz > 9) continue;
      const wx = ax + dx;
      const wz = az + dz;
      const ch = heightAt(wx, wz);
      for (let y = ch + 1; y <= fy; y++) cairn(wx, y, wz);
    }
  }

  // ---- 基座矮石栏（COBBLE 一圈，东南留缺口）→ 先落栏挖缺口，再堆台心不伤洞 ----
  ringWall(ax, az, 3, fy + 1, fy + 1, BLOCK.COBBLE, put);
  for (const [gx, gz] of [[2, 1], [1, 2], [2, 2]] as const) putC(ax + gx, fy + 1, az + gz, BLOCK.AIR);

  // ---- 石堆收分：r2 → r1 台顶 ----
  disc(2, fy + 1);
  disc(1, fy + 2);

  // ---- 中心经杆（LOG 竖 5 格自台顶）+ 杆顶石帽 ----
  for (let y = fy + 3; y <= fy + 7; y++) putC(ax, y, az, BLOCK.LOG);
  putC(ax, fy + 8, az, BLOCK.STONE);

  // ---- 杆顶四向彩旗（确定性 hash 配色，各向 1-2 块斜下挂）----
  const FLAGS = [BLOCK.WOOL, BLOCK.RED_WALL, BLOCK.YELLOW_TILE, BLOCK.BLUE_TILE];
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const flag = FLAGS[Math.floor(hash2(ax + dx * 17 + 3, az + dz * 23 - 5) * 4)]!;
    putC(ax + dx, fy + 7, az + dz, flag); // 挂杆顶
    if (hash2(ax + dx * 29 - 1, az + dz * 31 + 7) < 0.5) {
      putC(ax + dx, fy + 6, az + dz, flag); // 斜下垂块（约半数方向）
    }
  }
}

// ---------------------------------------------------------------------------
// towers_108 —— 108塔群（宁夏稀有地标，r7）
// ---------------------------------------------------------------------------

/**
 * 108塔群（青铜峡）：阶梯三角排列白塔群，布阵朝南展开——北端 apex 单塔居
 * 高（第 r 行 y 抬升 = 6-r，依山阶梯感），南端前排最宽（11 塔），7 行行距
 * Δz=2。塔距压缩为 Δx=1 以把整阵收进 r7 footprint（15×15：塔身/树冠/台阶
 * 均 |d| ≤ 7），行宽 1,3,5,7,9,11,11 共 47 座 → 中轴 6 座让位给 STONE 中央
 * 台阶步道，实落 41 座（108 的体素压缩版）。每塔：WHITE_STONE 圆柱（ringWall
 * r1 十字形削圆）高 3 + 尖顶（1 层收分）+ 鎏金塔珠 1 块；每塔独立用
 * heightAt(x,z)+1 落地（公式铁律，绝不取绝对 y）。阵前左右各一棵常青
 * （SPRUCE_LEAVES 小冠）。塔数标定：每塔恰 1 块 YELLOW_TILE 塔珠。
 */
export function stampTowers108(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 16);
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const WS = BLOCK.WHITE_STONE;

  /** 单座白塔：plus 形塔身高 3 + 尖顶 1 层收分 + 塔珠；heightAt 落地 + 行抬升 */
  const stupa = (tx: number, tz: number, lift: number): void => {
    const y0 = heightAt(tx, tz) + 1 + lift;
    ringWall(tx, tz, 1, y0, y0 + 2, WS, putC); // 塔身（十字形 3×3 削圆）
    putC(tx, y0 + 3, tz, WS); // 尖顶（收分）
    putC(tx, y0 + 4, tz, BLOCK.YELLOW_TILE); // 塔珠（鎏金）
  };

  // ---- 塔阵：7 行（dz = -6+2r），行宽 1,3,5,7,9,11,11，行抬升 6-r（北高南低）----
  for (let r = 0; r <= 6; r++) {
    const dz = -6 + 2 * r;
    const lift = 6 - r;
    const half = r >= 5 ? 5 : r; // 末两行截为 11 塔，前排两角让给常青
    for (let dx = -half; dx <= half; dx++) {
      if (dx === 0 && r >= 1) continue; // 中轴让位给台阶步道
      stupa(ax + dx, az + dz, lift);
    }
  }

  // ---- 中央台阶步道（STONE）：中轴逐级抬升直通 apex 塔下 ----
  for (let r = 1; r <= 6; r++) {
    const wz = az - 6 + 2 * r;
    const g = heightAt(ax, wz) + 1;
    const stepTop = heightAt(ax, wz) + 1 + (6 - r) + 2; // 与该行塔面等高
    for (let y = g; y <= stepTop; y++) putC(ax, y, wz, BLOCK.STONE);
  }

  // ---- 阵前列双常青（前排两角外 SPRUCE_LEAVES 小冠）----
  for (const s of [-1, 1]) {
    const tx = ax + s * 6;
    const tz = az + 7;
    const g = heightAt(tx, tz) + 1;
    putC(tx, g, tz, BLOCK.SPRUCE_LOG);
    putC(tx, g + 1, tz, BLOCK.SPRUCE_LEAVES);
    putC(tx, g + 2, tz, BLOCK.SPRUCE_LEAVES);
    putC(tx, g + 3, tz, BLOCK.SPRUCE_LEAVES);
  }
}
