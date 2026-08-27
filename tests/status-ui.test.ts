// tests/status-ui.test.ts —— T64 血条/饥饿 UI 纯逻辑 + 订阅键验证
//
// 项目无 jsdom / happy-dom（见 package.json devDependencies），DOM 渲染不测；
// 这里覆盖：
//   · heartsFor / drumsticksFor   点数→图标序列的全部边界
//   · segmentsFor                 抽象公共实现的额外边界（NaN / ±Infinity）
//   · bindStatusEvents            用 spy bus 断言构造时订阅了正确的事件键与分发映射

import { describe, expect, it } from 'vitest';
import {
  MAX_ICONS,
  MAX_POINTS,
  STATUS_SUBSCRIBE_KEYS,
  bindStatusEvents,
  drumsticksFor,
  heartsFor,
  segmentsFor,
  type BusLike,
  type IconState,
} from '../src/ui/statusUI';

const FULL: IconState = 'full';
const HALF: IconState = 'half';
const EMPTY: IconState = 'empty';

const seq = (...groups: Array<[IconState, number]>): IconState[] =>
  groups.flatMap(([s, n]) => Array<IconState>(n).fill(s));

/** 空行 / 满行的快捷构造 */
const allEmpty = (): IconState[] => seq([EMPTY, MAX_ICONS]);
const allFull = (): IconState[] => seq([FULL, MAX_ICONS]);

describe('heartsFor：hp 0..20 → 10 心', () => {
  it('hp=0 → 全空', () => {
    expect(heartsFor(0)).toEqual(allEmpty());
  });

  it('hp=1 → 第 0 格半心，其余空（最后一命是半颗心）', () => {
    expect(heartsFor(1)).toEqual(seq([HALF, 1], [EMPTY, 9]));
  });

  it('hp=2 → 仅第 0 格满心', () => {
    expect(heartsFor(2)).toEqual(seq([FULL, 1], [EMPTY, 9]));
  });

  it('hp=3 → 满+半', () => {
    expect(heartsFor(3)).toEqual(seq([FULL, 1], [HALF, 1], [EMPTY, 8]));
  });

  it('hp=10 → 前 5 格满心', () => {
    expect(heartsFor(10)).toEqual(seq([FULL, 5], [EMPTY, 5]));
  });

  it('hp=19 → 前 9 格满、末格半心', () => {
    expect(heartsFor(19)).toEqual(seq([FULL, 9], [HALF, 1]));
  });

  it('hp=20 → 全满（长度恒为 10）', () => {
    const r = heartsFor(20);
    expect(r).toHaveLength(MAX_ICONS);
    expect(r).toEqual(allFull());
  });

  it('长度恒为 10 且取值只可能是三种状态', () => {
    for (let hp = -5; hp <= 25; hp++) {
      const r = heartsFor(hp);
      expect(r).toHaveLength(MAX_ICONS);
      for (const s of r) expect(['full', 'half', 'empty']).toContain(s);
    }
  });
});

describe('heartsFor：clamp 与非整数', () => {
  it('负数 clamp 到 0 → 全空', () => {
    expect(heartsFor(-1)).toEqual(allEmpty());
    expect(heartsFor(-99)).toEqual(allEmpty());
  });

  it('>20 clamp 到 20 → 全满', () => {
    expect(heartsFor(21)).toEqual(allFull());
    expect(heartsFor(999)).toEqual(allFull());
  });

  it('非整数向下取整：19.9 → 同 19；2.5 → 同 2；0.9 → 同 0', () => {
    expect(heartsFor(19.9)).toEqual(heartsFor(19));
    expect(heartsFor(19.1)).toEqual(heartsFor(19));
    expect(heartsFor(2.5)).toEqual(heartsFor(2));
    expect(heartsFor(0.9)).toEqual(heartsFor(0));
  });

  it('NaN 视作 0 → 全空；±Infinity clamp 到界', () => {
    expect(heartsFor(Number.NaN)).toEqual(allEmpty());
    expect(heartsFor(Number.POSITIVE_INFINITY)).toEqual(allFull());
    expect(heartsFor(Number.NEGATIVE_INFINITY)).toEqual(allEmpty());
  });
});

describe('drumsticksFor：与 hearts 同点数规则（视觉镜像交给 row-reverse）', () => {
  it('v=0 时全空（任务书要求）', () => {
    expect(drumsticksFor(0)).toEqual(allEmpty());
    expect(drumsticksFor(0)).toHaveLength(MAX_ICONS);
  });

  it('v=20 全满；v=19 → 9 满 + 1 半；v=1 → 1 半', () => {
    expect(drumsticksFor(20)).toEqual(allFull());
    expect(drumsticksFor(19)).toEqual(seq([FULL, 9], [HALF, 1]));
    expect(drumsticksFor(1)).toEqual(seq([HALF, 1], [EMPTY, 9]));
  });

  it('与 heartsFor 在同一点数下序列一致（差异只在渲染层镜像）', () => {
    for (let p = 0; p <= MAX_POINTS; p++) {
      expect(drumsticksFor(p)).toEqual(heartsFor(p));
    }
  });

  it('负数 / 越界同样 clamp', () => {
    expect(drumsticksFor(-3)).toEqual(allEmpty());
    expect(drumsticksFor(42)).toEqual(allFull());
  });
});

describe('segmentsFor：公共实现基础语义抽样', () => {
  it('每个奇偶边界正确', () => {
    // k 点 → floor(k/2) 个 full，奇数再补一个 half
    expect(segmentsFor(4)).toEqual(seq([FULL, 2], [EMPTY, 8]));
    expect(segmentsFor(5)).toEqual(seq([FULL, 2], [HALF, 1], [EMPTY, 7]));
    expect(segmentsFor(18)).toEqual(seq([FULL, 9], [EMPTY, 1]));
  });
});

// ---------------------------------------------------------------------------
// 事件绑定：spy bus 断言订阅键与分发映射（node 环境可跑）
// ---------------------------------------------------------------------------

interface OnCall {
  key: string;
  fn: (p: any) => void;
}

/** 记录 on 调用的 spy bus */
function makeSpyBus(): { bus: BusLike; calls: OnCall[]; emit: (k: string, p: any) => void } {
  const calls: OnCall[] = [];
  const bus: BusLike = {
    on(k: string, fn: (p: any) => void): () => void {
      calls.push({ key: k, fn });
      return () => {
        const i = calls.findIndex((c) => c.key === k && c.fn === fn);
        if (i >= 0) calls.splice(i, 1);
      };
    },
  };
  return {
    bus,
    calls,
    emit(k: string, p: any): void {
      for (const c of [...calls]) if (c.key === k) c.fn(p);
    },
  };
}

describe('bindStatusEvents：订阅键与分发映射', () => {
  it('构造时恰好订阅 STATUS_SUBSCRIBE_KEYS 声明的四个键', () => {
    const { bus, calls } = makeSpyBus();
    bindStatusEvents(bus, {
      renderHearts: () => {},
      renderHunger: () => {},
      setTimeIcon: () => {},
      flashDamage: () => {},
    });
    expect(calls.map((c) => c.key).sort()).toEqual([...STATUS_SUBSCRIBE_KEYS].sort());
    expect(calls).toHaveLength(4);
  });

  it("hp:{v} → renderHearts(v)", () => {
    const { bus, calls, emit } = makeSpyBus();
    const got: number[] = [];
    bindStatusEvents(bus, {
      renderHearts: (hp) => got.push(hp),
      renderHunger: () => {},
      setTimeIcon: () => {},
      flashDamage: () => {},
    });
    emit('hp', { v: 17 });
    emit('hp', { v: 0 });
    expect(got).toEqual([17, 0]);
    expect(calls.find((c) => c.key === 'hp')).toBeDefined();
  });

  it("hunger:{v} → renderHunger(v)", () => {
    const { bus, emit } = makeSpyBus();
    const got: number[] = [];
    bindStatusEvents(bus, {
      renderHearts: () => {},
      renderHunger: (v) => got.push(v),
      setTimeIcon: () => {},
      flashDamage: () => {},
    });
    emit('hunger', { v: 6 });
    expect(got).toEqual([6]);
  });

  it("dayTick:{isNight} → setTimeIcon(isNight)，两个方向都通", () => {
    const { bus, emit } = makeSpyBus();
    const got: boolean[] = [];
    bindStatusEvents(bus, {
      renderHearts: () => {},
      renderHunger: () => {},
      setTimeIcon: (n) => got.push(n),
      flashDamage: () => {},
    });
    emit('dayTick', { isNight: true });
    emit('dayTick', { isNight: false });
    expect(got).toEqual([true, false]);
  });

  it("damage:{amount} → flashDamage(amount)；damage 不触发 hearts 重绘", () => {
    const { bus, emit } = makeSpyBus();
    let flashes = 0;
    let lastAmount: number | undefined;
    let heartCalls = 0;
    bindStatusEvents(bus, {
      renderHearts: () => heartCalls++,
      renderHunger: () => {},
      setTimeIcon: () => {},
      flashDamage: (a) => {
        flashes++;
        lastAmount = a;
      },
    });
    emit('damage', { amount: 3 });
    expect(flashes).toBe(1);
    expect(lastAmount).toBe(3);
    expect(heartCalls).toBe(0);
  });

  it('返回的解绑函数能移除对应回调（emit 后不再分发）', () => {
    const { bus, emit } = makeSpyBus();
    const got: number[] = [];
    const offs = bindStatusEvents(bus, {
      renderHearts: (hp) => got.push(hp),
      renderHunger: () => {},
      setTimeIcon: () => {},
      flashDamage: () => {},
    });
    emit('hp', { v: 20 });
    offs[0](); // 解绑 hp 回调
    emit('hp', { v: 0 });
    expect(got).toEqual([20]);
  });
});
