// audio.ts —— T103 合成音效（W10）。
// 零素材文件：全部用 WebAudio OscillatorNode / AudioBufferSourceNode(白噪声) +
// GainNode 包络 + BiquadFilter 现场合成。浏览器自动播放策略要求首次发声必须在
// 用户手势之后，因此本模块惰性创建 AudioContext：
//   main 接线建议（一行）：document.addEventListener('click', initAudio, { once: true });
//
// --- bus 监听约定（供主线程接线参考，main.ts 尚未接入）---
//   bus.on('blockBroken', () => sfx('break'));
//   interactor.onPlace(...) 成功放置后        -> sfx('place')
//   bus.on('damage', ...)                     -> sfx('hurt')
//   stats 吃食物成功处                        -> sfx('eat')
//   bus.on('pickup', ...)                     -> sfx('pickup')
//   UI 点击（背包/合成/开始按钮）             -> sfx('click')
//
// FIXME(依赖缺陷)：W10 的 Settings 模块尚不存在，masterGain 没有生产侧调用方，
// 默认 0.5 只存于内存；settings 加载后应调 setMasterVolume(v)，持久化层
// （save/storage.ts 的 SaveData）也没有 volume 字段，接通前音量不落盘。
// FIXME(依赖缺陷)：main.ts 的事件没有携带"方块材质类型"，break 无法按材质换
// 音色（石头低闷 / 沙子沙哑）；统一用单条噪声配方，待 GameEvents 扩展后分化。

/**
 * 六种合成音效名。
 */
export type SfxName = 'break' | 'place' | 'hurt' | 'eat' | 'pickup' | 'click';

const DEFAULT_MASTER_VOLUME = 0.5;
/** 白噪声共享 buffer 长度（秒），惰性建一次、跨次播放复用 */
const NOISE_BUFFER_SECONDS = 0.3;
/** exponentialRamp 不允许到 0，用这个极小值表示静音 */
const SILENCE = 0.0001;
/** 单次包络峰值上限（钳掉离谱的 volumeMul 输入） */
const MAX_VOICE_GAIN = 8;

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
/** ctx 建好前的暂存音量（含越界钳制结果），init 后一次性应用到 masterGain */
let pendingVolume = DEFAULT_MASTER_VOLUME;

/** 钳制到 [0,1] */
function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 惰性取（建）AudioContext 与 masterGain。
 * node 环境 globalThis 上没有 AudioContext/webkitAudioContext → 返回 null，
 * 因此本模块可在 vitest 里安全导入并让 sfx() 走 no-op 分支。
 */
function ensureContext(): AudioContext | null {
  if (ctx && ctx.state !== 'closed') return ctx;
  const g = globalThis as Record<string, unknown>;
  const Ctor = (g['AudioContext'] ?? g['webkitAudioContext']) as
    | (new () => AudioContext)
    | undefined;
  if (typeof Ctor !== 'function') return null;
  try {
    ctx = new Ctor();
  } catch {
    // 构造失败（如无音频设备的假实现）→ 本会话保持静默
    ctx = null;
    return null;
  }
  masterGain = ctx.createGain();
  masterGain.gain.value = pendingVolume;
  masterGain.connect(ctx.destination);
  return ctx;
}

/** 共享白噪声 buffer：0.3s，[−1,1] 均匀采样 */
function ensureNoise(c: AudioContext): AudioBuffer | null {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const len = Math.max(1, Math.floor(NOISE_BUFFER_SECONDS * c.sampleRate));
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

/** 快速包络：t0 处立刻到 peak，指数衰减到 dur 结束（听感自然且免 click pop） */
function scheduleDecay(g: GainNode, t0: number, peak: number, dur: number): void {
  g.gain.setValueAtTime(Math.max(SILENCE, peak), t0);
  g.gain.exponentialRampToValueAtTime(SILENCE, t0 + dur);
}

/** 振荡器音：freqStart→freqEnd 相同即定频；type 决定波形 */
function playTone(
  type: OscillatorType,
  freqStart: number,
  freqEnd: number,
  t0: number,
  dur: number,
  peak: number,
): void {
  const c = ctx;
  const out = masterGain;
  if (!c || !out) return;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, freqStart), t0);
  if (freqEnd !== freqStart) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
  }
  const g = c.createGain();
  scheduleDecay(g, t0, peak, dur);
  osc.connect(g);
  g.connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** 共享白噪声切片：经指定类型滤波器 + 同款包络；offset 随机避免每次同一段纹理 */
function playNoise(
  t0: number,
  dur: number,
  peak: number,
  filterType: BiquadFilterType,
  cutoffHz: number,
): void {
  const c = ctx;
  const out = masterGain;
  if (!c || !out) return;
  const buf = ensureNoise(c);
  if (!buf) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  const maxOffset = Math.max(0, buf.duration - dur);
  const offset = Math.random() * maxOffset;
  const f = c.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = cutoffHz;
  const g = c.createGain();
  scheduleDecay(g, t0, peak, dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t0, offset);
  src.stop(t0 + dur + 0.01);
}

/**
 * 触发一个合成音效。ctx 未就绪（未手势 / node 环境）时静默 no-op。
 * @param volumeMul 相对响度倍率（默认 1）；非法值回退 1，钳制在 [0,8]
 */
export function sfx(name: SfxName, volumeMul?: number): void {
  if (!ensureContext()) return;
  const raw = volumeMul ?? 1;
  const mul = typeof raw === 'number' && Number.isFinite(raw)
    ? Math.min(MAX_VOICE_GAIN, Math.max(0, raw))
    : 1;
  const c = ctx!;
  if (c.state === 'suspended') void c.resume().catch(() => undefined);

  const t0 = c.currentTime;
  switch (name) {
    case 'break':
      // 白噪声 200ms lowpass 800Hz，gain 0.5*mul → 指数衰减
      playNoise(t0, 0.2, 0.5 * mul, 'lowpass', 800);
      break;
    case 'place':
      // 方波 110Hz，80ms 衰减的低频咚
      playTone('square', 110, 110, t0, 0.08, 0.35 * mul);
      break;
    case 'hurt':
      // 锯齿波 400→120Hz 下滑 300ms
      playTone('sawtooth', 400, 120, t0, 0.3, 0.32 * mul);
      break;
    case 'eat':
      // 两段短促正弦（间隔 120ms），总长 ~250ms 的咬合声
      playTone('sine', 220, 190, t0, 0.07, 0.3 * mul);
      playTone('sine', 170, 145, t0 + 0.12, 0.09, 0.26 * mul);
      break;
    case 'pickup':
      // 正弦 600→1000Hz 上滑 150ms 叮
      playTone('sine', 600, 1000, t0, 0.15, 0.28 * mul);
      break;
    case 'click':
      // 极短噪声脉冲 30ms highpass 咔
      playNoise(t0, 0.03, 0.22 * mul, 'highpass', 2500);
      break;
    default: {
      // Exhaustive check：新增 SfxName 未配配方时编译期报错
      const never: never = name;
      void never;
    }
  }
}

/**
 * 在用户手势回调中调用以解锁播放；幂等（重复调用零成本）。
 * 暂存音量在此刻一次性应用到新建的 masterGain。
 */
export function initAudio(): void {
  const c = ensureContext();
  if (!c) return;
  if (c.state === 'suspended') void c.resume().catch(() => undefined);
}

/**
 * 设置主音量（0..1，越界钳制）。ctx 未建时仅记入暂存值，init 后生效。
 */
export function setMasterVolume(v: number): void {
  pendingVolume = clamp01(v);
  if (masterGain && ctx && ctx.state !== 'closed') masterGain.gain.value = pendingVolume;
}

/** 是否已成功创建 AudioContext（可真实出声） */
export function getAudioReady(): boolean {
  return ctx != null && ctx.state !== 'closed' && masterGain != null;
}

/**
 * 测试/调试快照。node 环境下用它断言音量钳制的暂存行为。
 */
export function _debugState(): { ready: boolean; pendingVolume: number; ctxState: string } {
  return {
    ready: getAudioReady(),
    pendingVolume,
    ctxState: ctx ? ctx.state : 'none',
  };
}

/** 测试专用：清空模块级单例状态（幂等重置场景）。生产代码勿调用。 */
export function _resetAudioForTest(): void {
  ctx = null;
  masterGain = null;
  noiseBuf = null;
  pendingVolume = DEFAULT_MASTER_VOLUME;
}
