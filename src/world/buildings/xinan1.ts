// world/buildings/xinan1.ts —— 西南1组结构 stamp（覆盖区域：四川增强 / 重庆（parts/xinan1））
// W6-A1 实装：
//   - leshan_buddha　乐山大佛（依山凿佛：三级台基 + 坐佛 + 九曲栈道，四川稀有，r7）｜
//     特征方块 STONE
//   - hongyadong　　洪崖洞吊脚楼群（依山三层吊脚楼 + 檐下灯笼灯 + 石阶踏道，
//     重庆常见，r7）｜特征方块 DARK_WOOD
//   - jiefangbei　　 解放碑（双层台基 + 碑塔钟面 + 瞭望亭旗杆，重庆稀有，r3）｜
//     特征方块 CONCRETE
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]（leshan_buddha 7 / hongyadong 7 / jiefangbei 3）；高度封顶一律
// kit.topClamp；输出只经 put 回调；同输入两次 stamp 逐位一致（混砌/微差一律
// hash2，不接 rng 流）；内部顺序：clearBox → 地基/台基 → 墙/顶 → 装饰。
//
// 跨 chunk 硬闸（同 potala / pagoda_forest「实心台基」手法）：
//   leshan_buddha → 依山台基满 footprint（锚点 ±7）自地表逐列砌实到所属台面
//   （≥ fy+4 全域实体，三级阶梯只发生在 fy+4 以上）；
//   hongyadong → 依山台基满 footprint 砌实到 fy+4（吊脚柱廊透空只开在台基
//   前檐/两山立面与 fy+5 以上）——任何 chunk 边界穿过建筑时 fy..fy+4 两侧同为
//   实体，双算逐位一致。
//
// 特征方块锚点（FEATURE_BLOCK 表 + structures.test 断言窗口：锚点 ±2、fy..fy+8）：
//   leshan_buddha → STONE（佛座台基在 (ax, fy..fy+6, az) 大量实体）
//   hongyadong　　→ DARK_WOOD（一层吊脚楼角柱 (ax±2, fy+5..fy+7, az+2) + 二层
//   吊脚柱 (ax, fy+5..fy+6, az±1) 显式落块）
//   jiefangbei　　→ CONCRETE（碑塔 3×3 方柱 (ax±1, fy..fy+4, az±1) 实心）

import { BLOCK } from '../../blocks/registry';
import { hash2 } from '../../core/rng';

import {
  clearBox,
  foundation,
  gableRoof,
  slab,
  topClamp,
  wallsRect,
  type HeightAt,
  type StructPut,
} from './kit';

// ---------------------------------------------------------------------------
// leshan_buddha 乐山大佛（四川稀有地标）—— FOOTPRINT_R 7
// ---------------------------------------------------------------------------

/**
 * 乐山大佛（弥勒坐佛，面朝南 z+）：① 依山三级台基——满 footprint（锚点 ±7）
 * 自地表逐列砌实到所属台面（跨 chunk 硬闸对称），南（前）低北（后）高三级：
 * 前坪 fy+4 → 佛座台 fy+6 → 肩后山体 fy+8，南面正中凿三级登台石阶；
 * ② 莲花座双层盘（GREY_BRICK r3 + STONE r2）+ 双脚方足 + 前伸膝盖平台（宽 9）
 * + 胸腹坐躯梯形两层（腹宽 7 → 胸宽 9）+ 双臂斜块抚膝 + 颈肩横带（宽 5）
 * + 佛头（圆盘 r2 双层 + 两耳垂 1×2 + 顶上螺髻 4 块堆）；③ 两侧九曲栈道：
 * DARK_WOOD 窄栈道沿佛体两侧三级之字而下（每级 1 格宽 3 块）+ 栏杆矮柱，
 * 前坪两角石灯（GLOWBLOCK）。总高 ~19 格（台基 fy 至螺髻 fy+18）；
 * 水平包络 Chebyshev ≤ 7 = FOOTPRINT_R。
 */
export function stampLeshanBuddha(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 19); // 螺髻顶
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const ST = BLOCK.STONE;

  /** 实心圆盘（dx²+dz² ≤ r²）@y（佛头/莲花盘） */
  const disc = (cx: number, cz: number, r: number, y: number, mat: number): void => {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > r * r) continue;
        putC(cx + dx, y, cz + dz, mat);
      }
    }
  };

  // ① 依山三级台基：满 footprint 自地表逐列砌实到所属台面（实心 = 跨 chunk 硬闸）
  const terraceTop = (z: number): number =>
    z >= az + 2 ? fy + 4 : z >= az - 3 ? fy + 6 : fy + 8;
  for (let x = ax - 7; x <= ax + 7; x++) {
    for (let z = az - 7; z <= az + 7; z++) {
      const t = terraceTop(z);
      const g = heightAt(x, z);
      for (let y = g + 1; y <= Math.max(t, g); y++) putC(x, y, z, ST);
      if (t > g) putC(x, t, z, ST); // 台面铺装
    }
  }
  // 南面正中三级登台石阶（凿进前坪南缘）
  for (let x = ax - 1; x <= ax + 1; x++) {
    for (const [z, st] of [
      [az + 5, fy + 3],
      [az + 6, fy + 2],
      [az + 7, fy + 1],
    ] as const) {
      const g = heightAt(x, z);
      for (let y = g + 1; y <= st; y++) putC(x, y, z, ST); // 垫实台阶
      for (let y = st + 1; y <= fy + 4; y++) putC(x, y, z, BLOCK.AIR); // 凿净空
    }
  }

  // ② 坐佛（面朝南 z+；全部 STONE）
  // 双脚方足（两个 2×2）
  for (const fx of [ax - 3, ax + 2]) {
    for (let x = fx; x <= fx + 1; x++) {
      for (let z = az + 5; z <= az + 6; z++) {
        putC(x, fy + 5, z, ST);
        putC(x, fy + 6, z, ST);
      }
    }
  }
  // 前伸膝盖平台（宽 9 × 深 4 × 高 2，落在前坪上）
  for (let y = fy + 5; y <= fy + 6; y++) {
    for (let x = ax - 4; x <= ax + 4; x++) {
      for (let z = az + 1; z <= az + 4; z++) putC(x, y, z, ST);
    }
  }
  // 莲花座双层盘（GREY_BRICK r3 → STONE r2，承托坐躯）
  disc(ax, az - 1, 3, fy + 7, BLOCK.GREY_BRICK);
  disc(ax, az - 1, 2, fy + 8, ST);
  // 胸腹坐躯梯形两层：腹宽 7（fy+9..fy+10）→ 胸宽 9（fy+11..fy+12）
  for (let y = fy + 9; y <= fy + 10; y++) {
    for (let x = ax - 3; x <= ax + 3; x++) {
      for (let z = az - 3; z <= az; z++) putC(x, y, z, ST);
    }
  }
  for (let y = fy + 11; y <= fy + 12; y++) {
    for (let x = ax - 4; x <= ax + 4; x++) {
      for (let z = az - 3; z <= az; z++) putC(x, y, z, ST);
    }
  }
  // 双臂斜块抚膝（自胸侧斜落至膝上，手背搭在膝沿）
  for (const s of [-1, 1] as const) {
    putC(ax + s * 4, fy + 11, az + 1, ST);
    putC(ax + s * 4, fy + 10, az + 1, ST);
    putC(ax + s * 4, fy + 9, az + 2, ST);
    putC(ax + s * 4, fy + 8, az + 2, ST);
    putC(ax + s * 3, fy + 7, az + 3, ST); // 手（抚膝）
  }
  // 颈肩横带（宽 5）+ 颈（宽 3）
  for (let x = ax - 2; x <= ax + 2; x++) {
    for (let z = az - 3; z <= az; z++) putC(x, fy + 13, z, ST);
  }
  for (let x = ax - 1; x <= ax + 1; x++) {
    for (const z of [az - 2, az - 1]) putC(x, fy + 14, z, ST);
  }
  // 佛头：圆盘 r2 双层 + 两耳垂 1×2 + 顶上螺髻 4 块堆
  disc(ax, az - 1, 2, fy + 15, ST);
  disc(ax, az - 1, 2, fy + 16, ST);
  for (const s of [-1, 1] as const) {
    putC(ax + s * 3, fy + 15, az - 1, ST); // 垂耳
    putC(ax + s * 3, fy + 16, az - 1, ST);
  }
  putC(ax, fy + 17, az - 1, ST); // 螺髻（4 块小堆）
  putC(ax, fy + 18, az - 1, ST);
  putC(ax - 1, fy + 17, az - 1, ST);
  putC(ax + 1, fy + 17, az - 1, ST);

  // ③ 两侧九曲栈道：DARK_WOOD 窄栈道三级之字而下 + 栏杆矮柱
  for (const s of [-1, 1] as const) {
    // 上折（肩后山体台面 fy+8 之上）
    for (let z = az - 6; z <= az - 4; z++) putC(ax + s * 6, fy + 9, z, BLOCK.DARK_WOOD);
    putC(ax + s * 6, fy + 10, az - 6, BLOCK.DARK_WOOD); // 栏杆矮柱
    putC(ax + s * 6, fy + 10, az - 4, BLOCK.DARK_WOOD);
    // 中折（佛座台面 fy+6 之上，之字内收 1 格）
    for (let z = az - 3; z <= az - 1; z++) putC(ax + s * 5, fy + 7, z, BLOCK.DARK_WOOD);
    putC(ax + s * 5, fy + 8, az - 3, BLOCK.DARK_WOOD);
    putC(ax + s * 5, fy + 8, az - 1, BLOCK.DARK_WOOD);
    // 下折（前坪 fy+4 之上，之字外挑 1 格）
    for (let z = az + 2; z <= az + 4; z++) putC(ax + s * 6, fy + 5, z, BLOCK.DARK_WOOD);
    putC(ax + s * 6, fy + 6, az + 2, BLOCK.DARK_WOOD);
    putC(ax + s * 6, fy + 6, az + 4, BLOCK.DARK_WOOD);
  }

  // ④ 前坪两角石灯（灯坛 + GLOWBLOCK 灯头）
  for (const s of [-1, 1] as const) {
    putC(ax + s * 5, fy + 5, az + 6, ST);
    putC(ax + s * 5, fy + 6, az + 6, BLOCK.GLOWBLOCK);
  }
}

// ---------------------------------------------------------------------------
// hongyadong 洪崖洞吊脚楼群（重庆常见）—— FOOTPRINT_R 7
// ---------------------------------------------------------------------------

/**
 * 洪崖洞吊脚楼群（依山三层，面朝南 z+）：① 依山实心台基——满 footprint（锚点
 * ±7）自地表逐列砌实到 fy+4（STONE/GREY_BRICK 逐块 hash 混砌，跨 chunk 硬闸
 * 对称），台面前檐（z=az+7）与两山（x=ax±7）立面凿出底层吊脚柱廊：DARK_WOOD
 * 吊脚柱（地龙墙位）+ 柱间透空——底层吊脚柱间可穿行；② 三层吊脚楼群逐层后退
 * 抬升（每层 foundation 即台面 + 层间 DARK_WOOD 吊脚柱架空）：一层三栋（x 错落
 * 三单元，PLANKS/RED_WALL 板壁 + DARK_WOOD 角柱）、二层两栋、顶层一栋主楼稍大
 * （5×4）；每层歇山翘檐顶（DARK_TILE 双坡出挑 + 四檐角上翘，参考 diaojiaolou
 * 手法）错落；③ 檐下成排灯笼灯（GLOWBLOCK 每层檐口一排 3~5 盏，洪崖洞夜景
 * 标志）+ 楼内长明灯；④ 层间石阶踏道贯通（西麓外廊 STONE 直上，DARK_WOOD
 * 扶手矮柱）。总高 ~16 格；水平包络 Chebyshev ≤ 7 = FOOTPRINT_R。
 */
export function stampHongyadong(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 16); // 顶层正脊
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const DW = BLOCK.DARK_WOOD;
  const DT = BLOCK.DARK_TILE;

  /** 板壁混砌：PLANKS / RED_WALL 逐块确定性 hash 二选一 */
  const wallMat = (x: number, y: number, z: number): number =>
    hash2(x * 7 + y * 13, z * 11 - y * 5) < 0.55 ? BLOCK.PLANKS : BLOCK.RED_WALL;
  /** 一栋板壁房：四壁 hash 混砌 + DARK_WOOD 角柱（y0..y1） */
  const boxWalls = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): void => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        putC(x, y, z0, wallMat(x, y, z0));
        putC(x, y, z1, wallMat(x, y, z1));
      }
      for (let z = z0; z <= z1; z++) {
        putC(x0, y, z, wallMat(x0, y, z));
        putC(x1, y, z, wallMat(x1, y, z));
      }
    }
    for (const [px, pz] of [
      [x0, z0], [x1, z0], [x0, z1], [x1, z1],
    ] as const) {
      for (let y = y0; y <= y1; y++) putC(px, y, pz, DW); // 角柱（特征锚点显式落块）
    }
  };
  /** 石阶踏道：阶梯块 + 阶下填实 + DARK_WOOD 扶手矮柱 */
  const step = (x: number, z: number, ry: number, from: number): void => {
    for (let y = from; y <= ry; y++) putC(x, y, z, BLOCK.STONE);
    putC(x + 1, ry + 1, z, DW); // 扶手矮柱
  };

  // ① 依山实心台基（满 footprint 砌实到 fy+4 —— 跨 chunk 硬闸对称）
  const baseMat = (x: number, y: number, z: number): number =>
    hash2(x * 3 + y * 7, z * 5 - y * 11) < 0.55 ? BLOCK.STONE : BLOCK.GREY_BRICK;
  for (let x = ax - 7; x <= ax + 7; x++) {
    for (let z = az - 7; z <= az + 7; z++) {
      const g = heightAt(x, z);
      for (let y = g + 1; y <= Math.max(fy + 4, g); y++) putC(x, y, z, baseMat(x, y, z));
      if (fy + 4 > g) putC(x, fy + 4, z, BLOCK.STONE); // 台面铺装
    }
  }

  // ② 底层吊脚柱廊：前檐（z=az+7）与两山（x=ax±7）立面凿透空 + DARK_WOOD 吊脚柱
  const frontCols = [ax - 6, ax - 3, ax, ax + 3, ax + 6];
  for (const px of frontCols) {
    const g = heightAt(px, az + 7);
    for (let y = g + 1; y <= fy + 3; y++) putC(px, y, az + 7, DW); // 吊脚柱（插地）
  }
  for (let x = ax - 7; x <= ax + 7; x++) {
    if (frontCols.includes(x)) continue;
    for (let y = fy; y <= fy + 3; y++) putC(x, y, az + 7, BLOCK.AIR); // 柱间透空
  }
  for (const s of [-1, 1] as const) {
    const sideCols = [az - 5, az - 2, az + 1, az + 4];
    for (const pz of sideCols) {
      const g = heightAt(ax + s * 7, pz);
      for (let y = g + 1; y <= fy + 3; y++) putC(ax + s * 7, y, pz, DW);
    }
    for (let z = az - 7; z <= az + 7; z++) {
      if (sideCols.includes(z)) continue;
      for (let y = fy; y <= fy + 3; y++) putC(ax + s * 7, y, z, BLOCK.AIR);
    }
  }
  // 柱廊灯（吊脚柱头 GLOWBLOCK 两盏）
  putC(ax - 3, fy + 3, az + 7, BLOCK.GLOWBLOCK);
  putC(ax + 3, fy + 3, az + 7, BLOCK.GLOWBLOCK);

  // ---- 一层吊脚楼群（台面 fy+4，三单元沿 x 错落，z az+2..az+6）----
  // 净空先掏（板壁内）
  clearBox(ax - 5, fy + 5, az + 3, ax - 4, fy + 7, az + 5, put);
  clearBox(ax - 1, fy + 5, az + 3, ax + 1, fy + 7, az + 5, put);
  clearBox(ax + 4, fy + 5, az + 3, ax + 5, fy + 7, az + 5, put);
  const T1_UNITS: ReadonlyArray<{ readonly x0: number; readonly x1: number; readonly door: number }> = [
    { x0: ax - 6, x1: ax - 3, door: ax - 5 },
    { x0: ax - 2, x1: ax + 2, door: ax },
    { x0: ax + 3, x1: ax + 6, door: ax + 5 },
  ];
  for (const u of T1_UNITS) {
    boxWalls(u.x0, az + 2, u.x1, az + 6, fy + 5, fy + 7);
    putC(u.door, fy + 5, az + 6, BLOCK.AIR); // 南向门洞
    putC(u.door, fy + 6, az + 6, BLOCK.AIR);
    putC(u.door - 1, fy + 5, az + 6, DW); // DARK_WOOD 门框
    putC(u.door - 1, fy + 6, az + 6, DW);
    putC(u.door + 1, fy + 5, az + 6, DW);
    putC(u.door + 1, fy + 6, az + 6, DW);
    putC(u.door, fy + 5, az + 4, BLOCK.GLOWBLOCK); // 楼内长明灯
    // 歇山翘檐顶：双坡出挑 + 四檐角上翘（檐口正好压在墙顶行，出挑 1 格）
    gableRoof(u.x0, u.x1, az + 4, fy + 9, 3, DT, putC);
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) putC(sx < 0 ? u.x0 - 1 : u.x1 + 1, fy + 7, az + 4 + sz * 3, DT);
    }
  }
  // 后墙窗（GLASS）
  putC(ax - 4, fy + 6, az + 2, BLOCK.GLASS);
  putC(ax + 4, fy + 6, az + 2, BLOCK.GLASS);
  putC(ax - 6, fy + 6, az + 4, BLOCK.GLASS);
  putC(ax + 6, fy + 6, az + 4, BLOCK.GLASS);
  // 檐下成排灯笼灯（一层檐口 5 盏）
  for (const lx of [ax - 4, ax - 2, ax, ax + 2, ax + 4]) putC(lx, fy + 7, az + 6, BLOCK.GLOWBLOCK);

  // ---- 二层吊脚楼（台面 fy+7 = DARK_WOOD 吊脚柱架空，两单元，z az-3..az+1）----
  for (const px of [ax - 4, ax, ax + 4]) {
    for (const pz of [az - 3, az + 1]) {
      for (let y = fy + 5; y <= fy + 6; y++) putC(px, y, pz, DW); // 吊脚柱
    }
  }
  slab(ax - 6, az - 3, ax + 6, az + 1, fy + 7, BLOCK.PLANKS, put); // 悬挑楼板
  clearBox(ax - 4, fy + 8, az - 2, ax - 2, fy + 10, az, put);
  clearBox(ax + 2, fy + 8, az - 2, ax + 4, fy + 10, az, put);
  const T2_UNITS: ReadonlyArray<{ readonly x0: number; readonly x1: number; readonly door: number }> = [
    { x0: ax - 5, x1: ax - 1, door: ax - 3 },
    { x0: ax + 1, x1: ax + 5, door: ax + 3 },
  ];
  for (const u of T2_UNITS) {
    boxWalls(u.x0, az - 3, u.x1, az + 1, fy + 8, fy + 10);
    putC(u.door, fy + 8, az + 1, BLOCK.AIR);
    putC(u.door, fy + 9, az + 1, BLOCK.AIR);
    putC(u.door - 1, fy + 8, az + 1, DW);
    putC(u.door + 1, fy + 8, az + 1, DW);
    putC(u.door, fy + 8, az, BLOCK.GLOWBLOCK);
    gableRoof(u.x0, u.x1, az - 1, fy + 12, 3, DT, putC);
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) putC(sx < 0 ? u.x0 - 1 : u.x1 + 1, fy + 10, az - 1 + sz * 3, DT);
    }
  }
  // 檐下成排灯笼灯（二层檐口 4 盏）
  for (const lx of [ax - 4, ax - 2, ax + 2, ax + 4]) putC(lx, fy + 10, az + 1, BLOCK.GLOWBLOCK);

  // ---- 顶层主楼（稍大 5×4，台面 fy+10 = 吊脚柱架空，z az-7..az-4）----
  for (const px of [ax - 4, ax, ax + 4]) {
    for (const pz of [az - 7, az - 4]) {
      for (let y = fy + 8; y <= fy + 9; y++) putC(px, y, pz, DW); // 吊脚柱
    }
  }
  slab(ax - 6, az - 7, ax + 6, az - 4, fy + 10, BLOCK.PLANKS, put); // 悬挑楼板
  clearBox(ax - 1, fy + 11, az - 6, ax + 1, fy + 13, az - 5, put);
  boxWalls(ax - 2, az - 7, ax + 2, az - 4, fy + 11, fy + 13);
  putC(ax, fy + 11, az - 4, BLOCK.AIR); // 主楼南门
  putC(ax, fy + 12, az - 4, BLOCK.AIR);
  putC(ax - 1, fy + 11, az - 4, DW);
  putC(ax + 1, fy + 11, az - 4, DW);
  putC(ax, fy + 11, az - 6, BLOCK.GLOWBLOCK); // 楼内长明灯
  gableRoof(ax - 2, ax + 2, az - 5, fy + 15, 2, DT, putC);
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) putC(ax + sx * 3, fy + 14, az - 5 + sz * 2, DT);
  }
  // 檐下成排灯笼灯（顶层檐口 3 盏）
  for (const lx of [ax - 2, ax, ax + 2]) putC(lx, fy + 13, az - 4, BLOCK.GLOWBLOCK);

  // ---- 层间石阶踏道（西麓外廊 STONE 直上贯通三层）----
  step(ax - 7, az + 4, fy + 5, fy + 5);
  step(ax - 7, az + 3, fy + 6, fy + 5);
  step(ax - 7, az + 2, fy + 7, fy + 5); // 登二层（楼板 fy+7）
  step(ax - 7, az - 2, fy + 8, fy + 8);
  step(ax - 7, az - 3, fy + 9, fy + 8);
  step(ax - 7, az - 4, fy + 10, fy + 8); // 登顶层（楼板 fy+10）
}

// ---------------------------------------------------------------------------
// jiefangbei 解放碑（重庆稀有地标）—— FOOTPRINT_R 3
// ---------------------------------------------------------------------------

/**
 * 解放碑（碑体简洁，抗战胜利纪功碑形制）：① STONE 台基两层（7×7 → 5×5，随地形
 * 垫脚）+ WHITE_STONE 栏板两环（南面正中留豁口作入口）+ 南向两级踏步（凿进台基
 * 南缘，包络不出 ±3）；② 碑塔：CONCRETE 方柱 3×3 实心 8 层 → 十字收分段
 * （2×2 收分）3 层 → 碑刹 1×1，高 12；中段（fy+5）四面各嵌 1 块 DARK_TILE
 * 「钟面」（同层四方各一）；③ 顶部瞭望亭（3×3 矮亭南向门 + CONCRETE 顶）+
 * 旗杆竖 2；④ 正面底层门洞嵌 RED_DOOR 双块 + 券顶石带（碑体实心不凿空）。
 * 总高 ~17 格（台面 fy-2 至旗杆顶 fy+16）；水平包络 Chebyshev ≤ 3 = FOOTPRINT_R。
 */
export function stampJiefangbei(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 17); // 旗杆顶
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const CON = BLOCK.CONCRETE;
  const ST = BLOCK.STONE;
  const WS = BLOCK.WHITE_STONE;

  /** 栏板环（半环 hx：|dx|,|dz| ≤ hx 的边缘一圈；南面正中留豁口） */
  const parapet = (hx: number, y: number): void => {
    for (let x = ax - hx; x <= ax + hx; x++) {
      putC(x, y, az - hx, WS);
      if (Math.abs(x - ax) > 1) putC(x, y, az + hx, WS); // 南面豁口
    }
    for (let z = az - hx + 1; z <= az + hx - 1; z++) {
      putC(ax - hx, y, z, WS);
      putC(ax + hx, y, z, WS);
    }
  };

  // ① 台基两层 + 白石栏板（南豁口）+ 南向两级踏步
  foundation(ax - 3, az - 3, ax + 3, az + 3, fy - 2, ST, heightAt, put);
  slab(ax - 3, az - 3, ax + 3, az + 3, fy - 2, ST, put); // 下层台面
  parapet(3, fy - 1); // 下层栏板
  slab(ax - 2, az - 2, ax + 2, az + 2, fy - 1, ST, put); // 上层台面
  parapet(2, fy); // 上层栏板
  for (let x = ax - 1; x <= ax + 1; x++) {
    putC(x, fy - 3, az + 3, ST); // 第一级踏步
    for (let y = fy - 2; y <= fy - 1; y++) putC(x, y, az + 3, BLOCK.AIR); // 凿净空
    putC(x, fy - 2, az + 2, ST); // 第二级踏步
    putC(x, fy - 1, az + 2, BLOCK.AIR);
  }

  // ② 碑塔：CONCRETE 方柱 3×3 实心（fy..fy+7）→ 十字收分（fy+8..fy+10）→ 碑刹
  for (let y = fy; y <= fy + 7; y++) {
    for (let x = ax - 1; x <= ax + 1; x++) {
      for (let z = az - 1; z <= az + 1; z++) putC(x, y, z, CON);
    }
  }
  for (let y = fy + 8; y <= fy + 10; y++) {
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      putC(ax + dx, y, az + dz, CON);
    }
  }
  putC(ax, fy + 11, az, CON); // 碑刹
  // 中段四面钟面（DARK_TILE 同层四方各 1）
  putC(ax, fy + 5, az + 1, BLOCK.DARK_TILE);
  putC(ax, fy + 5, az - 1, BLOCK.DARK_TILE);
  putC(ax + 1, fy + 5, az, BLOCK.DARK_TILE);
  putC(ax - 1, fy + 5, az, BLOCK.DARK_TILE);

  // ③ 顶部瞭望亭（3×3 矮亭 + CONCRETE 顶）+ 旗杆竖 2
  wallsRect(ax - 1, az - 1, ax + 1, az + 1, fy + 12, fy + 13, CON, putC);
  putC(ax, fy + 12, az + 1, BLOCK.AIR); // 亭南门
  slab(ax - 1, az - 1, ax + 1, az + 1, fy + 14, CON, putC); // 亭顶
  putC(ax, fy + 15, az, CON); // 旗杆竖 2
  putC(ax, fy + 16, az, CON);

  // ④ 正面底层门洞：RED_DOOR 双块 + 券顶石带（碑体实心，不凿空）
  putC(ax, fy, az + 1, BLOCK.RED_DOOR);
  putC(ax, fy + 1, az + 1, BLOCK.RED_DOOR);
  for (let x = ax - 1; x <= ax + 1; x++) putC(x, fy + 2, az + 1, CON); // 券顶石带
}
