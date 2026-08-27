// render/sky.ts —— 天空/太阳/月亮/平行光联动系统（契约 §11，T62）
//
// 职责：每帧把 DayCycle 的纯逻辑输出落到 three 场景里——
//   1. scene.background / scene.fog 颜色与 FOG_NEAR/FAR 常量同步；
//   2. 太阳(PlaneGeometry) 沿天穹轨道绕相机公转，月亮反向跟随；
//   3. renderer.setSunLight(direction, intensity) 白昼增亮、入夜压暗。
// 不调用 renderFrame —— main 在 sky.update(dt) 之后自行调 renderer.renderFrame。
//
// 太阳/月亮纹理：从 atlas 程序化图集的 tile 20(sun)/21(moon) drawImage 到
// 小 canvas 生成的独立 CanvasTexture（fog:false、transparent、depthWrite:false），
// 这样无需改动 atlas.ts 的公开 API（ FIXME 的 exportedTileIndices 与此无关）。

import * as THREE from 'three';
import { ATLAS_GRID, ATLAS_TILES, TILE_PX } from '../blocks/atlas';
import { FOG_FAR, FOG_NEAR } from '../core/constants';
import type { DayCycle } from '../survival/daycycle';
import type { Renderer } from './renderer';

/** 天穹半径：必须 > 相机 far 可见的远景雾区域 → 取整十便于对齐 */
const SKY_RADIUS = 140;

/** 太阳面片尺寸 */
const SUN_SIZE = 14;
/** 月亮面片尺寸 */
const MOON_SIZE = 10;
/** 太阳贴片放大倍数（16px tile → 64px canvas 再缩放到面片） */
const CELESTIAL_TEX_PX = 64;

interface SkyColors {
  top: string;
  bottom: string;
  fog: string;
  sunAngle: number;
}

/**
 * 从图集 canvas 上裁下单个 tile 并绘制到独立的小 canvas，
 * 返回一张无 fog 干扰的独立纹理。tile 若未在图集中注册（不可能，硬编码表），
 * 会静默得到一张黑块——调用方无需处理。
 */
function makeCelestialTexture(
  source: HTMLCanvasElement | HTMLImageElement,
  tileIndex: number,
): THREE.CanvasTexture {
  const src =
    source instanceof HTMLCanvasElement ? source : (source as unknown as HTMLCanvasElement);
  const x0 = (tileIndex % ATLAS_GRID) * TILE_PX;
  const y0 = Math.floor(tileIndex / ATLAS_GRID) * TILE_PX;
  const dst = document.createElement('canvas');
  dst.width = CELESTIAL_TEX_PX;
  dst.height = CELESTIAL_TEX_PX;
  const ctx = dst.getContext('2d');
  if (!ctx) throw new Error('获取 2D 绘图上下文失败（sun/moon 贴片生成终止）');
  ctx.imageSmoothingEnabled = false; // 保持像素艺术感
  ctx.drawImage(src, x0, y0, TILE_PX, TILE_PX, 0, 0, CELESTIAL_TEX_PX, CELESTIAL_TEX_PX);
  const tex = new THREE.CanvasTexture(dst);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class SkySystem {
  private readonly renderer: Renderer;
  private readonly daycycle: DayCycle;
  /** 背景色对象复用，避免每帧分配 Color */
  private readonly bg = new THREE.Color();
  private readonly sunMesh: THREE.Mesh;
  private readonly moonMesh: THREE.Mesh;
  private readonly sunMaterial: THREE.MeshBasicMaterial;
  private readonly moonMaterial: THREE.MeshBasicMaterial;
  private disposed = false;

  constructor(renderer: Renderer, daycycle: DayCycle) {
    this.renderer = renderer;
    this.daycycle = daycycle;

    // ---- 雾距参数只在构造期设置一次（昼夜循环只改颜色不改距离）----
    const fog = renderer.scene.fog as THREE.Fog | null;
    if (!fog) {
      // Renderer 构造期就创建了 Fog，这里只是类型层面的防御
      throw new Error('Renderer.scene 缺少 Fog 实例，SkySystem 无法工作');
    }
    fog.near = FOG_NEAR;
    fog.far = FOG_FAR;

    // ---- 太阳 / 月亮 ----
    const atlasCanvas = renderer.atlasTexture.image as HTMLCanvasElement;
    this.sunMaterial = new THREE.MeshBasicMaterial({
      map: makeCelestialTexture(atlasCanvas, ATLAS_TILES.sun),
      transparent: true,
      fog: false,
      depthWrite: false,
      depthTest: true,
    });
    this.sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(SUN_SIZE, SUN_SIZE), this.sunMaterial);
    this.sunMesh.frustumCulled = false;
    this.sunMesh.renderOrder = -1; // 天空体最先画，且 depthWrite=false 不遮挡地形

    this.moonMaterial = new THREE.MeshBasicMaterial({
      map: makeCelestialTexture(atlasCanvas, ATLAS_TILES.moon),
      transparent: true,
      fog: false,
      depthWrite: false,
      depthTest: true,
    });
    this.moonMesh = new THREE.Mesh(new THREE.PlaneGeometry(MOON_SIZE, MOON_SIZE), this.moonMaterial);
    this.moonMesh.frustumCulled = false;
    this.moonMesh.renderOrder = -1;

    renderer.scene.add(this.sunMesh);
    renderer.scene.add(this.moonMesh);
  }

  /** main 每帧调用一次（在 daycycle.tick(dt) 之后、renderer.renderFrame 之前） */
  update(_dt: number): void {
    if (this.disposed) return;

    const colors: SkyColors = this.daycycle.skyColors();

    // ---- 天空底色 + 雾色 ----
    this.bg.set(colors.top);
    this.renderer.scene.background = this.bg;
    const fog = this.renderer.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.set(colors.fog);
      fog.near = FOG_NEAR;
      fog.far = FOG_FAR;
    }

    // ---- 太阳/月亮定位：以相机为中心的天穹轨道 ----
    // angle=0 → 东方地平线(+x 方向)，angle=π/2 → 正午头顶，angle=π → 西边落下；
    // 夜间月亮沿同一轨道后半程继续走完剩下的 π。轨道平面取 y-x 平面（z 固定 0），
    // 这样正午时太阳在头顶而非正前方/正后方。
    const cam = this.renderer.camera.position;
    const a = colors.sunAngle;
    this.placeCelestial(this.sunMesh, a, cam);
    this.placeCelestial(this.moonMesh, a + Math.PI, cam);

    // 两张 billboard 面向相机（PlaneGeometry 默认法线 +z）
    this.sunMesh.lookAt(cam);
    this.moonMesh.lookAt(cam);

    // ---- 平行光联动 ----
    // 光照方向 = 「光来向」的单位向量（DirectionalLight 默认从 position 射向原点 target）。
    // 白天强度随太阳高度角抬升，夜晚保持最低微光便于辨识轮廓（不做光照传播）。
    const night = this.daycycle.isNight;
    const heightY = Math.sin(a);
    const intensity = night ? 0.12 : Math.max(0.12, heightY) * 0.9;
    this.renderer.setSunLight(
      { x: -Math.cos(a), y: Math.max(0.15, night ? Math.abs(heightY) : heightY), z: 0.3 },
      intensity,
    );
  }

  /** 把一个天体摆到以相机为中心、半径 SKY_RADIUS 的轨道上 */
  private placeCelestial(mesh: THREE.Mesh, angle: number, center: THREE.Vector3): void {
    mesh.position.set(
      center.x + -Math.cos(angle) * SKY_RADIUS,
      center.y + Math.sin(angle) * SKY_RADIUS,
      center.z + 0,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const scene = this.renderer.scene;
    for (const m of [this.sunMesh, this.moonMesh]) {
      scene.remove(m);
      m.geometry.dispose();
    }
    this.sunMaterial.map?.dispose();
    this.moonMaterial.map?.dispose();
    this.sunMaterial.dispose();
    this.moonMaterial.dispose();
  }
}
