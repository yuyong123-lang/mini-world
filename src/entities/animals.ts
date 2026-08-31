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

/** idle 时长区间（秒）：闭区间内均匀取样（全物种共享） */
const IDLE_TIME_RANGE: [number, number] = [1, 3];
/** wander 时长区间（秒） */
const WANDER_TIME_RANGE: [number, number] = [2, 4];
/** flee 时长（秒）：被打后逃跑的时间——过长会让玩家追不上、连击全落空 */
const FLEE_TIME_S = 1.6;
/** 死亡倒地动画时长（秒）：尸体侧翻下沉，播完才由集成侧回收 */
export const DEATH_ANIM_S = 0.9;

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
 * 物种掉落表纯函数：同输入永远同输出（可测性核心——数量随机经参数显式传入）。
 * 每个物种的一条掉落序列都由同一个 roll 驱动，边界见各表注释。
 * @param roll [0,1) 随机数
 */
export function pigDrops(roll: number): ItemStack[] {
  return [{ key: 'ITEM_RAW_PORK', count: roll < 0.5 ? 1 : 2 }];
}

/** 牛：生牛肉 1~2 块（roll<0.5 得 1）；皮革按三段：<0.4 无、<0.8 得 1、否则 2 */
export function cowDrops(roll: number): ItemStack[] {
  const beef: ItemStack = { key: 'ITEM_RAW_BEEF', count: roll < 0.5 ? 1 : 2 };
  const leatherCount = roll < 0.4 ? 0 : roll < 0.8 ? 1 : 2;
  return leatherCount === 0
    ? [beef]
    : [beef, { key: 'ITEM_LEATHER', count: leatherCount }];
}

/** 羊：生羊肉 1 块 + 羊毛 1 块（固定组合，无随机量） */
export function sheepDrops(_roll: number): ItemStack[] {
  return [
    { key: 'ITEM_RAW_MUTTON', count: 1 },
    { key: 'ITEM_WOOL', count: 1 },
  ];
}

/** 物种逻辑名（ANIMAL_SPECIES 表键 / Spawner 回调载荷） */
export type AnimalSpeciesKey = 'pig' | 'cow' | 'sheep';

/**
 * 物种定义：纯数据驱动的多物种支持（猪/牛/羊共用同一套三态状态机，
 * 差异全部落在数值与掉落表上——子类只会复制 250 行行为代码，故参数化而非继承）。
 */
export interface AnimalSpeciesDef {
  key: AnimalSpeciesKey;
  /** 中文名（toast/调试用） */
  name: string;
  maxHp: number;
  /** 碰撞盒（脚底中心锚点，与 Entity 约定一致） */
  width: number;
  height: number;
  /** wander 水平速度（格/s） */
  wanderSpeed: number;
  /** flee 水平速度（格/s） */
  fleeSpeed: number;
  /** 视图主色（0xRRGGBB；main/creatureViews 用） */
  viewColor: number;
  /** 掉落表纯函数（随机量经 roll 显式传入，见各 drops* 注释） */
  drops(roll: number): ItemStack[];
}

/** 物种表：新增物种 = 这里加一行 + 掉落纯函数 +（可选）视图造型 */
export const ANIMAL_SPECIES: Readonly<Record<AnimalSpeciesKey, AnimalSpeciesDef>> = {
  pig: {
    key: 'pig',
    name: '猪',
    maxHp: 10,
    width: 0.7,
    height: 0.9,
    wanderSpeed: 1.2,
    fleeSpeed: 2.2,
    viewColor: 0xe8a2a8,
    drops: pigDrops,
  },
  cow: {
    key: 'cow',
    name: '牛',
    maxHp: 12,
    width: 0.8,
    height: 1.0,
    wanderSpeed: 1.0,
    fleeSpeed: 2.0,
    viewColor: 0x6b4f35,
    drops: cowDrops,
  },
  sheep: {
    key: 'sheep',
    name: '羊',
    maxHp: 8,
    width: 0.7,
    height: 0.95,
    wanderSpeed: 1.1,
    fleeSpeed: 2.2,
    viewColor: 0xe8e4dc,
    drops: sheepDrops,
  },
};

/** 按物种键取掉落表（纯函数转发，供测试与外部无依赖使用） */
export function dropsFor(key: AnimalSpeciesKey, roll: number): ItemStack[] {
  return ANIMAL_SPECIES[key].drops(roll);
}

/** Animal 构造选项（species 缺省猪、rng 缺省 Math.random） */
export interface AnimalOptions {
  species?: AnimalSpeciesDef;
  rng?: () => number;
}

/**
 * 被动动物（猪/牛/羊共用一套行为参数，差异来自 ANIMAL_SPECIES 物种表）。
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
  /** 物种定义（数值/掉落来源）；缺省猪——兼容旧调用 new Animal(pos) */
  readonly species: AnimalSpeciesDef;
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
   * 死亡倒地动画进度：-1 = 未死亡；0..1 = 倒地动画播放中（视图层读它做侧翻+下沉）；
   * 播满 1 时置 deathAnimDone，集成侧据此回收视图与数组位。
   */
  deathT = -1;
  /** 倒地动画播完标志；集成侧只回收 dead && deathAnimDone 的尸体 */
  deathAnimDone = false;

  /**
   * @param spawn 出生点（脚底中心）
   * @param opts 物种与随机源注入。第二参兼容两种历史形态：直接传函数视为 rng
   *            （既有测试/调用方不受影响），传对象 { species?, rng? } 为完整选项。
   */
  constructor(
    spawn: Vec3,
    opts: AnimalOptions | (() => number) = Math.random,
  ) {
    const legacy = typeof opts === 'function';
    const o: AnimalOptions = legacy ? { rng: opts } : (opts ?? {});
    super(
      spawn,
      { width: o.species?.width ?? ANIMAL_SPECIES.pig.width, height: o.species?.height ?? ANIMAL_SPECIES.pig.height },
      o.species?.maxHp ?? ANIMAL_SPECIES.pig.maxHp,
    );
    this.species = o.species ?? ANIMAL_SPECIES.pig;
    this.rng = o.rng ?? Math.random;
    this.stateTimer = this.randRange(...IDLE_TIME_RANGE);
    this.pickRandomDirection(); // 初始朝向仅供视图参考，idle 态不会位移
    this.resetStuckCheckpoint();
  }

  override tick(dt: number, ctx: EntityCtx): void {
    // 0. 死亡兜底：hp<=0（无论来自 hurt 致死还是外部改血量）都做一次性收尾。
    //    基类 hurt 在致死后立刻置 dead=true，因此判定不能写成 !dead && hp<=0，
    //    必须以 dropSpawned 为幂等闸。
    this.resolveDeath(ctx);
    if (this.dead) {
      // 死亡倒地动画：尸体留在原地侧翻下沉，播完置 deathAnimDone 交由集成侧回收。
      // 期间不跑 AI/物理（尸体静止），视图层由 main 的 syncAnimalView 读 deathT 表现。
      if (this.deathT >= 0 && !this.deathAnimDone) {
        this.deathT = Math.min(1, this.deathT + dt / DEATH_ANIM_S);
        if (this.deathT >= 1) this.deathAnimDone = true;
      }
      return;
    }
    if (!(dt > 0)) return;

    // 1. 状态计时器推进与转移
    this.updateState(dt, ctx);

    // 2. 设定期望水平速度
    if (this.state === 'idle') {
      const f = Math.pow(IDLE_FRICTION, dt);
      this.vel.x *= f;
      this.vel.z *= f;
    } else {
      const speed = this.state === 'flee' ? this.species.fleeSpeed : this.species.wanderSpeed;
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

    // 被动生物击退折减：基类击退（水平×6 + 上抬×4）对动物太强——
    // 一击弹出攻击射程，玩家后续连击全部落空。减半保持受击反馈但不脱手。
    this.vel.x *= 0.5;
    this.vel.z *= 0.5;
    this.vel.y *= 0.4;

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
    this.deathT = 0; // 启动倒地动画（deathAnimDone 置位后集成侧才回收视图）

    for (const stack of this.species.drops(this.rng())) {
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
