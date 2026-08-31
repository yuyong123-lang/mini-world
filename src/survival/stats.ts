// T61 生存数值系统——HP / 饥饿 / 再生 / 饿伤 / 摔落伤。
//
// 本类是**外部调节器**：直接读写 PlayerController 公开的 hp/hunger 字段
// （controller 自己不含任何增减逻辑，见 src/player/controller.ts 注释「增减逻辑全部归 survival 系统」）。
//
// 所有数值的唯一出处是 docs/architecture.md §2.8 冻结表（表格行号写在每个常量后），
// 唯一例外是重力：§2.8 未给数，取物理常量 GRAVITY 的模（src/core/constants.ts），
// 避免「公式里的 g」与「真实物理 g」出现两份来源。
import { GRAVITY } from '../core/constants';
import type { Vec3 } from '../core/types';
import { reduceDamage } from './armor';

/**
 * 玩家鸭子类型：只依赖 controller 已经公开的字段。
 * 不 import PlayerController 本身，便于单测用可编程 mock、也避免循环依赖。
 */
export interface PlayerLike {
  /** 脚底中心锚点 */
  pos: Vec3;
  /** 只读竖直分量（用于摔落反推落差） */
  vel: { y: number };
  onGround: boolean;
  sprinting: boolean;
  hp: number;
  hunger: number;
}

/** 总线鸭子类型：对应 EventBus<GameEvents> 的 emit 子集（契约 §11 键 hp/hunger/death/damage） */
export interface BusLike {
  emit(k: string, p: unknown): void;
}

// ── §2.8 冻结数值 ────────────────────────────────────────────────────────────
/** 「HP | 20（10 心）」 architecture.md L87 */
const MAX_HP = 20;
/** 「饥饿 | 20」 architecture.md L88 */
const HUNGER_MAX = 20;
/** 「行走 0.01/s」 architecture.md L88 */
const HUNGER_WALK_PER_SEC = 0.01;
/** 「疾跑 0.08/s」（与行走叠加，不互斥） architecture.md L88 */
const HUNGER_SPRINT_PER_SEC = 0.08;
/** 「跳跃 0.05/次」，即时扣 architecture.md L88 */
const HUNGER_JUMP_COST = 0.05;
/** 「饥饿 ≥18 时每 3s 回 1HP」 architecture.md L89 */
const REGEN_HUNGER_MIN = 18;
/** 「每 3s 回 1HP」 architecture.md L89 */
const REGEN_PERIOD_S = 3;
/** 「耗 0.5 饥饿」 architecture.md L89 */
const REGEN_HUNGER_COST = 0.5;
/** 「饥饿=0 时每 4s 扣 1HP」 architecture.md L90 */
const STARVE_PERIOD_S = 4;
/** 「至最低 1（不饿死）」 architecture.md L90 */
const MIN_ALIVE_HP = 1;
/** 「摔落 >3 格时 (落差−3) 点伤害」 architecture.md L87 */
const SAFE_FALL_BLOCKS = 3;

/** 物理重力大小的正值形式（GRAVITY=-24，constants.ts）；§2.8 摔落公式的 g */
const FALL_G = Math.abs(GRAVITY);

// ── 判定参数（实现细节规格给定，非冻结数值） ───────────────────────────────
/** 水平位移超过该值（格/帧）视为「正在移动」 */
const MOVE_EPSILON = 0.001;
/** 浮点比较阈值：变化小于它不认为发生变化（不发事件） */
const EPS = 1e-9;
/**
 * 周期计时容差。dt 连续求和有表示误差（如 0.05 累加 60 次 = 2.9999999999999996），
 * 若用严格 >= 判定，真实游戏的可变帧率下永远可能差一帧触发不到。
 * 取 1e-6 秒：比任何帧噪声大 7 个数量级，又远小于有意义的时间粒度。
 */
const TIME_EPS = 1e-6;
/** 摔落伤害取整容差（格）。恰好 N 格落差的 v²/(2g) 会算出 N−1e−15，
 *  若不加容差 floor(落差−3) 会少算一格。同样远小于 1 格的量化粒度 */
const FALL_EPS = 1e-6;
/** 玩家受击无敌帧时长（ms），与 Entity.hurt 的 500ms 一致 */
const PLAYER_INVUL_MS = 500;
/** 怪物近战无敌帧检查用的毫秒时钟 */
function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** 夹取到 [lo, hi] */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class StatsSystem {
  private readonly player: PlayerLike;
  private readonly bus: BusLike;

  /** 上一帧缓存下来的竖直速度。落地帧据此反推落差，故必须先于使用被赋值 */
  private playerInvulUntil = 0;
  private prevVelY: number;
  /** 上一帧位置快照（水平位移 → 是否在行走） */
  private lastPos: Vec3;
  /** 上一帧是否着地（false→true 沿即落地瞬间） */
  private wasOnGround: boolean;
  /** 再生累计器（秒），达 REGEN_PERIOD_S 触发一次 */
  private regenTimer = 0;
  /** 饿伤累计器（秒），达 STARVE_PERIOD_S 扣 1HP */
  private starveTimer = 0;
  /** death 事件只发一次；respawn 后外部调 reset() 清除 */
  private deadFired = false;

  /** 护甲减伤面（可选注入）：armorPoints() 返回当前总护甲点数 */
  private readonly armor?: { armorPoints(): number };

  constructor(player: PlayerLike, bus: BusLike, armor?: { armorPoints(): number }) {
    this.player = player;
    this.bus = bus;
    this.armor = armor;
    this.lastPos = { x: player.pos.x, y: player.pos.y, z: player.pos.z };
    this.prevVelY = player.vel.y;
    this.wasOnGround = player.onGround;
  }

  /** 主循环每帧调用（在玩家物理 tick 之后，pos/vel/onGround 已是本帧结论） */
  tick(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const p = this.player;

    // ── 1. 摔落伤：用「上一帧」的速度反推落差。
    //    注意顺序：先取上帧缓存再覆盖缓存，落地帧读到的是撞击前速度——
    //    因为碰撞解算在触地那一帧已经把 vel.y 归零了。
    const impactSpeed = -this.prevVelY; // 下落为负速度 → 取正
    this.prevVelY = p.vel.y;

    if (p.onGround && !this.wasOnGround && impactSpeed > 0) {
      // 落差 h = v²/(2g)，与自由落体 v = sqrt(2gh) 互为逆运算
      const dropBlocks = (impactSpeed * impactSpeed) / (2 * FALL_G);
      const overflow = dropBlocks - SAFE_FALL_BLOCKS; // >3 格的部分才结算伤害
      if (overflow > -FALL_EPS) {
        const dmg = Math.floor(overflow + FALL_EPS); // 按整格向下取整（含表示误差修正）
        if (dmg > 0) {
          this.applyDamage(dmg);
          this.bus.emit('damage', { amount: dmg });
        }
      }
    }
    this.wasOnGround = p.onGround;

    // ── 2. 行走/疾跑饥饿消耗（按时间连续计量，与帧率无关）
    const dx = p.pos.x - this.lastPos.x;
    const dz = p.pos.z - this.lastPos.z;
    const moving = Math.hypot(dx, dz) > MOVE_EPSILON;
    this.lastPos = { x: p.pos.x, y: p.pos.y, z: p.pos.z };

    let hungerDelta = 0;
    if (moving && p.onGround) hungerDelta -= HUNGER_WALK_PER_SEC * dt;
    if (p.sprinting) hungerDelta -= HUNGER_SPRINT_PER_SEC * dt; // 叠加在行走之上
    if (hungerDelta !== 0) this.addHunger(hungerDelta);

    // ── 3. 再生：hunger ≥ 18 每 3s 回 1HP、耗 0.5 饥饿
    if (p.hunger < REGEN_HUNGER_MIN) {
      this.regenTimer = 0; // 跌破 18 分界 → 计时作废，重新累积
    } else if (p.hp < MAX_HP) {
      this.regenTimer += dt;
      if (this.regenTimer >= REGEN_PERIOD_S - TIME_EPS) {
        this.regenTimer -= REGEN_PERIOD_S; // 减去整周期而非清零 → 固定 dt 下不漂移
        const beforeHunger = p.hunger;
        p.hunger = Math.max(0, p.hunger - REGEN_HUNGER_COST); // 到达时必 ≥17.5，max 只是护栏
        this.emitHungerIfChanged(beforeHunger);
        this.addHp(+1);
      }
    }
    // 满血时暂停累计（不空转烧饥饿），计时器保留以便脱离满血后继续

    // ── 4. 饿伤：hunger ≤ 0 每 4s 扣 1HP，下限 1（不饿死）
    if (p.hunger <= 0) {
      this.starveTimer += dt;
      if (this.starveTimer >= STARVE_PERIOD_S - TIME_EPS && p.hp > MIN_ALIVE_HP) {
        this.starveTimer -= STARVE_PERIOD_S;
        this.addHp(-1, MIN_ALIVE_HP);
      }
    } else if (this.starveTimer !== 0) {
      this.starveTimer = 0; // 恢复进食则清饿伤计时
    }
  }

  /** 吃食物入口（集成波接右键食物），向上夹到满值 */
  eat(hungerValue: number): void {
    if (!Number.isFinite(hungerValue)) return;
    this.addHunger(hungerValue);
  }

  /**
   * 测试钩子：一次跳跃＝立即扣 0.05 饥饿。
   * 集成波把真实的跳跃事件接过来：player.addJumpHook(() => stats.notifyJump())
   * （PlayerController 已提供 addJumpHook/onJumpHooks，无需近似 hack）
   */
  notifyJump(): void {
    this.addHunger(-HUNGER_JUMP_COST);
  }

  /** 玩家重生/换档后调用：清 death 标志与全部计时器 */
  reset(): void {
    this.deadFired = false;
    this.regenTimer = 0;
    this.starveTimer = 0;
    this.prevVelY = this.player.vel.y;
    this.wasOnGround = this.player.onGround;
    this.lastPos = { x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z };
  }

  /**
   * 怪物近战伤害入口（W9 接线：Monster.attackPlayer → 本方法）。
   * 带 0.5s 受击无敌帧；可打到 0 触发一次性 death。
   * 护甲减伤只作用于此入口（摔落/饿伤不经过，天然豁免——MC 口径）。
   * @param dmg 伤害点数
   * @param _from 攻击来源位置（当前无击退实现——玩家击退观感差，保留参数备将来）
   */
  damageFromMob(dmg: number, _from?: { x: number; y: number; z: number }): void {
    if (!Number.isFinite(dmg) || dmg <= 0) return;
    const now = nowMs();
    if (now < this.playerInvulUntil) return; // 无敌帧
    this.playerInvulUntil = now + PLAYER_INVUL_MS;
    const pts = this.armor?.armorPoints() ?? 0;
    this.applyDamage(Math.floor(reduceDamage(dmg, pts)));
  }

  // ── 内部变更路径 ─────────────────────────────────────────────────────────

  /** 饥饿统一入口：夹到 [0, 20]，发生变化才发 hunger 事件（带新值） */
  private addHunger(delta: number): void {
    const before = this.player.hunger;
    this.player.hunger = clamp(before + delta, 0, HUNGER_MAX);
    this.emitHungerIfChanged(before);
  }

  /** hunger 事件发射（带新值），浮点噪声范围内不重复发 */
  private emitHungerIfChanged(before: number): void {
    const cur = this.player.hunger;
    if (Math.abs(cur - before) < EPS) return;
    this.bus.emit('hunger', { v: cur });
  }

  /** HP 统一入口：clamp 到 [floor, MAX_HP]，变化才发 hp 事件（带新值） */
  private addHp(delta: number, floor = 0): void {
    const before = this.player.hp;
    const next = clamp(before + delta, floor, MAX_HP);
    if (Math.abs(next - before) < EPS) return;
    this.player.hp = next;
    this.bus.emit('hp', { v: next });
    if (next <= 0) this.fireDeathOnce();
  }

  /** 摔落/外部伤害入口：可打到 0 并触发一次性 death */
  private applyDamage(amount: number): void {
    const before = this.player.hp;
    this.player.hp = Math.max(0, before - amount);
    this.bus.emit('hp', { v: this.player.hp });
    if (this.player.hp <= 0) this.fireDeathOnce();
  }

  /** death 只允许发一次；重生后必须经 reset() 才能再次触发 */
  private fireDeathOnce(): void {
    if (this.deadFired) return;
    this.deadFired = true;
    this.bus.emit('death', {});
  }
}
