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

/** 视角灵敏度默认值（弧度/像素），任务 T22 指定 0.0022；运行期可经 setSensitivity 修改 */
const MOUSE_SENS_DEFAULT = 0.0022;
/** pitch 夹持极限：±89° ≈ ±1.5533 rad（防止过顶翻转出现万向锁） */
const PITCH_LIMIT = 1.5533;
/** 水中移速倍率（黏滞感） */
const SWIM_SPEED_MUL = 0.55;
/** 水中净浮力加速度（向上）：不按键时把玩家托向水面——漂浮泳姿的来源 */
const BUOYANCY_ACCEL = 6;
/** 眼睛浮出水面后的回落重力倍率：与浮力构成水面附近的软平衡（轻微起伏后稳定） */
const SWIM_SURFACE_GRAVITY_MUL = 0.25;
/** 水中垂直阻尼（每秒保留比例）——把上下震荡收敛成平稳漂浮，并限制沉速/上浮速度 */
const SWIM_DRAG_PER_SEC = 0.12;
/** 按住空格的水中上浮加速度（蹿出水面/跳上岸用） */
const SWIM_UP_ACCEL = 16;
/** 水中按住 Shift 的下潜加速度（潜到水底/冰面下） */
const SWIM_DIVE_ACCEL = 12;
/** 玩家是否处于水中（供摔落伤豁免/视图特效查询） */
// 字段声明在类内（见 inWater）
/** 眼高（格）。注意：契约 constants.ts 没有 EYE_HEIGHT，故就地定义；
 *  pos 锚点是「脚底中心」，所以眼睛 = pos + 1.62 */
const EYE_HEIGHT = 1.62;
/** 第三人称相机后撤距离（格） */
const CAM_BACK_DIST = 4.2;
/** 第三人称相机相对眼点的抬升（格）——越肩俯视感 */
const CAM_UP_DIST = 1.1;
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

    // 对齐既有锁定态：main boot 的「进入世界自动锁定」（lockPointer）先于本 bind
    // 执行——pointerlockchange 在下面的监听注册前就已发出，只靠事件会把 locked
    // 永久留在 false，mousemove 视角控制全灭（症状：进世界后视角转不动，
    // 手动解锁再锁定一次才恢复）。绑定即对齐，不再依赖错过的事件。
    this.locked = document.pointerLockElement === domRoot;

    domRoot.addEventListener('click', (e) => {
      // 面板打开期间：门控返回 true → 点击永远不锁定（鼠标保持可用）
      if (this.pointerLockGate?.()) return;
      // 只有直接点击画面（canvas）才请求指针锁定。此前任何点击（含冒泡上来的）
      // 都会触发锁定——背包/合成/熔炉面板里选物品、暂停菜单点按钮时鼠标会被
      // 突然抢走直接进游戏（面板遭强制关闭）。UI DOM 不是 canvas，天然被排除。
      if (!(e.target instanceof HTMLCanvasElement)) return;
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

  /**
   * 指针锁定门控（main 注入）：返回 true 时点击画面不请求锁定。
   * 用于「面板打开期间鼠标必须一直可用」——背包/合成/熔炉开着时，
   * 误点画面空白不会被拉回游戏，只能经面板自己的关闭路径（E 键）退出。
   */
  pointerLockGate: (() => boolean) | null = null;

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
    const sens = this.sensitivity ?? MOUSE_SENS_DEFAULT;
    this.yaw -= e.movementX * sens;
    this.pitch -= e.movementY * sens;
    if (this.pitch > PITCH_LIMIT) this.pitch = PITCH_LIMIT;
    else if (this.pitch < -PITCH_LIMIT) this.pitch = -PITCH_LIMIT;
  };

  /** 设置视角灵敏度（弧度/像素）；设置页（W10/T104）运行期生效入口 */
  setSensitivity(radPerPx: number): void {
    if (Number.isFinite(radPerPx) && radPerPx > 0) this.sensitivity = radPerPx;
  }
  private sensitivity: number | null = null;

  /** 视角模式：first=第一人称；third=第三人称越肩（相机后上方） */
  viewMode: 'first' | 'third' = 'first';
  toggleViewMode(): 'first' | 'third' {
    this.viewMode = this.viewMode === 'first' ? 'third' : 'first';
    return this.viewMode;
  }

  /**
   * 相机应处的位置：第一人称=眼睛；第三人称=眼睛沿视线的反方向后撤
   * CAM_BACK_DIST 并抬高 CAM_UP_DIST（越肩视角）。
   * @returns 是否被体素截断的信息由调用方处理（本方法只给理想点位）
   */
  cameraPosition(out: Vec3): Vec3 {
    const eye = this.eyePosition();
    if (this.viewMode === 'first') {
      out.x = eye.x;
      out.y = eye.y;
      out.z = eye.z;
      return out;
    }
    const dir: Vec3 = { x: 0, y: 0, z: 0 };
    this.lookDir(dir);
    out.x = eye.x - dir.x * CAM_BACK_DIST;
    out.y = eye.y - dir.y * CAM_BACK_DIST + CAM_UP_DIST;
    out.z = eye.z - dir.z * CAM_BACK_DIST;
    return out;
  }

  /** 是否处于水中（每帧 tick 更新）；摔落伤豁免与水下视觉可查询 */
  inWater = false;

  /** 诊断用：当前按住的键位列表（诊断 HUD 显示用） */
  debugKeys(): string {
    return this.keys.size === 0 ? '无' : [...this.keys].map((k) => k.replace('Key', '').replace('ShiftLeft', 'Shift')).join('+');
  }

  /** 诊断用：按键表大小 */
  debugKeyCount(): number {
    return this.keys.size;
  }

  /** 诊断用：当前输入合成的水平移动方向（与 tick 完全同源），鉴别 dir 恒 (0,0) 类故障 */
  debugMoveDir(): string {
    const keysState: MoveKeysState = {
      w: this.keys.has('KeyW'),
      a: this.keys.has('KeyA'),
      s: this.keys.has('KeyS'),
      d: this.keys.has('KeyD'),
    };
    const d = computeMoveDir(this.yaw, keysState);
    const f = (v: number): string => (Number.isFinite(v) ? v.toFixed(2) : 'NaN!');
    return `(${f(d.x)},${f(d.z)})`;
  }

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

  /**
   * 单帧推进：输入合成 → 目标水平速度平滑 → 重力/跳跃 → 分轴碰撞移动。
   * world 兼容收窄的 { isSolid } 或扩展的 { isSolid, isLiquid }——传后者时启用游泳物理。
   */
  tick(
    dt: number,
    world: {
      isSolid(x: number, y: number, z: number): boolean;
      isLiquid?(x: number, y: number, z: number): boolean;
    },
  ): void {
    if (!Number.isFinite(dt)) return;
    const step = Math.max(0, dt);

    // NaN 守卫：位置一旦被污染（异常数值传播），整个物理就永久静默失效——
    // 这正是"控制台无报错但角色不动"的可疑死因之一。检测到即重置到出生点。
    if (!Number.isFinite(this.pos.x + this.pos.y + this.pos.z)) {
      console.warn('[player] 位置 NaN，重置到出生点');
      this.pos.x = this.spawnPoint.x;
      this.pos.y = this.spawnPoint.y;
      this.pos.z = this.spawnPoint.z;
      this.vel.x = 0;
      this.vel.y = 0;
      this.vel.z = 0;
    }

    const keysState: MoveKeysState = {
      w: this.keys.has('KeyW'),
      a: this.keys.has('KeyA'),
      s: this.keys.has('KeyS'),
      d: this.keys.has('KeyD'),
    };

    // yaw/pitch NaN 防御：一旦被污染，computeMoveDir 返回 (0,0)——水平移动永久锁死
    // （vel 恒 0、pos 不动、键位诊断却一切正常），且视角消失。检测到即归零自救。
    if (!Number.isFinite(this.yaw) || !Number.isFinite(this.pitch)) {
      console.warn(`[player] 朝向 NaN（yaw=${this.yaw} pitch=${this.pitch}），归零自救`);
      this.yaw = Number.isFinite(this.yaw) ? this.yaw : 0;
      this.pitch = Number.isFinite(this.pitch) ? this.pitch : 0;
    }

    const f = (keysState.w ? 1 : 0) - (keysState.s ? 1 : 0);

    // FIXME(W6): 冲刺还要求 hunger>0；survival 数值系统未接线前先不含 hunger 条件，
    // 届时改成 this.sprinting = shift && f>0 && this.hunger>0 并在耗尽时打断冲刺
    this.sprinting = this.keys.has('ShiftLeft') && f > 0;

    // ---- 水检测（脚部或身体中心任一在液体中即视为"在水中"） ----
    const inWater = world.isLiquid
      ? world.isLiquid(
          Math.floor(this.pos.x),
          Math.floor(this.pos.y + 0.3),
          Math.floor(this.pos.z),
        ) ||
        world.isLiquid(
          Math.floor(this.pos.x),
          Math.floor(this.pos.y + this.height * 0.6),
          Math.floor(this.pos.z),
        )
      : false;
    this.inWater = inWater;

    const dir = computeMoveDir(this.yaw, keysState);
    const speed = computeSpeed(this.sprinting) * (inWater ? SWIM_SPEED_MUL : 1);
    const accel = inWater ? HORIZ_ACCEL_PER_SEC * 0.6 : HORIZ_ACCEL_PER_SEC;
    const k = Math.min(1, step * accel); // 帧率无关的平滑系数；水中更黏滞
    this.vel.x += (dir.x * speed - this.vel.x) * k;
    this.vel.z += (dir.z * speed - this.vel.z) * k;

    if (inWater) {
      // ---- 游泳物理：默认漂浮 ----
      // 平衡点在水面：眼睛仍在水下 → 净浮力向上托；眼睛浮出 → 弱重力轻微回落。
      // 垂直阻尼把这对上下震荡收敛成「稳稳漂在水面」的观感，绝不直接沉底。
      // 空格 = 用力上浮（可蹿出水面跳上岸）；Shift = 下潜（水底/冰面下探索）。
      const eyeY = this.pos.y + EYE_HEIGHT;
      const eyeInWater = world.isLiquid
        ? world.isLiquid(Math.floor(this.pos.x), Math.floor(eyeY), Math.floor(this.pos.z))
        : true; // 无 isLiquid 注入（纯 isSolid 世界）时保持旧的低重力行为，不产生浮力
      this.vel.y += eyeInWater
        ? BUOYANCY_ACCEL * step
        : GRAVITY * SWIM_SURFACE_GRAVITY_MUL * step;
      this.vel.y *= Math.pow(SWIM_DRAG_PER_SEC, step); // 指数阻尼，帧率无关
      if (this.keys.has('Space')) this.vel.y += SWIM_UP_ACCEL * step;
      else if (this.keys.has('ShiftLeft')) this.vel.y -= SWIM_DIVE_ACCEL * step; // 下潜为负向
    } else {
      this.vel.y += GRAVITY * step;
    }

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
