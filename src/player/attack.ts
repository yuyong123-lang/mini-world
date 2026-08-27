// player/attack.ts —— 玩家近战命中判定（T83）
//
// 无状态纯函数：攻击冷却 0.5s 由调用方(main)控制，本文件不持有任何计时状态。
// 解耦原则：不直接调 e.hurt(amount, from)——命中结果经 onHit 回调交给调用侧，
// 由它决定 hurt 来源坐标、事件广播与受击红闪等表现层副作用。
//
// FIXME(契约): interfaces.md §12 的冻结签名是
//   tryAttack(player: PlayerController, dir, targets, heldTool, emitters{onMobHurt})，
//   无返回值；W8 任务卡改为「eyePos 显式传入 + onHit 回调 + boolean 返回值」，
//   以便在纯 node 环境下单测（不必实例化 PlayerController）。集成波(T91)接线时
//   以本文件签名为准并同步修订契约文档。
//
// 目标面为结构鸭子类型：真实 Entity(src/entities/entity.ts) 天然满足，
//   测试也可用普通对象。AABB 优先取目标自报的 aabb()，否则按
//   「pos 为脚底中心锚点」约定派生（x/z ±width/2，y 起 pos.y 高 height）。

import type { AABBox, Vec3 } from '../core/types';
import type { ToolSpec } from '../items/items';

/** 最大挥砍距离(m)，T83 冻结值 */
export const ATTACK_RANGE = 3;
/** 徒手伤害（architecture §2.8 武器伤害行） */
export const FIST_DAMAGE = 1;

/** 可被攻击目标的最小结构面 */
export interface Hittable {
  /** 脚底中心坐标（与 Entity.pos 同约定） */
  pos: Vec3;
  width: number;
  height: number;
  dead?: boolean;
  hp?: number;
  /** 有则优先使用（Entity.aabb() 已存在则直接复用，避免双份派生公式漂移） */
  aabb?(): AABBox;
}

/** 契约 §12 风格的容器形（集成侧把实体表包一成即可传给外部工具函数） */
export interface AttackTargets {
  entities: Hittable[];
}

/**
 * 伤害规则对照（architecture §2.8：拳 1 / 木剑 5 / 石剑 7）：
 * - 无工具（null/undefined/'hand' 类空手态）           → 1
 * - sword                                             → tool.damage（木剑 5 / 石剑 7）
 * - 其他手持工具（镐/斧/铲类）                         → ⌈tool.damage / 2⌉（挥砍减半，向上取整保底 1）
 *   例：木镐 2→1、石镐 3→2、木斧 3→2。
 */
export function meleeDamage(heldTool: ToolSpec | null | undefined): number {
  if (!heldTool) return FIST_DAMAGE;
  if (heldTool.type === 'sword') {
    return validDmg(heldTool.damage, heldTool.damage);
  }
  if (heldTool.type === 'hand') return FIST_DAMAGE;
  const half = Math.ceil(validDmg(heldTool.damage, 0) / 2);
  return Math.max(FIST_DAMAGE, half);
}

/** damage 字段合法性兜底：非法值回退 fallback */
function validDmg(v: number, fallback: number): number {
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** 取目标的 AABB：优先自报 aabb()，否则按脚底中心锚点派生 */
function targetBox(t: Hittable): AABBox {
  if (typeof t.aabb === 'function') return t.aabb();
  const hw = t.width / 2;
  return {
    minX: t.pos.x - hw,
    minY: t.pos.y,
    minZ: t.pos.z - hw,
    maxX: t.pos.x + hw,
    maxY: t.pos.y + t.height,
    maxZ: t.pos.z + hw,
  };
}

/**
 * slab 法射线-AABB 相交：返回进入距离 t（0 表示起点已在盒内），未相交返回 null。
 * 区间收敛于 [tEnter, tExit]，初值即攻击射程窗口 [0, ATTACK_RANGE]。
 */
function rayHitT(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  b: AABBox,
  maxDist: number,
): number | null {
  let tEnter = 0;
  let tExit = maxDist;

  // 对 X/Y/Z 三组平行板各做一次区间裁剪；任一轴变空即无交
  const axes: [number, number, number, number][] = [
    [ox, dx, b.minX, b.maxX],
    [oy, dy, b.minY, b.maxY],
    [oz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (d > -1e-9 && d < 1e-9) {
      if (o < lo || o > hi) return null; // 平行于该组板且不在板间
      continue;
    }
    const inv = 1 / d;
    let t1 = (lo - o) * inv;
    let t2 = (hi - o) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tEnter) tEnter = t1;
    if (t2 < tExit) tExit = t2;
    if (tEnter > tExit) return null;
  }
  return tEnter;
}

/**
 * 尝试近战攻击：从 eyePos 沿 dir 检测最近的可打实体（射程 3 格）。
 *
 * @returns 是否命中了至少一个实体；true 时恰好触发一次 onHit（取射线参数 t 最小者，
 *          并列时取数组序靠前者）。targets 为空、方向为零向量、全员脱靶或已死 → false。
 */
export function tryAttack(
  eyePos: Vec3,
  dir: Vec3,
  targets: readonly Hittable[],
  heldTool: ToolSpec | null | undefined,
  onHit: (e: Hittable, dmg: number) => void,
): boolean {
  const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
  if (!(len > 1e-6)) return false;
  const dx = dir.x / len;
  const dy = dir.y / len;
  const dz = dir.z / len;

  let best: Hittable | null = null;
  let bestT = Infinity;
  for (const t of targets) {
    if (!t || t.dead) continue;
    const hitT = rayHitT(eyePos.x, eyePos.y, eyePos.z, dx, dy, dz, targetBox(t), ATTACK_RANGE);
    if (hitT !== null && hitT < bestT) {
      bestT = hitT;
      best = t;
    }
  }

  if (!best) return false;
  onHit(best, meleeDamage(heldTool));
  return true;
}
