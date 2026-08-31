// render/firstPersonArm.ts —— 第一人称双臂（左右交替出拳 / 挥击表现）
//
// 此前第一人称没有任何手臂模型，徒手攻击缺乏动作反馈。本模块把「衣袖 + 拳头」
// 的双臂挂在相机局部空间（屏幕左下/右下各一只），攻击/挖掘时**左右交替**出拳。
//
// 挂载约定：scene.add(camera) 后 camera.add(group)——three 的相机不在场景树
// 时其子对象不会被渲染。group 原点即相机，局部 -Z 为视线方向。
//
// 颜色取自装扮（Cosmetics），main 装配时传入；换装时 setColors 同步。

import * as THREE from 'three';

/** 单次挥拳动画时长（秒）：出拳-收拳一个来回 */
const PUNCH_DURATION_S = 0.22;
/** 手臂在屏幕两侧的横向基位（相机局部 X） */
const ARM_X = 0.42;
/** 出拳时前伸的目标偏移（沿 -Z 前推 + 抬高 + 向中线收拢） */
const PUNCH_OFFSET = { x: -0.1, y: 0.1, z: -0.42 };

export interface FirstPersonArms {
  /** 相机子节点（挂到 camera 下） */
  group: THREE.Group;
  /** 触发一次挥拳（左右自动交替：右→左→右…；重复调用从头重放当前拳） */
  punch(): void;
  /** 每帧推进动画（dt 秒；非攻击态做轻微呼吸浮动） */
  update(dt: number): void;
  /** 是否正在挥拳（用于 HUD/逻辑联动） */
  punching(): boolean;
  /** 换装同步（hex 0xRRGGBB） */
  setColors(skin: number, shirt: number): void;
  dispose(): void;
}

interface ArmSide {
  group: THREE.Group;
  arm: THREE.Group;
  sleeve: THREE.Mesh;
  fist: THREE.Mesh;
  rest: THREE.Vector3;
  t: number; // <0 = 空闲；0..1 = 挥拳进度
}

function buildSide(sign: 1 | -1, skin: number, shirt: number): ArmSide {
  const group = new THREE.Group();

  const sleeve = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.16, 0.34),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  sleeve.position.set(0, 0, 0.24);
  const fist = new THREE.Mesh(
    new THREE.BoxGeometry(0.17, 0.17, 0.2),
    new THREE.MeshLambertMaterial({ color: skin }),
  );
  fist.position.set(0, 0, -0.02);

  const arm = new THREE.Group();
  arm.add(sleeve);
  arm.add(fist);
  // 微内旋（左右镜像），避免完全平行视线的呆板感
  arm.rotation.set(0.12, -0.22 * sign, 0.08 * sign);
  group.add(arm);

  // 基位：右臂 sign=1 在右下、左臂 sign=-1 在左下
  const rest = new THREE.Vector3(ARM_X * sign, -0.38, -0.72);
  group.position.copy(rest);

  return { group, arm, sleeve, fist, rest, t: -1 };
}

export function createFirstPersonArms(opts?: { skin?: number; shirt?: number }): FirstPersonArms {
  const skin = opts?.skin ?? 0xe0b088;
  const shirt = opts?.shirt ?? 0x3a7bd5;

  const group = new THREE.Group();
  const right = buildSide(1, skin, shirt);
  const left = buildSide(-1, skin, shirt);
  group.add(right.group);
  group.add(left.group);

  /** 交替状态：true=下一拳右臂，false=下一拳左臂（首拳右手） */
  let nextRight = true;
  let breathe = 0;

  const animatePunch = (side: ArmSide, progress: number): void => {
    const sign = side === right ? 1 : -1;
    const e = Math.sin(Math.min(1, progress) * Math.PI); // 0→1→0 正弦包络
    side.group.position.set(
      side.rest.x + (PUNCH_OFFSET.x * sign) * e, // 出拳时向中线收拢
      side.rest.y + PUNCH_OFFSET.y * e,
      side.rest.z + PUNCH_OFFSET.z * e,
    );
    side.arm.rotation.x = 0.12 - e * 0.55; // 出拳时手腕下压
  };

  const resetSide = (side: ArmSide): void => {
    side.group.position.copy(side.rest);
    side.arm.rotation.x = 0.12;
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

    update(dt: number): void {
      let anyPunching = false;
      for (const side of [right, left]) {
        if (side.t >= 0) {
          anyPunching = true;
          side.t += dt / PUNCH_DURATION_S;
          if (side.t >= 1) {
            side.t = -1;
            resetSide(side);
          } else {
            animatePunch(side, side.t);
          }
        }
      }

      if (!anyPunching) {
        // 非攻击态：双臂轻微交替呼吸浮动（提示手臂存在）
        breathe += dt;
        right.group.position.y = right.rest.y + Math.sin(breathe * 1.7) * 0.012;
        left.group.position.y = left.rest.y + Math.sin(breathe * 1.7 + Math.PI) * 0.012;
      }
    },

    setColors(s: number, sh: number): void {
      for (const side of [right, left]) {
        (side.fist.material as THREE.MeshLambertMaterial).color.setHex(s);
        (side.sleeve.material as THREE.MeshLambertMaterial).color.setHex(sh);
      }
    },

    dispose(): void {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    },
  };
}
