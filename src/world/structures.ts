// world/structures.ts —— 区域结构生成（中国区域系统的建筑 stamp 阶段）
//
// 跨 chunk 一致性设计（与 terragen.stampTree 同一哲学）：
//   结构决策只读 (锚点坐标, 确定性哈希, 地形公式)，绝不读 chunk 数据。
//   每个 chunk 独立重算同一结构 → 落在自己范围内的体素逐位一致。
//
// 锚点选点：世界按 STRUCT_CELL×STRUCT_CELL 粗网格分 cell；
//   hash2(cellX*salt1+kindSalt, cellZ*salt2) < cellDensity 命中 →
//   第二路哈希在 cell 内留足边距取偏移（footprint 必不跨 cell）。
//   每 chunk 只需扫描覆盖自身 ±MAX_STRUCT_RADIUS 的 ≤3×3 个候选 cell。
//
// 本文件不 import terragen（避免循环依赖）：地形高度经 heightAt 回调注入，
// stamp 输出经 put 回调落块（terragen 侧构造只写本 chunk 的闭包）。

import { BLOCK } from '../blocks/registry';
import { SEA_LEVEL } from '../core/constants';
import { hash2 } from '../core/rng';
import type { StructureKind } from '../data/regions';

/** 结构锚点粗网格边长（格） */
export const STRUCT_CELL = 32;
/** 全部结构的 footprint 最大半径（四合院 11×11 → 6） */
export const MAX_STRUCT_RADIUS = 6;

/** 各结构 footprint 半径（= floor(max(宽,深)/2)；地基/树压制以此为准） */
const FOOTPRINT_R: Readonly<Record<StructureKind, number>> = {
  house: 4, // 7×5
  siheyuan: 6, // 11×11
  palace: 5, // 9×9
  bamboo_house: 4, // 5×7
  yurt: 3, // 5×5 圆
  oasis_farm: 4, // 6×6
  snow_cabin: 4, // 5×6
};

/** 各结构允许的地形高差（中心 vs 四角）：干栏式竹楼/蒙古包对坡地更宽容 */
const SLOPE_TOLERANCE: Readonly<Record<StructureKind, number>> = {
  house: 2,
  siheyuan: 2,
  palace: 2,
  bamboo_house: 4, // 梯田台阶（4 格）上架空竹柱可落脚
  yurt: 2,
  oasis_farm: 2,
  snow_cabin: 2,
};

/** 结构类型哈希盐：不同 kind 在同一 cell 各自独立判定（四合院/宫殿可同 cell 竞争） */
const KIND_SALT: Readonly<Record<StructureKind, number>> = {
  house: 0x11,
  siheyuan: 0x22,
  palace: 0x33,
  bamboo_house: 0x44,
  yurt: 0x55,
  oasis_farm: 0x66,
  snow_cabin: 0x77,
};

/**
 * cell 级确定性锚点：hash 密度命中 → cell 内留边距偏移。
 * 返回 null = 该 cell 无此结构。同输入永远同输出（跨 chunk 重算一致的前提）。
 */
export function structureAnchor(
  cellX: number,
  cellZ: number,
  kind: StructureKind,
  density: number,
): { x: number; z: number } | null {
  const s1 = KIND_SALT[kind];
  if (hash2(cellX * 31 + s1, cellZ * 17 - s1) >= density) return null;
  const m = MAX_STRUCT_RADIUS;
  const span = STRUCT_CELL - 2 * m;
  const ox = m + Math.floor(hash2(cellX + 101 + s1, cellZ - 7) * span);
  const oz = m + Math.floor(hash2(cellX - 13, cellZ + 57 + s1) * span);
  return { x: cellX * STRUCT_CELL + ox, z: cellZ * STRUCT_CELL + oz };
}

/**
 * 锚点地形校验：陆上 + footprint 四角与中心高差 ≤2（坡地拒绝，建筑不悬空/不劈山）。
 * heightAt 由调用方注入（= terragen.terrainHeight 的包装，含区域参数）。
 */
export function anchorSuitable(
  a: { x: number; z: number },
  kind: StructureKind,
  heightAt: (x: number, z: number) => number,
): boolean {
  const r = FOOTPRINT_R[kind];
  const tol = SLOPE_TOLERANCE[kind];
  const h0 = heightAt(a.x, a.z);
  if (h0 <= SEA_LEVEL) return false;
  for (const [dx, dz] of [[-r, -r], [r, -r], [-r, r], [r, r]] as const) {
    const h = heightAt(a.x + dx, a.z + dz);
    if (Math.abs(h - h0) > tol) return false;
  }
  return true;
}

/**
 * 列是否落在任一候选结构 footprint（含 1 格余量）内——树压制判定用。
 * 仅在树密度哈希命中后调用（调用方保证），成本可忽略。
 */
export function insideStructureFootprint(
  x: number,
  z: number,
  structures: ReadonlyArray<{ kind: StructureKind; cellDensity: number }>,
): boolean {
  const cellX = Math.floor(x / STRUCT_CELL);
  const cellZ = Math.floor(z / STRUCT_CELL);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (const s of structures) {
        const a = structureAnchor(cellX + dx, cellZ + dz, s.kind, s.cellDensity);
        if (!a) continue;
        const r = FOOTPRINT_R[s.kind] + 1;
        if (Math.abs(x - a.x) <= r && Math.abs(z - a.z) <= r) return true;
      }
    }
  }
  return false;
}

/** stamp 回调：只写本 chunk 的落块闭包由 terragen 构造注入 */
export type StructPut = (
  wx: number,
  y: number,
  wz: number,
  id: number,
  overwrite: boolean,
) => void;

/**
 * 在锚点处 stamp 一座建筑。
 * @param fy 地板层 Y（= 锚点地表高 + 1，调用方算好）
 * @param heightAt 地形高度注入（地基垫脚用）
 * @param put 落块回调（overwrite=true 可覆盖树/地形但永不覆盖基岩——terragen 侧保证）
 *
 * stamp 内部约定：先清出内部空间（AIR, overwrite）→ 地基垫脚 → 墙体/顶 → 装饰。
 * 所有几何只依赖 (ax, az, fy) 与 heightAt —— 与 chunk 无关。
 */
export function stampStructure(
  kind: StructureKind,
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  switch (kind) {
    case 'house':
      stampHouse(ax, az, fy, heightAt, put);
      break;
    case 'siheyuan':
      stampSiheyuan(ax, az, fy, heightAt, put);
      break;
    case 'palace':
      stampPalace(ax, az, fy, heightAt, put);
      break;
    case 'bamboo_house':
      stampBambooHouse(ax, az, fy, heightAt, put);
      break;
    case 'yurt':
      stampYurt(ax, az, fy, heightAt, put);
      break;
    case 'oasis_farm':
      stampOasisFarm(ax, az, fy, heightAt, put);
      break;
    case 'snow_cabin':
      stampSnowCabin(ax, az, fy, heightAt, put);
      break;
  }
}

/** ---------- 公共小工具 ---------- */

/** 地基：[x0..x1]×[z0..z1] 每列从地表垫到地板层下沿（斜坡自动垫脚） */
function foundation(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  fy: number,
  mat: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  for (let wx = x0; wx <= x1; wx++) {
    for (let wz = z0; wz <= z1; wz++) {
      const ch = heightAt(wx, wz);
      for (let y = ch + 1; y < fy; y++) put(wx, y, wz, mat, true);
    }
  }
}

/** 清空长方体区域（内部空间；永不动基岩——put 侧保证） */
function clearBox(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  put: StructPut,
): void {
  for (let wx = x0; wx <= x1; wx++) {
    for (let y = y0; y <= y1; y++) {
      for (let wz = z0; wz <= z1; wz++) put(wx, y, wz, BLOCK.AIR, true);
    }
  }
}

/** 空心墙：矩形四边 [y0..y1] 层（不含内部） */
function wallsRect(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y0: number,
  y1: number,
  mat: number,
  put: StructPut,
): void {
  for (let y = y0; y <= y1; y++) {
    for (let wx = x0; wx <= x1; wx++) {
      put(wx, y, z0, mat, true);
      put(wx, y, z1, mat, true);
    }
    for (let wz = z0; wz <= z1; wz++) {
      put(x0, y, wz, mat, true);
      put(x1, y, wz, mat, true);
    }
  }
}

/** 实心平板（屋顶/地板）：[x0..x1]×[z0..z1] @y */
function slab(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  mat: number,
  put: StructPut,
): void {
  for (let wx = x0; wx <= x1; wx++) {
    for (let wz = z0; wz <= z1; wz++) put(wx, y, wz, mat, true);
  }
}

/** 双坡屋顶：沿 X 轴屋脊，两侧逐行外挑下探（zFrom→zTo 向两侧） */
function gableRoof(
  x0: number,
  x1: number,
  ridgeZ: number,
  baseY: number,
  halfDepth: number,
  mat: number,
  put: StructPut,
): void {
  for (let d = 0; d <= halfDepth; d++) {
    slab(x0 - (d > 0 ? 1 : 0), ridgeZ - d, x1 + (d > 0 ? 1 : 0), ridgeZ - d, baseY - d, mat, put);
    slab(x0 - (d > 0 ? 1 : 0), ridgeZ + d, x1 + (d > 0 ? 1 : 0), ridgeZ + d, baseY - d, mat, put);
  }
}

/** ---------- 七个结构 ---------- */

/** 川西民居：木柱网 + 板壁 + 青瓦双坡顶 + 玻璃窗（7×5） */
function stampHouse(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  const x0 = ax - 3;
  const x1 = ax + 3;
  const z0 = az - 2;
  const z1 = az + 2;
  const wallTop = fy + 2;
  clearBox(x0, fy, z0, x1, wallTop + 1, z1, put);
  foundation(x0, z0, x1, z1, fy, BLOCK.PLANKS, heightAt, put);
  slab(x0, fy - 1, x1, z1, fy - 1, BLOCK.PLANKS, put); // 地板
  // 木柱网（四角 + 长边中柱）
  for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [ax, z0], [ax, z1]] as const) {
    for (let y = fy; y <= wallTop; y++) put(px, y, pz, BLOCK.LOG, true);
  }
  // 板壁（前后墙，留门洞与窗）
  for (let wx = x0; wx <= x1; wx++) {
    if (wx === ax) continue; // 前墙门洞
    put(wx, fy, z0, BLOCK.PLANKS, true);
    if (wx !== x0 + 1 && wx !== x1 - 1) put(wx, fy + 1, z0, BLOCK.PLANKS, true);
    put(wx, fy, z1, BLOCK.PLANKS, true);
    put(wx, fy + 1, z1, BLOCK.PLANKS, true);
  }
  put(x0 + 1, fy, z0, BLOCK.GLASS, true); // 前窗
  put(x1 - 1, fy, z0, BLOCK.GLASS, true);
  // 山墙（左右封闭）
  for (let wz = z0; wz <= z1; wz++) {
    for (let y = fy; y <= wallTop; y++) {
      put(x0, y, wz, BLOCK.PLANKS, true);
      put(x1, y, wz, BLOCK.PLANKS, true);
    }
  }
  gableRoof(x0, x1, az, wallTop + 2, 3, BLOCK.GREY_TILE, put);
}

/** 北京四合院：青砖围墙 + 朱红门楼 + 北正房（11×11） */
function stampSiheyuan(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  const x0 = ax - 5;
  const x1 = ax + 5;
  const z0 = az - 5;
  const z1 = az + 5;
  const wallTop = fy + 2;
  // 院内清空 + 地基 + 地面（院心夯土）
  clearBox(x0 + 1, fy, z0 + 1, x1 - 1, wallTop + 4, z1 - 1, put);
  foundation(x0, z0, x1, z1, fy, BLOCK.GREY_BRICK, heightAt, put);
  // 围墙（南墙正中门洞）
  wallsRect(x0, z0, x1, z1, fy, wallTop, BLOCK.GREY_BRICK, put);
  for (let wz = ax - 1; wz <= ax + 1; wz++) {
    for (let y = fy; y <= wallTop; y++) put(wz, y, z1, BLOCK.AIR, true);
  }
  // 门楼：门洞上方红门横匾
  slab(ax - 1, z1, ax + 1, z1, wallTop + 1, BLOCK.RED_DOOR, put);
  slab(ax - 1, z1, ax + 1, z1, wallTop + 2, BLOCK.GREY_TILE, put);
  // 北正房 5×3（青砖墙 + 青瓦顶 + 前窗）
  const hx0 = ax - 2;
  const hx1 = ax + 2;
  const hz0 = z0 + 1;
  const hz1 = z0 + 3;
  const hTop = fy + 3;
  clearBox(hx0, fy, hz0, hx1, hTop + 1, hz1, put);
  wallsRect(hx0, hz0, hx1, hz1, fy, hTop, BLOCK.GREY_BRICK, put);
  for (let wx = hx0 + 1; wx <= hx1 - 1; wx++) {
    put(wx, fy + 1, hz1, BLOCK.AIR, true); // 房门（朝院）
    put(wx, fy + 2, hz1, BLOCK.GLASS, true); // 支摘窗
  }
  slab(hx0, hz0, hx1, hz1, fy - 1, BLOCK.GREY_BRICK, put);
  gableRoof(hx0, hx1, (hz0 + hz1) >> 1, hTop + 2, 3, BLOCK.GREY_TILE, put);
  // 院心石桌
  put(ax, fy, az, BLOCK.CRAFT_TABLE, true);
}

/** 宫殿：石台基 + 红墙 + 黄琉璃双重檐（9×9，cellDensity 稀有） */
function stampPalace(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  const x0 = ax - 4;
  const x1 = ax + 4;
  const z0 = az - 4;
  const z1 = az + 4;
  // 台基两层
  for (let y = fy - 1; y <= fy; y++) {
    slab(x0 - (y === fy - 1 ? 1 : 0), z0 - (y === fy - 1 ? 1 : 0),
      x1 + (y === fy - 1 ? 1 : 0), z1 + (y === fy - 1 ? 1 : 0), y, BLOCK.STONE, put);
  }
  const wallTop = fy + 3;
  clearBox(x0 + 1, fy + 1, z0 + 1, x1 - 1, wallTop + 3, z1 - 1, put);
  foundation(x0, z0, x1, z1, fy, BLOCK.STONE, heightAt, put);
  // 红墙（南面正三门洞）
  wallsRect(x0, z0, x1, z1, fy + 1, wallTop, BLOCK.RED_WALL, put);
  for (let wx = ax - 1; wx <= ax + 1; wx++) {
    for (let y = fy + 1; y <= fy + 2; y++) put(wx, y, z1, BLOCK.AIR, true);
  }
  for (let wz = z0 + 1; wz <= z1 - 1; wz++) {
    put(x0, fy + 2, wz, BLOCK.GLASS, true); // 侧窗
    put(x1, fy + 2, wz, BLOCK.GLASS, true);
  }
  // 双重檐：下檐出挑 2、上檐收 1
  slab(x0 - 2, z0 - 2, x1 + 2, z1 + 2, wallTop + 1, BLOCK.YELLOW_TILE, put);
  slab(x0 - 1, z0 - 1, x1 + 1, z1 + 1, wallTop + 3, BLOCK.YELLOW_TILE, put);
  // 四角攒尖中柱 + 顶珠
  for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]] as const) {
    for (let y = fy + 1; y <= wallTop; y++) put(px, y, pz, BLOCK.LOG, true);
  }
  put(ax, wallTop + 4, az, BLOCK.YELLOW_TILE, true);
  put(ax, wallTop + 2, az, BLOCK.GLOWBLOCK, true); // 殿内顶灯
}

/** 傣族竹楼：竹柱架空 + 竹板地板 + 人字顶 + 竖梯（5×7） */
function stampBambooHouse(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  const x0 = ax - 2;
  const x1 = ax + 2;
  const z0 = az - 3;
  const z1 = az + 3;
  const floorY = fy + 3; // 干栏架空 3 格
  const wallTop = floorY + 2;
  clearBox(x0, fy, z0, x1, wallTop + 2, z1, put);
  // 竹柱网（底层架空：角柱 + 边中柱，从地表直通地板）
  for (const [px, pz] of [
    [x0, z0], [x1, z0], [x0, z1], [x1, z1],
    [ax, z0], [ax, z1], [x0, az], [x1, az],
  ] as const) {
    const ch = heightAt(px, pz);
    for (let y = ch + 1; y <= floorY; y++) put(px, y, pz, BLOCK.BAMBOO, true);
  }
  // 竹板地板 + 竹壁（前留门洞）
  slab(x0, z0, x1, z1, floorY, BLOCK.BAMBOO_PLANK, put);
  for (let wz = z0; wz <= z1; wz++) {
    for (let y = floorY + 1; y <= wallTop; y++) {
      put(x0, y, wz, BLOCK.BAMBOO_PLANK, true);
      put(x1, y, wz, BLOCK.BAMBOO_PLANK, true);
    }
  }
  for (let wx = x0; wx <= x1; wx++) {
    for (let y = floorY + 1; y <= wallTop; y++) {
      put(wx, y, z0, BLOCK.BAMBOO_PLANK, true);
      if (!(wx === ax && y === floorY + 1)) put(wx, y, z1, BLOCK.BAMBOO_PLANK, true);
    }
  }
  put(x0 + 1, wallTop, z1, BLOCK.GLASS, true); // 高窗
  // 人字顶（竹板 + 芭蕉叶铺面）
  gableRoof(x0, x1, az, wallTop + 2, 4, BLOCK.PALM_LEAF, put);
  // 竖梯（前侧落地）
  for (let y = fy; y < floorY; y++) put(x1 + 1, y, az, BLOCK.BAMBOO, true);
  put(x1 + 1, floorY, az, BLOCK.BAMBOO_PLANK, true);
}

/** 蒙古包：羊毛圆墙 + 木顶圈 + 南门洞（5×5 圆） */
function stampYurt(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  const r = 2; // 5×5 圆（角剔除）
  const top = fy + 2;
  clearBox(ax - r, fy, az - r, ax + r, top + 1, az + r, put);
  foundation(ax - r, az - r, ax + r, az + r, fy, BLOCK.WOOL, heightAt, put);
  // 圆形羊毛墙（同橡树叶冠轮廓算法；正南一格门洞）
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) === r && Math.abs(dz) === r) continue; // 去四角
      for (let y = fy; y <= top; y++) {
        if (dx === 0 && dz === r && y <= fy + 1) continue; // 门洞
        put(ax + dx, y, az + dz, BLOCK.WOOL, true);
      }
    }
  }
  // 顶圈（LOG 收边）+ 通风口
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (dx === 0 && dz === 0) continue;
      put(ax + dx, top + 1, az + dz, BLOCK.LOG, true);
    }
  }
  put(ax, top + 1, az, BLOCK.AIR, true); // 天窗
}

/** 新疆绿洲农庄：葡萄棚架 + 哈密瓜田 + 馕坑（6×6） */
function stampOasisFarm(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  const x0 = ax - 3;
  const x1 = ax + 2;
  const z0 = az - 3;
  const z1 = az + 2;
  clearBox(x0, fy, z0, x1, fy + 2, z1, put);
  foundation(x0, z0, x1, z1, fy, BLOCK.DIRT, heightAt, put);
  // 葡萄棚架：两排 LOG 柱 + 顶部横杆 + 藤
  for (const px of [x0, x1]) {
    for (const pz of [z0, z0 + 3]) {
      for (let y = fy; y <= fy + 1; y++) put(px, y, pz, BLOCK.LOG, true);
    }
    for (let wz = z0; wz <= z0 + 3; wz++) put(px, fy + 2, wz, BLOCK.LOG, true);
    for (let wz = z0; wz <= z0 + 3; wz++) put(px, fy + 1, wz, BLOCK.GRAPE_VINE, false);
  }
  // 哈密瓜田（2×3）
  for (let wx = x0 + 2; wx <= x1; wx++) {
    for (let wz = z0; wz <= z0 + 2; wz++) put(wx, fy, wz, BLOCK.MELON, true);
  }
  // 馕坑：圆石半球穹顶（半径 2）
  const kx = x0 + 1;
  const kz = z1 - 1;
  const ky = heightAt(kx, kz) + 1;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = 0; dy <= 1; dy++) {
        const d2 = dx * dx + dz * dz + dy * dy * 2;
        if (d2 <= 5 && d2 >= 2) put(kx + dx, ky + dy, kz + dz, BLOCK.COBBLE, true);
      }
    }
  }
  put(kx, ky, kz, BLOCK.AIR, true); // 坑口
}

/** 雪乡木屋：云杉井干墙 + 雪覆双坡顶 + 萤石窗（5×6） */
function stampSnowCabin(
  ax: number,
  az: number,
  fy: number,
  heightAt: (x: number, z: number) => number,
  put: StructPut,
): void {
  const x0 = ax - 2;
  const x1 = ax + 2;
  const z0 = az - 3;
  const z1 = az + 3;
  const wallTop = fy + 2;
  clearBox(x0, fy, z0, x1, wallTop + 2, z1, put);
  foundation(x0, z0, x1, z1, fy, BLOCK.SPRUCE_LOG, heightAt, put);
  slab(x0, fy - 1, x1, z1, fy - 1, BLOCK.PLANKS, put); // 地板
  // 井干墙（逐层实心木墙，南面留门洞与萤石窗）
  for (let y = fy; y <= wallTop; y++) {
    for (let wx = x0; wx <= x1; wx++) {
      put(wx, y, z0, BLOCK.SPRUCE_LOG, true);
      if (!((wx === ax || wx === ax + 1) && y <= fy + 1)) {
        put(wx, y, z1, BLOCK.SPRUCE_LOG, true);
      }
    }
    for (let wz = z0; wz <= z1; wz++) {
      put(x0, y, wz, BLOCK.SPRUCE_LOG, true);
      put(x1, y, wz, BLOCK.SPRUCE_LOG, true);
    }
  }
  put(x0 + 1, fy + 1, z1, BLOCK.GLOWBLOCK, true); // 暖窗（雪乡灯火）
  put(x1, fy + 1, az, BLOCK.GLASS, true);
  // 雪覆双坡顶
  gableRoof(x0, x1, az, wallTop + 2, 4, BLOCK.SNOW, put);
  // 烟囱
  for (let y = wallTop; y <= wallTop + 4; y++) put(x0 + 1, y, z0 + 1, BLOCK.COBBLE, true);
}
