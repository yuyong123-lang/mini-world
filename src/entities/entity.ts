// 实体基类 + 实体上下文契约（T43）
//
// 物理约定：pos 为 AABB「脚底中心」锚点，onGround 由 moveWithCollisions 每次
// 调用重置（见 physics/collide.ts）。
// 视觉约定：实体只承载物理与拾取逻辑；渲染层（main）通过 attachView/detachView
// 登记/解除视图句柄，并负责每帧位置同步。实体自身绝不触碰 view 内容。
//
// 与冻结契约 docs/contracts/interfaces.md §12 的差异说明：
// §12 的 EntityCtx 为全量面（world/player/spawnDrop/removeEntity/isNight…）；
// W4 本卡明确收窄为「物理 + 拾取」最小面：
//   - 玩家只注入脚底坐标 playerPos（Vec3），不持有 PlayerController 引用，
//     从而可在纯 node 环境下单测；
//   - spawnDrop/removeEntity/isNight 等留待集成波扩展（加字段对既有实现兼容）。
// FIXME(契约): 该收窄偏离 §12 冻结文本。集成波把 EntityCtx 扩成全量面时，
// 本文件（Entity.tick / EntityCtx / DropLike）是唯一需要修订的点，请主线程复核。

import type { PhysicsBody, SolidQuery } from '../physics/collide';
import type { AABBox, ItemStack, Vec3 } from '../core/types';

/**
 * 掉落物的结构鸭子类型（DropEntity 天然满足该形状）。
 * 依赖方向约束：drops.ts → entity.ts 单向引用，故本文件不得 import drops.ts；
 * 合堆遍历需要的最小结构面即「带 stack/pos/dead/age 的东西」。
 */
export interface DropLike {
  stack: ItemStack;
  pos: Vec3;
  dead: boolean;
  /** 已存活秒数（由实体在 tick 中累计） */
  age: number;
}

/**
 * 实体每帧上下文——W4 只冻结形状，具体实现在集成波于 main 接线。
 * drops 数组含本实体自身，遍历方（如合堆）须排除 self。
 */
export interface EntityCtx {
  /** 体素实心查询（World.isSolid 满足此签名，契约 §7/§10） */
  world: SolidQuery;
  /** 磁吸目标：玩家脚底中心坐标 */
  playerPos: Vec3;
  /**
   * 请求将掉落物并入背包；返回 true 表示入包成功（实现方应在该函数内
   * 发 pickup 事件并做背包满的防抖，因为实体层可能连续多帧重复请求）。
   */
  tryPickup(drop: DropLike): boolean;
  /** 当前全部掉落物（含 self）；元素为结构面 DropLike 以免反向依赖 drops.ts */
  drops: DropLike[];
  /** 时间戳(ms) 注入口：测试可用受控时钟；集成波接游戏时钟/performance.now() */
  now(): number;
}

/** 受击无敌帧时长(ms) */
const INVUL_MS = 500;
/** 击退水平冲量（远离 from 方向） */
const KNOCKBACK_SPEED = 6;
/** 击退竖直冲量 */
const KNOCKBACK_LIFT = 4;

/** 统一取毫秒时间戳（node 与浏览器皆可用） */
export function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/** 实体基类：只含状态、AABB 派生、受击逻辑；运动学由子类 tick 实现（§12） */
export abstract class Entity implements PhysicsBody {
  pos: Vec3;
  vel: Vec3;
  width: number;
  height: number;
  onGround = false;
  hp: number;
  /** 满血值（构造时的初始 hp）；血条显示的 100% 基准 */
  readonly maxHp: number;
  dead = false;
  /** 受击无敌帧截止时间戳(ms)；nowMs() < invulUntil 期间免伤 */
  invulUntil = 0;
  /** 渲染层挂钩句柄（three Object3D 等），实体对其不透明 */
  view: unknown = null;

  constructor(
    pos: Vec3,
    size: { width: number; height: number },
    hp: number,
  ) {
    this.pos = { x: pos.x, y: pos.y, z: pos.z }; // 克隆，防外部对象别名污染
    this.vel = { x: 0, y: 0, z: 0 };
    this.width = size.width;
    this.height = size.height;
    this.hp = hp;
    this.maxHp = hp;
  }

  /** 子类实现的每帧逻辑（重力/移动/交互等） */
  abstract tick(dt: number, ctx: EntityCtx): void;

  /** 派生 AABB（min/max 各为角点，闭区间语义同 collide.ts） */
  aabb(): AABBox {
    const hw = this.width / 2;
    return {
      minX: this.pos.x - hw, minY: this.pos.y, minZ: this.pos.z - hw,
      maxX: this.pos.x + hw, maxY: this.pos.y + this.height, maxZ: this.pos.z + hw,
    };
  }

  /** 视觉挂钩：渲染层建立 mesh 后登记 */
  attachView(view: unknown): void {
    this.view = view;
  }

  /** 解除并返回当前视图句柄（渲染层据此 dispose） */
  detachView(): unknown {
    const v = this.view;
    this.view = null;
    return v;
  }

  /**
   * 受击：无敌帧检查 → 扣血 → 击退冲量（水平远离 from ×6、向上 +4）→ 刷新无敌帧。
   * hp 归零置 dead。非法/零伤害直接忽略。
   */
  hurt(amount: number, from?: Vec3): void {
    if (this.dead || !Number.isFinite(amount)) return;
    const t = nowMs();
    if (t < this.invulUntil) return;

    this.hp -= amount;

    if (from) {
      const dx = this.pos.x - from.x;
      const dz = this.pos.z - from.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len > 1e-6) {
        this.vel.x += (dx / len) * KNOCKBACK_SPEED;
        this.vel.z += (dz / len) * KNOCKBACK_SPEED;
      } else {
        // 与攻击源重合：退化为固定方向的水平击退，保证一定位移
        this.vel.z += KNOCKBACK_SPEED;
      }
    }
    this.vel.y += KNOCKBACK_LIFT;

    this.invulUntil = t + INVUL_MS;
    if (this.hp <= 0) this.dead = true;
  }
}
