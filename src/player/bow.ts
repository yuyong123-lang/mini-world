// player/bow.ts —— 弓的蓄力发射曲线（T 弓箭卡）
//
// 纯函数模块：蓄力时长 → 出手参数（初速/伤害）。发射时序由 main 驱动——
// 按住右键记起点、松开算 chargeSeconds，本文件不持有任何状态。
//
// 曲线：0.25s 起步（否则哑火不射）→ 1.0s 满蓄。起步到满蓄之间线性插值：
//   speed   18 → 34 格/s
//   damage   2 →  9
// 超过满蓄时间继续拉弦不增伤（钳制在满蓄值），松手即按当前蓄力出手。

/** 最小蓄力时长（秒）：低于此值松手为哑火（不消耗箭） */
export const BOW_MIN_CHARGE_S = 0.25;
/** 满蓄时长（秒） */
export const BOW_FULL_CHARGE_S = 1.0;
/** 起步初速（格/s） */
export const BOW_MIN_SPEED = 18;
/** 满蓄初速（格/s） */
export const BOW_MAX_SPEED = 34;
/** 起步伤害 */
export const BOW_MIN_DAMAGE = 2;
/** 满蓄伤害 */
export const BOW_MAX_DAMAGE = 9;

export interface BowShot {
  speed: number;
  damage: number;
}

/**
 * 蓄力曲线（纯函数）。
 * @param chargeSeconds 按住右键的秒数
 * @returns 未达起步时长返回 null（哑火）；否则返回线性插值后的出手参数
 */
export function bowShot(chargeSeconds: number): BowShot | null {
  if (!Number.isFinite(chargeSeconds) || chargeSeconds < BOW_MIN_CHARGE_S) return null;
  const t = Math.min(1, (chargeSeconds - BOW_MIN_CHARGE_S) / (BOW_FULL_CHARGE_S - BOW_MIN_CHARGE_S));
  return {
    speed: BOW_MIN_SPEED + (BOW_MAX_SPEED - BOW_MIN_SPEED) * t,
    damage: BOW_MIN_DAMAGE + (BOW_MAX_DAMAGE - BOW_MIN_DAMAGE) * t,
  };
}
