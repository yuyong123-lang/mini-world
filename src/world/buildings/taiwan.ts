// world/buildings/taiwan.ts —— 台湾组结构 stamp（覆盖区域：台湾（parts/taiwan））
// W5-A3 实装：
//   - taipei_101　台北101（竹节式退台高层 + 绿色如意裙边 + 锥形尖顶天线，台北，r3）
//     ｜特征方块 GLASS_CURTAIN
//   - minnan_house　闽南红砖古厝（红砖墙身 + 双坡红瓦顶 + 燕尾脊/马背脊 + 石板埕，
//     台湾常见）｜特征方块 RED_BRICK
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]（taipei_101 3 / minnan_house 4）；高度封顶一律 kit.topClamp；
// 输出只经 put 回调；同输入两次 stamp 逐位一致（拼色一律 hash2，不接 rng 流）；
// 内部顺序：clearBox → foundation → 墙/顶 → 装饰。
//
// 特征方块锚点（FEATURE_BLOCK 表 + structures.test 断言窗口：锚点 ±2、fy..fy+8）：
//   taipei_101   → GLASS_CURTAIN（基座裙楼幕墙立面 (ax±2.., fy..fy+1, az±3)，窗口正中）
//   minnan_house → RED_BRICK（红砖墙身南立面 (ax, fy..fy+2, az+1)，窗口正中）

import { BLOCK } from '../../blocks/registry';
import { hash2 } from '../../core/rng';

import {
  clearBox,
  foundation,
  gableRoof,
  slab,
  topClamp,
  type HeightAt,
  type StructPut,
} from './kit';

// ---------------------------------------------------------------------------
// taipei_101 台北101（台北稀有地标）—— FOOTPRINT_R 3
// ---------------------------------------------------------------------------

/**
 * 台北101（竹节式退台摩天楼）：STONE 整片广场垫脚（7×7，r3 满包络）→ 基座
 * 裙楼两层（7×7 幕墙外壳、5×5 室内商场中庭：GLASS_CURTAIN 幕墙 + CONCRETE
 * 角柱/竖梃分格 + 南向门洞，压顶 = 首节楼板 CONCRETE 满铺）→ 竹节式塔身 8 节
 * （每节 3 格高、宽 7→7→6→6→5→5→4→4 逐节收缩：幕墙立面竖梃分格 + 每节顶
 * CONCRETE 压顶楼板 + GREEN_TILE 如意裙边外翻 1 格环带（宽钳到 7 = 包络内，
 * 翠绿装饰层盖在下节收进的墙身上））→ 锥形收分尖顶（GREEN_TILE 3×3 →
 * CONCRETE 2×2 → GREEN_TILE 顶珠）→ 天线杆 CONCRETE 竖 3。中央 CONCRETE
 * 核心筒立柱贯通（电梯/结构核心），室内每 3 格一层楼板。总高 ~31 格
 * （topClamp(fy,31)）；水平包络：全部件（含外翻裙边）Chebyshev ≤ 3 = FOOTPRINT_R。
 */
export function stampTaipei101(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 31); // 天线杆顶
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  /** 偶数宽的左上基准：x0 = 心 − ceil((w−1)/2)（向 −x/−z 偏半格，包络对称取整） */
  const x0of = (w: number): number => ax - Math.ceil((w - 1) / 2);
  const z0of = (w: number): number => az - Math.ceil((w - 1) / 2);

  /**
   * 幕墙立面：[x0..x1]×[z0..z1] 外圈 [y0..y1] 层——四角 CONCRETE 角柱 +
   * 沿边隔格 CONCRETE 竖梃，其余 GLASS_CURTAIN 幕墙分格（101 的竖条立面）
   */
  const curtain = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): void => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const ex = x === x0 || x === x1;
          const ez = z === z0 || z === z1;
          if (!ex && !ez) continue; // 只砌外圈
          const corner = ex && ez;
          const mullion =
            (ez && (x - x0) % 2 === 0) || (ex && (z - z0) % 2 === 0); // 竖梃分格
          const mat = corner || mullion ? BLOCK.CONCRETE : BLOCK.GLASS_CURTAIN;
          putC(x, y, z, mat);
        }
      }
    }
  };
  /** 矩形边框环带（如意裙边/压顶圈） */
  const ring = (x0: number, z0: number, x1: number, z1: number, y: number, mat: number): void => {
    for (let x = x0; x <= x1; x++) {
      putC(x, y, z0, mat);
      putC(x, y, z1, mat);
    }
    for (let z = z0; z <= z1; z++) {
      putC(x0, y, z, mat);
      putC(x1, y, z, mat);
    }
  };

  // ① 塔身/裙楼室内先掏空（5×5 中庭直通塔顶；幕墙/楼板/核心筒随后回填）
  clearBox(ax - 2, fy, az - 2, ax + 2, fy + 25, az + 2, put);

  // ② 基座广场：7×7 STONE 随地形垫脚 + fy-1 铺装层
  foundation(ax - 3, az - 3, ax + 3, az + 3, fy, BLOCK.STONE, heightAt, put);
  slab(ax - 3, az - 3, ax + 3, az + 3, fy - 1, BLOCK.STONE, put);

  // ③ 基座裙楼两层（7×7 幕墙外壳、5×5 室内商场中庭）+ 南向门洞 + 中庭长明灯
  const px0 = x0of(7);
  const pz0 = z0of(7);
  curtain(px0, pz0, px0 + 6, pz0 + 6, fy, fy + 1);
  putC(ax, fy, az + 3, BLOCK.AIR); // 商场南向门洞（1×2）
  putC(ax, fy + 1, az + 3, BLOCK.AIR);
  putC(ax - 1, fy + 1, az - 1, BLOCK.GLOWBLOCK);

  // ④ 竹节式塔身 8 节（每节 3 格高：幕墙 2 格 + 压顶楼板/裙边 1 格）
  const SEG_W = [7, 7, 6, 6, 5, 5, 4, 4] as const; // 底节 7×7 → 顶节 4×4 逐节收缩
  for (let i = 0; i < SEG_W.length; i++) {
    const w = SEG_W[i]!;
    const x0 = x0of(w);
    const z0 = z0of(w);
    const x1 = x0 + w - 1;
    const z1 = z0 + w - 1;
    const y0 = fy + 2 + i * 3;
    curtain(x0, z0, x1, z1, y0, y0 + 1); // 幕墙立面（竖梃分格）
    slab(x0, z0, x1, z1, y0 + 2, BLOCK.CONCRETE, put); // 压顶楼板（兼上一节天面）
    // 绿色如意裙边：外翻 1 格环带（宽钳到 7 → 始终 Chebyshev ≤ 3 = 包络内）
    const cw = Math.min(w + 2, 7);
    const cx0 = x0of(cw);
    const cz0 = z0of(cw);
    ring(cx0, cz0, cx0 + cw - 1, cz0 + cw - 1, y0 + 2, BLOCK.GREEN_TILE);
  }

  // ⑤ 中央核心筒（CONCRETE，结构/电梯核心；保中心列贯通到底）
  for (let y = fy; y <= fy + 25; y++) putC(ax, y, az, BLOCK.CONCRETE);

  // ⑥ 锥形收分尖顶（GREEN_TILE 3×3 → CONCRETE 2×2 → GREEN_TILE 顶珠）
  slab(ax - 1, az - 1, ax + 1, az + 1, fy + 26, BLOCK.GREEN_TILE, put);
  slab(ax - 1, az - 1, ax, az, fy + 27, BLOCK.CONCRETE, put);
  putC(ax, fy + 28, az, BLOCK.GREEN_TILE);

  // ⑦ 天线杆（CONCRETE 竖 3）
  for (let y = fy + 29; y <= fy + 31; y++) putC(ax, y, az, BLOCK.CONCRETE);
}

// ---------------------------------------------------------------------------
// minnan_house 闽南红砖古厝（台湾常见民居）—— FOOTPRINT_R 4
// ---------------------------------------------------------------------------

/**
 * 闽南红砖古厝：RED_BRICK 红砖墙身 7×5 高 3（GREY_BRICK 逐块 hash 点缀做
 * 砌纹/灰缝）→ 双坡红瓦顶（屋脊沿 X：RED_BRICK 坡面平铺近似红瓦 + DARK_TILE
 * 檐口压边 + DARK_TILE 正脊）→ 中央马背脊抬高段（正脊中段 x±1 再抬 1 格）→
 * 燕尾脊（正脊两端各 2 块 DARK_TILE 斜向阶梯上翘至山墙外侧 x±4 上方，端部
 * 分叉双翘——燕尾）→ 山墙尖 RED_BRICK 补砌 → 凹寿门面（RED_DOOR 门 + STONE
 * 石门槛 + 两窗 GLASS 配 RED_BRICK 窗框 + 背窗）→ 门前石板埕（COBBLE 5×3
 * 铺装）+ 埕边古井（STONE 井圈 + 井眼）。总高 ~8 格（燕尾叉尖 fy+7）；
 * 水平包络：坡面出挑/燕尾/古井 Chebyshev ≤ 4 = FOOTPRINT_R。
 */
export function stampMinnanHouse(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 8); // 燕尾叉尖
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const x0 = ax - 3;
  const x1 = ax + 3; // 面阔 7（红砖墙身）
  const z0 = az - 3;
  const z1 = az + 1; // 进深 5（北背南面）
  const ridge = az - 1; // 屋脊线（沿 X）

  // ① 厅堂内部掏空（5×3×3）
  clearBox(x0 + 1, fy, z0 + 1, x1 - 1, fy + 2, z1 - 1, put);

  // ② 地基 + 红砖斗底（随地形垫脚）
  foundation(x0, z0, x1, z1, fy, BLOCK.RED_BRICK, heightAt, put);
  slab(x0, z0, x1, z1, fy - 1, BLOCK.RED_BRICK, put);

  // ③ 红砖墙身高 3（GREY_BRICK hash 点缀做砌纹——闽南砖墙灰缝拼色）
  for (let y = fy; y <= fy + 2; y++) {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const ex = x === x0 || x === x1;
        const ez = z === z0 || z === z1;
        if (!ex && !ez) continue;
        const brick =
          hash2(x * 7 + y * 13, z * 11 - y * 5) < 0.14 ? BLOCK.GREY_BRICK : BLOCK.RED_BRICK;
        putC(x, y, z, brick);
      }
    }
  }

  // ④ 双坡红瓦顶（RED_BRICK 坡面 + 檐口压边 + 正脊）+ 马背脊 + 燕尾脊
  gableRoof(x0, x1, ridge, fy + 4, 2, BLOCK.RED_BRICK, put); // 坡面出挑 2（檐到 fy+2）
  for (const ez of [z0, z1]) {
    for (let x = x0 - 1; x <= x1 + 1; x++) putC(x, fy + 2, ez, BLOCK.DARK_TILE); // 檐口压边
  }
  for (let x = x0; x <= x1; x++) putC(x, fy + 5, ridge, BLOCK.DARK_TILE); // 正脊
  for (let x = ax - 1; x <= ax + 1; x++) putC(x, fy + 6, ridge, BLOCK.DARK_TILE); // 马背脊抬高段
  for (const ex of [x0 - 1, x1 + 1]) {
    putC(ex, fy + 6, ridge, BLOCK.DARK_TILE); // 燕尾：阶梯上翘（第 1 级）
    putC(ex, fy + 7, ridge, BLOCK.DARK_TILE); // 燕尾：阶梯上翘（第 2 级）
    putC(ex, fy + 7, ridge - 1, BLOCK.DARK_TILE); // 尾端分叉（双翘如燕尾）
    putC(ex, fy + 7, ridge + 1, BLOCK.DARK_TILE);
  }
  putC(x0, fy + 3, ridge, BLOCK.RED_BRICK); // 山墙尖补砌（硬山封火）
  putC(x1, fy + 3, ridge, BLOCK.RED_BRICK);

  // ⑤ 凹寿门面（南向）：RED_DOOR 门 + STONE 石门槛 + 两窗（GLASS + 红砖窗框）+ 背窗
  putC(ax, fy, z1, BLOCK.RED_DOOR);
  putC(ax, fy + 1, z1, BLOCK.RED_DOOR);
  putC(ax - 2, fy + 1, z1, BLOCK.GLASS); // 左右窗（红砖墙身自带窗框）
  putC(ax + 2, fy + 1, z1, BLOCK.GLASS);
  putC(ax, fy + 1, z0, BLOCK.GLASS); // 背窗
  putC(ax, fy + 2, ridge, BLOCK.GLOWBLOCK); // 厅堂长明灯（脊下）
  putC(ax, fy, z1 + 1, BLOCK.STONE); // 石门槛（凹寿前）

  // ⑥ 门前石板埕（COBBLE 5×3 铺装，随地形垫平）
  foundation(ax - 2, z1 + 1, ax + 2, z1 + 3, fy, BLOCK.COBBLE, heightAt, put);
  slab(ax - 2, z1 + 1, ax + 2, z1 + 3, fy - 1, BLOCK.COBBLE, put);

  // ⑦ 埕边古井（埕角 STONE 井圈两面 + 井眼——全落埕内不悬空）
  putC(ax - 1, fy, z1 + 3, BLOCK.STONE);
  putC(ax - 2, fy, z1 + 2, BLOCK.STONE);
  putC(ax - 2, fy, z1 + 3, BLOCK.AIR); // 井眼
}
