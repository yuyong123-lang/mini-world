// 敌对生物：夜间刷新的近战追击者（T82 / architecture §2.6 状态机 + §2.8 冻结数值）
//
// ── 与冻结契约 docs/contracts/interfaces.md §12 的差异说明（两处契约外扩展）──
//
// 1) isNight 不在 EntityCtx 上。§12 全量面写着 `isNight(): boolean`，但 W4 已把
//    EntityCtx 收窄成「物理 + 拾取」最小面（见 entity.ts 头注释：玩家只注入 playerPos）。
//    怪物 AI 必须知道昼夜，故本类 tick 参数收窄为 MonsterCtx = EntityCtx + { isNight }。
//    这是「子类方法参数比基类更特化」，TS 方法参数双变允许（strict 下合法，本文件已过
//    tsc --noEmit strict 验证）。要求调用方传入扩展对象。
//    FIXME(契约): 集成波把 EntityCtx 扩成全量面时，应把 isNight 收编进 EntityCtx，
//    本文件只需删掉 MonsterCtx 并把签名改回 EntityCtx，内部逻辑一行不用动。
//
// 2) 攻击玩家走注入回调而非直接摸玩家对象。PlayerController 没有 hurt 方法
//    （controller 只持有 hp 字段，「增减逻辑全部归 survival 系统」，见 controller.ts 注释）；
//    StatsSystem 的伤害入口 applyDamage 又是 private。所以怪物对玩家的全部动作是：
//      monster.attackPlayer = (dmg, from) => { ...玩家扣血 + bus.emit('damage')... }
//    受击方（玩家）的 0.5s 无敌帧同样由该回调实现方负责——本卡只负责发起攻击；
//    未接线（null）时静默空放不抛错。
// FIXME(W9/T91): survival/stats.ts 目前没有公开的外部伤害入口（applyDamage 为 private），
//   集成若在接线处裸写 `player.hp -= dmg` 会绕过生存系统的钳制 / hp 事件 / 一次性 death。
//   建议 W9 给 StatsSystem 增加 `public damageFromMob(amount: number, from?: Vec3): void`
//   （内部复用 applyDamage + 补玩家侧无敌帧检查），attackPlayer 一行即可接通。

import { GRAVITY, JUMP_SPEED } from '../core/constants';
import type { Vec3 } from '../core/types';
import { moveWithCollisions } from '../physics/collide';
import type { SolidQuery } from '../physics/collide';
import { Entity, type EntityCtx } from './entity';

/** 怪物状态机三态（§2.6：idle ↔ chase(视距24且夜间) ↔ attack(1.5格, 冷却1s)） */
export type MonsterState = 'idle' | 'chase' | 'attack';

/** Monster 所需上下文面：EntityCtx 追加昼夜布尔（差异说明见文件头第 1 点） */
export interface MonsterCtx extends EntityCtx {
  /** 当前是否处于夜晚（集成层每帧从 DayCycle.isNight 抄写进来） */
  isNight: boolean;
}

/** 构造选项：测试注入口（契约外最小扩展，与项目既有 DI 风格一致） */
export interface MonsterOptions {
  /** 粘滞重定向用的受控随机源 [0,1)；缺省 Math.random。测试注入确定性序列 */
  rng?: () => number;
}

// ── 规格数值 ────────────────────────────────────────────────────────────────
/** 「width 0.6 height 1.8」T82 设计 1（与玩家盒同尺寸） */
const MONSTER_WIDTH = 0.6;
const MONSTER_HEIGHT = 1.8;
/** 「hp 12」T82 设计 1 */
const MONSTER_HP = 12;
/** 「移动速度 3.2」T82 设计 1 */
const CHASE_SPEED = 3.2;
/** 「distTo(player)<24 → chase」T82 状态机——进入 chase 的距离 */
const NIGHT_VIEW_ENTER = 24;
/** 退出 chase 用更宽的 26 做滞回（任务规格），防玩家恰在 24m 附近时来回抖动 */
const NIGHT_VIEW_EXIT = 26;
/** 「dist<1.5 → attack 态尝试攻击」T82 状态机——进入 attack 的距离 */
const ATTACK_ENTER = 1.5;
/** 「dist>2 脱离回 chase」T82 状态机——滞回带 (1.5, 2] 内保持 attack */
const ATTACK_EXIT = 2;
/** 「怪物伤害 | 3 点/次」architecture §2.8 冻结表 */
const MONSTER_DAMAGE = 3;
/** 「冷却 1s」architecture §2.8 冻结表 */
const ATTACK_COOLDOWN_S = 1;
/** 白天消散：isNight=false 连续累计 2s 即 dead=true（「天亮淡出」简化版，T82 设计 2） */
const SUN_DISSOLVE_S = 2;
/**
 * 白天消散期间的徘徊速度（格/s）。
 * 规格「二选一」取了有趣分支：白天不完全静止，而是沿原朝向缓慢踱步再淡出；
 * 死亡计时仍是文档的 2s 计时，验收不受影响（白天连续 tick 满 2s 必 dead）。
 */
const DAY_WANDER_SPEED = 0.3;
/** 粘滞检测周期（§2.6：「每 0.8s 粘滞检测」；T82 设计 2 同值） */
const STUCK_CHECK_INTERVAL_S = 0.8;
/** 周期内水平位移低于该值视为卡住（§2.6 / T82：「位移<0.05 → 重定向」） */
const STUCK_MIN_MOVE = 0.05;
/** 重定向偏角幅度：±60° 绕行偏移（T82 设计 2）；符号由 rng 决定 */
const REDIRECT_ANGLE_RAD = Math.PI / 3;
/** 绕行偏移持续时间下限与跨度：[1, 1+1) = 1~2s（§2.6 / T82「随机重定向 1-2s」） */
const REDIRECT_MIN_S = 1;
const REDIRECT_SPAN_S = 1;
/** 跳障初速：同动物规则 JUMP_SPEED×0.9（净高约 1.24 格，够翻一格墙） */
const STEP_JUMP_SPEED = JUMP_SPEED * 0.9;
/** 垂直终端速度（格/s），防超大 dt 穿地（同 drops.ts 做法） */
const TERMINAL_FALL_SPEED = -50;
/** 跳障探测点相对脚底中心的前探距离（略大于半宽 0.3，保证看见迎面方块） */
const LOOKAHEAD = 0.45;
/** 跳障探测的脚位抬升量（一格墙内）；头位再 +1 */
const FOOT_Y_OFF = 0.1;

/** 由水平朝向推 yaw：与 controller.ts 视线约定一致（forward = (-sin yaw, -cos yaw)） */
function yawOf(hx: number, hz: number): number {
  return Math.atan2(-hx, -hz);
}

/**
 * 怪物实体。物理语义全部继承 Entity（hurt 击退/无敌帧、hp<=0→dead 均由基类处理）；
 * 渲染层经 attachView 登记 mesh 并逐帧同步 pos 与 facingYaw（同 Animal 约定，
 * 实体自身绝不触碰 view 内容）。掉落：最小实现无掉落（T82 设计 3 取「不掉落」分支；
 * 扩展点保留——如需 GLOWBLOCK 10%，加 hash 判定并经 ctx.spawnDrop 落地，需集成波
 * 先把 spawnDrop 扩进 EntityCtx）。上限 12 与 >48m 强制 despawn 归 Spawner(T83)/集成侧。
 *
 * 无敌帧口径注意：Entity.invulUntil 用全局 nowMs()（非 ctx.now 注入口），
 * 因此跨 hurt 的测试无法冻结怪物自身无敌帧——本类不做任何 invulUntil 写操作，
 * 受击无敌只存在于玩家侧（由 attackPlayer 接线方处理）。测试用例 5 的「无敌窗」
 * 即按真实时钟 sleep/短等待或直接构造足够间隔，见 tests/monsters.test.ts 说明。
 */
export class Monster extends Entity {
  /**
   * 攻击玩家钩子：由集成波注入（受击方无敌帧在 stats/controller 侧处理）。
   * dmg 恒为 §2.8 冻结的 3；from 为发起攻击瞬间怪物的脚底坐标副本（已克隆，
   * 回调实现可安全持有/改写）。未接线（null）时静默空放不抛错。
   */
  attackPlayer: ((dmg: number, from: Vec3) => void) | null = null;

  /** 当前状态机状态（视图调试 / 测试断言用） */
  state: MonsterState = 'idle';

  /** 视图同步用朝向（弧度；公式族同 PlayerController 的 yaw 约定） */
  facingYaw = 0;

  /** 攻击冷却剩余秒数。离开 attack 不清零：保持节奏、防边界抖动刷伤 */
  private cooldown = 0;

  /** 白天连续停留秒数；入夜清零。满 SUN_DISSOLVE_S 置 dead */
  private sunTimer = 0;

  /** 缓存运动朝向（水平单位向量）：chase 目标方向、白天徘徊、facingYaw 共用 */
  private headingX = 1;
  private headingZ = 0;

  /** 本帧采样的玩家坐标副本（tick 开头写入；移动/攻击判定统一用它） */
  private playerX = 0;
  private playerY = 0;
  private playerZ = 0;

  /** 粘滞检测计时器与上次取样坐标（仅水平分量参与比较） */
  private stuckTimer = 0;
  private lastStuckX: number;
  private lastStuckZ: number;

  /** 绕行偏移角（弧度，±60°）与其剩余秒数；redirectTimeLeft<=0 表示直线朝玩家 */
  private redirectAngle = 0;
  private redirectTimeLeft = 0;

  private readonly rng: () => number;

  constructor(spawn: Vec3, options?: MonsterOptions) {
    super(spawn, { width: MONSTER_WIDTH, height: MONSTER_HEIGHT }, MONSTER_HP);
    this.rng = options?.rng ?? Math.random;
    this.lastStuckX = this.pos.x;
    this.lastStuckZ = this.pos.z;
    this.playerX = spawn.x;
    this.playerY = spawn.y;
    this.playerZ = spawn.z;
    this.facingYaw = yawOf(this.headingX, this.headingZ);
  }

  /**
   * 每帧推进。要求传入 MonsterCtx（EntityCtx + isNight，见文件头差异说明 1）。
   * tick 顺序与 T81 动物一致：状态/计时器 → 设定期望 vel.x/z → 重力 → moveWithCollisions。
   */
  tick(dt: number, ctx: MonsterCtx): void {
    if (this.dead || !Number.isFinite(dt) || dt <= 0) return;

    // 先采样目标（一帧内保持一致，避免状态机与运动各算各的）
    this.playerX = ctx.playerPos.x;
    this.playerY = ctx.playerPos.y;
    this.playerZ = ctx.playerPos.z;

    // 三维欧氏距离（同 drops.ts 口径）：同层站位即水平距离，跨层（崖上/崖下）仍合理
    const distToPlayer = Math.sqrt(
      (this.playerX - this.pos.x) ** 2 +
      (this.playerY - this.pos.y) ** 2 +
      (this.playerZ - this.pos.z) ** 2,
    );

    // ── 白天：无条件退回 idle、累计阳光、缓慢徘徊；满 2s 消散 ──
    if (!ctx.isNight) {
      if (this.state !== 'idle') this.state = 'idle';
      this.cooldown = 0;           // 天亮重置交战节奏，入夜从零开始
      this.redirectTimeLeft = 0;
      this.redirectAngle = 0;
      this.sunTimer += dt;
      // 沿原朝向缓慢踱步（DAY_WANDER_SPEED 的「二选一」分支说明）
      this.stepAndMove(dt, ctx.world, this.headingX, this.headingZ, DAY_WANDER_SPEED);
      if (this.sunTimer >= SUN_DISSOLVE_S) this.dead = true; // 集成侧据此移除并 detachView
      return;
    }
    this.sunTimer = 0; // 阳光累计只在连续白天有效

    // ── 状态转移（阈值带滞回；先转移后行动，当帧立即生效）──
    if (this.state === 'idle') {
      if (distToPlayer < NIGHT_VIEW_ENTER) {
        this.state = 'chase';
        this.beginStuckWindow(); // 从当前位置重新计量，首窗口测的是真实位移
        this.redirectTimeLeft = 0;
        this.redirectAngle = 0;
      }
    } else if (this.state === 'chase') {
      if (distToPlayer >= NIGHT_VIEW_EXIT) {
        this.state = 'idle';                 // 出视距：滚回待机
        this.redirectTimeLeft = 0;
      } else if (distToPlayer < ATTACK_ENTER) {
        this.state = 'attack';
      }
    } else if (this.state === 'attack') {
      if (distToPlayer > ATTACK_EXIT) this.state = 'chase';
    }

    if (this.state === 'attack') {
      this.attackTick(dt, ctx.world);
    } else if (this.state === 'chase') {
      this.chaseTick(dt, ctx.world);
    } else {
      this.idleTick(dt, ctx.world); // 夜间无人靠近：原地等待
    }
  }

  // ── 各状态行为 ─────────────────────────────────────────────────────────────

  /** 夜间 idle：原地等待（重力照常结算，悬空出生者正常落地） */
  private idleTick(dt: number, world: SolidQuery): void {
    this.stepAndMove(dt, world, 0, 0, 0);
  }

  /** chase：直线朝玩家水平速度 3.2 + 跳障 + 0.8s 粘滞检测 ±60° 绕行重定向 */
  private chaseTick(dt: number, world: SolidQuery): void {
    // 期望方向 = (player - self) 水平分量；叠加绕行偏移后作为本帧运动朝向
    let dirX = this.playerX - this.pos.x;
    let dirZ = this.playerZ - this.pos.z;

    if (this.redirectTimeLeft > 0) {
      this.redirectTimeLeft -= dt;
      if (this.redirectTimeLeft <= 0) {
        // 绕行刚结束：重置粘滞窗口，下一窗口从当前位姿重新计量（防陈旧采样立即误判）
        this.beginStuckWindow();
      }
      const rotated = rotateBy(dirX, dirZ, this.redirectAngle);
      dirX = rotated.x;
      dirZ = rotated.z;
    } else {
      // 直线追踪期间才做粘滞检测；绕行途中不重复触发
      this.stuckTimer += dt;
      if (this.stuckTimer >= STUCK_CHECK_INTERVAL_S) {
        const moved = Math.hypot(this.pos.x - this.lastStuckX, this.pos.z - this.lastStuckZ);
        this.stuckTimer = 0;
        this.lastStuckX = this.pos.x;
        this.lastStuckZ = this.pos.z;
        // 卡住：随机 ±60° 绕行偏移 1~2s（rng 决定符号与时长）
        if (moved < STUCK_MIN_MOVE && hasLen(dirX, dirZ)) {
          this.redirectAngle = (this.rng() < 0.5 ? -1 : 1) * REDIRECT_ANGLE_RAD;
          this.redirectTimeLeft = REDIRECT_MIN_S + this.rng() * REDIRECT_SPAN_S;
          const rotated = rotateBy(dirX, dirZ, this.redirectAngle);
          dirX = rotated.x;
          dirZ = rotated.z;
        }
      }
    }

    // 缓存归一化后的本帧朝向：供白天徘徊 / facingYaw / 下一次偏移基准使用
    if (hasLen(dirX, dirZ)) {
      const len = Math.hypot(dirX, dirZ);
      this.headingX = dirX / len;
      this.headingZ = dirZ / len;
    }

    this.stepAndMove(dt, world, this.headingX, this.headingZ, CHASE_SPEED);
  }

  /**
   * attack：站桩面向玩家；冷却归零瞬间若仍在 ATTACK_ENTER 内则发起一次攻击。
   * 命中判定用三维距离（含 dy）：隔着半格高差也照常打到，同 drops 的欧氏口径。
   */
  private attackTick(dt: number, world: SolidQuery): void {
    // 站桩但仍结算物理（原地水平速度 0）：避免悬空贴脸时被钉在空中
    this.stepAndMove(dt, world, 0, 0, 0);

    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.cooldown > 0) return;

    const d = Math.sqrt(
      (this.playerX - this.pos.x) ** 2 +
      (this.playerY - this.pos.y) ** 2 +
      (this.playerZ - this.pos.z) ** 2,
    );
    if (d >= ATTACK_ENTER) return;

    this.cooldown = ATTACK_COOLDOWN_S;
    if (this.attackPlayer !== null) {
      // 传坐标副本：回调持有/改写都不污染实体状态
      this.attackPlayer(MONSTER_DAMAGE, { x: this.pos.x, y: this.pos.y, z: this.pos.z });
    }
  }

  // ── 运动内核 ───────────────────────────────────────────────────────────────

  /**
   * 设定期望水平速度 → 重力 → 跳障探测 → moveWithCollisions → 同步 facingYaw。
   * dir 为水平单位向量（或零向量=静止）；speed 为该帧目标速率（格/s）。
   */
  private stepAndMove(
    dt: number,
    world: SolidQuery,
    dirX: number,
    dirZ: number,
    speed: number,
  ): void {
    this.vel.x = dirX * speed;
    this.vel.z = dirZ * speed;
    this.vel.y += GRAVITY * dt;
    if (this.vel.y < TERMINAL_FALL_SPEED) this.vel.y = TERMINAL_FALL_SPEED;

    if (dirX !== 0 || dirZ !== 0) this.tryStepJump(world, dirX, dirZ);

    moveWithCollisions(this, dt, world);

    if (dirX !== 0 || dirZ !== 0) {
      this.facingYaw = yawOf(dirX, dirZ); // 视图同步：运动即面向（黄昏徘徊亦然）
    }
  }

  /**
   * 跳障（同动物规则）：前脚 solid 且前头 air 且 onGround → vel.y = JUMP_SPEED×0.9。
   * y 锚点是脚底：footY=floor(pos.y+FOOT_Y_OFF) 恰是「贴地那格」的一格障碍。
   */
  private tryStepJump(world: SolidQuery, dirX: number, dirZ: number): void {
    if (!this.onGround) return;
    const probeX = Math.floor(this.pos.x + dirX * LOOKAHEAD);
    const probeZ = Math.floor(this.pos.z + dirZ * LOOKAHEAD);
    const footY = Math.floor(this.pos.y + FOOT_Y_OFF);
    const headY = footY + 1; // 一格墙：越过它所需净空
    if (
      world.isSolid(probeX, footY, probeZ) &&
      !world.isSolid(probeX, headY, probeZ)
    ) {
      this.vel.y = STEP_JUMP_SPEED;
      this.onGround = false;
    }
  }

  /** 粘滞窗口重开：计时清零并从当前位置重新取样（陈旧采样会误判成卡死） */
  private beginStuckWindow(): void {
    this.stuckTimer = 0;
    this.lastStuckX = this.pos.x;
    this.lastStuckZ = this.pos.z;
  }
}

/** 非零水平向量判断（无方向时不做偏移旋转） */
function hasLen(x: number, z: number): boolean {
  return x * x + z * z > 1e-18;
}

/** 平面上把 向量旋转 angle 弧度并归一化返回（绕行偏移用） */
function rotateBy(x: number, z: number, angle: number): { x: number; z: number } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: x * c - z * s, z: x * s + z * c };
}
