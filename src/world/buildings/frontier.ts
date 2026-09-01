// world/buildings/frontier.ts —— 西域组结构 stamp（覆盖区域：新疆增强 / 甘肃（parts/xiyu））
//
// 本文件负责的 StructureKind（2 个；W3-A1 实装）：
//   - sugong_tower　苏公塔（圆柱土黄砖塔+锥顶+礼拜殿，新疆）｜特征方块 SANDSTONE
//   - jiayuguan　嘉峪关（夯土关城+城楼+两翼长城，甘肃，r8）｜特征方块 GREY_BRICK
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]（sugong_tower 3 / jiayuguan 8）；高度封顶一律 kit.topClamp；
// 输出只经 put 回调；同输入两次 stamp 逐位一致（内部"随机"一律 hash2，不接 rng 流）。
//
// 特征方块锚点（FEATURE_BLOCK 表 + structures.test 断言窗口：锚点 ±2、fy..fy+8）：
//   sugong_tower → SANDSTONE（塔身 r2 环墙在 (ax±2, fy, az-1)，覆盖锚点窗口）
//   jiayuguan    → GREY_BRICK（城内东北角点将台两层方台，(ax+2, fy, az-2) 落在窗口）

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

/** 偶数判定（负坐标安全的 mod 2）：垛口「每 2 格 1 凹凸」用 */
function even(v: number): boolean {
  return ((v % 2) + 2) % 2 === 0;
}

// ---------------------------------------------------------------------------
// sugong_tower —— 苏公塔（新疆吐鲁番稀有地标，r3）
// ---------------------------------------------------------------------------

/**
 * 苏公塔（额敏塔）：圆柱形土黄砖塔（SANDSTONE 环墙 r2、砖面 GREY_BRICK 按
 * hash 稀疏嵌块做砖纹）高 10，塔身三向 1×2 竖长窗洞（东/西/北，错层）；
 * 上部收分 + 圆锥形顶（实心圆盘 r2 → r1 逐层收分 → GREY_BRICK 宝珠 2 段）；
 * 塔心 1 格竖井由环墙自然围出，南向 1×2 塔门与礼拜殿相通。塔旁南面附建
 * 小礼拜殿（5×3 SANDSTONE 平墙贴塔而建——FOOTPRINT_R 3 的包络铁律下以
 * 「北行贴塔基」表达 5×4 的殿身）+ 扁平穹顶（椭圆盘两层收顶 + GREY_BRICK
 * 顶珠）+ 尖拱门（kit.arch 券脚 + 尖顶石上移）+ 西南角短宣礼台。
 * 总高 ~14 格（塔顶宝珠 fy+13）；水平包络 Chebyshev ≤ 3 = FOOTPRINT_R。
 */
export function stampSugongTower(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 14); // 塔顶宝珠
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const tcz = az - 1; // 塔心（北偏 1 格，南面让位给礼拜殿）
  /** 塔身砖：SANDSTONE 主体 + GREY_BRICK 哈希稀疏嵌块（砖纹） */
  const bodyBlock = (x: number, y: number, z: number): number =>
    hash2(x * 3 + y * 7, z * 5 - y * 13) < 0.12 ? BLOCK.GREY_BRICK : BLOCK.SANDSTONE;
  /** r2 环墙单元（与 kit.ringWall r2 同一枚：去四角 + 内径 0.4 的厚环） */
  const ringCell = (dx: number, dz: number): boolean => {
    if (Math.abs(dx) === 2 && Math.abs(dz) === 2) return false;
    const d2 = dx * dx + dz * dz;
    return d2 <= 4 && d2 > 0.16;
  };

  // ① 礼拜殿净室掏空（后续墙体/穹顶回填）
  clearBox(ax - 1, fy, az + 2, ax + 1, fy + 2, az + 2, put);

  // ② 台基：塔座 + 殿基整片随地形垫脚（5×7）
  foundation(ax - 2, az - 3, ax + 2, az + 3, fy, BLOCK.SANDSTONE, heightAt, put);

  // ③ 塔身：r2 环墙 10 层（砖纹嵌块随层错缝）
  for (let y = fy; y <= fy + 9; y++) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (!ringCell(dx, dz)) continue;
        putC(ax + dx, y, tcz + dz, bodyBlock(ax + dx, y, tcz + dz));
      }
    }
  }

  // ④ 塔身狭长窗洞 3 个（1×2 竖洞，东/西/北错层；南面让给塔门）
  for (let y = fy + 3; y <= fy + 4; y++) putC(ax + 2, y, tcz, BLOCK.AIR); // 东窗
  for (let y = fy + 5; y <= fy + 6; y++) putC(ax - 2, y, tcz, BLOCK.AIR); // 西窗
  for (let y = fy + 7; y <= fy + 8; y++) putC(ax, y, tcz - 2, BLOCK.AIR); // 北窗

  // ⑤ 上部收分 + 圆锥形顶：实心圆盘 r2 → r1 → GREY_BRICK 宝珠
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
      if (dx * dx + dz * dz > 4) continue;
      putC(ax + dx, fy + 10, tcz + dz, bodyBlock(ax + dx, fy + 10, tcz + dz)); // 顶盘
    }
  }
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    putC(ax + dx, fy + 11, tcz + dz, BLOCK.SANDSTONE); // 收分层
  }
  putC(ax, fy + 12, tcz, BLOCK.GREY_BRICK); // 宝珠
  putC(ax, fy + 13, tcz, BLOCK.GREY_BRICK); // 宝珠顶

  // ⑥ 小礼拜殿（5×3 平墙贴塔而建，南正面 hz1）
  const hx0 = ax - 2;
  const hx1 = ax + 2;
  const hz0 = az + 1;
  const hz1 = az + 3;
  slab(hx0, hz0, hx1, hz1, fy - 1, BLOCK.SANDSTONE, put); // 殿内地坪
  wallsRect(hx0, hz0, hx1, hz1, fy, fy + 2, BLOCK.SANDSTONE, put); // 平墙 3 层
  // 尖拱门（南墙）：kit.arch 券脚 + 券顶石，再抬净空至 2 格、加 GREY_BRICK 尖顶石
  arch(ax - 1, ax + 1, fy, hz1, BLOCK.SANDSTONE, put);
  putC(ax, fy + 1, hz1, BLOCK.AIR);
  putC(ax, fy + 2, hz1, BLOCK.GREY_BRICK);
  // 扁平穹顶：殿顶平盘 + 椭圆盘两层收顶 + GREY_BRICK 顶珠（新月顶饰的砖珠表达）
  slab(hx0, hz0, hx1, hz1, fy + 3, BLOCK.SANDSTONE, put);
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if ((dx * dx) / 4 + dz * dz > 1) continue; // 椭圆盘（穹顶初层）
      putC(ax + dx, fy + 4, az + 2 + dz, BLOCK.SANDSTONE);
    }
  }
  putC(ax, fy + 5, az + 2, BLOCK.GREY_BRICK); // 穹顶珠
  // 殿内长明灯
  putC(ax, fy + 2, az + 2, BLOCK.GLOWBLOCK);
  // 短宣礼台（西南角殿顶上：短柱 + GREY_BRICK 顶石）
  putC(ax - 2, fy + 4, az + 3, BLOCK.SANDSTONE);
  putC(ax - 2, fy + 5, az + 3, BLOCK.SANDSTONE);
  putC(ax - 2, fy + 6, az + 3, BLOCK.GREY_BRICK);

  // ⑦ 塔门（南向 1×2，从礼拜殿通塔心竖井）
  putC(ax, fy, az + 1, BLOCK.AIR);
  putC(ax, fy + 1, az + 1, BLOCK.AIR);
}

// ---------------------------------------------------------------------------
// jiayuguan —— 嘉峪关关城（甘肃稀有地标，r8，本组最大建筑）
// ---------------------------------------------------------------------------

/**
 * 嘉峪关「天下第一雄关」：
 *   ① 夯土城垣 13×11（GREY_BRICK 主体混 SANDSTONE 拼色 hash 做夯土质感），
 *      墙身高 5（fy..fy+4），顶部垛口每 2 格 1 凹凸；城内 clearBox 出平场
 *      （斜坡削平 + foundation 垫脚 → 城内地面恒为 fy-1）；北墙留 1×2 便门。
 *   ② 中央城台（5×3 实心夯土，高 6）骑在南墙正中，下开大券门洞：3 宽贯通
 *      南北（城台厚 3），净空 2 格 + 半圆券（券脚 GREY_BRICK + 券顶带，券心
 *      嵌 GLOWBLOCK 长明灯）。
 *   ③ 中央城楼坐在城台正门上方：RED_WALL 柱墙两层实心层 + YELLOW_TILE 大出挑
 *      檐盘两重 + 歇山顶（gableRoof 沿 X 屋脊），楼顶 fy+14（含城台总高 15）。
 *   ④ 两翼长城延伸段：自城垣东西两侧沿 X 延伸至 footprint 边缘（ax±8），墙高
 *      4 每列按 heightAt 落地（长城随山势起伏——铁律允许的 heightAt 公式几何）
 *      + 垛口。
 *   ⑤ 城内东北角点将台（GREY_BRICK 方台两层）+ 旗杆（LOG 杆 + WOOL 旗 2 块），
 *      城内十字砖小径贯通券洞与便门。
 * 特征块 GREY_BRICK 大量；水平包络 Chebyshev ≤ 8 = FOOTPRINT_R。
 */
export function stampJiayuguan(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 16); // 城楼正脊
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  /** 夯土拼色：GREY_BRICK 主体混 SANDSTONE（逐块确定性 hash 二选一） */
  const hangtu = (x: number, y: number, z: number): number =>
    hash2(x * 7 + y * 13, z * 11 - y * 5) < 0.78 ? BLOCK.GREY_BRICK : BLOCK.SANDSTONE;

  const x0 = ax - 6;
  const x1 = ax + 6; // 城垣 13 宽
  const z0 = az - 5;
  const z1 = az + 5; // 城垣 11 深

  // ① 地基垫脚（全城坪，斜坡自动垫平到 fy-1）+ 城内平场（削去城内突起地形）
  foundation(x0, z0, x1, z1, fy, BLOCK.GREY_BRICK, heightAt, put);
  clearBox(x0 + 1, fy, z0 + 1, x1 - 1, fy + 6, z1 - 1, put);

  // ② 夯土城垣（13×11，高 5）+ 顶部垛口（每 2 格 1 凹凸）
  for (let y = fy; y <= fy + 4; y++) {
    for (let x = x0; x <= x1; x++) {
      putC(x, y, z0, hangtu(x, y, z0));
      putC(x, y, z1, hangtu(x, y, z1));
    }
    for (let z = z0; z <= z1; z++) {
      putC(x0, y, z, hangtu(x0, y, z));
      putC(x1, y, z, hangtu(x1, y, z));
    }
  }
  for (let x = x0; x <= x1; x++) {
    if (even(x)) {
      putC(x, fy + 5, z0, hangtu(x, fy + 5, z0));
      putC(x, fy + 5, z1, hangtu(x, fy + 5, z1));
    }
  }
  for (let z = z0; z <= z1; z++) {
    if (even(z)) {
      putC(x0, fy + 5, z, hangtu(x0, fy + 5, z));
      putC(x1, fy + 5, z, hangtu(x1, fy + 5, z));
    }
  }
  // 北墙便门（1×2，通城内十字小径）
  putC(ax, fy, z0, BLOCK.AIR);
  putC(ax, fy + 1, z0, BLOCK.AIR);

  // ③ 中央城台（5×3 实心夯土，骑南墙，高 6）+ 大券门洞（3 宽贯通南北）
  const gx0 = ax - 2;
  const gx1 = ax + 2;
  const gz0 = az + 4;
  const gz1 = az + 6;
  for (let y = fy; y <= fy + 5; y++) {
    for (let x = gx0; x <= gx1; x++) {
      for (let z = gz0; z <= gz1; z++) putC(x, y, z, hangtu(x, y, z));
    }
  }
  for (let z = gz0; z <= gz1; z++) {
    putC(ax - 1, fy, z, BLOCK.AIR); // 券洞净空（3 宽 × 2 格高）
    putC(ax, fy, z, BLOCK.AIR);
    putC(ax + 1, fy, z, BLOCK.AIR);
    putC(ax - 1, fy + 1, z, BLOCK.AIR);
    putC(ax, fy + 1, z, BLOCK.AIR);
    putC(ax + 1, fy + 1, z, BLOCK.AIR);
    putC(ax, fy + 2, z, BLOCK.AIR); // 券心升起（中央净空 3 格）
    putC(ax - 1, fy + 2, z, BLOCK.GREY_BRICK); // 起拱券脚
    putC(ax + 1, fy + 2, z, BLOCK.GREY_BRICK);
    putC(ax - 1, fy + 3, z, BLOCK.GREY_BRICK); // 半圆券顶带
    putC(ax + 1, fy + 3, z, BLOCK.GREY_BRICK);
    putC(ax, fy + 3, z, BLOCK.GLOWBLOCK); // 券心长明灯（门洞灯龛）
  }
  // 城台青砖压顶（顶满铺 GREY_BRICK 一层：台顶压脚砖 + 城楼台基）
  slab(gx0, gz0, gx1, gz1, fy + 5, BLOCK.GREY_BRICK, put);

  // ④ 中央城楼（坐在城台正门上方：RED_WALL 柱墙两层 + YELLOW_TILE 两重檐 + 歇山顶）
  const tx0 = ax - 2;
  const tx1 = ax + 2;
  const tz0 = az + 4;
  const tz1 = az + 6;
  const tier = (y0: number, y1: number): void => {
    for (let y = y0; y <= y1; y++) slab(tx0, tz0, tx1, tz1, y, BLOCK.RED_WALL, put);
  };
  tier(fy + 6, fy + 8); // 底层柱墙
  slab(ax - 3, az + 3, ax + 3, az + 7, fy + 9, BLOCK.YELLOW_TILE, put); // 下檐（大出挑）
  tier(fy + 10, fy + 11); // 上层柱墙（收腰）
  slab(ax - 3, az + 3, ax + 3, az + 7, fy + 12, BLOCK.YELLOW_TILE, put); // 上檐
  gableRoof(ax - 2, ax + 2, az + 5, fy + 14, 2, BLOCK.YELLOW_TILE, put); // 歇山顶（正脊 fy+14）

  // ⑤ 两翼长城延伸段（东西沿 X 至 footprint 边缘 ax±8；每列按 heightAt 落地 + 垛口）
  for (const s of [-1, 1]) {
    for (let dx = 7; dx <= 8; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const wx = ax + s * dx;
        const wz = az + dz;
        const base = heightAt(wx, wz) + 1; // 长城贴地形：逐列自立地起墙
        for (let y = base; y <= base + 3; y++) putC(wx, y, wz, hangtu(wx, y, wz));
        if (even(wx)) putC(wx, base + 4, wz, hangtu(wx, base + 4, wz)); // 垛口
      }
    }
  }

  // ⑥ 城内东北角点将台（GREY_BRICK 方台两层）+ 旗杆（LOG + WOOL 旗）
  const dtx0 = ax + 2;
  const dtx1 = ax + 4;
  const dtz0 = az - 4;
  const dtz1 = az - 2;
  slab(dtx0, dtz0, dtx1, dtz1, fy, BLOCK.GREY_BRICK, put); // 点将台一层
  slab(dtx0, dtz0, dtx1, dtz1, fy + 1, BLOCK.GREY_BRICK, put); // 点将台二层
  for (let y = fy + 2; y <= fy + 4; y++) putC(ax + 3, y, az - 3, BLOCK.LOG); // 旗杆
  putC(ax + 4, fy + 4, az - 3, BLOCK.WOOL); // 旗面（垂两块）
  putC(ax + 4, fy + 3, az - 3, BLOCK.WOOL);

  // ⑦ 城内十字砖小径（券洞 ↔ 便门 ↔ 两翼，与城内地面平齐）
  for (let z = z0 + 1; z <= gz1; z++) putC(ax, fy - 1, z, BLOCK.GREY_BRICK);
  for (let x = x0 + 1; x <= x1 - 1; x++) putC(x, fy - 1, az - 1, BLOCK.GREY_BRICK);
}
