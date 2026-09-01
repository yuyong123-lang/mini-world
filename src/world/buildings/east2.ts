// world/buildings/east2.ts —— 华东2组结构 stamp（覆盖区域：上海 / 浙江 / 福建（parts/east2））
// W4-A2 实装：
//   - pearl_tower　东方明珠（三斜腿基座 + 双球体串联塔 + 太空舱/天线，上海，r5）｜特征方块 CONCRETE
//   - shikumen　石库门（联排两层 + 石库门楣 + 观音兜山墙 + 天井，上海常见，r4）｜特征方块 PASTEL_WALL
//   - leifeng_pagoda　雷峰塔（石台基 + 八角五层赭红塔身 + 铜制攒尖金顶，浙江，r4）｜特征方块 DARK_TILE
//   - tulou　圆形土楼（夯土大圆环 + 瓦顶圈 + 内圈木构房 + 内院祖堂，福建，r7）｜特征方块 GREY_BRICK
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]（pearl_tower 5 / shikumen 4 / leifeng_pagoda 4 / tulou 7）；
// 高度封顶一律 kit.topClamp；输出只经 put 回调；同输入两次 stamp 逐位一致
//（圆弧/球体一律参数方程 + Math.round 取整落块，拼色一律 hash2，不接 rng 流）；
// 内部顺序：clearBox → foundation → 墙/顶 → 装饰。
//
// 特征方块锚点（FEATURE_BLOCK 表 + structures.test 断言窗口：锚点 ±2、fy..fy+8）：
//   pearl_tower     → CONCRETE（塔心立柱在 (ax,fy..fy+7,az)，窗口正中）
//   shikumen        → PASTEL_WALL（南立面 z=az 一层墙脚 (ax±2,fy,az)）
//   leifeng_pagoda  → DARK_TILE（首层腰檐实心八角盘 (ax,fy+3,az) 盖住锚点列）
//   tulou           → GREY_BRICK（北向祖堂石砌台基 (ax,fy,az-2)，锚点 ±2 窗口内）

import { BLOCK } from '../../blocks/registry';
import { hash2 } from '../../core/rng';

import {
  arch,
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
// pearl_tower 东方明珠（上海稀有地标）—— FOOTPRINT_R 5
// ---------------------------------------------------------------------------

/**
 * 东方明珠：STONE 基座广场（r5 圆盘，自地表垫平）→ 三条 CONCRETE 斜腿
 * （θ=90°/210°/330° 三向，自地面 r4 参数化逐格插值汇聚到塔心 fy+6）→
 * 塔心立柱（fy..fy+7，保证中心列连续）→ 下球体 GLASS_CURTAIN r3
 * （fy+6..fy+12 球形参数化：|dy| 决定逐层圆盘半径）→ 细腰塔身 CONCRETE
 * 圆柱 r1（fy+13..fy+17）→ 上球体 GLASS_CURTAIN r2（fy+18..fy+22）→
 * 太空舱小圆盘 CONCRETE r1（fy+23）→ 天线杆 1×1（fy+24..fy+26）。
 * 总高 ~26 格；水平包络：广场 r5 = FOOTPRINT_R（球体/塔身均在 r3 内）。
 */
export function stampPearlTower(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 26); // 天线杆顶
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const deg = (d: number): number => (d * Math.PI) / 180;
  /** 实心圆盘（半径 r @y）：dx²+dz² ≤ r² 逐格落块 */
  const disc = (r: number, y: number, mat: number): void => {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > r * r) continue;
        putC(ax + dx, y, az + dz, mat);
      }
    }
  };

  // ① 基座广场：r5 圆盘自地表垫平（斜坡自动垫脚）+ fy-1 铺装层
  for (let dx = -5; dx <= 5; dx++) {
    for (let dz = -5; dz <= 5; dz++) {
      if (dx * dx + dz * dz > 25) continue;
      const wx = ax + dx;
      const wz = az + dz;
      const ch = heightAt(wx, wz);
      for (let y = ch + 1; y <= fy - 1; y++) putC(wx, y, wz, BLOCK.STONE);
    }
  }
  disc(5, fy - 1, BLOCK.STONE);

  // ② 三斜腿基座：θ=90°/210°/330° 三向，自地面 (r=4) 插值到塔心 (r=0, fy+6)
  for (let k = 0; k < 3; k++) {
    const th = deg(90 + k * 120);
    for (let s = 0; s <= 7; s++) {
      const t = s / 7;
      const r = 4 * (1 - t);
      const x = ax + Math.round(r * Math.cos(th));
      const z = az + Math.round(r * Math.sin(th));
      putC(x, fy - 1 + Math.round(t * 7), z, BLOCK.CONCRETE);
    }
  }

  // ③ 塔心立柱（自地面穿入下球体，中心列连续）
  for (let y = fy; y <= fy + 7; y++) putC(ax, y, az, BLOCK.CONCRETE);

  // ④ 下球体（GLASS_CURTAIN r3，心 fy+9）：|dy| 决定逐层圆盘半径
  for (let y = fy + 6; y <= fy + 12; y++) {
    const dy = y - (fy + 9);
    disc(Math.round(Math.sqrt(Math.max(0, 9 - dy * dy))), y, BLOCK.GLASS_CURTAIN);
  }

  // ⑤ 细腰塔身（CONCRETE 圆柱 r1）
  for (let y = fy + 13; y <= fy + 17; y++) disc(1, y, BLOCK.CONCRETE);

  // ⑥ 上球体（GLASS_CURTAIN r2，心 fy+20）
  for (let y = fy + 18; y <= fy + 22; y++) {
    const dy = y - (fy + 20);
    disc(Math.round(Math.sqrt(Math.max(0, 4 - dy * dy))), y, BLOCK.GLASS_CURTAIN);
  }

  // ⑦ 太空舱小圆盘 + 天线杆
  disc(1, fy + 23, BLOCK.CONCRETE);
  for (let y = fy + 24; y <= fy + 26; y++) putC(ax, y, az, BLOCK.CONCRETE);
}

// ---------------------------------------------------------------------------
// shikumen 石库门（上海常见民居）—— FOOTPRINT_R 4
// ---------------------------------------------------------------------------

/**
 * 石库门联排：南立面门头墙（RED_BRICK 7 宽：中开 forced passage + 乌漆大门
 * RED_DOOR 两扇 + 两侧门柱 + kit.arch 半圆拱石库门楣）→ 天井小院（COBBLE 坪
 * + STONE 井圈 + 井眼）→ 主联排两层 7×4（PASTEL_WALL 主体，两端 GREY_BRICK
 * 山墙面——砖墙灰缝）：一层厅门 + GLASS 窗 / 二层楼板 + GLASS 窗 → DARK_TILE
 * 双坡顶夹在山墙间 → 观音兜（两端山墙高出屋面阶梯弧形收分，PASTEL_WALL 起弧
 * + GREY_BRICK 压边）→ 二层晒台 PLANKS 栏杆。总高 ~12 格（观音兜压顶 fy+11）。
 * 水平包络：双坡顶出挑至 ax±4 / az-4..az+2 → Chebyshev ≤ 4 = FOOTPRINT_R。
 */
export function stampShikumen(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 12); // 观音兜压顶
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const x0 = ax - 3;
  const x1 = ax + 3; // 联排面阔 7
  const hz0 = az - 3;
  const hz1 = az; // 主联排 4 深（北背南面）
  const wz = az + 3; // 南立面门头墙

  // ① 净空：主联排两层 + 天井 + 门头
  clearBox(x0, fy, hz0, x1, fy + 6, hz1, put);
  clearBox(ax - 2, fy, az + 1, ax + 2, fy + 3, az + 2, put);
  clearBox(x0, fy, wz, x1, fy + 3, wz, put);

  // ② 地基 + 地坪（主楼 GREY_BRICK / 天井 COBBLE / 门头 RED_BRICK）
  foundation(x0, hz0, x1, hz1, fy, BLOCK.GREY_BRICK, heightAt, put);
  slab(x0, hz0, x1, hz1, fy - 1, BLOCK.GREY_BRICK, put);
  foundation(ax - 2, az + 1, ax + 2, az + 2, fy, BLOCK.COBBLE, heightAt, put);
  slab(ax - 2, az + 1, ax + 2, az + 2, fy - 1, BLOCK.COBBLE, put);
  foundation(x0, wz, x1, wz, fy, BLOCK.RED_BRICK, heightAt, put);
  slab(x0, wz, x1, wz, fy - 1, BLOCK.RED_BRICK, put);

  // ③ 一层墙体（PASTEL_WALL 7×4 外壳）+ 两端 GREY_BRICK 山墙面（通高砌到顶）
  wallsRect(x0, hz0, x1, hz1, fy, fy + 2, BLOCK.PASTEL_WALL, put);
  for (const gx of [x0, x1]) {
    for (let z = hz0; z <= hz1; z++) {
      for (let y = fy; y <= fy + 6; y++) putC(gx, y, z, BLOCK.GREY_BRICK);
    }
  }
  // ④ 二层楼板 + 二层墙体
  slab(x0, hz0, x1, hz1, fy + 3, BLOCK.GREY_BRICK, put);
  wallsRect(x0, hz0, x1, hz1, fy + 4, fy + 6, BLOCK.PASTEL_WALL, put);

  // ⑤ 石库门头（南立面）：RED_BRICK 石框 + 乌漆大门两扇 + 半圆拱门楣 + 门柱
  for (let y = fy; y <= fy + 2; y++) slab(x0, wz, x1, wz, y, BLOCK.RED_BRICK, put);
  putC(ax, fy, wz, BLOCK.AIR); // 门洞（中开通道）
  putC(ax, fy + 1, wz, BLOCK.AIR);
  for (const d of [-1, 1]) {
    putC(ax + d, fy, wz, BLOCK.RED_DOOR); // 乌漆大门两扇
    putC(ax + d, fy + 1, wz, BLOCK.RED_DOOR);
  }
  for (const d of [-2, 2]) {
    for (let y = fy; y <= fy + 3; y++) putC(ax + d, y, wz, BLOCK.RED_BRICK); // 两侧门柱
  }
  arch(ax - 1, ax + 1, fy + 2, wz, BLOCK.RED_BRICK, put); // 半圆拱石库门楣（券顶石+拱脚+净空）

  // ⑥ 门窗：厅门（朝天井）+ 一/二层 GLASS 窗 + 室内长明灯
  putC(ax, fy, hz1, BLOCK.AIR);
  putC(ax, fy + 1, hz1, BLOCK.AIR);
  for (const d of [-2, 2]) putC(ax + d, fy + 1, hz1, BLOCK.GLASS);
  for (const d of [-2, 0, 2]) putC(ax + d, fy + 5, hz1, BLOCK.GLASS);
  putC(ax, fy + 1, hz0, BLOCK.GLASS);
  putC(ax, fy + 5, hz0, BLOCK.GLASS);
  putC(ax, fy + 1, az - 1, BLOCK.GLOWBLOCK);
  putC(ax, fy + 5, az - 1, BLOCK.GLOWBLOCK);

  // ⑦ DARK_TILE 双坡顶（屋脊沿 X，夹在两端山墙之间）
  gableRoof(x0, x1, az - 1, fy + 8, 3, BLOCK.DARK_TILE, put);

  // ⑧ 观音兜：两端山墙高出屋面，阶梯弧形收分（PASTEL_WALL 起弧 + GREY_BRICK 压边）
  const GABLE: ReadonlyArray<readonly [number, number]> = [
    [az - 3, 7], [az - 2, 9], [az - 1, 10], [az, 8],
  ];
  for (const gx of [x0, x1]) {
    for (const [gz, gt] of GABLE) {
      for (let y = fy + 7; y <= fy + gt; y++) putC(gx, y, gz, BLOCK.PASTEL_WALL);
      putC(gx, fy + gt + 1, gz, BLOCK.GREY_BRICK); // 压边
    }
  }

  // ⑨ 二层晒台栏杆（PLANKS，前排屋檐上）
  for (let x = ax - 2; x <= ax + 2; x++) putC(x, fy + 8, az, BLOCK.PLANKS);
  for (const d of [-2, 2]) putC(ax + d, fy + 7, az + 1, BLOCK.PLANKS);

  // ⑩ 天井井圈（STONE 三面围合）+ 井眼
  putC(ax - 1, fy, az + 2, BLOCK.STONE);
  putC(ax + 1, fy, az + 2, BLOCK.STONE);
  putC(ax, fy, az + 1, BLOCK.STONE);
  putC(ax, fy, az + 2, BLOCK.AIR); // 井眼
}

// ---------------------------------------------------------------------------
// leifeng_pagoda 雷峰塔（浙江稀有地标）—— FOOTPRINT_R 4
// ---------------------------------------------------------------------------

/**
 * 雷峰塔（新塔铜赭色调）：STONE 石台基两层（9×9 顶 fy-1 + 7×7 顶 fy，
 * WHITE_STONE 栏板两圈、南面留豁口 + 门槛石南阶）→ 八角五层塔身（RED_BRICK
 * 赭红塔身：每层 8 根角柱位 + 平座 WHITE_STONE 矮栏 + 南向 1×2 券窗 +
 * DARK_TILE 八角腰檐大出挑，檐盘半径 4→4→3→3→2 逐层收分＝塔身收分，
 * 实心檐盘兼作本层楼板）→ 铜制攒尖金顶（YELLOW_TILE 3×3 金盘 + 顶珠 + 金针）。
 * 总高 ~18 格（fy+18 金针）；内部 clearBox 分层净室 + 底层 GLOWBLOCK 长明灯。
 * 水平包络：台基 9×9 → Chebyshev ≤ 4 = FOOTPRINT_R（契约半径约束下檐盘取
 * 4→4→3→3→2，即五层腰檐的最大出挑格）。
 */
export function stampLeifengPagoda(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 19); // 金针
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  /** 八角 8 根角柱位：(±r,±h)/(±h,±r)，h = max(1, r>>1)（正八边形近似） */
  const octCols = (r: number): Array<[number, number]> => {
    const h = Math.max(1, r >> 1);
    return [
      [r, h], [r, -h], [-r, h], [-r, -h],
      [h, r], [-h, r], [h, -r], [-h, -r],
    ];
  };
  /** 削角方盘（实心八角盘）：Chebyshev ≤ r 去四角 cut×cut（腰檐/金顶） */
  const octDisc = (r: number, cut: number, y: number, mat: number): void => {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) > r - cut && Math.abs(dz) > r - cut) continue;
        putC(ax + dx, y, az + dz, mat);
      }
    }
  };
  /** 削角方环（八角圈）：Chebyshev = r 的一圈去四角（塔身/平座栏板） */
  const octBand = (r: number, cut: number, y: number, mat: number): void => {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (Math.abs(dx) > r - cut && Math.abs(dz) > r - cut) continue;
        putC(ax + dx, y, az + dz, mat);
      }
    }
  };
  /** 平座白色矮栏（1 高八角环，南面正中留豁口登塔） */
  const balustrade = (r: number, cut: number, y: number): void => {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (Math.abs(dx) > r - cut && Math.abs(dz) > r - cut) continue;
        if (dz === r && Math.abs(dx) <= 1) continue; // 南面豁口
        putC(ax + dx, y, az + dz, BLOCK.WHITE_STONE);
      }
    }
  };

  // ① 塔身内部先掏空（分层净室；实心腰檐盘随后回填作楼板）
  clearBox(ax - 1, fy + 1, az - 1, ax + 1, fy + 14, az + 1, put);

  // ② 石台基两层（随地形垫脚）+ WHITE_STONE 栏板（南面留豁口）+ 南阶门槛石
  foundation(ax - 4, az - 4, ax + 4, az + 4, fy - 1, BLOCK.STONE, heightAt, put);
  slab(ax - 4, az - 4, ax + 4, az + 4, fy - 1, BLOCK.STONE, put);
  slab(ax - 3, az - 3, ax + 3, az + 3, fy, BLOCK.STONE, put);
  for (let d = -4; d <= 4; d++) {
    putC(ax + d, fy, az - 4, BLOCK.WHITE_STONE);
    if (Math.abs(d) > 1) putC(ax + d, fy, az + 4, BLOCK.WHITE_STONE); // 南面豁口
    if (Math.abs(d) > 3) continue; // 7×7 缘只到 ±3
    putC(ax + d, fy + 1, az - 3, BLOCK.WHITE_STONE);
    if (Math.abs(d) > 1) putC(ax + d, fy + 1, az + 3, BLOCK.WHITE_STONE);
  }
  for (let d = -4; d <= 4; d++) {
    putC(ax - 4, fy, az + d, BLOCK.WHITE_STONE);
    putC(ax + 4, fy, az + d, BLOCK.WHITE_STONE);
    if (Math.abs(d) > 3) continue;
    putC(ax - 3, fy + 1, az + d, BLOCK.WHITE_STONE);
    putC(ax + 3, fy + 1, az + d, BLOCK.WHITE_STONE);
  }
  for (const d of [-1, 0, 1]) putC(ax + d, fy, az + 4, BLOCK.STONE); // 南阶门槛石

  // ③ 八角五层塔身：角柱 + 平座矮栏 + 南向券窗 + 八角腰檐大出挑（4→4→3→3→2 收分）
  const LEVELS: ReadonlyArray<{ body: number; cut: number; eave: number; eaveCut: number }> = [
    { body: 2, cut: 1, eave: 4, eaveCut: 1 },
    { body: 2, cut: 1, eave: 4, eaveCut: 2 },
    { body: 1, cut: 0, eave: 3, eaveCut: 1 },
    { body: 1, cut: 0, eave: 3, eaveCut: 2 },
    { body: 1, cut: 0, eave: 2, eaveCut: 1 },
  ];
  let y = fy + 1;
  for (const L of LEVELS) {
    balustrade(L.body + 1, 1, y); // 平座白色矮栏
    for (let r = 0; r < 2; r++) octBand(L.body, L.cut, y + r, BLOCK.RED_BRICK); // 塔身
    for (const [dx, dz] of octCols(L.body)) {
      for (let yy = y; yy <= y + 2; yy++) putC(ax + dx, yy, az + dz, BLOCK.RED_BRICK); // 角柱
    }
    putC(ax, y, az + L.body, BLOCK.AIR); // 南向券门/窗（1×2 洞）
    putC(ax, y + 1, az + L.body, BLOCK.AIR);
    octDisc(L.eave, L.eaveCut, y + 2, BLOCK.DARK_TILE); // 八角腰檐（实心盘兼楼板）
    y += 3;
  }

  // ④ 铜制攒尖金顶（YELLOW_TILE 收分 + 顶珠 + 金针——新塔贴金顶）
  octDisc(1, 0, y, BLOCK.YELLOW_TILE); // 3×3 金盘
  putC(ax, y + 1, az, BLOCK.YELLOW_TILE); // 顶珠
  putC(ax, y + 2, az, BLOCK.YELLOW_TILE); // 金针

  // ⑤ 底层长明灯
  putC(ax, fy + 1, az, BLOCK.GLOWBLOCK);
}

// ---------------------------------------------------------------------------
// tulou 圆形土楼（福建常见中频）—— FOOTPRINT_R 7
// ---------------------------------------------------------------------------

/**
 * 圆形土楼（外径 15 = r7）：夯土大圆环墙（环带 25 < d² ≤ 49 即厚 2 格、高 5：
 * GREY_BRICK 为主混 SANDSTONE/COBBLE 逐块 hash 拼色——夯土质感）+ 南正门
 * （1×2 拱门洞 + RED_DOOR 乌漆大门两扇 + DARK_TILE 门匾 + GREY_BRICK 券顶）+
 * 瓦顶圈（DARK_TILE 环形坡面两圈：外圈 r5.5-7 @fy+5 低、内圈 r3-5.5 @fy+6 高
 * ——内缘略高，8 根 PLANKS 柱顶起内圈）+ 内圈木构房（r3-4.5 一圈环形矮房高 3：
 * PLANKS/DARK_WOOD hash 混砌，内圈脸开 GLASS 小窗）+ 内院（夯土 DIRT/COBBLE
 * 满铺 + 内圈走廊 PLANKS 环形铺 + 中央 STONE 水井 + 北向祖堂：GREY_BRICK 台基
 * + DARK_WOOD 柱 + DARK_TILE 顶）。总高 ~7 格（内圈瓦顶 fy+6）；
 * 全部落块在 d² ≤ 49 → Chebyshev ≤ 7 = FOOTPRINT_R。
 */
export function stampTulou(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 8);
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  /** 夯土拼色：GREY_BRICK 为主，混 SANDSTONE/COBBLE（逐块确定性 hash） */
  const rammed = (x: number, y: number, z: number): number => {
    const h = hash2(x * 7 + y * 13, z * 11 - y * 5);
    return h < 0.6 ? BLOCK.GREY_BRICK : h < 0.85 ? BLOCK.SANDSTONE : BLOCK.COBBLE;
  };

  // ① 先掏内院（内圈净空；环墙/瓦顶随后回填）
  clearBox(ax - 4, fy, az - 4, ax + 4, fy + 5, az + 4, put);

  // ② 夯土大圆环墙（环带 25 < d² ≤ 49，高 5：fy..fy+4，随地形垫脚）
  for (let dx = -7; dx <= 7; dx++) {
    for (let dz = -7; dz <= 7; dz++) {
      const d2 = dx * dx + dz * dz;
      if (d2 <= 25 || d2 > 49) continue;
      const wx = ax + dx;
      const wz = az + dz;
      const ch = heightAt(wx, wz);
      for (let y = ch + 1; y < fy; y++) putC(wx, y, wz, rammed(wx, y, wz)); // 垫脚
      for (let y = fy; y <= fy + 4; y++) putC(wx, y, wz, rammed(wx, y, wz));
    }
  }

  // ③ 南正门：拱门洞（1×2）+ 乌漆大门两扇 + DARK_TILE 门匾 + GREY_BRICK 券顶
  for (let y = fy; y <= fy + 1; y++) {
    putC(ax, y, az + 6, BLOCK.AIR);
    putC(ax, y, az + 7, BLOCK.AIR);
  }
  for (const d of [-1, 1]) {
    for (let y = fy; y <= fy + 1; y++) putC(ax + d, y, az + 7, BLOCK.RED_DOOR);
  }
  for (const d of [-1, 0, 1]) putC(ax + d, fy + 2, az + 7, BLOCK.DARK_TILE); // 门匾
  for (const d of [-1, 0, 1]) {
    putC(ax + d, fy + 3, az + 6, BLOCK.GREY_BRICK); // 券顶
    putC(ax + d, fy + 3, az + 7, BLOCK.GREY_BRICK);
  }

  // ④ 瓦顶圈：DARK_TILE 环形坡面两圈（外低内高——土楼屋顶向内倾泻）
  for (let dx = -7; dx <= 7; dx++) {
    for (let dz = -7; dz <= 7; dz++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > 30 && d2 <= 49) putC(ax + dx, fy + 5, az + dz, BLOCK.DARK_TILE); // 外圈（低）
      else if (d2 > 9 && d2 <= 30) putC(ax + dx, fy + 6, az + dz, BLOCK.DARK_TILE); // 内圈（高）
    }
  }

  // ⑤ 内圈木构房：环形矮房高 3（PLANKS/DARK_WOOD hash），内圈脸开 GLASS 小窗
  for (let dx = -5; dx <= 5; dx++) {
    for (let dz = -5; dz <= 5; dz++) {
      const d2 = dx * dx + dz * dz;
      if (d2 <= 9 || d2 > 20) continue;
      const wx = ax + dx;
      const wz = az + dz;
      const wood = hash2(wx * 3 + 5, wz * 5 - 3) < 0.5 ? BLOCK.PLANKS : BLOCK.DARK_WOOD;
      for (let y = fy; y <= fy + 2; y++) putC(wx, y, wz, wood);
      if (d2 <= 13) putC(wx, fy + 1, wz, BLOCK.GLASS); // 内圈脸小窗
    }
  }

  // ⑥ 支撑柱：8 根 PLANKS 柱（自内圈房顶一直顶到内圈瓦顶）
  for (const [dx, dz] of [
    [4, 0], [0, 4], [-4, 0], [0, -4], [3, 3], [-3, 3], [3, -3], [-3, -3],
  ] as const) {
    for (let y = fy + 3; y <= fy + 5; y++) putC(ax + dx, y, az + dz, BLOCK.PLANKS);
  }

  // ⑦ 内院地面：夯土 DIRT/COBBLE 满铺 + 内圈走廊 PLANKS 环形铺（随地形垫平）
  for (let dx = -5; dx <= 5; dx++) {
    for (let dz = -5; dz <= 5; dz++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > 25) continue;
      const wx = ax + dx;
      const wz = az + dz;
      const ch = heightAt(wx, wz);
      for (let y = ch + 1; y <= fy - 2; y++) putC(wx, y, wz, BLOCK.DIRT); // 院坪垫脚
      const pave = d2 > 20
        ? BLOCK.PLANKS
        : hash2(wx + 9, wz - 9) < 0.5
          ? BLOCK.DIRT
          : BLOCK.COBBLE;
      putC(wx, fy - 1, wz, pave);
    }
  }

  // ⑧ 北向祖堂（3×2 矮堂，朝南）：GREY_BRICK 台基 + DARK_WOOD 柱 + DARK_TILE 顶
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -3; dz <= -2; dz++) {
      putC(ax + dx, fy, az + dz, BLOCK.GREY_BRICK); // 石砌台基
      putC(ax + dx, fy + 3, az + dz, BLOCK.DARK_TILE); // 祖堂顶
    }
  }
  for (const [dx, dz] of [[-1, -3], [1, -3], [-1, -2], [1, -2]] as const) {
    for (let y = fy + 1; y <= fy + 2; y++) putC(ax + dx, y, az + dz, BLOCK.DARK_WOOD); // 柱
  }
  putC(ax, fy + 1, az - 3, BLOCK.PLANKS); // 供桌

  // ⑨ 中央水井（STONE 井圈 1 块）
  putC(ax, fy, az, BLOCK.STONE);
}
