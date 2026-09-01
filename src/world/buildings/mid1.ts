// world/buildings/mid1.ts —— 中南1组结构 stamp（覆盖区域：湖北 / 湖南（parts/mid1））
// W5-A1 实装：
//   - yellow_crane　　　黄鹤楼（蛇山高台基 + 方形五层收分 + 金飞檐檐盘 + 大攒尖葫芦顶，
//     湖北稀有地标，r5）｜特征方块 YELLOW_TILE（五层檐盘 + 檐角上翘 + 攒尖 + 宝顶）
//   - yueyang_pavilion　岳阳楼（纯木三层 + 黄琉璃盔顶，湖南稀有地标，r4）｜
//     特征方块 YELLOW_TILE（盔顶圆盘伞状收分 + 一层黄琉璃门匾）
//   - diaojiaolou　　　 湘西吊脚楼（后半落地 + 前半吊脚架空 + 走栏美人靠 + 歇山翘檐顶，
//     湖南常见、贵州/海南将复用此 kind，r4）｜特征方块 DARK_WOOD（吊脚柱/垫脚/门框大量）
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]（yellow_crane 5 / yueyang_pavilion 4 / diaojiaolou 4）；
// 高度封顶一律 kit.topClamp；输出只经 put 回调；同输入两次 stamp 逐位一致
//（板壁拼色一律 hash2，不接 rng 流）；内部顺序：clearBox → foundation → 墙/顶 → 装饰。
//
// 特征方块锚点（FEATURE_BLOCK 表 + structures.test 断言窗口：锚点 ±2、fy..fy+8）：
//   yellow_crane　　 → YELLOW_TILE（一层檐盘 9×7 在 fy+3，盖住锚点列）
//   yueyang_pavilion → YELLOW_TILE（一层黄琉璃门匾 (ax,fy+2,az+2)，锚点 ±2 窗口内）
//   diaojiaolou　　　→ DARK_WOOD（门框 (ax±1,fy+2..fy+3,az) 显式落块 + 板壁/吊脚柱大量）

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
// yellow_crane 黄鹤楼（湖北稀有地标）—— FOOTPRINT_R 5
// ---------------------------------------------------------------------------

/**
 * 黄鹤楼（蛇山台基形制）：GREY_BRICK 高台基两层（11×11 + 9×9，WHITE_STONE 栏板
 * 南面留豁口 + 南向石阶）→ 方形五层楼体逐层收分（RED_WALL 柱墙 7×5 → 5×5 →
 * 5×3 → 3×3 → 3×3，半宽 3→2→2→1→1；各层净室贯通掏空 + GLOWBLOCK 长明灯 +
 * 南向楼门/窗）→ 每层 YELLOW_TILE 檐盘大出挑（9×7 → 7×7 → 7×5 → 5×5 → 5×5）
 * + 檐角四角各 1 块外挑上翘（黄鹤楼飞檐标志）→ 顶部大攒尖顶（YELLOW_TILE
 * 3×3 盘 + 十字 + 攒尖心层叠收分）+ 葫芦宝顶（YELLOW_TILE/STONE 竖珠 3 段）。
 * 总高 ~23 格（台基 fy-3 至宝顶 fy+23）；水平包络 Chebyshev ≤ 5 = FOOTPRINT_R。
 */
export function stampYellowCrane(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 24); // 葫芦宝顶
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const YT = BLOCK.YELLOW_TILE;
  const GB = BLOCK.GREY_BRICK;
  const WS = BLOCK.WHITE_STONE;
  const RW = BLOCK.RED_WALL;

  /** 台缘栏板环（WHITE_STONE；南面正中留豁口作登楼门道） */
  const parapet = (hx: number, hz: number, y: number): void => {
    for (let x = ax - hx; x <= ax + hx; x++) {
      putC(x, y, az - hz, WS);
      if (Math.abs(x - ax) > 1) putC(x, y, az + hz, WS); // 南面豁口
    }
    for (let z = az - hz; z <= az + hz; z++) {
      putC(ax - hx, y, z, WS);
      putC(ax + hx, y, z, WS);
    }
  };

  // ① 五层净室贯通掏空（楼体通透；墙体/檐盘随后回填）
  clearBox(ax - 2, fy, az - 1, ax + 2, fy + 16, az + 1, put);

  // ② 蛇山高台基两层（11×11 → 9×9）+ 白石栏板（南豁口）+ 南向石阶
  foundation(ax - 5, az - 5, ax + 5, az + 5, fy - 2, GB, heightAt, put);
  slab(ax - 5, az - 5, ax + 5, az + 5, fy - 2, GB, put); // 下层台面
  parapet(5, 5, fy - 1); // 下层栏板
  slab(ax - 4, az - 4, ax + 4, az + 4, fy - 1, GB, put); // 上层台面（一楼地坪）
  parapet(4, 4, fy); // 上层栏板
  foundation(ax - 1, az + 5, ax + 1, az + 5, fy - 2, GB, heightAt, put);
  slab(ax - 1, az + 5, ax + 1, az + 5, fy - 3, GB, put); // 南向石阶

  // ③ 方形五层楼体逐层收分 + 金飞檐（每层檐盘大出挑 + 四檐角上翘）
  const FLOORS: ReadonlyArray<{ readonly hx: number; readonly hz: number; readonly rows: number }> =
    [
      { hx: 3, hz: 2, rows: 3 }, // 一层 7×5
      { hx: 2, hz: 2, rows: 3 }, // 二层 5×5
      { hx: 2, hz: 1, rows: 3 }, // 三层 5×3
      { hx: 1, hz: 1, rows: 2 }, // 四层 3×3
      { hx: 1, hz: 1, rows: 2 }, // 五层 3×3（上承大攒尖）
    ];
  let y = fy;
  for (let f = 0; f < FLOORS.length; f++) {
    const { hx, hz, rows } = FLOORS[f]!;
    wallsRect(ax - hx, az - hz, ax + hx, az + hz, y, y + rows - 1, RW, putC);
    if (f === 0) {
      putC(ax, y, az + hz, BLOCK.AIR); // 南向楼门
      putC(ax, y + 1, az + hz, BLOCK.AIR);
      putC(ax, y + 2, az + hz, BLOCK.RED_DOOR); // 门楣
      putC(ax, y + 2, az, BLOCK.GLOWBLOCK); // 底层长明灯
    } else {
      const wz = az + hz; // 南向窗（宽楼两窗 / 窄楼一窗）
      if (hx >= 2) {
        putC(ax - 1, y + 1, wz, BLOCK.GLASS);
        putC(ax + 1, y + 1, wz, BLOCK.GLASS);
      } else {
        putC(ax, y + 1, wz, BLOCK.GLASS);
      }
      putC(ax, y, az, BLOCK.GLOWBLOCK); // 层内长明灯
    }
    // 檐盘大出挑 + 檐角四角各 1 块外挑上翘（飞檐标志）
    const ey = y + rows;
    const ex = hx + 1;
    const ez = hz + 1;
    slab(ax - ex, az - ez, ax + ex, az + ez, ey, YT, putC);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) putC(ax + sx * ex, ey + 1, az + sz * ez, YT);
    }
    y = ey + 1;
  }

  // ④ 大攒尖顶（YELLOW_TILE 层叠收分：3×3 盘 → 十字 → 攒尖心）
  slab(ax - 1, az - 1, ax + 1, az + 1, y, YT, putC);
  slab(ax - 1, az, ax + 1, az, y + 1, YT, putC);
  slab(ax, az - 1, ax, az + 1, y + 1, YT, putC);
  putC(ax, y + 2, az, YT); // 攒尖心

  // ⑤ 葫芦宝顶（YELLOW_TILE/STONE 竖珠 3 段）
  putC(ax, y + 3, az, YT);
  putC(ax, y + 4, az, BLOCK.STONE);
  putC(ax, y + 5, az, YT);
}

// ---------------------------------------------------------------------------
// yueyang_pavilion 岳阳楼（湖南稀有地标）—— FOOTPRINT_R 4
// ---------------------------------------------------------------------------

/**
 * 岳阳楼（三层纯木 + 黄琉璃盔顶）：GREY_BRICK 台基（9×7 + WHITE_STONE 栏板南豁口
 * + 南向石阶）→ 三层纯木楼体（4 根 DARK_WOOD 通柱贯穿 + 板壁逐层收分
 * 5×5 → 5×3 → 3×3：一层 PLANKS 板壁南向敞廊柱间低栏透空，二层 RED_WALL 板壁
 * GLASS 窗，三层 PLANKS 板壁；每层出挑短檐 DARK_TILE 7×7 → 7×5 → 5×5）→
 * 黄琉璃盔顶（标志）：YELLOW_TILE 圆盘伞状收分 r3 → r2 → r1 呈弧形盔状
 * （外缘翘边 +1 顶起）+ 顶珠 + 顶针。楼中纯木无墙感（柱间透空/低栏）。
 * 总高 ~15 格；水平包络 Chebyshev ≤ 4 = FOOTPRINT_R。
 */
export function stampYueyangPavilion(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 16); // 顶针
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const YT = BLOCK.YELLOW_TILE;
  const GB = BLOCK.GREY_BRICK;
  const WS = BLOCK.WHITE_STONE;
  const DW = BLOCK.DARK_WOOD;
  const DT = BLOCK.DARK_TILE;

  /** 实心圆盘（dx²+dz² ≤ r²）@y（盔顶伞状收分用） */
  const disc = (r: number, y: number, mat: number): void => {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > r * r) continue;
        putC(ax + dx, y, az + dz, mat);
      }
    }
  };

  // ① 三层净室贯通掏空（纯木楼体通透）
  clearBox(ax - 1, fy, az - 1, ax + 1, fy + 9, az + 1, put);

  // ② GREY_BRICK 台基（9×7）+ WHITE_STONE 栏板（南豁口）+ 南向石阶
  foundation(ax - 4, az - 3, ax + 4, az + 3, fy - 1, GB, heightAt, put);
  slab(ax - 4, az - 3, ax + 4, az + 3, fy - 1, GB, put); // 台面（一楼地坪）
  for (let x = ax - 4; x <= ax + 4; x++) {
    putC(x, fy, az - 3, WS);
    if (Math.abs(x - ax) > 1) putC(x, fy, az + 3, WS); // 南面豁口
  }
  for (let z = az - 3; z <= az + 3; z++) {
    putC(ax - 4, fy, z, WS);
    putC(ax + 4, fy, z, WS);
  }
  foundation(ax - 1, az + 4, ax + 1, az + 4, fy - 1, GB, heightAt, put);
  slab(ax - 1, az + 4, ax + 1, az + 4, fy - 2, GB, put); // 南向石阶

  // ③ 三层楼体：板壁逐层收分 + 每层出挑短檐
  // 一层（5×5）：PLANKS 板壁 + 南向楼门 + 黄琉璃门匾（特征锚点）+ 柱间低栏透空
  wallsRect(ax - 2, az - 2, ax + 2, az + 2, fy, fy + 2, BLOCK.PLANKS, putC);
  putC(ax, fy, az + 2, BLOCK.AIR); // 楼门
  putC(ax, fy + 1, az + 2, BLOCK.AIR);
  putC(ax, fy + 2, az + 2, YT); // 黄琉璃门匾
  for (const wx of [ax - 1, ax + 1]) {
    putC(wx, fy, az + 2, BLOCK.PLANKS); // 前檐低栏
    putC(wx, fy + 1, az + 2, BLOCK.AIR); // 柱间透空（纯木无墙感）
  }
  slab(ax - 3, az - 3, ax + 3, az + 3, fy + 3, DT, putC); // 一层短檐 7×7

  // 二层（5×3）：RED_WALL 板壁 + GLASS 窗 + 长明灯（窗取 x=ax：x=±1 是通柱位）
  wallsRect(ax - 2, az - 1, ax + 2, az + 1, fy + 4, fy + 6, BLOCK.RED_WALL, putC);
  putC(ax, fy + 5, az + 1, BLOCK.GLASS);
  putC(ax, fy + 5, az - 1, BLOCK.GLASS);
  putC(ax, fy + 4, az, BLOCK.GLOWBLOCK);
  slab(ax - 3, az - 2, ax + 3, az + 2, fy + 7, DT, putC); // 二层短檐 7×5

  // 三层（3×3）：PLANKS 板壁 + 南窗
  wallsRect(ax - 1, az - 1, ax + 1, az + 1, fy + 8, fy + 9, BLOCK.PLANKS, putC);
  putC(ax, fy + 8, az + 1, BLOCK.GLASS);
  slab(ax - 2, az - 2, ax + 2, az + 2, fy + 10, DT, putC); // 三层短檐 5×5

  // ④ 4 根 DARK_WOOD 通柱（贯穿三层，最后回填保持纯木骨架可见）
  for (const [dx, dz] of [
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ] as const) {
    for (let yy = fy; yy <= fy + 9; yy++) putC(ax + dx, yy, az + dz, DW);
  }

  // ⑤ 黄琉璃盔顶（标志）：圆盘伞状收分 r3 → r2 → r1，外缘翘边 + 顶珠 + 顶针
  disc(3, fy + 11, YT); // 盔顶檐盘（最大）
  disc(2, fy + 12, YT); // 收分
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > 4 && d2 <= 9) putC(ax + dx, fy + 12, az + dz, YT); // 外缘翘边（+1 顶起）
    }
  }
  disc(1, fy + 13, YT); // 圆冠（十字 5 块）
  putC(ax, fy + 14, az, YT); // 顶珠
  putC(ax, fy + 15, az, YT); // 顶针

  // ⑥ 一层长明灯
  putC(ax, fy + 1, az, BLOCK.GLOWBLOCK);
}

// ---------------------------------------------------------------------------
// diaojiaolou 湘西吊脚楼（湖南常见；贵州/海南将复用此 kind）—— FOOTPRINT_R 4
// ---------------------------------------------------------------------------

/**
 * 湘西吊脚楼（L 形错落平面）：后半部落地（DARK_WOOD foundation 垫脚 7×4，
 * x±3 × z az-3..az）+ 前半部吊脚架空（5×3 走栏 x ax-3..ax+1 × z az+1..az+3，
 * 5 根 DARK_WOOD 高柱撑起 3 格、柱间透空可穿行）→ 楼板 PLANKS 满铺（含悬挑）
 * @fy+2 → 板壁墙（PLANKS/DARK_WOOD hash 混砌 高 3，南向 RED 大门洞 + DARK_WOOD
 * 门框 + GLASS 窗）→ 前廊出挑走栏（悬空一侧 PLANKS 矮栏柱 + WOOL 靠椅横栏）→
 * 歇山翘檐顶（DARK_TILE 双坡 + 四檐角上翘 + 正脊两端上翘）→ 拴马环 COBBLE
 * 2 处 + 晒衣竹竿 LOG 横 1 根 + 门前石阶。总高 ~9 格；
 * 水平包络：双坡出挑 ax±4 / 前伸 az+4 → Chebyshev ≤ 4 = FOOTPRINT_R。
 */
export function stampDiaojiaolou(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 9); // 正脊端上翘
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const DW = BLOCK.DARK_WOOD;
  const DT = BLOCK.DARK_TILE;
  const FLOOR = fy + 2; // 楼板层（全楼同一水平）
  // L 形平面：后半部落地 7×4（x±3 × z az-3..az）+ 前半部吊脚走栏 5×3（偏西出挑）
  const rx0 = ax - 3;
  const rx1 = ax + 3;
  const rz0 = az - 3;
  const rz1 = az;
  const fx0 = ax - 3;
  const fx1 = ax + 1;
  const fz0 = az + 1;
  const fz1 = az + 3;

  // ① 室内净空（板壁内；吊脚架空由立柱决定，绝不整片垫实）
  clearBox(ax - 2, FLOOR, az - 2, ax + 2, FLOOR + 2, az - 1, put);

  // ② 后半部落地：DARK_WOOD 垫脚（7×4，随地形垫实）
  foundation(rx0, rz0, rx1, rz1, FLOOR, DW, heightAt, put);

  // ③ 前半部吊脚架空：楼板下净空掏空（坡地自动掏出吊脚层）+
  //    5 根 DARK_WOOD 高柱撑起 3 格（柱间透空可穿行）
  clearBox(fx0, fy, fz0, fx1, FLOOR - 1, fz1, put);
  for (const [px, pz] of [
    [fx0, fz0], [fx1, fz0], [fx0, fz1], [fx1, fz1], [ax - 1, fz1],
  ] as const) {
    const base = Math.min(fy - 1, heightAt(px, pz) + 1); // 柱脚插地（斜坡自动加深）
    for (let yy = base; yy <= FLOOR - 1; yy++) putC(px, yy, pz, DW);
  }

  // ④ 楼板 PLANKS 满铺（后半 7×4 + 前半 5×3，含悬挑部分）
  slab(rx0, rz0, rx1, rz1, FLOOR, BLOCK.PLANKS, put);
  slab(fx0, fz0, fx1, fz1, FLOOR, BLOCK.PLANKS, put);

  // ⑤ 板壁墙（PLANKS/DARK_WOOD hash 混砌 高 3）+ 南向门洞/DARK_WOOD 门框 + 窗
  const wallMat = (x: number, y: number, z: number): number =>
    hash2(x * 7 + y * 13, z * 11 - y * 5) < 0.5 ? BLOCK.PLANKS : DW;
  for (let yy = FLOOR; yy <= FLOOR + 2; yy++) {
    for (let x = rx0; x <= rx1; x++) {
      putC(x, yy, rz0, wallMat(x, yy, rz0)); // 后墙
      putC(x, yy, rz1, wallMat(x, yy, rz1)); // 前墙（面廊）
    }
    for (let z = rz0; z <= rz1; z++) {
      putC(rx0, yy, z, wallMat(rx0, yy, z)); // 西山墙
      putC(rx1, yy, z, wallMat(rx1, yy, z)); // 东山墙
    }
  }
  putC(ax, FLOOR, rz1, BLOCK.AIR); // 门洞
  putC(ax, FLOOR + 1, rz1, BLOCK.AIR);
  for (const wx of [ax - 1, ax + 1]) {
    putC(wx, FLOOR, rz1, DW); // 门框（特征锚点显式落块）
    putC(wx, FLOOR + 1, rz1, DW);
  }
  putC(ax - 1, FLOOR + 1, rz0, BLOCK.GLASS); // 后墙窗
  putC(ax + 1, FLOOR + 1, rz0, BLOCK.GLASS);
  putC(rx0, FLOOR + 1, az - 1, BLOCK.GLASS); // 两山窗
  putC(rx1, FLOOR + 1, az - 1, BLOCK.GLASS);
  putC(ax, FLOOR + 1, az - 1, BLOCK.GLOWBLOCK); // 室内长明灯

  // ⑥ 前廊出挑走栏：悬空一侧 PLANKS 矮栏柱 + WOOL 靠椅横栏（曲线靠椅简化）
  for (let z = fz0; z <= fz1; z++) {
    putC(fx0, FLOOR + 1, z, BLOCK.PLANKS); // 西侧矮栏
    putC(fx1, FLOOR + 1, z, BLOCK.PLANKS); // 东侧矮栏
  }
  for (let x = fx0; x <= fx1; x++) {
    putC(x, FLOOR + 1, fz1, x === fx0 || x === fx1 ? BLOCK.PLANKS : BLOCK.WOOL); // 前沿栏
  }

  // ⑦ 歇山翘檐顶（DARK_TILE 双坡 + 四檐角上翘 + 正脊两端上翘）
  gableRoof(rx0, rx1, az, FLOOR + 5, 3, DT, putC);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) putC(ax + sx * 4, FLOOR + 5, az + sz * 3, DT); // 檐角上翘
    putC(ax + sx * 4, FLOOR + 6, az, DT); // 正脊端上翘
  }

  // ⑧ 拴马环（COBBLE 2 处）+ 晒衣竹竿（LOG 横 1 根）+ 门前石阶
  for (const sx of [-1, 1]) {
    const mx = ax + sx * 4;
    putC(mx, heightAt(mx, az + 2) + 1, az + 2, BLOCK.COBBLE);
  }
  for (let x = ax - 2; x <= ax; x++) putC(x, FLOOR + 1, az + 4, BLOCK.LOG);
  foundation(ax - 2, az + 4, ax, az + 4, FLOOR, BLOCK.COBBLE, heightAt, put);
  slab(ax - 2, az + 4, ax, az + 4, FLOOR - 2, BLOCK.COBBLE, put); // 门前石阶
}
