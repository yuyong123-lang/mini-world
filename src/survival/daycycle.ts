// survival/daycycle.ts —— 昼夜循环纯逻辑（契约 §11，T62）
//
// 只做时间推进与颜色/太阳角度计算，不持有任何 three / DOM 对象，
// 因此可被 node（vitest）/ Worker 环境直接导入。
// 时间模型：一个完整周期 = DAY_LENGTH(480s 白天) + NIGHT_LENGTH(240s 黑夜)。

import { DAY_LENGTH, NIGHT_LENGTH } from '../core/constants';

/** 一个完整昼夜周期的秒数 */
export const CYCLE_LENGTH = DAY_LENGTH + NIGHT_LENGTH;

/**
 * 关于 'dayTick' 事件的约定（T62 §交付物 4）：
 * 契约 §11 的 DayCycle 构造签名只有 startAt，没有 EventBus 参数，
 * 因此本类【不发事件】。约定由 main 在每帧 daycycle.tick(dt) 之后自行比较
 * prevIsNight 与 daycycle.isNight，翻变沿各发一次：
 *   true（夜幕降临）/ false（破晓）→ bus.emit('dayTick', { isNight })
 * 供 spawner / HUD 时钟消费。翻变沿检测必须留在调用侧才能保证一周期恰好
 * 各一次（本类状态是纯函数式的，无副作用面）。
 */

/** 单个色彩关键帧：top 是天穹顶色、bottom 是地平线色、fog 是雾色 */
interface SkyKeyframe {
  readonly top: string;
  readonly bottom: string;
  readonly fog: string;
}

/** 黎明（timeOfDay=0）：橙粉 */
const KEY_DAWN: SkyKeyframe = { top: '#ff9a5a', bottom: '#ffd9a0', fog: '#e8b287' };
/** 正午（白天中点）：亮蓝 */
const KEY_NOON: SkyKeyframe = { top: '#79b8ff', bottom: '#cfe9ff', fog: '#cfe9ff' };
/** 黄昏（白天结束瞬间）：橙红 */
const KEY_DUSK: SkyKeyframe = { top: '#ff7043', bottom: '#ffb26b', fog: '#e8956b' };
/** 深夜（黑夜稳定段）：暗蓝黑 */
const KEY_NIGHT: SkyKeyframe = { top: '#0b1026', bottom: '#1c2a45', fog: '#16203a' };

/** 夜里前/后各占的过渡比例（10% 黄昏→夜、末尾 10% 夜→黎明） */
const NIGHT_TRANSITION_FRACTION = 0.1;

type RGB = [number, number, number];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** '#rrggbb' → [r,g,b]（容忍大写/省略 #）；非法输入回退白色并保持可预测性 */
function parseHex(hex: string): RGB {
  const s = hex.startsWith('#') ? hex.slice(1) : hex;
  if (s.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(s)) return [255, 255, 255];
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

/** [r,g,b] → 规范小写 '#rrggbb' */
function formatHex([r, g, b]: RGB): string {
  const h = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** 两个关键帧逐通道线性插值（t 已假定 0..1 内） */
function lerpKeys(a: SkyKeyframe, b: SkyKeyframe, t: number): { top: string; bottom: string; fog: string } {
  return {
    top: formatHex(mix(parseHex(a.top), parseHex(b.top), t)),
    bottom: formatHex(mix(parseHex(a.bottom), parseHex(b.bottom), t)),
    fog: formatHex(mix(parseHex(a.fog), parseHex(b.fog), t)),
  };
}

function mix(c0: RGB, c1: RGB, t: number): RGB {
  return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
}

export class DayCycle {
  /** 当前时刻（秒），恒在 0..CYCLE_LENGTH 区间内（已取模） */
  timeOfDay: number;

  constructor(startAt = 0) {
    const len = CYCLE_LENGTH;
    this.timeOfDay = ((startAt % len) + len) % len; // 负数也能归到 0..len
  }

  get isNight(): boolean {
    return this.timeOfDay >= DAY_LENGTH;
  }

  /** 全周期进度 0..1（内部用于 HUD 时钟等展示层） */
  get fraction(): number {
    return this.timeOfDay / CYCLE_LENGTH;
  }

  /** 推进时钟；跨过周期长度时取模回绕 */
  tick(dt: number): void {
    if (!Number.isFinite(dt)) return;
    const d = ((dt % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH;
    this.timeOfDay = (this.timeOfDay + d) % CYCLE_LENGTH;
  }

  /**
   * 太阳角度（弧度）：白天 0..π（东升西落），夜晚月亮继续 π..2π。
   * 因此整个周期内角度单调递增，便于几何体平滑绕行。
   */
  private computeSunAngle(): number {
    if (!this.isNight) return (this.timeOfDay / DAY_LENGTH) * Math.PI;
    const nf = (this.timeOfDay - DAY_LENGTH) / NIGHT_LENGTH;
    return Math.PI + clamp01(nf) * Math.PI;
  }

  /**
   * 当前天空配色。插值策略：
   * - 白天按 fractionOfDay 三点二次插值：前半段黎明→正午，后半段正午→黄昏；
   * - 刚入夜的前 10% 黑夜里做黄昏→深夜 lerp，之后整段纯深夜色；
   * - 黑夜最后 10% 做 深夜→黎明 lerp，与白天起点(黎明显式关键帧)无缝衔接。
   */
  skyColors(): { top: string; bottom: string; fog: string; sunAngle: number } {
    const sunAngle = this.computeSunAngle();

    if (!this.isNight) {
      const f = clamp01(this.timeOfDay / DAY_LENGTH);
      const keys =
        f < 0.5 ? lerpKeys(KEY_DAWN, KEY_NOON, f / 0.5) : lerpKeys(KEY_NOON, KEY_DUSK, (f - 0.5) / 0.5);
      return { ...keys, sunAngle };
    }

    const nf = clamp01((this.timeOfDay - DAY_LENGTH) / NIGHT_LENGTH);
    const t = NIGHT_TRANSITION_FRACTION;
    if (nf < t) return { ...lerpKeys(KEY_DUSK, KEY_NIGHT, nf / t), sunAngle };
    if (nf > 1 - t) return { ...lerpKeys(KEY_NIGHT, KEY_DAWN, (nf - (1 - t)) / t), sunAngle };
    // 深夜稳定段：纯夜色，不做任何插值
    return { top: KEY_NIGHT.top, bottom: KEY_NIGHT.bottom, fog: KEY_NIGHT.fog, sunAngle };
  }
}
