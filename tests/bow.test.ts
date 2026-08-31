// tests/bow.test.ts —— 弓蓄力曲线 + 箭投射物命中逻辑
import { describe, expect, it } from 'vitest';
import {
  BOW_FULL_CHARGE_S,
  BOW_MAX_DAMAGE,
  BOW_MAX_SPEED,
  BOW_MIN_CHARGE_S,
  BOW_MIN_DAMAGE,
  BOW_MIN_SPEED,
  bowShot,
} from '../src/player/bow';
import { findRayHit, tryAttack } from '../src/player/attack';
import { ArrowEntity, ARROW_GRAVITY, ARROW_RECOVER_CHANCE } from '../src/entities/arrows';
import type { Hittable } from '../src/player/attack';
import type { ItemStack, Vec3 } from '../src/core/types';
import type { ArrowCtx } from '../src/entities/arrows';

const O: Vec3 = { x: 0, y: 0, z: 0 };

/** 平地体素世界：y<0 实心（isSolid 语义），其余空气 */
class FlatWorld {
  isSolid(x: number, y: number, z: number): boolean {
    void x;
    void z;
    return y < 0;
  }
  getBlock(x: number, y: number, z: number): number {
    return this.isSolid(x, y, z) ? 1 : 0;
  }
}

describe('bowShot 蓄力曲线', () => {
  it('起步以下（含 NaN/负值）→ 哑火 null', () => {
    expect(bowShot(0)).toBeNull();
    expect(bowShot(0.24)).toBeNull();
    expect(bowShot(NaN)).toBeNull();
    expect(bowShot(-1)).toBeNull();
  });

  it('起步恰好返回起步值', () => {
    expect(bowShot(BOW_MIN_CHARGE_S)).toEqual({ speed: BOW_MIN_SPEED, damage: BOW_MIN_DAMAGE });
  });

  it('满蓄返回满值；过蓄钳制在满值', () => {
    const full = bowShot(BOW_FULL_CHARGE_S);
    expect(full).toEqual({ speed: BOW_MAX_SPEED, damage: BOW_MAX_DAMAGE });
    const over = bowShot(10);
    expect(over).toEqual({ speed: BOW_MAX_SPEED, damage: BOW_MAX_DAMAGE });
  });

  it('中点蓄力线性插值（0.625s → 半程）', () => {
    const mid = bowShot((BOW_MIN_CHARGE_S + BOW_FULL_CHARGE_S) / 2);
    expect(mid?.speed).toBeCloseTo((BOW_MIN_SPEED + BOW_MAX_SPEED) / 2, 5);
    expect(mid?.damage).toBeCloseTo((BOW_MIN_DAMAGE + BOW_MAX_DAMAGE) / 2, 5);
  });
});

describe('findRayHit（近战/箭共用命中检测）', () => {
  const box = (x: number): Hittable => ({
    pos: { x, y: 0, z: 0 },
    width: 0.6,
    height: 1.8,
  });

  it('直线命中最近者；全脱靶返回 null', () => {
    const near = box(2);
    const far = box(5);
    const hit = findRayHit(O, { x: 1, y: 0, z: 0 }, [far, near], 10);
    expect(hit?.target).toBe(near);
    expect(hit?.dist).toBeCloseTo(1.7, 5);
    expect(findRayHit(O, { x: 1, y: 0, z: 0 }, [box(-5)], 10)).toBeNull();
  });

  it('dead 目标被跳过', () => {
    const dead: Hittable = { ...box(2), dead: true };
    expect(findRayHit(O, { x: 1, y: 0, z: 0 }, [dead], 10)).toBeNull();
  });

  it('tryAttack 重构后行为不变：命中回调一次', () => {
    const t = box(2);
    const got: Hittable[] = [];
    const hit = tryAttack(O, { x: 1, y: 0, z: 0 }, [t], null, (e) => got.push(e));
    expect(hit).toBe(true);
    expect(got).toHaveLength(1);
  });
});

describe('ArrowEntity', () => {
  function mkCtx(
    targets: readonly Hittable[] = [],
    world: { isSolid(x: number, y: number, z: number): boolean } = new FlatWorld(),
  ): { ctx: ArrowCtx; dropped: ItemStack[] } {
    const dropped: ItemStack[] = [];
    return {
      ctx: {
        world,
        playerPos: O,
        tryPickup: () => true,
        drops: [],
        now: () => 0,
        targets,
        spawnDrop: (stack, pos) => {
          void pos;
          dropped.push(stack);
        },
      },
      dropped,
    };
  }

  it('重力持续作用：vel.y 逐帧递减', () => {
    const { ctx } = mkCtx();
    const a = new ArrowEntity(O, { x: 0, y: 0, z: 1 }, 20, 5);
    const before = a.vel.y;
    a.tick(0.1, ctx);
    expect(a.vel.y).toBeCloseTo(before + ARROW_GRAVITY * 0.1, 5);
  });

  it('命中实体：目标掉血、箭消失', () => {
    const target: Hittable = { ...{ pos: O, width: 0.6, height: 1.8 }, hp: 10 };
    const hurt = vi(target);
    const { ctx } = mkCtx([target]);
    // 起点 -0.5 朝 +X：首子步射线（余量 0.48）即可扫到目标盒前缘（x=-0.3）
    const a = new ArrowEntity({ x: -0.5, y: 0.9, z: 0 }, { x: 1, y: 0, z: 0 }, 20, 5);
    a.tick(0.05, ctx);
    expect(hurt.calls).toBeGreaterThanOrEqual(1);
    expect(a.dead).toBe(true);
  });

  it('命中方块（平地向下射）：按概率掉落可捡箭', () => {
    const { ctx, dropped } = mkCtx();
    const a = new ArrowEntity({ x: 0, y: 0.4, z: 0 }, { x: 0, y: -1, z: 0 }, 10, 3, { rng: () => 0.1 });
    a.tick(0.1, ctx);
    expect(a.dead).toBe(true);
    expect(a.stuck).toBe(true);
    expect(dropped.some((s) => s.key === 'ITEM_ARROW')).toBe(true);
  });

  it('命中方块但 roll≥0.6：不掉落', () => {
    const { ctx, dropped } = mkCtx();
    const a = new ArrowEntity({ x: 0, y: 0.4, z: 0 }, { x: 0, y: -1, z: 0 }, 10, 3, { rng: () => ARROW_RECOVER_CHANCE });
    a.tick(0.1, ctx);
    expect(a.dead).toBe(true);
    expect(dropped).toHaveLength(0);
  });

  it('超时回收', () => {
    // 深空世界（y<-5000 才实心）：20s 内不会撞地，隔离寿命逻辑
    const deep = { isSolid(x: number, y: number, z: number): boolean { void x; void z; return y < -5000; } };
    const { ctx } = mkCtx([], deep);
    const a = new ArrowEntity({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 1, 1);
    a.tick(10, ctx);
    expect(a.dead).toBe(false); // 10s < 20s
    a.tick(10.1, ctx);
    expect(a.dead).toBe(true);
  });
});

/** 极简 spy：包装 hurt 计数 */
function vi(target: Hittable & { hp?: number }): { calls: number } {
  const state = { calls: 0 };
  (target as unknown as { hurt(d: number, from?: Vec3): void }).hurt = () => {
    state.calls++;
  };
  return state;
}
