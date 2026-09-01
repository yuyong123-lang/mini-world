// T22 玩家控制器单测——只测无 DOM 依赖的纯逻辑（输入合成/朝向/速度档/respawn/眼位）
import { describe, expect, it } from 'vitest';
import { WALK_SPEED, SPRINT_SPEED } from '../src/core/constants';
import {
  PlayerController,
  computeMoveDir,
  computeSpeed,
} from '../src/player/controller';

const K = { w: true, a: false, s: false, d: false };

describe('computeMoveDir 输入合成', () => {
  it('yaw=0 仅按 W → 正前 (0,-1)', () => {
    expect(computeMoveDir(0, K)).toEqual({ x: 0, z: -1 });
  });

  it('yaw=π/2 仅按 W → (-1,0)', () => {
    const d = computeMoveDir(Math.PI / 2, K);
    expect(d.x).toBeCloseTo(-1, 12);
    expect(d.z).toBeCloseTo(0, 12);
  });

  it('yaw=π/2 按组合键方向正确（W 后退一格验证右手系）', () => {
    // yaw=0 时右侧应是 +X：仅按 D → (1,0)（z 分量数值上是 -0，故用数值近似断言）
    const d0 = computeMoveDir(0, { w: false, a: false, s: false, d: true });
    expect(d0.x).toBeCloseTo(1, 12);
    expect(d0.z).toBeCloseTo(0, 12);
    // yaw=π/2 时右 = (cos(π/2), -sin(π/2)) = (0,-1)
    const d = computeMoveDir(Math.PI / 2, { w: false, a: false, s: false, d: true });
    expect(d.x).toBeCloseTo(0, 12);
    expect(d.z).toBeCloseTo(-1, 12);
  });

  it('W+D 对角合成后长度恒为 1（归一化）', () => {
    for (const yaw of [0, Math.PI / 2, Math.PI / 4, -2.3]) {
      const d = computeMoveDir(yaw, { w: true, a: false, s: false, d: true });
      expect(Math.hypot(d.x, d.z)).toBeCloseTo(1, 12);
    }
  });

  it('对角合成方向是前与右的角平分线', () => {
    const d = computeMoveDir(0, { w: true, a: false, s: false, d: true });
    expect(d.x).toBeCloseTo(Math.SQRT1_2, 12);
    expect(d.z).toBeCloseTo(-Math.SQRT1_2, 12);
  });

  it('无按键时返回零向量', () => {
    expect(computeMoveDir(1.234, { w: false, a: false, s: false, d: false })).toEqual({ x: 0, z: 0 });
  });

  it('互反按键相互抵消：W+S 与 A+D 均为零向量', () => {
    expect(
      computeMoveDir(0.7, { w: true, a: true, s: true, d: true }),
    ).toEqual({ x: 0, z: 0 });
  });

  it('仅按 S / 仅按 A 是前向与右侧的反向', () => {
    const s = computeMoveDir(0, { w: false, a: false, s: true, d: false });
    expect(s.x).toBeCloseTo(0, 12);
    expect(s.z).toBeCloseTo(1, 12); // 前向 (0,-1) 的反向
    const a = computeMoveDir(0, { w: false, a: true, s: false, d: false });
    expect(a.x).toBeCloseTo(-1, 12);
    expect(a.z).toBeCloseTo(0, 12); // 右侧 (1,0) 的反向
  });
});

describe('computeSpeed 速度档', () => {
  it('未冲刺取 WALK_SPEED，冲刺取 SPRINT_SPEED，且冲刺更快', () => {
    expect(computeSpeed(false)).toBe(WALK_SPEED);
    expect(computeSpeed(true)).toBe(SPRINT_SPEED);
    expect(SPRINT_SPEED).toBeGreaterThan(WALK_SPEED);
  });
});

describe('lookDir 视线向量', () => {
  // 用已构造的实例 + setKey 之外的纯状态读取；不触 DOM
  function makePlayer(yaw: number, pitch: number): Vec3Out {
    const p = new PlayerController();
    p.yaw = yaw;
    p.pitch = pitch;
    const out = { x: 0, y: 0, z: 0 };
    p.lookDir(out);
    return out;
  }

  it('yaw=0, pitch=0 → (0,0,-1)（契约 §12 验收锚点）', () => {
    const v = makePlayer(0, 0);
    expect(v.x).toBeCloseTo(0, 12);
    expect(v.y).toBeCloseTo(0, 12);
    expect(v.z).toBeCloseTo(-1, 12);
  });

  it('yaw=π/2 → (-1,0,0)', () => {
    const v = makePlayer(Math.PI / 2, 0);
    expect(v.x).toBeCloseTo(-1, 12);
    expect(v.y).toBeCloseTo(0, 12);
    expect(v.z).toBeCloseTo(0, 12);
  });

  it('pitch=π/2 → (0,1,0)（抬头正上方，近似）', () => {
    const v = makePlayer(0.37, Math.PI / 2);
    expect(v.x).toBeCloseTo(0, 9);
    expect(v.y).toBeCloseTo(1, 9);
    expect(v.z).toBeCloseTo(0, 9);
  });

  it('任意角度下都是单位向量', () => {
    for (const [yaw, pitch] of [[1.1, -0.4], [-2.5, 0.8], [0.001, 1.55]] as const) {
      const v = makePlayer(yaw, pitch);
      expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 12);
    }
  });

  it('pitch 限制 ±89°≈±1.5533 rad 由 bind 维护——此处只验公式在该范围内单调合理', () => {
    // sin(1.5533) ≈ 0.99984694（89° 不等于 90°，达不到 1），只验分量方向正确
    const up = makePlayer(0, 1.5533);
    expect(up.y).toBeGreaterThan(0.9998);
    expect(up.z).toBeLessThan(0);
    const down = makePlayer(0, -1.5533);
    expect(down.y).toBeLessThan(-0.9998);
    expect(down.z).toBeLessThan(0); // 低头时水平投影仍指 -Z
  });
});

type Vec3Out = { x: number; y: number; z: number };

describe('PlayerController 状态逻辑（无 DOM 部分）', () => {
  it('默认出生点为 (8,40,8)，pos 是 spawnPoint 的拷贝而非同引用', () => {
    const p = new PlayerController();
    expect(p.pos).toEqual({ x: 8, y: 40, z: 8 });
    expect(p.spawnPoint).toEqual({ x: 8, y: 40, z: 8 });
    expect(p.pos).not.toBe(p.spawnPoint);
  });

  it('Partial<Vec3> 覆盖出生点，缺省分量回落到默认值', () => {
    expect(new PlayerController({ y: 32 }).spawnPoint).toEqual({ x: 8, y: 32, z: 8 });
    expect(new PlayerController({}).spawnPoint).toEqual({ x: 8, y: 40, z: 8 });
  });

  it('宽高满足 PhysicsBody 约定 0.6×1.8，hp/hunger 初始 20', () => {
    const p = new PlayerController();
    expect(p.width).toBe(0.6);
    expect(p.height).toBe(1.8);
    expect(p.hp).toBe(20);
    expect(p.hunger).toBe(20);
    expect(p.onGround).toBe(false);
  });

  it('eyePosition = pos 上方 1.62 格', () => {
    const p = new PlayerController({ x: 10, y: 30, z: -4 });
    const e = p.eyePosition();
    expect(e).toEqual({ x: 10, y: 31.62, z: -4 });
    expect(e).not.toBe(p.pos); // 新对象，不共享引用
  });

  it('respawn 归位清速、hp/hunger 回满、视角归零', () => {
    const p = new PlayerController();
    p.pos = { x: 500, y: -900, z: 123 };
    p.vel = { x: 7, y: -3, z: 2 };
    p.hp = 3;
    p.hunger = 0;
    p.yaw = 2.5;
    p.pitch = -1.2;
    p.sprinting = true;

    p.respawn();

    expect(p.pos).toEqual(p.spawnPoint);
    expect(p.vel).toEqual({ x: 0, y: 0, z: 0 });
    expect(p.hp).toBe(20);
    expect(p.hunger).toBe(20);
    expect(p.yaw).toBe(0);
    expect(p.pitch).toBe(0);
    expect(p.sprinting).toBe(false);
  });

  it('setKey 不经 DOM 即可维护按键表；tick 在平地上走/jump 与 moveWithCollisions 衔接', () => {
    class FlatWorld { // 平面 world stub：y<0 全实心
      isSolid(_x: number, y: number, _z: number): boolean { return y < 0; }
    }
    const p = new PlayerController({ x: 0, y: 0, z: 0 });
    p.setKey('KeyW', true);

    let jumps = 0;
    const unbind = p.addJumpHook(() => { jumps++; });
    let velYAtJump = NaN;
    p.addJumpHook(() => { velYAtJump = p.vel.y; });

    const w = new FlatWorld();
    let frames = 0;
    // 落地
    while (!p.onGround && frames < 600) { p.tick(1 / 60, w); frames++; }
    expect(p.onGround).toBe(true);

    // 地面上持续按住前进 + 空格：应当跳起且仅触发一次 jump hook（直到再次落地）
    p.setKey('Space', true);
    p.tick(1 / 60, w);
    expect(jumps).toBe(1);
    expect(velYAtJump).toBeCloseTo(8.4, 6);
    expect(p.onGround).toBe(false); // 起跳离地

    const dir = computeMoveDir(p.yaw, { w: true, a: false, s: false, d: false });
    // 平滑若干帧后水平速度逼近 WALK_SPEED 且沿前方
    for (let i = 0; i < 60; i++) p.tick(1 / 60, w);
    expect(p.vel.x * dir.x + p.vel.z * dir.z).toBeCloseTo(WALK_SPEED, 3);
    unbind();

    // 疾跑档：ShiftLeft + 前进 → 逼近 SPRINT_SPEED
    p.setKey('ShiftLeft', true);
    for (let i = 0; i < 90; i++) p.tick(1 / 60, w);
    expect(p.sprinting).toBe(true);
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeCloseTo(SPRINT_SPEED, 3);
    expect(p.hunger).toBe(20); // FIXME(W6)：hunger 未接入冲刺条件
  });
});

describe('游泳物理：默认漂浮在水面', () => {
  /** 水世界 stub：y<=0 实心水底，y 1..4 为水，y 5+ 空气 */
  class WaterWorld {
    isSolid(_x: number, y: number, _z: number): boolean { return y <= 0; }
    isLiquid(_x: number, y: number, _z: number): boolean { return y >= 1 && y <= 4; }
  }

  it('全身没入水中且不按键：浮力使竖直速度转向上浮，绝不持续沉底', () => {
    const p = new PlayerController({ x: 0, y: 2, z: 0 });
    const w: never = new WaterWorld() as never;
    p.vel = { x: 0, y: -5, z: 0 }; // 模拟坠入水中的下坠余速
    p.tick(1 / 60, w);
    expect(p.inWater).toBe(true);
    for (let i = 0; i < 120; i++) p.tick(1 / 60, w); // 漂 2 秒
    expect(p.vel.y).toBeGreaterThan(0); // 浮力接管：正在向上
  });

  it('浮到水面后（眼睛出水）转为弱重力轻微回落 → 水面软平衡', () => {
    // pos.y=3.6 → 眼 5.22（floor=5，空气）→ 弱重力分支
    const p = new PlayerController({ x: 0, y: 3.6, z: 0 });
    const w: never = new WaterWorld() as never;
    p.vel = { x: 0, y: 1.5, z: 0 };
    p.tick(1 / 60, w);
    expect(p.vel.y).toBeLessThan(1.5); // 被弱重力 + 阻尼压回，不会蹿上天
    expect(p.inWater).toBe(true); // 身体仍在水中（脚部样本在水）
  });

  it('按住空格：上浮速度远大于自然浮力（可蹿出水面）；按住 Shift：转为下潜', () => {
    const w: never = new WaterWorld() as never;
    // 采样前 24 帧（0.4s）内的最大上浮速度——之后按空格者会蹿出水面进入空中，属正常行为
    const peakUp = (keys: string[]): number => {
      const p = new PlayerController({ x: 0, y: 2, z: 0 });
      for (const k of keys) p.setKey(k, true);
      let peak = -Infinity;
      for (let i = 0; i < 24; i++) {
        p.tick(1 / 60, w);
        peak = Math.max(peak, p.vel.y);
        if (!p.inWater) break; // 出水即停止采样
      }
      return peak;
    };
    expect(peakUp(['Space'])).toBeGreaterThan(peakUp([]) + 2); // 空格显著快于自然浮力
    const pDown = new PlayerController({ x: 0, y: 2, z: 0 });
    pDown.setKey('ShiftLeft', true);
    for (let i = 0; i < 60; i++) pDown.tick(1 / 60, w);
    expect(pDown.pos.y).toBeLessThanOrEqual(1); // 持续下潜到底
  });

  it('回归保护：无 isLiquid 注入的旧 world stub 不触发浮力（保持全重力）', () => {
    class SolidOnlyWorld {
      isSolid(_x: number, _y: number, _z: number): boolean { return false; }
    }
    const p = new PlayerController({ x: 0, y: 40, z: 0 });
    p.tick(1 / 60, new SolidOnlyWorld() as never);
    expect(p.inWater).toBe(false);
    expect(p.vel.y).toBeLessThan(-0.3); // 全重力生效
  });
});
