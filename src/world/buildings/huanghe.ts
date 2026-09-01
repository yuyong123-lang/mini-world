// world/buildings/huanghe.ts —— 黄河组结构 stamp（覆盖区域：山西 / 山东 / 河南 / 陕西，
// 对应 parts/huanghe.ts）。W2-A1 实装：
//   - yingxian_pagoda　应县木塔（山西）：砖木台基 + 八角五层明层木塔 + 攒尖塔刹
//   - confucius_hall　孔庙大成殿（山东）：双层青石台基 + 朱红柱廊 + 重檐歇山黄琉璃顶
//   - seaweed_house　胶东海草房（山东常见）：石墙厚壁 + 高耸圆缓茅草厚顶 + 老虎窗
//   - pagoda_forest　少林塔林（河南）：塔院台基（碎石坪+矮墙）+ 7~9 座密檐小方塔
//   - dayan_pagoda　大雁塔（陕西）：七层方形砖塔密腰檐 + 攒尖宝珠
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]（yingxian 5 / confucius 5 / seaweed 4 / forest 7 / dayan 4）；
// 高度封顶一律 kit.topClamp；内部随机一律 hash2（同输入两次 stamp 逐位一致）；
// 内部顺序：clearBox → foundation → 墙/顶 → 装饰。
//
// 特征方块锚点（FEATURE_BLOCK 表 + structures.test 断言窗口：锚点 ±2、fy..fy+8）：
//   yingxian_pagoda → DARK_WOOD（中央塔心柱 fy..fy+7 在锚点正下方一列）
//   confucius_hall  → YELLOW_TILE（下檐黄琉璃盘 fy+4 盖住锚点列）
//   seaweed_house   → THATCH（厚茅草顶 fy+3 盖住锚点列）
//   pagoda_forest   → GREY_BRICK（中心主塔一层塔身在 (ax,fy,az)）
//   dayan_pagoda    → GREY_BRICK（底层供台在 (ax,fy,az)）

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

/** 本组内用的「削角方盘」：|dx|,|dz| ≤ r 且去掉四角 cut×cut 块（八角形近似） */
function octDisc(
  cx: number,
  cz: number,
  r: number,
  cut: number,
  y: number,
  mat: number,
  put: StructPut,
): void {
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) > r - cut && Math.abs(dz) > r - cut) continue; // 削角
      put(cx + dx, y, cz + dz, mat, true);
    }
  }
}

/** 本组内用的「削角方环」：Chebyshev 半径 r 的一圈再去四角（八角栏板/腰檐圈） */
function octBand(
  cx: number,
  cz: number,
  r: number,
  cut: number,
  y: number,
  mat: number,
  put: StructPut,
): void {
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (Math.abs(dx) > r - cut && Math.abs(dz) > r - cut) continue; // 削角
      put(cx + dx, y, cz + dz, mat, true);
    }
  }
}

// ---------------------------------------------------------------------------
// yingxian_pagoda 应县木塔（山西稀有地标）—— FOOTPRINT_R 5
// ---------------------------------------------------------------------------

/**
 * 佛宫寺释迦塔：9×9 GREY_BRICK 砖木台基两层 → 八角平面木塔五层明层
 * （每层 8 根 DARK_WOOD 角柱 + PLANKS 木栏平座 + DARK_TILE 外挑八角腰檐，
 * 柱位半径 3→3→2→2→1 逐层收分）→ 顶层攒尖（DARK_TILE 三段收分）→
 * 塔刹（DARK_WOOD 竖杆 + GREY_BRICK 圆珠 2 段）。中央塔心柱 DARK_WOOD 贯通
 * 下四层，柱身 fy+2 嵌 GLOWBLOCK 一盏（殿内长明灯）。总高 ~21 格。
 * 水平包络：最大腰檐八角盘 r5（Chebyshev ≤ 5 = FOOTPRINT_R）。
 */
export function stampYingxianPagoda(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 22); // 塔刹顶珠
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  /** 八角 8 根角柱位：(±r,±h) 与 (±h,±r)，h = max(1, r>>1)（正八边形近似） */
  const octCols = (r: number): Array<[number, number]> => {
    const h = Math.max(1, r >> 1);
    return [
      [r, h], [r, -h], [-r, h], [-r, -h],
      [h, r], [-h, r], [h, -r], [-h, -r],
    ];
  };
  const columns = (r: number, y0: number, y1: number): void => {
    for (const [dx, dz] of octCols(r)) {
      for (let y = y0; y <= y1; y++) putC(ax + dx, y, az + dz, BLOCK.DARK_WOOD);
    }
  };
  /** 平座木栏板（1 高八角环），南面留豁口登塔 */
  const balustrade = (r: number, cut: number, y: number): void => {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (Math.abs(dx) > r - cut && Math.abs(dz) > r - cut) continue;
        if (dz === r && Math.abs(dx) <= 1) continue; // 南面豁口
        putC(ax + dx, y, az + dz, BLOCK.PLANKS);
      }
    }
  };

  // ① 塔身内部掏空（明层通透；塔心柱/腰檐随后回填）
  clearBox(ax - 2, fy, az - 2, ax + 2, fy + 15, az + 2, put);

  // ② 砖木台基：9×9 GREY_BRICK 两层（下层随地形垫脚）
  foundation(ax - 4, az - 4, ax + 4, az + 4, fy - 1, BLOCK.GREY_BRICK, heightAt, put);
  slab(ax - 4, az - 4, ax + 4, az + 4, fy - 2, BLOCK.GREY_BRICK, put);
  slab(ax - 4, az - 4, ax + 4, az + 4, fy - 1, BLOCK.GREY_BRICK, put);

  // ③ 五层明层：角柱 + 平座栏板 + 外挑腰檐（半径/cut 逐层收分）
  columns(3, fy, fy + 2); // 首层（柱 3 高）
  balustrade(4, 2, fy);
  octDisc(ax, az, 5, 2, fy + 3, BLOCK.DARK_TILE, put); // 腰檐一（最大出挑）

  columns(3, fy + 4, fy + 5);
  balustrade(4, 2, fy + 4);
  octDisc(ax, az, 5, 3, fy + 6, BLOCK.DARK_TILE, put); // 腰檐二

  columns(2, fy + 7, fy + 8);
  balustrade(3, 1, fy + 7);
  octDisc(ax, az, 4, 2, fy + 9, BLOCK.DARK_TILE, put); // 腰檐三

  columns(2, fy + 10, fy + 11);
  balustrade(3, 1, fy + 10);
  octDisc(ax, az, 4, 3, fy + 12, BLOCK.DARK_TILE, put); // 腰檐四

  columns(1, fy + 13, fy + 14);
  balustrade(2, 1, fy + 13);
  octDisc(ax, az, 3, 2, fy + 15, BLOCK.DARK_TILE, put); // 腰檐五

  // ④ 顶层攒尖：DARK_TILE 三段收分
  octDisc(ax, az, 2, 1, fy + 16, BLOCK.DARK_TILE, put);
  octBand(ax, az, 1, 1, fy + 17, BLOCK.DARK_TILE, put);
  putC(ax, fy + 17, az, BLOCK.DARK_TILE); // 攒尖心

  // ⑤ 塔刹：DARK_WOOD 竖杆 + GREY_BRICK 圆珠 2 段
  putC(ax, fy + 18, az, BLOCK.DARK_WOOD);
  putC(ax, fy + 19, az, BLOCK.DARK_WOOD);
  putC(ax, fy + 20, az, BLOCK.GREY_BRICK);
  putC(ax, fy + 21, az, BLOCK.GREY_BRICK);

  // ⑥ 中央塔心柱（最后落块，穿过腰檐中心）：DARK_WOOD，fy+2 嵌长明灯一盏
  for (let y = fy; y <= fy + 7; y++) putC(ax, y, az, BLOCK.DARK_WOOD);
  putC(ax, fy + 2, az, BLOCK.GLOWBLOCK);
}

// ---------------------------------------------------------------------------
// confucius_hall 孔庙大成殿（山东稀有地标）—— FOOTPRINT_R 5
// ---------------------------------------------------------------------------

/**
 * 大成殿：双层青石台基（11×9 + 9×7，各层 GREY_BRICK 栏板、南面留豁口 +
 * 南向石阶）→ 朱红柱廊一圈 10 根（RED_WALL）+ GREY_BRICK 墙芯（南向殿门，
 * 门楣 RED_DOOR）→ 重檐歇山顶（YELLOW_TILE）：下檐大出挑四方盘 → 上腰
 * RED_WALL 鼓座收分 → 上檐盘 → 顺脊歇山两坡下探 + 正脊两端鸱吻上翘。
 * 殿内 GLOWBLOCK。总高 ~12 格（含台基）；水平包络 Chebyshev ≤ 5。
 */
export function stampConfuciusHall(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 11); // 鸱吻
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  /** 台基栏板环（南面正中留豁口作登殿门道） */
  const parapet = (x0: number, z0: number, x1: number, z1: number, y: number): void => {
    for (let x = x0; x <= x1; x++) {
      putC(x, y, z0, BLOCK.GREY_BRICK);
      if (Math.abs(x - ax) > 1) putC(x, y, z1, BLOCK.GREY_BRICK); // 南面豁口
    }
    for (let z = z0; z <= z1; z++) {
      putC(x0, y, z, BLOCK.GREY_BRICK);
      putC(x1, y, z, BLOCK.GREY_BRICK);
    }
  };

  // ① 殿内掏空（墙芯内）
  clearBox(ax - 1, fy, az, ax + 1, fy + 3, az, put);

  // ② 双层青石台基（下层 11×9、上层 9×7）+ 各层栏板 + 南向石阶
  foundation(ax - 5, az - 4, ax + 5, az + 4, fy - 2, BLOCK.GREY_BRICK, heightAt, put);
  slab(ax - 5, az - 4, ax + 5, az + 4, fy - 2, BLOCK.GREY_BRICK, put);
  slab(ax - 4, az - 3, ax + 4, az + 3, fy - 1, BLOCK.GREY_BRICK, put);
  parapet(ax - 5, az - 4, ax + 5, az + 4, fy - 1);
  parapet(ax - 4, az - 3, ax + 4, az + 3, fy);
  foundation(ax - 1, az + 5, ax + 1, az + 5, fy - 2, BLOCK.GREY_BRICK, heightAt, put);
  slab(ax - 1, az + 5, ax + 1, az + 5, fy - 3, BLOCK.GREY_BRICK, put); // 石阶

  // ③ 朱红柱廊一圈 10 根（前后各 4 + 两山各 1）
  for (const px of [ax - 3, ax - 1, ax + 1, ax + 3]) {
    for (let y = fy; y <= fy + 3; y++) {
      putC(px, y, az + 2, BLOCK.RED_WALL);
      putC(px, y, az - 2, BLOCK.RED_WALL);
    }
  }
  for (const pz of [az, az + 2, az - 2]) {
    for (let y = fy; y <= fy + 3; y++) {
      putC(ax - 3, y, pz, BLOCK.RED_WALL);
      putC(ax + 3, y, pz, BLOCK.RED_WALL);
    }
  }

  // ④ GREY_BRICK 墙芯（5×3）+ 南向殿门（门洞 + RED_DOOR 门楣）+ 殿内长明灯
  wallsRect(ax - 2, az - 1, ax + 2, az + 1, fy, fy + 3, BLOCK.GREY_BRICK, put);
  putC(ax, fy, az + 1, BLOCK.AIR);
  putC(ax, fy + 1, az + 1, BLOCK.AIR);
  putC(ax, fy + 2, az + 1, BLOCK.RED_DOOR);
  putC(ax - 2, fy + 2, az + 1, BLOCK.GLASS); // 支摘窗
  putC(ax + 2, fy + 2, az + 1, BLOCK.GLASS);
  putC(ax, fy + 2, az, BLOCK.GLOWBLOCK);

  // ⑤ 重檐歇山顶（YELLOW_TILE）：下檐大出挑 → 上腰收分 → 上檐 → 歇山两坡
  slab(ax - 5, az - 4, ax + 5, az + 4, fy + 4, BLOCK.YELLOW_TILE, put); // 下檐
  wallsRect(ax - 2, az - 1, ax + 2, az + 1, fy + 5, fy + 6, BLOCK.RED_WALL, put); // 上腰
  slab(ax - 4, az - 3, ax + 4, az + 3, fy + 7, BLOCK.YELLOW_TILE, put); // 上檐
  gableRoof(ax - 2, ax + 2, az, fy + 9, 2, BLOCK.YELLOW_TILE, put); // 顺脊歇山
  putC(ax - 3, fy + 10, az, BLOCK.YELLOW_TILE); // 正脊鸱吻上翘
  putC(ax + 3, fy + 10, az, BLOCK.YELLOW_TILE);
}

// ---------------------------------------------------------------------------
// seaweed_house 胶东海草房（山东常见民居）—— FOOTPRINT_R 4
// ---------------------------------------------------------------------------

/**
 * 海草房：COBBLE 石墙 5×4 三层厚壁（室内掏空）+ 深嵌 GLASS 1×1 小窗 +
 * 南向门洞 → 高耸圆缓茅草尖顶（THATCH 六层堆叠：先满铺外挑一层，再逐层
 * 收分出饱满弧顶——顶厚远超墙高是海草房特征）+ 侧面小老虎窗 1 个 →
 * 门前石阶 + 院前 COBBLE 矮石墙（正中留院门）。总高 ~9 格。
 */
export function stampSeaweedHouse(
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
  const x0 = ax - 2;
  const x1 = ax + 2;
  const z0 = az - 1;
  const z1 = az + 2; // 南正面

  // ① 地基 + 石地板（5×4）
  foundation(x0, z0, x1, z1, fy, BLOCK.COBBLE, heightAt, put);
  slab(x0, z0, x1, z1, fy - 1, BLOCK.COBBLE, put);

  // ② 厚石墙体：5×4 实心三层（海草房石墙厚实）
  for (let y = fy; y <= fy + 2; y++) slab(x0, z0, x1, z1, y, BLOCK.COBBLE, put);

  // ③ 室内掏空 + 门窗（小窗深嵌 GLASS 1×1）
  clearBox(ax - 1, fy, az, ax + 1, fy + 2, az + 1, put);
  putC(ax, fy, z1, BLOCK.AIR); // 南向门洞
  putC(ax, fy + 1, z1, BLOCK.AIR);
  putC(x0, fy + 1, az, BLOCK.GLASS); // 两山小窗
  putC(x1, fy + 1, az, BLOCK.GLASS);
  putC(ax, fy + 1, z0, BLOCK.GLASS); // 背窗

  // ④ 高耸圆缓茅草尖顶（顶厚六层，逐层收分成饱满弧顶；脊部圆缓不锐利）
  slab(x0 - 1, z0 - 1, x1 + 1, z1 + 1, fy + 3, BLOCK.THATCH, put); // 满铺外挑层
  slab(x0 - 1, z0, x1 + 1, z1, fy + 4, BLOCK.THATCH, put);
  slab(x0, z0, x1, z1, fy + 5, BLOCK.THATCH, put);
  slab(x0, az, x1, az + 1, fy + 6, BLOCK.THATCH, put);
  slab(ax - 1, az, ax + 1, az + 1, fy + 7, BLOCK.THATCH, put);
  slab(ax - 1, az, ax + 1, az, fy + 8, BLOCK.THATCH, put); // 圆缓脊冠

  // ⑤ 侧面小老虎窗（山墙面嵌玻璃 + 茅草雨罩）
  putC(x1 + 1, fy + 4, az, BLOCK.GLASS);
  putC(x1 + 1, fy + 5, az, BLOCK.THATCH);

  // ⑥ 门前石阶 + 院前矮石墙（正中留院门）
  foundation(ax - 1, z1 + 1, ax + 1, z1 + 1, fy - 1, BLOCK.COBBLE, heightAt, put);
  slab(ax - 1, z1 + 1, ax + 1, z1 + 1, fy - 1, BLOCK.COBBLE, put);
  for (const px of [ax - 3, ax - 1, ax + 1, ax + 3]) {
    putC(px, heightAt(px, z1 + 2) + 1, z1 + 2, BLOCK.COBBLE);
  }
}

// ---------------------------------------------------------------------------
// pagoda_forest 少林塔林（河南稀有地标）—— FOOTPRINT_R 7
// ---------------------------------------------------------------------------

/**
 * 塔林：整座塔林坐于一座两层退台的「塔院台基」上（15×15 三层 + 13×13 两层，
 * 台面满铺 COBBLE 碎石坪——碎石小径的台地表达），台缘 GREY_BRICK 矮墙
 * （南面留豁口）。台上中心主塔 + 8 个固定偏移槽（Chebyshev ≤ 5）按哈希启用
 * 6~8 座（合计 7~9 座，启用次序按 per-slot 哈希排名，跨 chunk 完全确定）。
 * 每塔：GREY_BRICK 密檐小方塔，层数 = 3 + hash%3（3..5），前两层塔身 3×3、
 * 其上收分为 1×1（半宽 2→1.5 的体素表达），每层 1 格出挑 DARK_TILE 窄檐，
 * 塔顶 GREY_BRICK 宝珠 1 块。台角 SPRUCE_LEAVES 常青树形 2 株
 * （叶 overwrite=false 只写 AIR，绝不啃塔）。
 * 台基在 fy..fy+4 五层内满铺实体（≥ 锚点 ±6）：任何 chunk 边界穿过台基时
 * 两侧同为实体——跨 chunk 无缝硬闸（tests/structures.test.ts）逐位成立。
 */
export function stampPagodaForest(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 18);
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const TERRACE_TOP = fy + 4; // 台面顶（上层台基石）

  // 8 个固定偏移槽（互不重叠的最小间距由槽位本身保证：环向 Chebyshev 间距 ≥ 2，
  // 各塔最大出挑 2 → 相邻塔檐只相接不侵入对方塔身）
  const RING: Array<[number, number]> = [
    [5, 0], [-5, 0], [0, 5], [0, -5], [3, 3], [-3, 3], [3, -3], [-3, -3],
  ];
  // 环槽启用 6..8 座（+中心主塔 = 7..9 座）；按 per-slot 哈希排名取前 ringCount 个
  const ringCount = 6 + Math.floor(hash2(ax + 917, az - 313) * 3);
  const ranked = RING.map(([dx, dz], i) => ({
    dx,
    dz,
    h: hash2(ax + i * 37 + 11, az - i * 53 - 7),
  })).sort((a, b) => a.h - b.h);

  /** 密檐小方塔：n 层（3..5），逐层收分，塔顶宝珠（立于台面 TERRACE_TOP 之上） */
  const tower = (tx: number, tz: number, n: number): void => {
    const base = TERRACE_TOP + 1;
    slab(tx - 1, tz - 1, tx + 1, tz + 1, base - 1, BLOCK.GREY_BRICK, put); // 塔基
    for (let j = 0; j < n; j++) {
      const bw = j < 2 ? 1 : 0; // 塔身半宽 2→1.5（收分：前两层 3×3、其上 1×1）
      const y0 = base + j * 2;
      for (let dx = -bw; dx <= bw; dx++) {
        for (let dz = -bw; dz <= bw; dz++) putC(tx + dx, y0, tz + dz, BLOCK.GREY_BRICK);
      }
      const ew = bw + 1; // 1 格出挑窄檐
      for (let dx = -ew; dx <= ew; dx++) {
        for (let dz = -ew; dz <= ew; dz++) putC(tx + dx, y0 + 1, tz + dz, BLOCK.DARK_TILE);
      }
    }
    putC(tx, base + n * 2, tz, BLOCK.GREY_BRICK); // 宝珠
  };

  // ① 塔院台基：下层 15×15 三层 + 上层 13×13 两层（随地形垫脚）
  foundation(ax - 7, az - 7, ax + 7, az + 7, fy, BLOCK.GREY_BRICK, heightAt, put);
  for (let y = fy; y <= fy + 2; y++) slab(ax - 7, az - 7, ax + 7, az + 7, y, BLOCK.GREY_BRICK, put);
  for (let y = fy + 3; y <= TERRACE_TOP; y++) {
    slab(ax - 6, az - 6, ax + 6, az + 6, y, BLOCK.GREY_BRICK, put);
  }
  // 台面满铺碎石（两层台顶各铺一层 COBBLE：下层台缘 + 上层台面）
  slab(ax - 7, az - 7, ax + 7, az + 7, fy + 2, BLOCK.COBBLE, put);
  slab(ax - 6, az - 6, ax + 6, az + 6, TERRACE_TOP, BLOCK.COBBLE, put);

  // ② 台缘矮墙（南面正中留豁口作院门）
  for (let d = -6; d <= 6; d++) {
    putC(ax + d, TERRACE_TOP + 1, az - 6, BLOCK.GREY_BRICK);
    if (Math.abs(d) > 1) putC(ax + d, TERRACE_TOP + 1, az + 6, BLOCK.GREY_BRICK);
    putC(ax - 6, TERRACE_TOP + 1, az + d, BLOCK.GREY_BRICK);
    putC(ax + 6, TERRACE_TOP + 1, az + d, BLOCK.GREY_BRICK);
  }

  // ③ 中心主塔 + 启用的环槽塔（层数由各自坐标哈希确定：3 + hash%3）
  tower(ax, az, 3 + Math.floor(hash2(ax + 51, az - 47) * 3));
  for (let k = 0; k < ringCount; k++) {
    const { dx, dz } = ranked[k]!;
    const tx = ax + dx;
    const tz = az + dz;
    tower(tx, tz, 3 + Math.floor(hash2(tx + 51, tz - 47) * 3));
  }

  // ④ 常青树形 2 株（台角；叶 overwrite=false 只写 AIR，绝不啃塔）
  for (const [dx, dz] of [[5, -5], [-5, 5]] as const) {
    const tx = ax + dx;
    const tz = az + dz;
    putC(tx, TERRACE_TOP + 1, tz, BLOCK.LOG);
    for (let lx = -1; lx <= 1; lx++) {
      for (let lz = -1; lz <= 1; lz++) {
        if (Math.abs(lx) === 1 && Math.abs(lz) === 1) continue; // 去角方冠
        put(tx + lx, TERRACE_TOP + 2, tz + lz, BLOCK.SPRUCE_LEAVES, false);
        put(tx + lx, TERRACE_TOP + 3, tz + lz, BLOCK.SPRUCE_LEAVES, false);
      }
    }
    put(tx, TERRACE_TOP + 4, tz, BLOCK.SPRUCE_LEAVES, false); // 顶尖
  }
}

// ---------------------------------------------------------------------------
// dayan_pagoda 大雁塔（陕西稀有地标）—— FOOTPRINT_R 4
// ---------------------------------------------------------------------------

/**
 * 大雁塔：7×7 GREY_BRICK 方形砖塔七层，半宽 3→2→2→2→1→1→1 逐层收分
 * （宽 7→5→5→5→3→3→3），层高 3/3/2/3/2/3/2 交替，每层顶 1 格出挑
 * DARK_TILE 窄腰檐盘（密檐节奏），南向每层 1×2 拱窗洞。塔体中空，
 * 底层 GREY_BRICK 供台 + GLOWBLOCK 长明灯；塔顶攒尖（DARK_TILE 收分两段
 * + GREY_BRICK 宝珠）。总高 ~20 格；水平包络 Chebyshev ≤ 4 = FOOTPRINT_R。
 */
export function stampDayanPagoda(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 21); // 宝珠
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  // 七层：半宽（宽 7→5→5→5→3→3→3）与层高（3/3/2 交替）
  const HALVES = [3, 2, 2, 2, 1, 1, 1];
  const HEIGHTS = [3, 3, 2, 3, 2, 3, 2];

  // ① 塔体中空（含各层净室；墙体/腰檐随后回填）
  clearBox(ax - 2, fy, az - 2, ax + 2, fy + 17, az + 2, put);

  // ② 塔基地坪（7×7，随地形垫脚）
  foundation(ax - 3, az - 3, ax + 3, az + 3, fy, BLOCK.GREY_BRICK, heightAt, put);
  slab(ax - 3, az - 3, ax + 3, az + 3, fy - 1, BLOCK.GREY_BRICK, put);

  // ③ 七层塔身 + 密腰檐 + 南向拱窗洞
  let y = fy;
  for (let i = 0; i < 7; i++) {
    const h = HALVES[i]!;
    const rows = HEIGHTS[i]!;
    wallsRect(ax - h, az - h, ax + h, az + h, y, y + rows - 1, BLOCK.GREY_BRICK, put);
    putC(ax, y, az + h, BLOCK.AIR); // 南向 1×2 窗洞/门洞
    putC(ax, y + 1, az + h, BLOCK.AIR);
    // 1 格出挑窄腰檐盘（盖住本层墙头 = 密檐层界）
    slab(ax - h - 1, az - h - 1, ax + h + 1, az + h + 1, y + rows - 1, BLOCK.DARK_TILE, put);
    y += rows;
  }

  // ④ 塔顶攒尖：DARK_TILE 收分两段 + GREY_BRICK 宝珠
  slab(ax - 1, az - 1, ax + 1, az + 1, y, BLOCK.DARK_TILE, put);
  putC(ax, y + 1, az, BLOCK.DARK_TILE);
  putC(ax, y + 2, az, BLOCK.GREY_BRICK);

  // ⑤ 底层供台 + 长明灯
  putC(ax, fy, az, BLOCK.GREY_BRICK);
  putC(ax, fy + 2, az, BLOCK.GLOWBLOCK);
}
