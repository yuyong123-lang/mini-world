// renderer 纯逻辑测试（node 环境，无 WebGL/DOM）
// Renderer 构造函数依赖真实 WebGL 上下文，无法在 node 里实例化，
// 因此只覆盖可独立运行的纯逻辑：validateMeshArrays 校验器 + 契约常量断言。
import { describe, expect, it } from 'vitest';
import { validateMeshArrays } from '../src/render/renderer';
import { FOG_FAR, FOG_NEAR } from '../src/core/constants';
import { WATER_TILE, tileUV } from '../src/blocks/atlas';

/** 构造一份合法的最小网格（1 个三角形） */
function makeValid(): {
  position: Float32Array;
  uv: Float32Array;
  color: Float32Array;
  index: Uint32Array;
} {
  return {
    position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    uv: new Float32Array([0, 0, 1, 0, 0, 1]),
    color: new Float32Array(9),
    index: new Uint32Array([0, 1, 2]),
  };
}

describe('validateMeshArrays', () => {
  it('合法最小网格返回 null', () => {
    expect(validateMeshArrays(makeValid())).toBeNull();
  });

  it('null / 非对象输入返回错误描述（不抛异常）', () => {
    const r = validateMeshArrays(null as unknown as Parameters<typeof validateMeshArrays>[0]);
    expect(typeof r).toBe('string');
    expect(r!.length).toBeGreaterThan(0);
  });

  it('四大数组类型不对时报错', () => {
    const base = makeValid();
    for (const key of ['position', 'uv', 'color', 'index'] as const) {
      const broken = { ...base, [key]: new Array(3).fill(0) } as unknown as typeof base;
      const err = validateMeshArrays(broken);
      expect(err, `field ${key}`).toBeTruthy();
    }
  });

  it('position 长度不是 3 的倍数报错', () => {
    const m = makeValid();
    (m as { position: Float32Array }).position = new Float32Array(4);
    expect(validateMeshArrays(m)).toMatch(/position/);
  });

  it('uv / color 长度与顶点数不匹配报错', () => {
    const mUv = makeValid();
    (mUv as { uv: Float32Array }).uv = new Float32Array(4); // 顶点数=3，需要 6
    expect(validateMeshArrays(mUv)).toMatch(/uv/);

    const mCol = makeValid();
    (mCol as { color: Float32Array }).color = new Float32Array(6); // 需要 9
    expect(validateMeshArrays(mCol)).toMatch(/color/);
  });

  it('index 含 int32 负值（以 uint32 回绕形式存储）被识别', () => {
    // 用 DataView 强行把 -1 以带符号形式写进 Uint32Array 的底层 buffer，
    // 读出来是 4294967295——mesher/Worker 序列化 bug 的典型症状
    const idx = new Uint32Array(3);
    new DataView(idx.buffer).setInt32(0, -1, true);
    const m = makeValid();
    (m as { index: Uint32Array }).index = idx;
    const err = validateMeshArrays(m);
    expect(err).toMatch(/疑似负值/);
    expect(err).toContain('-1');
  });

  it('index 越界（>= 顶点数）报错', () => {
    const m = makeValid();
    (m as { index: Uint32Array }).index = new Uint32Array([0, 1, 3]); // 只有 3 个顶点
    expect(validateMeshArrays(m)).toMatch(/越界/);
  });

  it('index 长度不是 3 的倍数报错', () => {
    const m = makeValid();
    (m as { index: Uint32Array }).index = new Uint32Array([0, 1]);
    expect(validateMeshArrays(m)).toMatch(/index/);
  });

  it('position 含 NaN 报错', () => {
    const m = makeValid();
    (m as { position: Float32Array }).position = new Float32Array([
      NaN,
      0,
      0,
      1,
      0,
      0,
      0,
      1,
      0,
    ]);
    expect(validateMeshArrays(m)).toMatch(/有限数值/);
  });

  it('空网格（0 顶点 0 index）视为合法，由调用方决定跳过建 mesh', () => {
    const empty = {
      position: new Float32Array(0),
      uv: new Float32Array(0),
      color: new Float32Array(0),
      index: new Uint32Array(0),
    };
    expect(validateMeshArrays(empty)).toBeNull();
  });

  it('大网格性能冒烟：10 万顶点级别校验应快速完成', () => {
    const n = 30_000; // 三角形数 → 90k 顶点
    const pos = new Float32Array(n * 9);
    const uvs = new Float32Array(n * 6);
    const cols = new Float32Array(n * 9);
    const idx = new Uint32Array(n * 3);
    for (let t = 0; t < n; t++) {
      const v = t * 3;
      pos.set([v, 0, 0, v + 1, 0, 0, v, 1, 0], v * 3);
      idx.set([v, v + 1, v + 2], t * 3);
    }
    const start = performance.now();
    const res = validateMeshArrays({
      position: pos,
      uv: uvs,
      color: cols,
      index: idx,
    });
    const elapsed = performance.now() - start;
    expect(res).toBeNull();
    expect(elapsed).toBeLessThan(500);
  });
});

describe('渲染契约常量（架构 §2.10）', () => {
  it('FOG_NEAR / FOG_FAR 与冻结契约一致', () => {
    expect(FOG_NEAR).toBe(78);
    expect(FOG_FAR).toBe(92);
    expect(FOG_NEAR).toBeLessThan(FOG_FAR);
  });

  it('atlas 提供 water tile 且 UV 落在 [0,1]', () => {
    const { u0, v0, u1, v1 } = tileUV(WATER_TILE);
    for (const v of [u0, v0, u1, v1]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
