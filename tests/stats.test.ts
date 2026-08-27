// T61 生存数值系统单测——固定 dt 步进模拟，数值全部对照 architecture.md §2.8 冻结表。
import { describe, expect, it } from 'vitest';
import { StatsSystem } from '../src/survival/stats';
import type { BusLike, PlayerLike } from '../src/survival/stats';

/** 冻结数值复述（来自 architecture.md §2.8 L87-L90 与 constants.ts 的重力） */
const G = 24;
const JUMP_COST = 0.05;
const REGEN_PERIOD = 3;

type Payload = { v?: number; amount?: number };
type Log = Record<string, Payload[]>;

/** 可编程 mock 玩家：字段全部公开可写，位置/速度/接地状态由测试直接驱动 */
function makePlayer(o?: Partial<PlayerLike>): PlayerLike {
  return {
    pos: { x: 0, y: 0, z: 0 },
    vel: { y: 0 },
    onGround: true,
    sprinting: false,
    hp: 20,
    hunger: 20,
    ...o,
  };
}

/** 收集事件的 bus spy */
function makeSpy(): { bus: BusLike; log: Log } {
  const log: Log = {};
  const bus: BusLike = {
    emit(k: string, p: unknown): void {
      (log[k] ??= []).push(p as Payload);
    },
  };
  return { bus, log };
}

/** 以固定步长推进模拟秒数；stepFn 在每次 stats.tick 之前被调用（用于驱动移动等输入） */
function run(
  stats: StatsSystem,
  seconds: number,
  dt: number,
  stepFn?: () => void,
): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    stepFn?.();
    stats.tick(dt);
  }
}

/**
 * 从「给定撞击竖直速度」落地的最小场景：
 * 帧 A：滞空末帧，系统把该速度缓存为上帧速度；
 * 帧 B：落地帧，模拟碰撞解算的行为（vel.y 清零、onGround 置真）。
 * 注意不用 4 位小数的 -13.856 字面量测 4 格落差：它实际对应 3.9998 格（伤害 0），
 * 这里统一用闭式解 v=sqrt(2gh) 保证落在边界点上。
 */
function landAt(p: PlayerLike, stats: StatsSystem, impactVy: number, dt = 0.05): number {
  p.onGround = false;
  p.vel.y = impactVy;
  stats.tick(dt);
  const hpBefore = p.hp;
  p.onGround = true;
  p.vel.y = 0; // 触地被碰撞解算归零
  stats.tick(dt);
  return hpBefore;
}

describe('StatsSystem 饥饿消耗', () => {
  it('疾跑且行走 10s：消耗 (0.08+0.01)*10=0.9', () => {
    const p = makePlayer();
    const { bus, log } = makeSpy();
    const stats = new StatsSystem(p, bus);
    // 以疾跑速度前进（每帧位移远超 0.001 判定阈值）
    run(stats, 10, 0.05, () => {
      p.sprinting = true;
      p.onGround = true;
      p.pos.x += 5.8 * 0.05;
    });
    expect(Math.abs(p.hunger - (20 - 0.9))).toBeLessThan(0.02);
    expect(log.hunger!.length).toBeGreaterThan(0);
  });

  it('原地不动 10s 不消耗（无水平位移则不算行走）', () => {
    const p = makePlayer();
    const { bus } = makeSpy();
    const stats = new StatsSystem(p, bus);
    run(stats, 10, 0.05);
    expect(p.hunger).toBe(20);
  });

  it('仅疾跑不位移（贴墙顶住）：只按 0.08/s 计 10s = 0.8', () => {
    const p = makePlayer();
    const { bus } = makeSpy();
    const stats = new StatsSystem(p, bus);
    run(stats, 10, 0.05, () => {
      p.sprinting = true;
    });
    expect(Math.abs(p.hunger - (20 - 0.8))).toBeLessThan(0.02);
  });

  it('仅行走非疾跑 10s：按 0.01/s 计 = 0.1', () => {
    const p = makePlayer();
    const { bus } = makeSpy();
    const stats = new StatsSystem(p, bus);
    run(stats, 10, 0.05, () => {
      p.pos.x += 4.3 * 0.05;
    });
    expect(Math.abs(p.hunger - (20 - 0.1))).toBeLessThan(0.02);
  });

  it('跳跃：notifyJump 每次 -0.05，5 次 = 0.25', () => {
    const p = makePlayer();
    const { bus, log } = makeSpy();
    const stats = new StatsSystem(p, bus);
    for (let i = 0; i < 5; i++) {
      stats.notifyJump();
      expect(log.hunger?.at(-1)?.v).toBeCloseTo(20 - JUMP_COST * (i + 1), 9);
    }
    expect(Math.abs(p.hunger - (20 - 0.25))).toBeLessThan(1e-9);
  });
});

describe('StatsSystem 再生（hunger≥18 每 3s 回 1HP 耗 0.5）', () => {
  it('周期触发与停止：19 起，hp 15 → 18、hunger 止于 17.5 后不再回', () => {
    const p = makePlayer({ hunger: 19, hp: 15 });
    const { bus, log } = makeSpy();
    const stats = new StatsSystem(p, bus);
    run(stats, 30, 0.05);
    // t=3 hp16/hunger18.5、t=6 hp17/hunger18、t=9 hp18/hunger17.5，随后 hunger<18 全停
    expect(p.hp).toBe(18);
    expect(Math.abs(p.hunger - 17.5)).toBeLessThan(1e-9);
    const regenEvents = log.hp!.filter((e) => (e.v ?? 0) > 15).length;
    expect(regenEvents).toBe(3);
  });

  it('边界 17 分界：hunger=17 完全不回血；hunger=18 正常回血', () => {
    const low = makePlayer({ hunger: 17, hp: 10 });
    const lowSys = new StatsSystem(low, makeSpy().bus);
    run(lowSys, 10, 0.05);
    expect(low.hp).toBe(10);

    const ok = makePlayer({ hunger: 18, hp: 10 });
    const okSys = new StatsSystem(ok, makeSpy().bus);
    run(okSys, REGEN_PERIOD, 0.05);
    expect(ok.hp).toBe(11);
  });

  it('固定 dt 下周期计时不漂移：dt=0.12345 推进累计时间恰好回 10 次', () => {
    const p = makePlayer({ hunger: 20, hp: 5 });
    const { bus, log } = makeSpy();
    const stats = new StatsSystem(p, bus);
    // 每帧把饥饿补满，规避「再生本身会烧饥饿、5 次后自然低于 18」的停机路径，
    // 这样才能专注验证计时器精度。
    // 步数取自真实边界：0.12345×244 ≈ 30.122s ≥ 第 10 个 3s 周期
    // （30/0.12345 本身不是整数步，取能跨过边界的最小整数步）
    run(stats, 0.12345 * 244, 0.12345, () => {
      p.hunger = 20;
    });
    expect(log.hp!.length).toBe(10);
    expect(p.hp).toBe(15);
  });

  it('满血时不空转烧饥饿', () => {
    const p = makePlayer({ hunger: 19, hp: 20 });
    const stats = new StatsSystem(p, makeSpy().bus);
    run(stats, 12, 0.05);
    expect(Math.abs(p.hunger - 19)).toBeLessThan(1e-9);
  });
});

describe('StatsSystem 饿伤（hunger≤0 每 4s 扣 1HP 至最低 1）', () => {
  it('100s：hp 从 20 逐步扣到 1 为止，death 不发（饿不死）', () => {
    const p = makePlayer({ hunger: 0, hp: 20 });
    const { bus, log } = makeSpy();
    const stats = new StatsSystem(p, bus);
    run(stats, 100, 0.05);
    // 4,8,…,76s 共 19 次扣减到 1；之后因下限守卫不再扣（80s 处也不发）
    expect(p.hp).toBe(1);
    expect(log.hp!.filter((e) => e.v !== undefined).length).toBeGreaterThanOrEqual(19);
    expect(log.death).toBeUndefined();
    // 前 4s 内不得提前扣血
    expect(log.hp![0]!.v).toBe(19);
  });

  it('恢复进食即中断饿伤计时', () => {
    const p = makePlayer({ hunger: 0, hp: 5 });
    const { bus } = makeSpy();
    const stats = new StatsSystem(p, bus);
    run(stats, 2, 0.05); // 计到 2/4，未扣
    stats.eat(5); // 恢复进食
    run(stats, 10, 0.05); // 即使再过 10s（未到饥饿 0）也不再扣
    expect(p.hp).toBe(5);
  });
});

describe('StatsSystem 摔落伤（落差 = v²/(2g)，超出 3 格每格 1 点）', () => {
  it('安全落差：恰好 3 格不掉血', () => {
    const p = makePlayer();
    const stats = new StatsSystem(p, makeSpy().bus);
    const before = landAt(p, stats, -Math.sqrt(2 * G * 3));
    expect(before).toBe(20);
    expect(p.hp).toBe(20);
  });

  it('2 格落差不掉血', () => {
    const p = makePlayer();
    const stats = new StatsSystem(p, makeSpy().bus);
    landAt(p, stats, -Math.sqrt(2 * G * 2));
    expect(p.hp).toBe(20);
  });

  it('4 格落差掉 1 血', () => {
    const p = makePlayer();
    const { bus, log } = makeSpy();
    const stats = new StatsSystem(p, bus);
    landAt(p, stats, -Math.sqrt(2 * G * 4));
    expect(p.hp).toBe(19);
    expect(log.damage?.[0]?.amount).toBe(1);
  });

  it('5 格落差掉 2 血（逐格累积）', () => {
    const p = makePlayer();
    const { bus, log } = makeSpy();
    const stats = new StatsSystem(p, bus);
    landAt(p, stats, -Math.sqrt(2 * G * 5));
    expect(p.hp).toBe(18);
    expect(log.damage?.[0]?.amount).toBe(2);
  });

  it('致死摔落：hp 打空只发一次 death；reset() 之后可再次死亡', () => {
    const p = makePlayer();
    const { bus, log } = makeSpy();
    const stats = new StatsSystem(p, bus);

    p.hp = 2;
    landAt(p, stats, -Math.sqrt(2 * G * 6)); // 3 点伤害 > 剩余 2 血
    expect(p.hp).toBe(0);
    expect(log.death?.length).toBe(1);

    // 再次摔落不该重复发 death（deadFired 已置位）
    p.hp = 3;
    landAt(p, stats, -Math.sqrt(2 * G * 6));
    expect(log.death?.length).toBe(1);

    // 重生流程：外部把玩家状态拉回出生点满状态，再调 reset() 清 flag
    p.onGround = true;
    p.vel.y = 0;
    p.hunger = 20;
    stats.reset();

    // 再次受到致死伤害：这次死亡应能再次触发
    p.hp = 3;
    p.onGround = false;
    p.vel.y = -Math.sqrt(2 * G * 6);
    stats.tick(0.05);
    p.onGround = true;
    p.vel.y = 0;
    stats.tick(0.05);
    expect(p.hp).toBe(0);
    expect(log.death?.length).toBe(2);
  });
});

describe('StatsSystem 进食与状态', () => {
  it('eat：15+3=18；eat(5) 上限夹到 20', () => {
    const p = makePlayer({ hunger: 15 });
    const { bus, log } = makeSpy();
    const stats = new StatsSystem(p, bus);
    stats.eat(3);
    expect(p.hunger).toBe(18);
    stats.eat(5);
    expect(p.hunger).toBe(20);
    expect(log.hunger?.map((e) => e.v)).toEqual([18, 20]);
  });

  it('reset() 清饿伤计时器：重置后必须重新计满 4s 才扣血', () => {
    const p = makePlayer({ hunger: 0, hp: 5 });
    const { bus } = makeSpy();
    const stats = new StatsSystem(p, bus);
    run(stats, 2, 0.05); // 计时到 2/4
    stats.reset();
    run(stats, 3, 0.05); // 若计时器未被清除此时应已扣血
    expect(p.hp).toBe(5);
    stats.tick(0.05 * 20); // 补满 4s（3 + 1）
    expect(p.hp).toBe(4);
  });

  it('reset() 清再生计时器：重置后再计满 3s 才回血', () => {
    const p = makePlayer({ hunger: 19, hp: 15 });
    const { bus } = makeSpy();
    const stats = new StatsSystem(p, bus);
    run(stats, 2.5, 0.05); // 2.5/3 未触发
    stats.reset();
    run(stats, 2.5, 0.05); // 未清除的话这里应已回 1HP
    expect(p.hp).toBe(15);
    stats.tick(0.05 * 10); // 补满 3s
    expect(p.hp).toBe(16);
  });

  it('事件携带新值且变化才发射', () => {
    const p = makePlayer();
    const { bus, log } = makeSpy();
    const stats = new StatsSystem(p, bus);
    stats.eat(0); // 无变化
    run(stats, 0.5, 0.05); // 静止无消耗
    expect(log.hunger).toBeUndefined();
    expect(log.hp).toBeUndefined();
    stats.notifyJump();
    expect(log.hunger?.[0]).toEqual({ v: 19.95 });
  });
});
