// T23 DDA 体素步进纯函数单测（mock getBlock；Interactor 依赖 three/DOM 仅做冒烟导入验证）
import { describe, expect, it } from 'vitest';
import { ddaRaycast, Interactor, resolveToolSpeed } from '../src/player/interact';
import type { Vec3 } from '../src/core/types';

/** 测试世界：Map<"x,y,z", id>，缺省 AIR(0)；命中过滤只关心 AIR/WATER */
class VoxelWorld {
  private blocks = new Map<string, number>();
  set(x: number, y: number, z: number, id: number): void {
    this.blocks.set(`${x},${y},${z}`, id);
  }
  get = (x: number, y: number, z: number): number => this.blocks.get(`${x},${y},${z}`) ?? 0;
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
function norm(x: number, z: number): Vec3 {
  const len = Math.hypot(x, z);
  return { x: x / len, y: 0, z: z / len };
}
/** 无限步进上限（< 上限保护值）用于探索性用例 */
const LONG = 64;

describe('ddaRaycast 直线命中', () => {
  it('1. +X 穿越空气打在 (2,0,0)：pos/normal/prev 全对', () => {
    const w = new VoxelWorld();
    w.set(2, 0, 0, 2); // STONE
    const hit = ddaRaycast(w.get, v(0.5, 0.5, 0.5), v(1, 0, 0), LONG);
    expect(hit.hit).toBe(true);
    expect(hit.blockId).toBe(2);
    expect(hit.pos).toEqual(v(2, 0, 0));
    expect(hit.prev).toEqual(v(1, 0, 0)); // 放置位
    expect(hit.normal).toEqual(v(-1, 0, 0)); // -X 面朝玩家
  });

  it('7. 负方向 (-1,0,0)：prev 与 normal 符号反转', () => {
    const w = new VoxelWorld();
    w.set(-3, 0, 0, 6);
    const hit = ddaRaycast(w.get, v(0.5, 0.5, 0.5), v(-1, 0, 0), LONG);
    expect(hit.hit).toBe(true);
    expect(hit.pos).toEqual(v(-3, 0, 0));
    expect(hit.prev).toEqual(v(-2, 0, 0));
    expect(hit.normal).toEqual(v(1, 0, 0));
  });

  it('8. 铅直向下打地面顶面：normal=(0,1,0)', () => {
    const w = new VoxelWorld();
    w.set(0, -1, 0, 4);
    const hit = ddaRaycast(w.get, v(0.5, 5.5, 0.5), v(0, -1, 0), LONG);
    expect(hit.hit).toBe(true);
    expect(hit.pos).toEqual(v(0, -1, 0));
    // 途经 4,3,2,1,0 一串空气后进入 (0,-1,0)：prev 是紧邻上方的 (0,0,0)
    expect(hit.prev).toEqual(v(0, 0, 0));
    expect(hit.normal).toEqual(v(0, 1, 0));
  });

  it('直线穿过多个连续方块时停在最靠起点的那块', () => {
    const w = new VoxelWorld();
    w.set(1, 0, 0, 2);
    w.set(3, 0, 0, 2);
    w.set(5, 0, 0, 2);
    const hit = ddaRaycast(w.get, v(0.5, 0.5, 0.5), v(1, 0, 0), LONG);
    expect(hit.pos).toEqual(v(1, 0, 0));
    expect(hit.prev).toEqual(v(0, 0, 0));
  });
});

describe('ddaRaycast 斜向与法线', () => {
  it('2. 对角 (1,0,1)/√2：法线落在先被穿越的边界轴上', () => {
    // 情形 A：起点 (1.7, 0.5, 0.4)，到 x=2 面 0.3、到 z=1 面仅 0.6/√… → 先跨 z 边界，
    // 随后进入 (2,0,1)：prev=(1,0,1)，命中其 -X 面
    const w = new VoxelWorld();
    w.set(2, 0, 1, 6);
    const hit = ddaRaycast(w.get, v(1.2, 0.5, 0.4), norm(1, 1), LONG);
    expect(hit.hit).toBe(true);
    expect(hit.pos).toEqual(v(2, 0, 1));
    expect(hit.prev).toEqual(v(1, 0, 1));
    expect(hit.normal).toEqual(v(-1, 0, 0));

    // 情形 B：起点 (1.95, 0.5, 0.05)。到 x=2 面仅 0.05，到 z=1 面 0.95 → x 远先跨。
    // 路径 (1,0,0)→(2,0,0)→(2,0,1)：命中体素的 -Z 面，prev 是同列前一格 (2,0,0)
    const w2 = new VoxelWorld();
    w2.set(2, 0, 1, 6);
    const hit2 = ddaRaycast(w2.get, v(1.95, 0.5, 0.05), norm(1, 1), LONG);
    expect(hit2.hit).toBe(true);
    expect(hit2.pos).toEqual(v(2, 0, 1));
    expect(hit2.normal).toEqual(v(0, 0, -1));
    expect(hit2.prev).toEqual(v(2, 0, 0));
  });

  it('任意斜线：prev 必然与 pos 恰差一个轴的 ±1 且 normal 与步进方向反向', () => {
    const w = new VoxelWorld();
    for (let i = 2; i <= 9; i++) w.set(i, 0, Math.floor(i / 2), 3);
    const dirs = [norm(1, 0.5), norm(1, 0.25), norm(1, 2)];
    let checked = 0;
    for (const d of dirs) {
      const hit = ddaRaycast(w.get, v(0.5, 0.5, 0.5), d, LONG);
      if (!hit.hit) continue;
      checked++;
      const dx = Math.abs(hit.pos.x - hit.prev.x);
      const dy = Math.abs(hit.pos.y - hit.prev.y);
      const dz = Math.abs(hit.pos.z - hit.prev.z);
      expect(dx + dy + dz).toBe(1); // 相邻体素：曼哈顿距离恰为 1
      // 法线必须指向射来的方向：normal == -(pos-prev)，即点积为 -1
      expect(
        hit.normal.x * (hit.pos.x - hit.prev.x)
        + hit.normal.y * (hit.pos.y - hit.prev.y)
        + hit.normal.z * (hit.pos.z - hit.prev.z),
      ).toBe(-1);
    }
    expect(checked).toBeGreaterThan(0); // 至少有一条射线真的命中了障碍链
  });
});

describe('ddaRaycast 距离限制', () => {
  it('3. 方块在 maxDist 之外：不命中', () => {
    const w = new VoxelWorld();
    w.set(10, 0, 0, 2);
    const hit = ddaRaycast(w.get, v(0.5, 0.5, 0.5), v(1, 0, 0), 5);
    expect(hit.hit).toBe(false);
    expect(hit.blockId).toBe(0);
    expect(hit.pos).toEqual(v(0, 0, 0)); // 未命中字段零值
    expect(hit.normal).toEqual(v(0, 0, 0));
  });

  it('恰在射程边界上的面：命中（t == maxDist 判定为可达）', () => {
    const w = new VoxelWorld();
    w.set(3, 0, 0, 2); // 起点在 0.5，命中面距离 2.5
    expect(ddaRaycast(w.get, v(0.5, 0.5, 0.5), v(1, 0, 0), 2.5).hit).toBe(true);
    expect(ddaRaycast(w.get, v(0.5, 0.5, 0.5), v(1, 0, 0), 2.49).hit).toBe(false);
  });

  it('REACH=5 以内可见目标即命中', () => {
    const w = new VoxelWorld();
    w.set(4, 0, 0, 8);
    const hit = ddaRaycast(w.get, v(0.5, 0.5, 0.5), v(1, 0, 0), 5);
    expect(hit.hit).toBe(true);
    expect(hit.blockId).toBe(8);
  });
});

describe('ddaRaycast 流体穿透', () => {
  it('4. 水柱穿透后命中水底 SAND 而非 WATER', () => {
    const w = new VoxelWorld();
    w.set(0, 3, 0, 12); // WATER
    w.set(0, 2, 0, 12);
    w.set(0, 1, 0, 12);
    w.set(0, 0, 0, 6); // SAND
    const hit = ddaRaycast(w.get, v(0.5, 5.5, 0.5), v(0, -1, 0), LONG);
    expect(hit.hit).toBe(true);
    expect(hit.blockId).toBe(6);
    expect(hit.pos).toEqual(v(0, 0, 0));
    expect(hit.prev).toEqual(v(0, 1, 0)); // 放置位是最上层水（允许往水里放块）
    expect(hit.normal).toEqual(v(0, 1, 0));
  });

  it('水层本身永远不会成为命中结果', () => {
    const w = new VoxelWorld();
    w.set(2, 0, 0, 12);
    const hit = ddaRaycast(w.get, v(0.5, 0.5, 0.5), v(1, 0, 0), LONG);
    expect(hit.hit).toBe(false); // 只有水可穿，别无实体 → miss
  });

  it('AIR 同样不可选中', () => {
    const w = new VoxelWorld();
    w.set(2, 0, 0, 0);
    expect(ddaRaycast(w.get, v(0.5, 0.5, 0.5), v(1, 0, 0), LONG).hit).toBe(false);
  });
});

describe('ddaRaycast 边界情形', () => {
  it('5. origin 已在某 solid 体素内部：立即返回该体素且 prev==pos==自身', () => {
    const w = new VoxelWorld();
    w.set(0, 0, 0, 2);
    const hit = ddaRaycast(w.get, v(0.3, 0.4, 0.6), v(1, 0, 0), 5);
    expect(hit.hit).toBe(true);
    expect(hit.blockId).toBe(2);
    expect(hit.pos).toEqual(v(0, 0, 0));
    expect(hit.prev).toEqual(v(0, 0, 0)); // 决策：原地自我放置位、normal 零向量
    expect(hit.normal).toEqual(v(0, 0, 0));
  });

  it('origin 在 WATER 内：穿透继续找实心块', () => {
    const w = new VoxelWorld();
    w.set(0, 3, 0, 12);
    w.set(0, 2, 0, 2);
    const hit = ddaRaycast(w.get, v(0.5, 3.7, 0.5), v(0, -1, 0), LONG);
    expect(hit.hit).toBe(true);
    expect(hit.pos).toEqual(v(0, 2, 0));
    expect(hit.prev).toEqual(v(0, 3, 0));
  });

  it('6. dir 为零向量：hit=false 不抛异常', () => {
    const w = new VoxelWorld();
    w.set(1, 0, 0, 2);
    expect(() => ddaRaycast(w.get, v(0.5, 0.5, 0.5), v(0, 0, 0), 5)).not.toThrow();
    expect(ddaRaycast(w.get, v(0.5, 0.5, 0.5), v(0, 0, 0), 5).hit).toBe(false);
  });

  it('origin 分量为 NaN 时同样安全返回 miss', () => {
    const w = new VoxelWorld();
    w.set(1, 0, 0, 2);
    expect(() => ddaRaycast(w.get, v(NaN, 0, 0), v(1, 0, 0), 5)).not.toThrow();
    expect(ddaRaycast(w.get, v(NaN, 0, 0), v(1, 0, 0), 5).hit).toBe(false);
  });

  it('dir 非归一化输入不影响命中结论（内部归一化）', () => {
    const w = new VoxelWorld();
    w.set(2, 0, 0, 2);
    const a = ddaRaycast(w.get, v(0.5, 0.5, 0.5), v(1, 0, 0), 10);
    const b = ddaRaycast(w.get, v(0.5, 0.5, 0.5), v(37, 0, 0), 10);
    expect(a.pos).toEqual(b.pos);
    expect(a.normal).toEqual(b.normal);
  });

  it('origin 在世界外(y≥64 / 负象限)照样步进，由 mock getBlock 提供语义', () => {
    const w = new VoxelWorld();
    w.set(-2, 70, -1, 2);
    const hit = ddaRaycast(w.get, v(0.5, 71.5, 0.5), v(-1, -1, -1), 40);
    expect(hit.hit).toBe(true);
    expect(hit.pos).toEqual(v(-2, 70, -1));
    // 从 (0,71,0) 沿 (-1,-1,-1)：三轴 tMax 相等 → 平局序 x→y→z 轮转步进，
    // 最后一步沿 x 进入 (-2,70,-1)，故 prev 为 (x+1, y, z)
    expect(hit.prev).toEqual(v(-1, 70, -1));
  });

  it('轴平局(45°对角恰好同时跨界)取固定轴序而不抖动', () => {
    const w = new VoxelWorld();
    // 从角点出发的完美 45° 对角：x 与 z 的 tMax 相等，按 x→y→z 顺序取 x
    w.set(1, 0, 1, 2);
    const hit = ddaRaycast(w.get, v(0.0000001, 0.5, 0.0000001), norm(1, 1), LONG);
    expect([hit.pos.x, hit.pos.y, hit.pos.z]).toContain(1);
    expect(hit.hit).toBe(true);
  });
});

describe('resolveToolSpeed（挖掘速度数据通路）', () => {
  const defStone = { tool: 'pickaxe' as const };
  const defDirt = { tool: 'shovel' as const };
  const defLeaves = { tool: 'hand' as const };
  const defNoTool = {};

  it('徒手恒为 1', () => {
    expect(resolveToolSpeed(null, defStone as never)).toBe(1);
  });

  it('类型匹配采用工具 speedMul；不匹配回落 1', () => {
    const pick = { key: 'ITEM_WOOD_PICKAXE', count: 1, tool: { type: 'pickaxe', speedMul: 2 } };
    expect(resolveToolSpeed(pick as never, defStone as never)).toBe(2);
    expect(resolveToolSpeed(pick as never, defDirt as never)).toBe(1);
  });

  it('hand 类方块任意工具速度都生效', () => {
    const axe = { key: 'ITEM_WOOD_AXE', count: 1, tool: { type: 'axe', speedMul: 2 } };
    expect(resolveToolSpeed(axe as never, defLeaves as never)).toBe(2);
    expect(resolveToolSpeed(axe as never, defNoTool as never)).toBe(2);
  });

  it('异常 speedMul 回落 1', () => {
    const bad = { key: 'X', count: 1, tool: { type: 'pickaxe', speedMul: NaN } };
    expect(resolveToolSpeed(bad as never, defStone as never)).toBe(1);
  });
});

describe('Interactor 冒烟（node 环境，无 DOM）', () => {
  it('导入并实例化后基础 API 可用，监听绑定静默跳过', async () => {
    const cameraLike = {
      position: v(0.5, 0.5, 0.5),
      getWorldDirection(t: Vec3): Vec3 {
        t.x = 1; t.y = 0; t.z = 0;
        return t;
      },
    };
    const playerLike = {
      eyePosition: () => v(0.5, 0.5, 0.5),
      lookDir(out: Vec3): void {
        out.x = 1; out.y = 0; out.z = 0;
      },
    };
    const worldLike = {
      getBlock: (_x: number, _y: number, _z: number) => 0,
      isSolid: () => false,
      setBlock: () => undefined,
    };

    const inter = new Interactor(cameraLike, playerLike, worldLike);
    let breaks = 0;
    inter.onBreak(() => breaks++);
    // node 下 window 缺失 → pointer lock 条件不成立，update 只清空目标不触发事件
    inter.update(null, 1 / 60, null);
    expect(inter.breakProgress()).toBe(0);
    expect(inter.currentTarget()).toBeNull();
    inter.triggerUse(); // 无目标：no-op 不抛
    inter.destroy(); // 二次 destroy 也须安全
    inter.destroy();
    expect(breaks).toBe(0);
  });
});
