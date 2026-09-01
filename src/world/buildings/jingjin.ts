// world/buildings/jingjin.ts —— 京津冀组结构 stamp（覆盖区域：北京增强 / 天津 / 河北（parts/jingjinji））
//
// 本文件负责的 StructureKind（4 个）：
//   - qinianden　天坛祈年殿（圆形三重檐攒尖、蓝琉璃，北京）｜特征方块 BLUE_TILE
//   - eyed_wheel　天津之眼（跨河摩天轮 Ø11 环+辐条+吊舱）｜特征方块 CONCRETE
//   - xiaoyanglou　五大道小洋楼（天津常见）｜特征方块 PASTEL_WALL
//   - zhaozhou_bridge　赵州桥（敞肩石拱桥，河北，r7）｜特征方块 WHITE_STONE
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]（qinianden 6 / eyed_wheel 6 / xiaoyanglou 4 / zhaozhou_bridge 7）；
// 高度封顶一律 kit.topClamp；输出只经 put 回调；同输入两次 stamp 逐位一致
//（圆弧一律参数方程 + Math.round 取整落块，步长固定，无随机）。

import { BLOCK } from '../../blocks/registry';

import {
  arch,
  clearBox,
  foundation,
  gableRoof,
  ringWall,
  slab,
  topClamp,
  wallsRect,
  type HeightAt,
  type StructPut,
} from './kit';

// ---------------------------------------------------------------------------
// qinianden —— 天坛祈年殿（北京稀有地标，r6）
// ---------------------------------------------------------------------------

/**
 * 天坛祈年殿：三层汉白玉圆台基（r6→r5→r4 逐层收分 + 白色栏板）→ 朱红柱身
 * 圆柱（r2，殿身高 9）→ 三重蓝色琉璃檐（ringWall 喇叭形外挑：每重檐
 * r5→r4→r3 逐层上收，檐间露出红色收腰）→ 攒尖蓝琉璃宝顶 + 金顶珠。
 * 总高 ~15 格；殿内清空 + 萤石长明灯；正南殿门。
 */
export function stampQinianden(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 15);
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  /** 实心圆台（自地表垫起，斜坡自动垫脚）：半径 r、顶面 yTop */
  const discFill = (r: number, yTop: number, mat: number): void => {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > r * r) continue;
        const wx = ax + dx;
        const wz = az + dz;
        const ch = heightAt(wx, wz);
        for (let y = ch + 1; y <= yTop; y++) put(wx, y, wz, mat, true);
      }
    }
  };
  /** 单层薄圆环（1 格厚，栏板用） */
  const thinRing = (r: number, y: number, mat: number): void => {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > r * r || d2 <= (r - 1) * (r - 1)) continue;
        put(ax + dx, y, az + dz, mat, true);
      }
    }
  };
  /** 单层圆环墙（高度封顶保护后的 ringWall 转发） */
  const ring = (r: number, y: number, mat: number): void => {
    if (y <= top) ringWall(ax, az, r, y, y, mat, put);
  };

  // ---- 三层汉白玉圆台基（逐层收分 + 各层白色栏板）----
  discFill(6, fy - 1, BLOCK.WHITE_STONE); // 一层台基（最大）
  discFill(5, fy, BLOCK.WHITE_STONE); // 二层台基
  discFill(4, fy + 1, BLOCK.WHITE_STONE); // 三层台基（殿基）
  thinRing(6, fy, BLOCK.WHITE_STONE); // 一层栏板
  thinRing(5, fy + 1, BLOCK.WHITE_STONE); // 二层栏板
  thinRing(4, fy + 2, BLOCK.WHITE_STONE); // 三层栏板

  // ---- 殿身：朱红柱身圆柱（薄壁圆环 r3，内部清空 + 长明灯）----
  clearBox(ax - 1, fy + 2, az - 1, ax + 1, fy + 10, az + 1, put);
  for (let y = fy + 2; y <= fy + 10; y++) thinRing(3, y, BLOCK.RED_WALL);
  put(ax, fy + 2, az + 3, BLOCK.AIR, true); // 正南殿门（下）
  put(ax, fy + 3, az + 3, BLOCK.AIR, true); // 正南殿门（上）
  put(ax, fy + 2, az + 4, BLOCK.AIR, true); // 台基栏板正南豁口（登殿门道）
  putC(ax, fy + 4, az, BLOCK.GLOWBLOCK); // 殿内长明灯

  // ---- 三重蓝色琉璃檐（喇叭形外挑：r5 低、r4 中、r3 高，檐间红收腰）----
  for (const base of [3, 6, 9]) {
    ring(5, fy + base, BLOCK.BLUE_TILE); // 檐口（最低最宽）
    ring(4, fy + base + 1, BLOCK.BLUE_TILE); // 檐坡
    ring(3, fy + base + 2, BLOCK.BLUE_TILE); // 檐根（贴柱身）
  }

  // ---- 攒尖顶：蓝琉璃收顶 + 金顶珠 ----
  ring(2, fy + 12, BLOCK.BLUE_TILE);
  putC(ax, fy + 13, az, BLOCK.YELLOW_TILE); // 鎏金宝顶
  putC(ax, fy + 14, az, BLOCK.YELLOW_TILE); // 顶珠
  putC(ax, fy + 15, az, BLOCK.YELLOW_TILE); // 金针
}

// ---------------------------------------------------------------------------
// eyed_wheel —— 天津之眼（天津稀有地标，r6）
// ---------------------------------------------------------------------------

/**
 * 天津之眼：垂直大圆环立在地面（X-Y 平面，Ø11、半径 5，CONCRETE 环体；
 * 参数方程逐度取整落块保证圆弧连续），12 根辐条 + 2×2 中心毂，
 * 环内侧 8 个 GLASS_CURTAIN 吊舱（θ=45° 倍数、半径 4），A 字支架：
 * 两条 CONCRETE 斜腿自基座两侧直插毂心 + STONE 基座（foundation 落地）。
 * 轮心 fy+4：环底贴地、环顶 fy+9。
 */
export function stampEyedWheel(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 16);
  const cy = fy + 4; // 轮心高度
  const R = 5; // Ø11
  const zF = az; // 环面（厚度沿 Z 两格：az / az+1）
  const zB = az + 1;
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const deg = (d: number): number => (d * Math.PI) / 180;

  // ---- STONE 基座（两侧落地垫脚）----
  foundation(ax - 6, az - 1, ax + 6, zB, fy, BLOCK.STONE, heightAt, put);

  // ---- A 字支架：两条斜腿自地面 (ax±5) 交汇于毂心 ----
  for (const s of [-1, 1]) {
    for (let i = 0; i <= 5; i++) {
      const x = ax + s * (5 - i);
      const y = fy - 1 + i;
      putC(x, y, zF, BLOCK.CONCRETE);
      putC(x, y, zB, BLOCK.CONCRETE);
    }
  }

  // ---- 垂直大圆环（参数方程逐度步进，取整后连续无缺口）----
  for (let d = 0; d < 360; d++) {
    const x = ax + Math.round(R * Math.cos(deg(d)));
    const y = cy + Math.round(R * Math.sin(deg(d)));
    putC(x, y, zF, BLOCK.CONCRETE);
    putC(x, y, zB, BLOCK.CONCRETE);
  }

  // ---- 8 根辐条（毂心 → 环，每 45° 一根、6 段取整；与吊舱同相位）----
  for (let k = 0; k < 8; k++) {
    const ex = Math.round(R * Math.cos(deg(k * 45)));
    const ey = Math.round(R * Math.sin(deg(k * 45)));
    for (let s = 0; s <= 5; s++) {
      putC(ax + Math.round((ex * s) / 5), cy + Math.round((ey * s) / 5), zF, BLOCK.CONCRETE);
    }
  }

  // ---- 中心毂（2×2×2）----
  for (const dx of [0, 1]) {
    for (const dy of [0, 1]) {
      putC(ax + dx, cy + dy, zF, BLOCK.CONCRETE);
      putC(ax + dx, cy + dy, zB, BLOCK.CONCRETE);
    }
  }

  // ---- 8 个环缘吊舱（θ=45° 倍数，挂在半径 4 的环内侧）----
  for (let k = 0; k < 8; k++) {
    const x = ax + Math.round(4 * Math.cos(deg(k * 45)));
    const y = cy + Math.round(4 * Math.sin(deg(k * 45)));
    putC(x, y, zF, BLOCK.GLASS_CURTAIN);
    putC(x, y, zB, BLOCK.GLASS_CURTAIN);
  }
}

// ---------------------------------------------------------------------------
// xiaoyanglou —— 五大道小洋楼（天津常见，r4）
// ---------------------------------------------------------------------------

/**
 * 五大道小洋楼：两层 7×6 小楼，PASTEL_WALL 墙体 + RED_BRICK 通高角石与
 * 腰线层间带；一层拱窗（kit.arch + GLASS）、二层方窗、正南入口门廊
 * （双 RED_BRICK 柱 + 小平台）；孟莎式复折顶（DARK_TILE 下段陡 + 上段
 * 平台）+ RED_BRICK 烟囱；院前 LOG 矮栅栏（中间留门）+ COBBLE 小径。
 * 总高 ~10 格（屋顶平台/烟囱 fy+10）。
 */
export function stampXiaoyanglou(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 12);
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const x0 = ax - 3;
  const x1 = ax + 3; // 7 宽
  const z0 = az - 3;
  const z1 = az + 2; // 6 深（正面朝南 z1）
  const wallTop1 = fy + 2; // 一层墙顶
  const beltY = fy + 3; // 腰线 / 二层楼板
  const wallTop2 = fy + 6; // 二层墙顶

  // ---- 清空 + 基础落地 + 勒脚底板 ----
  clearBox(x0, fy, z0, x1, wallTop2 + 2, z1, put);
  foundation(x0, z0, x1, z1, fy, BLOCK.RED_BRICK, heightAt, put);
  slab(x0, z0, x1, z1, fy - 1, BLOCK.RED_BRICK, put);

  // ---- 一层墙体（PASTEL_WALL）+ RED_BRICK 通高角石 ----
  wallsRect(x0, z0, x1, z1, fy, wallTop1, BLOCK.PASTEL_WALL, put);
  for (const [qx, qz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]] as const) {
    for (let y = fy; y <= wallTop2; y++) put(qx, y, qz, BLOCK.RED_BRICK, true);
  }
  // ---- 腰线层间带 / 二层楼板 + 二层墙体 ----
  slab(x0, z0, x1, z1, beltY, BLOCK.RED_BRICK, put);
  wallsRect(x0, z0, x1, z1, beltY + 1, wallTop2, BLOCK.PASTEL_WALL, put);

  // ---- 正南立面：大门 + 一层拱窗（arch）+ 二层方窗 ----
  put(ax, fy, z1, BLOCK.AIR, true);
  put(ax, fy + 1, z1, BLOCK.AIR, true);
  for (const wx of [ax - 2, ax + 2]) {
    arch(wx - 1, wx + 1, fy, z1, BLOCK.GLASS, put); // 拱窗券顶 + 拱脚
    put(wx, fy, z1, BLOCK.GLASS, true); // 拱窗下段玻璃
    put(wx, beltY + 2, z1, BLOCK.GLASS, true); // 二层方窗
  }
  for (const wz of [z0 + 1, az + 1]) {
    put(x0, fy + 1, wz, BLOCK.GLASS, true); // 一层侧窗
    put(x1, fy + 1, wz, BLOCK.GLASS, true);
  }
  put(x0, beltY + 2, az, BLOCK.GLASS, true); // 二层侧窗
  put(x1, beltY + 2, az, BLOCK.GLASS, true);
  putC(ax, wallTop1, az, BLOCK.GLOWBLOCK); // 室内灯

  // ---- 孟莎式复折顶：下段陡（1:1）+ 上段缓 + 脊线平台 ----
  if (wallTop2 + 2 <= top) gableRoof(x0, x1, az, wallTop2 + 2, 3, BLOCK.DARK_TILE, put);
  if (wallTop2 + 3 <= top) gableRoof(x0 + 1, x1 - 1, az, wallTop2 + 3, 1, BLOCK.DARK_TILE, put);
  slab(x0, z0, x1, z0, wallTop2, BLOCK.DARK_TILE, put); // 背檐口封边（复折下段收边）
  for (let wx = x0 + 1; wx <= x1 - 1; wx++) putC(wx, wallTop2 + 4, az, BLOCK.DARK_TILE); // 脊线平台
  for (let y = wallTop2; y <= wallTop2 + 4; y++) putC(ax - 2, y, az - 2, BLOCK.RED_BRICK); // 烟囱

  // ---- 入口门廊：双 RED_BRICK 柱 + 雨棚 ----
  foundation(ax - 2, z1 + 1, ax + 2, z1 + 1, fy, BLOCK.RED_BRICK, heightAt, put);
  slab(ax - 2, z1 + 1, ax + 2, z1 + 1, fy - 1, BLOCK.RED_BRICK, put);
  for (const px of [ax - 2, ax + 2]) {
    for (let y = fy; y <= wallTop1; y++) putC(px, y, z1 + 1, BLOCK.RED_BRICK);
  }
  for (let wx = ax - 2; wx <= ax + 2; wx++) putC(wx, wallTop1 + 1, z1 + 1, BLOCK.RED_BRICK);

  // ---- 院前矮栅栏（LOG 柱，中间留门）+ COBBLE 小径 ----
  for (let wx = ax - 4; wx <= ax + 4; wx += 2) {
    if (wx >= ax - 1 && wx <= ax + 1) continue; // 栅栏门
    const gh = heightAt(wx, z1 + 2);
    putC(wx, gh + 1, z1 + 2, BLOCK.LOG);
    putC(wx, gh + 2, z1 + 2, BLOCK.LOG);
  }
  for (let wx = ax - 1; wx <= ax + 1; wx++) {
    put(wx, heightAt(wx, z1 + 2), z1 + 2, BLOCK.COBBLE, true); // 小径
  }
}

// ---------------------------------------------------------------------------
// zhaozhou_bridge —— 赵州桥（河北稀有地标，r7）
// ---------------------------------------------------------------------------

/**
 * 赵州桥：敞肩石拱桥。跨 13 格（ax-6..ax+6，两端 DARK_TILE 石阶坡道），
 * 桥面沿弧顶走（拱冠 camber：中央 fy+5 → 桥端 fy，逐格下阶梯），桥体
 * 全部 WHITE_STONE；主拱圈厚 2 格（桥面板下再垫一层），桥下自然留空
 * （拱洞）；两肩各一个 Ø3 敞肩小拱（环形落块勾边 + 拱洞挖空）；
 * 桥面两侧 WHITE_STONE 栏板 + YELLOW_TILE 望柱点缀。总高 ~7 格。
 */
export function stampZhaozhouBridge(
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
  const WS = BLOCK.WHITE_STONE;
  const zA = az - 1;
  const zB = az + 1; // 桥宽 3
  /** 桥面弧线（沿弧顶走：中央拱冠，向桥端逐格下阶梯） */
  const deckY = (dx: number): number => {
    const a = Math.abs(dx);
    if (a >= 7) return fy; // 桥端石阶
    if (a === 6) return fy + 1;
    if (a === 5) return fy + 2;
    if (a === 4) return fy + 3;
    if (a === 3) return fy + 4;
    return fy + 5; // 拱冠段（|dx| ≤ 2）
  };

  // ---- 桥台基础（两端落地垫脚）----
  foundation(ax - 7, zA, ax - 7, zB, fy + 1, BLOCK.DARK_TILE, heightAt, put);
  foundation(ax + 7, zA, ax + 7, zB, fy + 1, BLOCK.DARK_TILE, heightAt, put);
  foundation(ax - 6, zA, ax - 6, zB, fy + 2, WS, heightAt, put);
  foundation(ax + 6, zA, ax + 6, zB, fy + 2, WS, heightAt, put);

  // ---- 主拱桥体（桥面板 + 2 格厚拱圈；桥下自然留空成拱洞）----
  for (let dx = -6; dx <= 6; dx++) {
    const dy = deckY(dx);
    for (let wz = zA; wz <= zB; wz++) {
      putC(ax + dx, dy, wz, WS); // 桥面（沿弧顶走）
      if (Math.abs(dx) <= 5) putC(ax + dx, dy - 1, wz, WS); // 拱圈（厚 2）
    }
  }

  // ---- 敞肩小拱（两肩各一个 Ø3：环形落块勾边 + 拱洞挖空）----
  for (const s of [-1, 1]) {
    for (const wz of [zA, zB]) {
      putC(ax + s * 4, fy + 2, wz, WS); // 小拱顶石
      putC(ax + s * 3, fy + 1, wz, WS); // 小拱肩（环脚）
      putC(ax + s * 5, fy + 1, wz, WS); // 小拱肩（环脚）
      putC(ax + s * 4, fy + 1, wz, BLOCK.AIR); // 小拱洞
    }
  }

  // ---- 栏板 + YELLOW_TILE 望柱（只做桥身段，桥头让给石阶）----
  for (let dx = -5; dx <= 5; dx++) {
    const dy = deckY(dx);
    putC(ax + dx, dy + 1, zA, WS);
    putC(ax + dx, dy + 1, zB, WS);
  }
  for (const dx of [-4, 0, 4]) {
    const dy = deckY(dx);
    putC(ax + dx, dy + 2, zA, BLOCK.YELLOW_TILE);
    putC(ax + dx, dy + 2, zB, BLOCK.YELLOW_TILE);
  }

  // ---- 桥头石阶（DARK_TILE 小坡道，衔接天然地面）----
  for (const s of [-1, 1]) {
    for (let wz = zA; wz <= zB; wz++) {
      const ch = heightAt(ax + s * 7, wz);
      for (let y = ch + 1; y <= fy; y++) putC(ax + s * 7, y, wz, BLOCK.DARK_TILE);
    }
  }
}
