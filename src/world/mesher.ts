/**
 * world/mesher.ts —— chunk 逐面剔除网格化（契约 §9 / 架构 §2.3）
 *
 * 纯函数：只依赖 TypedArray 与 number，禁止 import three/DOM（conventions §3，W10 迁 Worker 零改动前提）。
 * 输出的 position 使用世界坐标（cx*16+lx 直接烘焙边界），renderer 无需给 mesh 设 offset；
 * float32 在 |坐标| < 1e6 内精度足够（16*16=256 个 chunk 远小于该量级）。
 */

import { CHUNK_W, WORLD_H, voxelIndex } from '../core/constants';
import type { MeshArrays } from '../core/types';
import { BLOCK, BlockRegistry } from '../blocks/registry';

// FIXME(data): blocks.json 把 WATER 指向 tile 24、BEDROCK 指向 tile 33，两者落进契约 §4
// 预留的 crack_overlay 区间（tile 23..32 起）。归属冲突应由 blocks.json / atlas 的所有者裁决；
// mesher 对 tile 序号零假设（仅把索引送进 UV 公式），功能不受影响，故记录于此交集成波确认。

/**
 * 契约 §9：邻居访问接口。gx/gy/gz 为世界坐标；越出当前 chunk 时由调用方查邻 chunk 或用 terragen 直算。
 * gy 出界的兜底规则由本文件决定（见 sampleCell）：gy<0 视作 BEDROCK（使世界最底层向下的一面被剔除）、
 * gy>=WORLD_H 视作 AIR。
 */
export interface NeighborAccess {
  get(gx: number, gy: number, gz: number): number;
}

/* ==========================================================================
 * 方块属性平铺表
 * 热路径不能走 BlockRegistry.get（Map 查找 + 未知 id 抛错），模块加载期一次性展开：
 * 下标即方块 id，访问退化为一次类型化数组读取。
 * ========================================================================== */

const OPAQUE = new Uint8Array(256); // 1 = 不透明：剔除相邻面，并在 AO 中作为遮挡物
const LIQUID = new Uint8Array(256); // 1 = 水（进 water 输出组）
const KNOWN = new Uint8Array(256); // 1 = 注册表已定义的 id（防御性跳过未知 id）
const GROUP = new Int16Array(256).fill(-1); // 同 key 归一组号：非 opaque 同 key 相贴互剔，防共面 z-fighting
const TEX_TOP = new Int16Array(256);
const TEX_BOTTOM = new Int16Array(256);
const TEX_SIDE = new Int16Array(256);

function buildBlockTables(): void {
  const keyGroup = new Map<string, number>();
  for (const entry of Object.entries(BLOCK as Readonly<Record<string, number>>)) {
    const key = entry[0];
    const id = entry[1];
    const def = BlockRegistry.byKey(key);
    KNOWN[id] = 1;
    OPAQUE[id] = def.opaque ? 1 : 0;
    LIQUID[id] = def.liquid === true ? 1 : 0;
    TEX_TOP[id] = def.tex[0];
    TEX_BOTTOM[id] = def.tex[1];
    TEX_SIDE[id] = def.tex[2];
    let g = keyGroup.get(def.key);
    if (g === undefined) {
      g = keyGroup.size;
      keyGroup.set(def.key, g);
    }
    GROUP[id] = g;
  }
}
buildBlockTables();

/* ==========================================================================
 * 图集 UV
 * 与 atlas.tileUV 保持同一规则：16×16 格图集（每 tile 16px，整图 256px），
 * 半 texel inset 防 NearestFilter 渗色，v 轴翻转（图像行 0 在 GL 坐标里是 v 最高的一行）。
 * 刻意内联而非 import ../blocks/atlas：atlas 需要 DOM canvas 离屏绘纹理，
 * mesher 必须保持无 DOM 依赖，Worker 迁移时才是零改动。
 * ========================================================================== */

const TILE_PX = 16;
const ATLAS_GRID = 16;
const ATLAS_PX = TILE_PX * ATLAS_GRID; // 256
/** 每 tile 一组 [u0, v0, u1, v1]；v0 是 tile 下缘（更小），v1 是上缘 */
const UV_RECTS = new Float32Array(256 * 4);

for (let tile = 0; tile < 256; tile++) {
  const col = tile % ATLAS_GRID;
  const row = Math.floor(tile / ATLAS_GRID);
  UV_RECTS[tile * 4 + 0] = (col * TILE_PX + 0.5) / ATLAS_PX;
  UV_RECTS[tile * 4 + 1] = 1 - ((row + 1) * TILE_PX - 0.5) / ATLAS_PX;
  UV_RECTS[tile * 4 + 2] = ((col + 1) * TILE_PX - 0.5) / ATLAS_PX;
  UV_RECTS[tile * 4 + 3] = 1 - (row * TILE_PX + 0.5) / ATLAS_PX;
}

/* ==========================================================================
 * 面表
 * 固定顺序 +Y/-Y/+X/-X/+Z/-Z。每个面用「起点 o + 切向 du/dv」描述四角：
 *   v0 = o, v1 = o+du, v2 = o+du+dv, v3 = o+dv
 * 且恒满足 du × dv = 外法线，于是默认三角剖分 (0,1,2)/(0,2,3) 从外侧看必为逆时针
 * （three.js 正面），UV 也随 du/dv 有确定走向（u 沿 du、v 沿 dv 递增）。
 * ========================================================================== */

// 面起点（相对方块原点）
const FO = new Int8Array([
  0, 1, 1, // +Y
  0, 0, 0, // -Y
  1, 0, 1, // +X
  0, 0, 0, // -X
  0, 0, 1, // +Z
  1, 0, 0, // -Z
]);
// 面法线（兼作邻居偏移）
const FN = new Int8Array([
  0, 1, 0,
  0, -1, 0,
  1, 0, 0,
  -1, 0, 0,
  0, 0, 1,
  0, 0, -1,
]);
// 切向 du
const FDU = new Int8Array([
  1, 0, 0, // +Y: 沿 +X
  1, 0, 0, // -Y: 沿 +X
  0, 0, -1, // +X: 沿 -Z
  0, 0, 1, // -X: 沿 +Z
  1, 0, 0, // +Z: 沿 +X
  -1, 0, 0, // -Z: 沿 -X
]);
// 切向 dv
const FDV = new Int8Array([
  0, 0, -1, // +Y: 沿 -Z
  0, 0, 1, // -Y: 沿 +Z
  0, 1, 0, // +X: 向上
  0, 1, 0,
  0, 1, 0,
  0, 1, 0,
]);
// 架构 §2.3：顶 1.0 / 南北(z) 0.8 / 东西(x) 0.65 / 底 0.5
const SHADE = [1.0, 0.5, 0.65, 0.65, 0.8, 0.8];
// AO 亮度表（架构 §2.3）
const AO_LEVEL = [0.45, 0.65, 0.82, 1.0];
// 四角相对 du/dv 的符号，与顶点序一一对应：v0(-,-) v1(+,-) v2(+,+) v3(-,+)
const CORNER_SIGN = new Int8Array([-1, -1, 1, -1, 1, 1, -1, 1]);
// 水面顶格整体下沉量
const WATER_DROP = 0.1;

/* ==========================================================================
 * 输出缓冲：普通 number 数组跨调用复用（length 归零），最后一次性转 TypedArray，
 * 避免逐四边形分配 TypedArray 造成 GC 压力（性能要求 <5ms/chunk）。
 * ========================================================================== */

const OP_POS: number[] = [];
const OP_UV: number[] = [];
const OP_COLOR: number[] = [];
const OP_INDEX: number[] = [];
const WA_POS: number[] = [];
const WA_UV: number[] = [];
const WA_COLOR: number[] = [];
const WA_INDEX: number[] = [];

/** 体素采样：先处理 y 出界兜底，再判断是否落在当前 chunk 内（快路径直读 cur），否则交给调用方的 neighbors */
function sampleCell(
  cur: Uint8Array,
  nb: NeighborAccess,
  bx: number,
  bz: number,
  gx: number,
  gy: number,
  gz: number,
): number {
  if (gy < 0) return BLOCK.BEDROCK; // 世界底部以下视为基岩 → 最底层向下的一面剔除、底缘 AO 受遮挡
  if (gy >= WORLD_H) return BLOCK.AIR; // 顶部以上没有方块
  const lx = gx - bx;
  const lz = gz - bz;
  if ((lx & ~15) === 0 && (lz & ~15) === 0) return cur[lx | (lz << 4) | (gy << 8)];
  return nb.get(gx, gy, gz) & 255; // &255 兜底：调用方约定返回字节 id，超出也安全归一到 0..255
}

/** 写入一个四边形（4 顶点 + 6 索引），索引按 AO 决定对角线方向 */
/**
 * 写入一个四边形（4 顶点 + 6 索引）。
 * @param dropEdge 仅水面生效：该方块上方不是水时，+Y 面四角与侧面上缘两角同步下沉 0.1，
 *   使整片水面保持在同一高度（若只降顶面，侧面会留出 0.1 高的「池沿」裙边）。
 */
function pushQuad(
  pos: number[],
  uv: number[],
  color: number[],
  index: number[],
  wx: number,
  wy: number,
  wz: number,
  f: number,
  vertBase: number,
  shade: number,
  tile: number,
  a0: number,
  a1: number,
  a2: number,
  a3: number,
  dropEdge: boolean,
): void {
  const fo = f * 3;
  const vx0 = wx + FO[fo];
  const vyBase = wy + FO[fo + 1];
  const vz0 = wz + FO[fo + 2];
  const dux = FDU[fo], duy = FDU[fo + 1], duz = FDU[fo + 2];
  const dvx = FDV[fo], dvy = FDV[fo + 1], dvz = FDV[fo + 2];

  // 下沉量：+Y 面整体降；侧面只降 dv 为 +Y 的上缘两角；底面不动
  let dy0 = 0, dy1 = 0, dy2 = 0, dy3 = 0;
  if (dropEdge) {
    if (f === 0) {
      dy0 = dy1 = dy2 = dy3 = -WATER_DROP;
    } else if (f >= 2) {
      dy2 = dy3 = -WATER_DROP; // 侧面顶点序为下、下、上、上
    }
  }
  const vy0 = vyBase + dy0;

  // 位置：四角按 v0 v1 v2 v3 推进
  pos.push(
    vx0, vy0, vz0,
    vx0 + dux, vyBase + duy + dy1, vz0 + duz,
    vx0 + dux + dvx, vyBase + duy + dvy + dy2, vz0 + duz + dvz,
    vx0 + dvx, vyBase + dvy + dy3, vz0 + dvz,
  );

  // UV：u 沿 du、v 沿 dv 递增（rect 里存的是 [u0, v0下缘, u1, v1上缘]）
  const r = tile << 2;
  const u0 = UV_RECTS[r];
  const vb = UV_RECTS[r + 1];
  const u1 = UV_RECTS[r + 2];
  const vt = UV_RECTS[r + 3];
  uv.push(u0, vb, u1, vb, u1, vt, u0, vt);

  // 顶点色 = faceShade × AO 亮度，rgb 同灰度
  const c0 = shade * AO_LEVEL[a0];
  const c1 = shade * AO_LEVEL[a1];
  const c2 = shade * AO_LEVEL[a2];
  const c3 = shade * AO_LEVEL[a3];
  color.push(c0, c0, c0, c1, c1, c1, c2, c2, c2, c3, c3, c3);

  // AO 各向异性修正：默认对角线连 v0-v2；当 v0/v2 亮度之和不大于 v1/v3 时改连 v1-v3，
  // 让三角化的插值方向跟随亮度分布，消除沿对角线出现的条带伪影。
  if (a0 + a2 > a1 + a3) {
    index.push(vertBase, vertBase + 1, vertBase + 2, vertBase, vertBase + 2, vertBase + 3);
  } else {
    index.push(vertBase + 1, vertBase + 2, vertBase + 3, vertBase + 1, vertBase + 3, vertBase);
  }
}

function packMesh(pos: number[], uv: number[], color: number[], index: number[]): MeshArrays {
  return {
    position: new Float32Array(pos),
    uv: new Float32Array(uv),
    color: new Float32Array(color),
    index: new Uint32Array(index),
  };
}

/**
 * 把一个 chunk 网格化为 opaque / water 两组几何（契约 §9）。
 * 面可见 ⇔ 邻块非 opaque；水-水相贴不出面；非 opaque 同 key 相贴互剔；水顶面（上方非水）下沉 0.1。
 */
export function meshChunk(
  cur: Uint8Array,
  neighbors: NeighborAccess,
  cx: number,
  cz: number,
): { opaque: MeshArrays; water: MeshArrays | null } {
  if (cur.length !== CHUNK_W * WORLD_H * CHUNK_W) {
    throw new Error(`meshChunk: chunk 数据长度应为 ${CHUNK_W * WORLD_H * CHUNK_W}，实际 ${cur.length}`);
  }
  const bx = cx * CHUNK_W;
  const bz = cz * CHUNK_W;

  // 复用缓冲清空（保留容量，避免每帧分配）
  OP_POS.length = 0; OP_UV.length = 0; OP_COLOR.length = 0; OP_INDEX.length = 0;
  WA_POS.length = 0; WA_UV.length = 0; WA_COLOR.length = 0; WA_INDEX.length = 0;

  for (let ly = 0; ly < WORLD_H; ly++) {
    for (let lz = 0; lz < CHUNK_W; lz++) {
      for (let lx = 0; lx < CHUNK_W; lx++) {
        const id = cur[voxelIndex(lx, ly, lz)];
        if (id === BLOCK.AIR || KNOWN[id] === 0) continue;
        const wx = bx + lx;
        const wy = ly;
        const wz = bz + lz;
        const isWater = LIQUID[id] === 1;
        const group = GROUP[id];

        for (let f = 0; f < 6; f++) {
          const fo = f * 3;
          const nid = sampleCell(cur, neighbors, bx, bz, wx + FN[fo], wy + FN[fo + 1], wz + FN[fo + 2]);

          if (isWater) {
            // 特例 1：水-水相贴不出面；被不透明方块遮住的面也不出
            if (nid === BLOCK.WATER || OPAQUE[nid] !== 0) continue;
          } else if (OPAQUE[nid] !== 0) {
            continue;
          } else if (KNOWN[nid] !== 0 && GROUP[nid] === group) {
            // 特例 2：两个非 opaque 方块同类相贴（叶-叶、玻-玻）剔除，异类（叶-玻）则各自出面
            continue;
          }

          // 经典 0 顶点法 AO：对面前层的 side1/side2/corner 三邻居判定遮挡；水面不做 AO（全 3 档）
          let a0 = 3, a1 = 3, a2 = 3, a3 = 3;
          if (!isWater) {
            const fx = wx + FN[fo];
            const fy = wy + FN[fo + 1];
            const fz = wz + FN[fo + 2];
            const ux = FDU[fo], uy = FDU[fo + 1], uz = FDU[fo + 2];
            const vx = FDV[fo], vy2 = FDV[fo + 1], vz2 = FDV[fo + 2];
            for (let k = 0; k < 4; k++) {
              const ks = k << 1;
              const su = CORNER_SIGN[ks];
              const sv = CORNER_SIGN[ks + 1];
              const s1 = OPAQUE[sampleCell(cur, neighbors, bx, bz, fx + su * ux, fy + su * uy, fz + su * uz)];
              const s2 = OPAQUE[sampleCell(cur, neighbors, bx, bz, fx + sv * vx, fy + sv * vy2, fz + sv * vz2)];
              let ao: number;
              if (s1 !== 0 && s2 !== 0) {
                ao = 0; // 两侧同时被压 → 此角夹在内凹角里，最深
              } else {
                const cn = OPAQUE[sampleCell(
                  cur, neighbors, bx, bz,
                  fx + su * ux + sv * vx, fy + su * uy + sv * vy2, fz + su * uz + sv * vz2,
                )];
                ao = 3 - (s1 + s2 + cn);
              }
              if (k === 0) a0 = ao;
              else if (k === 1) a1 = ao;
              else if (k === 2) a2 = ao;
              else a3 = ao;
            }
          }

          // UV 选择：top → tex[0]，bottom → tex[1]，四侧 → tex[2]
          const tile = f === 0 ? TEX_TOP[id] : f === 1 ? TEX_BOTTOM[id] : TEX_SIDE[id];
          // 水面「暴露」判定：本方块上方不是水（上方是 AIR 或其它）即视为表面
          const surfaceWater = isWater &&
            sampleCell(cur, neighbors, bx, bz, wx, wy + 1, wz) !== BLOCK.WATER;
          if (isWater) {
            pushQuad(WA_POS, WA_UV, WA_COLOR, WA_INDEX, wx, wy, wz, f, WA_POS.length / 3,
              SHADE[f], tile, 3, 3, 3, 3, surfaceWater);
          } else {
            pushQuad(OP_POS, OP_UV, OP_COLOR, OP_INDEX, wx, wy, wz, f, OP_POS.length / 3,
              SHADE[f], tile, a0, a1, a2, a3, false);
          }
        }
      }
    }
  }

  return {
    opaque: packMesh(OP_POS, OP_UV, OP_COLOR, OP_INDEX),
    water: WA_POS.length > 0 ? packMesh(WA_POS, WA_UV, WA_COLOR, WA_INDEX) : null,
  };
}
