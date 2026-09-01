// world/buildings/tibet.ts —— 藏区组结构 stamp（覆盖区域：西藏 / 青海（parts/zang））
// W3-A2 实装：
//   - potala　布达拉宫（依山白宫+红宫+金顶，西藏，r8，全项目最大建筑）｜特征方块 RED_WALL
//   - zangdiaofang　藏式碉房（青海/西藏常见民居，r4）｜特征方块 GREY_BRICK
//   - babao_pagodas　塔尔寺八宝塔群（一字排开八座覆钵式白塔，青海，r7）｜特征方块 WHITE_STONE
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]（potala 8 / zangdiaofang 4 / babao_pagodas 7）；高度封顶一律
// kit.topClamp；输出只经 put 回调；同输入两次 stamp 逐位一致（内部"随机"一律
// hash2，不接 rng 流）；内部顺序：掏空 → 地基/台基 → 墙/顶 → 装饰。
//
// 特征方块锚点（FEATURE_BLOCK 表 + structures.test 断言窗口：锚点 ±2、fy..fy+8）：
//   potala         → RED_WALL（白宫南壁朱红檐带 fy+5..fy+6 盖住锚点 ±2；红宫体在更高处）
//   zangdiaofang   → GREY_BRICK（石砌平顶 fy+8 盖住锚点 ±2）
//   babao_pagodas  → WHITE_STONE（中央塔 3×3 须弥座在 (ax±1, az) 即窗口内）
//
// 跨 chunk 硬闸：potala 依山台基满 footprint（锚点 ±8）自地表逐列砌实到所属台面
//（≥ fy+4 区域占锚点北侧 9 列深），同 pagoda_forest「实心台基」手法——任何 chunk
// 边界穿过建筑时两侧同为实体，双算逐位一致。

import { BLOCK } from '../../blocks/registry';
import { hash2 } from '../../core/rng';

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

// ---------------------------------------------------------------------------
// 组内小工具
// ---------------------------------------------------------------------------

/** 削角方盘：|dx|,|dz| ≤ r 且去掉四角 cut×cut 块（金顶攒尖/穹式基形） */
function discSq(
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
// zangdiaofang 藏式碉房（青海/西藏常见民居）—— FOOTPRINT_R 4
// ---------------------------------------------------------------------------

/**
 * 石砌方正宅：下层 7×6 实重石墙（GREY_BRICK/STONE 逐块确定性 hash 混砌），
 * 上层收分 1 格（5×4）再起两层 → 石砌平顶（碉房特征：slab 平顶）+ 顶部矮女墙
 * + 四角竖白块（WHITE_STONE 穹角压顶）+ 屋顶经幡杆（LOG 杆 + hash 配色彩旗）；
 * 南面上层密排梯形黑窗套（DARK_TILE 梯形框下宽上窄 1 格内收 + GLASS 窗心，
 * 2~3 窗按锚点哈希），底层小门洞 + 门前石阶 + 底层小窗；屋顶一侧玛尼堆
 * （3~4 块 STONE 叠，块数按 hash）。室内两层各嵌长明灯。总高 ~12 格。
 * 水平包络：墙 ±3、门前石阶 az+4 → Chebyshev ≤ 4 = FOOTPRINT_R。
 */
export function stampZangdiaofang(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 12); // 经幡杆顶
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  /** 石砌混砌：GREY_BRICK 主体混 STONE（逐块确定性 hash 二选一） */
  const masonry = (x: number, y: number, z: number): number =>
    hash2(x * 7 + y * 13, z * 11 - y * 5) < 0.62 ? BLOCK.GREY_BRICK : BLOCK.STONE;

  const x0 = ax - 3;
  const x1 = ax + 3; // 下层 7 宽
  const z0 = az - 2;
  const z1 = az + 3; // 下层 6 深（南正面 z1）
  const ux0 = ax - 2;
  const ux1 = ax + 2; // 上层收分 1 格 → 5 宽
  const uz0 = az - 1;
  const uz1 = az + 2; // 4 深

  // ① 地基 + 石地板（随地形垫脚）
  foundation(x0, z0, x1, z1, fy, BLOCK.GREY_BRICK, heightAt, put);
  slab(x0, z0, x1, z1, fy - 1, BLOCK.GREY_BRICK, put);

  // ② 下层实重石墙（实心砌筑 7×6×4——碉房下层厚重如堡垒）
  for (let y = fy; y <= fy + 3; y++) {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) putC(x, y, z, masonry(x, y, z));
    }
  }

  // ③ 下层室内掏空 + 上层楼板（收分处吊顶）
  clearBox(ax - 2, fy, az - 1, ax + 2, fy + 3, az + 2, put);
  slab(ux0, uz0, ux1, uz1, fy + 3, BLOCK.GREY_BRICK, put);

  // ④ 上层墙（略收分 1 格，同样混砌）
  for (let y = fy + 4; y <= fy + 7; y++) {
    for (let x = ux0; x <= ux1; x++) {
      for (let z = uz0; z <= uz1; z++) {
        if (x > ux0 && x < ux1 && z > uz0 && z < uz1) continue; // 只砌四边
        putC(x, y, z, masonry(x, y, z));
      }
    }
  }

  // ⑤ 石砌平顶（碉房特征）+ 顶部矮女墙
  slab(ux0, uz0, ux1, uz1, fy + 8, BLOCK.GREY_BRICK, put);
  wallsRect(ux0, uz0, ux1, uz1, fy + 9, fy + 9, BLOCK.GREY_BRICK, put);

  // ⑥ 四角竖白块（穹角压顶）+ 屋顶经幡杆（LOG 杆 + hash 配色彩旗）
  for (const [px, pz] of [
    [ux0, uz0], [ux1, uz0], [ux0, uz1], [ux1, uz1],
  ] as const) {
    putC(px, fy + 10, pz, BLOCK.WHITE_STONE);
  }
  const poleX = ux0 + 1;
  const poleZ = uz0 + 1;
  for (let y = fy + 9; y <= fy + 12; y++) putC(poleX, y, poleZ, BLOCK.LOG);
  const FLAGS = [BLOCK.WOOL, BLOCK.RED_WALL, BLOCK.YELLOW_TILE, BLOCK.BLUE_TILE];
  const flag = FLAGS[Math.floor(hash2(ax + 41, az - 23) * 4)]!;
  putC(poleX + 1, fy + 11, poleZ, flag);
  putC(poleX, fy + 11, poleZ + 1, flag);

  // ⑦ 屋顶一侧玛尼堆（3~4 块 STONE 叠，块数按 hash）
  const mani = 3 + Math.floor(hash2(ax - 61, az + 37) * 2);
  for (let i = 0; i < mani; i++) putC(ux1 - 1, fy + 9 + i, uz1 - 1, BLOCK.STONE);

  // ⑧ 上层南壁梯形黑窗套（2~3 窗按锚点哈希；DARK_TILE 梯形框 + GLASS 窗心）
  const wins = hash2(ax + 31, az - 17) < 0.5 ? [ax - 1, ax + 1] : [ax - 1, ax, ax + 1];
  for (const wx of wins) {
    putC(wx - 1, fy + 5, uz1, BLOCK.DARK_TILE); // 梯形框：下宽
    putC(wx, fy + 5, uz1, BLOCK.GLASS); // 窗心
    putC(wx + 1, fy + 5, uz1, BLOCK.DARK_TILE);
    putC(wx, fy + 6, uz1, BLOCK.DARK_TILE); // 上窄 1 格内收
  }

  // ⑨ 底层小门洞 + 小窗 + 门前石阶
  putC(ax, fy, z1, BLOCK.AIR);
  putC(ax, fy + 1, z1, BLOCK.AIR);
  putC(ax - 2, fy + 2, z1, BLOCK.GLASS);
  putC(ax + 2, fy + 2, z1, BLOCK.GLASS);
  foundation(ax - 1, z1 + 1, ax + 1, z1 + 1, fy - 1, BLOCK.STONE, heightAt, put);
  slab(ax - 1, z1 + 1, ax + 1, z1 + 1, fy - 1, BLOCK.STONE, put); // 一级石阶

  // ⑩ 室内长明灯（上下层各一盏）
  putC(ax, fy + 2, az, BLOCK.GLOWBLOCK);
  putC(ax, fy + 6, az, BLOCK.GLOWBLOCK);
}

// ---------------------------------------------------------------------------
// babao_pagodas 塔尔寺八宝如意塔群（青海稀有地标）—— FOOTPRINT_R 7
// ---------------------------------------------------------------------------

/**
 * 一字排开 8 座覆钵式白塔（等距 Δx=2，塔心 x 偏移 ±1/±3/±5/±7），同立于一条
 * 东西向石台基上（x ±7、z ±2，随地形垫脚，台面 fy−1 铺 STONE）。每塔自台面起：
 * 方形须弥座两层（3×3 → 十字上枋）→ 覆钵圆肚（十字环两层 + 收分）→ 十三天相轮
 * （1×1 竖段 2~3 层，按塔心坐标 hash）→ 鎏金宝珠 1 块（YELLOW_TILE，塔数标定），
 * 塔高 8~9 微差。两端塔（|dx|=7）的须弥座/圆肚被台缘裁去外列/外臂且塔身收瘦为
 * 1×1——保证整列水平包络严格 ≤ ±7 = FOOTPRINT_R（含出挑硬约束）。
 * 塔前向南石板步道（STONE）+ 台缘南北侧各一株常青（SPRUCE，叶只写 AIR）。
 */
export function stampBabaoPagodas(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 14);
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const WS = BLOCK.WHITE_STONE;

  // ① 石台基（一条横列台）+ 塔前石板步道（向南伸出）
  foundation(ax - 7, az - 2, ax + 7, az + 2, fy, BLOCK.STONE, heightAt, put);
  slab(ax - 7, az - 2, ax + 7, az + 2, fy - 1, BLOCK.STONE, put);
  foundation(ax - 1, az + 3, ax + 1, az + 5, fy, BLOCK.STONE, heightAt, put);
  slab(ax - 1, az + 3, ax + 1, az + 5, fy - 1, BLOCK.STONE, put);

  // ② 八座覆钵式白塔
  for (const dx of [-7, -5, -3, -1, 1, 3, 5, 7] as const) {
    const cx = ax + dx;
    const cz = az;
    const end = Math.abs(dx) === 7; // 端塔：台缘裁座 + 塔身收瘦（包络 ≤ ±7）
    const out = Math.sign(dx);
    const wheel = 2 + Math.floor(hash2(cx * 13 + 1, cz * 7 - 11) * 2); // 相轮 2..3 → 塔高 8..9

    // 须弥座两层：3×3 → 十字上枋（端塔裁去外列/外臂）
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        if (end && ox === out) continue;
        putC(cx + ox, fy, cz + oz, WS);
      }
    }
    for (const [ox, oz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (end && ox === out) continue;
      putC(cx + ox, fy + 1, cz + oz, WS);
    }

    // 覆钵圆肚（十字环两层 + 收分；端塔收瘦为 1×1 竖段）
    if (end) {
      for (let y = fy + 2; y <= fy + 4; y++) putC(cx, y, cz, WS);
    } else {
      ringWall(cx, cz, 1, fy + 2, fy + 3, WS, putC);
      putC(cx, fy + 4, cz, WS);
    }

    // 十三天相轮（1×1 竖段）+ 鎏金宝珠（每塔恰 1 块）
    for (let i = 0; i < wheel; i++) putC(cx, fy + 5 + i, cz, WS);
    putC(cx, fy + 5 + wheel, cz, BLOCK.YELLOW_TILE);
  }

  // ③ 台缘两侧常青 2 株（叶 overwrite=false 只写 AIR，绝不啃塔）
  for (const s of [-1, 1] as const) {
    const tx = ax + s * 6;
    const tz = az + 4;
    const g = heightAt(tx, tz) + 1;
    putC(tx, g, tz, BLOCK.SPRUCE_LOG);
    putC(tx, g + 1, tz, BLOCK.SPRUCE_LOG);
    for (let lx = -1; lx <= 1; lx++) {
      for (let lz = -1; lz <= 1; lz++) {
        if (Math.abs(lx) === 1 && Math.abs(lz) === 1) continue; // 去角方冠
        put(tx + lx, g + 2, tz + lz, BLOCK.SPRUCE_LEAVES, false);
        put(tx + lx, g + 3, tz + lz, BLOCK.SPRUCE_LEAVES, false);
      }
    }
    put(tx, g + 4, tz, BLOCK.SPRUCE_LEAVES, false); // 顶尖
  }
}

// ---------------------------------------------------------------------------
// potala 布达拉宫（西藏稀有地标，全项目最大建筑）—— FOOTPRINT_R 8
// ---------------------------------------------------------------------------

/**
 * 依山宫堡建筑群（总高 ~22，topClamp 封顶；水平包络 Chebyshev ≤ 8）：
 * ① 依山巨台基：满 footprint（锚点 ±8）逐列自地表砌实到所属台面——三级大台阶
 *    自南（低）向北（高）抬升（入口庭院 fy → 中庭 fy+2 → 宫区台地 fy+4），台面
 *    STONE 铺装、塔身 STONE/GREY_BRICK 逐块 hash 混砌；台基满实体 = 跨 chunk
 *    硬闸对称（同 pagoda_forest 手法）。
 * ② 底部城墙带垛口一圈（南缘 + 东西两翼，GREY_BRICK）+ 南面 arch 大门洞；
 *    之字形石阶踏道：东阶上半步 → 中庭横渡 → 西阶上半步登宫区台地。
 * ③ 白宫体（WHITE_STONE）：东部大体积主楼 11×9×8（fy+5..fy+12，两层净室 +
 *    楼板 + 长明灯）+ 西部低群楼 4×7×4（fy+5..fy+9），平顶 + 女儿墙，密排梯形
 *    黑窗（DARK_TILE 框上下夹 GLASS 心，竖向黑条带）；南壁中段朱红檐带
 *    （RED_WALL，fy+5..fy+6）＝藏地门楣朱色，也是特征方块锚点。
 * ④ 红宫体（RED_WALL 主体 + RED_BRICK 逐块 hash 拼色）：白宫顶上居中偏后
 *    （6×6，fy+14..fy+18，体量收分），密排梯形黑窗，平顶 RED_BRICK + 女儿墙。
 * ⑤ 金顶群（YELLOW_TILE）：红宫顶四隅 4 座 r1 小金顶 + 中央 r2 攒尖金顶
 *    （削角方盘逐层收分，顶层高度按 hash 微差）+ 四隅金幢（竖杆）。
 */
export function stampPotala(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 22); // 金顶/金幢顶
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };

  // 三级台面（南低北高，z- 为北）
  const T_ENTRY = fy; // 入口庭院（z az+5..az+8）
  const T_MID = fy + 2; // 中庭（z az+2..az+4）
  const T_PALACE = fy + 4; // 宫区台地（z az-8..az+1）

  /** 梯形黑窗竖条带：DARK_TILE 框上下夹 GLASS 心（占 3 格高） */
  const winStrip = (x: number, y: number, z: number): void => {
    putC(x, y, z, BLOCK.DARK_TILE);
    putC(x, y + 1, z, BLOCK.GLASS);
    putC(x, y + 2, z, BLOCK.DARK_TILE);
  };

  // ① 殿身净空先掏（白宫主楼两层 + 西低群楼 + 红宫）
  clearBox(ax - 1, fy + 5, az - 6, ax + 4, fy + 12, az, put);
  clearBox(ax - 5, fy + 5, az - 4, ax - 4, fy + 9, az, put);
  clearBox(ax - 1, fy + 14, az - 4, ax + 2, fy + 18, az - 1, put);

  // ② 依山巨台基：满 footprint 自地表逐列砌实到所属台面（实心，跨 chunk 硬闸）
  const baseMat = (x: number, y: number, z: number): number =>
    hash2(x * 3 + y * 7, z * 5 - y * 11) < 0.5 ? BLOCK.STONE : BLOCK.GREY_BRICK;
  const bandTop = (z: number): number => (z >= az + 5 ? T_ENTRY : z >= az + 2 ? T_MID : T_PALACE);
  for (let x = ax - 8; x <= ax + 8; x++) {
    for (let z = az - 8; z <= az + 8; z++) {
      const t = bandTop(z);
      const g = heightAt(x, z);
      for (let y = g + 1; y <= Math.max(t, g); y++) putC(x, y, z, baseMat(x, y, z));
      if (t > g) putC(x, t, z, BLOCK.STONE); // 台面铺装
    }
  }

  // ③ 城墙带垛口一圈（南缘 + 东西两翼）+ 南面大门洞
  for (let x = ax - 8; x <= ax + 8; x++) {
    if (Math.abs(x - ax) <= 1) continue; // 大门居中让位
    putC(x, T_ENTRY + 1, az + 8, BLOCK.GREY_BRICK);
    if ((x - ax) % 2 === 0) putC(x, T_ENTRY + 2, az + 8, BLOCK.GREY_BRICK); // 垛口
  }
  for (const s of [-1, 1] as const) {
    for (let z = az + 5; z <= az + 8; z++) {
      putC(ax + s * 8, T_ENTRY + 1, z, BLOCK.GREY_BRICK);
      if ((z - az) % 2 === 0) putC(ax + s * 8, T_ENTRY + 2, z, BLOCK.GREY_BRICK);
    }
  }
  arch(ax - 2, ax + 2, T_ENTRY + 1, az + 8, BLOCK.GREY_BRICK, put); // 券门：净空+券顶石

  // ④ 之字形石阶踏道：东阶上半步 → 中庭横渡 → 西阶上半步登宫区台地
  for (let x = ax + 1; x <= ax + 3; x++) putC(x, T_MID - 1, az + 5, BLOCK.STONE);
  for (let x = ax - 3; x <= ax - 1; x++) putC(x, T_PALACE - 1, az + 2, BLOCK.STONE);

  // ⑤ 白宫体：东主楼 11×9×8 + 西低群楼 4×7×4（WHITE_STONE 大体积）
  wallsRect(ax - 2, az - 7, ax + 5, az + 1, fy + 5, fy + 12, BLOCK.WHITE_STONE, put);
  wallsRect(ax - 6, az - 5, ax - 3, az + 1, fy + 5, fy + 9, BLOCK.WHITE_STONE, put);
  slab(ax - 2, az - 7, ax + 5, az + 1, fy + 13, BLOCK.WHITE_STONE, put); // 主楼平顶
  slab(ax - 6, az - 5, ax - 3, az + 1, fy + 10, BLOCK.WHITE_STONE, put); // 群楼平顶
  slab(ax - 1, az - 6, ax + 4, az, fy + 8, BLOCK.WHITE_STONE, put); // 主楼二层楼板
  // 女儿墙（主楼顶外露边缘 + 群楼顶三缘；红宫投影处让位）
  for (let x = ax - 2; x <= ax + 5; x++) {
    for (const z of [az - 7, az + 1] as const) {
      if (x <= ax + 3 && z >= az - 5 && z <= az) continue;
      putC(x, fy + 14, z, BLOCK.WHITE_STONE);
    }
  }
  for (let z = az - 6; z <= az; z++) putC(ax + 5, fy + 14, z, BLOCK.WHITE_STONE);
  for (let x = ax - 6; x <= ax - 3; x++) {
    putC(x, fy + 11, az + 1, BLOCK.WHITE_STONE); // 群楼女儿墙（南/西/北三缘）
    putC(x, fy + 11, az - 5, BLOCK.WHITE_STONE);
  }
  for (let z = az - 5; z <= az + 1; z++) putC(ax - 6, fy + 11, z, BLOCK.WHITE_STONE);

  // ⑥ 南壁朱红檐带（门楣朱色，特征方块锚点：锚点 ±2、fy+5..fy+6 窗口内命中）
  for (let x = ax - 2; x <= ax + 2; x++) {
    putC(x, fy + 5, az + 1, BLOCK.RED_WALL);
    putC(x, fy + 6, az + 1, BLOCK.RED_WALL);
  }

  // ⑦ 白宫密排梯形黑窗（主楼南/东/北壁 + 群楼南、西壁；朱红檐带之上成竖向黑条带）
  for (const x of [ax - 1, ax + 1, ax + 3, ax + 5] as const) {
    winStrip(x, fy + 7, az + 1);
    winStrip(x, fy + 10, az + 1);
  }
  for (const z of [az - 6, az - 4, az - 2, az] as const) {
    winStrip(ax + 5, fy + 7, z);
    winStrip(ax + 5, fy + 10, z);
  }
  for (const x of [ax - 1, ax + 1, ax + 4] as const) {
    winStrip(x, fy + 7, az - 7);
    winStrip(x, fy + 10, az - 7);
  }
  winStrip(ax - 5, fy + 6, az + 1); // 群楼南壁
  for (const z of [az - 3, az - 1] as const) winStrip(ax - 6, fy + 6, z); // 群楼西壁

  // ⑧ 红宫体（白宫顶上居中偏后；RED_WALL 主体 + RED_BRICK 逐块 hash 拼色）
  const redMat = (x: number, y: number, z: number): number =>
    hash2(x * 5 + y * 3, z * 7 + y) < 0.7 ? BLOCK.RED_WALL : BLOCK.RED_BRICK;
  for (let y = fy + 14; y <= fy + 18; y++) {
    for (let x = ax - 2; x <= ax + 3; x++) {
      for (let z = az - 5; z <= az; z++) {
        if (x > ax - 2 && x < ax + 3 && z > az - 5 && z < az) continue; // 空心
        putC(x, y, z, redMat(x, y, z));
      }
    }
  }
  slab(ax - 2, az - 5, ax + 3, az, fy + 19, BLOCK.RED_BRICK, put); // 红宫平顶
  for (let x = ax - 2; x <= ax + 3; x++) {
    putC(x, fy + 20, az - 5, BLOCK.RED_WALL); // 红宫女儿墙
    putC(x, fy + 20, az, BLOCK.RED_WALL);
  }
  for (let z = az - 4; z <= az - 1; z++) {
    putC(ax - 2, fy + 20, z, BLOCK.RED_WALL);
    putC(ax + 3, fy + 20, z, BLOCK.RED_WALL);
  }
  // 红宫密排梯形黑窗
  for (const x of [ax - 1, ax + 2] as const) {
    winStrip(x, fy + 15, az);
    winStrip(x, fy + 15, az - 5);
  }
  for (const z of [az - 3, az - 1] as const) {
    winStrip(ax - 2, fy + 15, z);
    winStrip(ax + 3, fy + 15, z);
  }

  // ⑨ 金顶群：红宫顶四隅 4 座 r1 小金顶 + 中央 r2 攒尖金顶（hash 微差削角）
  const dome = (cx: number, cz: number, y0: number): void => {
    discSq(cx, cz, 1, 0, y0, BLOCK.YELLOW_TILE, put); // 底盘 3×3
    putC(cx, y0 + 1, cz, BLOCK.YELLOW_TILE); // 穹顶
    putC(cx, y0 + 2, cz, BLOCK.YELLOW_TILE); // 顶珠
  };
  for (const [dx, dz] of [
    [-1, -4], [2, -4], [-1, -1], [2, -1],
  ] as const) dome(ax + dx, az + dz, fy + 20);
  const cut = hash2(ax + 71, az - 53) < 0.5 ? 1 : 0; // 攒尖底盘削角微差
  discSq(ax, az - 2, 2, cut, fy + 20, BLOCK.YELLOW_TILE, put);
  discSq(ax, az - 2, 1, 0, fy + 21, BLOCK.YELLOW_TILE, put);
  putC(ax, fy + 22, az - 2, BLOCK.YELLOW_TILE); // 攒尖顶珠
  // 四隅金幢（竖杆）
  for (const [dx, dz] of [
    [-2, -5], [3, -5], [-2, 0], [3, 0],
  ] as const) {
    putC(ax + dx, fy + 21, az + dz, BLOCK.YELLOW_TILE);
    putC(ax + dx, fy + 22, az + dz, BLOCK.YELLOW_TILE);
  }

  // ⑩ 殿内长明灯（白宫两层 + 红宫各一盏）
  putC(ax + 1, fy + 6, az - 3, BLOCK.GLOWBLOCK);
  putC(ax + 1, fy + 9, az - 3, BLOCK.GLOWBLOCK);
  putC(ax, fy + 16, az - 2, BLOCK.GLOWBLOCK);
}
