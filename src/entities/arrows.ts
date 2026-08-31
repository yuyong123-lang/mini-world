// entities/arrows.ts —— 箭投射物（弓的弹药实体）
//
// 与 DropEntity 同模式：继承 Entity 仅复用物理面（pos/vel/盒），hurt 空覆写
// （箭不可被攻击）；tick 自带寿命/重力/子步命中扫描。
//
// 命中判定复用 player/attack.findRayHit（与近战同一套 slab 数学）与
// player/interact.ddaRaycast（方块步进，AIR/WATER 穿透语义免费获得）。
// 命中方块的箭有概率可捡回（spawnDrop 回调注入），防止弹药无谓损耗。

import { ddaRaycast } from '../player/interact';
import { findRayHit, type Hittable } from '../player/attack';
import { ITEMS } from '../items/items';
import type { ItemStack, Vec3 } from '../core/types';
import { Entity, type EntityCtx } from './entity';

/** 箭的重力（格/s²）：弱于实体重力，弹道更平直 */
export const ARROW_GRAVITY = -18;
/** 箭最长飞行寿命（秒）：超时原地消失（防弹道怪异时永久残留） */
export const ARROW_MAX_LIFE_S = 20;
/** 命中方块的箭被捡回的概率（<roll 时掉落可拾） */
export const ARROW_RECOVER_CHANCE = 0.6;
/** 子步最大步长（格）：高速下防穿实体/方块 */
const SUBSTEP = 0.4;

/** 箭 tick 上下文：收窄版 EntityCtx 再扩展投射物所需（同 MonsterCtx 模式） */
export interface ArrowCtx extends EntityCtx {
  /** 可被命中的目标（动物/怪物；箭不伤玩家——玩家不在表里即天然豁免） */
  targets: readonly Hittable[];
  /** 掉落注入（main 侧转 DropEntity），用于捡回箭 */
  spawnDrop(stack: ItemStack, pos: Vec3): void;
}

export class ArrowEntity extends Entity {
  /** 伤害（发射时由蓄力曲线决定） */
  readonly damage: number;
  /** 是否已命中（贴在命中点等待回收） */
  stuck = false;
  private age = 0;
  private readonly rng: () => number;

  constructor(origin: Vec3, dir: Vec3, speed: number, damage: number, opts?: { rng?: () => number }) {
    super(origin, { width: 0.1, height: 0.1 }, Infinity);
    this.damage = damage;
    this.rng = opts?.rng ?? Math.random;
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    this.vel.x = (dir.x / len) * speed;
    this.vel.y = (dir.y / len) * speed;
    this.vel.z = (dir.z / len) * speed;
  }

  /** 箭不可被攻击（同 DropEntity 模式） */
  override hurt(_amount: number, _from?: Vec3): void {}

  override tick(dt: number, ctx: ArrowCtx): void {
    if (this.dead || !(dt > 0)) return;
    this.age += dt;
    if (this.age >= ARROW_MAX_LIFE_S) {
      this.dead = true;
      return;
    }

    // 弹道重力
    this.vel.y += ARROW_GRAVITY * dt;

    // 子步扫描：每步先实体命中（射线）再方块命中（体素步进），步长≤SUBSTEP 防穿
    const dist = Math.hypot(this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    const n = Math.max(1, Math.ceil(dist / SUBSTEP));
    const sdt = dt / n;

    for (let i = 0; i < n; i++) {
      if (this.dead) break;
      // 1) 实体命中：沿本子步方向扫一发短射线（长度 = 本子步位移再留一点余量）
      const stepLen = Math.hypot(this.vel.x, this.vel.y, this.vel.z) * sdt;
      if (stepLen > 1e-6) {
        const hit = findRayHit(
          this.pos,
          { x: this.vel.x, y: this.vel.y, z: this.vel.z },
          ctx.targets,
          stepLen + 0.15, // 命中余量：弥补盒体细小导致的边缘漏检
        );
        if (hit) {
          (hit.target as unknown as { hurt(d: number, from?: Vec3): void }).hurt(
            this.damage,
            this.pos,
          );
          this.dead = true; // 命中实体的箭消失（MC 同款不回收）
          return;
        }
      }

      // 2) 方块命中：实体未中再看本子步末尾是否进入实心体素
      const nx = this.pos.x + this.vel.x * sdt;
      const ny = this.pos.y + this.vel.y * sdt;
      const nz = this.pos.z + this.vel.z * sdt;
      const hitBlock = ddaRaycast(
        (x, y, z) => (ctx.world.isSolid(x, y, z) ? 1 : 0),
        this.pos,
        { x: this.vel.x, y: this.vel.y, z: this.vel.z },
        stepLen + 0.05,
      );
      if (hitBlock.hit) {
        // 插在命中面附近，按概率掉落可捡
        this.pos.x = nx;
        this.pos.y = ny;
        this.pos.z = nz;
        if (this.rng() < ARROW_RECOVER_CHANCE) {
          ctx.spawnDrop({ key: ITEMS.ARROW, count: 1 }, { ...this.pos });
        }
        this.dead = true;
        this.stuck = true;
        return;
      }

      // 3) 无命中：正常推进
      this.pos.x = nx;
      this.pos.y = ny;
      this.pos.z = nz;
    }
  }
}
