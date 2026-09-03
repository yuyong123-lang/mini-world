// render/firstPersonArm.ts —— 第一人称双臂（走路摆臂 / 挥拳）+ 五指手 + 手持物
//
// 此前第一人称没有任何手臂模型，徒手攻击缺乏动作反馈。本模块把「衣袖 + 手」
// 的双臂挂在相机局部空间（屏幕左下/右下各一只），攻击/挖掘时**左右交替**出拳。
//
// 真实感（W 挖放循环波追加）：
//   · 五指手：手掌 + 五根手指（根部 pivot 可弯曲），空手自然半握；
//   · 握持：setHeld 按持物类型切握姿——握方块（四指扣前）/ 捏纸片（收拢），
//     手指角度逐帧 lerp 过渡，切换时像真的「换了个握法」；
//   · 摆臂：update 传入水平移速，双臂以反相相位前后摆动（越快幅度越大），
//     静止时回落为轻微呼吸浮动；出拳期间挥拳动画全权接管该侧。
//
// 手持物（setHeld）：可放置方块 → 0.24³ 立方体贴 BlockDef.tex 三面 tile；
// 其余物品 → iconTile 纸片。挂在持物手（右）hand 节点下，摆臂/挥拳天然联动。
//
// 挂载约定：scene.add(camera) 后 camera.add(group)——three 的相机不在场景树
// 时其子对象不会被渲染。group 原点即相机，局部 -Z 为视线方向。

import * as THREE from 'three';
import { ATLAS_GRID } from '../blocks/atlas';
import { BlockRegistry } from '../blocks/registry';
import { ItemRegistry } from '../items/items';
import type { ItemStack } from '../core/types';

/** 单次挥拳动画时长（秒）：出拳-收拳一个来回 */
const PUNCH_DURATION_S = 0.22;
/** 手臂在屏幕两侧的横向基位（相机局部 X） */
const ARM_X = 0.42;
/** 出拳时前伸的目标偏移（沿 -Z 前推 + 抬高 + 向中线收拢） */
const PUNCH_OFFSET = { x: -0.1, y: 0.1, z: -0.42 };
/** 手持物切换展示动画时长（秒） */
const HELD_SHOW_DURATION_S = 0.24;
/** 手持物锚位（hand 节点内）：竖握掌心朝内后，方块贴在掌面内侧（局部 +Y）、
 *  四指蜷曲前缘（局部 -Z）处——两手局部朝向一致，同一锚位通用。 */
const HELD_ANCHOR = { x: 0, y: 0.1, z: -0.04 };
/** 纸片物品的默认偏航（微斜更像「捏着看」） */
const HELD_PLANE_ROT_Y = -0.35;
/** 满速参考移速（格/s）：达到该速度摆臂取最大幅度 */
const WALK_REF_SPEED = 4.5;
/** 满速摆臂的前后位移幅度（格）与腕部附加转角（rad） */
const SWING_MAX_Z = 0.055;
const SWING_MAX_ROT = 0.5;
/** 满速步频（rad/s）：一个完整前后摆 = 2π/该值 */
const STEP_FREQ = 9.5;
/** 手臂下垂基线（rad）：>0 = 臂斜向下伸（自然垂臂），摆臂/挥拳叠加其上 */
const ARM_DROOP = 0.5;
/** 手指弯曲角变化速率（rad/s 的 lerp 系数基底） */
const GRIP_LERP = 12;

/** 握姿类型：open=空手半握 / hold=握方块 / grip=捏纸片 */
type Grip = 'open' | 'hold' | 'grip';
/** 五指（拇指→小指）在每种握姿下的根部弯曲角（rad）。
 *  open 即为明显卷曲的自然半握（人放松时手指从不伸直），加 distal 随动后
 *  侧面看是连续弧线——消除「直挺挺僵尸手」。 */
const GRIP_CURLS: Record<Grip, [number, number, number, number, number]> = {
  open: [0.72, 0.6, 0.56, 0.64, 0.76],
  hold: [1.35, 1.12, 1.06, 1.16, 1.28],
  grip: [1.55, 1.34, 1.28, 1.36, 1.48],
};

export interface FirstPersonArms {
  /** 相机子节点（挂到 camera 下） */
  group: THREE.Group;
  /** 触发一次挥拳（左右自动交替：右→左→右…；重复调用从头重放当前拳） */
  punch(): void;
  /** 每帧推进动画。moveSpeed：玩家水平移速（格/s），驱动走路摆臂 */
  update(dt: number, moveSpeed?: number): void;
  /** 是否正在挥拳（用于 HUD/逻辑联动） */
  punching(): boolean;
  /**
   * 同步手持物网格。与上次 key 不同时重建模型并切握姿；show=true 时播放抬起
   * 展示动画（数字键/滚轮切换走 true）。main 每帧兜底调用即可（key 未变 no-op）。
   */
  setHeld(stack: ItemStack | null, show?: boolean): void;
  /** 换装同步（hex 0xRRGGBB） */
  setColors(skin: number, shirt: number): void;
  dispose(): void;
}

/** 单根手指：根部 pivot（旋转即弯曲）+ 远节 pivot（跟随弯曲卷握） */
interface Finger {
  root: THREE.Group;
  /** 远节关节：弯曲角按比例跟随根部，形成自然卷握弧线 */
  distal: THREE.Group;
  /** 当前弯曲角（逐帧 lerp 向目标） */
  curl: number;
  /** 该指在握姿下的基础外摆（拇指内收等） */
  restYaw: number;
}

interface ArmSide {
  group: THREE.Group;
  arm: THREE.Group;
  sleeve: THREE.Mesh;
  hand: THREE.Group;
  palm: THREE.Mesh;
  fingers: Finger[];
  /** 全部肤色 mesh（换装统一覆色用） */
  skinMeshes: THREE.Mesh[];
  rest: THREE.Vector3;
  t: number; // <0 = 空闲；0..1 = 挥拳进度
}

/** 圆柱几何缓存：各指尺寸不同但形状一致，逐次创建即可（dispose 统一走 traverse） */
function limbCylinder(r1: number, r2: number, len: number, skin: number): THREE.Mesh {
  // 沿 Z 轴的锥形圆柱：r1 = 指根端（粗），r2 = 指末端（细），低多边形 8 棱与体素风协调
  const geo = new THREE.CylinderGeometry(r2, r1, len, 8);
  geo.rotateX(Math.PI / 2); // Y 轴 → Z 轴（细端朝 -Z）
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: skin }));
}

function ball(r: number, skin: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshLambertMaterial({ color: skin }));
}

/**
 * 建一根圆润的两节手指：指根 pivot → 近节锥形柱 → 关节球 → 远节 pivot → 远节柱。
 * root.rotation.x = 根部弯角；distal.rotation.x 额外跟随（卷握弧线，不是硬折）。
 */
function buildFinger(index: number, skin: number, collect: THREE.Mesh[]): Finger {
  const root = new THREE.Group();
  const proxLen = index === 0 ? 0.05 : index === 2 ? 0.07 : 0.062;
  const distLen = index === 0 ? 0.045 : index === 2 ? 0.062 : 0.055;
  const rBase = index === 0 ? 0.019 : 0.0165;

  const prox = limbCylinder(rBase, rBase * 0.88, proxLen, skin);
  prox.position.z = -proxLen / 2;
  root.add(prox);
  collect.push(prox);

  const joint = ball(rBase * 0.94, skin);
  joint.position.z = -proxLen;
  root.add(joint);
  collect.push(joint);

  const distal = new THREE.Group();
  distal.position.z = -proxLen;
  const dist = limbCylinder(rBase * 0.84, rBase * 0.6, distLen, skin);
  dist.position.z = -distLen / 2;
  distal.add(dist);
  root.add(distal);
  collect.push(dist);

  return { root, distal, curl: 0, restYaw: index === 0 ? -0.9 : 0 };
}

function buildSide(sign: 1 | -1, skin: number, shirt: number): ArmSide {
  const group = new THREE.Group();

  const sleeve = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.16, 0.3),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  sleeve.position.set(0, 0, 0.26);

  // ---- 手部：圆润造型（扁球掌 + 腕柱 + 指关节球衔接），挂在腕部 ----
  const hand = new THREE.Group();
  hand.position.set(0, 0, -0.02);
  const skinMeshes: THREE.Mesh[] = [];

  const wrist = limbCylinder(0.052, 0.058, 0.1, skin);
  wrist.position.z = 0.09;
  hand.add(wrist);
  skinMeshes.push(wrist);

  // 掌：压扁的椭球（比方盒圆润；scale 后宽 0.17 / 厚 0.06 / 长 0.2）
  const palm = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 10, 8),
    new THREE.MeshLambertMaterial({ color: skin }),
  );
  palm.scale.set(1.0, 0.36, 1.15);
  palm.position.set(0, 0, 0.01);
  hand.add(palm);
  skinMeshes.push(palm);

  const fingers: Finger[] = [];
  // 四指并排：pivot 在掌前缘，沿 X 展开间距
  const xs = [-0.056, -0.019, 0.019, 0.056];
  for (let i = 0; i < 4; i++) {
    const f = buildFinger(i + 1, skin, skinMeshes);
    f.root.position.set(xs[i], 0, -0.05);
    f.root.rotation.z = -0.03 * sign; // 微外张（hand 绕竖轴翻转后符号取反），避免呆板平行
    f.root.name = `finger-${i + 1}`; // 测试/调试定位标记（1..4 = 食→小）
    hand.add(f.root);
    fingers.push(f);
    // 指关节球：衔接掌缘与指根，消除「手指从盒子上长出来」的断裂感
    const knuckle = ball(0.018, skin);
    knuckle.position.set(xs[i], 0, -0.048);
    hand.add(knuckle);
    skinMeshes.push(knuckle);
  }
  // 拇指：竖起+扭转后「世界上端」= 局部 +X（右手）/ -X（左手）——拇指放掌上端，
  // 指体经 rotation.y=sign*90° 从 -Z 转向世界下方，形成从上往下压顶的抓握分工
  const thumb = buildFinger(0, skin, skinMeshes);
  thumb.root.position.set(0.09 * sign, 0, -0.03);
  thumb.root.rotation.y = sign * Math.PI / 2;
  thumb.root.rotation.z = -0.15 * sign;
  thumb.root.name = 'finger-0'; // 0 = 拇指
  hand.add(thumb.root);
  fingers.unshift(thumb); // fingers[0] = 拇指，与 GRIP_CURLS 序一致

  const arm = new THREE.Group();
  arm.add(sleeve);
  arm.add(hand);
  // 手臂自然下垂基线（0.5 rad）：从屏幕右下/左下斜向下伸向画面深处——
  // 与真实走路姿势一致；摆臂/挥拳在此基础上叠加。
  arm.rotation.set(0.5, -0.22 * sign, 0.08 * sign);
  // 手顺袖口方向延伸（只微垂 0.18，不折角），再绕臂轴扭 ±90° 让掌心朝内——
  // 蓝袖 → 腕 → 手背 → 蜷曲指尖一条连续曲线，腕部无断裂。
  hand.rotation.set(-0.18, 0, sign * Math.PI / 2);
  group.add(arm);

  // 基位：右臂 sign=1 在右下、左臂 sign=-1 在左下
  const rest = new THREE.Vector3(ARM_X * sign, -0.38, -0.72);
  group.position.copy(rest);

  return { group, arm, sleeve, hand, palm, fingers, skinMeshes, rest, t: -1 };
}

export function createFirstPersonArms(opts?: {
  skin?: number;
  shirt?: number;
  /** 懒取图集纹理（启动期程序化生成，可能晚于本工厂调用）；null 时手持物降级为不显示 */
  getAtlas?: () => THREE.Texture | null;
}): FirstPersonArms {
  const skin = opts?.skin ?? 0xe0b088;
  const shirt = opts?.shirt ?? 0x3a7bd5;

  const group = new THREE.Group();
  const right = buildSide(1, skin, shirt);
  const left = buildSide(-1, skin, shirt);
  group.add(right.group);
  group.add(left.group);

  // ---- 手持物（右手 hand 内，挥拳/摆臂联动） ----
  const heldGroup = new THREE.Group();
  heldGroup.position.set(HELD_ANCHOR.x, HELD_ANCHOR.y, HELD_ANCHOR.z);
  heldGroup.visible = false;
  right.hand.add(heldGroup);
  let heldMesh: THREE.Mesh | null = null;
  let heldKey: string | null = null;
  let heldShowT = -1; // <0 = 空闲；0..1 = 展示动画进度
  /** tile → 克隆纹理缓存（同一 tile 的方块/物品反复切换不重复 clone） */
  const tileTextures = new Map<number, THREE.Texture>();

  /** 图集 tile → 专属克隆纹理（offset/repeat 定位到该 tile；canvas flipY 约定） */
  function tileTexture(tile: number): THREE.Texture | null {
    const atlas = opts?.getAtlas?.() ?? null;
    if (!atlas) return null;
    const cached = tileTextures.get(tile);
    if (cached) return cached;
    const t = atlas.clone();
    t.needsUpdate = true;
    t.repeat.set(1 / ATLAS_GRID, 1 / ATLAS_GRID);
    const col = tile % ATLAS_GRID;
    const row = Math.floor(tile / ATLAS_GRID);
    t.offset.set(col / ATLAS_GRID, 1 - (row + 1) / ATLAS_GRID);
    tileTextures.set(tile, t);
    return t;
  }

  function clearHeldMesh(): void {
    if (!heldMesh) return;
    heldMesh.geometry.dispose();
    const mats = Array.isArray(heldMesh.material) ? heldMesh.material : [heldMesh.material];
    for (const m of mats) m.dispose(); // 纹理是缓存共享的，不 dispose
    heldGroup.remove(heldMesh);
    heldMesh = null;
  }

  /** 按 stack 构建手持网格：可放置方块 → 立方体；其余 → iconTile 纸片 */
  function buildHeldMesh(stack: ItemStack): void {
    const item = ItemRegistry.has(stack.key) ? ItemRegistry.get(stack.key) : null;
    // 可放置方块：tex = [top, bottom, side]（three 面序 px,nx,py,ny,pz,nz）
    if (item?.place !== undefined) {
      try {
        const def = BlockRegistry.get(item.place);
        const top = tileTexture(def.tex[0]);
        const bottom = tileTexture(def.tex[1]);
        const side = tileTexture(def.tex[2]);
        if (!top || !bottom || !side) return; // 图集未就绪：保持空手降级
        const mk = (tex: THREE.Texture) =>
          new THREE.MeshLambertMaterial({ map: tex, transparent: true });
        const geo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
        heldMesh = new THREE.Mesh(geo, [mk(side), mk(side), mk(top), mk(bottom), mk(side), mk(side)]);
      } catch {
        return; // 未知方块 id：降级空手
      }
    } else if (item?.iconTile !== undefined) {
      const tex = tileTexture(item.iconTile);
      if (!tex) return;
      heldMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 0.3),
        new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }),
      );
      heldMesh.rotation.y = HELD_PLANE_ROT_Y; // 纸片微斜，像捏在指间看
    } else {
      return; // 无图标无 place（理论不达）：空手
    }
    heldMesh.name = 'heldItem'; // 测试/调试定位标记
    heldGroup.add(heldMesh);
    heldGroup.visible = true;
  }

  /** 当前握姿目标（由持物类型决定） */
  let grip: Grip = 'open';

  /** 交替状态：true=下一拳右臂，false=下一拳左臂（首拳右手） */
  let nextRight = true;
  let breathe = 0;
  /** 走路摆臂：相位与当前幅度（幅度随速度平滑起落，静止时手臂缓回 rest） */
  let walkPhase = 0;
  let swingAmp = 0;

  const animatePunch = (side: ArmSide, progress: number): void => {
    const sign = side === right ? 1 : -1;
    const e = Math.sin(Math.min(1, progress) * Math.PI); // 0→1→0 正弦包络
    side.group.position.set(
      side.rest.x + (PUNCH_OFFSET.x * sign) * e, // 出拳时向中线收拢
      side.rest.y + PUNCH_OFFSET.y * e,
      side.rest.z + PUNCH_OFFSET.z * e,
    );
    side.arm.rotation.x = ARM_DROOP - e * 0.55; // 从下垂基线向前挥出
  };

  /** 非挥拳侧的姿态：rest 基位 + 呼吸浮动 + 走路摆臂（前后推拉 + 腕部摆转） */
  const animateIdle = (side: ArmSide, lead: boolean): void => {
    const phase = walkPhase + (lead ? 0 : Math.PI); // 双臂反相
    const push = Math.sin(phase) * SWING_MAX_Z * swingAmp;
    const rot = Math.sin(phase) * SWING_MAX_ROT * swingAmp;
    const bob = Math.sin(walkPhase * 2 + (lead ? 0 : Math.PI)) * 0.014 * swingAmp; // 步频两倍的上下颠
    const idleY = swingAmp < 0.05 ? Math.sin(breathe * 1.7 + (lead ? 0 : Math.PI)) * 0.012 : 0;
    side.group.position.set(
      side.rest.x,
      side.rest.y + bob + idleY,
      side.rest.z + push,
    );
    side.arm.rotation.x = ARM_DROOP + rot;
  };

  return {
    group,

    punch(): void {
      const side = nextRight ? right : left;
      nextRight = !nextRight; // 交替
      side.t = 0;
    },

    punching(): boolean {
      return right.t >= 0 || left.t >= 0;
    },

    setHeld(stack: ItemStack | null, show = false): void {
      const key = stack?.key ?? null;
      if (key === heldKey) return; // 同物品：不重建、不重放动画（数量增减不抢戏）
      heldKey = key;
      clearHeldMesh();
      if (stack) {
        buildHeldMesh(stack);
        // 握姿随持物类型：可放置方块整手扣握；纸片类收拢捏持
        const item = ItemRegistry.has(stack.key) ? ItemRegistry.get(stack.key) : null;
        grip = item?.place !== undefined ? 'hold' : 'grip';
      } else {
        grip = 'open';
      }
      if (heldMesh && show) heldShowT = 0; // 从低位抬起展示
    },

    update(dt: number, moveSpeed = 0): void {
      // ---- 摆臂参数：速度 → 相位推进 + 幅度平滑起落 ----
      const speed = Number.isFinite(moveSpeed) && moveSpeed > 0 ? moveSpeed : 0;
      const norm = Math.min(1, speed / WALK_REF_SPEED);
      walkPhase += dt * STEP_FREQ * norm;
      swingAmp += (norm - swingAmp) * Math.min(1, dt * 8);
      breathe += dt;

      let anyPunching = false;
      for (const side of [right, left]) {
        if (side.t >= 0) {
          anyPunching = true;
          side.t += dt / PUNCH_DURATION_S;
          if (side.t >= 1) {
            side.t = -1;
            animateIdle(side, side === right); // 归位由 idle 姿态接管
          } else {
            animatePunch(side, side.t);
          }
        } else {
          animateIdle(side, side === right);
        }

        // ---- 手指弯曲 lerp 向当前握姿（挥拳时也保持——拳头本来就是握的）。
        // 每指差速：拇指最快、小指最慢，收拢有真实的次序感而非五指齐动。 ----
        const target = GRIP_CURLS[grip];
        const sign = side === right ? 1 : -1;
        for (let i = 0; i < side.fingers.length; i++) {
          const f = side.fingers[i];
          const k = Math.min(1, dt * GRIP_LERP * (1.2 - i * 0.1));
          f.curl += (target[i] - f.curl) * k;
          f.root.rotation.x = f.curl;
          // 远节跟随根部过弯（×0.6），侧面看是连续卷握弧线而非硬折角
          f.distal.rotation.x = f.curl * 0.6;
          if (i === 0) {
            // 拇指压顶：基准朝世界下方（局部 sign*90°），随握力微内收
            f.root.rotation.y = sign * (Math.PI / 2 - f.curl * 0.3);
          }
        }

        // ---- 腕部柔化：摆臂时手腕反向微垂（手的惯性滞后感），幅度随 swingAmp 起落。
        // x 基准 -0.18 = 手顺袖口的微垂角；z 基准 sign*90° = 掌心朝内扭转（见 buildSide）----
        if (side.t < 0) {
          const phase = walkPhase + (side === right ? 0 : Math.PI);
          side.hand.rotation.x = -0.18 - Math.sin(phase) * 0.2 * swingAmp;
          side.hand.rotation.z = sign * Math.PI / 2 + Math.sin(phase * 2) * 0.05 * swingAmp;
        }
      }

      // ---- 手持物展示动画：从下方 + 侧旋抬起归位（ease-out） ----
      if (heldShowT >= 0) {
        heldShowT += dt / HELD_SHOW_DURATION_S;
        if (heldShowT >= 1 || !heldMesh) {
          heldShowT = -1;
          if (heldMesh) {
            heldMesh.position.set(0, 0, 0);
            heldMesh.rotation.y = heldMesh.geometry instanceof THREE.PlaneGeometry ? HELD_PLANE_ROT_Y : 0;
          }
        } else {
          const e = 1 - (1 - heldShowT) * (1 - heldShowT); // easeOutQuad
          heldMesh!.position.y = -0.16 * (1 - e);
          const baseRotY =
            heldMesh!.geometry instanceof THREE.PlaneGeometry ? HELD_PLANE_ROT_Y : 0;
          heldMesh!.rotation.y = baseRotY + 0.9 * (1 - e);
        }
      }

      void anyPunching; // 姿态已在循环内逐侧处理（挥拳接管/idle 叠加），保留变量便于调试
    },

    setColors(s: number, sh: number): void {
      for (const side of [right, left]) {
        (side.sleeve.material as THREE.MeshLambertMaterial).color.setHex(sh);
        for (const m of side.skinMeshes) {
          (m.material as THREE.MeshLambertMaterial).color.setHex(s);
        }
      }
    },

    dispose(): void {
      clearHeldMesh();
      for (const t of tileTextures.values()) t.dispose();
      tileTextures.clear();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          // 多材质 mesh（手持方块六面）material 是数组——逐个 dispose
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m.dispose();
        }
      });
    },
  };
}
