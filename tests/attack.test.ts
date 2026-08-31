// tests/attack.test.ts —— T83 玩家近战命中判定单测
// 覆盖：射线-AABB 命中、最近者优先、横向偏差脱靶、伤害规则（拳/剑/镐）、射程、空表。

import { describe, expect, it, vi } from 'vitest';
import type { Vec3 } from '../src/core/types';
import type { ToolSpec } from '../src/items/items';
import { tryAttack } from '../src/player/attack';

/** 与 Entity 同约定的最小目标：pos 脚底中心、width/height、可选 aabb() */
function target(x: number, y: number, z: number, width = 0.6, height = 1.8) {
  return {
    pos: { x, y, z },
    width,
    height,
    hp: 20,
    dead: false,
    aabb() {
      const hw = width / 2;
      return {
        minX: this.pos.x - hw, minY: this.pos.y, minZ: this.pos.z - hw,
        maxX: this.pos.x + hw, maxY: this.pos.y + this.height, maxZ: this.pos.z + hw,
      };
    },
  };
}

const EYE: Vec3 = { x: 0, y: 40.6, z: 0 };           // 眼位（脚底 y=40 之上 1.6）
const FWD: Vec3 = { x: 1, y: 0, z: 0 };              // 朝 +x 平视
const SWORD_WOOD: ToolSpec = { type: 'sword', tier: 1, speedMul: 1, damage: 5 };
const SWORD_STONE: ToolSpec = { type: 'sword', tier: 2, speedMul: 1, damage: 7 };
const PICK_WOOD: ToolSpec = { type: 'pickaxe', tier: 1, speedMul: 2, damage: 2 };
const PICK_STONE: ToolSpec = { type: 'pickaxe', tier: 2, speedMul: 4, damage: 3 };
const AXE_WOOD: ToolSpec = { type: 'axe', tier: 1, speedMul: 2, damage: 3 };

describe('tryAttack 命中与伤害', () => {
  it('正前 2m 单实体命中：木剑 dmg=5', () => {
    const e = target(2, 40, 0);
    const onHit = vi.fn();
    const hit = tryAttack(EYE, FWD, [e], SWORD_WOOD, onHit);
    expect(hit).toBe(true);
    expect(onHit).toHaveBeenCalledTimes(1);
    expect(onHit).toHaveBeenCalledWith(e, 5); // 木剑 5（architecture §2.8）
  });

  it('石剑 dmg=7；两实体前后排列命中 t 更小者（近者）', () => {
    const far = target(2.6, 40, 0);
    const near = target(1.4, 40, 0);
    const onHit = vi.fn();
    // 数组故意把远者放前面，验证排序无关、按射线 t 取最小
    const hit = tryAttack(EYE, FWD, [far, near], SWORD_STONE, onHit);
    expect(hit).toBe(true);
    expect(onHit).toHaveBeenCalledTimes(1);
    expect(onHit.mock.calls[0][0].pos.x).toBe(1.4);
    expect(onHit).toHaveBeenLastCalledWith(near, 7);
  });

  it('近战兜底锥：平视擦顶的近距目标可命中；锥角外/超距不命中', () => {
    // 正前 2m、横向偏 0.6（half-width=0.3，射线不扫过盒体）——
    // 兜底锥（水平 <2.5 且夹角 <45°）内，平视擦顶也算命中（贴身挥拳语义）
    const offside = target(2, 40, 0.6);
    const onHit = vi.fn();
    expect(tryAttack(EYE, FWD, [offside], SWORD_WOOD, onHit)).toBe(true);
    expect(onHit).toHaveBeenCalled();

    // 锥角外：横向偏 3（夹角 ≈56° > 45°）→ 不命中
    const behindSide = target(2, 40, 3);
    expect(tryAttack(EYE, FWD, [behindSide], SWORD_WOOD, onHit)).toBe(false);

    // 超出兜底距离（3m）且射线不扫过盒体（横偏 0.6 > half-width）→ 不命中
    const farGrazing = target(3, 40, 0.6);
    expect(tryAttack(EYE, FWD, [farGrazing], SWORD_WOOD, onHit)).toBe(false);

    // 边界内（偏 0.29 < 0.3）贴边命中
    const grazing = target(2, 40, 0.29);
    expect(tryAttack(EYE, FWD, [grazing], SWORD_WOOD, onHit)).toBe(true);
  });

  it('徒手 dmg=1；镐/斧取 ⌈damage/2⌉ 且至少 1', () => {
    const cases: [ToolSpec | null | undefined, number][] = [
      [null, 1],
      [undefined, 1],
      [{ type: 'hand', tier: 1, speedMul: 1, damage: 0 }, 1], // 空手态 ToolSpec
      [PICK_WOOD, 1],   // ⌈2/2⌉=1
      [PICK_STONE, 2],  // ⌈3/2⌉=2
      [AXE_WOOD, 2],    // ⌈3/2⌉=2
    ];
    for (const [tool, expected] of cases) {
      const onHit = vi.fn();
      const ok = tryAttack(EYE, FWD, [target(2, 40, 0)], tool, onHit);
      expect(ok).toBe(true);
      expect(onHit).toHaveBeenCalledWith(expect.anything(), expected);
    }
  });

  it('超过最大射程 3 格不命中（盒近面 >= 3 才算出界）', () => {
    // 出界实体：pos.x=4 → 盒近面 4-0.3=3.7 > 射程
    const outOfReach = target(4, 40, 0);
    // 贴界实体：pos.x=2.9 → 近面 2.6，t≈2.6 命中
    const edge = target(2.9, 40, 0);
    const onHit = vi.fn();
    expect(tryAttack(EYE, FWD, [outOfReach], SWORD_WOOD, onHit)).toBe(false);
    expect(tryAttack(EYE, FWD, [edge], SWORD_WOOD, onHit)).toBe(true);

    // 远近混合时只返回范围内那一个
    const onHit2 = vi.fn();
    expect(tryAttack(EYE, FWD, [outOfReach, edge], SWORD_WOOD, onHit2)).toBe(true);
    expect(onHit2.mock.calls[0][0].pos.x).toBe(2.9);
  });

  it('空 targets / 全员已死 / 零向量方向 → false 且不触发回调', () => {
    const onHit = vi.fn();
    expect(tryAttack(EYE, FWD, [], SWORD_WOOD, onHit)).toBe(false);

    const dead = target(2, 40, 0);
    dead.dead = true;
    expect(tryAttack(EYE, FWD, [dead], SWORD_WOOD, onHit)).toBe(false);

    expect(tryAttack(EYE, { x: 0, y: 0, z: 0 }, [target(2, 40, 0)], SWORD_WOOD, onHit)).toBe(false);
    expect(onHit).not.toHaveBeenCalled();
  });
});
