// mesher 单测（契约 §9 / 架构 §2.3 验收场景）
import { describe, expect, it } from 'vitest';
import { CHUNK_W, WORLD_H, voxelIndex } from '../src/core/constants';
import type { MeshArrays } from '../src/core/types';
import { BLOCK } from '../src/blocks/registry';
import { meshChunk, type NeighborAccess } from '../src/world/mesher';

const EPS = 1e-4;

/* ---------------------------------------------------------------- 助手 ---- */

function emptyChunk(): Uint8Array {
  return new Uint8Array(CHUNK_W * WORLD_H * CHUNK_W);
}

function setVoxel(data: Uint8Array, lx: number, ly: number, lz: number, id: number): void {
  data[voxelIndex(lx, ly, lz)] = id;
}

interface NeighborStats { minGy: number; calls: number }

/** 默认全 AIR 的邻居桩，可用 "x,y,z" 覆盖；顺带统计调用（用于验证越界兜底策略） */
function makeNeighbors(
  overrides: Record<string, number> = {},
  stats?: NeighborStats,
): NeighborAccess {
  return {
    get(gx: number, gy: number, gz: number): number {
      if (stats) {
        stats.calls++;
        if (gy < stats.minGy) stats.minGy = stats.minGy === Number.MAX_SAFE_INTEGER ? gy : Math.min(stats.minGy, gy);
      }
      const ov = overrides[`${gx},${gy},${gz}`];
      return ov === undefined ? BLOCK.AIR : ov;
    },
  };
}

function mesh(data: Uint8Array, cx: number, cz: number, nb?: NeighborAccess) {
  return meshChunk(data, nb ?? makeNeighbors(), cx, cz);
}

/** 还原每个四边形（用索引取真实顶点顺序），便于按几何位置挑选目标面 */
interface QuadSnap { p: number[]; uv: number[]; c: number[] }

function snapQuads(m: MeshArrays): QuadSnap[] {
  const out: QuadSnap[] = [];
  for (let ii = 0; ii < m.index.length; ii += 6) {
    const p: number[] = [];
    const uv: number[] = [];
    const c: number[] = [];
    for (let vi = 0; vi < 4; vi++) {
      const off = m.index[ii + vi];
      p.push(m.position[off * 3], m.position[off * 3 + 1], m.position[off * 3 + 2]);
      uv.push(m.uv[off * 2], m.uv[off * 2 + 1]);
      c.push(m.color[off * 3], m.color[off * 3 + 1], m.color[off * 3 + 2]);
    }
    out.push({ p, uv, c });
  }
  return out;
}

const coord = (q: QuadSnap, axis: 'x' | 'y' | 'z', vi: number): number =>
  q.p[vi * 3 + (axis === 'x' ? 0 : axis === 'y' ? 1 : 2)];

/** 某轴上所有 4 角都落在 plane 平面上的四边形数量——识别朝向该平面的正对面的手段 */
function quadsOnPlane(qs: QuadSnap[], axis: 'x' | 'y' | 'z', plane: number): number {
  let n = 0;
  for (const q of qs) {
    let all = true;
    for (let vi = 0; vi < 4; vi++) {
      if (Math.abs(coord(q, axis, vi) - plane) > EPS) { all = false; break; }
    }
    if (all) n++;
  }
  return n;
}

const vertexColors = (q: QuadSnap): number[] => [0, 1, 2, 3].map((vi) => q.c[vi * 3]);

describe('mesher 基本面剔除', () => {
  it('全 STONE 满填：只有 4 侧壁外露面 + 顶面，底面因 gy<0 视作 BEDROCK 被剔除', () => {
    const data = emptyChunk();
    data.fill(BLOCK.STONE);
    const stats: NeighborStats = { minGy: Number.MAX_SAFE_INTEGER, calls: 0 };
    const r = mesh(data, 3, -2, makeNeighbors({}, stats));
    const op = snapQuads(r.opaque);

    // 侧壁：每层四个方向各 16 面 = 64，× 64 层 = 4096；顶面 16×16 = 256；合计 4352
    expect(op.length).toBe(64 * WORLD_H + 256);
    expect(op.length).toBe(4352);
    expect(r.water).toBeNull();

    // 世界坐标烘焙：chunk 原点是 (48, 0, -32)
    expect(quadsOnPlane(op, 'x', 48)).toBe(1024);
    expect(quadsOnPlane(op, 'x', 64)).toBe(1024);
    expect(quadsOnPlane(op, 'z', -32)).toBe(1024);
    expect(quadsOnPlane(op, 'z', -16)).toBe(1024);
    // 底部无面向下（gy=-1 兜底为不透明）
    expect(quadsOnPlane(op, 'y', 0)).toBe(0);
    expect(quadsOnPlane(op, 'y', 64)).toBe(256);

    // 世界底部以下不应去问调用方
    expect(stats.calls).toBeGreaterThan(0);
    expect(stats.minGy).toBeGreaterThanOrEqual(0);
  });

  it('悬浮单块 DIRT：恰好 6 面 / 24 顶点 / 36 索引，顶面 color=1.0、底面 color=0.5、四面符合 faceShade 表', () => {
    const data = emptyChunk();
    setVoxel(data, 8, 20, 8, BLOCK.DIRT);
    const r = mesh(data, 0, 0);
    expect(r.water).toBeNull();

    const op = snapQuads(r.opaque);
    expect(op.length).toBe(6);
    expect(r.opaque.position.length / 3).toBe(24);
    expect(r.opaque.index.length).toBe(36);

    const top = op.find((q) => [0, 1, 2, 3].every((vi) => Math.abs(coord(q, 'y', vi) - 21) < EPS));
    const bottom = op.find((q) => [0, 1, 2, 3].every((vi) => Math.abs(coord(q, 'y', vi) - 20) < EPS));
    expect(top).toBeDefined();
    expect(bottom).toBeDefined();
    for (const c of vertexColors(top!)) expect(c).toBeCloseTo(1.0, 5); // 1.0(faceshade) × 1.0(AO 最高档)
    for (const c of vertexColors(bottom!)) expect(c).toBeCloseTo(0.5, 5); // 0.5 × 1.0

    // 顶点色集合应恰为 faceShade 四值（开阔位置 AO 全满档）
    const shades = new Set(op.flatMap(vertexColors).map((c) => Math.round(c * 1000)));
    expect([...shades]).toEqual(expect.arrayContaining([500, 650, 800, 1000]));
    expect(shades.size).toBe(4);
  });

  it('两相邻 STONE 共享面剔除；16 连条只露两端', () => {
    const data = emptyChunk();
    setVoxel(data, 8, 10, 8, BLOCK.STONE);
    setVoxel(data, 9, 10, 8, BLOCK.STONE);
    const r1 = snapQuads(mesh(data, 0, 0).opaque);
    // 各 6 面减共享 1 面 ×2 方向都不出 → 12 - 2 = 10
    expect(r1.length).toBe(10);
    // 接触平面 x=9 上不存在任何整面（相互的两个界面都剔除了）
    expect(quadsOnPlane(r1, 'x', 9)).toBe(0);

    // 16 格长条：内部 15 个接触面全剔除，只剩两端 2 面
    const bar = emptyChunk();
    for (let x = 0; x < CHUNK_W; x++) setVoxel(bar, x, 10, 8, BLOCK.STONE);
    const r2 = snapQuads(mesh(bar, 0, 0).opaque);
    expect(r2.length).toBe(2 + 16 * 4); // 两端 2 + 上下前后各 16
    expect(quadsOnPlane(r2, 'x', 8)).toBe(0); // 内部任意分割面上零整面
  });
});

describe('mesher 水', () => {
  it('3 格深水柱上方为空气：全部出面进 water 组，顶面下沉 0.1，侧壁对 AIR 出面且带 faceShade 无 AO', () => {
    const data = emptyChunk();
    setVoxel(data, 8, 25, 8, BLOCK.WATER);
    setVoxel(data, 8, 26, 8, BLOCK.WATER);
    setVoxel(data, 8, 27, 8, BLOCK.WATER);
    const r = mesh(data, 0, 0);

    expect(r.opaque.position.length).toBe(0); // 纯水场景一个实体面都没有
    expect(r.water).not.toBeNull();
    const w = snapQuads(r.water!);

    // 底块 5（-Y + 四侧）+ 中块 4（两侧均水）+ 顶块 5（+Y + 四侧）= 14
    expect(w.length).toBe(14);
    expect(r.water!.index.length).toBe(14 * 6);
    expect(r.water!.position.length / 3).toBe(56);
    expect(r.water!.uv.length).toBe(112);
    expect(r.water!.color.length).toBe(168);

    // 整片水面统一降到 28-0.1：+Y 面 4 角 + 4 个侧面各自的上缘 2 角 = 12 个顶点落在 y=27.9，
    // 且不存在任何顶点高于它（否则侧面会翘出 0.1 高的「池沿」裙边）
    const ys = Array.from(r.water!.position).filter((_, i) => i % 3 === 1);
    const dropped = ys.filter((y) => Math.abs(y - 27.9) < EPS);
    expect(dropped.length).toBe(12);
    expect(Math.max(...ys)).toBeCloseTo(27.9, 5);
    expect(Math.min(...ys)).toBeCloseTo(25, 5); // 水柱最下方块 y=25 的底面（上方 AIR 出面，契约允许）
    // 顶部下沉面正好一个：整面都贴在 27.9 平面
    expect(quadsOnPlane(w, 'y', 27.9)).toBe(1);

    // 顶部下沉面的颜色 = faceShade(1.0)，水面不做 AO
    const top = w.find((q) => [0, 1, 2, 3].every((vi) => Math.abs(coord(q, 'y', vi) - 27.9) < EPS));
    expect(top).toBeDefined();
    for (const c of vertexColors(top!)) expect(c).toBeCloseTo(1.0, 5);

    // 侧壁对 AIR 出面进 water 组：三格各有一个 +X 整面落在 x=9 平面，色 = 0.65
    expect(quadsOnPlane(w, 'x', 9)).toBe(3);
    for (const q of w.filter((qq) => [0, 1, 2, 3].every((vi) => Math.abs(coord(qq, 'x', vi) - 9) < EPS))) {
      for (const c of vertexColors(q)) expect(c).toBeCloseTo(0.65, 5);
    }

    // 柱内水平面（水-水相贴）已剔除；底部唯一朝下的整面在 y=25
    expect(quadsOnPlane(w, 'y', 25)).toBe(1);
    expect(quadsOnPlane(w, 'y', 26)).toBe(0);
    expect(quadsOnPlane(w, 'y', 27)).toBe(0);

    // 水 vertex color 只含 faceShade 值，证明没有叠 AO 系数
    const cs = new Set(Array.from(r.water!.color).map((c) => Math.round(c * 1000)));
    expect(cs.size).toBeLessThanOrEqual(4);
    expect(cs.has(820)).toBe(false);
    expect(cs.has(450)).toBe(false);
  });
});

describe('mesher AO', () => {
  it('L 形三石块的内凹缺口处内侧顶点被压暗（<0.7），开阔位置顶点保持 1.0', () => {
    const data = emptyChunk();
    setVoxel(data, 8, 10, 8, BLOCK.STONE); // A 立柱底部
    setVoxel(data, 8, 11, 8, BLOCK.STONE); // B 立柱顶部
    setVoxel(data, 9, 11, 8, BLOCK.STONE); // C 悬挑
    // 缺角 = (9,10,8)，其内侧可见的是 C 的底面
    const r = mesh(data, 0, 0);
    const op = snapQuads(r.opaque);

    // 定位 C 的底面：四角都在 y=11 且最小 x 为 9（与 A 的顶面 y=11 但 x∈{8,9} 区分开）
    const underside = op.find((q) =>
      [0, 1, 2, 3].every((vi) => Math.abs(coord(q, 'y', vi) - 11) < EPS) &&
      Math.abs(Math.min(...[0, 1, 2, 3].map((vi) => coord(q, 'x', vi))) - 9) < EPS,
    );
    expect(underside).toBeDefined();
    const uc = vertexColors(underside!);
    // 朝向 A 一侧的两角：side1=(8,10,8) 是实心遮挡 → ao=2 → 0.5 × 0.82 = 0.41
    const darkened = uc.filter((c) => c < 0.7);
    expect(darkened.length).toBeGreaterThanOrEqual(1);
    expect(Math.min(...uc)).toBeCloseTo(0.41, 5);

    // 对照：整个网格里仍有完全开阔位置的顶点保持满亮度 1.0（如 B 顶面）
    const maxC = Math.max(...op.flatMap(vertexColors));
    expect(maxC).toBeCloseTo(1.0, 5);

    // 同一面里未被遮挡的对侧角保持 0.5（无遮挡底面基准），证明压暗只发生在缺口内角
    expect(Math.max(...uc)).toBeCloseTo(0.5, 5);
  });
});

describe('mesher UV', () => {
  it('SAND（tex[0]==5）顶面 UV 落在 tile5 的半 texel inset 矩形内且贴合矩形边界', () => {
    const data = emptyChunk();
    setVoxel(data, 5, 10, 5, BLOCK.SAND);
    const op = snapQuads(mesh(data, 0, 0).opaque);
    const top = op.find((q) => [0, 1, 2, 3].every((vi) => Math.abs(coord(q, 'y', vi) - 11) < EPS));
    expect(top).toBeDefined();

    // atlas.tileUV 同规则的期望矩形：col=5,row=0
    const u0 = (5 * 16 + 0.5) / 256;
    const u1 = ((5 + 1) * 16 - 0.5) / 256;
    const v0 = 1 - ((0 + 1) * 16 - 0.5) / 256; // 下缘更小
    const v1 = 1 - (0 * 16 + 0.5) / 256;

    const us = [0, 1, 2, 3].flatMap((vi) => [top!.uv[vi * 2], top!.uv[vi * 2 + 1]])
      .filter((_, i) => i % 2 === 0);
    const vs = top!.uv.filter((_, i) => i % 2 === 1);
    for (const u of us) expect(u).toBeGreaterThanOrEqual(u0 - EPS);
    for (const u of us) expect(u).toBeLessThanOrEqual(u1 + EPS);
    for (const v of vs) expect(v).toBeGreaterThanOrEqual(v0 - EPS);
    for (const v of vs) expect(v).toBeLessThanOrEqual(v1 + EPS);

    // 四个角精确贴到 inset 矩形（覆盖整个 tile 而非缩小到中心）
    expect(Math.min(...us)).toBeCloseTo(u0, 6);
    expect(Math.max(...us)).toBeCloseTo(u1, 6);
    expect(Math.min(...vs)).toBeCloseTo(v0, 6);
    expect(Math.max(...vs)).toBeCloseTo(v1, 6);
    // 半 texel inset 生效（严格在 tile 边界之内），且 v 已翻转（首行 tile 顶缘接近 1）
    expect(Math.max(...us)).toBeLessThan(6 * 16 / 256);
    expect(Math.min(...us)).toBeGreaterThan(5 * 16 / 256);
    expect(Math.max(...vs)).toBeLessThan(1);
    expect(Math.max(...vs)).toBeGreaterThan(1 - 4 / 256);
  });
});

describe('mesher 透明方块规则', () => {
  it('LEAVES 邻 GLASS：两面都在；LEAVES 邻 LEAVES：同 key 相互剔除', () => {
    const d1 = emptyChunk();
    setVoxel(d1, 8, 10, 8, BLOCK.LEAVES);
    setVoxel(d1, 9, 10, 8, BLOCK.GLASS);
    const r1 = mesh(d1, 0, 0);
    const q1 = snapQuads(r1.opaque);
    // 两个非 opaque 异类相邻：两块各自满 6 面共 12
    expect(q1.length).toBe(12);
    expect(r1.water).toBeNull();
    // 接触平面 x=9 上有 LEAVES 的 +X 面和 GLASS 的 -X 面两个整面
    expect(quadsOnPlane(q1, 'x', 9)).toBe(2);
    expect(r1.opaque.index.length).toBe(72);

    const d2 = emptyChunk();
    setVoxel(d2, 8, 10, 8, BLOCK.LEAVES);
    setVoxel(d2, 9, 10, 8, BLOCK.LEAVES);
    const r2 = snapQuads(mesh(d2, 0, 0).opaque);
    // 同 key 相邻防 z-fighting：12 - 2 = 10
    expect(r2.length).toBe(10);
    expect(quadsOnPlane(r2, 'x', 9)).toBe(0);
  });
});

describe('mesher 输出一致性与性能烟雾', () => {
  it('多材质混合场景下 position/uv/color/index 长度关系与索引范围一致', () => {
    const data = emptyChunk();
    for (let x = 0; x < CHUNK_W; x++) {
      for (let z = 0; z < CHUNK_W; z++) setVoxel(data, x, 20, z, BLOCK.GRASS);
    }
    setVoxel(data, 3, 21, 4, BLOCK.STONE);
    setVoxel(data, 10, 22, 9, BLOCK.LEAVES);
    setVoxel(data, 10, 22, 10, BLOCK.GLASS);
    setVoxel(data, 6, 19, 6, BLOCK.WATER);
    setVoxel(data, 6, 20, 6, BLOCK.WATER);
    setVoxel(data, 7, 21, 7, BLOCK.LOG);

    const r = mesh(data, 2, -5);
    for (const group of [r.opaque, r.water!] as (MeshArrays | null)[]) {
      if (!group) continue;
      expect(group.position.length % 3).toBe(0);
      expect(group.uv.length).toBe((group.position.length / 3) * 2);
      expect(group.color.length).toBe(group.position.length);
      expect(group.index.length % 3).toBe(0);
      const vertCount = group.position.length / 3;
      for (const i of group.index) {
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(vertCount);
      }
      // 每个 quad 都引用连续 4 顶点，且灰度单通道
      for (let vi = 0; vi < vertCount; vi++) {
        const rr = group.color[vi * 3];
        expect(group.color[vi * 3 + 1]).toBe(rr);
        expect(group.color[vi * 3 + 2]).toBe(rr);
      }
    }
  });

  it('满填 chunk（最坏表面情形）在宽松预算内完成（性能烟雾，不做严格 ms 断言避免 CI 抖动）', () => {
    const data = emptyChunk();
    data.fill(BLOCK.STONE);
    const t0 = performance.now();
    const r = meshChunk(data, makeNeighbors(), 0, 0);
    const dt = performance.now() - t0;
    expect(r.opaque.index.length / 6).toBe(4352);
    // 开发机典型 <10ms；给 200ms 冗余做回归护栏而非微基准
    expect(dt).toBeLessThan(200);
  });
});
