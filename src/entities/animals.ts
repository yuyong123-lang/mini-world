// T81 动物 AI（猪/羊）：被动生物三态状态机 —— idle(站立) ↔ wander(漫游) ↔ flee(逃离玩家)
//
// 状态机图：
//            ┌──────────────────────────────┐
//            │ 构造 → idle(计时 1~3s)        │
//            └──────────┬───────────────────┘
//     计时到  ↓                     ↑ 计时到（走满 2~4s）
//      wander ←──────── 反复互转 ──→ idle
//        │ ↑                            │
//        │ └──── flee 计时完(3s)回 wander│
//        ▼                              │
//      flee ←──────── hurt() 生效（未致死）被击中
//
// 设计取舍：
// - 全部随机量（状态时长/随机朝向/掉落数）经构造器注入的 rng 产生，默认 Math.random；
//   不用 ctx.now() 派生——计时器一律按 dt 秒累进（帧率无关），同种子即得完全确定序列，
//   测试可稳定复现。
// - 掉落不走 ctx.spawnDrop：收窄版 EntityCtx 没有该接口（见 entity.ts 顶部 FIXME(契约)），
//   故把满足 DropLike 结构面的普通对象直接 push 进 ctx.drops。
// FIXME(集成波/main/W9)：ctx.drops 里会出现非 DropEntity 实例的裸结构（本卡产出），
//   集成侧必须在实体清理循环里识别「非 DropEntity 的 DropLike」并转换成真 DropEntity
//   （或据其生成后移除原条目），否则这些掉落不会被 tick（不落地下沉/不可拾取）。
import { GRAVITY, JUMP_SPEED } from '../core/constants';
import type { ItemStack, Vec3 } from '../core/types';
import { moveWithCollisions, type SolidQuery } from '../physics/collide';
import { Entity, type EntityCtx } from './entity';

/** 动物三态 */
export type AnimalState = 'idle' | 'wander' | 'flee';

/** 碰撞盒与血量 */
const BODY_WIDTH = 0.7;
const BODY_HEIGHT = 0.9;
const MAX_HP = 10;

/** idle 时长区间（秒）：闭区间内均匀取样 */
const IDLE_TIME_RANGE: [number, number] = [1, 3];
/** wander 时长区间（秒） */
const WANDER_TIME_RANGE: [number, number] = [2, 4];
/** wander 水平速度（格/s） */
const WANDER_SPEED = 1.2;
/** flee 时长（秒） */
const FLEE_TIME_S = 3;
/** flee 水平速度（格/s） */
const FLEE_SPEED = 3;

/** 未移动态水平摩擦基准（每帧乘子 @dt=1s 的指数底）：pow(f, dt) 平滑刹车 */
const IDLE_FRICTION = 0.02;
/** 跳障竖直冲量相对玩家跳跃的折减系数 */
const STEP_UP_JUMP_MUL = 0.9;
/** 跳障探测点：前方水平距离（格） */
const PROBE_AHEAD = 0.6;
/** 脚位行归属容差：脚底恰站在整数面上时归入其上一行（该行才是身体占据的首行） */
const FOOT_ROW_EPS = 1e-4;

/** 卡死检测窗口（秒） */
const STUCK_CHECK_INTERVAL_S = 0.8;
/** 一个窗口内位移小于该值视为卡死（格） */
const STUCK_MIN_DISPLACEMENT = 0.05;

/** 整圆弧度 */
const TAU = Math.PI * 2;

/**
 * 猪掉落表纯函数：同输入永远同输出（可测性核心——数量随机经参数显式传入）。
 * @param roll [0,1) 随机数：<0.5 得 1 块，否则 2 块
 */
export function pigDrops(roll: number): ItemStack[] {
  return [{ key: 'ITEM_RAW_PORK', count: roll < 0.5 ? 1 : 2 }];
}

/**
 * 被动动物（猪/羊共用一套行为参数）。
 * 视觉约定同 DropEntity：实体只承载物理与逻辑，main/W9 经 attachView 登记 mesh，
 * 并每帧读取 facingYaw 同步朝向（模型默认面向 +Z 时 mesh.rotation.y = facingYaw 即可）。
 */
export class Animal extends Entity {
  /** 当前状态（测试/调试观测用） */
  state: AnimalState = 'idle';
  /** 当前运动方向角（弧度，绕 Y 自 +Z 起算）；供视图层同步朝向 */
  facingYaw = 0;
  /** 死亡一次性回调（掉肉已内置，回调供额外表现/计数使用），death 当帧调用 */
  onDeath?: (ctx: EntityCtx) => void;

  private readonly rng: () => number;
  /** 当前状态剩余时长（秒）；flee 用独立 fleeTimer 表达 */
  private stateTimer: number;
  private fleeTimer = 0;
  /** 归一化水平运动方向 */
  private dirX = 0;
  private dirZ = 1;
  /** 卡死检测累计时钟与检查点 */
  private stuckClock = 0;
  private stuckRefX = 0;
  private stuckRefZ = 0;
  /** 掉落只发一次的幂等闸（基类 hurt 已置 dead，本标志保证死亡处理仅执行一次） */
  private dropSpawned = false;

  /**
   * @param spawn 出生点（脚底中心）
   * @param rng 随机源注入点：同种子得到确定行为序列（测试用 mulberry32）
   */
  constructor(spawn: Vec3, rng: () => number = Math.random) {
    super(spawn, { width: BODY_WIDTH, height: BODY_HEIGHT }, MAX_HP);
    this.rng = rng;
    this.stateTimer = this.randRange(...IDLE_TIME_RANGE);
    this.pickRandomDirection(); // 初始朝向仅供视图参考，idle 态不会位移
    this.resetStuckCheckpoint();
  }

  override tick(dt: number, ctx: EntityCtx): void {
    // 0. 死亡兜底：hp<=0（无论来自 hurt 致死还是外部改血量）都做一次性收尾。
    //    基类 hurt 在致死后立刻置 dead=true，因此判定不能写成 !dead && hp<=0，
    //    必须以 dropSpawned 为幂等闸。
    this.resolveDeath(ctx);
    if (this.dead || !(dt > 0)) return;

    // 1. 状态计时器推进与转移
    this.updateState(dt, ctx);

    // 2. 设定期望水平速度
    if (this.state === 'idle') {
      const f = Math.pow(IDLE_FRICTION, dt);
      this.vel.x *= f;
      this.vel.z *= f;
    } else {
      const speed = this.state === 'flee' ? FLEE_SPEED : WANDER_SPEED;
      this.vel.x = speed * this.dirX;
      this.vel.z = speed * this.dirZ;
      this.updateStuck(dt);
      // 4. 跳障：仅移动态探测（见下）
      this.tryStepUp(ctx.world);
    }

    // 3. 重力
    this.vel.y += GRAVITY * dt;

    // 5. 分轴扫掠碰撞移动（内部会重置 onGround）
    moveWithCollisions(this, dt, ctx.world);
  }

  /** 受击继承基类扣血/击退/无敌帧，并在真实受伤（且幸存）时切入 flee */
  override hurt(amount: number, from?: Vec3): void {
    if (this.dead) return;
    const hpBefore = this.hp;
    super.hurt(amount, from);

    const damaged = this.hp < hpBefore;
    if (!damaged || this.hp <= 0) return; // 无敌帧吞掉 / 致死均不进入逃跑

    this.state = 'flee';
    this.fleeTimer = FLEE_TIME_S;
    this.resetStuckCheckpoint();
  }

  /** ---------- 内部：状态机 ---------- */

  private updateState(dt: number, ctx: EntityCtx): void {
    if (this.state === 'flee') {
      // 逃跑方向每帧重算，保持始终指向「远离玩家」
      this.retargetFleeAwayFrom(ctx.playerPos);
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0) this.enterWander();
      return;
    }

    this.stateTimer -= dt;
    if (this.stateTimer > 0) return;
    if (this.state === 'idle') this.enterWander();
    else this.enterIdle();
  }

  private enterIdle(): void {
    this.state = 'idle';
    this.stateTimer = this.randRange(...IDLE_TIME_RANGE);
  }

  private enterWander(): void {
    this.state = 'wander';
    this.stateTimer = this.randRange(...WANDER_TIME_RANGE);
    this.pickRandomDirection();
    this.resetStuckCheckpoint();
  }

  private pickRandomDirection(): void {
    const theta = this.rng() * TAU;
    this.dirX = Math.sin(theta);
    this.dirZ = Math.cos(theta);
    this.facingYaw = theta; // 约定：yaw 绕 Y 轴自 +Z 起算，sin/cos 与之天然一致
  }

  /** flee 主方向：远离玩家的水平单位向量；与玩家重合时退化为任意水平方向 */
  private retargetFleeAwayFrom(playerPos: Vec3): void {
    const dx = this.pos.x - playerPos.x;
    const dz = this.pos.z - playerPos.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 1e-4) {
      this.dirX = dx / len;
      this.dirZ = dz / len;
    } else {
      const theta = this.rng() * TAU;
      this.dirX = Math.sin(theta);
      this.dirZ = Math.cos(theta);
    }
    this.facingYaw = Math.atan2(this.dirX, this.dirZ);
  }

  /** ---------- 内部：卡死检测 ---------- */

  private updateStuck(dt: number): void {
    this.stuckClock += dt;
    if (this.stuckClock < STUCK_CHECK_INTERVAL_S) return;

    const moved = Math.hypot(
      this.pos.x - this.stuckRefX,
      this.pos.z - this.stuckRefZ,
    );
    this.resetStuckCheckpoint();
    if (moved >= STUCK_MIN_DISPLACEMENT) return;

    // 卡死强制换向（wander/flee 共用此分支）
    if (this.state === 'flee') {
      // 逃跑中被挡死：换一个正交方向的偏折再试，保持大体远离玩家
      const bend = (this.rng() < 0.5 ? 1 : -1) * (Math.PI / 2) * (0.5 + this.rng());
      const theta = this.facingYaw + bend;
      this.dirX = Math.sin(theta);
      this.dirZ = Math.cos(theta);
      this.facingYaw = theta;
    } else {
      this.pickRandomDirection();
    }
  }

  private resetStuckCheckpoint(): void {
    this.stuckClock = 0;
    this.stuckRefX = this.pos.x;
    this.stuckRefZ = this.pos.z;
  }

  /** ---------- 内部：跳障与死亡 ---------- */

  /** 前方 0.6 格处脚位实心而头位悬空 → 起跳越过一格台阶 */
  private tryStepUp(world: SolidQuery): void {
    if (!this.onGround) return;

    const fx = Math.floor(this.pos.x + this.dirX * PROBE_AHEAD);
    const fz = Math.floor(this.pos.z + this.dirZ * PROBE_AHEAD);
    const footRow = Math.floor(this.pos.y + FOOT_ROW_EPS);
    if (!world.isSolid(fx, footRow, fz)) return;
    if (world.isSolid(fx, footRow + 1, fz)) return; // 头位也被堵死，只能靠换向而非起跳

    this.vel.y = JUMP_SPEED * STEP_UP_JUMP_MUL;
  }

  private resolveDeath(ctx: EntityCtx): void {
    if (this.dropSpawned || this.hp > 0) return;
    this.dropSpawned = true;
    this.dead = true;

    for (const stack of pigDrops(this.rng())) {
      ctx.drops.push({
        stack,
        pos: { x: this.pos.x, y: this.pos.y + 0.5, z: this.pos.z },
        dead: false,
        age: 0,
      });
    }
    this.onDeath?.(ctx);
  }

  /** [min,max) 区间均匀取样 */
  private randRange(min: number, max: number): number {
    return min + this.rng() * (max - min);
  }
}
