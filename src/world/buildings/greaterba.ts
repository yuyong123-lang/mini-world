// world/buildings/greaterba.ts —— 港澳组结构 stamp（覆盖区域：香港 / 澳门（parts/gangao））
// W6-A3 实装：
//   - boc_tower　中银大厦（三棱水晶塔：削角方盘逐段收缩 + X 交叉幕墙纹 + 尖杆，
//     香港，r4）｜特征方块 GLASS_CURTAIN
//   - hk_tower　高层住宅楼（幕墙窗阵超高层 + 霓虹招牌商铺层 + 天台小棚/水箱 +
//     邻侧矮楼错落，香港常见，r4）｜特征方块 GLASS_CURTAIN
//   - dasanba　大三巴牌坊（巴洛克石造立面四层叠收 + 壁柱/山花横带 + 三角山花 +
//     两侧弧形石阶，澳门，r5）｜特征方块 WHITE_STONE
//   - pastel_house　葡式粉彩小楼（粉彩墙 + 白色石膏窗框/拱窗 + 双坡顶烟囱 +
//     葡式碎石路小院 + 路灯，澳门常见，r4）｜特征方块 PASTEL_WALL
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]（boc_tower 4 / hk_tower 4 / dasanba 5 / pastel_house 4）；
// 高度封顶一律 kit.topClamp；输出只经 put 回调；同输入两次 stamp 逐位一致
//（X 纹相位/招牌拼色/墙裙波纹一律 hash2，不接 rng 流）；
// 内部顺序：clearBox → foundation → 墙/顶 → 装饰。
//
// 特征方块锚点（FEATURE_BLOCK 表 + structures.test 断言窗口：锚点 ±2、fy..fy+8）：
//   boc_tower　　→ GLASS_CURTAIN（底段水晶内芯实心，(ax±2, fy..fy+5, az±2) 全盖锚窗）
//   hk_tower　　 → GLASS_CURTAIN（塔身窗阵首排 (ax±2, fy+2, az±1..±3)，窗口正中）
//   dasanba　　　→ WHITE_STONE（四层叠收立面主体 (ax±4.., fy, az) 盖住锚点列）
//   pastel_house → PASTEL_WALL（粉彩墙身 (ax±3, fy..fy+5, az±4..)，窗口正中）

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
// boc_tower 中银大厦（香港稀有地标）—— FOOTPRINT_R 4
// ---------------------------------------------------------------------------

/**
 * 中银大厦「节节高升」：STONE 基座广场（r4 圆盘自地表垫平）→ 三棱水晶塔
 * 四段逐段收缩（等边三角平面以削角方盘近似：边长 8→6→4→2 即 r 4/3/2/1，
 * 每段高 6/6/6/5）——棱边 CONCRETE 竖条（削角八边形的 8 个折角顶点）+
 * 立面 X 交叉幕墙纹（对角线 (dx±dy+off)%4<2 判定，相位逐段 hash 错位）+
 * 内芯 GLASS_CURTAIN 实心水晶体 → 顶部尖杆 CONCRETE 竖 3（fy+24..fy+26）。
 * 总高 ~26 格（topClamp(fy,26)）；水平包络：广场 r4 = FOOTPRINT_R
 *（塔身均在 r4 内）。
 */
export function stampBocTower(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 26); // 尖杆顶
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };

  // ① 净空：塔身 r4 圆盘柱体先清（实心水晶体随后逐格回填，兼清树/嵌面地形；
  //    只清圆盘内——削角对角区本就落在广场之外，避免在坡地切出无谓的坑）
  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -4; dz <= 4; dz++) {
      if (dx * dx + dz * dz > 16) continue;
      for (let y = fy; y <= top; y++) put(ax + dx, y, az + dz, BLOCK.AIR, true);
    }
  }

  // ② 基座广场：r4 石盘自地表垫平（斜坡自动垫脚）+ fy-1 铺装层
  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -4; dz <= 4; dz++) {
      if (dx * dx + dz * dz > 16) continue;
      const wx = ax + dx;
      const wz = az + dz;
      const ch = heightAt(wx, wz);
      for (let y = ch + 1; y <= fy - 1; y++) putC(wx, y, wz, BLOCK.STONE);
      putC(wx, fy - 1, wz, BLOCK.STONE);
    }
  }

  // ③ 三棱水晶塔四段：边长 8→6→4→2（r=4/3/2/1），每段高 6/6/6/5
  const SEGS: ReadonlyArray<{ r: number; cut: number; h: number }> = [
    { r: 4, cut: 2, h: 6 },
    { r: 3, cut: 2, h: 6 },
    { r: 2, cut: 1, h: 6 },
    { r: 1, cut: 0, h: 5 },
  ];
  let y = fy;
  for (let i = 0; i < SEGS.length; i++) {
    const seg = SEGS[i]!;
    const off = Math.floor(hash2(ax + i * 7 + 1, az - i * 5 - 3) * 4); // 每段 X 纹相位错位
    for (let yy = y; yy < y + seg.h; yy++) {
      const dy = yy - fy;
      for (let dx = -seg.r; dx <= seg.r; dx++) {
        for (let dz = -seg.r; dz <= seg.r; dz++) {
          const m = Math.max(Math.abs(dx), Math.abs(dz));
          if (m > seg.r) continue;
          if (Math.abs(dx) > seg.r - seg.cut && Math.abs(dz) > seg.r - seg.cut) continue; // 削角
          let mat: number;
          if (m < seg.r) {
            mat = BLOCK.GLASS_CURTAIN; // 内芯水晶体（实心，特征方块锚窗层）
          } else {
            const vertex =
              (Math.abs(dx) === seg.r && Math.abs(dz) === seg.r - seg.cut) ||
              (Math.abs(dz) === seg.r && Math.abs(dx) === seg.r - seg.cut);
            if (vertex) {
              mat = BLOCK.CONCRETE; // 棱边竖条
            } else {
              const cross =
                ((((dx + dy + off) % 4) + 4) % 4 < 2) || ((((dx - dy + off) % 4) + 4) % 4 < 2);
              mat = cross ? BLOCK.CONCRETE : BLOCK.GLASS_CURTAIN; // X 交叉斜纹幕墙
            }
          }
          putC(ax + dx, yy, az + dz, mat);
        }
      }
    }
    y += seg.h;
  }

  // ④ 顶部尖杆（CONCRETE 竖 3）
  for (let yy = y; yy <= top; yy++) putC(ax, yy, az, BLOCK.CONCRETE);
}

// ---------------------------------------------------------------------------
// hk_tower 高层住宅楼（香港常见）—— FOOTPRINT_R 4
// ---------------------------------------------------------------------------

/**
 * 香港高层住宅塔（7×5，塔身 fy+2..fy+19 = 18 层）：CONCRETE 框架 + GLASS_CURTAIN
 * 窗阵（偶数层一排窗：角柱/竖梃分格，奇数层 CONCRETE 楼板线通长 + 室内楼板）→
 * 底部商铺层 2 高（PASTEL_WALL 外壳 + 临街门/橱窗 + 霓虹招牌横条悬挑 1 格
 * RED_BRICK/RED_WALL hash 交替 + GLOWBLOCK 灯箱/店灯）→ 天台 CONCRETE 面层 +
 * PLANKS 天台小棚（3×2 柱棚）+ CONCRETE 水箱 1 块（香港天台特色）→ hash 决定
 * 背侧是否多一栋 5×4 高 8 的 PASTEL_WALL 矮楼（错落天际线 + 平顶）。
 * 总高 ~22 格（棚顶 fy+22）；水平包络：塔楼 ax±3 / az-1..+3、矮楼 az-4、
 * 招牌悬挑 az+4 → Chebyshev ≤ 4 = FOOTPRINT_R。
 */
export function stampHkTower(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 22); // 天台小棚棚顶
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const x0 = ax - 3;
  const x1 = ax + 3; // 塔楼 7 宽
  const zt0 = az - 1;
  const zt1 = az + 3; // 塔楼 5 深（北背南临街）
  const ax0 = ax - 2;
  const ax1 = ax + 2; // 邻侧矮楼 5 宽
  const az0 = az - 4;
  const az1 = az - 2; // 矮楼 4 深（含与塔楼共用背墙线 zt0）
  const annex = hash2(ax * 3 + 11, az * 5 - 7) < 0.55; // hash 决定邻侧矮楼错落

  // ① 净空：商铺层/住宅层室内 + 矮楼室内
  clearBox(x0 + 1, fy, zt0 + 1, x1 - 1, fy + 19, zt1 - 1, put);
  if (annex) clearBox(ax0 + 1, fy, az0, ax1 - 1, fy + 7, az1, put);

  // ② 地基 + 地坪（塔楼/矮楼 CONCRETE 整体底板，随地形垫脚）
  foundation(x0, zt0, x1, zt1, fy, BLOCK.CONCRETE, heightAt, put);
  slab(x0, zt0, x1, zt1, fy - 1, BLOCK.CONCRETE, put);
  if (annex) {
    foundation(ax0, az0, ax1, az1, fy, BLOCK.CONCRETE, heightAt, put);
    slab(ax0, az0, ax1, az1, fy - 1, BLOCK.CONCRETE, put);
  }

  // ③ 底部商铺层（2 高）：PASTEL_WALL 外壳 + 临街门/橱窗 + 店内长明灯
  wallsRect(x0, zt0, x1, zt1, fy, fy + 1, BLOCK.PASTEL_WALL, put);
  putC(ax, fy, zt1, BLOCK.AIR); // 临街门（1×2）
  putC(ax, fy + 1, zt1, BLOCK.AIR);
  putC(ax - 2, fy + 1, zt1, BLOCK.GLASS); // 橱窗
  putC(ax + 2, fy + 1, zt1, BLOCK.GLASS);
  putC(ax, fy + 1, zt0 + 1, BLOCK.GLOWBLOCK); // 店内灯箱

  // ④ 霓虹招牌横条（fy+1 悬挑 1 格 @zt1+1：GLOWBLOCK 灯箱居中，砖/宫墙 hash 交替）
  for (let x = x0; x <= x1; x++) {
    const mat =
      x === ax
        ? BLOCK.GLOWBLOCK
        : hash2(x * 13 + 3, az + 9) < 0.5
          ? BLOCK.RED_BRICK
          : BLOCK.RED_WALL;
    putC(x, fy + 1, zt1 + 1, mat);
  }

  // ⑤ 住宅塔身（fy+2..fy+19）：偶数层窗阵 / 奇数层 CONCRETE 楼板线（含室内楼板）
  for (let yy = fy + 2; yy <= fy + 19; yy++) {
    const slabRow = (yy - fy) % 2 === 1;
    for (let x = x0; x <= x1; x++) {
      for (let z = zt0; z <= zt1; z++) {
        const ex = x === x0 || x === x1;
        const ez = z === zt0 || z === zt1;
        if (!ex && !ez) continue; // 只砌外圈
        if (slabRow) {
          putC(x, yy, z, BLOCK.CONCRETE); // 层间楼板线
          continue;
        }
        const corner = ex && ez;
        const mullion = (ez && (x - x0) % 3 === 0) || (ex && (z - zt0) % 3 === 0); // 竖梃分格
        putC(x, yy, z, corner || mullion ? BLOCK.CONCRETE : BLOCK.GLASS_CURTAIN);
      }
    }
    if (slabRow) slab(x0 + 1, zt0 + 1, x1 - 1, zt1 - 1, yy, BLOCK.CONCRETE, put);
  }

  // ⑥ 天台：CONCRETE 面层 + PLANKS 天台小棚（3×2 柱棚）+ CONCRETE 水箱
  slab(x0, zt0, x1, zt1, fy + 20, BLOCK.CONCRETE, put);
  for (const [px, pz] of [
    [ax - 1, az],
    [ax + 1, az],
    [ax - 1, az + 1],
    [ax + 1, az + 1],
  ] as const) {
    putC(px, fy + 21, pz, BLOCK.PLANKS); // 棚柱
  }
  slab(ax - 1, az, ax + 1, az + 1, fy + 22, BLOCK.PLANKS, put); // 棚顶
  putC(ax + 2, fy + 21, az + 2, BLOCK.CONCRETE); // 天台水箱

  // ⑦ 邻侧矮楼（hash 错落：5×4 高 8 PASTEL_WALL + CONCRETE 平顶）
  if (annex) {
    wallsRect(ax0, az0, ax1, az1, fy, fy + 7, BLOCK.PASTEL_WALL, put);
    slab(ax0, az0, ax1, az1, fy + 8, BLOCK.CONCRETE, put);
    putC(ax, fy, az0, BLOCK.AIR); // 后门（1×2）
    putC(ax, fy + 1, az0, BLOCK.AIR);
    putC(ax - 1, fy + 3, az0, BLOCK.GLASS); // 背窗
    putC(ax + 1, fy + 3, az0, BLOCK.GLASS);
    for (const sx of [ax0, ax1]) {
      putC(sx, fy + 3, az - 3, BLOCK.GLASS); // 侧窗
      putC(sx, fy + 5, az - 3, BLOCK.GLASS);
    }
  }
}

// ---------------------------------------------------------------------------
// dasanba 大三巴牌坊（澳门稀有地标）—— FOOTPRINT_R 5
// ---------------------------------------------------------------------------

/**
 * 大三巴牌坊（圣保禄教堂前壁遗构）：STONE 地基 + 前坪葡式铺装 → 巴洛克石造
 * 立面单片 9 宽（z=az，厚 1），四层叠收（每层高 3：9→8→7→5 宽，WHITE_STONE
 * 主体）：每层 4 根 GREY_BRICK 壁柱分隔 + 层顶 GREY_BRICK 山花横带通长 →
 * 底层 3 门洞（中门 1×2 拱顶、侧门 1×1）→ 二层 3 窗龛（1×2 洞 + GREY_BRICK
 * 龛下栏/龛上楣，龛侧即壁柱）→ 顶层中央 1 龛 + 两侧装饰柱顶 GREY_BRICK 突块 →
 * 顶部三角山花（WHITE_STONE 阶梯收分 5→3→1 + 中央 GREY_BRICK 十字）→
 * 两侧对称弧形石阶（STONE：三级逐级收窄上行至二层平台，自地面垫脚）。
 * 总高 ~14 格（山花顶）；水平包络：立面 ax±4、石阶 ax±5 / az+1..+3 →
 * Chebyshev ≤ 5 = FOOTPRINT_R。
 */
export function stampDasanba(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 14); // 山花顶
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  /** 四层叠收立面：y0 = 层底相对 fy，[x0..x1] = 层宽（相对 ax） */
  const TIERS: ReadonlyArray<{ y0: number; x0: number; x1: number }> = [
    { y0: 0, x0: -4, x1: 4 }, // 一层 9 宽
    { y0: 3, x0: -4, x1: 3 }, // 二层 8 宽
    { y0: 6, x0: -3, x1: 3 }, // 三层 7 宽
    { y0: 9, x0: -2, x1: 2 }, // 四层 5 宽
  ];
  /** 石阶一级：从地表垫脚到 yTop 的实心阶列（斜坡自动垫脚） */
  const step = (x: number, z: number, yTop: number): void => {
    const ch = heightAt(x, z);
    for (let y = ch + 1; y <= yTop; y++) putC(x, y, z, BLOCK.STONE);
  };

  // ① 净空：立面片整体先清（门窗洞随后留出）
  clearBox(ax - 4, fy, az, ax + 4, top, az, put);

  // ② 地基（立面脚下垫平）+ 前坪葡式铺装（随地形垫脚）
  foundation(ax - 4, az, ax + 4, az, fy, BLOCK.STONE, heightAt, put);
  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = 1; dz <= 4; dz++) {
      const wx = ax + dx;
      const wz = az + dz;
      const ch = heightAt(wx, wz);
      for (let y = ch + 1; y <= fy - 1; y++) putC(wx, y, wz, BLOCK.STONE);
      putC(wx, fy - 1, wz, BLOCK.COBBLE);
    }
  }

  // ③ 四层叠收立面：WHITE_STONE 主体 + GREY_BRICK 壁柱 ×4 + 层顶山花横带
  for (const t of TIERS) {
    for (let y = fy + t.y0; y < fy + t.y0 + 3; y++) {
      for (let x = ax + t.x0; x <= ax + t.x1; x++) putC(x, y, az, BLOCK.WHITE_STONE);
    }
    // 壁柱 4 根：优先取 [ax-3/ax-1/ax+1/ax+3] 界内者，不足补本层边缘柱
    const pils: number[] = [ax - 3, ax - 1, ax + 1, ax + 3].filter(
      (x) => x >= ax + t.x0 && x <= ax + t.x1,
    );
    for (const e of [ax + t.x0, ax + t.x1]) {
      if (pils.length < 4 && !pils.includes(e)) pils.push(e);
    }
    for (const px of pils) {
      for (let y = fy + t.y0; y < fy + t.y0 + 3; y++) putC(px, y, az, BLOCK.GREY_BRICK);
    }
    for (let x = ax + t.x0; x <= ax + t.x1; x++) {
      putC(x, fy + t.y0 + 2, az, BLOCK.GREY_BRICK); // 层间山花横带
    }
  }

  // ④ 底层三门洞：中门 1×2（拱顶 = 层顶横带券心）、侧门 1×1（GREY_BRICK 楣）
  putC(ax, fy, az, BLOCK.AIR);
  putC(ax, fy + 1, az, BLOCK.AIR);
  for (const s of [-1, 1] as const) {
    putC(ax + s * 2, fy, az, BLOCK.AIR);
    putC(ax + s * 2, fy + 1, az, BLOCK.GREY_BRICK);
  }

  // ⑤ 二层三窗龛（1×2 洞，龛侧即壁柱 + GREY_BRICK 龛下栏/龛上楣）
  for (const nx of [ax - 2, ax, ax + 2]) {
    putC(nx, fy + 4, az, BLOCK.AIR);
    putC(nx, fy + 5, az, BLOCK.AIR);
    putC(nx, fy + 3, az, BLOCK.GREY_BRICK);
    putC(nx, fy + 6, az, BLOCK.GREY_BRICK);
  }

  // ⑥ 顶层中央 1 龛 + 两侧装饰柱顶 GREY_BRICK 突块（出立面 1 格）
  putC(ax, fy + 10, az, BLOCK.AIR);
  putC(ax, fy + 11, az, BLOCK.AIR);
  putC(ax, fy + 9, az, BLOCK.GREY_BRICK);
  for (const s of [-1, 1] as const) {
    putC(ax + s * 2, fy + 11, az, BLOCK.GREY_BRICK);
    putC(ax + s * 2, fy + 11, az + 1, BLOCK.GREY_BRICK);
  }

  // ⑦ 顶部三角山花（WHITE_STONE 阶梯收分 5→3→1 + 中央 GREY_BRICK 十字）
  for (let x = ax - 2; x <= ax + 2; x++) putC(x, fy + 12, az, BLOCK.WHITE_STONE);
  for (let x = ax - 1; x <= ax + 1; x++) putC(x, fy + 13, az, BLOCK.WHITE_STONE);
  putC(ax, fy + 14, az, BLOCK.WHITE_STONE);
  putC(ax, fy + 13, az, BLOCK.GREY_BRICK); // 十字竖 1×2
  putC(ax, fy + 14, az, BLOCK.GREY_BRICK);
  putC(ax - 1, fy + 12, az, BLOCK.GREY_BRICK); // 十字横臂
  putC(ax + 1, fy + 12, az, BLOCK.GREY_BRICK);

  // ⑧ 两侧对称弧形石阶（STONE：三级逐级收窄上行至二层平台）
  for (const s of [-1, 1] as const) {
    for (let k = 3; k <= 5; k++) step(ax + s * k, az + 3, fy); // 第一级（最宽 3 格）
    for (let k = 3; k <= 4; k++) step(ax + s * k, az + 2, fy + 1); // 第二级（2 格）
    step(ax + s * 3, az + 1, fy + 2); // 顶阶（1 格）
    putC(ax + s * 3, fy + 3, az + 1, BLOCK.STONE); // 二层平台
  }
}

// ---------------------------------------------------------------------------
// pastel_house 葡式粉彩小楼（澳门常见）—— FOOTPRINT_R 4
// ---------------------------------------------------------------------------

/**
 * 澳门葡式粉彩小楼（两层 7×5，北背南临街）：CONCRETE 地坪 → PASTEL_WALL 粉彩
 * 墙两层（fy..fy+2 / fy+4..fy+5 + CONCRETE 楼板）+ 墙裙 GREY_BRICK 波纹
 *（hash 相位波浪线）→ 白色石膏窗框（临街两窗：3 宽 WHITE_STONE 框 3×3 含
 * GLASS 心 ×2 + 白窗台/过梁；二层同位拱窗——壁框包到顶 + 拱顶心起弧）+
 * RED_DOOR 临街门（白框门楣）+ 背墙白框小窗 → 白色压檐（WHITE_STONE 檐口环带
 * @fy+6）→ RED_BRICK 双坡顶（屋脊沿 X，出挑 1，CONCRETE 正脊）+ CONCRETE
 * 烟囱（WHITE_STONE 帽）→ 葡式碎石路小院（5×4：COBBLE/STONE 按
 * (dx+dz+off)%4 波浪图案，随地形垫脚）+ 路灯（LOG 柱 + GLOWBLOCK 顶）。
 * 总高 ~10 格（烟囱帽）；水平包络：墙 ax±3 / az-4..az、坡顶出挑 ax±4、
 * 小院/路灯 az+1..+4 → Chebyshev ≤ 4 = FOOTPRINT_R。
 */
export function stampPastelHouse(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 10); // 烟囱帽
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const x0 = ax - 3;
  const x1 = ax + 3; // 面阔 7
  const z0 = az - 4;
  const z1 = az; // 进深 5（北背南临街）
  const ridge = az - 2; // 屋脊线（沿 X）
  const off = Math.floor(hash2(ax + 17, az - 23) * 4); // 碎石路/墙裙波纹相位

  // ① 净空：两层室内
  clearBox(x0 + 1, fy, z0 + 1, x1 - 1, fy + 5, z1 - 1, put);

  // ② 地基 + 地坪（CONCRETE，随地形垫脚）
  foundation(x0, z0, x1, z1, fy, BLOCK.CONCRETE, heightAt, put);
  slab(x0, z0, x1, z1, fy - 1, BLOCK.CONCRETE, put);

  // ③ 粉彩墙两层 + 二层楼板
  wallsRect(x0, z0, x1, z1, fy, fy + 2, BLOCK.PASTEL_WALL, put);
  slab(x0, z0, x1, z1, fy + 3, BLOCK.CONCRETE, put);
  wallsRect(x0, z0, x1, z1, fy + 4, fy + 5, BLOCK.PASTEL_WALL, put);

  // ④ 墙裙 GREY_BRICK 波纹（hash 相位波浪线：脚线通长 + 波峰起伏）
  for (let x = x0; x <= x1; x++) {
    for (const z of [z0, z1] as const) {
      putC(x, fy, z, BLOCK.GREY_BRICK);
      if ((x + off + (z === z0 ? 1 : 0)) % 3 === 0) putC(x, fy + 1, z, BLOCK.GREY_BRICK);
    }
  }

  // ⑤ 白色压檐（WHITE_STONE 檐口环带 @fy+6）
  wallsRect(x0, z0, x1, z1, fy + 6, fy + 6, BLOCK.WHITE_STONE, put);

  // ⑥ RED_BRICK 双坡顶（出挑 1）+ CONCRETE 正脊 + 烟囱（WHITE_STONE 帽）
  gableRoof(x0, x1, ridge, fy + 8, 2, BLOCK.RED_BRICK, put);
  for (let x = x0; x <= x1; x++) putC(x, fy + 8, ridge, BLOCK.CONCRETE);
  for (let y = fy + 7; y <= fy + 9; y++) putC(ax + 2, y, az - 3, BLOCK.CONCRETE);
  putC(ax + 2, fy + 10, az - 3, BLOCK.WHITE_STONE);

  // ⑦ 白色石膏窗框（临街两窗 3×3 框 + GLASS 心 + 白窗台）+ 二层拱窗 + 临街门
  for (const wx of [ax - 2, ax + 2]) {
    for (const d of [-1, 1]) {
      putC(wx + d, fy + 1, z1, BLOCK.WHITE_STONE); // 一层框侧
      putC(wx + d, fy + 2, z1, BLOCK.WHITE_STONE);
      putC(wx + d, fy + 4, z1, BLOCK.WHITE_STONE); // 二层拱框侧（包到顶）
      putC(wx + d, fy + 5, z1, BLOCK.WHITE_STONE);
    }
    putC(wx - 1, fy, z1, BLOCK.WHITE_STONE); // 白窗台（3 宽）
    putC(wx, fy, z1, BLOCK.WHITE_STONE);
    putC(wx + 1, fy, z1, BLOCK.WHITE_STONE);
    putC(wx, fy + 1, z1, BLOCK.GLASS); // 一层 GLASS 心（1×2）
    putC(wx, fy + 2, z1, BLOCK.GLASS);
    putC(wx - 1, fy + 3, z1, BLOCK.WHITE_STONE); // 石膏过梁（兼二层窗台，3 宽）
    putC(wx, fy + 3, z1, BLOCK.WHITE_STONE);
    putC(wx + 1, fy + 3, z1, BLOCK.WHITE_STONE);
    putC(wx, fy + 4, z1, BLOCK.GLASS); // 二层拱窗 GLASS 心（1×2）
    putC(wx, fy + 5, z1, BLOCK.GLASS);
    putC(wx, fy + 6, z1, BLOCK.WHITE_STONE); // 拱顶心（压檐带上起弧）
  }
  // 临街门（白框 + 门楣）+ 背墙白框小窗
  putC(ax - 1, fy, z1, BLOCK.WHITE_STONE);
  putC(ax + 1, fy, z1, BLOCK.WHITE_STONE);
  putC(ax, fy, z1, BLOCK.RED_DOOR);
  putC(ax, fy + 1, z1, BLOCK.RED_DOOR);
  putC(ax - 1, fy + 1, z1, BLOCK.WHITE_STONE);
  putC(ax + 1, fy + 1, z1, BLOCK.WHITE_STONE);
  putC(ax, fy + 2, z1, BLOCK.WHITE_STONE);
  for (const wx of [ax - 2, ax + 2]) {
    putC(wx - 1, fy + 1, z0, BLOCK.WHITE_STONE);
    putC(wx, fy + 1, z0, BLOCK.GLASS);
    putC(wx + 1, fy + 1, z0, BLOCK.WHITE_STONE);
    putC(wx - 1, fy + 4, z0, BLOCK.WHITE_STONE);
    putC(wx, fy + 4, z0, BLOCK.GLASS);
    putC(wx + 1, fy + 4, z0, BLOCK.WHITE_STONE);
  }

  // ⑧ 室内长明灯（两层各一）
  putC(ax, fy + 1, az - 2, BLOCK.GLOWBLOCK);
  putC(ax, fy + 4, az - 2, BLOCK.GLOWBLOCK);

  // ⑨ 葡式碎石路小院（5×4：COBBLE/STONE (dx+dz+off)%4 波浪图案，随地形垫脚）
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = 1; dz <= 4; dz++) {
      const wx = ax + dx;
      const wz = az + dz;
      const ch = heightAt(wx, wz);
      for (let y = ch + 1; y <= fy - 1; y++) putC(wx, y, wz, BLOCK.STONE);
      const p = (((dx + dz + off) % 4) + 4) % 4;
      putC(wx, fy - 1, wz, p < 2 ? BLOCK.COBBLE : BLOCK.STONE);
    }
  }

  // ⑩ 路灯（LOG 柱 + GLOWBLOCK 顶，立在小院角）
  putC(ax - 2, fy, az + 4, BLOCK.LOG);
  putC(ax - 2, fy + 1, az + 4, BLOCK.LOG);
  putC(ax - 2, fy + 2, az + 4, BLOCK.GLOWBLOCK);
}
