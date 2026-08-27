// settings 单测（node 环境，无 localStorage → 注入内存 stub，模式同 storage.test.ts）
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  Settings,
  normalizeSettings,
  type SettingsData,
} from '../src/core/settings';

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

const VALID: SettingsData = { viewDistance: 5, sensitivity: 0.0031, volume: 0.8 };

describe('Settings.load 默认值回落', () => {
  let store: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    store = memoryStorage();
  });

  it('1. 无档（空 storage）→ DEFAULT_SETTINGS', () => {
    expect(Settings.load(store)).toEqual(DEFAULT_SETTINGS);
    expect(store.getItem(SETTINGS_KEY)).toBeNull();
  });

  it('缺档时返回的配置可以自由修改而不污染冻结的 DEFAULT_SETTINGS', () => {
    const d = Settings.load(store);
    d.viewDistance = 3;
    expect(DEFAULT_SETTINGS.viewDistance).toBe(6);
  });
});

describe('Settings.save / load roundtrip', () => {
  let store: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    store = memoryStorage();
  });

  it('2. save → load 深相等，且写入指定键与版本号', () => {
    expect(Settings.save(VALID, store)).toBe(true);

    const loaded = Settings.load(store);
    expect(loaded).toEqual(VALID);
    // 键名 + payload 结构
    const raw = store.getItem(SETTINGS_KEY) as string;
    expect(JSON.parse(raw)).toMatchObject({ v: 1, ...VALID });
  });

  it('默认值本身 roundtrip 不漂移（默认在合法区间内且量化后等于自身）', () => {
    expect(Settings.save({ ...DEFAULT_SETTINGS }, store)).toBe(true);
    expect(Settings.load(store)).toEqual(DEFAULT_SETTINGS);
  });

  it('save 会先规范化脏输入：越界字段钳到区间再落盘', () => {
    Settings.save({ viewDistance: 99, sensitivity: 99, volume: -1 } as unknown as SettingsData, store);
    expect(Settings.load(store)).toEqual({ viewDistance: 8, sensitivity: 0.005, volume: 0 });
  });

  it('storage 目标 setItem 抛异常 → false 不抛（配额溢出口径同 storage.ts）', () => {
    const broken = memoryStorage();
    broken.setItem = () => {
      throw new Error('quota');
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(Settings.save(VALID, broken)).toBe(false);
    vi.restoreAllMocks();
  });

  it('getItem 抛异常 → load 整体回落默认值不抛', () => {
    const broken = memoryStorage();
    broken.getItem = () => {
      throw new Error('boom');
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(Settings.load(broken)).toEqual(DEFAULT_SETTINGS);
    vi.restoreAllMocks();
  });
});

describe('损坏/越界输入的容错（任务卡用例）', () => {
  let store: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    store = memoryStorage();
  });

  it('3a. 损坏 JSON → 全量回落默认值并 warn', () => {
    store.setItem(SETTINGS_KEY, '{oops not json');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(Settings.load(store)).toEqual(DEFAULT_SETTINGS);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('非对象载荷（数组/字符串/null）→ 默认值', () => {
    for (const bad of ['"str"', '[1,2]', 'null']) {
      store.setItem(SETTINGS_KEY, bad);
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(Settings.load(store), `payload=${bad}`).toEqual(DEFAULT_SETTINGS);
      vi.restoreAllMocks();
    }
  });

  it('3b-1. viewDistance=99 → clamp 8', () => {
    store.setItem(SETTINGS_KEY, JSON.stringify({ v: 1, viewDistance: 99, sensitivity: 0.0022, volume: 0.5 }));
    vi.spyOn(console, 'warn').mockImplementation(() => {}); // 版本兼容路径可能 warn
    expect(Settings.load(store).viewDistance).toBe(8);
    vi.restoreAllMocks();
  });

  it('3b-2. volume=-1 → clamp 0', () => {
    store.setItem(SETTINGS_KEY, JSON.stringify({ v: 1, viewDistance: 6, sensitivity: 0.0022, volume: -1 }));
    expect(Settings.load(store).volume).toBe(0);
  });

  it('单项越界互不牵连：坏 volume 不影响合法的视距与灵敏度', () => {
    store.setItem(SETTINGS_KEY, JSON.stringify({ v: 1, viewDistance: 4, sensitivity: 0.0031, volume: 42 }));
    expect(Settings.load(store)).toEqual({ viewDistance: 4, sensitivity: 0.0031, volume: 1 });
  });

  it.each([
    ['viewDistance 低于下限', { viewDistance: 0, sensitivity: 0.0022, volume: 0.5 }, { viewDistance: 3 }],
    ['viewDistance 非整数向下取整', { viewDistance: 7.6, sensitivity: 0.0022, volume: 0.5 }, { viewDistance: 8 }],
    ['viewDistance 类型错误→默认', { viewDistance: 'six', sensitivity: 0.0022, volume: 0.5 }, { viewDistance: 6 }],
    ['sensitivity 上越界', { viewDistance: 6, sensitivity: 0.02, volume: 0.5 }, { sensitivity: 0.005 }],
    ['sensitivity 下越界', { viewDistance: 6, sensitivity: 0.00001, volume: 0.5 }, { sensitivity: 0.0005 }],
    ['sensitivity NaN→默认', { viewDistance: 6, sensitivity: NaN, volume: 0.5 }, { sensitivity: 0.0022 }],
    ['volume > 1', { viewDistance: 6, sensitivity: 0.0022, volume: 3 }, { volume: 1 }],
    ['volume 缺失→默认', { viewDistance: 6, sensitivity: 0.0022 }, { volume: 0.5 }],
    ['全空对象', {}, { viewDistance: 6, sensitivity: 0.0022, volume: 0.5 }],
  ])('%s → 期望字段落到 %o', (_label, payload, expectedPart) => {
    store.setItem(SETTINGS_KEY, JSON.stringify(payload));
    expect(Settings.load(store)).toEqual(expect.objectContaining(expectedPart as Partial<SettingsData>));
  });
});

describe('normalizeSettings 纯函数口径', () => {
  it('量化到步长：0.00226 → 0.0023、0.486 → 0.49（消除浮点漂移使 roundtrip 稳定）', () => {
    expect(normalizeSettings({ viewDistance: 6, sensitivity: 0.00226, volume: 0.486 })).toEqual({
      viewDistance: 6,
      sensitivity: 0.0023,
      volume: 0.49,
    });
  });

  it('Infinity 视作非法 → 回落默认', () => {
    expect(normalizeSettings({ viewDistance: Infinity, sensitivity: Infinity, volume: Infinity })).toEqual(
      DEFAULT_SETTINGS,
    );
  });
});
