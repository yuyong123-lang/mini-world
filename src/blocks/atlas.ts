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
