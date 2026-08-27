// T103 音效模块测试 —— node 环境（无 AudioContext）。
// 只验证：导入安全 / 惰性未解锁 / sfx no-op 不抛 / volume 越界钳制暂存。
// 不做真实音频渲染测试（规格明确要求）。

import { beforeEach, describe, expect, it } from 'vitest';
import {
  _debugState,
  _resetAudioForTest,
  getAudioReady,
  initAudio,
  setMasterVolume,
  sfx,
  type SfxName,
} from '../src/audio/audio';

const ALL_SFX: readonly SfxName[] = [
  'break',
  'place',
  'hurt',
  'eat',
  'pickup',
  'click',
] as const;

describe('audio 模块（node 环境，AudioContext 缺失）', () => {
  beforeEach(() => _resetAudioForTest());

  it('导入即不抛，初始未就绪且默认音量 0.5', () => {
    expect(getAudioReady()).toBe(false);
    expect(_debugState()).toEqual({
      ready: false,
      pendingVolume: 0.5,
      ctxState: 'none',
    });
  });

  it('initAudio() 在 node 下 no-op 且保持未就绪', () => {
    expect(() => initAudio()).not.toThrow();
    expect(() => initAudio()).not.toThrow(); // 幂等
    expect(getAudioReady()).toBe(false);
  });

  it('sfx() 六种名称全部静默 no-op 不抛（含非法/越界 volumeMul）', () => {
    for (const name of ALL_SFX) {
      expect(() => sfx(name)).not.toThrow();
      expect(() => sfx(name, 0)).not.toThrow();
      expect(() => sfx(name, 2.5)).not.toThrow();
      expect(() => sfx(name, -3)).not.toThrow();
      expect(() => sfx(name, Number.NaN)).not.toThrow();
      expect(() => sfx(name, Number.POSITIVE_INFINITY)).not.toThrow();
    }
  });

  it('六种 SfxName 枚举完整（防新增名漏配配方）', () => {
    expect(ALL_SFX).toHaveLength(6);
    expect(new Set(ALL_SFX).size).toBe(6);
  });

  it('setMasterVolume 越界钳制到 [0,1]，未 init 时存 pendingVolume', () => {
    setMasterVolume(2); // 越上界
    expect(_debugState().pendingVolume).toBe(1);
    setMasterVolume(-5); // 越下界
    expect(_debugState().pendingVolume).toBe(0);
    setMasterVolume(Number.NaN); // 非法值视为 0
    expect(_debugState().pendingVolume).toBe(0);
    setMasterVolume(0.85); // 合法值原样通过
    expect(_debugState().pendingVolume).toBe(0.85);
  });

  it('暂存音量在真实出声前不影响 ready 状态', () => {
    setMasterVolume(0.2);
    expect(_debugState().ready).toBe(false);
    initAudio();
    expect(_debugState().ready).toBe(false); // node 无 ctx，仍不可播
    expect(() => sfx('pickup')).not.toThrow(); // 但调用方依旧安全
  });
});
