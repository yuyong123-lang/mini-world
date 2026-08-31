// 物理碰撞求解器——玩家/动物/怪物/掉落物共用的分轴扫掠 AABB 移动（契约 §10）
// 体素约定：方块 (x,y,z) 占据整数闭区间 [x,x+1)×[y,y+1)×[z,z+1)；
// 实体脚底 y 恰为整数时视为「站在该整数面之上」，不算与下方体素相交。
import type { Vec3 } from '../core/types';

/** 物理体：AABB 由脚底中心锚点 pos 与 width/height 推导 */
export interface PhysicsBody {
  /** 脚底中心锚点 */
  pos: Vec3;
  vel: Vec3;
  /** X/Z 方向盒宽 */
  width: number;
  height: number;
  onGround: boolean;
}

/** 碰撞器所需的最小世界查询面（World.isSolid 满足此签名） */
export interface SolidQuery {
  isSolid(x: number, y: number, z: number): boolean;
}

/** 单个子步最大位移（格）：超过即拆分子步，防止高速穿墙 */
const SUBSTEP_DIST = 0.5;
/** 统一接触间隙（格）；同时用于体素枚举时排除盒体 max 端的「贴面误判下一格」 */
const EPS = 1e-7;
/**
 * 单帧子步数上限（防病态输入造成超长循环）。
 * 触发上限时仍保留完整位移（单步长度放大），仅精度退化——
 * 即速度超过 ~128 格/帧（约 7680 格/s）才可能出现穿墙，远超玩法速度。
 */
const MAX_SUBSTEPS = 256;

/**
 * 新位置盒体覆盖到的整数体素里是否有实心块。
 * 半开区间语义：恰好与某面齐平（距离为 0）不算重叠——
 * min 端 floor(v+EPS)、max 端 floor(v-EPS)，两侧的 EPS 同时吸收浮点舍入噪声。
 * 导出：main 的卡方块自救必须用同一判定（旧版只查中心一点，存在偏心嵌入盲区：
 * 碰撞侧全盒堵死 → vel 每帧清零 → 冻结，而单点自救永远不触发）。
 */
export function solidInBox(
  world: SolidQuery,
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number,
): boolean {
  const x0 = Math.floor(minX + EPS), x1 = Math.floor(maxX - EPS);
  const y0 = Math.floor(minY + EPS), y1 = Math.floor(maxY - EPS);
  const z0 = Math.floor(minZ + EPS), z1 = Math.floor(maxZ - EPS);
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (world.isSolid(x, y, z)) return true;
      }
    }
  }
  return false;
}

/**
 * 分轴（X→Z→Y）扫掠移动一个物理体：
 * - 先按总位移拆成 ≤SUBSTEP_DIST 的子步，逐子步、逐轴「试探 → 相交则贴合回退并清零该轴速度」；
 * - onGround 每次调用开头强制置 false，仅当本次发生 Y 轴向下碰撞时置 true；
 * - dt≤0 时只做 onGround 重置（onGround 表达的是「本次调用的结论」；
 *   静止站立者应持续以重力驱动 vel.y≈小负数 调用，从而每帧拿到 onGround=true）；
 * - 重力不在本函数内处理，由调用方先行修改 b.vel。
 */
export function moveWithCollisions(b: PhysicsBody, dt: number, world: SolidQuery): void {
  b.onGround = false;
  if (!Number.isFinite(dt) || dt <= 0) return;

  const dx = b.vel.x * dt;
  const dy = b.vel.y * dt;
  const dz = b.vel.z * dt;
  const dist = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  if (!Number.isFinite(dist) || dist === 0) return;

  // 子步拆分：任一轴向单步位移都不超过 SUBSTEP_DIST，故每个子步至多新进入一层体素
  const n = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(dist / SUBSTEP_DIST)));
  const sx = dx / n;
  const sy = dy / n;
  const sz = dz / n;
  const hw = b.width / 2;

  for (let i = 0; i < n; i++) {
    if (sx !== 0) sweepSide(b, world, hw, 'x', sx);
    if (sz !== 0) sweepSide(b, world, hw, 'z', sz);
    if (sy !== 0) sweepVertical(b, world, hw, sy);
  }
}

/** 水平单轴（x 或 z）单子步求解：试探 → 相交则贴合到阻挡体素表面并清零该轴速度 */
function sweepSide(b: PhysicsBody, world: SolidQuery, hw: number, axis: 'x' | 'z', d: number): void {
  const next = b.pos[axis] + d;
  const tx = axis === 'x' ? next : b.pos.x;
  const tz = axis === 'z' ? next : b.pos.z;
  if (!solidInBox(world, tx - hw, b.pos.y, tz - hw, tx + hw, b.pos.y + b.height, tz + hw)) {
    b.pos[axis] = next; // 无阻挡，整段子步位移通过
    return;
  }

  // 前缘（运动方向一侧）进入了哪个体素列，就贴合到它的迎风面
  // 负方向前缘是盒体 min 面：读法与 solidInBox 一致用 floor(lead+EPS)
  const lead = d > 0 ? next + hw : next - hw;
  const col = d > 0 ? Math.floor(lead - EPS) : Math.floor(lead + EPS);
  const snapped = d > 0 ? col - hw - EPS : col + 1 + hw + EPS;

  // 合理性校验：贴合结果不得把身体往反方向拖，也不得仍嵌在实体里（例如方块被放进实体体内）
  const sane = d > 0 ? snapped >= b.pos[axis] : snapped <= b.pos[axis];
  const fx = axis === 'x' ? snapped : b.pos.x;
  const fz = axis === 'z' ? snapped : b.pos.z;
  if (
    sane &&
    !solidInBox(world, fx - hw, b.pos.y, fz - hw, fx + hw, b.pos.y + b.height, fz + hw)
  ) {
    b.pos[axis] = snapped;
  }
  b.vel[axis] = 0;
}

/** 垂直单轴单子步求解：落地精确落到整数面上（不引入间隙），撞头留 EPS 间隙 */
function sweepVertical(b: PhysicsBody, world: SolidQuery, hw: number, d: number): void {
  const next = b.pos.y + d;
  if (
    !solidInBox(
      world,
      b.pos.x - hw, next, b.pos.z - hw,
      b.pos.x + hw, next + b.height, b.pos.z + hw,
    )
  ) {
    b.pos.y = next;
    return;
  }

  let snapped: number;
  if (d < 0) {
    // 下落：脚底进入的体素行（与前缘 min 面同读法），站到它的顶面（整数，无间隙、零误差）
    snapped = Math.floor(next + EPS) + 1;
  } else {
    // 上升：头顶进入的体素行，退回到其底面并留出 EPS 间隙
    snapped = Math.floor(next + b.height - EPS) - b.height - EPS;
  }

  const sane = d < 0 ? snapped <= b.pos.y : snapped >= b.pos.y;
  if (
    sane &&
    !solidInBox(
      world,
      b.pos.x - hw, snapped, b.pos.z - hw,
      b.pos.x + hw, snapped + b.height, b.pos.z + hw,
    )
  ) {
    b.pos.y = snapped;
  }
  b.vel.y = 0;
  if (d < 0) b.onGround = true;
}
