// world/buildings/east1.ts —— 华东1组结构 stamp（覆盖区域：江苏 / 安徽 / 江西，
// 对应 parts/east1.ts）。W4-A1 实装：
//   - garden_pavilion　　苏州园林（白墙黛瓦园墙 + 月洞门 + 水池 + 四方亭 +
//     曲廊 + 太湖石假山 + 竹丛，江苏）｜特征方块 GREY_BRICK（四方亭台基）
//   - hui_house　　　　　徽派马头墙民居（粉墙黛瓦 + 马头墙台阶山墙，安徽常见）
//     ｜特征方块 WHITE_STONE（粉墙）
//   - tengwang_pavilion　滕王阁（高台基 + 三层收分红阁 + 三重绿琉璃檐 + 歇山绿顶，
//     江西）｜特征方块 GREEN_TILE（一层绿琉璃檐盘 fy+4 盖住锚点列）
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]（garden_pavilion 7 / hui_house 4 / tengwang_pavilion 5）；
// 高度封顶一律 kit.topClamp；内部随机一律 hash2（同输入两次 stamp 逐位一致）；
// 内部顺序：clearBox → foundation → 墙/顶 → 装饰。
//
// 特征方块锚点（FEATURE_BLOCK 表 + structures.test 断言窗口：锚点 ±2、fy..fy+8）：
//   garden_pavilion　→ GREY_BRICK（四方亭台基 3×3 在 fy，北角伸入锚点 ±2 窗口）
//   hui_house　　　　→ WHITE_STONE（粉墙充满锚点 ±2 窗口）
//   tengwang_pavilion→ GREEN_TILE（一层绿琉璃檐盘 9×7 在 fy+4 盖住锚点列）

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
// garden_pavilion 苏州园林（江苏稀有地标）—— FOOTPRINT_R 7
// ---------------------------------------------------------------------------

/**
 * 半亩方园（15×15 园墙）：白墙黛瓦云墙（WHITE_STONE 墙高 3 + DARK_TILE 压顶），
 * 南墙正中开月洞门（DARK_TILE 圆环嵌墙、中央掏空——园林标志）→ 园南中心
 * 5×4 水池（挖深 2、SANDSTONE 池底、注 WATER 一层、四周 STONE 石栏）→
 * 水池北岸四方亭（GREY_BRICK 台基 3×3 + 4 根 DARK_WOOD 柱 + 黛瓦攒尖顶
 * 5×5→3×3→1 逐层收分 + 金顶珠 + 亭内石桌）→ 西侧曲廊一段（L 形 4+3：
 * GREY_BRICK 廊基 + 矮柱 + DARK_WOOD 廊顶）→ 东角太湖石假山（STONE/COBBLE
 * 按 hash 不规则堆叠 2~3 层、高 3，留透洞一个）→ 竹丛 2 处（BAMBOO 每丛
 * hash 取 3~5 根、高 2~3）。
 * 水平包络：园墙 ±7（= FOOTPRINT_R），其余要素均在墙内。
 */
export function stampGardenPavilion(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 8); // 亭顶珠
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const WS = BLOCK.WHITE_STONE;
  const DT = BLOCK.DARK_TILE;
  const R = 7; // 园墙半径（= FOOTPRINT_R）
  const x0 = ax - R;
  const x1 = ax + R;
  const z0 = az - R;
  const z1 = az + R; // 南墙（正面）

  // ① 园内上空清空（防外部树冠/地形残留侵入；园墙随后回填）
  clearBox(x0 + 1, fy, z0 + 1, x1 - 1, top, z1 - 1, put);

  // ② 云墙：白墙高 3 + 黛瓦压顶；沿墙一圈逐列垫脚（斜坡自动垫）
  for (let x = x0; x <= x1; x++) {
    foundation(x, z0, x, z0, fy, WS, heightAt, put);
    foundation(x, z1, x, z1, fy, WS, heightAt, put);
  }
  for (let z = z0 + 1; z <= z1 - 1; z++) {
    foundation(x0, z, x0, z, fy, WS, heightAt, put);
    foundation(x1, z, x1, z, fy, WS, heightAt, put);
  }
  wallsRect(x0, z0, x1, z1, fy, fy + 2, WS, put);
  slab(x0, z0, x1, z1, fy + 3, DT, put); // 压顶（云墙瓦顶）

  // ③ 月洞门（南墙正中）：DARK_TILE 圆环嵌墙、中央掏空成门洞
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = 0; dy <= 2; dy++) {
      const d = Math.sqrt(dx * dx + (dy - 1) * (dy - 1)); // 圆心 (ax, fy+1)
      if (d <= 1.05) put(ax + dx, fy + dy, z1, BLOCK.AIR, true); // 门洞
      else if (d <= 2.0) put(ax + dx, fy + dy, z1, DT, true); // 月洞圆环
    }
  }

  // ④ 园中心水池：5×4 挖深 2 + 砂岩池底 + 注水一层 + 四周石栏
  const px0 = ax - 2;
  const px1 = ax + 2;
  const pz0 = az + 1;
  const pz1 = az + 4; // 水池居园南（北岸让给四方亭）
  clearBox(px0, fy - 2, pz0, px1, fy, pz1, put); // 挖深 2（含地表层）
  slab(px0, pz0, px1, pz1, fy - 2, BLOCK.SANDSTONE, put); // 池底
  for (let x = px0; x <= px1; x++) {
    for (let z = pz0; z <= pz1; z++) put(x, fy - 1, z, BLOCK.WATER, true); // 注水
  }
  for (let x = px0 - 1; x <= px1 + 1; x++) {
    putC(x, fy, pz0 - 1, BLOCK.STONE); // 石栏（北缘）
    putC(x, fy, pz1 + 1, BLOCK.STONE); // 石栏（南缘）
  }
  for (let z = pz0; z <= pz1; z++) {
    putC(px0 - 1, fy, z, BLOCK.STONE); // 石栏（西缘）
    putC(px1 + 1, fy, z, BLOCK.STONE); // 石栏（东缘）
  }

  // ⑤ 水池北岸四方亭：GREY_BRICK 台基 + DARK_WOOD 柱 + 攒尖黛瓦顶 + 顶珠 + 石桌
  const tx0 = ax - 1;
  const tx1 = ax + 1;
  const tz0 = az - 3;
  const tz1 = az - 1; // 亭基 3×3（北岸，正对月洞门）
  const tcz = az - 2; // 亭中心
  foundation(tx0, tz0, tx1, tz1, fy, BLOCK.GREY_BRICK, heightAt, put);
  slab(tx0, tz0, tx1, tz1, fy, BLOCK.GREY_BRICK, put); // 台基（特征方块锚点）
  for (const [qx, qz] of [[tx0, tz0], [tx1, tz0], [tx0, tz1], [tx1, tz1]] as const) {
    for (let y = fy + 1; y <= fy + 3; y++) putC(qx, y, qz, BLOCK.DARK_WOOD); // 亭柱
  }
  slab(ax - 2, tcz - 2, ax + 2, tcz + 2, fy + 4, DT, put); // 檐盘 5×5（出挑）
  slab(ax - 1, tcz - 1, ax + 1, tcz + 1, fy + 5, DT, put); // 攒尖 3×3
  putC(ax, fy + 6, tcz, DT); // 攒尖心
  putC(ax, fy + 7, tcz, BLOCK.YELLOW_TILE); // 金顶珠
  putC(ax, fy + 1, tcz, BLOCK.STONE); // 亭内石桌

  // ⑥ 西侧曲廊一段（L 形 4+3）：GREY_BRICK 廊基 + 矮柱 + DARK_WOOD 廊顶
  const corridor: Array<[number, number]> = [];
  for (let z = az; z <= az + 3; z++) corridor.push([ax - 5, z]); // 竖腿 4
  for (let x = ax - 4; x <= ax - 3; x++) corridor.push([x, az + 3]); // 横腿 +2
  for (const [cx, cz] of corridor) {
    foundation(cx, cz, cx, cz, fy, BLOCK.GREY_BRICK, heightAt, put); // 廊基兼石径
    putC(cx, fy + 2, cz, BLOCK.DARK_WOOD); // 廊顶
  }
  for (const [cx, cz] of [[ax - 5, az], [ax - 5, az + 3], [ax - 3, az + 3]] as const) {
    putC(cx, fy, cz, BLOCK.DARK_WOOD); // 矮柱（L 端点与转角，中间敞通）
    putC(cx, fy + 1, cz, BLOCK.DARK_WOOD);
  }

  // ⑦ 东角太湖石假山：STONE/COBBLE 按 hash 不规则堆叠 2~3 层（高 3）+ 透洞一个
  const rx0 = ax + 4;
  const rx1 = ax + 6;
  const rz0 = az - 3;
  const rz1 = az - 1;
  foundation(rx0, rz0, rx1, rz1, fy, BLOCK.STONE, heightAt, put);
  for (let x = rx0; x <= rx1; x++) {
    for (let z = rz0; z <= rz1; z++) {
      const layers = hash2(x * 17 + 3, z * 29 - 11) < 0.45 ? 2 : 3;
      for (let i = 0; i < layers; i++) {
        const y = fy + i;
        if (x === ax + 5 && z === az - 2 && y === fy + 1) continue; // 透洞
        const mat = hash2(x * 7 + y * 3, z * 11 - y) < 0.5 ? BLOCK.STONE : BLOCK.COBBLE;
        putC(x, y, z, mat);
      }
    }
  }

  // ⑧ 竹丛 2 处（3×3 邻域内 hash 取 3~5 根，高 2~3）
  const bamboo = (bx: number, bz: number): void => {
    let n = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (hash2(bx + dx * 31, bz + dz * 17) < 0.5) continue;
        if (n >= 5) return;
        n++;
        const gh = 2 + Math.floor(hash2((bx + dx) * 3 + 9, (bz + dz) * 5 - 2) * 2);
        for (let i = 0; i < gh; i++) putC(bx + dx, fy + i, bz + dz, BLOCK.BAMBOO);
      }
    }
  };
  bamboo(ax - 4, az - 4);
  bamboo(ax + 5, az + 5);
}

// ---------------------------------------------------------------------------
// hui_house 徽派马头墙民居（安徽常见民居）—— FOOTPRINT_R 4
// ---------------------------------------------------------------------------

/**
 * 粉墙黛瓦二层楼：GREY_BRICK 台基/地坪 + 粉墙（WHITE_STONE 9×6 高 4）+
 * 墙脚青砖裙（GREY_BRICK 一层）→ 黛瓦双坡顶（脊沿 Z、坡向 ±x：kit.gableRoof
 * 只有 X 向脊，本组按其逐行下探逻辑手排旋转变体；檐口落在东西檐墙顶）→
 * 南北山墙高出屋面的马头墙（台阶状：每级 WHITE_STONE 横带 + DARK_TILE 出挑
 * 压顶；北端 3 级、南端 2 级微错落，最高一级 WHITE_STONE 白垩墙头收尖——
 * 马头墙高于屋面是徽派标志）→ 南正门 RED_DOOR + 门罩小瓦檐（DARK_TILE
 * 3 宽 1 深）+ 二层小方窗（GLASS 1×1）+ 室内萤石灯。
 * 水平包络：马头墙压顶/檐口/门罩最远 ±4 / az+3 → Chebyshev ≤ 4 = FOOTPRINT_R。
 */
export function stampHuiHouse(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 10); // 北马头墙头
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const x0 = ax - 4;
  const x1 = ax + 4; // 9 宽
  const z0 = az - 3;
  const z1 = az + 2; // 6 深（正面朝南 z1）
  const wallTop = fy + 3; // 粉墙高 4（二层楼）

  // ① 室内掏空（净高 4，直通粉墙顶）
  clearBox(ax - 3, fy, az - 2, ax + 3, wallTop, az + 1, put);

  // ② 地基 + 青砖地坪/墙脚裙
  foundation(x0, z0, x1, z1, fy, BLOCK.GREY_BRICK, heightAt, put);
  slab(x0, z0, x1, z1, fy - 1, BLOCK.GREY_BRICK, put);

  // ③ 粉墙（WHITE_STONE 9×6 高 4）+ 墙脚青砖裙一层
  wallsRect(x0, z0, x1, z1, fy, wallTop, BLOCK.WHITE_STONE, put);
  for (let x = x0; x <= x1; x++) {
    put(x, fy, z0, BLOCK.GREY_BRICK, true);
    put(x, fy, z1, BLOCK.GREY_BRICK, true);
  }
  for (let z = z0; z <= z1; z++) {
    put(x0, fy, z, BLOCK.GREY_BRICK, true);
    put(x1, fy, z, BLOCK.GREY_BRICK, true);
  }

  // ④ 黛瓦双坡顶（脊沿 Z、坡向 ±x 逐行下探；d>0 时南北两端出挑 1）
  for (let d = 0; d <= 4; d++) {
    const y = fy + 7 - d;
    const zs = z0 - (d > 0 ? 1 : 0);
    const ze = z1 + (d > 0 ? 1 : 0);
    slab(ax - d, zs, ax - d, ze, y, BLOCK.DARK_TILE, put);
    if (d > 0) slab(ax + d, zs, ax + d, ze, y, BLOCK.DARK_TILE, put);
  }

  // ⑤ 马头墙（南北山墙台阶状高出屋面；每级白墙横带 + 黛瓦出挑压顶）
  const matou = (zWall: number, tiers: number): void => {
    for (let x = ax - 3; x <= ax + 3; x++) putC(x, fy + 4, zWall, BLOCK.WHITE_STONE); // 一级横带
    for (let x = ax - 4; x <= ax + 4; x++) putC(x, fy + 5, zWall, BLOCK.DARK_TILE); // 一级压顶
    if (tiers >= 2) {
      for (let x = ax - 2; x <= ax + 2; x++) putC(x, fy + 6, zWall, BLOCK.WHITE_STONE); // 二级横带
      for (let x = ax - 3; x <= ax + 3; x++) putC(x, fy + 7, zWall, BLOCK.DARK_TILE); // 二级压顶
    }
    if (tiers >= 3) {
      for (let x = ax - 1; x <= ax + 1; x++) putC(x, fy + 8, zWall, BLOCK.WHITE_STONE); // 墙头收尖
    }
  };
  matou(z0, 3); // 北端 3 级
  matou(z1, 2); // 南端 2 级（微错落）

  // ⑥ 南正门：门洞 + RED_DOOR 门扇 + 门罩小瓦檐（3 宽 1 深）
  putC(ax, fy, z1, BLOCK.AIR);
  putC(ax, fy + 1, z1, BLOCK.RED_DOOR);
  for (let wx = ax - 1; wx <= ax + 1; wx++) putC(wx, fy + 2, z1 + 1, BLOCK.DARK_TILE);

  // ⑦ 二层小方窗（GLASS 1×1）+ 两山小窗 + 室内萤石灯
  putC(ax - 2, wallTop, z1, BLOCK.GLASS);
  putC(ax + 2, wallTop, z1, BLOCK.GLASS);
  putC(x0, fy + 2, az, BLOCK.GLASS);
  putC(x1, fy + 2, az, BLOCK.GLASS);
  putC(ax, fy + 2, az, BLOCK.GLOWBLOCK);
}

// ---------------------------------------------------------------------------
// tengwang_pavilion 滕王阁（江西稀有地标）—— FOOTPRINT_R 5
// ---------------------------------------------------------------------------

/**
 * 滕王阁：GREY_BRICK 高台基两层（11×9 + 9×7，台缘 WHITE_STONE 栏板、南面留
 * 豁口 + 南向石阶）→ 三层主阁逐层收分（RED_WALL 柱墙 7×5 → 5×4 → 4×3，
 * 各层净室掏空 + GLOWBLOCK 长明灯 + 南向门窗）→ 层间 GREEN_TILE 绿琉璃
 * 檐盘大出挑（9×7 → 7×5 → 6×5，共三重）→ 顶部歇山绿顶（GREEN_TILE 顺脊
 * 双坡下探）+ 正脊两端鸱吻上翘 + YELLOW_TILE 顶珠 → 台基南缘两侧小方亭
 * （压江亭/挹翠亭：RED_WALL 短柱 + GREEN_TILE 2×2 顶一重）。
 * 总高 ~19 格（台基 fy-3 至顶珠 fy+16）；水平包络 Chebyshev ≤ 5 = FOOTPRINT_R。
 */
export function stampTengwangPavilion(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 17); // 顶珠
  const putG: StructPut = (x, y, z, id, ow): void => {
    if (y <= top) put(x, y, z, id, ow);
  }; // 高层落块统一走顶高钳制
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const GT = BLOCK.GREEN_TILE;
  const RW = BLOCK.RED_WALL;
  const GB = BLOCK.GREY_BRICK;
  const WS = BLOCK.WHITE_STONE;

  /** 台缘栏板环（WHITE_STONE；南面正中留豁口作登阁门道） */
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

  // ① 三层阁室 + 台基顶掏空（各层净室通透）
  clearBox(ax - 3, fy, az - 2, ax + 3, fy + 11, az + 2, put);

  // ② 高台基两层（11×9 → 9×7）+ 栏板 + 南向石阶
  foundation(ax - 5, az - 4, ax + 5, az + 4, fy - 2, GB, heightAt, put);
  slab(ax - 5, az - 4, ax + 5, az + 4, fy - 2, GB, put); // 下层台面
  parapet(5, 4, fy - 1); // 下层栏板
  slab(ax - 4, az - 3, ax + 4, az + 3, fy - 1, GB, put); // 上层台面（主阁地坪）
  parapet(4, 3, fy); // 上层栏板
  foundation(ax - 1, az + 5, ax + 1, az + 5, fy - 2, GB, heightAt, put);
  slab(ax - 1, az + 5, ax + 1, az + 5, fy - 3, GB, put); // 南向石阶

  // ③ 一层阁身（7×5）+ 南向阁门 + 长明灯
  wallsRect(ax - 3, az - 2, ax + 3, az + 2, fy, fy + 3, RW, putG);
  putC(ax, fy, az + 2, BLOCK.AIR); // 阁门
  putC(ax, fy + 1, az + 2, BLOCK.AIR);
  putC(ax, fy + 2, az + 2, BLOCK.RED_DOOR); // 门楣
  putC(ax, fy + 2, az, BLOCK.GLOWBLOCK);

  // ④ 一重绿琉璃檐（9×7 大出挑）
  slab(ax - 4, az - 3, ax + 4, az + 3, fy + 4, GT, putG);

  // ⑤ 二层阁身（5×4）+ 南窗 + 长明灯
  wallsRect(ax - 2, az - 1, ax + 2, az + 1, fy + 5, fy + 7, RW, putG);
  for (const wx of [ax - 1, ax + 1]) putC(wx, fy + 6, az + 1, BLOCK.GLASS);
  putC(ax, fy + 6, az, BLOCK.GLOWBLOCK);

  // ⑥ 二重绿琉璃檐（7×5）
  slab(ax - 3, az - 2, ax + 3, az + 2, fy + 8, GT, putG);

  // ⑦ 三层阁身（4×3）+ 长明灯
  wallsRect(ax - 2, az - 1, ax + 1, az + 1, fy + 9, fy + 11, RW, putG);
  putC(ax, fy + 10, az, BLOCK.GLOWBLOCK);

  // ⑧ 三重绿琉璃檐（6×5）
  slab(ax - 3, az - 2, ax + 2, az + 2, fy + 12, GT, putG);

  // ⑨ 歇山绿顶（顺脊双坡下探，与三重檐合坡）+ 鸱吻上翘 + 顶珠
  gableRoof(ax - 2, ax + 1, az, fy + 14, 2, GT, putG);
  putC(ax - 2, fy + 15, az, GT); // 正脊鸱吻上翘（西端）
  putC(ax + 1, fy + 15, az, GT); // 正脊鸱吻上翘（东端）
  putC(ax, fy + 15, az, BLOCK.YELLOW_TILE); // 顶珠
  putC(ax, fy + 16, az, BLOCK.YELLOW_TILE); // 顶针

  // ⑩ 台基南缘两侧小方亭（压江亭 / 挹翠亭：短柱 + 绿琉璃 2×2 顶一重）
  for (const s of [-1, 1]) {
    const px = ax + s * 4;
    for (const [qx, qz] of [[px, az + 2], [px, az + 3], [ax + s * 3, az + 2], [ax + s * 3, az + 3]] as const) {
      for (let y = fy; y <= fy + 1; y++) putC(qx, y, qz, RW); // 亭柱
    }
    slab(px - (s > 0 ? 1 : 0), az + 2, px + (s > 0 ? 0 : 1), az + 3, fy + 2, GT, putG); // 2×2 亭顶
  }
}
