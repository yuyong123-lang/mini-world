// render/particles.ts —— 挖掘碎屑粒子系统（W10 / T102，契约 §11）
//
// 结构参照 sky.ts：一个挂到 renderer.scene 的系统类，main 每帧调 update(dt)。
//
// 实现选型：单个 THREE.Points + BufferGeometry 动态 attribute（position+color），
// PointsMaterial({ vertexColors, sizeAttenuation }) —— 整个系统恒定一次 draw call。
// 池固定 maxParticles（默认 200），粒子的运动学数据存放在与几何体解耦的平行数组里
// （geometry 的 position attribute 每帧被「压缩写入」，不能当规范存储用，见 update 注释），
// 渲染层每帧写回 attribute 并 setDrawRange(0, 存活数)，死亡粒子无需逐个隐藏。
// 全程零对象分配：spawn 与 update 都只读写预分配的 TypedArray（池化强制）。
//
// 接线指引（main，本模块不做）：
//   const particles = new ParticleSystem(renderer);
//   bus.on('blockBroken', ({ pos, id }) => {
//     const def = BlockRegistry.get(id);
//     const atlasCanvas = renderer.atlasTexture.image as HTMLCanvasElement;
//     particles.spawnBreak({ x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 },
//       tileAverageColor(atlasCanvas, def.tex.top));
//   });
//   // 帧循环里 renderer.renderFrame(dt) 之前：particles.update(dt);
//   // renderer.dispose() 之前：particles.dispose();
//
// FIXME(main.ts)：帧循环里连续两次调用 sky.update(dt)（约 L405/L407，重复推进一次昼夜）。
// 不在本任务独占文件范围内，接线 ParticleSystem 时由持有 main.ts 的任务顺路修掉。

import * as THREE from 'three';
import { TILE_PX } from '../blocks/atlas';

/** 池容量上限（契约冻结：≤200） */
export const DEFAULT_MAX_PARTICLES = 200;
/** 单次破坏默认生成的粒子数（契约：12~16） */
export const DEFAULT_BREAK_COUNT = 14;
/** 粒子屏幕尺寸（世界单位） */
export const PARTICLE_SIZE = 0.12;
/** 粒子重力加速度（契约冻结为 -18/s²；与掉落物实体的 core/constants GRAVITY=-24 是两套参数） */
export const PARTICLE_GRAVITY = -18;
/** 最短寿命（秒） */
export const PARTICLE_LIFE_MIN = 0.6;
/** 额外寿命随机量（秒）：寿命 ∈ [0.6, 1.0] */
export const PARTICLE_LIFE_SPAN = 0.4;
/** 初速参数：水平扩散半径上限 / 初始向上速度 */
export const SPAWN_H_SPREAD = 2.5;
export const SPAWN_UP_SPEED = 3.5;
/** tileAverageColor 认定的「透明像素」alpha 下限（低于此值不参与平均色） */
const OPAQUE_ALPHA_MIN = 10;

/**
 * 单粒子运动学状态（纯逻辑用，可被 stepParticle 就地更新）。
 * 池内同构数据由平行数组承载，只在喂给纯函数时借这个临时形状。
 */
export interface ParticleState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

/**
 * 半隐式欧拉积分一步（先更新速度再更新位置，重力下更稳定）。
 * 返回 true 表示仍存活；false 表示寿命耗尽（同时把 life 钳回 0，保证状态一致）。
 * 纯函数、零依赖：node 测试直接覆盖；ParticleSystem.update 内部复用同一实现。
 */
export function stepParticle(
  p: ParticleState,
  dt: number,
  gravity: number = PARTICLE_GRAVITY,
): boolean {
  if (!(dt > 0)) return p.life > 0;
  if (p.life <= 0) {
    p.life = 0;
    return false; // 已死粒子再步进是幂等的：不再积分也不再位移
  }
  p.vy += gravity * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;
  p.life -= dt;
  if (p.life <= 0) {
    p.life = 0;
    return false;
  }
  return true;
}

export interface SpawnVelocityOpts {
  /** 水平扩散速度上限（各分量包络）；默认 SPAWN_H_SPREAD */
  hSpread?: number;
  /** 初始向上速度基准；实际 vy ∈ [0.55, 1.0] × upSpeed；默认 SPAWN_UP_SPEED */
  upSpeed?: number;
}

/**
 * 破坏碎屑的初速采样：水平方向在圆盘内均匀取角 + 内切均匀幅值（sqrt 保证面密度均匀），
 * 垂直分量向上并带少量抖动。纯函数（依赖注入的 rng），同 seed 序列输出逐项一致。
 */
export function spawnVelocity(
  rng: () => number,
  opts: SpawnVelocityOpts = {},
): { vx: number; vy: number; vz: number } {
  const h = opts.hSpread ?? SPAWN_H_SPREAD;
  const up = opts.upSpeed ?? SPAWN_UP_SPEED;
  const angle = rng() * Math.PI * 2;
  const radius = Math.sqrt(rng()) * h;
  const vy = up * (0.55 + 0.45 * rng());
  return {
    vx: Math.cos(angle) * radius,
    vy,
    vz: Math.sin(angle) * radius,
  };
}

/**
 * 从池中选槽位的环形扫描策略（抽出来供 node 测试，ParticleSystem 只做薄封装）。
 *
 * 规则：
 * 1. 从 head 起顺时针找第一个死槽位——优先复用紧邻的空位，保持时序大致有序；
 * 2. 扫满一圈仍全活（池满）→ 覆盖 head 指向的最老粒子，即「超容量时复用最老」的验收语义。
 *
 * @param alive  池存活标志位（原地不变，只读）
 * @param head   当前环形写指针
 * @returns slot 本次使用的槽位；nextHead 新写指针；evicted 是否发生了最老粒子覆写
 */
export function allocSlot(
  alive: ArrayLike<number>,
  head: number,
): { slot: number; nextHead: number; evicted: boolean } {
  const cap = alive.length;
  if (cap <= 0) throw new Error('粒子池容量必须 > 0');
  const start = ((head % cap) + cap) % cap;
  for (let i = 0; i < cap; i++) {
    const idx = (start + i) % cap;
    if (!alive[idx]) {
      return { slot: idx, nextHead: (idx + 1) % cap, evicted: false };
    }
  }
  return { slot: start, nextHead: (start + 1) % cap, evicted: true };
}

/** 池内每粒子的颜色（linear-space RGB，写入前已转换），平铺成 3*cap */
type ColorTable = Float32Array;

export interface ParticleSystemOpts {
  /** 池容量，默认 200 */
  maxParticles?: number;
  /** rng 注入点（默认 Math.random）；传入 mulberry32(seed) 可确定性回放 */
  rng?: () => number;
}

/**
 * 挖掘碎屑粒子系统。构造期一次性建好 Points/BufferGeometry/材质，运行期零分配。
 * 对 renderer 的真实依赖只有 scene 一个成员，因此收结构化参数而非完整 Renderer 类型
 * （测试/Worker 侧可用任意带 scene 的对象替换）。
 */
export class ParticleSystem {
  readonly maxParticles: number;

  private readonly rng: () => number;
  private readonly alive: Uint8Array;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly colors: ColorTable;

  private readonly points: THREE.Points;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.PointsMaterial;
  private readonly positionAttr: THREE.BufferAttribute;
  private readonly colorAttr: THREE.BufferAttribute;

  /** 环形写指针 */
  private head = 0;
  private count = 0;
  /** 池满导致的「最老粒子被覆写」次数（验收观测口：超 200 必然 > 0） */
  exhaustedOverwrites = 0;
  /** 上次 update 后attribute 是否需要重传（含 spawn 过但还没画一帧的情况） */
  private uploadDirty = false;
  private disposed = false;

  /** 复用的换算色对象，避免每次 spawn 分配 THREE.Color */
  private readonly tmpColor = new THREE.Color();
  /** 复用的积分临时状态（模块级单线程约定，见文件头注释） */
  private readonly scratch: ParticleState = {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0,
  };

  constructor(
    rendererLike: { scene: THREE.Scene },
    opts: ParticleSystemOpts = {},
  ) {
    const max = Math.floor(opts.maxParticles ?? DEFAULT_MAX_PARTICLES);
    if (!(max > 0)) throw new Error('maxParticles 必须 > 0');
    this.maxParticles = max;
    this.rng = opts.rng ?? Math.random;

    this.alive = new Uint8Array(max);
    this.px = new Float32Array(max);
    this.py = new Float32Array(max);
    this.pz = new Float32Array(max);
    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.vz = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.colors = new Float32Array(max * 3);

    this.geometry = new THREE.BufferGeometry();
    // 初始包围球为空：粒子云位置随事件离散出现，靠 frustumCulled=false 兜底而非每帧算球
    this.positionAttr = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
    this.colorAttr = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
    this.positionAttr.setUsage(THREE.DynamicDrawUsage);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.positionAttr);
    this.geometry.setAttribute('color', this.colorAttr);
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.PointsMaterial({
      vertexColors: true,
      size: PARTICLE_SIZE,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.matrixAutoUpdate = false;
    rendererLike.scene.add(this.points);
  }

  /**
   * 在方块中心炸开一圈碎屑。count 默认 14（契约 12~16）；池满时按环形顺序覆写最老粒子。
   * colorHex 为 0xRRGGBB（通常来自 tileAverageColor），内部一次性转 linear 后摊给整批粒子。
   */
  spawnBreak(pos: { x: number; y: number; z: number }, colorHex: number, count: number = DEFAULT_BREAK_COUNT): void {
    if (this.disposed) return;
    this.tmpColor.setHex(colorHex); // setHex 默认按 sRGB 输入转工作色彩空间
    const cr = this.tmpColor.r;
    const cg = this.tmpColor.g;
    const cb = this.tmpColor.b;
    const n = Math.min(Math.max(Math.floor(count), 0), this.maxParticles);
    for (let k = 0; k < n; k++) {
      const { slot, nextHead, evicted } = allocSlot(this.alive, this.head);
      if (evicted) {
        this.exhaustedOverwrites++;
        this.count--;
      }
      this.head = nextHead;
      const v = spawnVelocity(this.rng);
      this.alive[slot] = 1;
      this.px[slot] = pos.x;
      this.py[slot] = pos.y;
      this.pz[slot] = pos.z;
      this.vx[slot] = v.vx;
      this.vy[slot] = v.vy;
      this.vz[slot] = v.vz;
      const life = PARTICLE_LIFE_MIN + this.rng() * PARTICLE_LIFE_SPAN;
      this.life[slot] = life;
      this.maxLife[slot] = life;
      this.colors[slot * 3] = cr;
      this.colors[slot * 3 + 1] = cg;
      this.colors[slot * 3 + 2] = cb;
      this.count++;
    }
    this.uploadDirty = true;
  }

  /**
   * 积分 + 回收 + 把存活粒子压缩写回渲染 attribute。
   * 「压缩」是关键：环形分配使存活粒子槽位不连续，而 setDrawRange 只认连续区间，
   * 所以每帧把存活粒子顺序誊写到 attribute 前部，drawRange 才能精确等于存活数
   * （单遍扫 cap ≤ 200，成本忽略不计），死粒子天然隐藏，不需要逐顶点操作。
   */
  update(dt: number): void {
    if (this.disposed) return;
    const cap = this.maxParticles;
    const posArr = this.positionAttr.array as Float32Array;
    const colArr = this.colorAttr.array as Float32Array;
    const s = this.scratch;
    let w = 0; // 存活粒子的紧凑写游标

    for (let i = 0; i < cap; i++) {
      if (this.alive[i] === 0) continue;
      s.x = this.px[i];
      s.y = this.py[i];
      s.z = this.pz[i];
      s.vx = this.vx[i];
      s.vy = this.vy[i];
      s.vz = this.vz[i];
      s.life = this.life[i];
      s.maxLife = this.maxLife[i];

      const stillAlive = stepParticle(s, dt, PARTICLE_GRAVITY);

      if (stillAlive) {
        this.px[i] = s.x;
        this.py[i] = s.y;
        this.pz[i] = s.z;
        this.vx[i] = s.vx;
        this.vy[i] = s.vy;
        this.vz[i] = s.vz;
        this.life[i] = s.life;
        posArr[w * 3] = s.x;
        posArr[w * 3 + 1] = s.y;
        posArr[w * 3 + 2] = s.z;
        colArr[w * 3] = this.colors[i * 3];
        colArr[w * 3 + 1] = this.colors[i * 3 + 1];
        colArr[w * 3 + 2] = this.colors[i * 3 + 2];
        w++;
      } else {
        this.alive[i] = 0;
        this.count--;
      }
    }

    this.geometry.setDrawRange(0, w);
    if (w > 0 || this.uploadDirty) {
      this.positionAttr.needsUpdate = true;
      this.colorAttr.needsUpdate = true;
    }
    this.uploadDirty = false;
  }

  /** 当前存活粒子数 */
  activeCount(): number {
    return this.count;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.count = 0;
    this.alive.fill(0);
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * 取图集 canvas 上第 tileIndex 个 tile 的平均色 → 0xRRGGBB。
 * 跳过 alpha<10 的像素（裂纹/玻璃/树叶这类带透明孔的 tile 若不剔除会把平均色拉黑）。
 * 无任何有效像素或 tile 越界则抛错（属于调用方 bug，静默返回会掩盖问题）。
 * 注意入参必须是持有像素数据的 canvas 本体——main 里用
 * `renderer.atlasTexture.image as HTMLCanvasElement` 传入。
 */
export function tileAverageColor(atlasCanvas: HTMLCanvasElement, tileIndex: number): number {
  if (!Number.isInteger(tileIndex) || tileIndex < 0) {
    throw new Error(`tileAverageColor: tileIndex 非法（${tileIndex}）`);
  }
  const ctx = atlasCanvas.getContext('2d');
  if (!ctx) throw new Error('tileAverageColor: 图集 canvas 缺少 2D 上下文');

  // 标准 256×256 图集即 ATLAS_GRID=16；cols 按实际宽重算是为了容忍非整图集的测试画布
  const cols = Math.max(1, Math.floor(atlasCanvas.width / TILE_PX));
  const rows = Math.max(1, Math.floor(atlasCanvas.height / TILE_PX));
  if (tileIndex >= cols * rows) {
    throw new Error(
      `tileAverageColor: tileIndex ${tileIndex} 超出 ${cols}×${rows} 图集容量 ${cols * rows}`,
    );
  }
  const x0 = (tileIndex % cols) * TILE_PX;
  const y0 = Math.floor(tileIndex / cols) * TILE_PX;

  const img = ctx.getImageData(x0, y0, TILE_PX, TILE_PX);
  const d = img.data;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < OPAQUE_ALPHA_MIN) continue;
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
    n++;
  }
  if (n === 0) {
    throw new Error(`tileAverageColor: tile ${tileIndex} 无非透明像素，无法取样平均色`);
  }
  return (
    (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n)
  );
}
