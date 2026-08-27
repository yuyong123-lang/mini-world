// T82 怪物 AI 测试：node 环境，全内存 mock（同 T43 手法：mock world Set + 可编程 playerPos
// + 受控时钟 + 构造注入确定性 rng）。
// 注意：Entity.hurt 的无敌帧用全局 nowMs()（performance.now），不走 ctx.now 注入口，
// 故用例 5 用真实 setTimeout(650ms) 跨过 0.5s 无敌窗。
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/core/types';
import { Monster } from '../src/entities/monsters';
import type { DropLike } from '../src/entities/entity';

/** 地表：体素行 y<=9 实心，其顶面为整数面 y=10（实体脚底锚点坐标） */
const SURFACE = 10;
const SURFACE_ROW = SURFACE - 1;

/** 内存世界：平地 + 按需放置的墙/围栏体素（key "x,y,z"） */
class MockWorld {
  walls = new Set<string>();
  add(x: number, y: number, z: number): void {
    this.walls.add(x + ',' + y + ',' + z);
  }
  isSolid(x: number, y: number, z: number): boolean {
    if (y <= SURFACE_ROW) return true;
    return this.walls.has(x + ',' + y + ',' + z);
  }
}

/** 受控随机序列：依次吐出，耗尽后循环（确定性重定向测试用） */
function makeRng(seq: number[]): () => number {
  let i = 0;
  return () => seq[i++ % seq.length];
}

interface AttackRecord {
  dmg: number;
  from: Vec3;
}

function vec(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

/** 测试环境包：world + 可编程玩家坐标 + 受控时钟 + attackPlayer spy */
function makeEnv(playerStart: Vec3, rngSeq?: number[]) {
  const world = new MockWorld();
  const clock = { t: 1_000_000 };
  const player: Vec3 = { ...playerStart };
  const attacks: AttackRecord[] = [];
  const ctx = {
    world,
    playerPos: player,
    tryPickup(_drop: DropLike): boolean {
      return false;
    },
    drops: [],
    now: () => clock.t,
    isNight: true,
  };
  const env = {
    ctx,
    world,
    clock,
    player,
    attacks,
    setPlayer(x: number, y: number, z: number): void {
      player.x = x;
      player.y = y;
      player.z = z;
    },
  };
  const spawnMonster = (): Monster => {
    const m = new Monster(vec(0, SURFACE, 0), rngSeq ? { rng: makeRng(rngSeq) } : undefined);
    // 统一接线 attackPlayer spy；不接线的用例改用裸 new（见未接线用例）
    m.attackPlayer = (dmg: number, from: Vec3) => {
      attacks.push({ dmg, from });
    };
    return m;
  };
  return { ...env, spawnMonster };
}

type Env = ReturnType<typeof makeEnv>;

const DT = 1 / 60;

/** 前进 n 帧：推进受控时钟并逐帧 tick；onFrame 可选逐帧采样 */
function advance(env: Env, m: Monster, n: number, onFrame?: (i: number) => void, dt = DT): void {
  for (let i = 0; i < n; i++) {
    env.clock.t += dt * 1000;
    m.tick(dt, env.ctx);
    if (onFrame) onFrame(i);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 玩家极远处坐标，避免误触发 chase */
const FAR = vec(400, SURFACE, 400);

describe('T82 怪物 AI', () => {
  it('1. 白天消散：白天累计满 2s 置 dead', () => {
    const env = makeEnv(FAR);
    const m = env.spawnMonster();

    env.ctx.isNight = false;
    advance(env, m, 100); // 1.667s < 2s：还活着
    expect(m.dead).toBe(false);

    advance(env, m, 25); // 再 0.42s，累计 2.08s ≥ 2s
    expect(m.dead).toBe(true);
  });

  it('2. 夜间视距滞回：10m 进 chase、25m 不进、>26m 退出', () => {
    const env = makeEnv(FAR);
    const m = env.spawnMonster();
    advance(env, m, 3);
    expect(m.state).toBe('idle');

    // 10m：进入 chase
    env.setPlayer(10, SURFACE, 0);
    advance(env, m, 1);
    expect(m.state).toBe('chase');

    // 玩家拉到 25m：大于进入阈值 24，但小于退出阈值 26 → 保持 chase（滞回防抖动）
    env.setPlayer(25, SURFACE, 0);
    advance(env, m, 1);
    expect(m.state).toBe('chase');

    // 40m：≥26 → 回 idle
    env.setPlayer(40, SURFACE, 0);
    advance(env, m, 1);
    expect(m.state).toBe('idle');
  });

  it('3. 攻击冷却：贴脸 2.5s 内发起 2~3 次，伤害恒为 3', () => {
    const env = makeEnv(vec(1, SURFACE, 0)); // 距离 1m < 1.5：贴脸
    const m = env.spawnMonster();

    advance(env, m, Math.round(2.5 / DT)); // 150 帧 = 2.5s

    expect(env.attacks.length).toBeGreaterThanOrEqual(2);
    expect(env.attacks.length).toBeLessThanOrEqual(3);
    for (const a of env.attacks) {
      expect(a.dmg).toBe(3); // §2.8 冻结：怪物伤害 3 点/次
      expect(Number.isFinite(a.from.x)).toBe(true);
    }
  });

  it('4. attackPlayer 未接线(null)：贴脸持续 tick 不抛错', () => {
    const env = makeEnv(vec(0.5, SURFACE, 0));
    const m = new Monster(vec(0, SURFACE, 0)); // 不接 attackPlayer，保持 null
    expect(m.attackPlayer).toBeNull();

    expect(() => advance(env, m, 200)).not.toThrow(); // 3.33s，覆盖多次冷却归零瞬间
    expect(m.state).toBe('attack');
    expect(m.dead).toBe(false);
  });

  it('5. 受击击退后无敌窗结束仍会重新追击（真实时钟跨 0.5s 无敌帧）', async () => {
    const env = makeEnv(FAR);
    const m = env.spawnMonster();

    env.setPlayer(10, SURFACE, 0);
    advance(env, m, 10);
    expect(m.state).toBe('chase');

    // 从南侧 (z 较大处) 受击：基类击退把怪物往北 (+z 反方向→−z？) 推——
    // 精确方向不重要，断言「获得水平冲量且不掉血以外副作用」即可。
    m.hurt(1, vec(m.pos.x, SURFACE, m.pos.z + 5));
    expect(m.hp).toBe(11);
    const kick = Math.hypot(m.vel.x, m.vel.z);
    expect(kick).toBeGreaterThan(3); // 击退冲量已写入 vel（§2.8：击退冲量）

    // 推进几帧观察击退位移（水平速度向期望值平滑衰减，冲量可见）
    advance(env, m, 6);

    // 跨过 0.5s 无敌窗后再次受击必须生效（证明无敌帧到期），并仍在追击
    await sleep(650);
    m.hurt(1, vec(m.pos.x, SURFACE, m.pos.z + 5));
    expect(m.hp).toBe(10);

    advance(env, m, 30);
    expect(m.state).toBe('chase'); // 无敌帧不影响 AI，仍然追击
    const dNow = Math.hypot(env.player.x - m.pos.x, env.player.z - m.pos.z);
    advance(env, m, 45);
    const dLater = Math.hypot(env.player.x - m.pos.x, env.player.z - m.pos.z);
    expect(dLater).toBeLessThan(dNow); // 持续逼近玩家
    expect(Number.isFinite(m.pos.x) && Number.isFinite(m.pos.z)).toBe(true);
  });

  it('6. 跳障：追赶路径上一格墙被翻越（y 达到墙顶以上并落到墙后）', () => {
    const env = makeEnv(FAR);
    const m = env.spawnMonster();

    // 一格墙：体素行 y=10、列 x=2（占 [2,3)×[10,11)×[0,1)，头顶 y=11 空 → 可跳
    env.world.add(2, 10, 0);
    env.setPlayer(8, SURFACE, 0);

    let maxY = -Infinity;
    advance(env, m, 150, () => {
      if (m.pos.y > maxY) maxY = m.pos.y;
    });

    expect(maxY).toBeGreaterThanOrEqual(10.95); // 跳跃峰值越过墙顶 y=11（容差记为 10.95)
    expect(m.pos.x).toBeGreaterThan(2.5); // 已穿过墙体所在列
    expect(Math.abs(m.pos.y - SURFACE)).toBeLessThan(1.01); // 落回地表或墙顶整数面附近
    expect(Number.isFinite(m.pos.x) && Number.isFinite(m.pos.y)).toBe(true);
  });

  it('7. 粘滞重定向：全封闭围栏内持续 chase 5s，方向改变且无 NaN 卡死', () => {
    const env = makeEnv(FAR, [0.9, 0.35]); // 确定性 rng：恒 +60°、时长 1.35s
    const m = env.spawnMonster();

    // 双高封闭围栏：环带 max(|x|,|z|)==2，y=10 与 y=11 两层（头位被挡 → 不触发跳障）
    for (let x = -2; x <= 2; x++) {
      for (let z = -2; z <= 2; z++) {
        if (Math.max(Math.abs(x), Math.abs(z)) !== 2) continue;
        env.world.add(x, 10, z);
        env.world.add(x, 11, z);
      }
    }
    env.setPlayer(15, SURFACE, 0); // 围栏外但在 24m 视距内：直线朝向必然迎面撞墙

    let maxY = -Infinity;
    const yaws: number[] = [];
    advance(env, m, Math.round(5 / DT), () => {
      if (m.pos.y > maxY) maxY = m.pos.y;
      yaws.push(Math.atan2(Math.sin(m.facingYaw), Math.cos(m.facingYaw)));
      if (!Number.isFinite(m.pos.x) || !Number.isFinite(m.pos.z)) {
        throw new Error('position became NaN during stuck redirect');
      }
    });

    expect(maxY).toBeLessThan(11);        // 围栏双高：未发生跳障攀爬
    expect(m.dead).toBe(false);           // 不因卡死消亡
    // 方向确实改变过：面向角极差 > 30°（直线撞墙者朝向基本不变）
    const ymin = Math.min(...yaws);
    const ymax = Math.max(...yaws);
    expect(ymax - ymin).toBeGreaterThan(Math.PI / 6);
    // 未穿墙：仍被关在围栏内
    expect(Math.abs(m.pos.x)).toBeLessThan(2.5);
    expect(Math.abs(m.pos.z)).toBeLessThan(2.5);
    // 未穿墙：仍被关在围栏内
    expect(Math.abs(m.pos.x)).toBeLessThan(2.5);
    expect(Math.abs(m.pos.z)).toBeLessThan(2.5);
  });
});
