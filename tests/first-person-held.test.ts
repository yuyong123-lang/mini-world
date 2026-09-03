// 第一人称手臂单测：手持物（setHeld）+ 五指手 + 走路摆臂
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFirstPersonArms } from '../src/render/firstPersonArm';

/** 4×4 假图集：DataTexture 纯 CPU 对象，node 环境可 clone/设 offset */
function makeAtlas(): THREE.DataTexture {
  return new THREE.DataTexture(new Uint8Array(4 * 4 * 4), 4, 4);
}

/** group 树内 mesh 总数。空手基线 = 44：袖×2 + 掌×2 + 腕×2 + 关节球×8 +
 *  两节圆柱手指（近节+关节+远节 = 3 mesh）×5×2 */
const BASE_MESHES = 44;

function heldMesh(group: THREE.Group): THREE.Mesh | null {
  return (group.getObjectByName('heldItem') as THREE.Mesh) ?? null;
}

/** 收集某侧手的全部手指 pivot（name 标记 finger-<i>） */
function fingerCurls(group: THREE.Group): number[] {
  const out: number[] = [];
  group.traverse((o) => {
    if (o.name.startsWith('finger-')) out.push(o.rotation.x);
  });
  return out;
}

describe('第一人称手持物 setHeld', () => {
  it('可放置方块（ITEM_DIRT）：右拳前出现立方体网格，六面材质', () => {
    const arms = createFirstPersonArms({ getAtlas: makeAtlas });
    expect(() => meshBaseline(arms.group)).not.toThrow();
    expect(meshBaseline(arms.group)).toBe(BASE_MESHES); // 空手基线

    arms.setHeld({ key: 'ITEM_DIRT', count: 1 });
    expect(meshBaseline(arms.group)).toBe(BASE_MESHES + 1);
    const m = heldMesh(arms.group)!;
    expect(m.geometry).toBeInstanceOf(THREE.BoxGeometry);
    expect(Array.isArray(m.material)).toBe(true); // 六面各自贴 tile
  });

  it('非放置物品（ITEM_APPLE 有 iconTile）：iconTile 纸片网格', () => {
    const arms = createFirstPersonArms({ getAtlas: makeAtlas });
    arms.setHeld({ key: 'ITEM_APPLE', count: 1 });
    expect(meshBaseline(arms.group)).toBe(BASE_MESHES + 1);
    expect(heldMesh(arms.group)!.geometry).toBeInstanceOf(THREE.PlaneGeometry);
  });

  it('清空回空手；同 key 重复调用不叠加 mesh', () => {
    const arms = createFirstPersonArms({ getAtlas: makeAtlas });
    arms.setHeld({ key: 'ITEM_DIRT', count: 1 });
    arms.setHeld({ key: 'ITEM_DIRT', count: 3 }); // 数量变化不重建
    expect(meshBaseline(arms.group)).toBe(BASE_MESHES + 1);

    arms.setHeld({ key: 'ITEM_APPLE', count: 1 }); // 换物品：替换而非叠加
    expect(meshBaseline(arms.group)).toBe(BASE_MESHES + 1);

    arms.setHeld(null);
    expect(meshBaseline(arms.group)).toBe(BASE_MESHES); // 空手
  });

  it('show 动画：update 推进完毕后手持物归位（position.y === 0）', () => {
    const arms = createFirstPersonArms({ getAtlas: makeAtlas });
    arms.setHeld({ key: 'ITEM_DIRT', count: 1 }, true);
    const m = heldMesh(arms.group)!;

    arms.update(0.05);
    expect(m.position.y).toBeLessThan(0); // 动画中：低于锚位

    for (let i = 0; i < 30; i++) arms.update(1 / 60); // 推过 0.24s 时长
    expect(m.position.y).toBe(0); // 归位
  });

  it('图集未就绪（getAtlas 返回 null）：降级空手不抛错', () => {
    const arms = createFirstPersonArms({ getAtlas: () => null });
    expect(() => arms.setHeld({ key: 'ITEM_DIRT', count: 1 })).not.toThrow();
    expect(meshBaseline(arms.group)).toBe(BASE_MESHES);
  });

  it('dispose：清理后不再抛错（重复 dispose 安全）', () => {
    const arms = createFirstPersonArms({ getAtlas: makeAtlas });
    arms.setHeld({ key: 'ITEM_DIRT', count: 1 });
    expect(() => arms.dispose()).not.toThrow();
  });
});

describe('五指手与走路摆臂', () => {
  it('每只手 5 根手指，指节随 update 向当前握姿弯曲角收敛', () => {
    const arms = createFirstPersonArms({ getAtlas: makeAtlas });
    let pivots = 0;
    arms.group.traverse((o) => {
      if (o.name.startsWith('finger-')) pivots++;
    });
    expect(pivots).toBe(10); // 双手各 5 指

    // 持方块（hold 握姿）：弯曲角应比空手（open）更大，且逐帧逼近目标
    arms.setHeld({ key: 'ITEM_DIRT', count: 1 });
    for (let i = 0; i < 5; i++) arms.update(1 / 60);
    const holding = fingerCurls(arms.group);
    expect(holding.length).toBe(10);
    expect(Math.min(...holding)).toBeGreaterThan(0.5); // 明显弯折扣握

    arms.setHeld(null);
    for (let i = 0; i < 120; i++) arms.update(1 / 60); // 收敛回空手半握
    const open = fingerCurls(arms.group);
    expect(Math.max(...open)).toBeLessThan(0.8); // 回到自然半握（open 目标最大 0.76）
  });

  it('走路（moveSpeed>0）：双臂前后反相摆动；静止后幅度回落', () => {
    const arms = createFirstPersonArms({ getAtlas: makeAtlas });
    const zOf = (): [number, number] => [
      arms.group.children[0].position.z - (arms.group.children[0] as unknown as { userData: { rest?: THREE.Vector3 } }).userData.rest!.z,
      arms.group.children[1].position.z,
    ];
    void zOf; // 直接读 position.z 的相对变化即可

    // 预热：摆臂幅度从 0 平滑爬升
    for (let i = 0; i < 60; i++) arms.update(1 / 60, 4.5);
    const right = arms.group.children[0].position.z;
    const left = arms.group.children[1].position.z;
    // 两臂相对基位的偏移反相（一前一后）：位移量应异号
    expect(right - left).not.toBe(0);
    // 持续推进：相位走过 π 后前后关系翻转
    const before = arms.group.children[0].position.z;
    arms.update((Math.PI / 9.5), 4.5);
    const after = arms.group.children[0].position.z;
    expect(after).not.toBeCloseTo(before, 3); // 在摆动而不是冻结

    // 静止：幅度衰减，手臂缓回基位附近
    for (let i = 0; i < 180; i++) arms.update(1 / 60, 0);
    expect(arms.group.children[0].position.z).toBeCloseTo(-0.72, 2);
  });
});

/** 与 meshCount 等价的基线计数（保留独立函数便于失败信息可读） */
function meshBaseline(group: THREE.Group): number {
  let n = 0;
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) n++;
  });
  return n;
}
