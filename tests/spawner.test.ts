// tests/spawner.test.ts —— T83 出生调度器单测
// 覆盖：节流(accumulator)、上限拦截、动物海平面/草地过滤、怪物环带合法性、despawn 判定。

import { describe, expect, it, vi } from 'vitest';
import { BLOCK } from '../src/blocks/registry';
import { SEA_LEVEL } from '../src/core/constants';
import type { Vec3 } from '../src/core/types';
import { SPAWN_ATTEMPT_INTERVAL, Spawner, shouldDespawn } from '../src/entities/spawner';

/**
 * 假体素世界：每列可编程地形高度；layGround 把「支撑块」铺成指定方块（GRASS 或 STONE），
 * 其余为 AIR。覆盖范围放大到 ±160，足够怪物环带（玩家任意原点 +40m）落点查询。
 */
class FakeWorld {
  private solid = new Set<string>();
  private grass = new Set<string>();

  constructor(private readonly groundYOf: (x: number, z: number) => number) {}

  layGround(id: number): void {
    for (let x = -160; x <= 160; x++) {
      for (let z = -160; z <= 160; z++) {
        const key = `${x},${this.groundYOf(x, z) - 1},${z}`;
        this.solid.add(key);
        if (id === BLOCK.GRASS) this.grass.add(key);
      }
    }
  }

  addSolid(x: number, y: number, z: number): void {
    this.solid.add(`${x},${y},${z}`);
  }

  isSolid(x: number, y: number, z: number): boolean {
    return this.solid.has(`${x | 0},${y | 0},${z | 0}`);
  }

  getBlock(x: number, y: number, z: number): number {
    if (!this.isSolid(x, y, z)) return BLOCK.AIR;
    return this.grass.has(`${x | 0},${y | 0},${z | 0}`) ? BLOCK.GRASS : BLOCK.STONE;
  }
}

const P: Vec3 = { x: 0, y: 40, z: 0 };
const ZERO_COUNTS = { animal: 0, monster: 0 };

describe('Spawner 节流与昼夜分流', () => {
  it('accumulator：tick(0.1)x10 → 至多 2 次 cb；再推进 2s → 至多再 4 次', () => {
    const w = new FakeWorld(() => 40);
    w.layGround(BLOCK.GRASS);
    const sp = new Spawner(w, { groundY: () => 40, rng: () => 0.42 });
    const onAnimal = vi.fn();
    sp.onSpawnAnimal(onAnimal);

    for (let i = 0; i < 10; i++) sp.tick(0.1, P, false, ZERO_COUNTS);
    // 1.0s 总时长 → 仅在第 0.5s 与第 1.0s 各一次尝试；成群刷新每次一群（2~4 只）
    expect(onAnimal.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(onAnimal.mock.calls.length).toBeLessThanOrEqual(8);

    const before = onAnimal.mock.calls.length;
    for (let i = 0; i < 20; i++) sp.tick(0.1, P, false, ZERO_COUNTS);
    // 又推进 2.0s → 每 0.5s 一次共 4 群，上界 4×4=16（且卡顿后不补帧爆量）
    expect(onAnimal.mock.calls.length - before).toBeLessThanOrEqual(16);
    expect(SPAWN_ATTEMPT_INTERVAL).toBe(0.5);
  });

  it('夜间只走怪物路径、白天只走动物路径', () => {
    const mkNight = () => {
      const w = new FakeWorld(() => 40);
      w.layGround(BLOCK.STONE); // 怪物不过滤草，石面即可成立
      return new Spawner(w, { groundY: () => 40, rng: () => 0.5 });
    };
    const mkDay = () => {
      const w = new FakeWorld(() => 40);
      w.layGround(BLOCK.GRASS);
      return new Spawner(w, { groundY: () => 40, rng: () => 0.5 });
    };

    // 夜：动物回调绝不被触发；怪物确实在被调度（草/石面均合格）
    const nA = vi.fn(), nM = vi.fn();
    const night = mkNight();
    night.onSpawnAnimal(nA);
    night.onSpawnMonster(nM);
    night.tick(0.5, P, true, ZERO_COUNTS);
    expect(nA).not.toHaveBeenCalled();
    expect(nM).toHaveBeenCalledTimes(1);

    // 昼：怪物回调绝不被触发；动物成群被调度（rng=0.5 → 一群 3 只，全平地全合格）
    const dA = vi.fn(), dM = vi.fn();
    const day = mkDay();
    day.onSpawnAnimal(dA);
    day.onSpawnMonster(dM);
    day.tick(0.5, P, false, ZERO_COUNTS);
    expect(dM).not.toHaveBeenCalled();
    expect(dA).toHaveBeenCalledTimes(3);
  });
});

describe('Spawner 动物成群刷新（多物种）', () => {
  it('单次尝试产出一群（默认 2~4 只），成员落在群心 ±3 且同群同物种', () => {
    const w = new FakeWorld(() => 40);
    w.layGround(BLOCK.GRASS);
    const sp = new Spawner(w, { groundY: () => 40, rng: () => 0.25 });
    const calls: Array<{ p: Vec3; s: string }> = [];
    sp.onSpawnAnimal((p, s) => calls.push({ p, s }));
    sp.tick(0.5, P, false, ZERO_COUNTS);

    // rng=0.25 → species=pig(<1/3)，herdSize=2+floor(0.25*3)=2（平地全合格）
    expect(calls.length).toBe(2);
    const speciesSet = new Set(calls.map((c) => c.s));
    expect(speciesSet.size).toBe(1); // 同一群同一物种
    expect(['pig', 'cow', 'sheep']).toContain(calls[0].s);
    const heart = calls[0].p;
    for (const c of calls) {
      expect(Math.abs(c.p.x - heart.x)).toBeLessThanOrEqual(3);
      expect(Math.abs(c.p.z - heart.z)).toBeLessThanOrEqual(3);
    }
  });

  it('counts.animal 逼近上限时群被钳制，不超发', () => {
    const w = new FakeWorld(() => 40);
    w.layGround(BLOCK.GRASS);
    const sp = new Spawner(w, { groundY: () => 40, rng: () => 0.1 });
    const a = vi.fn();
    sp.onSpawnAnimal(a);
    // 距上限仅 1 → 群最多补 1 只
    sp.tick(0.5, P, false, { animal: 23, monster: 0 });
    expect(a).toHaveBeenCalledTimes(1);
    // 到上限后不再刷
    sp.tick(0.5, P, false, { animal: 24, monster: 0 });
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('三物种等权轮换（固定 rng 扫描三个区间）', () => {
    const w = new FakeWorld(() => 40);
    w.layGround(BLOCK.GRASS);
    const seen: string[] = [];
    const sp = new Spawner(w, {
      groundY: () => 40,
      animalHerd: [1, 1], // 单只群，恰好一次 emit/尝试
      rng: () => 0, // 占位，下方立即覆盖为可编程序列
    });
    // 用可编程 rng 扫描 [0,1)：0.1/0.4/0.8 分落三个物种区间
    const seq = [0.1, 0.4, 0.8];
    let i = 0;
    (sp as unknown as { rng: () => number }).rng = () => seq[i++ % seq.length];
    sp.onSpawnAnimal((_p, s) => seen.push(s));
    for (let k = 0; k < 3; k++) sp.tick(0.5, P, false, ZERO_COUNTS);
    // 不假设 rng 的具体消耗顺序，只验证三个物种都被覆盖到且各出现一次
    expect(seen.length).toBe(3);
    expect(new Set(seen)).toEqual(new Set(['pig', 'cow', 'sheep']));
  });
});

describe('Spawner 上限拦截', () => {
  it('counts.monster=12 → 夜间不再发 onSpawnMonster', () => {
    const w = new FakeWorld(() => 40);
    w.layGround(BLOCK.STONE);
    const full = new Spawner(w, { groundY: () => 40, rng: () => 0.3 });
    const m = vi.fn();
    full.onSpawnMonster(m);
    for (let i = 0; i < 6; i++) full.tick(0.5, P, true, { animal: 0, monster: 12 });
    expect(m).not.toHaveBeenCalled();

    // 对照：除数量外的同条件正常放行，证明拦截确由上限触发
    const spare = new Spawner(w, { groundY: () => 40, rng: () => 0.3 });
    const m2 = vi.fn();
    spare.onSpawnMonster(m2);
    spare.tick(0.5, P, true, { animal: 0, monster: 11 });
    expect(m2).toHaveBeenCalledTimes(1);
  });

  it('counts.animal=上限 → 白天不再发 onSpawnAnimal', () => {
    const w = new FakeWorld(() => 40);
    w.layGround(BLOCK.GRASS);
    const sp = new Spawner(w, { groundY: () => 40, rng: () => 0.7 });
    const a = vi.fn();
    sp.onSpawnAnimal(a);
    for (let i = 0; i < 4; i++) sp.tick(0.5, P, false, { animal: 24, monster: 0 });
    expect(a).not.toHaveBeenCalled();
  });
});

describe('Spawner 动物地面过滤', () => {
  it('groundY 海平面下(SEA_LEVEL-2)不刷动物', () => {
    // 注意：groundY 是「脚底站立高度」，其下 y-1 为支撑块；sea_level 以下必拒
    const deep = new Spawner(new FakeWorld(() => 0), {
      groundY: () => SEA_LEVEL - 2,
      rng: () => 0.42,
    });
    const a = vi.fn();
    deep.onSpawnAnimal(a);
    for (let i = 0; i < 10; i++) deep.tick(0.5, P, false, ZERO_COUNTS);
    expect(a).not.toHaveBeenCalled();

    // 对照：地表抬到海平面之上且铺草 → 放行（rng 相同证明差异来自高度门槛）
    const wHi = new FakeWorld(() => 40);
    wHi.layGround(BLOCK.GRASS);
    const high = new Spawner(wHi, { groundY: () => 40, rng: () => 0.42 });
    const a2 = vi.fn();
    high.onSpawnAnimal(a2);
    high.tick(0.5, P, false, ZERO_COUNTS);
    // rng=0.42 → 一群 3 只（herdSize=2+floor(0.42*3)，平地全合格）
    expect(a2).toHaveBeenCalledTimes(3);
  });

  it('地面非 GRASS 不刷动物；自定义 spawnAnimalOnGround 可接管判定', () => {
    const wStone = new FakeWorld(() => 40);
    wStone.layGround(BLOCK.STONE); // 同高度但表面是石头
    const bare = new Spawner(wStone, { groundY: () => 40, rng: () => 0.7 });
    const a = vi.fn();
    bare.onSpawnAnimal(a);
    for (let i = 0; i < 8; i++) bare.tick(0.5, P, false, ZERO_COUNTS);
    expect(a).not.toHaveBeenCalled();

    const custom = new Spawner(wStone, {
      groundY: () => 40,
      rng: () => 0.7,
      spawnAnimalOnGround: () => true, // 如沙漠生物群系放行沙地
    });
    const a2 = vi.fn();
    custom.onSpawnAnimal(a2);
    custom.tick(0.5, P, false, ZERO_COUNTS);
    // rng=0.7 → 物种 sheep，herdSize=2+floor(0.7*3)=4（成员全合格）
    expect(a2).toHaveBeenCalledTimes(4);
  });
});

describe('Spawner 怪物环带采样合法性', () => {
  it('cb 坐标水平距玩家 ∈ [24,40]，脚下方实心、身位两格悬空', () => {
    const origin: Vec3 = { x: 100.5, y: 40, z: -50.5 };
    const w = new FakeWorld(() => 40);
    w.layGround(BLOCK.STONE);
    const sp = new Spawner(w, { groundY: () => 40, rng: Math.random });
    const seen: Vec3[] = [];
    sp.onSpawnMonster((p) => seen.push(p));
    for (let i = 0; i < 30 && seen.length < 5; i++) {
      sp.tick(0.5, origin, true, ZERO_COUNTS);
    }
    expect(seen.length).toBeGreaterThan(0);
    for (const p of seen) {
      const d = Math.hypot(p.x - origin.x, p.z - origin.z);
      expect(d).toBeGreaterThanOrEqual(24);
      expect(d).toBeLessThanOrEqual(40);
      expect(w.isSolid(p.x, p.y - 1, p.z)).toBe(true);
      expect(w.isSolid(p.x, p.y, p.z)).toBe(false);
      expect(w.isSolid(p.x, p.y + 1, p.z)).toBe(false);
    }
  });

  it('身位被堵时绝不产出落在实心里的坐标', () => {
    const w = new FakeWorld(() => 40);
    w.layGround(BLOCK.STONE);
    for (let x = -48; x <= 48; x++) {
      for (let z = -48; z <= 48; z++) {
        w.addSolid(x, 40, z); // 占死脚位
        w.addSolid(x, 41, z); // 占死头位
      }
    }
    const sp = new Spawner(w, { groundY: () => 40, rng: Math.random });
    const leaked: Vec3[] = [];
    sp.onSpawnMonster((p) => leaked.push(p));
    for (let i = 0; i < 20; i++) sp.tick(0.5, P, true, ZERO_COUNTS);
    for (const p of leaked) {
      expect(w.isSolid(p.x, p.y, p.z)).toBe(false);
      expect(w.isSolid(p.x, p.y + 1, p.z)).toBe(false);
    }
  });
});

describe('shouldDespawn', () => {
  it('49m → true / 47m → false / 48m 阈值本身不算超界', () => {
    const o: Vec3 = { x: 0, y: 0, z: 0 };
    expect(shouldDespawn({ x: 49, y: 0, z: 0 }, o)).toBe(true);
    expect(shouldDespawn({ x: 47, y: 0, z: 0 }, o)).toBe(false);
    expect(shouldDespawn({ x: 48, y: 0, z: 0 }, o)).toBe(false);
  });

  it('三维距离计入 y 分量；dist 可自定义', () => {
    const o: Vec3 = { x: 0, y: 0, z: 0 };
    expect(shouldDespawn({ x: 45, y: 0, z: 15 }, o)).toBe(false); // √2250≈47.4 < 48
    expect(shouldDespawn({ x: 45, y: 10, z: 15 }, o)).toBe(true); // √2350≈48.5 > 48（y 计入）
    expect(shouldDespawn({ x: 30, y: 0, z: 0 }, o, 31)).toBe(false);
    expect(shouldDespawn({ x: 32, y: 0, z: 0 }, o, 31)).toBe(true);
  });
});
