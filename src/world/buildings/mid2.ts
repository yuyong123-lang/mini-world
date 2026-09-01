// world/buildings/mid2.ts —— 中南2组结构 stamp（覆盖区域：广东 / 广西 / 海南（parts/mid2））
// W5-A2 实装：
//   - canton_tower　广州塔（细腰扭转格构塔+天线，广东，r4）｜特征方块 CONCRETE
//   - qilou　骑楼街（联排柱廊+拱窗+山花女儿墙，广东/海南常见，r5）｜特征方块 RED_BRICK
//   - ganlan_house　干栏式木楼（全架空+茅草歇山顶，广西常见，r4）｜特征方块 DARK_WOOD
//   - wind_rain_bridge　程阳风雨桥（石墩+木廊桥体+三座鼓楼亭，广西，r8）｜特征方块 DARK_WOOD
//
// 铁律（docs/contracts/buildings.md §3）：几何只依赖 (ax, az, fy) 与 heightAt 回调，
// 禁 import three / DOM / terragen / regions 运行时值；水平范围（含出挑）≤
// FOOTPRINT_R[kind]（canton_tower 4 / qilou 5 / ganlan_house 4 / wind_rain_bridge 8）；
// 高度封顶一律 kit.topClamp；输出只经 put 回调；同输入两次 stamp 逐位一致
//（格构带 = atan2+floor 的纯坐标函数、拼色 = hash2，不接 rng 流）；
// 内部顺序：clearBox → foundation → 墙/顶 → 装饰。
//
// 特征方块锚点（FEATURE_BLOCK 表 + structures.test 断言窗口：锚点 ±2、fy..fy+8）：
//   canton_tower　　→ CONCRETE（fy 塔基座圈梁全混凝土，环带伸入锚点 ±2 窗口）
//   qilou　　　　　 → RED_BRICK（骑楼柱 (ax-2, fy..fy+2, az+2) 在窗口内）
//   ganlan_house　　→ DARK_WOOD（架空柱 (ax, fy..fy+3, az±2) 在窗口内）
//   wind_rain_bridge→ DARK_WOOD（桥面板 (ax, fy+3, az) 盖住锚点列）

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
// canton_tower 广州塔（广东稀有地标）—— FOOTPRINT_R 4
// ---------------------------------------------------------------------------

/**
 * 广州塔「小蛮腰」：STONE 底部广场（r4 圆盘自地表垫平）+ 塔基座墩台
 *（r3 实心混凝土墩，自地表垫到 fy+4，整体浇筑锚固层）→ 塔身四段变径格构
 *（底座 r3 fy+5..fy+8 → 过渡 r2 fy+9..fy+13 → 细腰 r1 fy+14..fy+18 →
 * 上部 r2 fy+19..fy+24）：每层为 ~1.5 格厚圆环，环上方块按「12 条经向格构带
 * + 每 3 层一道混凝土环梁」交替成镂空格构，角度带随高度旋转偏移（每升 1 格
 * +0.15rad）→ 体素化出扭转纹样；正南塔座门洞 1×2（墩台壁龛）→ 顶部天线杆
 * CONCRETE 1×1（fy+24..fy+28）。总高 ~28 格；
 * 水平包络：广场 r4 = FOOTPRINT_R（塔身均在 r3 内）。
 */
export function stampCantonTower(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 28); // 天线杆顶
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const TAU = Math.PI * 2;

  /** 格构选材：混凝土环梁层 / 偶数格构带 → CONCRETE，其余 → GLASS_CURTAIN */
  const lattice = (dx: number, dz: number, y: number): number => {
    const ang = Math.atan2(dz, dx) + 0.15 * (y - fy); // 扭转：随高度旋转的角度带
    const band = Math.floor(((ang + Math.PI) / TAU) * 12); // 12 条经向格构带
    return (y - fy) % 3 === 0 || band % 2 === 0 ? BLOCK.CONCRETE : BLOCK.GLASS_CURTAIN;
  };
  /** 单层格构环（环带厚 ~1.5 格，同 kit.ringWall 口径）：半径 r @y */
  const latticeRing = (r: number, y: number): void => {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > r * r || d2 < (r - 1.6) * (r - 1.6)) continue;
        putC(ax + dx, y, az + dz, lattice(dx, dz, y));
      }
    }
  };

  // ① 塔身净空（格构环随后回填）
  clearBox(ax - 2, fy + 5, az - 2, ax + 2, fy + 24, az + 2, put);

  // ② 底部广场：r4 石盘自地表垫平（斜坡自动垫脚）
  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -4; dz <= 4; dz++) {
      if (dx * dx + dz * dz > 16) continue;
      const wx = ax + dx;
      const wz = az + dz;
      const ch = heightAt(wx, wz);
      for (let y = ch + 1; y <= fy - 1; y++) putC(wx, y, wz, BLOCK.STONE);
    }
  }
  // 塔基座墩台：r3 实心混凝土墩（自地表垫到 fy+4——塔座整体浇筑，
  // 底层格构段为实心墩座，特征方块锚点层）
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      if (dx * dx + dz * dz > 9) continue;
      const wx = ax + dx;
      const wz = az + dz;
      const ch = heightAt(wx, wz);
      for (let y = ch + 1; y <= fy + 4; y++) putC(wx, y, wz, BLOCK.CONCRETE);
    }
  }

  // ③ 塔身四段变径（细腰扭转塔：底座粗 → 过渡 → 小蛮腰 → 上部）
  const SEG: ReadonlyArray<readonly [number, number, number]> = [
    [5, 8, 3], // 底部塔座格构段（fy+5..fy+8，坐在墩台上）
    [9, 13, 2], // 过渡段（fy+9..fy+13）
    [14, 18, 1], // 细腰「小蛮腰」（fy+14..fy+18）
    [19, 24, 2], // 上部塔身（fy+19..fy+24）
  ];
  for (const [y0, y1, r] of SEG) {
    for (let y = fy + y0; y <= fy + y1; y++) latticeRing(r, y);
  }

  // ④ 正南塔座门洞（1×2，开在 fy 环梁上——底层格构段内的特征方块锚点层）
  putC(ax, fy, az + 3, BLOCK.AIR);
  putC(ax, fy + 1, az + 3, BLOCK.AIR);

  // ⑤ 天线杆（CONCRETE 1×1：fy+24 基座封住塔顶中心 → fy+28 杆顶）
  for (let y = fy + 24; y <= fy + 28; y++) putC(ax, y, az, BLOCK.CONCRETE);
}

// ---------------------------------------------------------------------------
// qilou 骑楼街（广东/海南常见民居）—— FOOTPRINT_R 5
// ---------------------------------------------------------------------------

/**
 * 骑楼联排 3 开间（面阔 10 × 进深 5，两层 + 山花）：底层沿街一排方柱
 *（RED_BRICK 4 根：ax-5/-2/+1/+4）撑起二层，柱间 2×3 净空成骑楼廊道
 *（步道 COBBLE + 沿街石板路），底层店面砖墙每开间开 1×2 门洞 + 玻璃橱窗；
 * 二层楼板通长悬挑压在柱廊上（骑楼的「楼」）→ PASTEL_WALL 墙 + 每开间玻璃
 * 拱窗（RED_BRICK 拱顶压条 + 与底层对位的壁柱带）→ 檐口板 + DARK_TILE 双坡
 * 联排顶（沿 X 通长、前后出挑，前檐搭在沿街上空）→ 前沿山花女儿墙（通长
 * PASTEL_WALL 压檐 + 每开间阶梯山花 1~3 层 hash 微差，RED_BRICK 压边）。
 * 总高 ~10 格（山花顶）；水平包络：墙 ax±5、屋檐/石板路 az±3 → Chebyshev 5。
 */
export function stampQilou(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 10); // 山花顶
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const x0 = ax - 5;
  const x1 = ax + 4; // 面阔 10（3 开间；半宽 5 = FOOTPRINT_R）
  const z0 = az - 2;
  const z1 = az + 2; // 进深 5（前沿 z1 = 骑楼柱廊）
  const COLS = [x0, x0 + 3, x0 + 6, x1]; // 4 根骑楼柱（ax-5 / ax-2 / ax+1 / ax+4）
  const BAYS: ReadonlyArray<readonly [number, number]> = [
    [x0 + 1, x0 + 2],
    [x0 + 4, x0 + 5],
    [x0 + 7, x0 + 8],
  ];
  const floorY = fy + 3; // 二层楼板（悬挑压在柱廊上）
  const wall0 = fy + 4;
  const wall1 = fy + 6; // 二层墙
  const plateY = fy + 7; // 檐口板
  const ridgeY = fy + 9; // 屋脊

  // ① 净空：主体 + 柱廊透空（含地形隆起）+ 底层店面
  clearBox(x0, fy, z0, x1, fy + 9, z1, put);
  clearBox(x0, fy - 1, z1, x1, fy + 2, z1, put);
  clearBox(x0 + 1, fy, z0, x1 - 1, fy + 2, z1 - 1, put);

  // ② 地基 + 地坪（主体 RED_BRICK；柱廊步道 COBBLE；沿街石板路）
  foundation(x0, z0, x1, z1, fy, BLOCK.RED_BRICK, heightAt, put);
  slab(x0, z0, x1, z1, fy - 1, BLOCK.RED_BRICK, put);
  slab(x0, z1, x1, z1, fy - 1, BLOCK.COBBLE, put);
  for (let wx = x0; wx <= x1; wx++) putC(wx, heightAt(wx, az + 3), az + 3, BLOCK.COBBLE);

  // ③ 底层：店面砖墙（后四排）+ 前沿骑楼柱（RED_BRICK 3 高）
  wallsRect(x0, z0, x1, z1 - 1, fy, fy + 2, BLOCK.RED_BRICK, put);
  for (const cx of COLS) {
    for (let y = fy; y <= fy + 2; y++) putC(cx, y, z1, BLOCK.RED_BRICK);
  }
  // 店面开口：每开间 1×2 门洞 + 玻璃橱窗（朝骑楼廊道）
  for (const [b0, b1] of BAYS) {
    putC(b0, fy, z1 - 1, BLOCK.AIR);
    putC(b0, fy + 1, z1 - 1, BLOCK.AIR);
    putC(b1, fy, z1 - 1, BLOCK.GLASS);
    putC(b1, fy + 1, z1 - 1, BLOCK.GLASS);
  }

  // ④ 二层楼板（通长，悬在柱廊之上）+ 二层粉彩墙
  slab(x0, z0, x1, z1, floorY, BLOCK.RED_BRICK, put);
  wallsRect(x0, z0, x1, z1, wall0, wall1, BLOCK.PASTEL_WALL, put);

  // ⑤ 前立面：与底层对位的砖壁柱带 + 每开间玻璃拱窗（RED_BRICK 拱顶压条）
  for (const cx of COLS) {
    for (let y = wall0; y <= wall1; y++) putC(cx, y, z1, BLOCK.RED_BRICK);
  }
  for (const [b0, b1] of BAYS) {
    for (const bx of [b0, b1]) {
      putC(bx, wall0, z1, BLOCK.GLASS);
      putC(bx, wall0 + 1, z1, BLOCK.GLASS);
      putC(bx, wall1, z1, BLOCK.RED_BRICK); // 拱顶压条
    }
  }
  // 背墙小窗（底层 + 二层）+ 室内长明灯
  putC(ax - 2, wall0 + 1, z0, BLOCK.GLASS);
  putC(ax + 2, wall0 + 1, z0, BLOCK.GLASS);
  putC(ax, fy + 1, z0, BLOCK.GLASS);
  putC(ax, wall0 + 1, az, BLOCK.GLOWBLOCK);

  // ⑥ 檐口板 + DARK_TILE 双坡联排顶（沿 X 通长，前后出挑，前檐搭在沿街上空）
  slab(x0, az - 1, x1, az + 1, plateY, BLOCK.RED_BRICK, put);
  gableRoof(x0 + 1, x1 - 1, az, ridgeY, 3, BLOCK.DARK_TILE, put);

  // ⑦ 山花女儿墙：通长压檐墙 + 每开间阶梯山花（hash 微差 1~3 层，RED_BRICK 压边）
  for (let wx = x0; wx <= x1; wx++) putC(wx, plateY, z1, BLOCK.PASTEL_WALL);
  for (const [i, [b0, b1]] of BAYS.entries()) {
    const v = hash2(ax * 5 + b0, az - i * 7);
    const steps = v < 0.35 ? 3 : v < 0.75 ? 2 : 1; // 山花升起层数
    for (const bx of [b0, b1]) {
      for (let s = 0; s < steps; s++) {
        putC(bx, plateY + 1 + s, z1, s === steps - 1 ? BLOCK.RED_BRICK : BLOCK.PASTEL_WALL);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// ganlan_house 干栏式木楼（广西常见民居）—— FOOTPRINT_R 4
// ---------------------------------------------------------------------------

/**
 * 壮乡干栏木楼（与吊脚楼的区分：整栋架空）：8 根 DARK_WOOD 架空柱
 *（自地表落地到楼板下沿 fy+3；中心列 (ax,az) 留空 = 全架空通透）→
 * PLANKS 楼板 7×5 @fy+4 → 上层板壁房（PLANKS/DARK_WOOD 逐块 hash 混砌，
 * 高 3，室内净空 + 长明灯，前沿板门对晒台 + 各向 GLASS 窗）→ 大歇山茅草顶
 *（THATCH 双坡通长 + 檐口外挑 1 格 + DARK_WOOD 压脊）→ 悬挑前廊晒台
 *（PLANKS 平台 + 矮栏）+ 斜置 PLANKS 木阶梯自地面逐级上到楼板。
 * 总高 ~11 格（压脊）；水平包络：墙 ±3、晒台/阶梯 (4,3) → Chebyshev 4。
 */
export function stampGanlanHouse(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 11); // 压脊顶
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const x0 = ax - 3;
  const x1 = ax + 3; // 7 宽
  const z0 = az - 2;
  const z1 = az + 2; // 5 深
  const floorY = fy + 4; // 楼板（整栋架空）
  /** 板壁拼色：PLANKS 主体混 DARK_WOOD（逐块确定性 hash） */
  const wallMat = (x: number, y: number, z: number): number =>
    hash2(x * 3 + y * 5, z * 7 - y * 3) < 0.55 ? BLOCK.PLANKS : BLOCK.DARK_WOOD;

  // ① 架空层净空（先掏，架空柱随后落地）
  clearBox(x0, fy, z0, x1, fy + 3, z1, put);

  // ② 8 根架空柱（DARK_WOOD 自地表落地到楼板下沿；中心列留空 = 全架空）
  for (const [dx, dz] of [
    [-3, -2], [3, -2], [-3, 0], [3, 0], [-3, 2], [3, 2], [0, -2], [0, 2],
  ] as const) {
    const px = ax + dx;
    const pz = az + dz;
    const ch = heightAt(px, pz);
    for (let y = ch + 1; y <= fy + 3; y++) putC(px, y, pz, BLOCK.DARK_WOOD);
  }

  // ③ 楼板（PLANKS 7×5）
  slab(x0, z0, x1, z1, floorY, BLOCK.PLANKS, put);

  // ④ 上层板壁房（高 3：fy+5..fy+7，混砌空心墙 + 室内净空 + 长明灯）
  for (let y = floorY + 1; y <= floorY + 3; y++) {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (x > x0 && x < x1 && z > z0 && z < z1) continue; // 只砌四边
        putC(x, y, z, wallMat(x, y, z));
      }
    }
  }
  clearBox(ax - 2, floorY + 1, az - 1, ax + 2, floorY + 3, az + 1, put);
  putC(ax, floorY + 2, az, BLOCK.GLOWBLOCK);

  // ⑤ 门窗：前沿板门（对晒台）+ 各向玻璃窗
  putC(ax, floorY + 1, z1, BLOCK.AIR);
  putC(ax, floorY + 2, z1, BLOCK.AIR);
  putC(ax - 2, floorY + 2, z1, BLOCK.GLASS);
  putC(ax + 2, floorY + 2, z1, BLOCK.GLASS);
  putC(ax, floorY + 2, z0, BLOCK.GLASS);
  putC(x0, floorY + 2, az, BLOCK.GLASS);
  putC(x1, floorY + 2, az, BLOCK.GLASS);

  // ⑥ 大歇山茅草顶（THATCH 双坡通长 + 檐口外挑 1）+ DARK_WOOD 压脊
  gableRoof(ax - 2, ax + 2, az, floorY + 5, 3, BLOCK.THATCH, put);
  for (let wx = ax - 1; wx <= ax + 1; wx++) putC(wx, floorY + 6, az, BLOCK.DARK_WOOD);

  // ⑦ 晒台（悬挑前廊平台 + 矮栏）+ 斜置 PLANKS 木阶梯（自地面逐级上到楼板）
  slab(ax - 3, z1 + 1, ax + 1, z1 + 1, floorY, BLOCK.PLANKS, put);
  for (const rx of [ax - 3, ax - 1, ax + 1]) putC(rx, floorY + 1, z1 + 1, BLOCK.PLANKS);
  for (let i = 0; i < 3; i++) {
    const sx = ax + 4 - i; // ax+4 → ax+2 逐级升高
    const sy = fy + 1 + i;
    const ch = heightAt(sx, z1 + 1);
    for (let y = ch + 1; y <= sy; y++) putC(sx, y, z1 + 1, BLOCK.PLANKS);
  }
}

// ---------------------------------------------------------------------------
// wind_rain_bridge 程阳风雨桥（广西稀有地标，全项目跨度最大）—— FOOTPRINT_R 8
// ---------------------------------------------------------------------------

/**
 * 侗族风雨桥：3 座 STONE 方墩（3×3，自地表落地垫到桥面下沿：ax-5/0/+5）+
 * 两端引桥石阶（ax±8 台面低一级、ax±7 与桥面同高，逐级上引）→ DARK_WOOD
 * 桥面板贯通 ax±8（中段 fy+3 水平、两端低一级；宽 3）+ 亭下 5×5 加宽平台 →
 * 两侧廊柱（矮柱 fy+4..fy+5 + 通长低栏梁 fy+6，|dx| 3..8）→ DARK_TILE 长廊
 * 双坡顶通长（脊 @fy+7，檐口外挑至 az±2）→ 三座鼓楼式桥亭（两端 2 层 +
 * 桥中 3 层攒尖：亭身 DARK_WOOD 空心环墙开过道门洞、DARK_TILE 层檐逐层收分
 * 外挑、YELLOW_TILE 宝珠+宝针），亭内长明灯。
 * 总高 ~15 格（中亭顶针）；水平包络：桥体 ax±8、亭檐 az±3 → Chebyshev 8。
 */
export function stampWindRainBridge(
  ax: number,
  az: number,
  fy: number,
  heightAt: HeightAt,
  put: StructPut,
): void {
  const top = topClamp(fy, 16); // 中亭顶针
  const putC = (x: number, y: number, z: number, id: number): void => {
    if (y <= top) put(x, y, z, id, true);
  };
  const DECK = fy + 3; // 桥面（中段水平）
  const zA = az - 1;
  const zB = az + 1; // 桥宽 3

  // ① 石墩 ×3（3×3 自地表落地，垫到桥面下沿 fy+2；墩顶三层明确砌石——
  //    地形局部隆起时墩身仍是石面，桥体不「埋」进土里）
  for (const px of [ax - 5, ax, ax + 5]) {
    foundation(px - 1, zA, px + 1, zB, DECK, BLOCK.STONE, heightAt, put);
    for (let y = fy; y <= fy + 2; y++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) putC(px + dx, y, az + dz, BLOCK.STONE);
      }
    }
  }

  // ② 桥台与引桥石阶（两端：ax±8 低一级、ax±7 与桥面同高）
  for (const s of [-1, 1] as const) {
    for (let wz = zA; wz <= zB; wz++) {
      const ch8 = heightAt(ax + s * 8, wz);
      for (let y = ch8 + 1; y <= fy + 1; y++) putC(ax + s * 8, y, wz, BLOCK.STONE);
      const ch7 = heightAt(ax + s * 7, wz);
      for (let y = ch7 + 1; y <= fy + 2; y++) putC(ax + s * 7, y, wz, BLOCK.STONE);
    }
  }

  // ③ 木廊桥体：DARK_WOOD 桥面板贯通 ax±8（中段水平、两端低一级）+ 亭下加宽平台
  for (let dx = -8; dx <= 8; dx++) {
    const dy = Math.abs(dx) >= 8 ? fy + 2 : DECK;
    for (let wz = zA; wz <= zB; wz++) putC(ax + dx, dy, wz, BLOCK.DARK_WOOD);
  }
  for (const px of [ax - 5, ax, ax + 5]) {
    slab(px - 2, az - 2, px + 2, az + 2, DECK, BLOCK.DARK_WOOD, put);
  }

  // ④ 廊柱与低栏（两侧：栏梁通长 |dx| 3..8 @fy+6；矮柱 |dx|∈{3,7,8} fy+4..fy+5）
  for (let dx = 3; dx <= 8; dx++) {
    for (const wz of [zA, zB] as const) {
      putC(ax + dx, DECK + 3, wz, BLOCK.DARK_WOOD);
      putC(ax - dx, DECK + 3, wz, BLOCK.DARK_WOOD);
      if (dx === 3 || dx === 7 || dx === 8) {
        for (let y = DECK + 1; y <= DECK + 2; y++) {
          putC(ax + dx, y, wz, BLOCK.DARK_WOOD);
          putC(ax - dx, y, wz, BLOCK.DARK_WOOD);
        }
      }
    }
  }

  // ⑤ 长廊顶：DARK_TILE 双坡通长（脊 @fy+7，檐口外挑至 az±2 @fy+5）
  gableRoof(ax - 7, ax + 7, az, DECK + 4, 2, BLOCK.DARK_TILE, put);

  // ⑥ 三座鼓楼式桥亭（两端 2 层 + 桥中 3 层攒尖；层檐逐层收分 + 顶珠宝针）
  const pavilion = (cx: number, tiers: number): void => {
    let base = DECK + 1; // 首层亭身自桥面起（fy+4）
    let half = tiers === 3 ? 2 : 1; // 中亭 5×5 / 端亭 3×3
    for (let t = 0; t < tiers; t++) {
      wallsRect(cx - half, az - half, cx + half, az + half, base, base + 1, BLOCK.DARK_WOOD, put);
      clearBox(cx - half + 1, base, az - half + 1, cx + half - 1, base + 1, az + half - 1, put);
      if (half >= 1) {
        // 沿桥轴开过道门洞（风雨桥穿亭而过）
        for (const px of [cx - half, cx + half]) {
          putC(px, base, az, BLOCK.AIR);
          putC(px, base + 1, az, BLOCK.AIR);
        }
      }
      // 层檐（实心方盘，外挑 1 格）
      slab(cx - half - 1, az - half - 1, cx + half + 1, az + half + 1, base + 2, BLOCK.DARK_TILE, put);
      base += 3;
      half = Math.max(0, half - 1);
    }
    putC(cx, base, az, BLOCK.YELLOW_TILE); // 宝珠
    putC(cx, base + 1, az, BLOCK.YELLOW_TILE); // 宝针
  };
  pavilion(ax - 5, 2);
  pavilion(ax + 5, 2);
  pavilion(ax, 3);

  // ⑦ 亭内长明灯（三亭各一盏）
  for (const px of [ax - 5, ax, ax + 5]) putC(px, DECK + 1, az, BLOCK.GLOWBLOCK);
}
