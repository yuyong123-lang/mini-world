// render/renderer.ts —— 场景/相机/共享材质/chunk 网格挂载（契约 §11 / 架构 §2.10）
//
// 设计要点：
// - 全游戏只有 2 个共享材质（opaque/water），draw calls 才能压进 ≈200~250 的预算；
//   chunk mesh 只持有 geometry，几何替换时只 dispose geometry，绝不 dispose 共享材质。
// - mesher 输出的 position 已烘焙世界坐标（见 mesher.ts 头注释），因此 mesh 的
//   matrixAutoUpdate=false、position 恒为原点，matrix/matrixWorld 保持单位阵即可。
// - 依赖缺陷记录（FIXME 见文件中部）：node 环境无法构造本类（WebGL/DOM），纯逻辑
//   校验以导出函数 validateMeshArrays 提供，供 worker/renderer 双侧复用与测试。

import * as THREE from 'three';
import { buildAtlasCanvas } from '../blocks/atlas';
import { FOG_FAR, FOG_NEAR } from '../core/constants';
import type { Chunk } from '../world/chunk';
import type { MeshArrays } from '../core/types';

/** 图集种子（固定值保证所有客户端纹理一致；走程序化图集，零外部素材文件） */
const ATLAS_SEED = 1337;
/** 架构 §2.10：pixelRatio 钳 1.5 */
const MAX_PIXEL_RATIO = 1.5;
/** 相机参数（契约冻结） */
const FOV = 75;
const NEAR = 0.1;
const FAR = 1000;
/** 环境光强度：日/夜差值主要由 T62 的 sun intensity/skyColors 承担 */
const AMBIENT_INTENSITY = 0.45;
/** 默认天空蓝。W6 昼夜系统会每帧覆盖 background/fog.color */
const DAY_SKY_HEX = 0x87ceeb;
/** 出生机位占位参考值（构造期用；真实玩家坐标由 player/world 层接管） */
const SPAWN_PLACEHOLDER = { x: 8, eyeY: 42, lookZ: 8, lookY: 28 };

/**
 * 单个 chunk 在场景里挂载的 three 句柄。存进 Chunk.meshes（类型 unknown，
 * Chunk 层不 import three——Worker 迁移前提）。两键都可能缺省：空网格时不建 mesh。
 */
export interface ChunkMeshes {
  opaque?: THREE.Mesh;
  water?: THREE.Mesh;
}

// ---------------------------------------------------------------------------
// 纯逻辑：mesher 输出前置校验（无 three 依赖，可在 node/Worker 内运行）
// ---------------------------------------------------------------------------

/**
 * 校验 MeshArrays 结构有效性（attribute 数量一致性 + index 范围合法性）。
 * 返回 null 表示可用；否则返回人类可读的错误描述字符串。
 *
 * 为什么抽成独立导出函数：构建 BufferGeometry 是唯一必须跑在浏览器线程的动作，
 * 而校验是纯计算——放在一起会让「结果错误的诊断」也被绑死在 DOM 环境里，
 * Worker 版（W10）也需要同一套判定。空网格（0 顶点）视为合法，由调用方决定跳过建 mesh。
 */
export function validateMeshArrays(m: MeshArrays): string | null {
  if (m === null || typeof m !== 'object') return 'mesh 数据必须是对象（MeshArrays）';

  const { position, uv, color, index } = m as Partial<MeshArrays>;

  if (!(position instanceof Float32Array)) return 'position 必须是 Float32Array';
  if (!(uv instanceof Float32Array)) return 'uv 必须是 Float32Array';
  if (!(color instanceof Float32Array)) return 'color 必须是 Float32Array';
  if (!(index instanceof Uint32Array)) return 'index 必须是 Uint32Array';

  if (position.length % 3 !== 0) {
    return `position 长度 ${position.length} 不是 3 的倍数`;
  }
  const vertexCount = position.length / 3;
  if (uv.length !== vertexCount * 2) {
    return `uv 长度 ${uv.length} 与顶点数 ${vertexCount}（应为 ${vertexCount * 2}）不匹配`;
  }
  if (color.length !== vertexCount * 3) {
    return `color 长度 ${color.length} 与顶点数 ${vertexCount}（应为 ${vertexCount * 3}）不匹配`;
  }
  if (index.length % 3 !== 0) {
    return `index 长度 ${index.length} 不是 3 的倍数`;
  }

  // 位置分量必须有限值（NaN 会污染包围球并把整块 mesh 踢出视锥）
  for (let i = 0; i < position.length; i++) {
    if (!Number.isFinite(position[i])) return `position[${i}] 不是有限数值`;
  }

  // 单次循环同时覆盖「负值」与「越界」两类错误。
  // 注意 Uint32Array 读出来恒为无符号数——真正的 int32 负索引会回绕成 ≥2^31 的大值，
  // 因此对 maxIdx 额外做符号位检查并还原其带符号解释（更易定位 mesher 侧 bug）。
  let maxIdx = 0;
  for (let i = 0; i < index.length; i++) {
    const v = index[i];
    if (v < 0) return `index 含负值（${v}）`; // Uint32Array 语义下不可达；防御将来换容器类型
    if (v > maxIdx) maxIdx = v;
  }
  if (maxIdx >= INT32_SIGN_BIT) {
    return (
      `index 含疑似负值（uint32=${maxIdx}，int32=${maxIdx - TWO_POW_32}）：` +
      '带符号负索引被写进了无符号缓冲'
    );
  }
  if (maxIdx >= vertexCount && index.length > 0) {
    return `index 越界（最大 ${maxIdx}，顶点数 ${vertexCount}）`;
  }
  return null;
}

const INT32_SIGN_BIT = 0x80000000;
const TWO_POW_32 = 4294967296;

// ---------------------------------------------------------------------------
// 内部小工具
// ---------------------------------------------------------------------------

interface RemovableChunkLike {
  cx: number;
  cz: number;
  meshes: unknown;
}

function isEmptyMesh(a: MeshArrays): boolean {
  return a.position.length === 0;
}

/** 从场景摘除 mesh 并释放 geometry；共享材质归全局所有，绝不在这里 dispose */
function detachAndDispose(scene: THREE.Scene, mesh: THREE.Mesh): void {
  scene.remove(mesh);
  mesh.geometry.dispose();
}

/** 由纯数组构建 three 几何体（视锥剔除依赖手工计算的包围球） */
function toBufferGeometry(a: MeshArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a.position, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(a.color, 3));
  g.setIndex(new THREE.BufferAttribute(a.index, 1));
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export class Renderer {
  /** 天空/粒子/音频等系统各自挂载自己的对象（契约 §11） */
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** 底层 WebGL 渲染器（antialias 常开；像素比钳 1.5，架构 §2.10） */
  readonly gl: THREE.WebGLRenderer;
  /** 程序化图集纹理：全游戏唯二材质共用 */
  readonly atlasTexture: THREE.Texture;
  readonly opaqueMat: THREE.MeshLambertMaterial;
  readonly waterMat: THREE.MeshLambertMaterial;

  private sunLight: THREE.DirectionalLight;
  private disposed = false;
  private readonly handleResize = () => this.resize();

  constructor(container: HTMLElement) {
    if (!container || typeof container.appendChild !== 'function') {
      throw new TypeError('Renderer 构造需要一个可挂载的 HTMLElement 容器');
    }

    this.gl = new THREE.WebGLRenderer({ antialias: true });
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    this.gl.setPixelRatio(Math.min(dpr, MAX_PIXEL_RATIO));
    this.gl.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
      false,
    );
    this.gl.domElement.style.display = 'block';
    container.appendChild(this.gl.domElement);

    // ---- 全游戏仅有的两个共享材质 ----
    this.atlasTexture = new THREE.CanvasTexture(buildAtlasCanvas(ATLAS_SEED));
    this.atlasTexture.magFilter = THREE.NearestFilter;
    this.atlasTexture.minFilter = THREE.NearestFilter;
    this.atlasTexture.generateMipmaps = false;
    this.atlasTexture.colorSpace = THREE.SRGBColorSpace;

    this.opaqueMat = new THREE.MeshLambertMaterial({
      map: this.atlasTexture,
      vertexColors: true,
    });
    // 半透明水体：关深度写避免水/空气交界处遮挡排序伪影，透明队列自动排在 opaque 之后
    this.waterMat = new THREE.MeshLambertMaterial({
      map: this.atlasTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });

    // ---- 场景基础 ----
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(DAY_SKY_HEX);
    this.scene.fog = new THREE.Fog(DAY_SKY_HEX, FOG_NEAR, FOG_FAR);

    // 环境光固定强度；昼夜差异由 setSunLight 更新平行光方向/强度（T62）
    this.scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY));
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1);
    this.sunLight.castShadow = false; // 明确不做阴影贴图（性能预算）
    this.sunLight.position.set(0.5, 1, 0.35);
    this.scene.add(this.sunLight);

    // ---- 相机 ----
    this.camera = new THREE.PerspectiveCamera(FOV, 1, NEAR, FAR);
    this.camera.position.set(SPAWN_PLACEHOLDER.x, SPAWN_PLACEHOLDER.eyeY, SPAWN_PLACEHOLDER.lookZ);
    this.camera.lookAt(SPAWN_PLACEHOLDER.x, SPAWN_PLACEHOLDER.lookY, SPAWN_PLACEHOLDER.lookZ);

    window.addEventListener('resize', this.handleResize);
    this.resize();
  }

  /**
   * 上传/替换某个 chunk 的不透明与水体几何。
   * 先释放旧句柄（防 GPU 内存泄漏），再挂新 mesh；空网格跳过建 mesh 并清掉旧引用。
   * 成功后把 `{ opaque?, water? }` 写回 chunk.meshes，卸载期由 removeChunkMeshes 回收。
   */
  updateChunkGeometry(c: Chunk, opaque: MeshArrays, water: MeshArrays | null): void {
    // TODO(W10-Worker): 上传前应做一次 GPU 内存统计上报（改造点在 Worker 回传管线）
    // FIXME(atlas): atlas.ts 未导出「已绘制 tile 集合」，无法在 runtime 校验 mesh 引用的
    //               UV 是否落在有内容的 tile 上（越界贴到空白 tile 时画面会静默丢失面）；
    //               待主线程评估是否给 atlas 增加 exportedTileIndices() 再补校验。

    const errOpaque = validateMeshArrays(opaque);
    if (errOpaque) throw new Error(`chunk(${c.cx},${c.cz}) opaque 网格非法：${errOpaque}`);
    if (water) {
      const errWater = validateMeshArrays(water);
      if (errWater) throw new Error(`chunk(${c.cx},${c.cz}) water 网格非法：${errWater}`);
    }

    this.releaseChunkHandle(c);

    const next: ChunkMeshes = {};

    if (!isEmptyMesh(opaque)) {
      next.opaque = new THREE.Mesh(toBufferGeometry(opaque), this.opaqueMat);
      configureStaticMesh(next.opaque, `chunk(${c.cx},${c.cz}).opaque`);
      this.scene.add(next.opaque);
    }

    if (water && !isEmptyMesh(water)) {
      next.water = new THREE.Mesh(toBufferGeometry(water), this.waterMat);
      configureStaticMesh(next.water, `chunk(${c.cx},${c.cz}).water`);
      next.water.renderOrder = 1; // 确保 alpha 混合发生在全部 opaque之后
      this.scene.add(next.water);
    }

    const hasAny = Boolean(next.opaque || next.water);
    c.meshes = hasAny ? next : null;
  }

  /** 卸载 chunk 或重建前的资源回收入口（Chunk.disposeMeshes 注入此方法） */
  removeChunkMeshes(c: unknown): void {
    if (!c || typeof c !== 'object') return;
    this.releaseChunkHandle(c as RemovableChunkLike);
  }

  /** T62 昼夜联动接口：更新平行光方向（世界坐标指向量）与强度 */
  setSunLight(dirNormalized: { x: number; y: number; z: number }, intensity: number): void {
    this.sunLight.position.set(dirNormalized.x, dirNormalized.y, dirNormalized.z);
    this.sunLight.intensity = Math.max(0, Number.isFinite(intensity) ? intensity : 0);
  }

  /** 每帧末尾调用；雾色/背景色已在 daycycle 层驱动，这里只负责提交绘制 */
  renderFrame(dt: number): void {
    void dt; // 预留给后续相机插值/水面波动动画
    this.gl.render(this.scene, this.camera);
  }

  /** 手动适配容器尺寸（window resize 已自动监听） */
  resize(): void {
    if (this.disposed) return;
    const el = this.gl.domElement.parentElement;
    const w = (el && el.clientWidth) || window.innerWidth;
    const h = (el && el.clientHeight) || window.innerHeight;
    if (w <= 0 || h <= 0) return; // hidden/未布局时跳过，等下次 resize 再恢复
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.gl.setSize(w, h, false);
  }

  /** 移除 resize 监听并立即释放 GL 上下文（页面切换/测试收尾用） */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('resize', this.handleResize);
    for (const child of [...this.scene.children]) {
      const anyChild = child as THREE.Mesh;
      if ((anyChild as { isMesh?: boolean }).isMesh) {
        detachAndDispose(this.scene, anyChild);
      }
    }
    this.opaqueMat.dispose();
    this.waterMat.dispose();
    this.atlasTexture.dispose();
    this.gl.dispose();
  }

  /** 统一的句柄释放：若 chunk 还挂着 mesh 就移除并 dispose，然后清引用 */
  private releaseChunkHandle(c: RemovableChunkLike): void {
    const handle = c.meshes as ChunkMeshes | null | undefined;
    if (!handle || typeof handle !== 'object') {
      c.meshes = null;
      return;
    }
    if (handle.opaque) detachAndDispose(this.scene, handle.opaque);
    if (handle.water) detachAndDispose(this.scene, handle.water);
    c.meshes = null;
  }
}

function configureStaticMesh(mesh: THREE.Mesh, debugName: string): void {
  mesh.name = debugName;
  mesh.frustumCulled = true;
  mesh.matrixAutoUpdate = false; // 世界坐标已烘焙进 position，mesh 本身无需变换
  mesh.position.set(0, 0, 0);
  mesh.matrix.identity();
}
