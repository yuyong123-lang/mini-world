// T81 动物 AI 测试：node 环境 + 内存平地世界 + 受控 rng/clock，全程无渲染依赖
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/core/types';
import { mulberry32 } from '../src/core/rng';
import { Animal, pigDrops } from '../src/entities/animals';
import type { DropLike, EntityCtx } from '../src/entities/entity';

/** 地表整数面 y=SURFACE（其下体素行 y<=GROUND_ROW 实心） */
const SURFACE = 10;
const GROUND_ROW = SURFACE - 1;

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

/** 内存体素世界：无限平地 + Set 记录的额外实心块（墙/围栏） */
class SetWorld {
  readonly solids = new Set<string>();

  add(x: number, y: number, z: number): void {
    this.solids.add(key(x, y, z));
  }

  isSolid(x: number, y: number, z: number): boolean {
    if (y <= GROUND_ROW) return true;
    return this.solids.has(key(x, y, z));
  }
}

interface Bundle {
  ctx: EntityCtx;
  world: SetWorld;
  drops: DropLike[];
}

function makeCtx(playerPos?: Vec3): Bundle {
  const world = new SetWorld();
  const drops: DropLike[] = [];
  const t = { now: 0 };
  return {
    world,
    drops,
    ctx: {
      world,
      playerPos: playerPos ?? { x: 5000, y: SURFACE, z: 5000 }, // 默认远离，不触发任何 flee 方向干扰
      tryPickup: () => true,
      drops,
      now: () => t.now,
    },
  };
}

/**
 * 脚本化 rng：循环吐出给定序列。
 * Animal 消耗顺序：构造器 idle 时长 → 初始朝向；此后每轮 enterIdle/enterWander
 * 再各消耗「时长、朝向」一次。据此可用固定值锁定状态时长与漫游朝向。
 */
function scriptRng(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i++;
    return v;
  };
}

const DT = 1 / 60;

describe('T81 动物状态机', () => {
  it('1. 构造后处于 idle：静止不动，水平速度为 0', () => {
    const { ctx } = makeCtx();
    const a = new Animal({ x: 0, y: SURFACE, z: 0 });

    for (let i = 0; i < 30; i++) a.tick(DT, ctx); // 前 0.5s 必然还在 idle（时长下限 1s）

    expect(a.state).toBe('idle');
    expect(Math.abs(a.vel.x)).toBeLessThan(1e-9);
    expect(Math.abs(a.vel.z)).toBeLessThan(1e-9);
    expect(Math.abs(a.pos.y - SURFACE)).toBeLessThan(1e-6); // 站在地表
  });

  it('2. idle 计时结束后进入 wander：产生水平位移', () => {
    const { ctx } = makeCtx();
    // rng 序列：idle 时长取下限 1s（首值 0）→ 朝向 0.25 ⇒ 东向；wander 时长上限 4s
    const a = new Animal({ x: 0, y: SURFACE, z: 0 }, scriptRng([0, 0.25, 1, 0.25]));
    for (let i = 0; i < 15; i++) a.tick(DT, ctx);
    const before = { x: a.pos.x, z: a.pos.z };

    for (let i = 0; i < 120; i++) a.tick(DT, ctx); // 推进 2s，跨越 idle 下限

    expect(a.state).toBe('wander');
    const dist = Math.hypot(a.pos.x - before.x, a.pos.z - before.z);
    expect(dist).toBeGreaterThan(0.5); // 速度 1.2 × 约 1s 实际行走时间
  });

  it('3a. hurt 后进入 flee：位移带向西分量（玩家在东边）；3 秒后退回非 flee 态', () => {
    const { ctx } = makeCtx();
    const a = new Animal({ x: 0, y: SURFACE, z: 0 }, mulberry32(12345));

    a.tick(DT, ctx);
    const startX = a.pos.x;
    a.hurt(2, { x: startX + 10, y: SURFACE, z: 0 }); // 攻击源在正东

    expect(a.state).toBe('flee');

    let minX = a.pos.x;
    for (let i = 0; i < 90; i++) {
      a.tick(DT, ctx); // 1.5s 的逃跑
      minX = Math.min(minX, a.pos.x);
    }
    // 玩家在东边 ⇒ 远离玩家的水平向朝西 ⇒ 动物应明显西移（x 减小）
    expect(minX).toBeLessThan(startX - 1);
    expect(a.state).toBe('flee');

    // 继续推进超过 fleeTimer 剩余时间（共 >3s），应回到 wander
    for (let i = 0; i < 120; i++) a.tick(DT, ctx);
    expect(a.state).toBe('wander');
    expect(a.hp).toBe(8); // 只扣了这一次血
  });

  it('3b. flee 方向逐帧指向远离玩家的一侧', () => {
    const { ctx } = makeCtx();
    const a = new Animal({ x: 0, y: SURFACE, z: 0 });
    a.hurt(2, { x: 10, y: SURFACE, z: 0 }); // 玩家在东

    // 中途把玩家瞬移到西侧：下一帧逃离方向必须翻转为向东
    for (let i = 0; i < 10; i++) a.tick(DT, ctx);
    ctx.playerPos = { x: -50, y: SURFACE, z: 0 };
    const xBefore = a.pos.x;
    for (let i = 0; i < 30; i++) a.tick(DT, ctx);

    expect(a.pos.x).toBeGreaterThan(xBefore + 1); // 向东逃跑 = 远离新位置
  });

  it('4. 击杀：hurt(99) 后一次 tick 内掉落 ITEM_RAW_PORK（count 1 或 2）且 dead=true', () => {
    const { ctx, drops } = makeCtx();
    const a = new Animal({ x: 0, y: SURFACE, z: 0 }, mulberry32(7));

    a.hurt(99, { x: 5, y: SURFACE, z: 0 });
    expect(a.dead).toBe(true);
    expect(drops.length).toBe(0); // 死亡处理发生在下一次 tick，而非 hurt 内部

    a.tick(DT, ctx);

    expect(drops.length).toBeGreaterThan(0);
    const pork = drops.filter((d) => d.stack.key === 'ITEM_RAW_PORK');
    expect(pork.length).toBe(drops.length); // 全部都是猪肉
    for (const d of pork) {
      expect([1, 2]).toContain(d.stack.count);
      expect(d.dead).toBe(false);
      expect(d.age).toBe(0);
      expect(d.pos.y).toBeCloseTo(SURFACE + 0.5, 5); // 悬在尸体上方半格
    }
    // 幂等：再 tick 多帧不会重复掉落
    for (let i = 0; i < 30; i++) a.tick(DT, ctx);
    expect(drops.length).toBe(pork.length);
  });

  it('4b. pigDrops 是纯函数：roll<0.5 得 1 块，否则 2 块', () => {
    expect(pigDrops(0.49)[0]).toEqual({ key: 'ITEM_RAW_PORK', count: 1 });
    expect(pigDrops(0.5)[0]).toEqual({ key: 'ITEM_RAW_PORK', count: 2 });
    expect(pigDrops(0)[0].count).toBe(1);
    expect(pigDrops(0.999)[0].count).toBe(2);
  });

  it('5. 跳障：wander 朝向前方一格墙 → 起跳并翻上墙顶', () => {
    const { ctx, world } = makeCtx();
    const WALL_X = 20;
    // 一格高的长墙：占据体素行 y=SURFACE（脚位层），头顶层空 ⇒ 可跳不可堵
    for (let x = WALL_X; x <= WALL_X + 6; x++) {
      for (let z = -8; z <= 8; z++) world.add(x, SURFACE, z);
    }

    // rng 锁定：idle 恰 1s → 朝向 0.25*TAU=PI/2 ⇒ 正东(+x)；wander 4s 且续向东
    const a = new Animal(
      { x: WALL_X - 2.5, y: SURFACE, z: 0 },
      scriptRng([0, 0.25, 1, 0.25]),
    );

    let maxVy = 0;
    let maxY = a.pos.y;
    for (let i = 0; i < 300; i++) {
      a.tick(DT, ctx);
      maxVy = Math.max(maxVy, a.vel.y);
      maxY = Math.max(maxY, a.pos.y);
    }

    expect(maxVy).toBeGreaterThan(4); // 触发了 JUMP_SPEED*0.9 ≈ 7.56
    expect(maxY).toBeGreaterThan(SURFACE + 0.5); // 真的越上了墙顶附近高度
  });

  it('6. 卡死换向：困在封闭围栏内持续存活且方向被强制改变', () => {
    const { ctx, world } = makeCtx();
    // 3×3 内空间的封闭围栏：地板已有，四周两格高墙体（头位被堵 ⇒ 无法跳出）
    for (let y = SURFACE; y <= SURFACE + 1; y++) {
      for (let d = -2; d <= 2; d++) {
        world.add(-2, y, d); world.add(2, y, d); // x = ±2 两面墙
        world.add(d, y, -2); world.add(d, y, 2); // z = ±2 两面墙
      }
    }

    // rng 锁定 wander 首次朝向东北向（直接撞墙）；后续值随意
    const a = new Animal({ x: 0, y: SURFACE, z: 0 }, mulberry32(999));
    (a as unknown as { dirX: number }).dirX = Math.SQRT1_2;
    (a as unknown as { dirZ: number }).dirZ = Math.SQRT1_2;

    let lastYaw = a.facingYaw;
    let flips = 0;
    for (let i = 0; i < 60 * 8; i++) {
      // 8 秒：足够跨过多个 0.8s 卡死窗口
      a.tick(DT, ctx);
      if (Math.abs(a.facingYaw - lastYaw) > 1e-9) {
        flips++;
        lastYaw = a.facingYaw;
      }
    }

    expect(a.dead).toBe(false); // 没有穿墙逃逸也没有死亡
    expect(a.hp).toBe(10);
    expect(flips).toBeGreaterThanOrEqual(2); // 卡死检测至少两次强制换向
    // 且始终被困在围栏内部
    expect(Math.abs(a.pos.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(a.pos.z)).toBeLessThanOrEqual(2);
  });
});
