import { describe, expect, it } from 'vitest';
import { GRAVITY, JUMP_SPEED } from '../src/core/constants';
import { moveWithCollisions, type PhysicsBody } from '../src/physics/collide';

/** 测试用体素世界：Set 记录实心体素键 "x,y,z" */
class VoxelWorld {
  private solid = new Set<string>();
  fill(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void {
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) this.solid.add(`${x},${y},${z}`);
  }
  clear(x: number, y: number, z: number): void {
    this.solid.delete(`${x},${y},${z}`);
  }
  isSolid(x: number, y: number, z: number): boolean {
    return this.solid.has(`${x},${y},${z}`);
  }
}

function makeBody(pos: [number, number, number], vel: [number, number, number],
  width = 0.6, height = 1.8): PhysicsBody {
  return {
    pos: { x: pos[0], y: pos[1], z: pos[2] },
    vel: { x: vel[0], y: vel[1], z: vel[2] },
    width, height, onGround: false,
  };
}

/** 与实现无关的独立穿插检查：实体盒是否与任何实心体素重叠 */
function intersectsSolid(b: PhysicsBody, w: VoxelWorld): boolean {
  const hw = b.width / 2;
  const e = 1e-9;
  for (let y = Math.floor(b.pos.y + e); y <= Math.floor(b.pos.y + b.height - e); y++)
    for (let z = Math.floor(b.pos.z - hw + e); z <= Math.floor(b.pos.z + hw - e); z++)
      for (let x = Math.floor(b.pos.x - hw + e); x <= Math.floor(b.pos.x + hw - e); x++)
        if (w.isSolid(x, y, z)) return true;
  return false;
}

describe('collide 落地', () => {
  it('平地自由落体：脚底精确停在整数面，onGround=true，vel.y 清零', () => {
    const w = new VoxelWorld();
    w.fill(-20, 20, -1, -1, -20, 20);
    const b = makeBody([0, 5, 0], [0, 0, 0]);
    const dt = 1 / 60;
    for (let i = 0; i < 120; i++) {
      b.vel.y += GRAVITY * dt;
      moveWithCollisions(b, dt, w);
    }
    expect(Math.abs(b.pos.y - Math.round(b.pos.y))).toBeLessThan(1e-6);
    expect(b.pos.y).toBeCloseTo(0, 6);
    expect(b.onGround).toBe(true);
    expect(b.vel.y).toBe(0);
    // 持续站立：多帧后位置零漂移
    for (let i = 0; i < 60; i++) {
      b.vel.y += GRAVITY * dt;
      moveWithCollisions(b, dt, w);
      expect(b.pos.y).toBeCloseTo(0, 9);
      expect(b.onGround).toBe(true);
    }
    expect(intersectsSolid(b, w)).toBe(false);
  });

  it('站在地上水平行走不掉高度：y 保持整数、vel.z 不受 Y 处理影响', () => {
    const w = new VoxelWorld();
    w.fill(-20, 20, -1, -1, -20, 20);
    const b = makeBody([0, 0, 0], [4.3, 0, 2]);
    const dt = 1 / 60;
    for (let i = 0; i < 30; i++) {
      b.vel.y += GRAVITY * dt;
      moveWithCollisions(b, dt, w);
      expect(b.pos.y).toBe(0);
      expect(b.vel.z).toBe(2);
      expect(b.onGround).toBe(true);
    }
  });
});

describe('collide 水平截停', () => {
  it('向 +X 走向竖墙：贴墙距离 <w/2+1e-6，vel.z/vel.y 不受影响', () => {
    const w = new VoxelWorld();
    w.fill(10, 10, 0, 5, -6, 6); // x=10 的竖墙
    const b = makeBody([8, 0, 0], [4.3, 3, 1]);
    const dt = 0.1;
    for (let i = 0; i < 30; i++) moveWithCollisions(b, dt, w);
    expect(b.vel.x).toBe(0);
    const gap = 10 - b.pos.x;
    expect(gap).toBeGreaterThanOrEqual(b.width / 2);
    expect(gap).toBeLessThan(b.width / 2 + 1e-6);
    expect(b.vel.z).toBe(1); // 未被 X 截停波及
    expect(b.vel.y).toBe(3);
    expect(intersectsSolid(b, w)).toBe(false);
    expect(b.pos.z).toBeGreaterThan(0); // 沿墙滑动仍在继续
  });

  it('高速斜冲一帧穿越 1 格厚墙：子步机制使其停在外侧不穿墙', () => {
    const w = new VoxelWorld();
    w.fill(10, 10, -1, 4, -8, 8); // 单格厚薄墙
    const b = makeBody([12, 0, 0], [-100, 0, -60]);
    moveWithCollisions(b, 0.05, w); // 一帧位移 (-5, 0, -3)
    expect(b.pos.x).toBeGreaterThanOrEqual(11); // 墙外（墙面在 x=11）
    expect(b.pos.x - b.width / 2).toBeGreaterThanOrEqual(10);
    expect(b.pos.x).toBeLessThan(11.31); // 紧贴墙面而非远处弹开
    expect(b.vel.x).toBe(0);
    expect(b.pos.z).toBeLessThan(0); // Z 方向照常前进
    expect(b.vel.z).toBe(-60); // 未受 X 碰撞影响
    expect(intersectsSolid(b, w)).toBe(false);
  });

  it('斜冲墙角：X/Z 分别截停，无穿插', () => {
    const w = new VoxelWorld();
    w.fill(10, 14, 0, 4, -20, 20); // 竖墙 x=10..
    w.fill(-20, 20, 0, 4, 10, 14); // 横墙 z=10..（构成内角）
    const b = makeBody([5, 0, 5], [10, 0, 10]);
    const dt = 0.1;
    for (let i = 0; i < 30; i++) moveWithCollisions(b, dt, w);
    expect(b.vel.x).toBe(0);
    expect(b.vel.z).toBe(0);
    expect(10 - b.pos.x).toBeGreaterThanOrEqual(b.width / 2);
    expect(10 - b.pos.x).toBeLessThan(b.width / 2 + 1e-6);
    expect(10 - b.pos.z).toBeGreaterThanOrEqual(b.width / 2);
    expect(10 - b.pos.z).toBeLessThan(b.width / 2 + 1e-6);
    expect(intersectsSolid(b, w)).toBe(false);
  });
});

describe('collide 垂直细节', () => {
  it('跳起撞 2 格高天花板：vel.y 清零且不嵌入天花板', () => {
    const w = new VoxelWorld();
    w.fill(-6, 6, -1, -1, -6, 6); // 地板
    w.fill(-2, 2, 2, 2, -2, 2);   // 天花板：底面 y=2
    const b = makeBody([0, 0, 0], [0, 8.4, 0]);
    moveWithCollisions(b, 0.1, w);
    expect(b.vel.y).toBe(0);
    expect(b.pos.y).toBeGreaterThan(0);
    expect(b.pos.y + b.height).toBeLessThanOrEqual(2 + 1e-9); // 头顶未嵌入
    expect(b.onGround).toBe(false);
    expect(intersectsSolid(b, w)).toBe(false);
    // 随后回落重新落地
    const dt = 1 / 60;
    for (let i = 0; i < 90; i++) {
      b.vel.y += GRAVITY * dt;
      moveWithCollisions(b, dt, w);
    }
    expect(b.onGround).toBe(true);
    expect(b.pos.y).toBeCloseTo(0, 6);
  });

  it('自由飞行无碰撞：onGround 始终为 false；dt=0 仅重置 onGround', () => {
    const w = new VoxelWorld();
    const b = makeBody([0, 20, 0], [1, -5, 2]);
    const dt = 1 / 60;
    for (let i = 0; i < 40; i++) {
      moveWithCollisions(b, dt, w);
      expect(b.onGround).toBe(false);
    }
    expect(b.pos.y).toBeLessThan(20); // 确实在下落
    // dt=0：位置速度不变，onGround 归 false
    b.onGround = true;
    moveWithCollisions(b, 0, w);
    expect(b.onGround).toBe(false);
    expect(b.pos).toEqual({ x: b.pos.x, y: b.pos.y, z: b.pos.z });
    expect(b.vel).toEqual({ x: 1, y: -5, z: 2 });
  });

  it('走出地板边缘后 onGround 变 false 并开始下坠', () => {
    const w = new VoxelWorld();
    w.fill(-8, 5, -1, -1, -4, 4); // 地板到 x=5 为止（含）,边缘面 x=6
    const b = makeBody([0, 0, 0], [4.3, 0, 0]);
    const dt = 1 / 60;
    let sawGround = false;
    for (let i = 0; i < 80; i++) {
      b.vel.y += GRAVITY * dt;
      moveWithCollisions(b, dt, w);
      if (b.onGround) sawGround = true;
      else if (sawGround) {
        expect(b.pos.y).toBeLessThan(0); // 已离开支撑开始下坠
        return;
      }
    }
    expect(sawGround).toBe(true);
  });
});

describe('collide 地板缝隙', () => {
  /** 挖出一条 x=0、横贯全 z 的 1 格宽壕沟 */
  function trench(): VoxelWorld {
    const w = new VoxelWorld();
    w.fill(-8, 8, -1, -1, -3, 3);
    for (let z = -3; z <= 3; z++) w.clear(0, -1, z);
    return w;
  }

  it('盒仅部分覆盖壕沟时不坠落：完全悬于其正上方才开始掉落', () => {
    const w = trench();
    const b = makeBody([-1.5, 0, 0], [4.3, 0, 0]); // 从沟左侧走向右侧
    const dt = 1 / 60;
    const positions: { x: number; y: number; ground: boolean }[] = [];
    for (let i = 0; i < 40; i++) {
      b.vel.y += GRAVITY * dt;
      moveWithCollisions(b, dt, w);
      positions.push({ x: b.pos.x, y: b.pos.y, ground: b.onGround });
    }
    // 盒宽 0.6：脚底中心 x∈(0.3,0.7) 才完全不压任何实心体素；此前必须全程贴地
    const firstAir = positions.findIndex((p) => !p.ground);
    expect(firstAir).toBeGreaterThan(0);
    for (let i = 0; i < firstAir; i++) {
      expect(positions[i].ground).toBe(true);
      expect(positions[i].y).toBe(0);
    }
    expect(positions[firstAir].x).toBeGreaterThan(0.29);
    expect(positions[firstAir].x).toBeLessThan(0.71);
    expect(positions[firstAir].y).toBeLessThan(0);
    expect(intersectsSolid(b, w)).toBe(false);
  });

  it('坠入 2 格宽浅坑：落在坑底整数面且不嵌壁', () => {
    const w = new VoxelWorld();
    w.fill(-8, 8, -1, -1, -3, 3);
    w.fill(-8, 8, -2, -2, -3, 3); // 坑底
    for (let z = -3; z <= 3; z++) {
      w.clear(0, -1, z);
      w.clear(1, -1, z); // 挖出 2 格宽坑（自由区 x∈[0,2]）
    }
    const b = makeBody([1, 3, 0], [0, 0, 0]); // 坑正上方垂直落下
    const dt = 1 / 60;
    for (let i = 0; i < 90; i++) {
      b.vel.y += GRAVITY * dt;
      moveWithCollisions(b, dt, w);
    }
    expect(b.onGround).toBe(true);
    expect(b.pos.y).toBeCloseTo(-1, 9); // 站在坑底顶面（体素行 -2 的 maxY）
    expect(Math.abs(b.pos.x - 1)).toBeLessThan(1e-6); // 无水平位移
    expect(b.vel.y).toBe(0);
    expect(intersectsSolid(b, w)).toBe(false);
  });

  it('跳跃越过壕沟：滞空段 onGround=false，落地恢复精确整数面', () => {
    const w = trench();
    const b = makeBody([-2.5, 0, 0], [8, JUMP_SPEED, 0]);
    const dt = 1 / 60;
    let airborneOverGap = false;
    let landed = false;
    for (let i = 0; i < 80 && !landed; i++) {
      b.vel.y += GRAVITY * dt;
      moveWithCollisions(b, dt, w);
      if (b.pos.x > 0.3 && b.pos.x < 0.7 && b.pos.y > 0.01) airborneOverGap = true;
      if (b.onGround && b.pos.x > 1) landed = true;
    }
    expect(airborneOverGap).toBe(true);
    expect(landed).toBe(true);
    expect(b.pos.y).toBeCloseTo(0, 9);
    expect(intersectsSolid(b, w)).toBe(false);
  });
});
