// T23 —— 准星选块（Amanatides & Woo 体素步进）与挖/放交互（契约 §1 BlockHit、§12 Interactor）
//
// ddaRaycast 为纯函数导出：T42 的 World.raycast 必须委托本函数，禁止另写一份 DDA（避免漂移）。
//
// FIXME(contract): interfaces.md §2 将 BlockDef.tool 定义为 Exclude<ToolType, 'hand'>，
//   但 blocks.json（及 §3 属性表）对 LEAVES/GLASS/GLOWBLOCK 实际给出 "hand"。
//   本文件把该值解释为「无工具类型要求」（任意工具的速度都生效），待数据侧统一后自然收敛。
// FIXME(contract): §12 的 update(..., targetEl: HTMLElement) 在此放宽为 HTMLElement | null
//   （HUD 进度条接线属集成波，允许先传 null 空》；调用方传 HTMLElement 完全向后兼容）。
//
// 集成约定（T31 main 装配时须知）：
// - 本类无场景句柄（契约构造签名没有 scene/container），高亮线框经公开字段 `highlight` 暴露，
//   由 main 自行 `renderer.scene.add(interactor.highlight)`；
// - 鼠标监听挂在 window 全程存在，但仅在 document.pointerLockElement 存在时才响应
//   （T22 PlayerController.bind 进入指针锁定后交互才激活）；
// - 本类只发事件（onBreak/onPlace/onUseCraftTable），绝不写世界——world.setBlock 由 main 的回调负责。

import {
  BoxGeometry,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Texture,
  Vector3,
} from 'three';
import { REACH } from '../core/constants';
import { CRACK_TILE_START } from '../blocks/atlas';
import type { BlockHit, ItemStack, Vec3 } from '../core/types';
import { BLOCK, BlockRegistry } from '../blocks/registry';
import type { BlockDef } from '../blocks/registry';

/**
 * Amanatides & Woo 体素步进射线。
 * 统一约定：方块 (x,y,z) 占据闭区间 [x,x+1)×[y,y+1)×[z,z+1)；dir 先归一化，
 * 因此 tMax/tDelta 都是「沿射线的真实距离」单位，直接与 maxDist 比较。
 *
 * 命中过滤：AIR 与 WATER 不可选中（穿透继续步进），其余任何 id 一律算命中
 * （含暂无渲染对应的未知扩展 id——防御式）。origin 越界（y<0 或 y≥64 等）照常步进，
 * 越界语义由调用方注入的 getBlock 决定。
 */
export function ddaRaycast(
  getBlock: (x: number, y: number, z: number) => number,
  origin: Vec3,
  dir: Vec3,
  maxDist: number,
): BlockHit {
  const miss = (): BlockHit => ({
    hit: false,
    pos: { x: 0, y: 0, z: 0 },
    prev: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 0 },
    blockId: BLOCK.AIR,
  });

  const len = Math.hypot(dir.x, dir.y, dir.z);
  if (!(len > 0) || !Number.isFinite(len)) return miss(); // 零向量/非有限方向：无法构成射线
  if (!Number.isFinite(origin.x + origin.y + origin.z)) return miss();

  const ox = origin.x, oy = origin.y, oz = origin.z;
  const dn = [dir.x / len, dir.y / len, dir.z / len];

  let vx = Math.floor(ox), vy = Math.floor(oy), vz = Math.floor(oz);

  // 边界决策：origin 本身就在可命中体素内 → 立即返回该体素，且 pos == prev ==
  // origin 所在体素自身（prev 不回退一格）、normal 为零向量（没有跨越的面）。
  // 该选择让「prev 是放置位」的语义保守化：放置方校验 prev 必须是 AIR 时会拒绝
  // （prev==pos 显然非空），不会误放卡脸方块。此判定不消耗 maxDist 距离。
  const startId = getBlock(vx, vy, vz);
  if (isSelectable(startId)) {
    return {
      hit: true,
      pos: { x: vx, y: vy, z: vz },
      prev: { x: vx, y: vy, z: vz },
      normal: { x: 0, y: 0, z: 0 },
      blockId: startId,
    };
  }

  const pv = [vx, vy, vz];
  const stepDir = [0, 0, 0];
  const tDelta = [0, 0, 0];
  const tMax = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    stepDir[a] = dn[a] > 0 ? 1 : dn[a] < 0 ? -1 : 0;
    // tDelta：穿过一整格所需的射线长度（|1/d|）；d==0 表示该轴永不跨界
    tDelta[a] = dn[a] === 0 ? Infinity : Math.abs(1 / dn[a]);
    // tMax 初始值：从 origin 到本轴下一格边界的射线长度
    if (dn[a] > 0) tMax[a] = (pv[a] + 1 - [ox, oy, oz][a]) / dn[a];
    else if (dn[a] < 0) tMax[a] = (pv[a] - [ox, oy, oz][a]) / dn[a];
    else tMax[a] = Infinity;
  }

  // 步数上限纯兜底（正常情形每步至少跨过一个有限 tMax，必然在 maxDist 处终止）
  const maxSteps = 256 + Math.ceil(Math.max(0, maxDist)) * 4;
  for (let i = 0; i < maxSteps; i++) {
    // 推进最小的 tMax 轴 = 下一个被穿越的格子边界；平局按 x<y<z 固定顺序（确定性）
    let axis = 0;
    if (tMax[1] < tMax[axis]) axis = 1;
    if (tMax[2] < tMax[axis]) axis = 2;
    const t = tMax[axis];
    if (t > maxDist) return miss(); // 下一跨界已在射程之外
    if (!Number.isFinite(t)) return miss(); // 三轴都无进展（病态输入）

    const px = pv[0], py = pv[1], pz = pv[2]; // 进入新体素前的体素（放置位）
    pv[axis] += stepDir[axis];
    tMax[axis] += tDelta[axis];

    const id = getBlock(pv[0], pv[1], pv[2]);
    if (isSelectable(id)) {
      const nrm = [0, 0, 0];
      nrm[axis] = -stepDir[axis]; // 面向玩家的面 = 步进方向的相反号
      return {
        hit: true,
        pos: { x: pv[0], y: pv[1], z: pv[2] },
        prev: { x: px, y: py, z: pz },
        normal: { x: nrm[0], y: nrm[1], z: nrm[2] },
        blockId: id,
      };
    }
  }
  return miss();
}

/** AIR 与 WATER 不可选中；其余 id 一律可选（含未知 id，防御式） */
function isSelectable(id: number): boolean {
  return id !== BLOCK.AIR && id !== BLOCK.WATER;
}

/** 与 three.PerspectiveCamera 结构兼容的最小相机面（duck typing，避免耦合渲染器实现） */
export interface CameraLike {
  position: Vec3;
  // 注意：three 的真实实现会调 target.set(x,y,z)——调用方必须传入 Vector3 实例，
  // 普通 {x,y,z} 字面量会抛 "target.set is not a function"。本接口签名收窄为 Vec3
  // 仅为 duck typing 便利（PerspectiveCamera 参数双变可赋值兼容）。
  getWorldDirection(target: Vec3): Vec3;
}

/** PlayerController 的最小交互面（契约 §12 子集） */
export interface PlayerLike {
  eyePosition(): Vec3;
  lookDir(out: Vec3): void;
}

/** World 的最小交互面（契约 §7 子集；setBlock 可选且 Interactor 不主动调用） */
export interface WorldLike {
  getBlock(x: number, y: number, z: number): number;
  isSolid(x: number, y: number, z: number): boolean;
  setBlock?(x: number, y: number, z: number, id: number): void;
}

/** W4 落地的 ToolSpec 形状子集（duck 读取，不 import items 模块避免超前依赖） */
interface ToolSpecLike {
  type?: unknown;
  speedMul?: unknown;
}

/** 从 ItemStack 上 duck 读取可选的 tool 字段（W4 前 ItemStack 类型尚无该字段） */
function heldToolSpec(held: ItemStack | null | undefined): ToolSpecLike | undefined {
  if (!held) return undefined;
  const t = (held as unknown as { tool?: ToolSpecLike }).tool;
  return t && typeof t === 'object' ? t : undefined;
}

/**
 * 相对挖速系数：
 * - 徒手或持有非工具物品 → 1；
 * - 方块无工具类型要求（def.tool 缺省，或数据侧写成 'hand'，见文件头 FIXME）→ 采用工具速度；
 * - 工具类型匹配 def.tool → speedMul；不匹配 → 1。
 * 异常 speedMul（非有限/≤0）按 1 处理。
 */
export function resolveToolSpeed(held: ItemStack | null, def: BlockDef | null): number {
  const tool = heldToolSpec(held);
  if (!tool) return 1;
  const mul =
    typeof tool.speedMul === 'number' && Number.isFinite(tool.speedMul) && tool.speedMul > 0
      ? tool.speedMul
      : 1;
  const need = def ? def.tool : undefined;
  if (!need || need === ('hand' as BlockDef['tool'])) return mul;
  return tool.type === need ? mul : 1;
}

/** 高亮态不挖掘时的基础透明度 */
const OPACITY_IDLE = 0.6;
/** 挖掘进度 0 对应透明度（颜色随进度加深：0.25 → 0.9） */
const OPACITY_MINING_FROM = 0.25;
const OPACITY_MINING_TO = 0.9;
/** 最小高亮盒边长（略大于 1 避免 z-fighting 贴面闪烁） */
const HIGHLIGHT_SIZE = 1.001;

/**
 * 准星交互器：每帧 DDA 选块 → 维护高亮线框与挖掘进度，左右键产生事件但不写世界。
 * 射线源是**渲染相机**（位置 + 朝向），而非玩家眼睛：第一人称两者重合；第三人称
 * 相机在眼后 4.2 格，若仍从眼睛发射，视线与屏幕中心产生视差（准星指 A 挖 B）。
 * 射程 = REACH + 相机到眼睛的距离（第三人称补偿，保证够得着等深处方块）。
 * 实际传 three.PerspectiveCamera / PlayerController / World 均满足上述结构面。
 */
export class Interactor {
  /** 黑色半透线框；由 main 负责挂入渲染场景（本类无 scene 句柄） */
  readonly highlight: LineSegments;
  /**
   * 挖掘裂纹覆盖盒：六面贴同一张裂纹帧（图集 tile 34..43 十帧）。
   * material.map 随挖掘进度切换帧；由 main 挂入渲染场景（构造时未挂，update 后 main 需 add）。
   */
  readonly crackOverlay: Mesh;
  /** 裂纹贴图（外部注入图集 canvas 后调用 setupCrackTexture 创建） */
  private crackTexture: Texture | null = null;
  private crackMat: MeshBasicMaterial;
  /** 当前准星命中；丢失目标时为 null（对象每次 update 重建，勿跨帧缓存） */
  private target: BlockHit | null = null;
  private targetKey: string | null = null;
  private progress = 0;
  private breakHeld = false;
  /** 已在本按住周期内破坏过的目标键；抑制同一目标重复触发（世界异步移除期间） */
  private brokenKey: string | null = null;
  private breakCb: ((pos: Vec3, blockId: number) => void) | undefined;
  private placeCb: ((pos: Vec3) => void) | undefined;
  private useCraftCb: (() => void) | undefined;
  /** 熔炉使用回调：payload 为方块坐标序列化 key（"x,y,z"）， FurnaceSystem 的状态键 */
  private useFurnaceCb: ((furnaceKey: string) => void) | undefined;
  private destroyed = false;

  constructor(
    private readonly camera: CameraLike,
    private readonly player: PlayerLike,
    private readonly world: WorldLike,
  ) {
    this.highlight = new LineSegments(
      new EdgesGeometry(new BoxGeometry(HIGHLIGHT_SIZE, HIGHLIGHT_SIZE, HIGHLIGHT_SIZE)),
      new LineBasicMaterial({ color: 0x000000, transparent: true, opacity: OPACITY_IDLE }),
    );
    this.highlight.visible = false;
    this.highlight.frustumCulled = false;
    this.highlight.name = 'blockHighlight';

    // 裂纹覆盖盒：略大于方块防 z-fighting；贴图帧由 applyVisuals 按进度切换
    this.crackMat = new MeshBasicMaterial({
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    this.crackOverlay = new Mesh(
      new BoxGeometry(HIGHLIGHT_SIZE + 0.002, HIGHLIGHT_SIZE + 0.002, HIGHLIGHT_SIZE + 0.002),
      this.crackMat,
    );
    this.crackOverlay.visible = false;
    this.crackOverlay.frustumCulled = false;
    this.crackOverlay.name = 'crackOverlay';

    this.bindEvents();
  }

  /**
   * 注入图集纹理并配置裂纹 UV（十帧共用一张图集，切帧 = 改 offset/repeat）。
   * 由 main 在拿到 atlasTexture 后调用；不调用则裂纹层不显示（降级为仅线框加深）。
   */
  setupCrackTexture(atlasTexture: Texture): void {
    // 克隆一份专用纹理实例：offset/repeat 是纹理级状态，与地形材质共用会互相干扰
    const t = atlasTexture.clone();
    t.needsUpdate = true;
    // tile 16px / 图集 256px → 单帧占 1/16；起点 tile 34 → col 2, row 2
    const frame = 1 / 16;
    t.repeat.set(frame, frame);
    this.crackTexture = t;
    this.crackMat.map = t;
  }

  /** 每帧入口：重做射线、刷新高亮与挖掘进度。targetEl 传 null 时跳过 HUD 写入 */
  update(heldItem: ItemStack | null, dt: number, targetEl: HTMLElement | null): void {
    if (this.destroyed) return;
    // 射线从渲染相机出发（与屏幕中心严格共线）；射程补偿相机→眼的额外距离，
    // 使第三人称的可及深度与第一人称一致。相机位置由 main 每帧在本调用前同步。
    const camPos = this.camera.position;
    const eye = this.resolveEye();
    const extra = Math.hypot(camPos.x - eye.x, camPos.y - eye.y, camPos.z - eye.z);
    const hit = ddaRaycast(
      (x, y, z) => this.world.getBlock(x, y, z),
      { x: camPos.x, y: camPos.y, z: camPos.z },
      this.resolveLook(),
      REACH + extra,
    );
    this.target = hit.hit ? hit : null;
    const key = this.target
      ? `${this.target.pos.x},${this.target.pos.y},${this.target.pos.z}`
      : null;
    // 切换目标：进度与抑制标记一起复位
    if (key !== this.targetKey) {
      this.targetKey = key;
      this.progress = 0;
      this.brokenKey = null;
    }
    this.syncHighlightBox();

    const mining = this.breakHeld && this.target !== null && this.isPointerLocked() && dt > 0;
    if (!mining || !this.target || key === null) {
      this.progress = 0; // 松键即停（M2 简化：不支持中断后续挖）
    } else if (key === this.brokenKey) {
      // 已破坏过但世界尚未异步更新完毕：抑制同目标连发
    } else {
      this.advanceBreaking(this.target, heldItem, dt, key);
    }
    this.applyVisuals(targetEl, mining);
  }

  onBreak(cb: (pos: Vec3, blockId: number) => void): void {
    this.breakCb = cb;
  }

  onPlace(cb: (pos: Vec3) => void): void {
    this.placeCb = cb;
  }

  onUseCraftTable(cb: () => void): void {
    this.useCraftCb = cb;
  }

  onUseFurnace(cb: (furnaceKey: string) => void): void {
    this.useFurnaceCb = cb;
  }

  /** 挖掘进度 0..1，HUD 进度条数据源 */
  breakProgress(): number {
    return Math.min(1, Math.max(0, this.progress));
  }

  /** 当前准星命中（高亮盒数据源）；无目标为 null */
  currentTarget(): BlockHit | null {
    return this.target;
  }

  /**
   * 右键动作入口（mouse 处理器路由到此，node 测试亦直接调用）：
   * 命中可交互方块（工作台/熔炉）→ 使用回调优先；否则发放置事件（payload = 命中体的 prev 位）。
   * prev 是否可用（AIR/不与实体 AABB 相交）由 main 校验后再真正 setBlock。
   */
  triggerUse(): void {
    if (this.destroyed) return;
    const t = this.target;
    if (!t) return;
    if (t.blockId === BLOCK.CRAFT_TABLE) {
      this.useCraftCb?.();
      return;
    }
    if (t.blockId === BLOCK.FURNACE) {
      this.useFurnaceCb?.(`${t.pos.x},${t.pos.y},${t.pos.z}`);
      return;
    }
    this.placeCb?.({ x: t.prev.x, y: t.prev.y, z: t.prev.z });
  }

  /** 卸载：移除全部监听、脱离父节点并释放 GPU 资源；之后 update 成为空操作 */
  destroy(): void {
    this.destroyed = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousedown', this.handleMouseDown);
      window.removeEventListener('mouseup', this.handleMouseUp);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('contextmenu', this.handleContextMenu);
    }
    this.breakHeld = false;
    this.breakCb = undefined;
    this.placeCb = undefined;
    this.useCraftCb = undefined;
    this.useFurnaceCb = undefined;
    this.highlight.parent?.remove(this.highlight);
    this.highlight.geometry.dispose();
    (this.highlight.material as LineBasicMaterial).dispose();
  }

  private advanceBreaking(t: BlockHit, heldItem: ItemStack | null, dt: number, key: string): void {
    let def: BlockDef | null = null;
    try {
      def = BlockRegistry.get(t.blockId);
    } catch {
      def = null; // 未知 id（注册表未收录）：防御式视为不可破坏
    }
    const hardness = def ? def.hardness : -1;
    // 不可破坏约定：BEDROCK/WATER 在数据中为 -1，契约表记作 Infinity——两者都拦截
    if (!Number.isFinite(hardness) || hardness <= 0) return;
    const speed = resolveToolSpeed(heldItem, def);
    this.progress += (dt * speed) / hardness;
    if (this.progress >= 1) {
      this.progress = 0;
      this.brokenKey = key;
      // 只发事件不写世界：world.setBlock 由 main 的回调完成（含掉落/音符等联动）
      this.breakCb?.({ x: t.pos.x, y: t.pos.y, z: t.pos.z }, t.blockId);
    }
  }

  /** 眼睛位置：不再作射线源，仅作射程补偿的基准点（相机到眼的距离） */
  private resolveEye(): Vec3 {
    const p = this.player as Partial<PlayerLike>;
    if (typeof p.eyePosition === 'function') return p.eyePosition();
    return this.camera.position; // 降级：没有 PlayerController 时补偿量为 0
  }

  /** getWorldDirection 的工作缓冲：three 实现内部调 target.set()，必须传 Vector3 实例 */
  private readonly lookTmp = new Vector3();

  /** 射线方向 = 相机实际朝向（three getWorldDirection，与屏幕中心严格一致） */
  private resolveLook(): Vec3 {
    this.camera.getWorldDirection(this.lookTmp);
    return { x: this.lookTmp.x, y: this.lookTmp.y, z: this.lookTmp.z };
  }

  private syncHighlightBox(): void {
    const t = this.target;
    this.highlight.visible = t !== null;
    if (t) this.highlight.position.set(t.pos.x + 0.5, t.pos.y + 0.5, t.pos.z + 0.5);
  }

  /** 裂纹覆盖盒同步：位置跟目标，帧号跟进度 */
  private syncCrackOverlay(mining: boolean): void {
    const t = this.target;
    const show = mining && t !== null && this.crackTexture !== null && this.progress > 0.02;
    this.crackOverlay.visible = show;
    if (!show || !t) return;
    this.crackOverlay.position.set(t.pos.x + 0.5, t.pos.y + 0.5, t.pos.z + 0.5);
    // 十帧裂纹：progress 0..1 → 帧 0..9；tile 34 → col=2,row=2，向右下排布
    const frameIdx = Math.min(9, Math.floor(this.breakProgress() * 10));
    const col = (CRACK_TILE_START + frameIdx) % 16;
    const row = Math.floor((CRACK_TILE_START + frameIdx) / 16);
    if (this.crackTexture) {
      // canvas 纹理 v 轴翻转（tileUV 同款约定）：flipY 下 offset.y 从图集底部起算
      this.crackTexture.offset.set(col / 16, 1 - (row + 1) / 16);
    }
  }

  /** 挖掘裂纹视觉：不挖掘回到 0.6，挖掘时随进度 0.25→0.9 加深；并同步 HUD 进度变量 */
  private applyVisuals(targetEl: HTMLElement | null, mining: boolean): void {
    const mat = this.highlight.material as LineBasicMaterial;
    mat.opacity = mining
      ? OPACITY_MINING_FROM +
        (OPACITY_MINING_TO - OPACITY_MINING_FROM) * this.breakProgress()
      : OPACITY_IDLE;
    this.syncCrackOverlay(mining);
    if (targetEl) {
      targetEl.style.setProperty('--mine-progress', this.breakProgress().toFixed(3));
    }
  }

  /** 仅当指针锁定中才响应鼠标（T22 bind 后成立）——与 main 的集成约定 */
  private isPointerLocked(): boolean {
    return typeof document !== 'undefined' && !!document.pointerLockElement;
  }

  private bindEvents(): void {
    if (typeof window === 'undefined') return; // node 单测环境无 DOM，静默跳过
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    if (typeof document !== 'undefined') {
      document.addEventListener('contextmenu', this.handleContextMenu); // 右键放置需压掉浏览器菜单
    }
  }

  private handleMouseDown = (ev: MouseEvent): void => {
    if (this.destroyed || !this.isPointerLocked()) return;
    if (ev.button === 0) this.breakHeld = true;
    else if (ev.button === 2) this.triggerUse();
  };

  private handleMouseUp = (ev: MouseEvent): void => {
    if (ev.button === 0) this.breakHeld = false;
  };

  private handleContextMenu = (ev: Event): void => {
    ev.preventDefault();
  };
}
