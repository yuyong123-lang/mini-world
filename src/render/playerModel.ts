// render/playerModel.ts —— 玩家第三人称小人模型（box 组合，与生物视图同风格）
// 头/躯干/双臂/双腿各一段，walkPhase 驱动四肢摆动。第一人称时隐藏。

import * as THREE from 'three';

export interface PlayerModel {
  /** 挂到 scene 的根组（原点 = 脚底中心） */
  root: THREE.Group;
  /** 行走相位推进：speedRatio ∈ [0,1] 控制摆臂幅度，dt 秒 */
  animate(dt: number, speedRatio: number, isMoving: boolean): void;
  setVisible(v: boolean): void;
  dispose(): void;
}

const SKIN = 0xe0b088;
const SHIRT = 0x3a7bd5;
const PANTS = 0x35415e;
const HAIR = 0x4a3220;

function limb(w: number, h: number, d: number, color: number): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  return mesh;
}

export function createPlayerModel(): PlayerModel {
  const root = new THREE.Group();

  // ---- 躯干（0.5×0.75×0.3，底部在 0.75 高度） ----
  const torso = limb(0.5, 0.75, 0.3, SHIRT);
  torso.position.set(0, 1.125, 0); // 0.75..1.5
  root.add(torso);

  // ---- 头（0.5 立方 + 头发盖片） ----
  const head = limb(0.5, 0.5, 0.5, SKIN);
  head.position.set(0, 1.75, 0); // 1.5..2.0 —— 原点在脚底，头顶 ≈ 1.8 玩家盒高（模型略高出 0.2 可接受）
  root.add(head);
  const hair = limb(0.52, 0.15, 0.52, HAIR);
  hair.position.set(0, 1.95, 0);
  root.add(hair);

  // ---- 四肢：pivot 在肩/髋（旋转轴），网格向下偏移半长 ----
  function makeLimb(w: number, len: number, d: number, color: number, x: number, hipY: number): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.set(x, hipY, 0);
    const mesh = limb(w, len, d, color);
    mesh.position.set(0, -len / 2, 0);
    pivot.add(mesh);
    root.add(pivot);
    return pivot;
  }

  const armL = makeLimb(0.18, 0.72, 0.18, SHIRT, -0.34, 1.5);
  const armR = makeLimb(0.18, 0.72, 0.18, SHIRT, 0.34, 1.5);
  const legL = makeLimb(0.22, 0.75, 0.22, PANTS, -0.13, 0.75);
  const legR = makeLimb(0.22, 0.75, 0.22, PANTS, 0.13, 0.75);

  let phase = 0;

  return {
    root,
    animate(dt, speedRatio, isMoving) {
      if (isMoving) {
        phase += dt * 9 * Math.max(0.4, speedRatio);
        const swing = Math.sin(phase) * 0.7 * speedRatio;
        armL.rotation.x = swing;
        armR.rotation.x = -swing;
        legL.rotation.x = -swing;
        legR.rotation.x = swing;
      } else {
        // 静止缓归零
        const relax = Math.min(1, dt * 10);
        armL.rotation.x *= 1 - relax;
        armR.rotation.x *= 1 - relax;
        legL.rotation.x *= 1 - relax;
        legR.rotation.x *= 1 - relax;
      }
    },
    setVisible(v) {
      root.visible = v;
    },
    dispose() {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    },
  };
}
