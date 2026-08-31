// T43 掉落物实体测试：node 环境，全部依赖用内存 mock
import { beforeEach, describe, expect, it } from 'vitest';
import { GRAVITY } from '../src/core/constants';
import type { ItemStack, Vec3 } from '../src/core/types';
import {
  BOUNCE_RESTITUTION,
  DROP_LIFETIME_S,
  DropEntity,
} from '../src/entities/drops';
import type { DropLike, EntityCtx } from '../src/entities/entity';

/** 地表高度：体素行 y<=SURFACE_ROW 实心，其顶面恰为整数面 y=SURFACE */
const SURFACE = 10;
const SURFACE_ROW = SURFACE - 1;

/** 内存平地世界：地表整数面 y=10 */
class FlatWorld {
  isSolid(x: number, y: number, z: number): boolean {
    void x; void z;
    return y <= SURFACE_ROW;
  }
}

interface CtxBundle {
  ctx: EntityCtx;
  /** 测试侧持有的强类型实体列表（与 ctx.drops 同步增删；DropLike 无 tick 签名） */
  entities: DropEntity[];
  /** tryPickup 的返回值（默认 true）与调用记录 */
  pickup: { result: boolean; calls: DropLike[] };
  clock: { t: number };
}

function makeCtx(playerPos: Vec3, opts?: { pickupResult?: boolean }): CtxBundle {
  const clock = { t: 1000 };
  const pickup = { result: opts?.pickupResult ?? true, calls: [] as DropLike[] };
  const bundle: CtxBundle = {
    pickup,
    clock,
    entities: [],
    ctx: {
      world: new FlatWorld(),
      playerPos: { ...playerPos },
      tryPickup(drop) {
        pickup.calls.push(drop);
        return pickup.result;
      },
      drops: [],
      // 受控时钟：每推进一帧由测试手动步进；DropEntity 当前不消费该值（见 entity.ts 说明）
      now() {
        return clock.t;
      },
    },
  };
  return bundle;
}

function spawn(ctx: EntityCtx, entities: DropEntity[], pos: Vec3, stack: ItemStack): DropEntity {
  const d = new DropEntity(pos, stack);
  ctx.drops.push(d as unknown as DropLike);
  entities.push(d);
  return d;
}

const DT = 1 / 60;

/** 前进 n 帧（同步实体时钟并模拟 main 的死亡清理） */
function advance(b: CtxBundle, n: number, dt = DT): void {
  for (let i = 0; i < n; i++) {
    b.clock.t += dt * 1000;
    for (const d of [...b.entities]) d.tick(dt, b.ctx);
    const alive = b.entities.filter((d) => !d.dead);
    b.entities.length = 0;
    b.entities.push(...alive);
    b.ctx.drops.length = 0;
    (b.ctx.drops as DropLike[]).push(...(alive as unknown as DropLike[]));
  }
}

function vec(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

/** 与玩家保持极远距离，避免磁吸/拾取干扰 */
const FAR_PLAYER = vec(1000, SURFACE, 1000);

describe('DropEntity 物理', () => {
  let b: CtxBundle;
  beforeEach(() => {
    b = makeCtx(FAR_PLAYER);
  });

  it('从 y=15 自由落体：若干 tick 后落地在整数面 y=10 且 onGround=true', () => {
    const d = spawn(b.ctx, b.entities, vec(0, 15, 0), { key: 'ITEM_DIRT', count: 1 });

    let landed = false;
    for (let i = 0; i < 400; i++) {
      advance(b, 1);
      if (!d.dead && d.onGround) {
        landed = true;
        break;
      }
    }
    expect(landed).toBe(true);
    expect(Number.isInteger(d.pos.y)).toBe(true);
    expect(Math.abs(d.pos.y - SURFACE)).toBeLessThan(1e-9);
    // 静置后持续贴地且速度归零
    advance(b, 60);
    expect(d.onGround).toBe(true);
    expect(Math.abs(d.pos.y - SURFACE)).toBeLessThan(1e-9);
    expect(d.vel.y).toBe(0);
    expect(d.dead).toBe(false); // 远离玩家不会被拾取
  });

  it('弹跳：落地瞬间速度反向衰减为冲击的 40%（能量损失）', () => {
    const d = spawn(b.ctx, b.entities, vec(0, 15, 0), { key: 'ITEM_DIRT', count: 1 });
    let bounced = false;
    let bounces = 0;
    for (let i = 0; i < 400 && bounces < 1; i++) {
      const vyBefore = d.vel.y;
      b.clock.t += DT * 1000;
      d.tick(DT, b.ctx);
      // 首次出现「下落冲入地 → 向上弹出」即为弹跳
      if (!bounced && d.onGround === false && d.vel.y > 0 && vyBefore < 0) {
        bounced = true;
        bounces++;
        const impact = vyBefore + GRAVITY * DT; // 重力先于碰撞求解施加
        expect(d.vel.y).toBeCloseTo(-impact * BOUNCE_RESTITUTION, 10);
        expect(Math.abs(d.vel.y)).toBeLessThan(Math.abs(impact));
        expect(Math.abs(d.pos.y - SURFACE)).toBeLessThan(1e-6); // 从地面反弹
      }
    }
    expect(bounced).toBe(true);
    // 弹跳数次后终将静止
    advance(b, 400);
    expect(d.onGround).toBe(true);
    expect(d.vel.y).toBe(0);
  });

  it('水平摩擦：水平初速按帧率无关的指数率快速衰减到接近零', () => {
    const d = spawn(b.ctx, b.entities, vec(0, SURFACE, 0), { key: 'ITEM_DIRT', count: 1 });
    d.vel.x = 5;
    advance(b, 60); // 1 秒
    expect(d.onGround).toBe(true);
    expect(Math.abs(d.vel.x)).toBeLessThan(0.05);
  });
});

describe('DropEntity 磁吸与拾取', () => {
  it('进入 1.5 磁吸半径后逐帧向玩家位移，最终 <0.6 触发拾取并置 dead', () => {
    const p = vec(0, SURFACE, 0);
    const b = makeCtx(p);
    const d = spawn(b.ctx, b.entities, vec(p.x + 1.4, SURFACE, p.z), { key: 'ITEM_COAL', count: 2 });

    // 冷却期（age<0.5）内不吸附
    advance(b, 30 - 5); // ~25 帧，仍未满冷却
    const distToPlayer = () => Math.hypot(d.pos.x - p.x, d.pos.y - p.y, d.pos.z - p.z);
    const beforeCooldownEnd = distToPlayer();
    advance(b, 1);
    expect(beforeCooldownEnd).toBeCloseTo(1.4, 6);

    // 冷却结束后开始收敛（位移式磁吸：8 格/s 直线飞向玩家，约 6 帧到达拾取距离）
    const samples: number[] = [];
    let pickedUp = false;
    for (let i = 0; i < 600 && !pickedUp; i++) {
      advance(b, 1);
      if (d.dead) {
        pickedUp = true;
        break;
      }
      samples.push(distToPlayer());
    }
    expect(pickedUp).toBe(true);
    // 位移式吸附收敛很快（≤8 格/s），应在 ~20 帧内完成而非长时间拖尾
    expect(samples.length).toBeLessThanOrEqual(20);
    // 有位移的帧几乎全部更近（最后进入拾取半径的帧可能被剩余距离钳制持平）
    const moved = samples.filter((v, i) => i > 0 && v !== samples[i - 1]);
    const decreased = moved.filter((v, i) => i > 0 && v < moved[i - 1]).length;
    expect(decreased).toBeGreaterThanOrEqual(moved.length - 1);
    expect(distToPlayer()).toBeLessThanOrEqual(0.6);
    expect(b.pickup.calls.length).toBeGreaterThanOrEqual(1);
    expect(b.pickup.calls[0].stack.key).toBe('ITEM_COAL');
    expect(b.ctx.drops.filter((x) => !x.dead).length).toBe(0); // 已被外部清理
  });

  it('冷却期内（age<0.5）即使处于磁吸范围也不移动、不触发拾取', () => {
    const p = vec(0, SURFACE, 0);
    const b = makeCtx(p);
    const d = spawn(b.ctx, b.entities, vec(p.x + 0.3, SURFACE, p.z), { key: 'ITEM_COAL', count: 1 }); // 已在 0.6 内

    advance(b, 20); // age≈0.33
    expect(d.dead).toBe(false);
    expect(b.pickup.calls.length).toBe(0);
    expect(d.pos.x).toBeCloseTo(p.x + 0.3, 6);
  });

  it('tryPickup 返回 false（背包满）：不置 dead，继续 tick 可重试且不死循环', () => {
    const p = vec(0, SURFACE, 0);
    const b = makeCtx(p, { pickupResult: false });
    const d = spawn(b.ctx, b.entities, vec(p.x + 0.2, SURFACE, p.z), { key: 'ITEM_STONE', count: 1 });

    expect(() => advance(b, 240)).not.toThrow(); // 4 秒连续重试
    expect(d.dead).toBe(false);
    expect(b.pickup.calls.length).toBeGreaterThan(100); // 每帧都在请求
    expect(d.onGround).toBe(true);
    expect(d.pos.y).toBeCloseTo(SURFACE, 6);
    // 恢复可拾取后下一帧即可入包
    b.pickup.result = true;
    advance(b, 5);
    expect(d.dead).toBe(true);
  });
});

describe('DropEntity 合堆', () => {
  it('同 key 且距离<0.5：过冷却后合并，count 相加、小者 dead', () => {
    const b = makeCtx(FAR_PLAYER);
    const a = spawn(b.ctx, b.entities, vec(0, SURFACE, 0), { key: 'ITEM_DIRT', count: 3 });
    const c = spawn(b.ctx, b.entities, vec(0.3, SURFACE, 0), { key: 'ITEM_DIRT', count: 5 });

    // 冷却期（前 1s）不合堆
    advance(b, 10); // age≈0.17
    expect(a.dead).toBe(false);
    expect(c.dead).toBe(false);
    expect(a.stack.count).toBe(3);
    expect(c.stack.count).toBe(5);

    let merged = false;
    for (let i = 0; i < 120 && !merged; i++) {
      advance(b, 1);
      merged = a.dead || c.dead;
    }
    expect(merged).toBe(true);
    const alive = [a, c].filter((x) => !x.dead);
    expect(alive.length).toBe(1);
    expect(alive[0].stack.key).toBe('ITEM_DIRT');
    expect(alive[0].stack.count).toBe(8);
  });

  it('异 key 距离再近也不合堆', () => {
    const b = makeCtx(FAR_PLAYER);
    const a = spawn(b.ctx, b.entities, vec(0, SURFACE, 0), { key: 'ITEM_DIRT', count: 3 });
    const c = spawn(b.ctx, b.entities, vec(0.1, SURFACE, 0), { key: 'ITEM_LOG', count: 5 });

    advance(b, 300); // 5 秒，远超冷却
    expect(a.dead).toBe(false);
    expect(c.dead).toBe(false);
    expect(a.stack.count).toBe(3);
    expect(c.stack.count).toBe(5);
  });

  it('相距超过 0.5 的同 key 掉落物不合堆', () => {
    const b = makeCtx(FAR_PLAYER);
    const a = spawn(b.ctx, b.entities, vec(0, SURFACE, 0), { key: 'ITEM_DIRT', count: 3 });
    const c = spawn(b.ctx, b.entities, vec(1.0, SURFACE, 0), { key: 'ITEM_DIRT', count: 5 });

    advance(b, 300);
    expect(a.dead).toBe(false);
    expect(c.dead).toBe(false);
    expect(a.stack.count).toBe(3);
    expect(c.stack.count).toBe(5);
  });
});

describe('DropEntity 寿命与受击', () => {
  it('despawn：存活累计达 300s 后置 dead（受控时钟 + 大步长迭代）', () => {
    const b = makeCtx(FAR_PLAYER);
    const d = spawn(b.ctx, b.entities, vec(0, SURFACE, 0), { key: 'ITEM_SAND', count: 1 });

    const step = 0.1;
    let frames = 0;
    while (!d.dead && frames < 3200) {
      b.clock.t += step * 1000;
      d.tick(step, b.ctx);
      frames++;
    }
    expect(d.dead).toBe(true);
    expect(d.age).toBeGreaterThanOrEqual(DROP_LIFETIME_S);
    expect(frames).toBeLessThanOrEqual(Math.ceil(DROP_LIFETIME_S / step) + 1);
    expect(d.view).toBeNull(); // 无视图登记时安全
  });

  it('hurt 对掉落物是空操作：不扣血、无击退、不动无敌帧、不抛错', () => {
    const b = makeCtx(FAR_PLAYER);
    const d = spawn(b.ctx, b.entities, vec(0, SURFACE, 0), { key: 'ITEM_DIRT', count: 1 });
    const snap = {
      pos: { ...d.pos },
      vel: { ...d.vel },
      hp: d.hp,
      dead: d.dead,
      invulUntil: d.invulUntil,
      stack: { ...d.stack },
    };

    expect(() => d.hurt(10, vec(1, 0, 1))).not.toThrow();
    expect(() => d.hurt(NaN)).not.toThrow();
    expect(() => d.hurt(99999, undefined)).not.toThrow();

    expect(d.hp).toBe(snap.hp);
    expect(d.dead).toBe(snap.dead);
    expect(d.invulUntil).toBe(snap.invulUntil);
    expect(d.pos).toEqual(snap.pos);
    expect(d.vel).toEqual(snap.vel);
    expect(d.stack).toEqual(snap.stack);
  });

  it('构造与视图挂钩：堆叠克隆、attachView/detachView 生效、aabb 派生正确', () => {
    const stack: ItemStack = { key: 'ITEM_LOG', count: 7 };
    const d = new DropEntity(vec(1, SURFACE, 2), stack);
    stack.count = 99; // 外部改动不得影响实体内部副本
    expect(d.stack).toEqual({ key: 'ITEM_LOG', count: 7 });
    expect(d.width).toBeCloseTo(0.25, 12);
    expect(d.height).toBeCloseTo(0.25, 12);

    const viewToken = { tag: 'mesh' };
    d.attachView(viewToken);
    expect(d.view).toBe(viewToken);
    expect(d.detachView()).toBe(viewToken);
    expect(d.view).toBeNull();
    expect(d.detachView()).toBeNull(); // 幂等

    const box = d.aabb();
    expect(box.minX).toBeCloseTo(1 - 0.125, 12);
    expect(box.maxX).toBeCloseTo(1 + 0.125, 12);
    expect(box.minY).toBeCloseTo(SURFACE, 12);
    expect(box.maxY).toBeCloseTo(SURFACE + 0.25, 12);
  });
});

// ---------------------------------------------------------------------------
// 拾取判定扩展：水平圆盘 + 垂直高差容差（台阶/坡地捡不起来的修复）
// ---------------------------------------------------------------------------

describe('DropEntity 高差拾取', () => {
  it('掉落物在高差 1 格的台阶上：玩家走过去仍可磁吸+拾取', () => {
    const p = vec(0, SURFACE, 0);
    const b = makeCtx(p);
    // 掉落物在玩家上方 1 格、水平 0.4（3D 距离 ≈1.08 —— 旧 3D 判定永远够不着）
    const d = spawn(b.ctx, b.entities, vec(p.x + 0.4, SURFACE + 1, p.z), { key: 'ITEM_LEATHER', count: 1 });

    advance(b, 40); // 越过冷却并推进
    expect(b.pickup.calls.length).toBeGreaterThanOrEqual(1);
    expect(d.dead).toBe(true);
  });

  it('掉落物在脚下 1 格（玩家站高处）：同样可拾取', () => {
    const p = vec(0, SURFACE, 0);
    const b = makeCtx(p);
    const d = spawn(b.ctx, b.entities, vec(p.x + 0.3, SURFACE - 1, p.z), { key: 'ITEM_WOOL', count: 1 });

    advance(b, 40);
    expect(b.pickup.calls.length).toBeGreaterThanOrEqual(1);
    expect(d.dead).toBe(true);
  });

});
