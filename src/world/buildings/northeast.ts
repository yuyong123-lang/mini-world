// world/buildings/northeast.ts —— 东北组结构 stamp（覆盖区域：黑龙江 / 吉林 / 辽宁，
// 对应 parts/dongbei3.ts）。W1-A1 实装：
//   - sophia_church　圣索菲亚教堂（哈尔滨）：红砖大厅 + 绿色洋葱头穹顶 + 侧面钟楼
//   - chaoxian_house　朝鲜族青瓦民居：白灰墙 + 檐廊 + 庑殿缓坡青瓦顶 + 院心酱缸坛
//   - dazhengdian　沈阳故宫大政殿：八角须弥座 + 朱红柱廊 + 双重檐黄琉璃攒尖顶
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]（sophia_church 5 / chaoxian_house 4 / dazhengdian 5）；
// 高度封顶一律 kit.topClamp；内部顺序 clearBox → foundation → 墙/顶 → 装饰。
//
// 特征方块锚点（FEATURE_BLOCK 表 + structures.test 断言窗口：锚点 ±2、fy..fy+8）：
//   sophia_church → RED_BRICK（殿内四根束柱在 (±2,±2) 即窗口内）
//   chaoxian_house → DARK_TILE（屋顶第二层坡在 ±2 内）
//   dazhengdian → YELLOW_TILE（下檐黄琉璃盘在 fy+5、±2 内）
// kit.hipRoof 的冻结形状是「外缘最高、逐层内收下探」（盔顶基形），与本组需要的
// 「脊高檐低」坡屋顶相反，故本组坡屋顶用 slab 逐层收分手排（同 palace 双重檐先例）。

import { BLOCK } from '../../blocks/registry';

import {
  arch,
  clearBox,
  foundation,
  ringWall,
  slab,
  topClamp,
  wallsRect,
  type HeightAt,
  type StructPut,
} from './kit';

/** 本组内用的 Chebyshev 环：max(|dx|,|dz|) === r 的一圈（方形环） */
function bandRect(
  cx: number,
  cz: number,
  r: number,
  y: number,
  mat: number,
  put: StructPut,
): void {
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      put(cx + dx, y, cz + dz, mat, true);
    }
  }
}

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

// ---------------------------------------------------------------------------
// sophia_church 圣索菲亚教堂（哈尔滨）—— FOOTPRINT_R 5
// ---------------------------------------------------------------------------

/**
 * 红砖大厅 9×9（fy..fy+6，四面拱窗+南向五连拱主入口）→ 檐口带 + 殿内十字拱环
 * → 红砖鼓座（4 窗）→ 绿琉璃洋葱头穹顶（Ø5 肩盘 → Ø5 环 → Ø3 环 → 顶石）
 * → 鎏金十字（竖 3 横 2）。北面附壁一座 3×3 实心红砖钟楼，绿顶小洋葱 + 金顶。
 * 殿内 clearBox 掏空到 fy+13：高窗 + 中央 3×3 采光井仰望穹顶，井中悬萤石灯。
 * 水平包络：大厅 ±4、钟楼 az−5、入口台阶 az+5 → Chebyshev ≤ 5 = FOOTPRINT_R。
 */
export function stampSophiaChurch(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const cap = topClamp(fy, 16); // 全楼封顶（十字最高点）
  const y = (off: number): number => Math.min(fy + off, cap);
  const x0 = ax - 4;
  const x1 = ax + 4;
  const z0 = az - 4;
  const z1 = az + 4;

  // ① 殿内掏空（±3，直达穹顶下沿；中央 3×3 留作采光井，井内仰望穹顶）
  clearBox(ax - 3, fy, az - 3, ax + 3, y(13), az + 3, put);

  // ② 地基 + 石地坪 + 入口台阶（南面外挑 1）
  foundation(x0, z0, x1, z1, fy, BLOCK.STONE, heightAt, put);
  foundation(ax - 2, z1 + 1, ax + 2, z1 + 1, fy - 1, BLOCK.STONE, heightAt, put);
  foundation(ax - 1, z0 - 1, ax + 1, z0 - 1, fy, BLOCK.STONE, heightAt, put); // 钟楼垫脚
  slab(x0, z0, x1, z1, fy - 1, BLOCK.STONE, put);
  slab(ax - 2, z1 + 1, ax + 2, z1 + 1, fy - 1, BLOCK.STONE, put); // 台阶

  // ③ 红砖外墙（fy..fy+6）
  wallsRect(x0, z0, x1, z1, fy, fy + 6, BLOCK.RED_BRICK, put);

  // ④ 四面拱窗：玻璃双层 + 红砖拱头（fy+4）
  const windows: Array<[number, number]> = [
    [x0, az - 2], [x0, az], [x0, az + 2], // 西墙
    [x1, az - 2], [x1, az], [x1, az + 2], // 东墙
    [ax - 3, z0], [ax + 3, z0], // 北墙（钟楼两侧）
    [ax - 3, z1], [ax + 3, z1], // 南墙（大门两侧）
  ];
  for (const [wx, wz] of windows) {
    put(wx, fy + 2, wz, BLOCK.GLASS, true);
    put(wx, fy + 3, wz, BLOCK.GLASS, true);
    put(wx, fy + 4, wz, BLOCK.RED_BRICK, true);
  }
  // 主入口：南墙中央五连拱门洞（arch 工具掏出 3 宽 2 高门洞 + 券顶石）
  arch(ax - 2, ax + 2, fy, z1, BLOCK.RED_BRICK, put);

  // ⑤ 北面钟楼：3×3 实心红砖方柱（fy..fy+6，比大厅矮、与大穹顶成主从组合）
  for (let yl = fy; yl <= fy + 6; yl++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -5; dz <= -3; dz++) put(ax + dx, yl, az + dz, BLOCK.RED_BRICK, true);
    }
  }
  for (let dx = -1; dx <= 1; dx++) {
    for (let yl = fy + 4; yl <= fy + 5; yl++) put(ax + dx, yl, z0 - 1, BLOCK.AIR, true); // 开窗
  }
  slab(ax - 1, z0 - 1, ax + 1, az - 3, y(7), BLOCK.GREEN_TILE, put); // 钟楼檐口
  ringWall(ax, az - 4, 1, y(8), y(8), BLOCK.GREEN_TILE, put); // 小洋葱（十字环收分）
  put(ax, y(9), az - 4, BLOCK.GREEN_TILE, true);
  put(ax, y(10), az - 4, BLOCK.YELLOW_TILE, true); // 金顶

  // ⑥ 殿内四根红砖束柱（fy..fy+6，托住十字拱环；也是特征方块锚点）
  for (const [px, pz] of [[ax - 2, az - 2], [ax + 2, az - 2], [ax - 2, az + 2], [ax + 2, az + 2]] as const) {
    for (let yl = fy; yl <= fy + 6; yl++) put(px, yl, pz, BLOCK.RED_BRICK, true);
  }

  // ⑦ 屋顶过渡（fy+7）：檐口带（Chebyshev 3-4 圈，黛瓦）+ 殿内十字拱环（Chebyshev 2 红砖圈）
  for (let r = 3; r <= 4; r++) bandRect(ax, az, r, y(7), BLOCK.DARK_TILE, put);
  bandRect(ax, az, 2, y(7), BLOCK.RED_BRICK, put);

  // ⑧ 红砖鼓座（fy+8..fy+9，四面采光窗）
  ringWall(ax, az, 2, y(8), y(9), BLOCK.RED_BRICK, put);
  for (const [wx, wz] of [[ax, az - 2], [ax, az + 2], [ax - 2, az], [ax + 2, az]] as const) {
    put(wx, y(8), wz, BLOCK.GLASS, true);
  }

  // ⑨ 绿琉璃洋葱头穹顶：Ø5 肩盘（5×5 去角留心）→ Ø5 环 → Ø3 环 → 顶石
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue; // 去四角
      if (dx === 0 && dz === 0) continue; // 留心：采光井通到穹顶
      put(ax + dx, y(10), az + dz, BLOCK.GREEN_TILE, true);
    }
  }
  ringWall(ax, az, 2, y(11), y(11), BLOCK.GREEN_TILE, put);
  ringWall(ax, az, 1, y(12), y(12), BLOCK.GREEN_TILE, put);
  put(ax, y(13), az, BLOCK.GREEN_TILE, true);

  // ⑩ 鎏金十字：竖 3 横 2
  for (let yl = 14; yl <= 16; yl++) put(ax, y(yl), az, BLOCK.YELLOW_TILE, true);
  put(ax - 1, y(15), az, BLOCK.YELLOW_TILE, true);
  put(ax + 1, y(15), az, BLOCK.YELLOW_TILE, true);

  // ⑪ 殿内顶灯（采光井中悬灯）
  put(ax, fy + 6, az, BLOCK.GLOWBLOCK, true);
}

// ---------------------------------------------------------------------------
// chaoxian_house 朝鲜族青瓦民居（吉林常见）—— FOOTPRINT_R 4
// ---------------------------------------------------------------------------

/**
 * 白灰墙 7×5（fy..fy+3）+ 深色木梁架（四角柱 + 前檐柱一排）+ 前廊木地板；
 * 庑殿缓坡青瓦顶：檐口板外挑 1（±4/±3）后三层收分（fy+4..fy+7），正脊两端上翘；
 * 南院一坛酱缸（3 个 GREY_BRICK 矮柱）。水平包络 Chebyshev ≤ 4 = FOOTPRINT_R。
 */
export function stampChaoxianHouse(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const cap = topClamp(fy, 8); // 脊端上翘最高点
  const y = (off: number): number => Math.min(fy + off, cap);
  const x0 = ax - 3;
  const x1 = ax + 3;
  const z0 = az - 2;
  const z1 = az + 2;

  // ① 室内掏空（净高 4，檐口板即天花板）
  clearBox(ax - 2, fy, az - 1, ax + 2, y(3), az + 1, put);

  // ② 地基 + 木地板 + 前廊木地板（满铺、温突地面的体素表达）
  foundation(x0, z0, x1, z1, fy, BLOCK.PLANKS, heightAt, put);
  foundation(x0, z1 + 1, x1, z1 + 1, fy - 1, BLOCK.PLANKS, heightAt, put);
  slab(x0, z0, x1, z1, fy - 1, BLOCK.PLANKS, put);
  slab(x0, z1 + 1, x1, z1 + 1, fy - 1, BLOCK.DARK_WOOD, put); // 前廊（maru）

  // ③ 白灰墙（fy..fy+3）
  wallsRect(x0, z0, x1, z1, fy, fy + 3, BLOCK.WHITE_STONE, put);

  // ④ 木梁架：四角柱 + 前檐柱一排（深色木，承挑檐）
  for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]] as const) {
    for (let yl = fy; yl <= fy + 3; yl++) put(px, yl, pz, BLOCK.DARK_WOOD, true);
  }
  for (const px of [ax - 2, ax, ax + 2]) {
    for (let yl = fy; yl <= y(3); yl++) put(px, yl, z1 + 1, BLOCK.DARK_WOOD, true);
  }

  // ⑤ 门窗：低矮门洞（南墙正中 2 高）+ 支摘窗（玻璃格）
  put(ax, fy, z1, BLOCK.AIR, true);
  put(ax, fy + 1, z1, BLOCK.AIR, true);
  put(ax, y(2), z1, BLOCK.DARK_WOOD, true); // 门头横梁
  for (const wx of [ax - 2, ax + 2]) {
    put(wx, fy + 1, z1, BLOCK.GLASS, true);
    put(wx, y(2), z1, BLOCK.GLASS, true);
  }
  for (const wz of [az - 1, az, az + 1]) {
    put(x0, fy + 1, wz, BLOCK.GLASS, true);
    put(x1, fy + 1, wz, BLOCK.GLASS, true);
  }
  put(ax, y(2), z0, BLOCK.GLASS, true); // 北墙高窗

  // ⑥ 庑殿缓坡青瓦顶：檐口板外挑 1 → 三层收分 → 正脊 → 脊端上翘
  slab(ax - 4, z0 - 1, ax + 4, z1 + 1, y(4), BLOCK.DARK_TILE, put);
  slab(ax - 3, z0, ax + 3, z1, y(5), BLOCK.DARK_TILE, put);
  slab(ax - 2, z0 + 1, ax + 2, z1 - 1, y(6), BLOCK.DARK_TILE, put);
  slab(ax - 1, az, ax + 1, az, y(7), BLOCK.DARK_TILE, put); // 正脊
  put(ax - 2, y(7), az, BLOCK.DARK_TILE, true); // 脊端上翘（戗脊起翘）
  put(ax + 2, y(7), az, BLOCK.DARK_TILE, true);

  // ⑦ 院心酱缸坛（jangdokdae）：3 个 GREY_BRICK 矮柱（落地、随地形）
  for (const px of [ax - 2, ax, ax + 2]) {
    const gy = heightAt(px, z1 + 2);
    put(px, gy + 1, z1 + 2, BLOCK.GREY_BRICK, true);
  }

  // ⑧ 室内顶灯
  put(ax, y(3), az, BLOCK.GLOWBLOCK, true);
}

// ---------------------------------------------------------------------------
// dazhengdian 沈阳故宫大政殿（辽宁）—— FOOTPRINT_R 5
// ---------------------------------------------------------------------------

/**
 * 八角亭式殿：两层须弥座石台基（STONE R5 削角 + GREY_BRICK R4 地坪）→
 * 朱红柱廊八角 8 柱（fy..fy+4）+ 内芯青砖墙（南门）→ 下檐黄琉璃八角盘（出挑到 ±5）
 * → 朱红方鼓座（fy+6..fy+7）→ 上檐黄琉璃盘（±4）→ 四层收分攒尖 → 金顶珠。
 * 水平包络 Chebyshev ≤ 5 = FOOTPRINT_R；总高 fy−2..fy+12（约 12 格殿身）。
 */
export function stampDazhengdian(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const cap = topClamp(fy, 12); // 顶珠
  const y = (off: number): number => Math.min(fy + off, cap);

  // ① 殿身 + 柱廊空间掏空（下檐即天棚）
  clearBox(ax - 3, fy, az - 3, ax + 3, y(4), az + 3, put);

  // ② 须弥座两层（下层 STONE 削角方盘、上层 GREY_BRICK 地坪）
  foundation(ax - 5, az - 5, ax + 5, az + 5, fy - 1, BLOCK.STONE, heightAt, put);
  octDisc(ax, az, 5, 2, fy - 2, BLOCK.STONE, put);
  octDisc(ax, az, 4, 1, fy - 1, BLOCK.GREY_BRICK, put);

  // ③ 朱红柱廊：八角 8 柱（fy..fy+4）
  for (const [dx, dz] of [
    [3, 0], [-3, 0], [0, 3], [0, -3], [3, 3], [3, -3], [-3, 3], [-3, -3],
  ] as const) {
    for (let yl = fy; yl <= fy + 4; yl++) put(ax + dx, yl, az + dz, BLOCK.RED_WALL, true);
  }

  // ④ 内芯青砖墙（3×3，南面开门）+ 殿内顶灯
  wallsRect(ax - 1, az - 1, ax + 1, az + 1, fy, fy + 3, BLOCK.GREY_BRICK, put);
  put(ax, fy, az + 1, BLOCK.AIR, true);
  put(ax, fy + 1, az + 1, BLOCK.AIR, true);
  put(ax, y(3), az, BLOCK.GLOWBLOCK, true);

  // ⑤ 下檐：黄琉璃八角盘（出挑到 ±5，盖住柱头）
  octDisc(ax, az, 5, 2, y(5), BLOCK.YELLOW_TILE, put);

  // ⑥ 上层鼓座：朱红方环（fy+6..fy+7）
  wallsRect(ax - 2, az - 2, ax + 2, az + 2, y(6), y(7), BLOCK.RED_WALL, put);

  // ⑦ 上檐：黄琉璃盘（±4）
  octDisc(ax, az, 4, 1, y(8), BLOCK.YELLOW_TILE, put);

  // ⑧ 攒尖四层收分 + 金顶珠
  octDisc(ax, az, 3, 1, y(9), BLOCK.YELLOW_TILE, put);
  octDisc(ax, az, 2, 0, y(10), BLOCK.YELLOW_TILE, put);
  octDisc(ax, az, 1, 0, y(11), BLOCK.YELLOW_TILE, put);
  put(ax, y(12), az, BLOCK.YELLOW_TILE, true); // 顶珠
}
