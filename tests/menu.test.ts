// menu 纯逻辑单测（node 无 DOM；DOM 行为不强测，只验模块级决策函数）
import { describe, expect, it } from 'vitest';
import { buttonsFor, viewDistanceToFog } from '../src/ui/menu';
import { DEFAULT_SETTINGS, type SettingsData } from '../src/core/settings';

describe('viewDistanceToFog（雾距按 rd/6 比例缩放）', () => {
  it('任务卡锚点：rd=6 → {near:78, far:92}', () => {
    expect(viewDistanceToFog(6)).toEqual({ near: 78, far: 92 });
  });

  it('任务卡锚点：rd=3 → {near:39, far:46}', () => {
    expect(viewDistanceToFog(3)).toEqual({ near: 39, far: 46 });
  });

  it('rd=8 → 整比例放大 {near:104, far:122.67→123}', () => {
    expect(viewDistanceToFog(8)).toEqual({ near: Math.round(78 * (8 / 6)), far: Math.round(92 * (8 / 6)) });
    expect(viewDistanceToFog(8).far).toBe(123);
    expect(viewDistanceToFog(8).near).toBe(104);
  });

  it('中间档单调递增且 near 恒小于 far', () => {
    let prev = -Infinity;
    for (let rd = 3; rd <= 8; rd++) {
      const f = viewDistanceToFog(rd);
      expect(f.near).toBeGreaterThan(prev);
      prev = f.near;
      expect(f.near).toBeLessThan(f.far);
    }
  });

  it('脏输入安全：非整数取整、越界钳制到 [3,8]', () => {
    expect(viewDistanceToFog(5.4)).toEqual(viewDistanceToFog(5));
    expect(viewDistanceToFog(0)).toEqual(viewDistanceToFog(3));
    expect(viewDistanceToFog(99)).toEqual(viewDistanceToFog(8));
    expect(viewDistanceToFog(-2)).toEqual(viewDistanceToFog(3));
    // 非数值回落基准视距
    expect(viewDistanceToFog(Number.NaN)).toEqual(viewDistanceToFog(DEFAULT_SETTINGS.viewDistance));
  });
});

describe('buttonsFor（主菜单按钮可见性决策）', () => {
  it('有存档 → 继续游戏在前、新世界在后', () => {
    expect(buttonsFor(true)).toEqual(['continue', 'new']);
  });

  it('无存档 → 只有新世界', () => {
    expect(buttonsFor(false)).toEqual(['new']);
  });

  it('顺序不变量：continue 若出现必为第一个（测试与真实渲染共用同一函数）', () => {
    for (const has of [true, false]) {
      const b = buttonsFor(has);
      const idx = b.indexOf('continue');
      expect(idx === -1 || idx === 0).toBe(true);
      expect(b[b.length - 1]).toBe('new');
      expect(new Set(b).size).toBe(b.length); // 无重复按钮
    }
  });
});

describe('DEFAULT_SETTINGS 与菜单默认控件一致性（口径锚点）', () => {
  it('默认视距 6 是雾距标定基准', () => {
    expect(viewDistanceToFog(DEFAULT_SETTINGS.viewDistance)).toEqual({ near: 78, far: 92 });
  });

  it('默认值在滑条可表达范围内（3..8 / 0.0005..0.005 / 0..1）', () => {
    const d: SettingsData = DEFAULT_SETTINGS;
    expect(d.viewDistance).toBeGreaterThanOrEqual(3);
    expect(d.viewDistance).toBeLessThanOrEqual(8);
    expect(d.sensitivity).toBeGreaterThanOrEqual(0.0005);
    expect(d.sensitivity).toBeLessThanOrEqual(0.005);
    expect(d.volume).toBeGreaterThanOrEqual(0);
    expect(d.volume).toBeLessThanOrEqual(1);
  });
});
