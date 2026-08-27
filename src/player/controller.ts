// 第一人称玩家控制器——Pointer Lock 视角 + WASD 移动 + 跳跃疾跑（契约 §12 / 任务 T22）
//
// ── 坐标约定（three.js 右手系，-Z 为初始视线方向，全项目唯一出处就在下面两行公式）──
//   lookDir(yaw,pitch) = ( -sin(yaw)·cos(pitch),  sin(pitch),  -cos(yaw)·cos(pitch) )
//   移动方向 = lookDir 的水平投影归一化：前 = (-sin yaw, -cos yaw)，右 = ( cos yaw, -sin yaw)
// 即移动向量始终是视线方向的平面投影，保证「准星指哪走哪」；
// 验收锚点：yaw=0 且仅按 W ⇒ (0,-1)；yaw=π/2 且仅按 W ⇒ (-1,0)；pitch=π/2 时 lookDir=(0,1,0)。
import { GRAVITY, JUMP_SPEED, SPRINT_SPEED, WALK_SPEED } from '../core/constants';
import type { Vec3 } from '../core/types';
import { moveWithCollisions } from '../physics/collide';
import type { PhysicsBody } from '../physics/collide';

/** 视角灵敏度（弧度/像素），任务 T22 指定 0.0022 */
const MOUSE_SENS = 0.0022;
/** pitch 夹持极限：±89° ≈ ±1.5533 rad（防止过顶翻转出现万向锁） */
const PITCH_LIMIT = 1.5533;
/** 眼高（格）。注意：契约 constants.ts 没有 EYE_HEIGHT，故就地定义；
 *  pos 锚点是「脚底中心」，所以眼睛 = pos + 1.62 */
const EYE_HEIGHT = 1.62;
/** 玩家碰撞盒尺寸（契约 §10：AABB 由脚底中心锚点 + width/height 推导） */
const PLAYER_WIDTH = 0.6;
const PLAYER_HEIGHT = 1.8;
/** 水平速度向目标值平滑逼近的每秒系数：tick 内取插值系数 min(1, dt×K)，K=12 手感偏灵敏 */
const HORIZ_ACCEL_PER_SEC = 12;
/** 默认出生点。契约 §12 未写构造器，故采用可选参数 Partial<Vec3>，
 *  缺省落在 (8,40,8) 的空中由重力落到地表（8,8 是 chunk 内典型安全列） */
const DEFAULT_SPAWN: Vec3 = { x: 8, y: 40, z: 8 };
/** 生命/饥饿初值上限；增减逻辑全部归 survival 系统（T61），本卡只持有字段 */
const FULL_STAT = 20;

/** 输入合成所需的按键快照（keys Set 的布尔投影，便于纯函数测试） */
export interface MoveKeysState {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
}

/**
 * 由朝向与 WASD 合成水平单位移动方向（世界系 X/Z）。纯函数，供 tick 内部与单测共用。
 * @returns 归一化后的 {x,z}；无任何按键时返回 (0,0)
 */
export function computeMoveDir(
  yaw: number,
  keysState: MoveKeysState,
): { x: number; z: number } {
  const f = (keysState.w ? 1 : 0) - (keysState.s ? 1 : 0);
  const r = (keysState.d ? 1 : 0) - (keysState.a ? 1 : 0);
  if (f === 0 && r === 0) return { x: 0, z: 0 };

  // 前=(-sin yaw,-cos yaw)、右=(cos yaw,-sin yaw)：与 lookDir 水平投影严格一致
  const x = -Math.sin(yaw) * f + Math.cos(yaw) * r;
  const z = -Math.cos(yaw) * f - Math.sin(yaw) * r;
  const len = Math.hypot(x, z);
  return len > 0 ? { x: x / len, z: z / len } : { x: 0, z: 0 };
}

/** 当前速度档（格/秒）：冲刺 SPRINT_SPEED，否则 WALK_SPEED。纯函数便于单测 */
export function computeSpeed(sprinting: boolean): number {
  return sprinting ? SPRINT_SPEED : WALK_SPEED;
}

export class PlayerController implements PhysicsBody {
  /** 脚底中心锚点（PhysicsBody 约定） */
  pos: Vec3;
  vel: Vec3;
  yaw = 0;
  pitch = 0;
  hp = FULL_STAT;
  hunger = FULL_STAT;
  spawnPoint: Vec3;
  readonly width = PLAYER_WIDTH;
  readonly height = PLAYER_HEIGHT;
  onGround = false;
  sprinting = false;
  /** 跳跃回调池：T61 统计跳跃次数经 addJumpHook 登记 */
  onJumpHooks: Array<() => void> = [];

  /** 当前按下的键（KeyboardEvent.code）；由 bind 的监听器维护，也可经 setKey 注入 */
  private readonly keys = new Set<string>();
  /** 是否处于 pointer lock（决定 mousemove 是否生效） */
  private locked = false;
  /** 已绑定的 DOM 根，用于幂等 bind 与 lock 校验 */
  private boundRoot: HTMLElement | null = null;

  /** 本卡监听的键位集合（E 只记录按下沿状态，背包接线由集成完成） */
  private static readonly TRACKED_CODES: ReadonlySet<string> = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'KeyE',
  ]);

  constructor(spawn?: Partial<Vec3>) {
    this.spawnPoint = {
      x: spawn?.x ?? DEFAULT_SPAWN.x,
      y: spawn?.y ?? DEFAULT_SPAWN.y,
      z: spawn?.z ?? DEFAULT_SPAWN.z,
    };
    this.pos = { x: this.spawnPoint.x, y: this.spawnPoint.y, z: this.spawnPoint.z };
    this.vel = { x: 0, y: 0, z: 0 };
  }

  /**
   * 绑定输入：点击进入指针锁定；mousemove 只在锁定期间累积 yaw/pitch；keydown/up 维护按键表。
   * 幂等：对同一元素重复调用不叠加监听器。
   */
  bind(domRoot: HTMLElement): void {
    if (this.boundRoot === domRoot) return;
    this.boundRoot = domRoot;

    domRoot.addEventListener('click', () => {
      try {
        const req: unknown = domRoot.requestPointerLock();
        if (req instanceof Promise) req.catch(() => {}); // 浏览器拒绝锁定时的 Promise 形式
      } catch {
        /* 同步抛错的老实现同样忽略 */
      }
    });

    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur); // 失焦清空按键，防止“卡键”漂移
  }

  /** 测试与集成注入口：与一次真实按下/抬起等效，不走 DOM 事件 */
  setKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  private readonly onLockChange = (): void => {
    this.locked = this.boundRoot !== null && document.pointerLockElement === this.boundRoot;
    if (!this.locked) this.keys.clear();
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    this.yaw -= e.movementX * MOUSE_SENS;
    this.pitch -= e.movementY * MOUSE_SENS;
    if (this.pitch > PITCH_LIMIT) this.pitch = PITCH_LIMIT;
    else if (this.pitch < -PITCH_LIMIT) this.pitch = -PITCH_LIMIT;
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!PlayerController.TRACKED_CODES.has(e.code)) return;
    if (e.code === 'Space') e.preventDefault(); // 空格默认会滚动页面
    this.keys.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.keys.clear();
  };

  /** 单帧推进：输入合成 → 目标水平速度平滑 → 重力/跳跃 → 分轴碰撞移动 */
  tick(dt: number, world: { isSolid(x: number, y: number, z: number): boolean }): void {
    if (!Number.isFinite(dt)) return;
    const step = Math.max(0, dt);

    const keysState: MoveKeysState = {
      w: this.keys.has('KeyW'),
      a: this.keys.has('KeyA'),
      s: this.keys.has('KeyS'),
      d: this.keys.has('KeyD'),
    };
    const f = (keysState.w ? 1 : 0) - (keysState.s ? 1 : 0);

    // FIXME(W6): 冲刺还要求 hunger>0；survival 数值系统未接线前先不含 hunger 条件，
    // 届时改成 this.sprinting = shift && f>0 && this.hunger>0 并在耗尽时打断冲刺
    this.sprinting = this.keys.has('ShiftLeft') && f > 0;

    const dir = computeMoveDir(this.yaw, keysState);
    const speed = computeSpeed(this.sprinting);
    const k = Math.min(1, step * HORIZ_ACCEL_PER_SEC); // 帧率无关的平滑系数
    this.vel.x += (dir.x * speed - this.vel.x) * k;
    this.vel.z += (dir.z * speed - this.vel.z) * k;

    this.vel.y += GRAVITY * step;

    // 必须在 moveWithCollisions 之前判定：后者会把 onGround 重置为本帧结论
    if (this.keys.has('Space') && this.onGround) {
      this.vel.y = JUMP_SPEED;
      for (const fn of this.onJumpHooks) fn();
    }

    moveWithCollisions(this, step, world);
  }

  /** 登记跳跃回调（供 T61 统计），返回.removeEventListener 语义的解绑函数 */
  addJumpHook(fn: () => void): () => void {
    this.onJumpHooks.push(fn);
    return () => {
      const i = this.onJumpHooks.indexOf(fn);
      if (i >= 0) this.onJumpHooks.splice(i, 1);
    };
  }

  /** 回到出生点并重置状态（死亡/掉入虚空统一入口） */
  respawn(): void {
    this.pos = { x: this.spawnPoint.x, y: this.spawnPoint.y, z: this.spawnPoint.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.hp = FULL_STAT;
    this.hunger = FULL_STAT;
    this.yaw = 0;
    this.pitch = 0;
    this.sprinting = false;
  }

  /** 相机眼位 = 脚底中心上方 EYE_HEIGHT（1.62 格） */
  eyePosition(): Vec3 {
    return { x: this.pos.x, y: this.pos.y + EYE_HEIGHT, z: this.pos.z };
  }

  /** 视线单位向量（three.js 右手系，见文件头坐标约定） */
  lookDir(out: Vec3): void {
    const cp = Math.cos(this.pitch);
    out.x = -Math.sin(this.yaw) * cp;
    out.y = Math.sin(this.pitch);
    out.z = -Math.cos(this.yaw) * cp;
  }
}
