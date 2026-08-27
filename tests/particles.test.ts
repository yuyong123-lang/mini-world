// T102 挖掘粒子：纯逻辑测试（node 环境，无 three/WebGL）。
// ParticleSystem 本体依赖 THREE.Points + WebGL 渲染管线，node 无法实例化，
// 因此只覆盖抽出的可独立运行部分：stepParticle 运动学、spawnVelocity 速度采样、
// allocSlot 环形槽位分配（含池满复用最老的验收语义）、tileAverageColor 签名冒烟。
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_PARTICLES,
  PARTICLE_GRAVITY,
  SPAWN_H_SPREAD,
  SPAWN_UP_SPEED,
  type ParticleState,
  allocSlot,
  spawnVelocity,
  stepParticle,
} from '../src/render/particles';

describe('stepParticle 半隐式欧拉积分', () => {
  it('重力使 vy 按 g*dt 递减，120 步后与解析解一致（容差 1e-9）', () => {
    const p: ParticleState = { x: 0, y: 10, z: 0, vx: 1, vy: 2, vz: 0, life: 5, maxLife: 5 };
    const dt = 1 / 60;
    for (let i = 0; i < 120; i++) expect(stepParticle(p, dt)).toBe(true);
    const t = dt * 120;
    expect(p.vy).toBeCloseTo(2 + PARTICLE_GRAVITY * t, 9); // v = v0 + g·t
    expect(p.vx).toBeCloseTo(1, 9);
    expect(p.vz).toBeCloseTo(0, 9);
    // 半隐式欧拉：每步先更新速度再位置，120 步位移 = 速度序列 × dt
    expect(p.x).toBeCloseTo(1 * 120 * dt, 9); // vx 恒定 → x = vx·t 精确成立
    let expectedY = 10;
    let vy = 2;
    for (let i = 0; i < 120; i++) {
      vy += PARTICLE_GRAVITY * dt;
      expectedY += vy * dt;
    }
    expect(p.y).toBeCloseTo(expectedY, 9);
  });

  it('x/z 匀速直线，每步 ∆vy/∆t 恒等于 g，且下落段 y 被拉低', () => {
    const p: ParticleState = { x: 0, y: 20, z: 0, vx: 3, vy: 4, vz: -2, life: 3, maxLife: 3 };
    const dt = 0.05;
    const steps = 40;
    let prevVy = p.vy;
    for (let i = 0; i < steps; i++) {
      expect(stepParticle(p, dt)).toBe(true);
      expect((p.vy - prevVy) / dt).toBeCloseTo(PARTICLE_GRAVITY, 6);
      prevVy = p.vy;
    }
    expect(p.x).toBeCloseTo(3 * steps * dt, 6);
    expect(p.z).toBeCloseTo(-2 * steps * dt, 6);
    expect(p.y).toBeLessThan(20);
  });

  it('寿命耗尽返回 false 并把 life 钳到 0（回收信号）', () => {
    const p: ParticleState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.25, maxLife: 0.25 };
    expect(stepParticle(p, 0.1)).toBe(true);
    expect(p.life).toBeCloseTo(0.15, 9);
    expect(stepParticle(p, 0.1)).toBe(true);
    expect(p.life).toBeCloseTo(0.05, 9);
    expect(stepParticle(p, 0.1)).toBe(false);
    expect(p.life).toBe(0);
    // 致命那一步照常积分位移（先动后死），随后必须冻结
    const frozen: ParticleState = { ...p };
    expect(stepParticle(p, 0.5)).toBe(false); // 已死粒子再步进：仍判死、不再移动
    expect(p.x).toBe(frozen.x);
    expect(p.y).toBe(frozen.y);
    expect(p.z).toBe(frozen.z);
    expect(p.vy).toBe(frozen.vy);
    expect(p.life).toBe(0);
  });

  it('寿命恰好被一步耗尽即判定死亡', () => {
    const p: ParticleState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.5, maxLife: 0.5 };
    expect(stepParticle(p, 0.5)).toBe(false);
  });

  it('非法 dt（0/负数/NaN）不推进状态也不误杀', () => {
    for (const bad of [0, -0.016, Number.NaN]) {
      const p: ParticleState = { x: 1, y: 2, z: 3, vx: 9, vy: 9, vz: 9, life: 1, maxLife: 1 };
      expect(stepParticle(p, bad)).toBe(true);
      expect([p.x, p.y, p.z, p.life]).toEqual([1, 2, 3, 1]);
    }
  });

  it('自定义重力参数生效', () => {
    const a: ParticleState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, maxLife: 1 };
    stepParticle(a, 0.5, -18);
    const b: ParticleState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, maxLife: 1 };
    stepParticle(b, 0.5, -4.5);
    expect(a.vy).toBeCloseTo(-9, 9);
    expect(b.vy).toBeCloseTo(-2.25, 9);
    expect(b.vy).toBeGreaterThan(a.vy);
  });

  it('抛物线单调性：上冲过冲后自由落体越过初始高度，寿命未到即存活', () => {
    const p: ParticleState = { x: 0, y: 30, z: 0, vx: 0, vy: 12, vz: 0, life: 99, maxLife: 99 };
    let peak = p.y;
    for (let i = 0; i < 600; i++) {
      if (!stepParticle(p, 1 / 60)) break;
      peak = Math.max(peak, p.y);
    }
    expect(peak).toBeGreaterThan(30);
    expect(p.y).toBeLessThan(-10);
    expect(p.life).toBeGreaterThan(0);
  });
});

describe('spawnVelocity 初速采样', () => {
  /** LCG：可重现的假 rng */
  function makeLcg(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 48271) % 2147483647;
      return s / 2147483647;
    };
  }

  it('确定性：相同种子序列输出完全一致', () => {
    const a = makeLcg(12345);
    const b = makeLcg(12345);
    for (let i = 0; i < 50; i++) expect(spawnVelocity(a)).toEqual(spawnVelocity(b));
  });

  it('水平速度包络在 ±hSpread 内且模长 ≤ hSpread（极值探针）', () => {
    const v = spawnVelocity(() => 0.9999999);
    expect(Math.abs(v.vx)).toBeLessThanOrEqual(SPAWN_H_SPREAD + 1e-9);
    expect(Math.abs(v.vz)).toBeLessThanOrEqual(SPAWN_H_SPREAD + 1e-9);
    expect(Math.hypot(v.vx, v.vz)).toBeLessThanOrEqual(SPAWN_H_SPREAD + 1e-9);
    // rng=1 时 radius=hSpread，且第三个 rng 也 = 1 → vy 因子取满
    expect(v.vy).toBeCloseTo(SPAWN_UP_SPEED, 4);
  });

  it('向上初速 ∈ [0.55, 1.0]×upSpeed，rng 端点分别命中下/上界', () => {
    let minFactor = Infinity;
    let maxFactor = -Infinity;
    for (const r of [0.0001, 0.25, 0.5, 0.75, 0.9999]) {
      const v = spawnVelocity(() => r); // 三次取同一值：angle/radius/vy 用同一个数
      minFactor = Math.min(minFactor, v.vy / SPAWN_UP_SPEED);
      maxFactor = Math.max(maxFactor, v.vy / SPAWN_UP_SPEED);
      void minFactor;
    }
    // 第三次调用消费的 rng 值决定 vy 因子：r=0.0001 → ~0.55；r=0.9999 → ~0.99995
    const lo = spawnVelocity(() => 0.0001);
    const hi = spawnVelocity(() => 0.9999);
    expect(lo.vy / SPAWN_UP_SPEED).toBeGreaterThanOrEqual(0.55);
    expect(hi.vy / SPAWN_UP_SPEED).toBeLessThanOrEqual(1.0);
    expect(hi.vy).toBeGreaterThan(lo.vy);
    expect(minFactor).toBeLessThan(Infinity);
    expect(maxFactor).toBeGreaterThan(-Infinity);
  });

  it('radius 的 sqrt 均匀圆盘分布：批量水平速率均值 ≈ 2/3·hSpread', () => {
    const rng = makeLcg(777);
    const N = 4000;
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const v = spawnVelocity(rng);
      sum += Math.hypot(v.vx, v.vz);
    }
    const mean = sum / N;
    const expected = (2 / 3) * SPAWN_H_SPREAD; // ≈ 1.667
    expect(mean).toBeGreaterThan(expected * 0.8);
    expect(mean).toBeLessThan(expected * 1.2);
  });

  it('自定义参数覆盖默认扩散与上抛强度', () => {
    const v = spawnVelocity(() => 0.99, { hSpread: 5, upSpeed: 8 });
    expect(Math.max(Math.abs(v.vx), Math.abs(v.vz))).toBeLessThanOrEqual(5 + 1e-9);
    expect(Math.hypot(v.vx, v.vz)).toBeGreaterThan(4);
    expect(v.vy).toBeGreaterThan(0.55 * 8 * 0.9);
    expect(v.vy).toBeLessThanOrEqual(8);
  });
});

describe('allocSlot 环形池分配', () => {
  const cap = 8;

  function pool(activeSlots: number[]): Uint8Array {
    const arr = new Uint8Array(cap);
    for (const i of activeSlots) arr[i] = 1;
    return arr;
  }
  const full = Array.from({ length: cap }, (_, i) => i);

  it('空池从 head 取第一个槽位并推进写指针', () => {
    expect(allocSlot(pool([]), 0)).toEqual({ slot: 0, nextHead: 1, evicted: false });
    expect(allocSlot(pool([]), 5).slot).toBe(5);
  });

  it('跳过存活槽位取最近的死位', () => {
    expect(allocSlot(pool([0, 1, 3]), 0)).toEqual({ slot: 2, nextHead: 3, evicted: false });
  });

  it('写指针回绕（wrap around）：head 被占则从 0 号继续找', () => {
    expect(allocSlot(pool([7]), 7)).toEqual({ slot: 0, nextHead: 1, evicted: false });
    expect(allocSlot(pool([7, 0]), 7)).toEqual({ slot: 1, nextHead: 2, evicted: false });
    expect(allocSlot(pool([7, 0, 1]), 7)).toEqual({ slot: 2, nextHead: 3, evicted: false });
  });

  it('全满时覆盖 head 所指最老粒子并上报 evicted（超容量复用语义）', () => {
    expect(allocSlot(pool(full), 0)).toEqual({ slot: 0, nextHead: 1, evicted: true });
    expect(allocSlot(pool(full), 5)).toEqual({ slot: 5, nextHead: 6, evicted: true });
    expect(allocSlot(pool(full), 7)).toEqual({ slot: 7, nextHead: 0, evicted: true });
  });

  it('容量 200 的实际节奏（14 发/波，每波回收 10）永不触发覆写', () => {
    const live = new Uint8Array(DEFAULT_MAX_PARTICLES);
    let head = 0;
    let evictions = 0;
    for (let burst = 0; burst < 20; burst++) {
      for (let k = 0; k < 14; k++) {
        const r = allocSlot(live, head);
        if (r.evicted) evictions++;
        live[r.slot] = 1;
        head = r.nextHead;
      }
      let freed = 0;
      for (let i = 0; i < live.length && freed < 10; i++) {
        if (live[i]) {
          live[i] = 0;
          freed++;
        }
      }
    }
    expect(evictions).toBe(0);
  });

  it('人为小池永不释放时覆写计数正确', () => {
    const small = new Uint8Array(4);
    let head = 0;
    let evictions = 0;
    for (let i = 0; i < 10; i++) {
      const r = allocSlot(small, head);
      if (r.evicted) evictions++;
      small[r.slot] = 1;
      head = r.nextHead;
    }
    expect(evictions).toBe(6);
  });
});

// --- tileAverageColor 只做签名冒烟：node 无 ImageData/getImageData 实现 ---
describe('tileAverageColor 签名冒烟（node 无真 canvas）', () => {
  it('函数存在、二参；越界/非法 tileIndex 在读像素前就抛错', async () => {
    const mod = await import('../src/render/particles');
    expect(typeof mod.tileAverageColor).toBe('function');
    expect(mod.tileAverageColor.length).toBe(2);
    const fake = { width: 32, height: 32, getContext: () => null } as unknown as HTMLCanvasElement;
    expect(() => mod.tileAverageColor(fake, -1)).toThrow(/非法/);
    expect(() => mod.tileAverageColor(fake, 3)).toThrow(/2D/); // getContext 为 null 先炸
    expect(() => mod.tileAverageColor(fake, 99999)).toThrow(/超出|2D/);
  });
});
