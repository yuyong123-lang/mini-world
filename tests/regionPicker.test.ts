// 选区像素图数据单测（node 环境，零 DOM——regionPickerData.ts 是纯数据模块）：
// 网格尺寸 / 字符集 / 34 码逐码像素数与 4-连通 / 码表↔REGIONS 一致性 /
// PICKABLE 派生 / dongbei「在表不在图」。
// 注：同款硬校验也在模块加载时执行（画错 import 即抛错），此处是可读的逐项断言。
import { describe, expect, it } from 'vitest';

import { CHINA_MAP, CODE_TO_REGION, MAP_H, MAP_W, PICKABLE } from '../src/ui/regionPickerData';
import { REGIONS } from '../src/data/regions';

/** 每个码的像素坐标表（从 CHINA_MAP 派生） */
function pixelsOf(code: string): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (const [r, row] of CHINA_MAP.entries()) {
    for (const [c, ch] of [...row!].entries()) {
      if (ch === code) pts.push([r, c]);
    }
  }
  return pts;
}

/** BFS 4-连通判定 */
function connected(pts: Array<[number, number]>): boolean {
  const set = new Set(pts.map(([r, c]) => `${r},${c}`));
  const seen = new Set<string>([pts[0]!.join(',')]);
  const queue = [pts[0]!];
  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const key = `${r + dr},${c + dc}`;
      if (set.has(key) && !seen.has(key)) {
        seen.add(key);
        queue.push([r + dr, c + dc]);
      }
    }
  }
  return seen.size === pts.length;
}

describe('CHINA_MAP 网格', () => {
  it('40 行 × 48 列', () => {
    expect(CHINA_MAP).toHaveLength(MAP_H);
    expect(MAP_H).toBe(40);
    expect(MAP_W).toBe(48);
    for (const [i, row] of CHINA_MAP.entries()) {
      expect(row, `第 ${i} 行`).toHaveLength(MAP_W);
    }
  });

  it('字符集 ∈ {0,1} ∪ 34 个区域码', () => {
    const ok = new Set(['0', '1', ...Object.keys(CODE_TO_REGION)]);
    for (const row of CHINA_MAP) {
      for (const ch of row!) expect(ok.has(ch), `字符 '${ch}'`).toBe(true);
    }
  });
});

describe('34 区域码', () => {
  const CODES = Object.keys(CODE_TO_REGION);

  it('码表恰好 34 项', () => {
    expect(CODES).toHaveLength(34);
  });

  it('旧六区码沿用不动', () => {
    expect(CODE_TO_REGION['2']).toBe('sichuan');
    expect(CODE_TO_REGION['3']).toBe('beijing');
    expect(CODE_TO_REGION['4']).toBe('yunnan');
    expect(CODE_TO_REGION['5']).toBe('neimenggu');
    expect(CODE_TO_REGION['6']).toBe('xinjiang');
    expect(CODE_TO_REGION['7']).toBe('heilongjiang');
  });

  for (const code of CODES) {
    it(`码 '${code}'（${CODE_TO_REGION[code]!}）≥2 像素且 4-连通`, () => {
      const pts = pixelsOf(code);
      expect(pts.length, '像素数').toBeGreaterThanOrEqual(2);
      expect(connected(pts), '4-连通').toBe(true);
    });
  }
});

describe('码表 ↔ 区域表一致性', () => {
  it('CODE_TO_REGION 值全部在 REGIONS 中', () => {
    for (const id of Object.values(CODE_TO_REGION)) {
      expect(Object.prototype.hasOwnProperty.call(REGIONS, id)).toBe(true);
    }
  });

  it('PICKABLE = Object.values(CODE_TO_REGION) 派生一致', () => {
    expect([...PICKABLE]).toEqual(Object.values(CODE_TO_REGION));
    expect(PICKABLE).toHaveLength(34);
  });

  it('dongbei 在表不在图（旧档兼容：REGIONS 有定义、选区不可选）', () => {
    expect(Object.prototype.hasOwnProperty.call(REGIONS, 'dongbei')).toBe(true);
    expect(PICKABLE).not.toContain('dongbei');
    expect(Object.values(CODE_TO_REGION)).not.toContain('dongbei');
  });

  it('generic 是旧世界回落，不给选区码', () => {
    expect(Object.prototype.hasOwnProperty.call(REGIONS, 'generic')).toBe(true);
    expect(PICKABLE).not.toContain('generic');
  });
});
