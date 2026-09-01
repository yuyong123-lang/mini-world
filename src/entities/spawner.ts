// entities/spawner.ts —— 出生调度器（T83）
//
// 职责边界：本模块只做「候选点采样 + 合法性判定 + 数量上限拦截」，通过回调把
// 合法出生点交给集成层(main)，绝不直接 new Mob/Animal——实体生命周期与渲染归集成侧。
//
// FIXME(依赖): World 目前没有地表高度查询（world.findSpawnY 是构造期 spawn 用途，
//   会读 chunk 表，语义不同），而 terragen.surfaceHeight 依赖模块级噪声 init 状态，
//   直接 import 会在未来 worker 化时踩坑。因此地面高度改为构造器注入 groundY(x,z)
//   （集成侧用 `terrangen.surfaceHeight(x,z)+1` 包装传入即可），属必选项。
//
// 坐标约定：groundY 返回「可站立脚底 Y」= 该列最高实心方块 y + 1；
//   故「支撑地面方块」位于 (x, groundY-1, z)。与 World.findSpawnY(+2 缓冲)、
//   Entity.pos(脚底中心锚点) 的口径对齐方式见 architecture §2.6。
//
// 上限/环带数值出处：architecture §2.6（怪 12 / 动物 20 / >48m despawn）、
//   任务卡 T83（动物环带 [16,32]、怪物环带 [24,40]、尝试节流 ≥0.5s）。

import { BLOCK } from '../blocks/registry';
import { SEA_LEVEL } from '../core/constants';
import type { Vec3 } from '../core/types';
import type { AnimalSpeciesKey } from './animals';

/** 相邻两次出生尝试之间的最小间隔(s)：内部 accumulator 语义 */
export const SPAWN_ATTEMPT_INTERVAL = 0.5;
/** 每次尝试内最多考察多少个候选点（舍入后落出环带 / 地面不合格即换点） */
const CANDIDATES_PER_ATTEMPT = 8;
/** despawn 缺省距离(m)——architecture §2.6 冻结值 */
export const DESPAWN_DIST = 48;
/** 动物缺省存活上限（原 20；成群刷新后上调，保证成群观感与实体量预算的平衡） */
export const ANIMAL_CAP_DEFAULT = 24;
/** 群成员采样偏移上限（格）：成员落在群心 ±HERD_SPREAD 的整数邻域内 */
const HERD_SPREAD = 3;

/** 物种刷怪权重表条目（总权重任意，采样时归一化） */
export interface SpeciesWeight {
  key: AnimalSpeciesKey;
  weight: number;
}

/** 缺省物种权重（无区域注入时 = 历史 pig/cow/sheep 等权行为） */
const DEFAULT_SPECIES_WEIGHTS: readonly SpeciesWeight[] = [
  { key: 'pig', weight: 1 },
  { key: 'cow', weight: 1 },
  { key: 'sheep', weight: 1 },
];

const TAU = Math.PI * 2;

/** spawner 需要的最小世界面（src/world/world.ts 的 World 天然满足此签名） */
export interface SpawnerWorld {
  getBlock(x: number, y: number, z: number): number;
  isSolid(x: number, y: number, z: number): boolean;
}

export interface SpawnOpts {
  /**
   * 地面高度查询（必选）：(x,z) 列的「可站立脚底 Y」。
   * 集成波接线建议：(x, z) => terragen.surfaceHeight(Math.floor(x), Math.floor(z)) + 1。
   */
  groundY: (x: number, z: number) => number;
  /** 动物存活上限（缺省 24；原 §2.6 值 20 已因成群刷新上调） */
  animalCap?: number;
  /** 怪物存活上限（architecture §2.6：12） */
  monsterCap?: number;
  /** 供清理循环使用的 despawn 距离(m)；本身不参与出生逻辑（§2.6：48） */
  despawnDist?: number;
  /** 动物出生环带（水平距玩家 min~max），默认 [16,32] */
  animalRing?: [number, number];
  /** 怪物出生环带，默认 [24,40] */
  monsterRing?: [number, number];
  /**
   * 自定义「地面适合刷动物」谓词；缺省为「支撑方块是 GRASS」（T83 规格）。
   * 传入后完全接管动物地面过滤（如做雪原生物群系差异），海平面门槛仍然生效。
   * 区域注入建议：region.animalGround 包含判定（如骆驼可刷在 SAND 上）。
   */
  spawnAnimalOnGround?: (p: Vec3) => boolean;
  /**
   * 区域物种权重表（中国区域系统）：按权重采样本群物种。
   * 缺省 pig/cow/sheep 等权（与历史行为一致）。
   */
  speciesWeights?: readonly SpeciesWeight[];
  /** 成群刷新：每群规模区间（闭区间，含端点）；缺省 [2,4] */
  animalHerd?: [number, number];
  /** 随机源注入（默认 Math.random）；单测传 mulberry32(seed) 保证可复现 */
  rng?: () => number;
}

export interface SpawnCounts {
  animal: number;
  monster: number;
}

/**
 * despawn 判定纯函数（>dist 视为离线，集成侧据此把实体置 dead 并清理）。
 * 三维欧氏距离；等于阈值不算超界（architecture 口径「>48m」才强制回收）。
 */
export function shouldDespawn(pos: Vec3, playerPos: Vec3, dist: number = DESPAWN_DIST): boolean {
  const dx = pos.x - playerPos.x;
  const dy = pos.y - playerPos.y;
  const dz = pos.z - playerPos.z;
  return dx * dx + dy * dy + dz * dz > dist * dist;
}

export class Spawner {
  readonly animalCap: number;
  readonly monsterCap: number;
  readonly despawnDist: number;
  /** 成群规模区间（闭区间） */
  readonly animalHerd: [number, number];
  /**
   * 暂停动物刷新（main 在动物死亡时置 true，延迟数秒后置 false）——
   * 「尸体倒地 → 别处补充」的节奏控制，避免死亡瞬间原地立即冒出新动物。
   */
  animalSpawnPaused = false;

  private readonly world: SpawnerWorld;
  private readonly groundY: (x: number, z: number) => number;
  private readonly animalRing: [number, number];
  private readonly monsterRing: [number, number];
  private readonly animalGroundFn: ((p: Vec3) => boolean) | null;
  private readonly speciesWeights: readonly SpeciesWeight[];
  /** 权重总和（构造期一次算好，采样时前缀和遍历） */
  private readonly speciesWeightTotal: number;
  private readonly rng: () => number;

  private acc = 0;
  private animalCbs: Array<(pos: Vec3, species: AnimalSpeciesKey) => void> = [];
  private monsterCbs: Array<(pos: Vec3) => void> = [];

  constructor(world: SpawnerWorld, opts: SpawnOpts) {
    if (!opts || typeof opts.groundY !== 'function') {
      throw new TypeError('Spawner 必须注入 opts.groundY(x,z)（避免对 terragen 模块级 init 的静态依赖）');
    }
    this.world = world;
    this.groundY = opts.groundY;
    this.animalCap = opts.animalCap ?? ANIMAL_CAP_DEFAULT;
    this.monsterCap = opts.monsterCap ?? 12;
    this.despawnDist = opts.despawnDist ?? DESPAWN_DIST;
    this.animalRing = opts.animalRing ? [opts.animalRing[0], opts.animalRing[1]] : [16, 32];
    this.monsterRing = opts.monsterRing ? [opts.monsterRing[0], opts.monsterRing[1]] : [24, 40];
    this.animalGroundFn = opts.spawnAnimalOnGround ?? null;
    // 权重表防御性收紧：仅保留正权重条目；全空回落缺省表
    const w = (opts.speciesWeights ?? DEFAULT_SPECIES_WEIGHTS).filter(
      (e) => Number.isFinite(e.weight) && e.weight > 0,
    );
    this.speciesWeights = w.length > 0 ? w : DEFAULT_SPECIES_WEIGHTS;
    this.speciesWeightTotal = this.speciesWeights.reduce((s, e) => s + e.weight, 0);
    this.animalHerd = opts.animalHerd
      ? [Math.max(1, opts.animalHerd[0]), Math.max(1, opts.animalHerd[1])]
      : [2, 4];
    this.rng = opts.rng ?? Math.random;
  }

  /** 动物出生回调：pos 为成员出生点，species 供集成侧选择物种外观/数值 */
  onSpawnAnimal(cb: (pos: Vec3, species: AnimalSpeciesKey) => void): void {
    this.animalCbs.push(cb);
  }

  onSpawnMonster(cb: (pos: Vec3) => void): void {
    this.monsterCbs.push(cb);
  }

  /**
   * 每帧入口。白天只试动物、夜间只试怪物；出生尝试被节流到每 ≥0.5s 一次
   * （accumulator 封顶即「落后太多也不补帧」，防止卡顿恢复瞬间集中爆量出生）。
   */
  tick(dt: number, playerPos: Vec3, isNight: boolean, counts: SpawnCounts): void {
    if (!(dt > 0)) return;
    this.acc = Math.min(this.acc + dt, SPAWN_ATTEMPT_INTERVAL);
    if (this.acc < SPAWN_ATTEMPT_INTERVAL) return;
    this.acc = 0;

    if (isNight) this.tryMonsters(playerPos, counts);
    else this.tryAnimals(playerPos, counts);
  }

  /**
   * 动物：仅白天；海平面之上的 GRASS 面（或自定义谓词放行）。
   * 成群刷新：首个合法点作为群心，随机选定物种后按 [animalHerd] 区间采样
   * 邻近成员，逐个过同一套合法性校验后逐个 emit；全程受 animalCap 钳制，
   * 至少群心 1 只成行才算本次尝试成功。
   */
  private tryAnimals(playerPos: Vec3, counts: SpawnCounts): void {
    if (this.animalSpawnPaused) return; // 补充延迟期间不刷（尸体倒地 → 稍后在别处补充）
    if (counts.animal >= this.animalCap) return;
    for (let i = 0; i < CANDIDATES_PER_ATTEMPT; i++) {
      const heart = this.sampleInRing(playerPos, this.animalRing);
      if (!heart || !this.animalSpotOk(heart)) continue;

      const species = this.pickSpecies();
      const [hMin, hMax] = this.animalHerd;
      const herdSize = hMin + Math.floor(this.rng() * (hMax - hMin + 1));

      let emitted = 0;
      for (let m = 0; m < herdSize && counts.animal + emitted < this.animalCap; m++) {
        const p = m === 0 ? heart : this.sampleNear(heart);
        if (!p || !this.animalSpotOk(p)) continue;
        this.emitAnimal(p, species);
        emitted++;
      }
      if (emitted > 0) return;
    }
  }

  /** 动物出生点合法性（群心与成员共用）：海平面之上 + 地面谓词 + 身位两格悬空 */
  private animalSpotOk(pos: Vec3): boolean {
    // 地表干燥度：支撑地面方块不低于海平面（terragen 只在 h>=SEA_LEVEL 才长草）
    if (pos.y - 1 < SEA_LEVEL) return false;
    const groundOk = this.animalGroundFn
      ? this.animalGroundFn(pos)
      : this.world.getBlock(pos.x, pos.y - 1, pos.z) === BLOCK.GRASS;
    if (!groundOk) return false;
    // 身位两格（脚 + 头）必须悬空
    return !this.world.isSolid(pos.x, pos.y, pos.z) && !this.world.isSolid(pos.x, pos.y + 1, pos.z);
  }

  /** 物种权重采样：前缀和遍历（区域表至多 ~4 条，线性足够） */
  private pickSpecies(): AnimalSpeciesKey {
    let roll = this.rng() * this.speciesWeightTotal;
    for (const e of this.speciesWeights) {
      roll -= e.weight;
      if (roll < 0) return e.key;
    }
    return this.speciesWeights[this.speciesWeights.length - 1]!.key;
  }

  /** 群成员采样：群心 ±HERD_SPREAD 整数偏移，y 按 groundY 重算（不做合法性判断，交给调用方） */
  private sampleNear(heart: Vec3): Vec3 {
    const x = Math.floor(heart.x + Math.floor(this.rng() * (2 * HERD_SPREAD + 1)) - HERD_SPREAD);
    const z = Math.floor(heart.z + Math.floor(this.rng() * (2 * HERD_SPREAD + 1)) - HERD_SPREAD);
    return { x, y: this.groundY(x, z), z };
  }

  /** 怪物：仅夜间；任意干燥可站立方块（不过滤草），脚下 solid、身位两格悬空 */
  private tryMonsters(playerPos: Vec3, counts: SpawnCounts): void {
    if (counts.monster >= this.monsterCap) return;
    for (let i = 0; i < CANDIDATES_PER_ATTEMPT; i++) {
      const pos = this.sampleInRing(playerPos, this.monsterRing);
      if (!pos) continue;
      if (!this.world.isSolid(pos.x, pos.y - 1, pos.z)) continue; // 脚下要有承重
      if (this.world.isSolid(pos.x, pos.y, pos.z) || this.world.isSolid(pos.x, pos.y + 1, pos.z)) continue;
      this.emit(this.monsterCbs, pos);
      return;
    }
  }

  /**
   * 环带采样：随机角度 + [min,max] 随机半径 → 体素列整数化 → 取 groundY。
   * 整数舍入可能把点推出环带（半径边缘最大偏 ~0.71/轴），为保证「cb 收到的坐标
   * 与玩家的距离一定落在环带内」（T83 验收：采样合法性），不合格直接返回 null 让
   * 上层换下一个候选。
   * 注意环带度量是水平(XZ)距离：地形起伏带来的 y 差不计入（despawn 用三维距离）。
   */
  private sampleInRing(playerPos: Vec3, ring: [number, number]): Vec3 | null {
    const rMin = Math.max(0, ring[0]);
    const rMax = Math.max(rMin, ring[1]);
    const ang = this.rng() * TAU;
    const rad = rMin + this.rng() * (rMax - rMin);

    const cx = Math.floor(playerPos.x + Math.cos(ang) * rad);
    const cz = Math.floor(playerPos.z + Math.sin(ang) * rad);

    const dx = cx - playerPos.x;
    const dz = cz - playerPos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < rMin * rMin || d2 > rMax * rMax) return null;

    return { x: cx, y: this.groundY(cx, cz), z: cz };
  }

  /** 每个回调发独立克隆，防共享引用被某个监听者原地改坏 */
  private emit(cbs: Array<(pos: Vec3) => void>, pos: Vec3): void {
    for (const cb of cbs) cb({ x: pos.x, y: pos.y, z: pos.z });
  }

  /** 动物版 emit：额外携带物种键（同一群共享同一物种） */
  private emitAnimal(pos: Vec3, species: AnimalSpeciesKey): void {
    for (const cb of this.animalCbs) cb({ x: pos.x, y: pos.y, z: pos.z }, species);
  }
}
