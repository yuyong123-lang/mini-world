import { describe, expect, it } from 'vitest';
import { chunkKey, localCoord, voxelIndex, worldToChunk } from '../src/core/constants';
import { EventBus } from '../src/core/events';
import { hash2, hash3, hashStr, mulberry32 } from '../src/core/rng';

describe('constants 坐标工具', () => {
  it('worldToChunk 处理负数', () => {
    expect(worldToChunk(-1)).toBe(-1);
    expect(worldToChunk(0)).toBe(0);
    expect(worldToChunk(15)).toBe(0);
    expect(worldToChunk(16)).toBe(1);
    expect(worldToChunk(-16)).toBe(-1);
  });

  it('localCoord 负数回绕', () => {
    expect(localCoord(-1)).toBe(15);
    expect(localCoord(-17)).toBe(15);
    expect(localCoord(16)).toBe(0);
  });

  it('voxelIndex 与取值一致', () => {
    const data = new Uint8Array(16 * 64 * 16);
    data[voxelIndex(15, 63, 15)] = 7;
    expect(data[voxelIndex(15, 63, 15)]).toBe(7);
    expect(voxelIndex(0, 0, 0)).toBe(0);
  });

  it('chunkKey 格式', () => {
    expect(chunkKey(-1, 3)).toBe('-1,3');
  });
});

describe('rng 确定性', () => {
  it('同 seed 序列一致', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('不同 seed 序列不同', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    let diff = false;
    for (let i = 0; i < 20; i++) if (a() !== b()) diff = true;
    expect(diff).toBe(true);
  });

  it('hashStr 稳定且区分大小写输入', () => {
    expect(hashStr('abc')).toBe(hashStr('abc'));
    expect(hashStr('abc')).not.toBe(hashStr('abd'));
  });

  it('hash2/hash3 在 [0,1) 且确定', () => {
    for (let i = 0; i < 200; i++) {
      const h = hash2(i, -i * 3);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
      expect(h).toBe(hash2(i, -i * 3));
      const g = hash3(i, i + 1, -i);
      expect(g).toBe(hash3(i, i + 1, -i));
    }
  });
});

describe('EventBus', () => {
  it('on/emit 收到载荷', () => {
    const bus = new EventBus<{ ping: { n: number } }>();
    let got = -1;
    bus.on('ping', (p) => (got = p.n));
    bus.emit('ping', { n: 5 });
    expect(got).toBe(5);
  });

  it('off 取消订阅', () => {
    const bus = new EventBus<{ e: Record<string, never> }>();
    let calls = 0;
    const un = bus.on('e', () => calls++);
    bus.emit('e', {});
    un();
    bus.emit('e', {});
    expect(calls).toBe(1);
  });

  it('多订阅者互不影响、emit 时未订阅不抛', () => {
    const bus = new EventBus<{ a: Record<string, never>; b: Record<string, never> }>();
    let x = 0;
    let y = 0;
    bus.on('a', () => x++);
    bus.on('a', () => y++);
    bus.emit('a', {});
    bus.emit('b', {});
    expect(x).toBe(1);
    expect(y).toBe(1);
  });
});
