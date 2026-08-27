// DayCycle 纯逻辑单测（node 环境，无 three/DOM —— T62）
// 只覆盖 survival/daycycle.ts 的时钟推进、昼夜翻转沿与天空色连续性；
// render/sky.ts 属于 WebGL 层（Renderer 构造依赖真实上下文），不强测。

import { describe, expect, it } from 'vitest';
import {
  CYCLE_LENGTH,
  DayCycle,
} from '../src/survival/daycycle';
import { DAY_LENGTH, NIGHT_LENGTH } from '../src/core/constants';

describe('DayCycle 构造', () => {
  it('默认 startAt=0：timeOfDay=0，非夜晚', () => {
    const dc = new DayCycle();
    expect(dc.timeOfDay).toBe(0);
    expect(dc.isNight).toBe(false);
    expect(dc.fraction).toBe(0);
  });

  it('入夜后的起点：startAt=DAY_LENGTH+10 时 isNight=true，且仍在周期内', () => {
    // 注：任务书原文写「startAt=NIGHT_LENGTH+10」，但 NIGHT_LENGTH+10=250 <
    //     DAY_LENGTH=480，按契约 isNight = timeOfDay >= DAY_LENGTH 应为白天；
    //     真正表达「夜里起点」的是 DAY_LENGTH+10（入夜后第 10 秒）。此处按语义实现。
    const dc = new DayCycle(DAY_LENGTH + 10);
    expect(dc.timeOfDay).toBe(DAY_LENGTH + 10);
    expect(dc.isNight).toBe(true);
    // 超一个周期也能取模回绕到 [0, CYCLE_LENGTH)
    const wrapped = new DayCycle(CYCLE_LENGTH * 2 + DAY_LENGTH + 3);
    expect(wrapped.isNight).toBe(true);
    expect(wrapped.timeOfDay).toBe(DAY_LENGTH + 3);
  });

  it('负数/超周期起点归一化到 [0, CYCLE_LENGTH)', () => {
    expect(new DayCycle(-1).timeOfDay).toBe(CYCLE_LENGTH - 1);
    expect(new DayCycle(CYCLE_LENGTH + 5).timeOfDay).toBe(5);
    expect(new DayCycle(DAY_LENGTH).isNight).toBe(true); // 边界即视为入夜
  });
});

describe('DayCycle.tick 回绕', () => {
  it('t=cycleLen-1 再 tick(2) → 回到 1', () => {
    const dc = new DayCycle(CYCLE_LENGTH - 1);
    dc.tick(2);
    expect(dc.timeOfDay).toBe(1);
    expect(dc.isNight).toBe(false);
  });

  it('大步长 dt 也能正确取模', () => {
    const dc = new DayCycle();
    dc.tick(CYCLE_LENGTH * 3 + 7);
    expect(dc.timeOfDay).toBeCloseTo(7, 10);
  });
});

describe('一昼夜翻转沿', () => {
  it('恰好各一次入夜/破晓翻转（dt=1 全周期扫描）', () => {
    const dc = new DayCycle();
    let rises = 0;
    let falls = 0;
    let prevNight = dc.isNight;
    for (let s = 1; s <= CYCLE_LENGTH; s++) {
      dc.tick(1);
      const now = dc.isNight;
      if (now && !prevNight) rises++;
      if (!now && prevNight) falls++;
      prevNight = now;
    }
    expect(rises).toBe(1);
    expect(falls).toBe(1);
    // 扫描一个整周期后应回到原状态
    expect(dc.isNight).toBe(false);
  });

  it('翻变发生在 timeOfDay 越过 DAY_LENGTH 的那一帧', () => {
    const dc = new DayCycle(DAY_LENGTH - 1);
    expect(dc.isNight).toBe(false);
    dc.tick(1);
    expect(dc.timeOfDay).toBe(DAY_LENGTH);
    expect(dc.isNight).toBe(true);
  });
});

// ---- 色值工具 ------------------------------------------------------------

function parseHex(hex: string): [number, number, number] {
  const s = hex.startsWith('#') ? hex.slice(1) : hex;
  if (s.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(s)) {
    throw new Error(`非法 hex 颜色: ${hex}`);
  }
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

function maxChannelDiff(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  return Math.max(Math.abs(ca[0] - cb[0]), Math.abs(ca[1] - cb[1]), Math.abs(ca[2] - cb[2]));
}

describe('skyColors 连续性与太阳角度', () => {
  it('全程 dt=1 步进，相邻两次 skyColors 逐通道色差 < 40（含关键过渡段）', () => {
    const dc = new DayCycle();
    const THRESHOLD = 40;
    let prevTop = '';
    let prevBottom = '';
    let prevFog = '';
    let worst = { d: -1, at: -1, field: '' };
    for (let s = 0; s <= CYCLE_LENGTH; s++) {
      const c = dc.skyColors();
      const pairs: [string, string][] = [
        ['top', c.top],
        ['bottom', c.bottom],
        ['fog', c.fog],
      ];
      const prevs: Record<string, string> = {
        top: prevTop,
        bottom: prevBottom,
        fog: prevFog,
      };
      if (prevTop !== '') {
        for (const [field, cur] of pairs) {
          const d = maxChannelDiff(prevs[field], cur);
          if (d > worst.d) worst = { d, at: s, field };
        }
      }
      prevTop = c.top;
      prevBottom = c.bottom;
      prevFog = c.fog;

      if (s < CYCLE_LENGTH) dc.tick(1);
    }
    expect(
      worst.d,
      `最大色差 ${worst.d}（channel=${worst.field}, t=${worst.at}s）应小于 ${THRESHOLD}`,
    ).toBeLessThan(THRESHOLD);
  });

  it('返回的小写 hex 字符串格式合法且含 sunAngle 弧度', () => {
    const dc = new DayCycle();
    for (let i = 0; i < CYCLE_LENGTH; i += 37) {
      dc.timeOfDay = i;
      const c = dc.skyColors();
      expect(c.top).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.bottom).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.fog).toMatch(/^#[0-9a-f]{6}$/);
      expect(Number.isFinite(c.sunAngle)).toBe(true);
      expect(c.sunAngle).toBeGreaterThanOrEqual(0);
      expect(c.sunAngle).toBeLessThanOrEqual(Math.PI * 2 + 1e-9);
    }
  });

  it('白天正午亮度高于深夜（top 通道均值对比）', () => {
    const noon = new DayCycle(DAY_LENGTH / 2).skyColors();
    const deepNight = new DayCycle(DAY_LENGTH + NIGHT_LENGTH * 0.5).skyColors();
    const lumOf = (h: string): number => {
      const [r, g, b] = parseHex(h);
      return (r + g + b) / 3;
    };
    expect(lumOf(noon.top)).toBeGreaterThan(lumOf(deepNight.top));
  });

  it('sunAngle 沿整个周期单调递增（模 2π 展开后）', () => {
    const dc = new DayCycle();
    const STEP = 1;
    let unwrappedPrev = dc.skyColors().sunAngle;
    let offset = 0;
    for (let s = STEP; s <= CYCLE_LENGTH; s += STEP) {
      dc.tick(STEP);
      const a = dc.skyColors().sunAngle;
      if (a < unwrappedPrev - Math.PI) offset += Math.PI * 2; // 跨 2π 记一次
      const current = a + offset;
      expect(current).toBeGreaterThanOrEqual(unwrappedPrev);
      unwrappedPrev = current;
    }
    // 一个完整周期走完应恰好转过约 2π
    expect(unwrappedPrev).toBeGreaterThan(Math.PI * 2 - 0.01);
    expect(unwrappedPrev).toBeLessThan(Math.PI * 2 + 0.01);
  });

  it('白天边界角度语义：日出≈0、正午≈π/2、日落≈π、夜末≈2π', () => {
    expect(new DayCycle(0).skyColors().sunAngle).toBeCloseTo(0, 8);
    expect(new DayCycle(DAY_LENGTH / 2).skyColors().sunAngle).toBeCloseTo(Math.PI / 2, 8);
    expect(new DayCycle(DAY_LENGTH).skyColors().sunAngle).toBeCloseTo(Math.PI, 8);
    expect(new DayCycle(CYCLE_LENGTH).skyColors().sunAngle % (Math.PI * 2)).toBeCloseTo(0, 8);
  });
});
