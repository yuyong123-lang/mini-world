// 程序化纹理图集：256×256 canvas、16×16 tile 格、每 tile 16px（架构 §3 / 契约 §4）。
// 所有材质都由确定性纯函数绘制器当场画成——同 seed 输出逐像素一致，零外部素材文件。
// 契约修订记录：原 §4 的十帧裂纹备用区（23..32）与 water(tile 24) 冲突，
// 经主线程裁定移至空闲的 34..43（water 保持 24 不变）。

import { hashStr, mulberry32 } from '../core/rng';

/** 单个 tile 的像素尺寸 */
export const TILE_PX = 16;
/** 图集每边的 tile 数 */
export const ATLAS_GRID = 16;
/** 图集整边像素（= 256） */
export const ATLAS_SIZE = TILE_PX * ATLAS_GRID;
/** 半 texel inset，防止 NearestFilter 采样时邻 tile 渗色（架构 §5.2） */
export const UV_INSET_PX = 0.5;
/** 挖掘裂纹十帧的起始 tile 序号（契约修订后位置） */
export const CRACK_TILE_START = 34;
/** 挖掘裂纹帧数 */
export const CRACK_FRAMES = 10;

/** 水体 tile（data/blocks.json 的 WATER.tex 引用，见顶部 FIXME） */
export const WATER_TILE = 24;

// ---------------------------------------------------------------------------
// 名称 → tile 序号表（契约 §4 冻结索引 + 补充的 water/bedrock）
// ---------------------------------------------------------------------------
export const ATLAS_TILES: Record<string, number> = Object.freeze({
  grass_top: 0,
  grass_side: 1,
  dirt: 2,
  stone: 3,
  cobble: 4,
  sand: 5,
  sandstone: 6,
  log_side: 7,
  log_top: 8,
  planks: 9,
  leaves: 10,
  glass: 11,
  glow: 12,
  craft_table_top: 13,
  craft_table_side: 14,
  snow: 15,
  snow_side: 16,
  coal_ore: 17,
  iron_ore: 18,
  gold_ore: 19,
  sun: 20,
  moon: 21,
  /** 苹果物品图标 */
  apple: 22,
  /** 裂纹带起点（契约修订后 10 帧依次为 crack_overlay_0..9 → 34..43） */
  crack_overlay: CRACK_TILE_START,
  water: WATER_TILE,
  bedrock: 33,
  // ---- 动物掉落扩展（W 动物波）：分配表见 items/items.ts 顶部注释 ----
  /** 羊毛方块（三面同贴图）+ 物品图标共用 */
  wool: 44,
  /** 生牛肉物品图标 */
  raw_beef: 45,
  /** 生羊肉物品图标 */
  raw_mutton: 46,
  /** 皮革物品图标 */
  leather: 47,
  /** 生猪排物品图标（补：此前 RAW_PORK 无图标走色块） */
  raw_pork: 48,
  /** 铁锭物品图标 */
  iron_ingot: 49,
  /** 金锭物品图标 */
  gold_ingot: 50,
  /** 熟猪排物品图标 */
  cooked_pork: 51,
  /** 牛排物品图标 */
  cooked_beef: 52,
  /** 熟羊肉物品图标 */
  cooked_mutton: 53,
  /** 熔炉顶面（石面 + 排气孔） */
  furnace_top: 55,
  /** 熔炉侧面（石面 + 燃烧炉口） */
  furnace_side: 56,
  /** 铁剑物品图标 */
  iron_sword: 57,
  /** 铁镐物品图标 */
  iron_pickaxe: 58,
  /** 铁斧物品图标 */
  iron_axe: 59,
  /** 弓物品图标 */
  bow: 60,
  /** 箭物品图标 */
  arrow: 61,
  /** 皮革帽图标 */
  leather_helmet: 62,
  /** 皮革衣图标 */
  leather_chestplate: 63,
  /** 铁盔图标 */
  iron_helmet: 64,
  /** 铁胸甲图标 */
  iron_chestplate: 65,
  // ---- 中国区域扩展（66..81 区域方块，82..97 区域物品图标）----
  bamboo: 66,
  bamboo_leaf: 67,
  grey_tile: 68,
  grey_brick: 69,
  red_wall: 70,
  yellow_tile: 71,
  red_door: 72,
  bamboo_plank: 73,
  palm_leaf: 74,
  tea_leaves: 75,
  poplar_leaves: 76,
  grape_vine: 77,
  melon: 78,
  spruce_log: 79,
  spruce_leaves: 80,
  ice: 81,
  bamboo_shoot: 82,
  banana: 83,
  tea_leaf: 84,
  grape: 85,
  melon_slice: 86,
  milk: 87,
  feather: 88,
  tanghulu: 89,
  hotpot: 90,
  roast_duck: 91,
  rice_noodle_soup: 92,
  roast_lamb: 93,
  milk_tea: 94,
  lamb_skewer: 95,
  frozen_pear: 96,
  suancai: 97,
});

// ---------------------------------------------------------------------------
// 绘制器基础设施
// ---------------------------------------------------------------------------

type Rng = () => number;

/** 每材质一个绘制器：在 (x0,y0) 起始的 16×16 区域内作画，rng 保证同 seed 同结果 */
type Painter = (ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng) => void;

interface PainterEntry {
  tile: number;
  name: string;
  paint: Painter;
}

/** tile 序号 → 该 tile 左上角的像素坐标 */
function tileOrigin(tileIndex: number): { x0: number; y0: number } {
  return {
    x0: (tileIndex % ATLAS_GRID) * TILE_PX,
    y0: Math.floor(tileIndex / ATLAS_GRID) * TILE_PX,
  };
}

// ---- 小工具 -------------------------------------------------------------

function ri(rng: Rng): number {
  return Math.floor(rng() * TILE_PX);
}

function pick(rng: Rng, pal: readonly string[]): string {
  return pal[Math.floor(rng() * pal.length)];
}

function fillPx(ctx: CanvasRenderingContext2D, x: number, y: number, c: string): void {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, 1, 1);
}

function fillBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  c: string,
): void {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

/** 整块 16×16 逐像素取色填充（MC 风格噪点底子的通用做法） */
function noiseFill(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  rng: Rng,
  pal: readonly string[],
): void {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) fillPx(ctx, x0 + x, y0 + y, pick(rng, pal));
  }
}

/** 低频圆斑：石头/圆石类底子的斑块感来源 */
function paintBlob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  toneOf: (dx: number, dy: number) => string,
): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) fillPx(ctx, x, y, toneOf(dx, dy));
    }
  }
}

// ---------------------------------------------------------------------------
// 调色板
// ---------------------------------------------------------------------------

const PAL_GRASS: readonly string[] = ['#5da23a', '#529a30', '#67ac43', '#4a8c29', '#74b74c'];
const PAL_DIRT: readonly string[] = ['#8a6040', '#7a5334', '#93694a', '#6b4729', '#7f5936'];
const PAL_STONE: readonly string[] = ['#7c7c85', '#86868f', '#737379', '#8d8d96'];
const PAL_SAND: readonly string[] = ['#e3d29a', '#dcc98a', '#eddfae', '#d3bf82'];
const PAL_SNOW: readonly string[] = ['#f4fbff', '#eaf4fb', '#ffffff', '#ddeaf3'];
const PAL_LEAF: readonly string[] = ['#2f6b1f', '#3b7f27', '#27591a', '#469232', '#365f22'];
const PAL_PLANK: readonly string[] = ['#a87844', '#9c6e3d', '#b1834c'];
const PAL_BARK: readonly string[] = ['#5c3f1e', '#6b4a24', '#7a5529'];
const PAL_ROCK_DARK: readonly string[] = ['#4a4a51', '#3a3a41', '#55555c', '#2f2f36'];

// ---------------------------------------------------------------------------
// 各材质绘制器
// ---------------------------------------------------------------------------

/** 草方块顶面：绿底 + 明暗像素抖动 + 少量亮草叶 */
function pGrassTop(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_GRASS);
  for (let i = 0; i < 14; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#8ecf6a');
  for (let i = 0; i < 10; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#3d7022');
}

/** 泥土：棕噪点 + 少量石粒 */
function pDirt(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_DIRT);
  for (let i = 0; i < 9; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#5b3f28');
  for (let i = 0; i < 6; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#a37a56');
}

/** 草侧面：顶部 3~5px 绿锯齿条 + 下部泥土噪点 */
function pGrassSide(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  for (let x = 0; x < TILE_PX; x++) {
    const depth = 3 + Math.floor(rng() * 3); // 锯齿深度 3..5
    for (let y = 0; y < depth; y++) fillPx(ctx, x0 + x, y0 + y, pick(rng, PAL_GRASS));
    fillPx(ctx, x0 + x, y0 + depth, '#3d7022'); // 草/土分界暗线
    for (let y = depth + 1; y < TILE_PX; y++) fillPx(ctx, x0 + x, y0 + y, pick(rng, PAL_DIRT));
  }
}

/** 石头：灰底低频浅斑 + 细碎散点 */
function pStone(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_STONE);
  for (let k = 0; k < 5; k++) {
    const cx = 1 + ri(rng);
    const cy = 1 + ri(rng);
    const r = 2 + Math.floor(rng() * 3);
    const light = rng() < 0.5;
    paintBlob(ctx, x0 + cx, y0 + cy, r, () => (light ? '#91919b' : '#6c6c74'));
  }
  for (let i = 0; i < 12; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#616169');
  for (let i = 0; i < 6; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#9c9ca6');
}

/** 圆石：深灰缝底子 + 若干带明暗侧的 blob 石块 */
function pCobble(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  fillBox(ctx, x0, y0, TILE_PX, TILE_PX, '#4d4d54'); // 缝隙底色
  const centers: readonly (readonly [number, number])[] = [
    [3, 3], [10, 3], [5, 9], [12, 9], [2, 13], [9, 14],
  ];
  for (const [cx, cy] of centers) {
    const r = 2 + Math.floor(rng() * 2); // 2..3
    paintBlob(ctx, x0 + cx, y0 + cy, r, (dx, dy) =>
      dx - dy >= 0 ? '#8f8f99' : '#6d6d75');
    fillPx(ctx, x0 + cx, y0 + cy, rng() < 0.5 ? '#7f7f88' : '#86868f');
  }
  for (let i = 0; i < 10; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#5a5a61');
}

/** 沙：淡黄噪点 + 深色细沙粒 */
function pSand(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_SAND);
  for (let i = 0; i < 10; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#c1ab6c');
  for (let i = 0; i < 5; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#f6ecc4');
}

/** 砂岩：沙色底 + 水平沉积层理 */
function pSandstone(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_SAND);
  for (const by of [4, 10]) {
    for (let x = 0; x < TILE_PX; x++) {
      fillPx(ctx, x0 + x, y0 + by, '#efe0ad'); // 层理亮带
      fillPx(ctx, x0 + x, y0 + by + 1, '#c6ad74'); // 层理暗带
    }
  }
  for (let i = 0; i < 8; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#b89f68');
}

/** 原木侧面：竖条纹明暗 + 树节疤 */
function pLogSide(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  for (let x = 0; x < TILE_PX; x++) {
    const tone = pick(rng, PAL_BARK); // 每列一种基色 → 竖条纹
    for (let y = 0; y < TILE_PX; y++) {
      fillPx(ctx, x0 + x, y0 + y, rng() < 0.07 ? '#8a6130' : tone);
    }
  }
  // 一两个深色节疤
  const knots = 1 + Math.floor(rng() * 2);
  for (let k = 0; k < knots; k++) {
    const kx = 2 + ri(rng);
    const ky = 2 + ri(rng);
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        fillPx(ctx, x0 + ((kx + dx) & 15), y0 + ky + dy, '#3f2a12');
      }
    }
  }
}

/** 原木顶面：方形年轮（切比雪夫距离圈层） + 树皮外圈 */
function pLogTop(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  const rings: readonly string[] = ['#c79a5c', '#a87c42', '#d8ab68', '#96703a'];
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      let c: string;
      if (d > 7) c = '#5c3f1e'; // 树皮
      else c = rings[Math.floor(d) % rings.length];
      if (rng() < 0.12) c = '#b98a4a'; // 年轮扰动
      fillPx(ctx, x0 + x, y0 + y, c);
    }
  }
  fillPx(ctx, x0 + 7, y0 + 7, '#8a6130');
  fillPx(ctx, x0 + 8, y0 + 8, '#8a6130');
}

/** 木板：四条横板 + 板缝 + 边缘钉点 */
function pPlanks(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  for (let b = 0; b < 4; b++) {
    const base = pick(rng, PAL_PLANK);
    const ty = y0 + b * 4;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        fillPx(ctx, x0 + x, ty + y, rng() < 0.12 ? pick(rng, PAL_PLANK) : base);
      }
    }
    fillBox(ctx, x0, ty + 3, TILE_PX, 1, '#6d4926'); // 板缝
    fillPx(ctx, x0 + 1, ty + 1, '#5c3b1a'); // 左钉
    fillPx(ctx, x0 + TILE_PX - 2, ty + 1, '#5c3b1a'); // 右钉
  }
}

/** 树叶：绿噪点 + 约 15% 透明孔（配合 alphaTest / 半透明渲染） */
function pLeaves(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_LEAF);
  const holes = Math.round(TILE_PX * TILE_PX * 0.15);
  for (let i = 0; i < holes; i++) ctx.clearRect(x0 + ri(rng), y0 + ri(rng), 1, 1);
}

/** 玻璃：近透明内部 + 细边框 + 斜向高光 */
function pGlass(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  ctx.clearRect(x0, y0, TILE_PX, TILE_PX);
  fillBox(ctx, x0, y0, TILE_PX, TILE_PX, 'hsla(198,72%,88%,0.10)'); // 淡蓝薄雾
  const S = TILE_PX;
  fillBox(ctx, x0, y0, S, 1, '#d8eef8');
  fillBox(ctx, x0, y0 + S - 1, S, 1, '#d8eef8');
  fillBox(ctx, x0, y0, 1, S, '#d8eef8');
  fillBox(ctx, x0 + S - 1, y0, 1, S, '#d8eef8');
  // 四角加重
  fillPx(ctx, x0, y0, '#9dc4d4');
  fillPx(ctx, x0 + S - 1, y0, '#9dc4d4');
  fillPx(ctx, x0, y0 + S - 1, '#9dc4d4');
  fillPx(ctx, x0 + S - 1, y0 + S - 1, '#9dc4d4');
  // 斜向高光线两条
  for (let i = 0; i < 9; i++) fillPx(ctx, x0 + 2 + i, y0 + 2 + i, 'hsla(0,0%,100%,0.5)');
  for (let i = 0; i < 4; i++) fillPx(ctx, x0 + 10 + i, y0 + 1 + i, 'hsla(0,0%,100%,0.35)');
  // rng 用于微调高光尾迹长度（保持确定性）
  if (rng() < 0.5) fillPx(ctx, x0 + S - 3, y0 + S - 3, 'hsla(0,0%,100%,0.25)');
}

/** 萤光石：黄绿放射纹理 + 高亮点 */
function pGlow(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      let c: string;
      if (d < 2.4) c = '#fffbe0';
      else if (d < 3.8) c = '#ffee9a';
      else if (d < 5.4) c = '#ffd95e';
      else c = '#e8ae35';
      if (d >= 5.4 && rng() < 0.3) c = '#f5c451'; // 外圈放射抖动
      fillPx(ctx, x0 + x, y0 + y, c);
    }
  }
  for (let i = 0; i < 6; i++) {
    // 稀疏高亮结晶点
    fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#fff6b0');
  }
}

/** 工作台顶面：木板底 + 3×3 深色合成网格线 */
function pCraftTableTop(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, ['#8a5a2b', '#96632f', '#7c5026']);
  const dark = '#4a2f14';
  for (const k of [0, 5, 10, 15]) {
    fillBox(ctx, x0 + k, y0, 1, TILE_PX, dark); // 竖线
    fillBox(ctx, x0, y0 + k, TILE_PX, 1, dark); // 横线
  }
  // 网格外圈保留一点木色亮边，提示这是台面
  for (let x = 1; x < TILE_PX - 1; x++) {
    fillPx(ctx, x0 + x, y0 + 1, rng() < 0.4 ? '#b07a3a' : pick(rng, ['#8a5a2b', '#96632f']));
  }
}

/** 工作台侧面：台沿 + 板墙 + 中央工具剪影 */
function pCraftTableSide(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  fillBox(ctx, x0, y0, TILE_PX, 2, '#6b4320'); // 台面厚度沿
  for (let y = 2; y < TILE_PX; y++) {
    const base = pick(rng, ['#7c5227', '#8a5c2c', '#6f4922']);
    for (let x = 0; x < TILE_PX; x++) fillPx(ctx, x0 + x, y0 + y, base);
    if (y === 9 || y === TILE_PX - 1) fillBox(ctx, x0, y0 + y, TILE_PX, 1, '#553417'); // 板缝
  }
  // 锯与锤的近似剪影
  fillBox(ctx, x0 + 3, y0 + 5, 4, 6, '#3e2711');
  fillBox(ctx, x0 + 9, y0 + 4, 4, 3, '#3e2711');
  fillBox(ctx, x0 + 10, y0 + 7, 2, 4, '#3e2711');
}

/** 雪：白噪点 + 微蓝阴影粒 */
function pSnow(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_SNOW);
  for (let i = 0; i < 8; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#cbdcea');
}

/** 雪侧面：顶部雪层锯齿 + 下部泥土 */
function pSnowSide(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  for (let x = 0; x < TILE_PX; x++) {
    const depth = 3 + Math.floor(rng() * 3);
    for (let y = 0; y < depth; y++) fillPx(ctx, x0 + x, y0 + y, pick(rng, PAL_SNOW));
    fillPx(ctx, x0 + x, y0 + depth, '#b9cede'); // 雪/土过渡
    for (let y = depth + 1; y < TILE_PX; y++) fillPx(ctx, x0 + x, y0 + y, pick(rng, PAL_DIRT));
  }
}

/** 矿石通用：石头底 + 数簇彩色晶粒 */
function orePainter(main: string, hi: string, lo: string): Painter {
  return (ctx, x0, y0, rng) => {
    pStone(ctx, x0, y0, rng); // 先铺石头
    const clusters = 3 + Math.floor(rng() * 2);
    for (let k = 0; k < clusters; k++) {
      const cx = 1 + ri(rng);
      const cy = 1 + ri(rng);
      // 菱形簇：中心 + 四向臂（是否延伸由 rng 定）
      fillPx(ctx, x0 + cx, y0 + cy, main);
      fillPx(ctx, x0 + cx + 1, y0 + cy, main);
      fillPx(ctx, x0 + cx, y0 + cy + 1, main);
      fillPx(ctx, x0 + cx + 1, y0 + cy + 1, lo);
      if (rng() < 0.7) fillPx(ctx, x0 + cx - 1, y0 + cy, main);
      if (rng() < 0.7) fillPx(ctx, x0 + cx, y0 + cy - 1, hi);
    }
  };
}

/** 太阳：黄白亮块核心 + 光晕角散射 */
function pSun(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      let c: string;
      if (d < 3.2) c = '#fffbe0';
      else if (d < 5) c = '#ffe97a';
      else if (d < 6.6) c = '#ffd54a';
      else c = '#f2b52e';
      if (d >= 6.6 && rng() < 0.3) c = '#ffe97a'; // 光晕角散射
      if (d >= 6.6 && rng() < 0.15) c = '#fff3a6';
      fillPx(ctx, x0 + x, y0 + y, c);
    }
  }
}

/** 月亮：透明底上的蓝白月牙 + 点缀星芒 */
function pMoon(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  ctx.clearRect(x0, y0, TILE_PX, TILE_PX);
  const cutX = 11.5;
  const cutY = 4.5;
  const cutR = 6.2;
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 7.2) continue; // 月盘外留透明
      const dc = Math.hypot(x - cutX, y - cutY);
      if (dc <= cutR) continue; // 减去偏移盘 → 月牙
      fillPx(ctx, x0 + x, y0 + y, rng() < 0.25 ? '#cbd9f2' : '#eef3ff');
      if (d > 6.3) fillPx(ctx, x0 + x, y0 + y, '#c3d1ea'); // 边缘暗环
    }
  }
  // 几颗星点，避开月盘区域
  for (let s = 0; s < 3; s++) {
    for (let tries = 0; tries < 20; tries++) {
      const sx = ri(rng);
      const sy = ri(rng);
      if (Math.hypot(sx - 7.5, sy - 7.5) > 9.2) {
        fillPx(ctx, x0 + sx, y0 + sy, '#ffffff');
        break;
      }
    }
  }
}

/** 苹果物品图标：红果身 + 棕柄绿叶 */
function pApple(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  ctx.clearRect(x0, y0, TILE_PX, TILE_PX);
  const profile: readonly number[] = [3, 5, 6, 6, 6, 6, 6, 5, 4]; // 行宽半径（对称于 x=8）
  for (let r = 0; r < profile.length; r++) {
    const half = profile[r];
    const yy = 4 + r;
    for (let x = 8 - half; x < 8 + half; x++) {
      let c = '#cf2f2f';
      if (x > 8 || yy > 9) c = rng() < 0.25 ? '#9e2020' : '#c02a2a'; // 右下暗面
      if (x < 6 && yy < 8 && rng() < 0.3) c = '#ff8f8f'; // 左上高光
      fillPx(ctx, x0 + x, y0 + yy, c);
    }
  }
  fillPx(ctx, x0 + 7, y0 + 2, '#6b4a24'); // 果柄
  fillPx(ctx, x0 + 7, y0 + 3, '#5a3a18');
  fillBox(ctx, x0 + 8, y0 + 2, 3, 2, '#4caf3c'); // 叶片
  fillPx(ctx, x0 + 10, y0 + 3, '#35842a');
}

/** 水：半透明蓝底 + 正弦微波亮纹 + 星点反光 */
function pWater(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  ctx.clearRect(x0, y0, TILE_PX, TILE_PX);
  fillBox(ctx, x0, y0, TILE_PX, TILE_PX, 'hsla(208,72%,45%,0.62)');
  for (let y = 0; y < TILE_PX; y++) {
    const crest = Math.round(Math.sin((y / TILE_PX) * Math.PI * 2) * 1.6);
    for (let x = 0; x < TILE_PX; x++) {
      if ((x + crest + TILE_PX) % 5 === 0) {
        fillPx(ctx, x0 + x, y0 + y, 'hsla(200,90%,68%,0.5)'); // 波峰亮线
      }
    }
  }
  for (let i = 0; i < 6; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), 'hsla(192,100%,84%,0.55)');
}

/** 挖掘裂纹第 frame 帧（0 起）：黑裂线数量/长度/不透明度随帧推进 */
function crackPainter(frame: number): Painter {
  return (ctx, x0, y0, rng) => {
    ctx.clearRect(x0, y0, TILE_PX, TILE_PX);
    ctx.globalAlpha = 0.18 + frame * 0.07;
    fillBox(ctx, x0 + 7, y0 + 7, 2, 2, '#101010'); // 起爆中心
    const segs = 2 + frame;
    for (let s = 0; s < segs; s++) {
      let x = 7 + (Math.floor(rng() * 3) - 1);
      let y = 7 + (Math.floor(rng() * 3) - 1);
      const steps = 4 + Math.floor(rng() * 5);
      for (let i = 0; i < steps; i++) {
        fillPx(
          ctx,
          x0 + Math.min(TILE_PX - 1, Math.max(0, x)),
          y0 + Math.min(TILE_PX - 1, Math.max(0, y)),
          '#0a0a0a',
        );
        x += Math.floor(rng() * 3) - 1; // 随机行走 → 折线裂纹
        y += Math.floor(rng() * 3) - 1;
      }
    }
    ctx.globalAlpha = 1;
  };
}

/** 基岩：深灰粗颗粒（2px 团块级噪点，粗糙感） */
function pBedrock(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  for (let y = 0; y < TILE_PX; y += 2) {
    for (let x = 0; x < TILE_PX; x += 2) {
      const c = pick(rng, PAL_ROCK_DARK);
      fillBox(ctx, x0 + x, y0 + y, 2, 2, c);
    }
  }
  for (let i = 0; i < 14; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#222228');
  for (let i = 0; i < 6; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#66666e');
}

/** 羊毛：米白噪点 + 斜向编织暗纹（蓬松织物感） */
function pWool(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  const pal: readonly string[] = ['#f2efe6', '#eae6da', '#faf8f0', '#e2ddce'];
  noiseFill(ctx, x0, y0, rng, pal);
  // 斜向编织线：两组方向相反的淡暗斜线，间隔 4px
  for (let d = -TILE_PX; d < TILE_PX * 2; d += 4) {
    for (let y = 0; y < TILE_PX; y++) {
      const x = d + y;
      if (x >= 0 && x < TILE_PX && rng() < 0.8) fillPx(ctx, x0 + x, y0 + y, '#d8d2c0');
    }
  }
}

/** 生肉通用绘制器：红/粉肉块 + 大理石脂肪纹 + 外圈深色描边 */
function meatPainter(
  body: readonly string[],
  fat: string,
  edge: string,
): Painter {
  return (ctx, x0, y0, rng) => {
    ctx.clearRect(x0, y0, TILE_PX, TILE_PX);
    // 排形轮廓（行宽半径，对称于 x=8）：圆角肉排
    const profile: readonly number[] = [2, 4, 5, 6, 6, 6, 6, 6, 5, 4];
    for (let r = 0; r < profile.length; r++) {
      const half = profile[r];
      const yy = 3 + r;
      for (let x = 8 - half; x < 8 + half; x++) {
        const isEdge = r === 0 || r === profile.length - 1 || x === 8 - half || x === 8 + half - 1;
        let c: string;
        if (isEdge) c = edge;
        else if (rng() < 0.18) c = fat; // 大理石脂肪碎纹
        else c = pick(rng, body);
        fillPx(ctx, x0 + x, y0 + yy, c);
      }
    }
    // 中央脂肪条
    fillBox(ctx, x0 + 5, y0 + 7, 6, 1, fat);
  };
}

/** 皮革：棕色圆角皮子 + 缝线边 + 折痕 */
function pLeather(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  ctx.clearRect(x0, y0, TILE_PX, TILE_PX);
  const pal: readonly string[] = ['#a5692e', '#96602a', '#b07634', '#8a5726'];
  const profile: readonly number[] = [3, 5, 6, 6, 6, 6, 6, 5, 3];
  for (let r = 0; r < profile.length; r++) {
    const half = profile[r];
    const yy = 3 + r;
    for (let x = 8 - half; x < 8 + half; x++) {
      const isEdge = r === 0 || r === profile.length - 1 || x === 8 - half || x === 8 + half - 1;
      fillPx(ctx, x0 + x, y0 + yy, isEdge ? '#6e441c' : pick(rng, pal));
    }
  }
  // 缝线（上缘内侧虚线）与折痕
  for (let x = 4; x < 12; x += 2) fillPx(ctx, x0 + x, y0 + 5, '#d9b98c');
  for (let y = 8; y < 12; y++) fillPx(ctx, x0 + 7 + ((y - 8) % 2), y0 + y, '#7a4c20');
}

/** 锭类物品图标：立体梯形锭 + 高光/暗面 */
function ingotPainter(high: string, mid: string, shadow: string): Painter {
  return (ctx, x0, y0) => {
    ctx.clearRect(x0, y0, TILE_PX, TILE_PX);
    // 顶面（平行四边形）→ 前面 → 侧面 的极简锭形
    fillBox(ctx, x0 + 3, y0 + 6, 10, 2, high); // 顶面亮条
    fillBox(ctx, x0 + 2, y0 + 8, 12, 4, mid); // 正面
    fillBox(ctx, x0 + 2, y0 + 12, 12, 1, shadow); // 底棱
    fillBox(ctx, x0 + 13, y0 + 8, 1, 4, shadow); // 右暗面
    fillBox(ctx, x0 + 4, y0 + 9, 8, 1, high); // 正面高光线
  };
}

/** 熟肉通用绘制器：烤棕肉排 + 深色烤痕 */
function cookedMeatPainter(
  body: readonly string[],
  sear: string,
  edge: string,
): Painter {
  return (ctx, x0, y0, rng) => {
    ctx.clearRect(x0, y0, TILE_PX, TILE_PX);
    const profile: readonly number[] = [2, 4, 5, 6, 6, 6, 6, 6, 5, 4];
    for (let r = 0; r < profile.length; r++) {
      const half = profile[r];
      const yy = 3 + r;
      for (let x = 8 - half; x < 8 + half; x++) {
        const isEdge = r === 0 || r === profile.length - 1 || x === 8 - half || x === 8 + half - 1;
        let c: string;
        if (isEdge) c = edge;
        else if (rng() < 0.16) c = sear;
        else c = pick(rng, body);
        fillPx(ctx, x0 + x, y0 + yy, c);
      }
    }
  };
}

/** 熔炉顶面：石噪点 + 中央方形排气孔 */
function pFurnaceTop(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_STONE);
  // 中央 6×6 排气孔（深色内圈 + 更深的孔）
  fillBox(ctx, x0 + 5, y0 + 5, 6, 6, '#3a3a41');
  fillBox(ctx, x0 + 6, y0 + 6, 4, 4, '#1c1c22');
  for (let i = 0; i < 6; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#63636c');
}

/** 熔炉侧面：石噪点 + 底部拱形燃烧炉口 */
function pFurnaceSide(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_STONE);
  // 拱形炉口：8 宽 × 5 高，顶部两侧切角
  fillBox(ctx, x0 + 4, y0 + 9, 8, 5, '#26262c');
  fillBox(ctx, x0 + 5, y0 + 8, 6, 1, '#26262c');
  fillBox(ctx, x0 + 3, y0 + 13, 10, 1, '#17171c'); // 门槛阴影
  // 炉口内的余烬点缀
  for (let i = 0; i < 4; i++) {
    fillPx(ctx, x0 + 5 + ri(rng) % 6, y0 + 11 + (ri(rng) % 3), '#c96a1e');
  }
  for (let i = 0; i < 8; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#63636c');
}

/** 斜线绘制工具：从 (x,y) 起 dx/dy 步进 n 像素 */
function stroke(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number,
  x: number, y: number,
  n: number, dx: number, dy: number, c: string,
): void {
  for (let i = 0; i < n; i++) {
    fillPx(ctx, x0 + x + dx * i, y0 + y + dy * i, c);
  }
}

/** 铁剑图标：右下→左上斜刃 + 十字护手 + 柄 */
function pIronSword(ctx: CanvasRenderingContext2D, x0: number, y0: number): void {
  ctx.clearRect(x0, y0, TILE_PX, TILE_PX);
  const blade = '#d8dde4';
  const bladeHi = '#f2f6fa';
  // 刃：从 (12,3) 到 (6,9) 的斜线加粗
  for (let i = 0; i < 7; i++) {
    fillPx(ctx, x0 + 12 - i, y0 + 3 + i, blade);
    fillPx(ctx, x0 + 11 - i, y0 + 3 + i, bladeHi);
  }
  // 剑尖
  fillPx(ctx, x0 + 13, y0 + 2, bladeHi);
  // 十字护手：垂直于刃的反斜线
  stroke(ctx, x0, y0, 4, 8, 9, 1, -1, '#8a6a30');
  // 柄：左下延伸
  stroke(ctx, x0, y0, 4, 11, 2, -1, 1, '#5c431f');
  fillBox(ctx, x0 + 1, y0 + 12, 2, 2, '#3d2c12');
}

/** 铁镐图标：弧形镐头 + 斜柄 */
function pIronPickaxe(ctx: CanvasRenderingContext2D, x0: number, y0: number): void {
  ctx.clearRect(x0, y0, TILE_PX, TILE_PX);
  const iron = '#d8dde4';
  const dark = '#9aa2ac';
  // 镐头：上拱弧线（两翼下垂）
  stroke(ctx, x0, y0, 3, 6, 4, 1, -1, iron);
  fillPx(ctx, x0 + 7, y0 + 2, iron);
  stroke(ctx, x0, y0, 8, 3, 4, 1, 1, iron);
  fillPx(ctx, x0 + 2, y0 + 7, dark);
  fillPx(ctx, x0 + 12, y0 + 7, dark);
  // 柄：中上到右下的斜线
  stroke(ctx, x0, y0, 7, 3, 9, 0, 1, '#8a6a30');
  stroke(ctx, x0, y0, 8, 3, 9, 0, 1, '#6b4f24');
}

/** 铁斧图标：侧视斧刃 + 竖柄 */
function pIronAxe(ctx: CanvasRenderingContext2D, x0: number, y0: number): void {
  ctx.clearRect(x0, y0, TILE_PX, TILE_PX);
  const iron = '#d8dde4';
  const hi = '#f2f6fa';
  const dark = '#9aa2ac';
  // 斧刃：左缘开口的厚楔形
  fillBox(ctx, x0 + 4, y0 + 3, 6, 3, iron);
  fillBox(ctx, x0 + 3, y0 + 4, 8, 4, iron);
  fillBox(ctx, x0 + 4, y0 + 8, 6, 2, dark);
  fillPx(ctx, x0 + 3, y0 + 5, hi);
  fillPx(ctx, x0 + 3, y0 + 6, hi);
  // 柄：刃右侧竖直向下
  stroke(ctx, x0, y0, 10, 2, 11, 0, 1, '#8a6a30');
  stroke(ctx, x0, y0, 11, 2, 11, 0, 1, '#6b4f24');
}

/** 弓图标：弧形弓身 + 弦 + 斜搭的箭 */
function pBow(ctx: CanvasRenderingContext2D, x0: number, y0: number): void {
  ctx.clearRect(x0, y0, TILE_PX, TILE_PX);
  const wood = '#8a6a30';
  const woodDark = '#6b4f24';
  const string = '#e8e4d8';
  // 弓身：右侧竖向弧（三点定弧，中点右凸）
  stroke(ctx, x0, y0, 11, 2, 1, 1, 1, wood);
  stroke(ctx, x0, y0, 12, 3, 8, 0, 1, wood);
  fillPx(ctx, x0 + 13, y0 + 5, woodDark);
  fillPx(ctx, x0 + 13, y0 + 9, woodDark);
  stroke(ctx, x0, y0, 12, 11, 1, -1, 1, wood);
  // 弦：左凸的细线
  stroke(ctx, x0, y0, 11, 2, 10, 0, 1, string);
  // 搭在弦上的箭（指向右上）
  stroke(ctx, x0, y0, 4, 8, 4, 1, -1, '#c9a15a'); // 箭杆
  fillPx(ctx, x0 + 8, y0 + 3, '#d8dde4'); // 箭头
  fillPx(ctx, x0 + 3, y0 + 9, '#e8e4dc'); // 尾羽
  fillPx(ctx, x0 + 3, y0 + 8, '#f2f0ea');
}

/** 箭图标：斜置箭杆 + 石/铁头 + 尾羽 */
function pArrow(ctx: CanvasRenderingContext2D, x0: number, y0: number): void {
  ctx.clearRect(x0, y0, TILE_PX, TILE_PX);
  // 箭杆：左下 → 右上
  stroke(ctx, x0, y0, 3, 12, 9, 1, -1, '#c9a15a');
  // 箭头：右上端
  fillPx(ctx, x0 + 12, y0 + 3, '#d8dde4');
  fillPx(ctx, x0 + 13, y0 + 2, '#f2f6fa');
  fillPx(ctx, x0 + 12, y0 + 4, '#9aa2ac');
  // 尾羽：左下端三片
  fillPx(ctx, x0 + 2, y0 + 13, '#e8e4dc');
  fillPx(ctx, x0 + 2, y0 + 12, '#f2f0ea');
  fillPx(ctx, x0 + 3, y0 + 13, '#f2f0ea');
}

/** 头盔图标工厂：圆顶盔形（主色 + 暗色描边 + 面甲开口） */
function helmetPainter(main: string, dark: string): Painter {
  return (ctx, x0, y0) => {
    ctx.clearRect(x0, y0, TILE_PX, TILE_PX);
    fillBox(ctx, x0 + 3, y0 + 3, 10, 2, main); // 顶
    fillBox(ctx, x0 + 2, y0 + 5, 12, 4, main); // 盔体
    fillBox(ctx, x0 + 4, y0 + 9, 8, 2, dark); // 面甲开口
    fillBox(ctx, x0 + 2, y0 + 9, 2, 2, main); // 左护耳
    fillBox(ctx, x0 + 12, y0 + 9, 2, 2, main); // 右护耳
    fillBox(ctx, x0 + 4, y0 + 4, 4, 1, '#ffffff55'); // 高光
  };
}

/** 胸甲图标工厂：背心形（肩甲 + 躯干 + 中缝） */
function chestplatePainter(main: string, dark: string): Painter {
  return (ctx, x0, y0) => {
    ctx.clearRect(x0, y0, TILE_PX, TILE_PX);
    fillBox(ctx, x0 + 2, y0 + 3, 4, 3, main); // 左肩甲
    fillBox(ctx, x0 + 10, y0 + 3, 4, 3, main); // 右肩甲
    fillBox(ctx, x0 + 4, y0 + 4, 8, 9, main); // 躯干
    fillBox(ctx, x0 + 7, y0 + 4, 2, 9, dark); // 中缝
    fillBox(ctx, x0 + 5, y0 + 5, 2, 1, '#ffffff55'); // 高光
    fillBox(ctx, x0 + 4, y0 + 12, 8, 1, dark); // 下摆
  };
}

// ---------------------------------------------------------------------------
// 中国区域扩展绘制器（66..81 区域方块，82..97 区域物品图标）
// ---------------------------------------------------------------------------

const PAL_BAMBOO: readonly string[] = ['#a8c060', '#98b055', '#b5cc70', '#8aa04a'];
const PAL_BAMBOO_LEAF: readonly string[] = ['#6ba832', '#5c9826', '#7cb83e', '#4f8620'];
const PAL_TILE_GREY: readonly string[] = ['#5a636e', '#525a64', '#646d78', '#4a525c'];
const PAL_BRICK_GREY: readonly string[] = ['#8a9298', '#7e868c', '#969ea4', '#747c82'];
const PAL_WALL_RED: readonly string[] = ['#9e3528', '#8e2c20', '#aa3e30', '#80261c'];
const PAL_TILE_YELLOW: readonly string[] = ['#e0b030', '#d0a020', '#f0c440', '#c09018'];
const PAL_BAMBOO_PLANK: readonly string[] = ['#c8b060', '#bca455', '#d4bc6c', '#b09a4a'];
const PAL_PALM: readonly string[] = ['#4a9838', '#3f8a2e', '#57a842', '#357a26'];
const PAL_TEA: readonly string[] = ['#3a6e2a', '#2f5e20', '#457e34', '#28501c'];
const PAL_POPLAR: readonly string[] = ['#d8b030', '#c8a020', '#e8c440', '#b89018'];
const PAL_SPRUCE_BARK: readonly string[] = ['#4a3520', '#3e2c18', '#563e26', '#342414'];
const PAL_SPRUCE_LEAF: readonly string[] = ['#2a4a3a', '#203c30', '#34584a', '#1a3028'];
const PAL_ICE: readonly string[] = ['#b8d8e8', '#a8cce0', '#c8e4f0', '#98c0d8'];
const PAL_MELON_RIND: readonly string[] = ['#b8a850', '#ac9c46', '#c4b45a', '#a09040'];

/** 竹竿：黄绿竖纹 + 两道竹节 */
function pBamboo(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_BAMBOO);
  for (let x = 1; x < TILE_PX; x += 4) {
    for (let y = 0; y < TILE_PX; y++) fillPx(ctx, x0 + x, y0 + y, '#8aa04a');
  }
  fillBox(ctx, x0, y0 + 5, TILE_PX, 1, '#6a8038');
  fillBox(ctx, x0, y0 + 11, TILE_PX, 1, '#6a8038');
}

/** 竹叶：黄绿噪点 + 斜向亮叶脉 */
function pBambooLeaf(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_BAMBOO_LEAF);
  for (let i = 0; i < 10; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#8ed04a');
  for (let i = 0; i < 6; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#3e6e18');
}

/** 青瓦：灰蓝底 + 波浪瓦垄（竖向明暗条 + 横向搭接缝） */
function pGreyTile(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_TILE_GREY);
  for (let x = 0; x < TILE_PX; x++) {
    const shade = x % 4 === 0 ? '#434b55' : x % 4 === 2 ? '#6e7883' : null;
    if (shade) for (let y = 0; y < TILE_PX; y++) fillPx(ctx, x0 + x, y0 + y, shade);
  }
  fillBox(ctx, x0, y0 + 7, TILE_PX, 1, '#3a424c');
  fillBox(ctx, x0, y0 + 15, TILE_PX, 1, '#3a424c');
}

/** 青砖：灰青砖体 + 交错砖缝 */
function pGreyBrick(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_BRICK_GREY);
  for (const y of [3, 7, 11, 15]) fillBox(ctx, x0, y0 + y, TILE_PX, 1, '#5a6268');
  for (let row = 0; row < 4; row++) {
    const off = row % 2 === 0 ? 3 : 11;
    for (let y = row * 4; y < row * 4 + 3; y++) fillPx(ctx, x0 + off, y0 + y, '#5a6268');
  }
  for (let i = 0; i < 5; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#a4acb2');
}

/** 宫墙：朱红底 + 水平抹灰缝 */
function pRedWall(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_WALL_RED);
  for (const y of [5, 11]) fillBox(ctx, x0, y0 + y, TILE_PX, 1, '#6e2018');
  for (let i = 0; i < 7; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#b84c3c');
}

/** 琉璃瓦：金黄底 + 竖向瓦垄高光 */
function pYellowTile(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_TILE_YELLOW);
  for (let x = 0; x < TILE_PX; x++) {
    const shade = x % 4 === 0 ? '#a87e14' : x % 4 === 2 ? '#ffd860' : null;
    if (shade) for (let y = 0; y < TILE_PX; y++) fillPx(ctx, x0 + x, y0 + y, shade);
  }
  fillBox(ctx, x0, y0 + 15, TILE_PX, 1, '#987010');
}

/** 朱红大门：红木底 + 竖板缝 + 金色门钉 */
function pRedDoor(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_WALL_RED);
  for (const x of [4, 8, 12]) for (let y = 0; y < TILE_PX; y++) fillPx(ctx, x0 + x, y0 + y, '#6a1e14');
  for (const gx of [2, 6, 10, 14]) {
    for (const gy of [3, 8, 13]) {
      fillBox(ctx, x0 + gx - 1, y0 + gy - 1, 2, 2, '#f0c040');
    }
  }
}

/** 竹板：黄绿竹板横条拼面 */
function pBambooPlank(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_BAMBOO_PLANK);
  for (const y of [0, 4, 8, 12]) fillBox(ctx, x0, y0 + y, TILE_PX, 1, '#8a7434');
  for (let i = 0; i < 6; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#e0cc80');
}

/** 芭蕉叶：亮绿宽叶 + 中脉 */
function pPalmLeaf(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_PALM);
  fillBox(ctx, x0, y0 + 7, TILE_PX, 2, '#2e6a20');
  for (let i = 0; i < 8; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#6cc050');
}

/** 茶叶：深绿细密噪点 + 嫩芽亮点 */
function pTeaLeaves(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_TEA);
  for (let i = 0; i < 9; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#6aa848');
}

/** 胡杨叶：金黄噪点 + 橙斑 */
function pPoplarLeaves(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_POPLAR);
  for (let i = 0; i < 7; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#f0d860');
  for (let i = 0; i < 5; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#a87810');
}

/** 葡萄藤：叶底 + 紫色果串点缀 */
function pGrapeVine(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_PALM);
  for (const [gx, gy] of [[4, 4], [10, 3], [7, 9], [12, 11], [3, 12]] as const) {
    fillBox(ctx, x0 + gx, y0 + gy, 2, 2, '#6a3a98');
    fillPx(ctx, x0 + gx, y0 + gy, '#8a5ab8');
  }
}

/** 哈密瓜：黄绿网纹瓜皮 */
function pMelon(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_MELON_RIND);
  for (let i = 0; i < 16; i++) {
    const x = ri(rng);
    const y = ri(rng);
    fillPx(ctx, x0 + x, y0 + y, '#e8dc90');
    if (x < 15) fillPx(ctx, x0 + x + 1, y0 + y, '#e8dc90');
  }
}

/** 云杉木：深棕竖纹树皮 */
function pSpruceLog(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_SPRUCE_BARK);
  for (let x = 2; x < TILE_PX; x += 5) {
    for (let y = 0; y < TILE_PX; y++) fillPx(ctx, x0 + x, y0 + y, '#2c1e10');
  }
}

/** 雪杉叶：蓝绿针叶 + 覆雪白点 */
function pSpruceLeaves(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_SPRUCE_LEAF);
  for (let i = 0; i < 10; i++) fillPx(ctx, x0 + ri(rng), y0 + ri(rng), '#e8f4f8');
}

/** 冰：淡蓝晶面 + 斜向裂纹 */
function pIce(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  noiseFill(ctx, x0, y0, rng, PAL_ICE);
  for (let i = 0; i < 8; i++) {
    const sx = ri(rng);
    const sy = ri(rng);
    fillPx(ctx, x0 + sx, y0 + sy, '#e8f8ff');
    if (sx < 15) fillPx(ctx, x0 + sx + 1, y0 + Math.min(15, sy + 1), '#e8f8ff');
  }
}

// ---- 区域物品图标（82..97）----

/** 竹笋：宝塔形三层锥体 */
function pBambooShoot(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  void rng;
  fillBox(ctx, x0 + 6, y0 + 12, 4, 2, '#c8a850'); // 基座
  fillBox(ctx, x0 + 5, y0 + 9, 6, 3, '#b8c060');
  fillBox(ctx, x0 + 6, y0 + 6, 4, 3, '#a8b050');
  fillBox(ctx, x0 + 7, y0 + 3, 2, 3, '#98a040');
  fillBox(ctx, x0 + 6, y0 + 10, 1, 2, '#d8dc80'); // 高光
}

/** 芭蕉：黄色弯月果 */
function pBanana(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  void rng;
  for (let i = 0; i < 9; i++) {
    const y = 4 + i;
    const w = i < 4 ? 3 : 4;
    fillBox(ctx, x0 + 4 + i, y0 + y, w, 1, i === 8 ? '#8a7420' : '#f0d040');
  }
  fillBox(ctx, x0 + 4, y0 + 4, 2, 2, '#5c7a2a'); // 蒂
  fillBox(ctx, x0 + 8, y0 + 8, 3, 1, '#fff0a0'); // 高光
}

/** 茶叶：两片对生嫩叶 */
function pTeaLeaf(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  void rng;
  fillBox(ctx, x0 + 4, y0 + 8, 4, 3, '#3a6e2a');
  fillBox(ctx, x0 + 8, y0 + 5, 4, 3, '#4a8236');
  fillBox(ctx, x0 + 7, y0 + 6, 2, 6, '#2e5a20'); // 茎
  fillPx(ctx, x0 + 9, y0 + 6, '#7cb858');
}

/** 葡萄：紫色果串 */
function pGrape(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  void rng;
  for (const [gx, gy] of [[6, 6], [9, 6], [4, 9], [7, 9], [10, 9], [5, 12], [8, 12]] as const) {
    fillBox(ctx, x0 + gx, y0 + gy, 3, 3, '#6a3a98');
    fillPx(ctx, x0 + gx, y0 + gy, '#9a6ac8');
  }
  fillBox(ctx, x0 + 7, y0 + 3, 2, 3, '#5c7a2a'); // 藤
}

/** 哈密瓜片：橙色半月切片 */
function pMelonSlice(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  void rng;
  fillBox(ctx, x0 + 3, y0 + 8, 10, 2, '#e8a040'); // 瓤
  fillBox(ctx, x0 + 2, y0 + 10, 12, 2, '#b8a850'); // 皮
  fillBox(ctx, x0 + 5, y0 + 8, 2, 2, '#f8c070'); // 高光
  fillPx(ctx, x0 + 9, y0 + 9, '#f8c070');
}

/** 牛奶：白色奶盒 */
function pMilk(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  void rng;
  fillBox(ctx, x0 + 4, y0 + 5, 8, 9, '#f0f0f0');
  fillBox(ctx, x0 + 5, y0 + 3, 6, 2, '#d8d8d8'); // 盒顶折边
  fillBox(ctx, x0 + 4, y0 + 9, 8, 3, '#60a8e8'); // 蓝标
  fillBox(ctx, x0 + 4, y0 + 5, 1, 9, '#d0d0d0'); // 侧影
}

/** 羽毛：白色斜羽 */
function pFeather(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  void rng;
  for (let i = 0; i < 9; i++) {
    fillBox(ctx, x0 + 3 + i, y0 + 12 - i, 3, 2, i % 2 === 0 ? '#f4f8fc' : '#e0e8f0');
  }
  for (let i = 0; i < 9; i++) fillPx(ctx, x0 + 4 + i, y0 + 12 - i, '#b8c4d0'); // 羽轴
}

/** 糖葫芦：竹签串三颗糖球 */
function pTanghulu(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  void rng;
  fillBox(ctx, x0 + 7, y0 + 2, 2, 12, '#c8a860'); // 竹签
  for (const gy of [4, 8, 12] as const) {
    fillBox(ctx, x0 + 5, y0 + gy, 6, 4, '#c02a1e');
    fillPx(ctx, x0 + 6, y0 + gy + 1, '#f06050'); // 糖衣高光
  }
}

/** 火锅：红铜锅 + 白汤 + 红油 */
function pHotpot(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  void rng;
  fillBox(ctx, x0 + 2, y0 + 6, 12, 6, '#b03a2e'); // 锅身
  fillBox(ctx, x0 + 1, y0 + 4, 14, 3, '#c84a3c'); // 锅沿
  fillBox(ctx, x0 + 2, y0 + 5, 6, 1, '#f8f0e0'); // 白汤
  fillBox(ctx, x0 + 9, y0 + 5, 5, 1, '#d04020'); // 红汤
  fillBox(ctx, x0 + 4, y0 + 12, 8, 1, '#8a2a20'); // 锅底
}

/** 烤鸭：枣红油亮的整鸭 */
function pRoastDuck(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  void rng;
  fillBox(ctx, x0 + 4, y0 + 7, 9, 6, '#b86020'); // 鸭身
  fillBox(ctx, x0 + 3, y0 + 5, 4, 4, '#c87028'); // 鸭腿部位
  fillBox(ctx, x0 + 11, y0 + 4, 3, 4, '#a85018'); // 鸭颈
  fillBox(ctx, x0 + 12, y0 + 6, 3, 2, '#e8a050'); // 鸭头
  fillBox(ctx, x0 + 5, y0 + 8, 3, 2, '#e8a050'); // 油亮高光
}

/** 过桥米线：大碗 + 米线 + 汤面 */
function pRiceNoodleSoup(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  void rng;
  fillBox(ctx, x0 + 2, y0 + 8, 12, 5, '#4a7ab8'); // 碗
  fillBox(ctx, x0 + 1, y0 + 7, 14, 2, '#5a8ac8'); // 碗沿
  for (let x = 0; x < 12; x += 3) fillBox(ctx, x0 + 3 + x, y0 + 7, 2, 1, '#f8f4e8'); // 米线
  fillPx(ctx, x0 + 5, y0 + 7, '#c84a3c'); // 辣油点
}

/** 烤全羊：焦香全羊架 */
function pRoastLamb(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  void rng;
  fillBox(ctx, x0 + 3, y0 + 6, 10, 6, '#a86830'); // 躯干
  fillBox(ctx, x0 + 1, y0 + 4, 4, 4, '#98582a'); // 后腿
  fillBox(ctx, x0 + 11, y0 + 5, 4, 4, '#98582a'); // 前腿
  fillBox(ctx, x0 + 12, y0 + 3, 3, 3, '#8a4c24'); // 羊头
  fillBox(ctx, x0 + 5, y0 + 7, 4, 2, '#c88848'); // 焦糖高光
  fillBox(ctx, x0 + 6, y0 + 2, 1, 10, '#6a4a28'); // 烤签
}

/** 奶茶：杯装奶茶 + 封口膜 */
function pMilkTea(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  void rng;
  fillBox(ctx, x0 + 4, y0 + 6, 8, 8, '#c89050'); // 奶茶
  fillBox(ctx, x0 + 3, y0 + 5, 10, 2, '#e8e0d0'); // 封口膜
  fillBox(ctx, x0 + 4, y0 + 6, 1, 8, '#daa860'); // 侧光
  fillBox(ctx, x0 + 8, y0 + 10, 2, 4, '#8a5a30'); // 珍珠
}

/** 羊肉串：竹签串三块烤肉 */
function pLambSkewer(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  void rng;
  fillBox(ctx, x0 + 3, y0 + 8, 10, 1, '#c8a860'); // 竹签（斜放感）
  for (const [gx, gy] of [[3, 5], [7, 6], [10, 4]] as const) {
    fillBox(ctx, x0 + gx, y0 + gy, 3, 3, '#9c5830');
    fillPx(ctx, x0 + gx, y0 + gy, '#c07848'); // 焦香边
  }
}

/** 冻梨：深褐梨身 + 白霜 */
function pFrozenPear(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  void rng;
  fillBox(ctx, x0 + 5, y0 + 7, 6, 6, '#4a3c30'); // 梨身
  fillBox(ctx, x0 + 6, y0 + 4, 4, 3, '#423628'); // 梨肩
  fillBox(ctx, x0 + 7, y0 + 3, 2, 1, '#5c4c3a'); // 梨柄
  for (const [fx, fy] of [[5, 8], [8, 10], [6, 12], [9, 7]] as const) {
    fillPx(ctx, x0 + fx, y0 + fy, '#d8e8f0'); // 白霜
  }
}

/** 酸菜：黄绿菜丝堆 */
function pSuancai(ctx: CanvasRenderingContext2D, x0: number, y0: number, rng: Rng): void {
  void rng;
  for (let i = 0; i < 5; i++) {
    const y = 5 + i * 2;
    fillBox(ctx, x0 + 3 + (i % 2), y0 + y, 10 - (i % 2) * 2, 1, i % 2 === 0 ? '#c8c060' : '#a8b048');
  }
  fillBox(ctx, x0 + 5, y0 + 4, 6, 1, '#88903a'); // 顶部菜叶
  fillPx(ctx, x0 + 4, y0 + 6, '#e0d880');
}

// ---------------------------------------------------------------------------
// 绘制器注册表
// ---------------------------------------------------------------------------

const PAINTER_TABLE: PainterEntry[] = [
  { tile: 0, name: 'grass_top', paint: pGrassTop },
  { tile: 1, name: 'grass_side', paint: pGrassSide },
  { tile: 2, name: 'dirt', paint: pDirt },
  { tile: 3, name: 'stone', paint: pStone },
  { tile: 4, name: 'cobble', paint: pCobble },
  { tile: 5, name: 'sand', paint: pSand },
  { tile: 6, name: 'sandstone', paint: pSandstone },
  { tile: 7, name: 'log_side', paint: pLogSide },
  { tile: 8, name: 'log_top', paint: pLogTop },
  { tile: 9, name: 'planks', paint: pPlanks },
  { tile: 10, name: 'leaves', paint: pLeaves },
  { tile: 11, name: 'glass', paint: pGlass },
  { tile: 12, name: 'glow', paint: pGlow },
  { tile: 13, name: 'craft_table_top', paint: pCraftTableTop },
  { tile: 14, name: 'craft_table_side', paint: pCraftTableSide },
  { tile: 15, name: 'snow', paint: pSnow },
  { tile: 16, name: 'snow_side', paint: pSnowSide },
  { tile: 17, name: 'coal_ore', paint: orePainter('#232327', '#3a3a40', '#151518') },
  { tile: 18, name: 'iron_ore', paint: orePainter('#d0a184', '#e8c4a8', '#b18064') },
  { tile: 19, name: 'gold_ore', paint: orePainter('#ffd93d', '#fff0a0', '#d9a81f') },
  { tile: 20, name: 'sun', paint: pSun },
  { tile: 21, name: 'moon', paint: pMoon },
  { tile: 22, name: 'apple', paint: pApple },
  { tile: WATER_TILE, name: 'water', paint: pWater },
  { tile: 33, name: 'bedrock', paint: pBedrock },
  // ---- 动物掉落扩展（44..48，分配表见 items/items.ts 顶部）----
  { tile: 44, name: 'wool', paint: pWool },
  { tile: 45, name: 'raw_beef', paint: meatPainter(['#b0342a', '#a02c24', '#c04338'], '#e8d8c8', '#7a1f18') },
  { tile: 46, name: 'raw_mutton', paint: meatPainter(['#c4524a', '#b8453e', '#d06058'], '#f0e2d4', '#8e2f28') },
  { tile: 47, name: 'leather', paint: pLeather },
  { tile: 48, name: 'raw_pork', paint: meatPainter(['#e89aa0', '#e08a92', '#f0aab0'], '#f8ecec', '#c06a72') },
  // ---- 熔炉与铁器扩展（49..59，分配表见 items/items.ts 顶部）----
  { tile: 49, name: 'iron_ingot', paint: ingotPainter('#e8ecf2', '#b8c0cc', '#7e8894') },
  { tile: 50, name: 'gold_ingot', paint: ingotPainter('#ffe98a', '#f0c232', '#b8891a') },
  { tile: 51, name: 'cooked_pork', paint: cookedMeatPainter(['#b5704a', '#a5623c', '#c47e56'], '#8a4c2a', '#6e3a1e') },
  { tile: 52, name: 'cooked_beef', paint: cookedMeatPainter(['#8a4a34', '#7a3e2a', '#9c5840'], '#5e2e1c', '#4a2214') },
  { tile: 53, name: 'cooked_mutton', paint: cookedMeatPainter(['#a86248', '#98543c', '#b87054'], '#78422a', '#5c321e') },
  { tile: 55, name: 'furnace_top', paint: pFurnaceTop },
  { tile: 56, name: 'furnace_side', paint: pFurnaceSide },
  { tile: 57, name: 'iron_sword', paint: pIronSword },
  { tile: 58, name: 'iron_pickaxe', paint: pIronPickaxe },
  { tile: 59, name: 'iron_axe', paint: pIronAxe },
  { tile: 60, name: 'bow', paint: pBow },
  { tile: 61, name: 'arrow', paint: pArrow },
  { tile: 62, name: 'leather_helmet', paint: helmetPainter('#a5692e', '#6e441c') },
  { tile: 63, name: 'leather_chestplate', paint: chestplatePainter('#a5692e', '#6e441c') },
  { tile: 64, name: 'iron_helmet', paint: helmetPainter('#c8ced8', '#7e8894') },
  { tile: 65, name: 'iron_chestplate', paint: chestplatePainter('#c8ced8', '#7e8894') },
  // ---- 中国区域扩展（66..81 区域方块，82..97 区域物品图标）----
  { tile: 66, name: 'bamboo', paint: pBamboo },
  { tile: 67, name: 'bamboo_leaf', paint: pBambooLeaf },
  { tile: 68, name: 'grey_tile', paint: pGreyTile },
  { tile: 69, name: 'grey_brick', paint: pGreyBrick },
  { tile: 70, name: 'red_wall', paint: pRedWall },
  { tile: 71, name: 'yellow_tile', paint: pYellowTile },
  { tile: 72, name: 'red_door', paint: pRedDoor },
  { tile: 73, name: 'bamboo_plank', paint: pBambooPlank },
  { tile: 74, name: 'palm_leaf', paint: pPalmLeaf },
  { tile: 75, name: 'tea_leaves', paint: pTeaLeaves },
  { tile: 76, name: 'poplar_leaves', paint: pPoplarLeaves },
  { tile: 77, name: 'grape_vine', paint: pGrapeVine },
  { tile: 78, name: 'melon', paint: pMelon },
  { tile: 79, name: 'spruce_log', paint: pSpruceLog },
  { tile: 80, name: 'spruce_leaves', paint: pSpruceLeaves },
  { tile: 81, name: 'ice', paint: pIce },
  { tile: 82, name: 'bamboo_shoot', paint: pBambooShoot },
  { tile: 83, name: 'banana', paint: pBanana },
  { tile: 84, name: 'tea_leaf', paint: pTeaLeaf },
  { tile: 85, name: 'grape', paint: pGrape },
  { tile: 86, name: 'melon_slice', paint: pMelonSlice },
  { tile: 87, name: 'milk', paint: pMilk },
  { tile: 88, name: 'feather', paint: pFeather },
  { tile: 89, name: 'tanghulu', paint: pTanghulu },
  { tile: 90, name: 'hotpot', paint: pHotpot },
  { tile: 91, name: 'roast_duck', paint: pRoastDuck },
  { tile: 92, name: 'rice_noodle_soup', paint: pRiceNoodleSoup },
  { tile: 93, name: 'roast_lamb', paint: pRoastLamb },
  { tile: 94, name: 'milk_tea', paint: pMilkTea },
  { tile: 95, name: 'lamb_skewer', paint: pLambSkewer },
  { tile: 96, name: 'frozen_pear', paint: pFrozenPear },
  { tile: 97, name: 'suancai', paint: pSuancai },
];

// 十帧裂纹（34..43，不与任何材质重叠）
for (let f = 0; f < CRACK_FRAMES; f++) {
  const t = CRACK_TILE_START + f;
  PAINTER_TABLE.push({ tile: t, name: `crack_overlay_${f}`, paint: crackPainter(f) });
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/** 已注册绘制器的只读快照（测试/调试用）：名称与 tile 序号一一对应 */
export const TILE_PAINTERS: readonly { readonly name: string; readonly tile: number }[] =
  Object.freeze(
    [...PAINTER_TABLE].sort((a, b) => a.tile - b.tile).map((e) => ({ name: e.name, tile: e.tile })),
  );

/**
 * 每个 tile 的绘制随机源：同 (seed, name) 必得完全相同的序列。
 * 用名称派生保证单独调整某个材质不会改动其他材质的外观。
 */
export function atlasTileRng(seed: number, name: string): Rng {
  return mulberry32((hashStr(`atlas:${name}`) ^ (seed | 0)) >>> 0);
}

/**
 * tile 在归一化 UV 中的矩形（含半 texel inset，v 轴已按 GL 习惯翻转：v0/v1 为图像下/上边）。
 * 越界或非整数序号抛 RangeError。
 */
export function tileUV(tileIndex: number): { u0: number; v0: number; u1: number; v1: number } {
  if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= ATLAS_SIZE) {
    throw new RangeError(`非法 tile 序号: ${tileIndex}`);
  }
  const { x0, y0 } = tileOrigin(tileIndex);
  const u0 = (x0 + UV_INSET_PX) / ATLAS_SIZE;
  const u1 = (x0 + TILE_PX - UV_INSET_PX) / ATLAS_SIZE;
  // v 轴翻转：canvas 的 y 向下，GL 的 v 向上
  const v1 = 1 - (y0 + UV_INSET_PX) / ATLAS_SIZE;
  const v0 = 1 - (y0 + TILE_PX - UV_INSET_PX) / ATLAS_SIZE;
  return { u0, v0, u1, v1 };
}

/**
 * 启动期离屏构建 256×256 程序化图集。
 * 注意：仅此函数触碰 DOM，模块本身可被 node 环境安全导入。
 */
export function buildAtlasCanvas(seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('获取 2D 绘图上下文失败（atlas 构建终止）');
  ctx.imageSmoothingEnabled = false;
  // 按 tile 序号升序绘制，保证与声明顺序无关的可复现性
  const entries = [...PAINTER_TABLE].sort((a, b) => a.tile - b.tile);
  for (const e of entries) {
    const { x0, y0 } = tileOrigin(e.tile);
    e.paint(ctx, x0, y0, atlasTileRng(seed, e.name));
  }
  return canvas;
}
