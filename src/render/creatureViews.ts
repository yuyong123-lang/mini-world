// render/creatureViews.ts —— 动物多物种视图（横置身体 + 头 + 四腿的多盒组合）
//
// 此前 main.syncEntityViews 用单色单盒占位（buildCreatureMesh），多物种后
// 猪粉/牛棕/羊白无法区分且没有动物形态。本模块按 AnimalSpeciesDef 构建
// 组合视图并每帧同步位置与朝向，替换 main 中的动物分支；怪物保持单盒不动。
//
// 坐标约定与 main.syncView 一致：Group 原点 = 脚底中心（pos.y + height/2 为
// 几何中点），朝向 = facingYaw（绕 Y 自 +Z 起算），模型默认面向 +Z。

import * as THREE from 'three';
import type { AnimalSpeciesDef } from '../entities/animals';

/** 挂到 Entity.view 上的视图句柄（与 main.syncView 的 {mesh,yaw} 同形） */
export interface CreatureViewRef {
  mesh: THREE.Group;
  yaw: number | null;
}

/** 被同步实体需要的最小面（Animal 天然满足） */
export interface SyncableCreature {
  pos: { x: number; y: number; z: number };
  facingYaw?: number;
  view: unknown;
  attachView(v: unknown): void;
}

/** 简易彩色盒（MeshLambertMaterial；与场景的 AmbientLight+DirectionalLight 配合） */
function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
}

/**
 * 按物种构建组合视图：横置身体 + 前伸头 + 四条短腿。
 * 身体主色取 species.viewColor；头取主色，吻部加深；腿用更暗的同色调。
 * 原点 = 脚底中心（腿底接触 y=0 平面）。
 */
export function buildAnimalView(species: AnimalSpeciesDef): THREE.Group {
  const g = new THREE.Group();
  const dark = darken(species.viewColor, 0.62);
  const darker = darken(species.viewColor, 0.45);

  const bodyH = 0.42;
  const bodyY = species.height - bodyH / 2 - 0.06; // 身体贴着腿顶，留 0.06 下沉感
  const legH = Math.max(0.18, bodyY - bodyH / 2);

  // 身体：横置长方体（长沿 +Z 朝向轴）
  const body = box(0.52, bodyH, 0.82, species.viewColor);
  body.position.set(0, bodyY, 0);
  g.add(body);

  // 头：前伸略高于身体
  const head = box(0.36, 0.36, 0.34, species.viewColor);
  head.position.set(0, bodyY + 0.12, 0.52);
  g.add(head);

  // 吻部：头前的深色小块
  const snout = box(0.2, 0.16, 0.08, darker);
  snout.position.set(0, bodyY + 0.06, 0.72);
  g.add(snout);

  // 四腿：前后各一对（腿在 group 局部坐标，随行走动画整体不拆分——保持简单）
  const legOffX = 0.18;
  const legOffZ = 0.26;
  for (const [lx, lz] of [
    [-legOffX, legOffZ],
    [legOffX, legOffZ],
    [-legOffX, -legOffZ],
    [legOffX, -legOffZ],
  ] as const) {
    const leg = box(0.14, legH, 0.14, dark);
    leg.position.set(lx, legH / 2, lz);
    g.add(leg);
  }

  return g;
}

/** 每帧同步：懒建视图 + 位置（pos.y + height/2）+ 朝向（facingYaw 变化才写 rotation）。
 *  死亡倒地：deathT 0..1 → 绕行进方向侧翻 90° + 身体下沉贴地（翻滚感），播完保持倒姿。 */
export function syncAnimalView(
  e: SyncableCreature & { deathT?: number },
  species: AnimalSpeciesDef,
  scene: THREE.Scene,
): void {
  let v = e.view as CreatureViewRef | null;
  if (!v) {
    v = { mesh: buildAnimalView(species), yaw: null };
    e.attachView(v);
    scene.add(v.mesh);
  }
  const deathT = e.deathT !== undefined && e.deathT >= 0 ? Math.min(1, e.deathT) : 0;
  if (deathT > 0) {
    // 倒地：侧翻 90°（前 60% 进度完成翻转）+ 重心下沉到贴地
    const tip = Math.min(1, deathT / 0.6);
    v.mesh.rotation.z = -(Math.PI / 2) * tip;
    const settle = 1 - species.height / 2 / (species.height / 2 + 0.28); // 满倒时的下沉占比
    v.mesh.position.set(
      e.pos.x,
      e.pos.y + species.height / 2 * (1 - settle * deathT),
      e.pos.z,
    );
  } else {
    v.mesh.rotation.z = 0;
    v.mesh.position.set(e.pos.x, e.pos.y + species.height / 2, e.pos.z);
  }
  if (e.facingYaw != null && v.yaw !== e.facingYaw) {
    v.mesh.rotation.y = e.facingYaw;
    v.yaw = e.facingYaw;
  }
}

/** 颜色变暗：保留色相，按比例压低 RGB（0..1 系数） */
function darken(hex: number, k: number): number {
  const r = Math.round(((hex >> 16) & 0xff) * k);
  const g = Math.round(((hex >> 8) & 0xff) * k);
  const b = Math.round((hex & 0xff) * k);
  return (r << 16) | (g << 8) | b;
}
