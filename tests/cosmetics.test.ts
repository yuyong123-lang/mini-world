// tests/cosmetics.test.ts —— 装扮数据：normalize 回落 / load-save 往返 / 预设表
import { describe, expect, it } from 'vitest';
import {
  COSMETICS_KEY,
  COSMETIC_PRESETS,
  DEFAULT_COSMETICS,
  Cosmetics,
  normalizeCosmetics,
} from '../src/core/cosmetics';

/** 内存 storage stub（与 settings/storage 测试同款模式） */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => map.delete(k),
    setItem: (k: string, v: string) => map.set(k, v),
  };
}

describe('normalizeCosmetics', () => {
  it('合法 hex 原样保留', () => {
    const out = normalizeCosmetics({
      skin: '#ff0000', shirt: '#00ff00', pants: '#0000ff', hair: '#123456', preset: 'wheat',
    });
    expect(out).toEqual({
      skin: '#ff0000', shirt: '#00ff00', pants: '#0000ff', hair: '#123456', preset: 'wheat',
    });
  });

  it('非法 hex / 缺字段逐个回落缺省', () => {
    const out = normalizeCosmetics({
      skin: 'red', // 非法
      shirt: '#00ff00',
      pants: 42, // 非法
      // hair 缺失
      preset: 'wheat',
    });
    expect(out.skin).toBe(DEFAULT_COSMETICS.skin);
    expect(out.shirt).toBe('#00ff00');
    expect(out.pants).toBe(DEFAULT_COSMETICS.pants);
    expect(out.hair).toBe(DEFAULT_COSMETICS.hair);
  });

  it('未知 preset 回落 default；null/undefined 输入得全缺省', () => {
    expect(normalizeCosmetics({ preset: 'nope' }).preset).toBe('default');
    expect(normalizeCosmetics({ preset: 'custom' }).preset).toBe('custom'); // 手改标记合法
    expect(normalizeCosmetics(null)).toEqual(DEFAULT_COSMETICS);
    expect(normalizeCosmetics(undefined)).toEqual(DEFAULT_COSMETICS);
  });
});

describe('Cosmetics.load / save 往返', () => {
  it('save→load 深相等（键为 COSMETICS_KEY）', () => {
    const store = memoryStorage();
    const data = { skin: '#112233', shirt: '#445566', pants: '#778899', hair: '#aabbcc', preset: 'custom' };
    expect(Cosmetics.save(data, store)).toBe(true);
    expect(store.getItem(COSMETICS_KEY)).not.toBeNull();
    expect(Cosmetics.load(store)).toEqual(data);
  });

  it('无档 load 得缺省；损坏 JSON 不抛、回落缺省', () => {
    const store = memoryStorage();
    expect(Cosmetics.load(store)).toEqual(DEFAULT_COSMETICS);
    store.setItem(COSMETICS_KEY, '{not-json');
    expect(Cosmetics.load(store)).toEqual(DEFAULT_COSMETICS);
  });

  it('预设表四款齐全且均为合法 hex', () => {
    for (const [key, p] of Object.entries(COSMETIC_PRESETS)) {
      for (const v of Object.values(p)) {
        expect(/^#[0-9a-fA-F]{6}$/.test(v), `${key}.${v}`).toBe(true);
      }
    }
    expect(Object.keys(COSMETIC_PRESETS).sort()).toEqual(['default', 'forest', 'night', 'wheat']);
  });
});
