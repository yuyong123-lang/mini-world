// world/terragen.ts —— 纯函数地形生成器（M1 版，契约 §8）
// 不 import three（conventions §3，Worker 迁移前提）。
// 所有噪声统一在 initTerrain 中集中初始化并存模块级变量：
//   主线程 / Worker 内各自调一次 initTerrain(seed) 即可复现同一世界。
// W4(T41) 升级点预告：只改 NOISE_SET/terrainHeight/fillColumn 三处，
// 五个导出签名与本文件结构保持不变。

import { createNoise2D } from 'simplex-noise';

import { BLOCK } from '../blocks/registry';
import { CHUNK_W, SEA_LEVEL, WORLD_H, voxelIndex } from '../core/constants';
import { hashStr, mulberry32 } from '../core/rng';

/** simplex-noise 的 2D 噪声函数类型（输出 [-1,1]） */
type Noise2D = (x: number, z: number) => number;

/**
 * 噪声集：把「用哪些噪声、什么参数」收拢成一个可整体替换的结构。
 * M1 只有两层单倍频；W4 加沙漠/生物群系/树时在此扩充字段即可。
 */
interface NoiseSet {
  /** 大陆形状：低频大起伏 */
  cont: Noise2D;
  /** 局部丘陵细节：高频小起伏 */
  hills: Noise2D;
}

/** 模块级噪声状态；null 表示尚未 initTerrain（抛错提示，而非静默输出空地形） */
let noises: NoiseSet | null = null;

// ---- 地形参数（调参只动这里）----
const CONT_FREQ = 0.008;          // 大陆层空间频率：波长约 125 格
const HILLS_FREQ = 0.03;          // 丘陵层空间频率：波长约 33 格
const CONT_AMP = 8;               // 大陆层高度振幅（格）
const HILLS_AMP = 3;              // 丘陵层高度振幅（格）
const MIN_HEIGHT = 4;             // 地表高度下限（保证基岩上方至少 3 层泥土空间）
const MAX_HEIGHT = WORLD_H - 8;   // 地表高度上限（留出建造/树冠空间）

/** 初始化噪声函数集。同 seed 必得同结果（mulberry32 序列确定）。 */
export function initTerrain(seed: string): void {
  const rng = mulberry32(hashStr(seed));
  // 创建顺序即随机数消费顺序，固定「先 cont 后 hills」以保证确定性
  noises = {
    cont: createNoise2D(rng),
    hills: createNoise2D(rng),
  };
}

/** 取已初始化的噪声集；未初始化直接抛错（Worker 中必须先 init 再 generate） */
function requireNoises(): NoiseSet {
  if (!noises) {
    throw new Error(
      'terragen 未初始化：请先调用 initTerrain(seed) 再进行地形生成',
    );
  }
  return noises;
}

/** 单列的原始地表高度（不含水修正），生成与查询共用同一条公式 */
function terrainHeight(n: NoiseSet, x: number, z: number): number {
  // M1 版简化为各一层噪声；W4 在此处换 fbm/octaves 叠加
  const raw =
    SEA_LEVEL +
    Math.floor(
      n.cont(x * CONT_FREQ, z * CONT_FREQ) * CONT_AMP +
        n.hills(x * HILLS_FREQ, z * HILLS_FREQ) * HILLS_AMP,
    );
  // 钳制到安全区间，保证基岩/表层不越界且不互相重叠
  return raw < MIN_HEIGHT ? MIN_HEIGHT : raw > MAX_HEIGHT ? MAX_HEIGHT : raw;
}

/**
 * 填充一整列体素（data 中该列步长 = 1<<8，逐层 +STEP_Y 写入）。
 * 分层规则（契约 T14）：
 *   y=0            BEDROCK
 *   y <  h-3       STONE
 *   h-3 .. h-1     DIRT
 *   y = h          h < SEA_LEVEL ? SAND : GRASS
 *   h < SEA_LEVEL 时 (h, SEA_LEVEL] 填 WATER；更高保持 AIR
 */
function fillColumn(data: Uint8Array, lx: number, lz: number, h: number): void {
  // 基岩底层
  data[voxelIndex(lx, 0, lz)] = BLOCK.BEDROCK;
  // 表层：水下为沙，陆上为草
  const topBlock = h < SEA_LEVEL ? BLOCK.SAND : BLOCK.GRASS;
  // 逐层写入 1..h：石(h-4 及以下) / 泥土(h-3..h-1) / 表层(h)
  for (let y = 1; y <= h && y < WORLD_H; y++) {
    data[voxelIndex(lx, y, lz)] =
      y === h ? topBlock : y >= h - 3 ? BLOCK.DIRT : BLOCK.STONE;
  }
  // 水下时向上海水填至海平面（含）
  if (h < SEA_LEVEL) {
    for (let wy = h + 1; wy <= SEA_LEVEL; wy++) {
      data[voxelIndex(lx, wy, lz)] = BLOCK.WATER;
    }
  }
}

/** 生成一个 chunk 的完整体素数据（16×64×16），布局与 Chunk.data 一致 */
export function createChunkData(cx: number, cz: number): Uint8Array {
  const n = requireNoises();
  const data = new Uint8Array(CHUNK_W * WORLD_H * CHUNK_W);
  const baseX = cx * CHUNK_W;
  const baseZ = cz * CHUNK_W;
  // 高度在列循环内直算，避免每列再走一次 surfaceHeight 的额外封装/水修正
  for (let lx = 0; lx < CHUNK_W; lx++) {
    const wx = baseX + lx;
    for (let lz = 0; lz < CHUNK_W; lz++) {
      fillColumn(data, lx, lz, terrainHeight(n, wx, baseZ + lz));
    }
  }
  return data;
}

/**
 * 应用玩家修改覆盖：diffs 的 key 即 voxelIndex 结果，value 为方块 id。
 * 幂等（重复应用无害）；越界索引防御性跳过（正常来源不会出现）。
 */
export function applyDiffs(
  data: Uint8Array,
  diffs: Map<number, number> | undefined,
): void {
  if (!diffs) return;
  for (const [index, id] of diffs) {
    if (index >= 0 && index < data.length) data[index] = id;
  }
}

/**
 * 世界坐标列的地表高度：生成公式一致的结果，但含水面修正——
 * 地形低于海平面的列返回 SEA_LEVEL，供 spawn 定位在水面之上。
 * （W4 树判定如需「真实地面高」，请改用内部公式而非本函数。）
 */
export function surfaceHeight(x: number, z: number): number {
  const h = terrainHeight(requireNoises(), x, z);
  return h > SEA_LEVEL ? h : SEA_LEVEL;
}

/** 树干所在列的确定性判定。M1 版无树。 */
export function isTreeColumn(_x: number, _z: number): boolean {
  return false; // TODO(W4): 用 hash2 + 密度阈值实现树分布
}
