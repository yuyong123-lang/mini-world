// T63 存档存储层单测（node 环境，无 localStorage → 注入内存 stub）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SAVE_KEY,
  clearSave,
  hasSave,
  loadGame,
  saveGame,
  startAutosave,
  type PlayerSnapshot,
  type SaveSource,
  type SavedGame,
} from '../src/save/storage';
import type { ItemStack } from '../src/core/types';

/** 极简 localStorage 内存 stub（get/set/removeItem 背后一个 Map） */
function memoryStorage() {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const PLAYER: PlayerSnapshot = {
  p: [8.5, 42, -3.25],
  yaw: Math.PI / 4,
  pitch: -0.12,
  hp: 17,
  hunger: 9.5,
};

/** 两个 chunk 的 diff 样本 */
function sampleDiffs(): Map<string, Map<number, number>> {
  return new Map([
    ['0,0', new Map([[1001, 3], [4096, 7]])],
    ['-2,5', new Map([[63, 12]])],
  ]);
}

/** 36 格混合槽位：头部物品 / 空格 / 尾部物品 */
function sampleInventory(): (ItemStack | null)[] {
  const slots: (ItemStack | null)[] = Array.from({ length: 36 }, () => null);
  slots[0] = { key: 'wood', count: 64 };
  slots[2] = { key: 'stone', count: 12 };
  slots[35] = { key: 'apple', count: 1 };
  return slots;
}

function makeSource(): SaveSource {
  return {
    seed: 'w6-test-seed',
    time: 123.75,
    player: { ...PLAYER },
    inventorySlots: sampleInventory(),
    diffs: sampleDiffs(),
  };
}

describe('storage 存读档 roundtrip', () => {
  let store: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    store = memoryStorage();
  });

  it('save→load 深相等', () => {
    expect(saveGame(makeSource(), store)).toBe(true);

    const loaded = loadGame(store);
    expect(loaded).not.toBeNull();
    const g = loaded as SavedGame;

    expect(g.seed).toBe('w6-test-seed');
    expect(g.time).toBe(123.75);
    expect(g.player).toEqual(PLAYER);
    expect(g.inv.length).toBe(36);
    expect(g.inv[0]).toEqual(['wood', 64]);
    expect(g.inv[2]).toEqual(['stone', 12]);
    expect(g.inv[35]).toEqual(['apple', 1]);
    expect(g.inv[1]).toBeNull();
    expect(g.diffs['0,0']).toEqual({ 1001: 3, 4096: 7 });
    expect(g.diffs['-2,5']).toEqual({ 63: 12 });
    expect(Object.keys(g.diffs).sort()).toEqual(['-2,5', '0,0']);

    // 整体深比较 + SavedGame 不含版本号字段
    expect(g).toEqual({
      seed: 'w6-test-seed',
      time: 123.75,
      player: PLAYER,
      inv: [
        ['wood', 64],
        null,
        ['stone', 12],
        ...Array.from({ length: 32 }, () => null),
        ['apple', 1],
      ],
      diffs: { '0,0': { 1001: 3, 4096: 7 }, '-2,5': { 63: 12 } },
      furnaces: {},
    });
    expect('v' in g).toBe(false);
  });

  it('payload 顶层写 v:2 且落在 localStorage 指定键下', () => {
    saveGame(makeSource(), store);
    const raw = store.getItem(SAVE_KEY) as string;
    expect(JSON.parse(raw).v).toBe(2);
  });

  it('保存后源对象继续变化不影响已写入的存档', () => {
    const src = makeSource();
    saveGame(src, store);
    src.diffs.get('0,0')!.set(9999, 99);
    src.inventorySlots[0] = null;

    const g = loadGame(store)!;
    expect(g.diffs['0,0']).toEqual({ 1001: 3, 4096: 7 });
    expect(g.inv[0]).toEqual(['wood', 64]);
  });

  it('hasSave 初始 false → save 后 true → clear 后 false', () => {
    expect(hasSave(store)).toBe(false);
    saveGame(makeSource(), store);
    expect(hasSave(store)).toBe(true);
    clearSave(store);
    expect(hasSave(store)).toBe(false);
    // 从未有过档时清除也不抛
    expect(() => clearSave(store)).not.toThrow();
  });

  it('损坏 JSON → loadGame 返 null 不抛，且 warn', () => {
    store.setItem(SAVE_KEY, '{oops');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadGame(store)).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('版本不符 v:99 → null', () => {
    store.setItem(SAVE_KEY, JSON.stringify({ v: 99, seed: 's', time: 0, player: {}, inv: [], diffs: {} }));
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadGame(store)).toBeNull();
    spy.mockRestore();
  });

  it.each([
    ['缺 diffs', { v: 1, seed: 's', time: 0, player: PLAYER, inv: [] }],
    ['缺 seed', { v: 1, time: 0, diffs: {}, inv: [], player: PLAYER }],
    ['缺 inv 数组', { v: 1, seed: 's', time: 0, diffs: {}, inv: 'x', player: PLAYER }],
    ['坏 player.p', { v: 1, seed: 's', time: 0, diffs: {}, inv: [], player: { p: [1] } }],
    ['非对象 payload', '"just a string"'],
    ['time 非法', { v: 1, seed: 's', time: NaN, diffs: {}, inv: [], player: PLAYER }],
  ])('%s → null', (_label, bad) => {
    store.setItem(SAVE_KEY, JSON.stringify(bad));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadGame(store)).toBeNull();
    vi.restoreAllMocks();
  });

  it('空对象载荷 → null（不因 o.v 宽松通过）', () => {
    store.setItem(SAVE_KEY, '{}');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadGame(store)).toBeNull();
    vi.restoreAllMocks();
  });

  it('配额溢出异常 → saveGame 返 false 不抛，并 console.error', () => {
    const quotaStorage = memoryStorage();
    quotaStorage.setItem = () => {
      throw Object.assign(new DOMException('full', 'QuotaExceededError'), { name: 'QuotaExceededError' });
    };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(saveGame(makeSource(), quotaStorage)).toBe(false);
    expect(errSpy).toHaveBeenCalledOnce();
    errSpy.mockRestore();
  });

  it('任意 setItem 异常同样被吞掉返回 false', () => {
    const broken = memoryStorage();
    broken.setItem = () => {
      throw new Error('boom');
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(saveGame(makeSource(), broken)).toBe(false);
    vi.restoreAllMocks();
  });

  it('readgetItem 抛异常时 loadGame 也返 null 不抛', () => {
    const broken = memoryStorage();
    broken.getItem = () => {
      throw new Error('boom');
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadGame(broken)).toBeNull();
    vi.restoreAllMocks();
  });

  it('空 diffs / 全空背包照常工作', () => {
    const src = makeSource();
    src.diffs = new Map();
    src.inventorySlots = Array.from({ length: 36 }, () => null);
    expect(saveGame(src, store)).toBe(true);
    const g = loadGame(store)!;
    expect(g.diffs).toEqual({});
    expect(g.inv).toEqual(Array.from({ length: 36 }, () => null));
  });
});

describe('startAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('advanceTimersByTime(25000)，intervalMs=10000 → 恰 2 次 setItem（首针在 t=interval）', () => {
    const store = memoryStorage();
    const setSpy = vi.spyOn(store, 'setItem');
    const stop = startAutosave(makeSource, 10_000, store);

    // setInterval 首次回调在 t=10s，之后 20s；t=0 不写
    expect(setSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(25_000);
    expect(setSpy).toHaveBeenCalledTimes(2);
    stop();

    vi.advanceTimersByTime(30_000); // 越过 40s/50s 边界
    expect(setSpy).toHaveBeenCalledTimes(2);
  });

  it('getSrc 返回 null 时跳过该轮', () => {
    const store = memoryStorage();
    const setSpy = vi.spyOn(store, 'setItem');
    let n = 0;
    const stop = startAutosave(
      () => (++n % 2 === 1 ? makeSource() : null),
      10_000,
      store,
    );

    vi.advanceTimersByTime(30_000); // 3 tick：ok / skip / ok
    expect(setSpy).toHaveBeenCalledTimes(2);
    stop();
  });

  it('stop() 后不再写、重复 stop 安全', () => {
    const store = memoryStorage();
    const setSpy = vi.spyOn(store, 'setItem');
    const stop = startAutosave(makeSource, 10_000, store);

    vi.advanceTimersByTime(10_000);
    expect(setSpy).toHaveBeenCalledTimes(1);

    stop();
    stop(); // 二次调用不应抛
    vi.advanceTimersByTime(60_000);
    expect(setSpy).toHaveBeenCalledTimes(1);
  });

  it('intervalMs 可自定义', () => {
    const store = memoryStorage();
    const setSpy = vi.spyOn(store, 'setItem');
    const stop = startAutosave(makeSource, 500, store);
    vi.advanceTimersByTime(2000);
    expect(setSpy).toHaveBeenCalledTimes(4);
    stop();
  });
});
