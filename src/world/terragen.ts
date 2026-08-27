// world/terragen.ts —— 纯函数地形生成器（W4/T41 完整版，契约 §8）
// 不 import three（conventions §3，Worker 迁移前提）。
// 所有噪声统一在 initTerrain 中集中初始化并存模块级变量：
//   主线程 / Worker 内各自调一次 initTerrain(seed) 即可复现同一世界。
//
// 完整版地形构成：
//   高度 = 大陆(cont fbm) + 丘陵(hills fbm) + 山脊(ridge^1.6 × 内陆掩码)
//   生物群系 = 温度噪声 + 海拔 → 沙漠 / 雪原 / 草地
//   矿脉 = hash3 阈值法替换 STONE（煤/铁/金）
//   树   = hash2 密度判定 + 经典橡树几何；叶冠水平半径 2，
//          因此跨 chunk 时通过「扩展网格 ±2」重算邻列判定自动补齐跨界叶片。

import { createNoise2D } from 'simplex-noise';

import { BLOCK } from '../blocks/registry';
import { CHUNK_W, SEA_LEVEL, WORLD_H, voxelIndex } from '../core/constants';
import { hash2, hash3, hashStr, mulberry32 } from '../core/rng';

/** simplex-noise 的 2D 噪声函数类型（输出 [-1,1]） */
type Noise2D = (x: number, z: number) => number;

/** 生物群系类别（地表气候）；供 mesher/W6 的刷怪、动植物分布等复用 */
export type BiomeKind = 'desert' | 'snow' | 'grass';

/**
 * 噪声集：把「用哪些噪声、什么参数」收拢成一个可整体替换的结构。
 * fbm 用「层数组」表达：第 i 层输入频率 = 基频 × 2^i，振幅按 0.5^i 归一化。
 */
interface NoiseSet {
  /** 大陆形状：低频大起伏，决定海陆分布 */
  cont: Noise2D[];
  /** 局部丘陵细节：中频小起伏 */
  hills: Noise2D[];
  /** 山脊层：1 - |noise| ∈ [0,1]， ridged 手法让山脉成脊线 */
  ridge: Noise2D;
  /** 温度场：独立偏移种子，决定沙漠/雪原分布 */
  temp: Noise2D;
}

/** 模块级噪声状态；null 表示尚未 initTerrain（抛错提示，而非静默输出空地形） */
let noises: NoiseSet | null = null;

// ---- 地形参数（调参只动这里）----
const CONT_FREQ = 0.004;      // 大陆层基频：波长约 250 格（architecture §2.4）
const CONT_OCTAVES = 3;       // 文档写 4；实现取 3 层 fbm（任务卡允许 2~3 层简化）
const HILLS_FREQ = 0.02;      // 丘陵层基频：波长约 50 格
const HILLS_OCTAVES = 2;      // 丘陵 fbm 层数
const RIDGE_FREQ = 0.01;      // 山脊层频率：波长约 100 格
const RIDGE_EXP = 1.6;        // ridge 幂次：>1 让脊线更尖锐
const RIDGE_AMP = 26;         // 山脊层最大抬升（格）
const RIDGE_MASK_LO = 0.25;   // 平滑阶梯下缘：低于此 cont 值无山（沿海平原）
const RIDGE_MASK_HI = 0.65;   // 平滑阶梯上缘：高于此 cont 值山体全高
const TEMP_FREQ = 0.0015;     // 温度场频率：气候区跨度约 600 格
const BASE_OFFSET = 4;        // 公式常数项：SEA_LEVEL + 4 为平均海平面以上基准

const MIN_HEIGHT = 3;             // 地表高度下限（保证基岩上方至少 2 层土）
const MAX_HEIGHT = WORLD_H - 10;  // 地表高度上限（54，给树冠留 7 格）

// ---- 生物群系阈值 ----
const DESERT_TEMP = 0.55;      // temp > 此值且海拔够 → 沙漠
const SNOW_TEMP = -0.55;       // temp < 此值 或 海拔够高 → 雪原
const SNOW_ALTITUDE = 52;      // 雪线的海拔触发值

// ---- 树参数 ----
const TREE_CHANCE = 0.009;     // 每草地列约 1/111 概率成树
const TREE_SALT = 7919;        // 树干高度哈希的偏移盐，避免与密度哈希同相
const CANOPY_R = 2;            // 叶冠最大水平半径 → 跨 chunk 扫描边距
const CAP_R = 1;               // 干顶上一层的小叶盘半径

// ---- 矿石参数：深度区间与命中概率（architecture §2.4 / 任务卡阈值）----
const COAL_MIN = 8, COAL_MAX = 48, COAL_P = 0.012;
const IRON_MIN = 4, IRON_MAX = 32, IRON_P = 0.008;
const GOLD_MIN = 2, GOLD_MAX = 16, GOLD_P = 0.0035;
// 三种矿各自的哈希盐：让三路判定成为互相独立的采样流。
// （若共用一个 hash 流 + 嵌套阈值，先判的铁会把煤的概率吃掉一大半：
//   实测煤会跌到 ~0.4%，违反任务卡「煤 p~1.2%」的参数。）
const GOLD_SALT = 0x5bd1e995;
const IRON_SALT = 0x1b873593;
const COAL_SALT = 0x2c1b3c6d;

/** 树干所在 chunk 外的最大影响范围（= CANOPY_R），扩展网格由此取边距 */
const MARGIN = CANOPY_R;

/** 内联平滑阶梯：edg0→edg1 之间 0→1 的 S 曲线，两端饱和 */
function smoothstep(edg0: number, edg1: number, v: number): number {
  const t = v <= edg0 ? 0 : v >= edg1 ? 1 : (v - edg0) / (edg1 - edg0);
  return t * t * (3 - 2 * t);
}

/** 多倍频叠加（fbm）：振幅逐层减半后归一化，输出仍近似 [-1,1] */
function fbm(layers: Noise2D[], x: number, z: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let i = 0; i < layers.length; i++) {
    sum += layers[i](x, z) * amp;
    norm += amp;
    amp *= 0.5;
    x *= 2;
    z *= 2;
  }
  return sum / norm;
}

/** 初始化噪声函数集。同 seed 必得同结果（mulberry32 序列确定）。 */
export function initTerrain(seed: string): void {
  const rng = mulberry32(hashStr(seed));
  // 创建顺序即随机数消费顺序，必须保持固定：
  //   cont 各倍频 → hills 各倍频 → ridge → 温度子种子
  // （temperature 按 architecture §2.4 使用「独立偏移种子」：
  //   由主序列派生出一个整数子种子，再单独喂给 createNoise2D，
  //   既满足独立又保证整条流水线只挂在一个可复现的流上。）
  const cont: Noise2D[] = [];
  for (let i = 0; i < CONT_OCTAVES; i++) cont.push(createNoise2D(rng));
  const hills: Noise2D[] = [];
  for (let i = 0; i < HILLS_OCTAVES; i++) hills.push(createNoise2D(rng));
  const ridge = createNoise2D(rng);
  const tempSeed =
    (((rng() * 0x100000000) >>> 0) ^ 0x51ab3f77) >>> 0;
  const temp = createNoise2D(mulberry32(tempSeed));
  noises = { cont, hills, ridge, temp };
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

/** 单列原始温度（[-1,1]），生物群系判定与调试共用 */
function temperatureAt(n: NoiseSet, x: number, z: number): number {
  return n.temp(x * TEMP_FREQ, z * TEMP_FREQ);
}

/**
 * 单列的原始地表高度（不含水修正），生成与查询共用同一条公式：
 *   h = SEA_LEVEL + 4 + cont*6 + hills*3 + ridge^1.6 × smoothstep(.25,.65,cont) × 26
 * 取整后钳制到 [MIN_HEIGHT, MAX_HEIGHT]。
 */
function terrainHeight(n: NoiseSet, x: number, z: number): number {
  const cont = fbm(n.cont, x * CONT_FREQ, z * CONT_FREQ);
  const hills = fbm(n.hills, x * HILLS_FREQ, z * HILLS_FREQ);
  // 山脊 ∈ [0,1]：|noise| 的谷即山脊线，天然成「脊」而非「丘」
  const ridge = 1 - Math.abs(n.ridge(x * RIDGE_FREQ, z * RIDGE_FREQ));
  const mask = smoothstep(RIDGE_MASK_LO, RIDGE_MASK_HI, cont);
  const raw =
    SEA_LEVEL +
    BASE_OFFSET +
    Math.floor(
      cont * 6 +
        hills * 3 +
        Math.pow(ridge, RIDGE_EXP) * mask * RIDGE_AMP,
    );
  // 钳制到安全区间，保证基岩/表层不越界且不互相重叠
  return raw < MIN_HEIGHT ? MIN_HEIGHT : raw > MAX_HEIGHT ? MAX_HEIGHT : raw;
}

/** 由 (高度, 温度) 推出陆地群系（水下列仍返回气候值，表层覆盖在 fillColumn 处理） */
function biomeOf(h: number, temp: number): BiomeKind {
  // 沙漠优先于雪原（文档判定顺序）：炎热高山是沙漠不是雪原
  if (temp > DESERT_TEMP && h > SEA_LEVEL + 1) return 'desert';
  if (temp < SNOW_TEMP || h > SNOW_ALTITUDE) return 'snow';
  return 'grass';
}

/**
 * 世界坐标列的生物群系。新增辅助导出（契约 §8 未冻结此签名，主线程知情）：
 *   W6 动植物分布、W6+ 小地图配色等将复用，不再各自造一套阈值。
 * 判定与地形生成本身完全一致（同一组阈值常量），不产生分叉风险。
 */
export function biomeAt(x: number, z: number): BiomeKind {
  const n = requireNoises();
  return biomeOf(terrainHeight(n, x, z), temperatureAt(n, x, z));
}

/**
 * 树干所在列的确定性判定：
 *   稀疏哈希命中（约 1/111 草地列）且该列为草地、海拔高于海平面 +1。
 * 沙漠/雪原/水下列不长树；两处判据完全由世界坐标决定 → 与 chunk 无关。
 */
export function isTreeColumn(x: number, z: number): boolean {
  if (hash2(x, z) >= TREE_CHANCE) return false;
  const n = requireNoises();
  const h = terrainHeight(n, x, z);
  if (h <= SEA_LEVEL + 1) return false;
  return biomeOf(h, temperatureAt(n, x, z)) === 'grass';
}

/** 树干高度（格）：4~6，由该列坐标的另一路哈希确定 */
function trunkHeightAt(tx: number, tz: number): number {
  return 4 + Math.floor(hash2(tx + TREE_SALT, tz) * 3);
}

/**
 * 在本 chunk 数据里写入一棵树落在 chunk 内的部分（log 优先于叶）。
 * 写入规则：
 *   LOG   仅覆盖 AIR / LEAVES（树干穿透邻近树冠，不被叶挡住）
 *   LEAVES 仅写入 AIR（不啃玩家地形、不覆盖其他结构）
 * 两棵树的叶互相覆盖结果相同（同 id），LOG 与叶相遇无论先后都得到 LOG
 * → 规则合流，遍历顺序不影响最终数据，跨 chunk 一致性因此成立。
 */
function stampTree(
  data: Uint8Array,
  baseX: number,
  baseZ: number,
  tx: number,
  tz: number,
  groundH: number,
): void {
  const trunkLen = trunkHeightAt(tx, tz);
  const topY = groundH + trunkLen;

  const putLog = (wx: number, y: number, wz: number): void => {
    const lx = wx - baseX;
    const lz = wz - baseZ;
    if (lx < 0 || lx >= CHUNK_W || lz < 0 || lz >= CHUNK_W) return;
    if (y < 1 || y >= WORLD_H) return;
    const i = voxelIndex(lx, y, lz);
    const cur = data[i];
    if (cur === BLOCK.AIR || cur === BLOCK.LEAVES) data[i] = BLOCK.LOG;
  };
  const putLeaf = (wx: number, y: number, wz: number): void => {
    const lx = wx - baseX;
    const lz = wz - baseZ;
    if (lx < 0 || lx >= CHUNK_W || lz < 0 || lz >= CHUNK_W) return;
    if (y < 1 || y >= WORLD_H) return;
    const i = voxelIndex(lx, y, lz);
    if (data[i] === BLOCK.AIR) data[i] = BLOCK.LEAVES;
  };

  // 树干：地表上方 1..trunkLen
  for (let dy = 1; dy <= trunkLen; dy++) putLog(tx, groundH + dy, tz);

  // 叶冠：干顶两层半径 2 叶盘（切去四角呈圆形轮廓）+ 顶上一层半径 1
  for (let dy = -1; dy <= 1; dy++) {
    const y = topY + dy;
    const r = dy <= 0 ? CANOPY_R : CAP_R;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        // 半径 2 层去掉四角，更接近经典橡树叶球
        if (r === CANOPY_R && dx !== 0 && dz !== 0 && Math.abs(dx) === CANOPY_R &&
            Math.abs(dz) === CANOPY_R) {
          continue;
        }
        putLeaf(tx + dx, y, tz + dz);
      }
    }
  }
}

/**
 * 单个 STONE 体素的矿石替换判定：金 > 铁 > 煤（倒序 early exit）。
 * 三种矿各用独立盐的哈希流，实际替换概率即各自配置值；
 * 极少数多流同时命中时按优先级取最高档。
 * 哈希只依赖世界坐标 → 同一矿石位置全世界唯一且可复现。
 */
function oreAt(wx: number, y: number, wz: number): number {
  if (
    y >= GOLD_MIN && y <= GOLD_MAX &&
    hash3(wx + GOLD_SALT, y, wz) < GOLD_P
  ) return BLOCK.ORE_GOLD;
  if (
    y >= IRON_MIN && y <= IRON_MAX &&
    hash3(wx + IRON_SALT, y, wz) < IRON_P
  ) return BLOCK.ORE_IRON;
  if (
    y >= COAL_MIN && y <= COAL_MAX &&
    hash3(wx + COAL_SALT, y, wz) < COAL_P
  ) return BLOCK.ORE_COAL;
  return BLOCK.STONE;
}

/**
 * 填充一整列体素（data 中该列步长 = 1<<8，逐层 +STEP_Y 写入）。
 * 分层规则（architecture §2.4）：
 *   y=0            BEDROCK
 *   y <  h-3       STONE（按深度区间可能被矿石替换）
 *   h-3 .. h-1     沙漠/水下=SAND，其余=DIRT
 *   y = h          陆上按群系 GRASS/SAND/SNOW；水下恒 SAND
 *   h < SEA_LEVEL 时 (h, SEA_LEVEL] 填 WATER；更高保持 AIR
 */
function fillColumn(
  data: Uint8Array,
  lx: number,
  lz: number,
  wx: number,
  wz: number,
  h: number,
  biome: BiomeKind,
): void {
  // 基岩底层
  data[voxelIndex(lx, 0, lz)] = BLOCK.BEDROCK;
  // 表层方块：淹没列用沙（海滩/河床），陆上按群系
  const topBlock =
    h < SEA_LEVEL ? BLOCK.SAND
      : biome === 'desert' ? BLOCK.SAND
        : biome === 'snow' ? BLOCK.SNOW
          : BLOCK.GRASS;
  // 次表层层：沙漠与水下都用沙垫底，其余泥土
  const subBlock = h < SEA_LEVEL || biome === 'desert' ? BLOCK.SAND : BLOCK.DIRT;
  // 逐层写入 1..h：石/矿(h-4 及以下)、次表层(h-3..h-1)、表层(h)
  for (let y = 1; y <= h && y < WORLD_H; y++) {
    let id: number;
    if (y === h) {
      id = topBlock;
    } else if (y >= h - 3) {
      id = subBlock;
    } else {
      id = oreAt(wx, y, wz);
    }
    data[voxelIndex(lx, y, lz)] = id;
  }
  // 水下时向上海水填至海平面（含）
  if (h < SEA_LEVEL) {
    for (let wy = h + 1; wy <= SEA_LEVEL; wy++) {
      data[voxelIndex(lx, wy, lz)] = BLOCK.WATER;
    }
  }
}

/**
 * 生成一个 chunk 的完整体素数据（16×64×16），布局与 Chunk.data 一致。
 * 步骤：① 先把含 ±MARGIN 边距的 20×20 列缓存出高度/群系/是否树干；
 *       ② 用内部 16×16 区域填地形（含矿石、水体）；
 *       ③ 遍历缓存内的所有树干列，把落在本 chunk 内的树体素补齐 ——
 *         邻 chunk 里同样能算到这棵树，跨界树冠两侧一致，不断枝。
 */
export function createChunkData(cx: number, cz: number): Uint8Array {
  const n = requireNoises();
  const data = new Uint8Array(CHUNK_W * WORLD_H * CHUNK_W);
  const baseX = cx * CHUNK_W;
  const baseZ = cz * CHUNK_W;

  // --- ① 扩展网格缓存：负边距保证「邻 chunk 的树冠伸进来」也能算到 ---
  const m = CHUNK_W + MARGIN * 2;
  const extH = new Int16Array(m * m);
  const extBiome = new Uint8Array(m * m); // 0 grass / 1 desert / 2 snow
  const extTree = new Uint8Array(m * m);
  for (let ex = 0; ex < m; ex++) {
    const wx = baseX - MARGIN + ex;
    for (let ez = 0; ez < m; ez++) {
      const wz = baseZ - MARGIN + ez;
      const h = terrainHeight(n, wx, wz);
      const biome = biomeOf(h, temperatureAt(n, wx, wz));
      const idx = ex * m + ez;
      extH[idx] = h;
      extBiome[idx] = biome === 'desert' ? 1 : biome === 'snow' ? 2 : 0;
      // 树干判定：稀疏哈希 + 草地 + 海拔条件（与 isTreeColumn 完全同式）
      extTree[idx] =
        hash2(wx, wz) < TREE_CHANCE &&
        biome === 'grass' &&
        h > SEA_LEVEL + 1
          ? 1
          : 0;
    }
  }

  // --- ② 内部区域填地形 ---
  for (let lx = 0; lx < CHUNK_W; lx++) {
    const wx = baseX + lx;
    for (let lz = 0; lz < CHUNK_W; lz++) {
      const idx = (lx + MARGIN) * m + (lz + MARGIN);
      fillColumn(
        data, lx, lz, wx, baseZ + lz, extH[idx],
        extBiome[idx] === 1 ? 'desert' : extBiome[idx] === 2 ? 'snow' : 'grass',
      );
    }
  }

  // --- ③ 树：任何树干列只要它的冠/干会碰到本 chunk 就在这里落块 ---
  for (let ex = 0; ex < m; ex++) {
    const wx = baseX - MARGIN + ex;
    for (let ez = 0; ez < m; ez++) {
      if (extTree[ex * m + ez] !== 1) continue;
      stampTree(data, baseX, baseZ, wx, baseZ - MARGIN + ez, extH[ex * m + ez]);
    }
  }

  return data;
}

/**
 * 应用玩家修改覆盖：diffs 的 key 即 voxelIndex 结果，value 为方块 id。
 * 幂等（重复应用无害）；越界索引防御性跳过（正常来源不会出现）。
 * 必须在 createChunkData 之后调用 → 玩家改动优先级最高（树叶覆盖亦走此通道）。
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
 * （需要真实地面高时请用 biomeAt/isTreeColumn 同源的内部公式语义：
 *   本函数永不返回水下真实深度，树判定已内置真实高度计算。）
 */
export function surfaceHeight(x: number, z: number): number {
  const h = terrainHeight(requireNoises(), x, z);
  return h > SEA_LEVEL ? h : SEA_LEVEL;
}
