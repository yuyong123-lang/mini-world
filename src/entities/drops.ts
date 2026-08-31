// 掉落物实体：物理落地 + 弹跳 + 磁吸拾取 + 同类合堆 + 寿命回收（T43）
// 视觉由渲染层挂钩（见 entity.ts 的 attachView/detachView），本文件零渲染依赖。

import { GRAVITY } from '../core/constants';
import type { ItemStack, Vec3 } from '../core/types';
import { moveWithCollisions } from '../physics/collide';
import { Entity, type EntityCtx } from './entity';

/** 寿命（秒）：超过后 despawn（dead=true，由外部从列表移除） */
export const DROP_LIFETIME_S = 300;
/** 距玩家该距离内开始磁吸 */
export const MAGNET_RADIUS = 1.5;
/** 触发拾取请求的水平距离 */
export const PICKUP_RADIUS = 0.6;
/** 拾取/磁吸的垂直高差容差（格）：台阶上下 1 格内都可拾（旧版 3D 距离判定
 *  会把高差顶出半径——走过去永远差一点捡不起来） */
export const PICKUP_VERT_TOLERANCE = 1.2;
/** 同 key 合堆距离 */
export const MERGE_RADIUS = 0.5;
/** 磁吸飞行速度上限（格/s）：位移式吸附的每秒移动距离 */
const MAGNET_MAX_SPEED = 8;
/** 落地弹跳能量保留系数 */
export const BOUNCE_RESTITUTION = 0.4;
/** 下落速度低于该值不弹跳（防无限微弹/抖动） */
const BOUNCE_MIN_SPEED = 1.5;
/** 垂直终端速度（格/s），防超大 dt 穿透地面 */
const TERMINAL_FALL_SPEED = -50;
/** 每帧水平摩擦系数（@60fps 基准，运行时按 dt 归一） */
const GROUND_FRICTION_60FPS = 0.85;
/** 合堆冷却（秒）：双方都超过该年龄才参与合堆（刚掉落不吸附） */
export const MERGE_COOLDOWN_S = 1;
/** 磁吸与拾取生效的最低年龄（秒）：避免砸在脚边的物品瞬间消失 */
export const INTERACT_COOLDOWN_S = 0.5;

/**
 * 掉落物：小方块物理体。
 * hp 取 Infinity 且覆写 hurt 为空操作——掉落物不因受击死亡、不消耗无敌帧。
 */
export class DropEntity extends Entity {
  stack: ItemStack;
  /** 已存活秒数（tick 内以 dt 累计；测试用受控 dt 累进即可） */
  age = 0;

  /** 上一帧是否着地（用于识别「落地瞬间」触发弹跳） */
  private wasOnGround = false;

  constructor(pos: Vec3, stack: ItemStack) {
    super(pos, { width: 0.25, height: 0.25 }, Infinity);
    this.stack = { ...stack }; // 克隆，防外部对象别名污染
  }

  /** 掉落物不可被攻击伤害（无血量语义、无击退、不动无敌帧） */
  override hurt(_amount: number, _from?: Vec3): void {}

  tick(dt: number, ctx: EntityCtx): void {
    if (this.dead || dt <= 0) return;
    this.age += dt;

    if (this.age >= DROP_LIFETIME_S) {
      this.dead = true; // main 据此移出列表并 detachView
      return;
    }

    // 嵌入方块自救：动物贴墙/贴方块死亡时，掉落点可能落在 solid 内——
    // 嵌住的掉落物磁吸/拾取判定永远差一口气。检测到即弹到所在方块的顶面。
    if (ctx.world.isSolid(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z))) {
      this.pos.y = Math.floor(this.pos.y) + 1.01;
      this.vel.y = 0;
    }

    this.moveAndBounce(dt, ctx);

    if (this.tryMagnet(dt, ctx)) return; // 本帧已被磁吸拉向玩家
    if (this.tryPickup(ctx)) return;
    this.mergeNearby(ctx);
  }

  /** 重力 + moveWithCollisions + 落地弹跳（保留 40% 能量反向弹起）+ 水平摩擦 */
  private moveAndBounce(dt: number, ctx: EntityCtx): void {
    this.vel.y += GRAVITY * dt;
    if (this.vel.y < TERMINAL_FALL_SPEED) this.vel.y = TERMINAL_FALL_SPEED;

    const impactVy = this.vel.y; // 冲击速度须在碰撞求解前捕获（碰撞会把 vel.y 清零）
    const prevOnGround = this.wasOnGround;
    moveWithCollisions(this, dt, ctx.world);

    if (this.onGround && !prevOnGround && impactVy < -BOUNCE_MIN_SPEED) {
      this.vel.y = -impactVy * BOUNCE_RESTITUTION;
      this.onGround = false; // 已离地，下一帧继续空中运动
    }
    this.wasOnGround = this.onGround;

    // 水平摩擦：把「每帧 ×0.85」归一成指数衰减率，帧率无关
    const f = Math.pow(GROUND_FRICTION_60FPS, dt * 60);
    this.vel.x *= f;
    this.vel.z *= f;
  }

  /** 磁吸：进入范围后**直接飞向玩家**（位移式吸附，无视地形遮挡）。
   *  旧「加速度+碰撞」方案会被台阶/树干/方块缝隙挡住——掉落物卡住来回抖、
   *  玩家反复经过都捡不起来。返回 true 表示本帧触发了磁吸。 */
  private tryMagnet(dt: number, ctx: EntityCtx): boolean {
    if (this.age < INTERACT_COOLDOWN_S) return false;
    const dx = ctx.playerPos.x - this.pos.x;
    const dy = ctx.playerPos.y - this.pos.y;
    const dz = ctx.playerPos.z - this.pos.z;
    const horiz = Math.hypot(dx, dz);
    // 水平圆盘 + 垂直容差判定（原 3D 距离会把「上下差 1 格的台阶/坡地」顶出
    // 半径外——掉落物卡在边缘来回抖、永远差一点捡不起来）
    if (horiz >= MAGNET_RADIUS || Math.abs(dy) >= MAGNET_RADIUS) return false;
    if (horiz <= PICKUP_RADIUS && Math.abs(dy) <= PICKUP_VERT_TOLERANCE) return false; // 交给拾取

    const d = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), 1e-6);
    const step = Math.min(MAGNET_MAX_SPEED * dt, d); // 本帧吸附位移（不超剩余距离）
    this.pos.x += (dx / d) * step;
    this.pos.y += (dy / d) * step;
    this.pos.z += (dz / d) * step;
    this.vel.x = 0;
    this.vel.y = 0;
    this.vel.z = 0;
    return true;
  }

  /** 拾取请求：进入水平半径且垂直高差在容差内即尝试；背包满保持存活下帧重试 */
  private tryPickup(ctx: EntityCtx): boolean {
    if (this.dead) return true;
    if (this.age < INTERACT_COOLDOWN_S) return false;
    if (!withinReach(this.pos, ctx.playerPos, PICKUP_RADIUS, PICKUP_VERT_TOLERANCE)) return false;

    if (ctx.tryPickup(this)) {
      this.dead = true; // main 据此发 pickup 成功信号并移出列表
      return true;
    }
    return false;
  }

  /**
   * 同 key 合堆：距离 <0.5 且双方均过冷却期时，把数量小者并入数量大者，
   * 小者置 dead 由外部移除。ctx.drops 含自身（此处显式排除）。
   */
  private mergeNearby(ctx: EntityCtx): void {
    if (this.age < MERGE_COOLDOWN_S) return;
    for (const other of ctx.drops) {
      if (other === this || other.dead) continue;
      if (other.age < MERGE_COOLDOWN_S) continue;
      if (other.stack.key !== this.stack.key) continue;
      if (dist(this.pos, other.pos) > MERGE_RADIUS) continue;

      if (other.stack.count > this.stack.count) {
        // 并入对方，自身消失
        other.stack.count += this.stack.count;
        this.dead = true;
        return;
      }
      // 吸收对方，自身保留并继续扫描
      this.stack.count += other.stack.count;
      other.dead = true;
    }
  }
}

function dist(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** 拾取可达判定：水平圆盘（horizR）+ 垂直高差容差（vertTol） */
function withinReach(a: Vec3, b: Vec3, horizR: number, vertTol: number): boolean {
  return Math.hypot(a.x - b.x, a.z - b.z) <= horizR && Math.abs(a.y - b.y) <= vertTol;
}
