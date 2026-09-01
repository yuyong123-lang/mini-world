// world/buildings/xinan2.ts —— 西南2组结构 stamp（覆盖区域：贵州 / 云南增强（parts/xinan2））
// W6-A2 实装：
//   - jiaxiu_pavilion　甲秀楼（浮玉石桥+桥心三层三檐四角攒尖楼，贵州，r5）｜特征方块 WHITE_STONE
//   - three_pagodas　崇圣寺三塔（塔院台基+一主二辅密檐白塔，云南，r5）｜特征方块 WHITE_STONE
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]（两 kind 均 5）；高度封顶一律 kit.topClamp；输出只经 put 回调；
// 同输入两次 stamp 逐位一致（本组几何全为固定坐标 + heightAt 垫脚，不接任何随机流）；
// 内部顺序：clearBox → foundation → 墙/顶 → 装饰。
//
// 特征方块锚点（FEATURE_BLOCK 表 + structures.test 断言窗口：锚点 ±2、fy..fy+8）：
//   jiaxiu_pavilion → WHITE_STONE（首层楼体墙 (ax±2, fy+1..fy+3, az±2) 在窗口内）
//   three_pagodas　 → WHITE_STONE（主塔塔基 5×5 (ax±2, fy..fy+1, az±2) 在窗口内）

import { BLOCK } from '../../blocks/registry';

import {
  clearBox,
  foundation,
  slab,
  topClamp,
  wallsRect,
  type HeightAt,
  type StructPut,
} from './kit';

// ---------------------------------------------------------------------------
// jiaxiu_pavilion 甲秀楼（贵州稀有地标）—— FOOTPRINT_R 5
// ---------------------------------------------------------------------------

/**
 * 甲秀楼（贵阳南明河「鳌矶石」上三层三檐四角攒尖楼，浮玉桥相连）：
 * STONE 浮玉桥低平贯通 ax±5（桥面 y=fy 一层水平、宽 3；桥下自然留空——低地时
 * 似跨水；端墩 ax±5 三格宽 + 楼墩 ax±2/0 五格宽自地表落地垫到桥面下沿）→
 * 桥中段 5×5 STONE 楼基（鳌矶石）上起楼：WHITE_STONE 石墙方形三层逐层收分
 *（5×5 高 3 → 3×3 高 3 → 3×3 高 2，南向券门 + 两侧 GLASS 直棂窗）+ 三重
 * DARK_TILE 四角攒尖檐盘（7×7 → 5×5 → 5×5，每层檐角 4 块上翘）+ 顶部攒尖
 *（3×3 盘 → 攒尖心 → YELLOW_TILE 琉璃顶珠——表内无 GOLD 方块，以琉璃珠表达）
 * → 桥头石狮 2 座（COBBLE 身 1×2 + GREY_BRICK 头，对望）+ 桥栏 WHITE_STONE
 * 矮栏与栏端望柱 + 楼内 GLOWBLOCK 长明灯。总高 ~14 格（顶珠）；
 * 水平包络：桥 ax±5、楼基/檐盘 az±3 → Chebyshev ≤ 5 = FOOTPRINT_R。
 */
export function stampJiaxiuPavilion(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 15); // 顶珠
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };

  // ① 楼体净空（三层楼心贯通；墙体/檐盘随后回填）
  clearBox(ax - 1, fy + 1, az - 1, ax + 1, fy + 10, az + 1, put);

  // ② 桥墩落地：端墩 ax±5（宽 3）+ 楼墩 ax±2/0（宽 5，托楼基鳌矶石）——
  //    自地表垫到桥面下沿（低地时桥下自然留空）
  for (const px of [ax - 5, ax + 5]) {
    foundation(px, az - 1, px, az + 1, fy, BLOCK.STONE, heightAt, put);
  }
  for (const px of [ax - 2, ax, ax + 2]) {
    foundation(px, az - 2, px, az + 2, fy, BLOCK.STONE, heightAt, put);
  }

  // ③ 浮玉桥桥面（低平一层水平）+ 桥中段 5×5 楼基（鳌矶石）
  slab(ax - 5, az - 1, ax + 5, az + 1, fy, BLOCK.STONE, put);
  slab(ax - 2, az - 2, ax + 2, az + 2, fy, BLOCK.STONE, put);

  // ④ 桥栏：WHITE_STONE 矮栏（楼基两侧留空走道）+ 栏端望柱
  for (const dz of [-1, 1] as const) {
    for (const dx of [-4, -3, 3, 4]) putC(ax + dx, fy + 1, az + dz, BLOCK.WHITE_STONE);
  }
  for (const s of [-1, 1] as const) {
    putC(ax + s * 5, fy + 1, az - 1, BLOCK.WHITE_STONE); // 北侧望柱
  }

  // ⑤ 桥头石狮 2 座（两端南侧对望：COBBLE 身 1×2 + GREY_BRICK 头）
  for (const s of [-1, 1] as const) {
    const lx = ax + s * 5;
    putC(lx, fy + 1, az + 1, BLOCK.COBBLE);
    putC(lx, fy + 2, az + 1, BLOCK.COBBLE);
    putC(lx, fy + 3, az + 1, BLOCK.GREY_BRICK);
  }

  // ⑥ 首层楼体（5×5 WHITE_STONE 石墙，高 3）+ 南向券门 + 直棂窗 + 长明灯
  wallsRect(ax - 2, az - 2, ax + 2, az + 2, fy + 1, fy + 3, BLOCK.WHITE_STONE, put);
  putC(ax, fy + 1, az + 2, BLOCK.AIR); // 南向券门（1×2）
  putC(ax, fy + 2, az + 2, BLOCK.AIR);
  putC(ax - 2, fy + 2, az, BLOCK.GLASS); // 两山直棂窗
  putC(ax + 2, fy + 2, az, BLOCK.GLASS);
  putC(ax, fy + 2, az - 2, BLOCK.GLASS); // 背窗
  putC(ax, fy + 2, az, BLOCK.GLOWBLOCK); // 楼内长明灯

  // ⑦~⑨ 三重四角攒尖檐（DARK_TILE 檐盘逐层收分 7×7 → 5×5 → 5×5 + 檐角上翘）
  slab(ax - 3, az - 3, ax + 3, az + 3, fy + 4, BLOCK.DARK_TILE, put); // 下檐
  for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]] as const) {
    putC(ax + dx, fy + 5, az + dz, BLOCK.DARK_TILE); // 檐角上翘
  }

  wallsRect(ax - 1, az - 1, ax + 1, az + 1, fy + 5, fy + 7, BLOCK.WHITE_STONE, put); // 二层
  putC(ax - 1, fy + 6, az, BLOCK.GLASS);
  putC(ax + 1, fy + 6, az, BLOCK.GLASS);
  slab(ax - 2, az - 2, ax + 2, az + 2, fy + 8, BLOCK.DARK_TILE, put); // 中檐
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as const) {
    putC(ax + dx, fy + 9, az + dz, BLOCK.DARK_TILE);
  }

  wallsRect(ax - 1, az - 1, ax + 1, az + 1, fy + 9, fy + 10, BLOCK.WHITE_STONE, put); // 三层
  putC(ax - 1, fy + 9, az, BLOCK.GLASS);
  putC(ax + 1, fy + 9, az, BLOCK.GLASS);
  slab(ax - 2, az - 2, ax + 2, az + 2, fy + 11, BLOCK.DARK_TILE, put); // 上檐
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as const) {
    putC(ax + dx, fy + 12, az + dz, BLOCK.DARK_TILE);
  }

  // ⑩ 顶部攒尖 + 琉璃顶珠（表内无 GOLD，以 YELLOW_TILE 表达金色宝珠）
  slab(ax - 1, az - 1, ax + 1, az + 1, fy + 12, BLOCK.DARK_TILE, put);
  putC(ax, fy + 13, az, BLOCK.DARK_TILE); // 攒尖心
  putC(ax, fy + 14, az, BLOCK.YELLOW_TILE); // 顶珠
}

// ---------------------------------------------------------------------------
// three_pagodas 崇圣寺三塔（云南增强稀有地标）—— FOOTPRINT_R 5
// ---------------------------------------------------------------------------

/**
 * 崇圣寺三塔（大理苍山）：STONE 塔院台基一层（11×11 自地表垫平 + 台面 +
 * 台缘 WHITE_STONE 栏板，南面留豁口作山门）→ 主塔千寻塔（塔院正中）：
 * WHITE_STONE 方形塔身底 5×5 微收分至 3×3（4×4 偶数宽无法居中，以两档收分
 * 表达微收分），其上 10 层 DARK_TILE 密檐薄盘（每层 1 格高、1 格出挑；层距
 * 自下而上 2→1——愈上愈密是密檐塔特征），塔身中空塔心室供长明灯、南向小龛
 * 1×2；塔刹 DARK_WOOD 竖杆 2 + WHITE_STONE 圆珠 2 → 两座辅塔（塔院前方两侧
 * ax±4 对称）：削角方（八角）塔身十字柱芯 + 3×3 密檐薄盘 6 层（同样上密下疏
 * 1 格出挑），南向小龛，顶 WHITE_STONE 塔珠——主辅错落（辅塔 ~11 < 主塔 ~21）
 * → 塔院后角 SPRUCE_LEAVES 常青 2 株（叶 overwrite=false 只写 AIR，绝不啃塔）。
 * 主塔总高 ~21 格（塔珠）；水平包络：台院 11×11 → Chebyshev ≤ 5 = FOOTPRINT_R
 *（辅塔 ax±4、塔身/檐盘 3×3 → 端格恰在台缘内）。
 */
export function stampThreePagodas(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 22); // 主塔塔珠
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };

  // ① 塔院台基一层：11×11 自地表垫平 + 台面（STONE）
  foundation(ax - 5, az - 5, ax + 5, az + 5, fy - 1, BLOCK.STONE, heightAt, put);
  slab(ax - 5, az - 5, ax + 5, az + 5, fy - 1, BLOCK.STONE, put);

  // ② 台缘栏板（WHITE_STONE，南面正中留豁口作山门）
  for (let d = -5; d <= 5; d++) {
    putC(ax + d, fy, az - 5, BLOCK.WHITE_STONE);
    if (Math.abs(d) > 1) putC(ax + d, fy, az + 5, BLOCK.WHITE_STONE); // 南面豁口
    putC(ax - 5, fy, az + d, BLOCK.WHITE_STONE);
    putC(ax + 5, fy, az + d, BLOCK.WHITE_STONE);
  }

  // ③ 主塔千寻塔：方形塔身两档收分（5×5 → 3×3）+ 10 层密檐薄盘 + 塔刹
  //    塔基 5×5 两层（特征方块锚点层），塔心室掏空供长明灯
  slab(ax - 2, az - 2, ax + 2, az + 2, fy, BLOCK.WHITE_STONE, put);
  slab(ax - 2, az - 2, ax + 2, az + 2, fy + 1, BLOCK.WHITE_STONE, put);
  clearBox(ax - 1, fy, az - 1, ax + 1, fy + 1, az + 1, put); // 塔心室
  putC(ax, fy, az + 2, BLOCK.AIR); // 南向小龛（1×2）
  putC(ax, fy + 1, az + 2, BLOCK.AIR);
  putC(ax, fy, az, BLOCK.GLOWBLOCK); // 塔心室长明灯
  /** 密檐层：y 处落 half 宽 DARK_TILE 方盘（1 格出挑薄檐） */
  const eave = (half: number, y: number): void => {
    slab(ax - half, az - half, ax + half, az + half, y, BLOCK.DARK_TILE, put);
  };
  /** 塔身层：y 处落 half 宽 WHITE_STONE 方环（上层收分后 3×3 实心） */
  const body = (half: number, y: number): void => {
    if (half >= 2) wallsRect(ax - 2, az - 2, ax + 2, az + 2, y, y, BLOCK.WHITE_STONE, put);
    else slab(ax - 1, az - 1, ax + 1, az + 1, y, BLOCK.WHITE_STONE, put);
  };
  // 下段：层距 2（檐-身-檐-身），檐盘 7×7 / 身 5×5
  eave(3, fy + 2);
  body(2, fy + 3);
  eave(3, fy + 4);
  body(2, fy + 5);
  eave(3, fy + 6);
  body(2, fy + 7);
  eave(3, fy + 8);
  // 收分：其上塔身 3×3、檐盘 5×5
  body(1, fy + 9);
  eave(2, fy + 10);
  body(1, fy + 11);
  eave(2, fy + 12);
  body(1, fy + 13);
  eave(2, fy + 14);
  // 上段密檐：层距 1、檐盘 3×3（愈上愈密）
  eave(1, fy + 15);
  eave(1, fy + 16);
  eave(1, fy + 17);
  // 塔刹：DARK_WOOD 竖杆 2 + 圆珠 2
  putC(ax, fy + 18, az, BLOCK.DARK_WOOD);
  putC(ax, fy + 19, az, BLOCK.DARK_WOOD);
  putC(ax, fy + 20, az, BLOCK.WHITE_STONE);
  putC(ax, fy + 21, az, BLOCK.WHITE_STONE);

  // ④ 两座辅塔（前方两侧 ax±4 对称；削角方八角柱芯 + 3×3 密檐 6 层，主辅错落）
  for (const s of [-1, 1] as const) {
    const tx = ax + s * 4;
    const tz = az + 3; // 塔院前部（南向），3×3 塔身连同南龛整体落在台院内
    /** 辅塔身层：削角方（3×3 去四角 = 十字柱芯）WHITE_STONE */
    const auxBody = (y: number): void => {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx !== 0 && dz !== 0) continue; // 去四角（八角近似）
          putC(tx + dx, y, tz + dz, BLOCK.WHITE_STONE);
        }
      }
    };
    /** 辅塔檐层：3×3 方盘 DARK_TILE（1 格出挑，檐角越过柱芯） */
    const auxEave = (y: number): void => {
      slab(tx - 1, tz - 1, tx + 1, tz + 1, y, BLOCK.DARK_TILE, put);
    };
    auxBody(fy);
    auxBody(fy + 1);
    putC(tx, fy, tz + 1, BLOCK.AIR); // 南向小龛（1×2）
    putC(tx, fy + 1, tz + 1, BLOCK.AIR);
    auxEave(fy + 2);
    auxBody(fy + 3);
    auxEave(fy + 4);
    auxBody(fy + 5);
    auxEave(fy + 6);
    auxBody(fy + 7);
    auxEave(fy + 8); // 上段密檐：层距 1
    auxEave(fy + 9);
    auxEave(fy + 10);
    putC(tx, fy + 11, tz, BLOCK.WHITE_STONE); // 塔珠
  }

  // ⑤ 塔院后角常青 2 株（叶 overwrite=false 只写 AIR，绝不啃塔/栏板）
  for (const s of [-1, 1] as const) {
    const tx = ax + s * 4;
    const tz = az - 4;
    putC(tx, fy, tz, BLOCK.LOG);
    for (let lx = -1; lx <= 1; lx++) {
      for (let lz = -1; lz <= 1; lz++) {
        if (Math.abs(lx) === 1 && Math.abs(lz) === 1) continue; // 去角方冠
        put(tx + lx, fy + 1, tz + lz, BLOCK.SPRUCE_LEAVES, false);
        put(tx + lx, fy + 2, tz + lz, BLOCK.SPRUCE_LEAVES, false);
      }
    }
    put(tx, fy + 3, tz, BLOCK.SPRUCE_LEAVES, false); // 顶尖
  }
}
