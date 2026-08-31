// furnace/furnace.ts —— 熔炉系统：燃料 + 输入 → 输出（带燃烧/烧炼进度的独立数值面）
//
// 与 CraftingMatcher 的关系：网格配方匹配器不承载「时间驱动 + 燃料消耗」语义，
// 熔炉是平行的数值系统。本文件刻意零 DOM/世界依赖，纯函数核心（tickFurnace）+
// 薄状态容器（FurnaceSystem），node 单测全覆盖。
//
// MC 语义对齐：
// - 火焰点燃后烧完整周期，拔走燃料/输入不灭火（burnLeft 继续递减到 0）；
// - 换燃料不重置烧炼进度 progress（progress 只在产出时清零）；
// - 输出格满载或异种时停止产出，但火焰照常烧（浪费设计，防挂机无上限堆积）。
//
// 存储：FurnaceSystem.states 的 key = "x,y,z"（方块坐标），由 main 在存档
// （save v2 的 furnaces 字段）与挖掉熔炉时（take）负责持久化/清理。

import { ITEMS } from '../items/items';
import type { ItemStack } from '../core/types';

/** 单个熔炉的状态（三槽 + 火焰/进度计时） */
export interface FurnaceState {
  input: ItemStack | null;
  fuel: ItemStack | null;
  output: ItemStack | null;
  /** 剩余燃烧秒数（>0 = 火焰中） */
  burnLeft: number;
  /** 本燃烧周期的总秒数（UI 火焰比例 = burnLeft / burnTotal） */
  burnTotal: number;
  /** 当前输入的烧炼进度 0..1 */
  progress: number;
}

/** 每个物品的统一烧炼时长（秒） */
export const SMELT_SECONDS = 10;

/** 燃料热值表（秒/个）：煤 8 个周期 / 木板·原木 1.5 / 木棍 0.5 */
const FUEL_SECONDS: Readonly<Record<string, number>> = {
  [ITEMS.COAL]: 80,
  [ITEMS.BLOCK_PLANKS]: 15,
  [ITEMS.BLOCK_LOG]: 15,
  [ITEMS.STICK]: 5,
};

/** 燃烧秒数：未知燃料为 0（烧不动） */
export function fuelSeconds(key: string): number {
  return FUEL_SECONDS[key] ?? 0;
}

/** 烧炼产物表：矿石→锭、生肉→熟肉 */
const SMELT_MAP: Readonly<Record<string, { key: string; count: number }>> = {
  [ITEMS.RAW_IRON]: { key: ITEMS.IRON_INGOT, count: 1 },
  [ITEMS.RAW_GOLD]: { key: ITEMS.GOLD_INGOT, count: 1 },
  [ITEMS.RAW_PORK]: { key: ITEMS.COOKED_PORK, count: 1 },
  [ITEMS.RAW_BEEF]: { key: ITEMS.COOKED_BEEF, count: 1 },
  [ITEMS.RAW_MUTTON]: { key: ITEMS.COOKED_MUTTON, count: 1 },
};

/** 输入物品的烧炼产物；不可烧为 null */
export function smeltResult(key: string): { key: string; count: number } | null {
  return SMELT_MAP[key] ?? null;
}

/** 同类物品能否合并进输出格（同 key 且未超堆叠上限） */
function outputCanAccept(output: ItemStack | null, out: { key: string; count: number }): boolean {
  if (!output) return true;
  return output.key === out.key && output.count + out.count <= 64;
}

/**
 * 单炉推进（原地修改）。dt 为本帧秒数（内部按整秒逻辑离散推进：
 * burnLeft/progress 都是连续秒累进，产出判定用 progress >= SMELT_SECONDS）。
 */
export function tickFurnace(s: FurnaceState, dt: number): void {
  if (!(dt > 0)) return;

  const result = s.input ? smeltResult(s.input.key) : null;
  const canSmelt = result !== null && outputCanAccept(s.output, result);

  // 1. 火焰管理：燃尽且「还能烧出东西」且有燃料 → 扣 1 个燃料点燃新周期。
  //    没有可烧物时不预燃（MC 同款：空烧不点新火）。
  if (s.burnLeft <= 0 && canSmelt && s.fuel && fuelSeconds(s.fuel.key) > 0) {
    s.burnTotal = fuelSeconds(s.fuel.key);
    s.burnLeft = s.burnTotal;
    s.fuel.count -= 1;
    if (s.fuel.count <= 0) s.fuel = null;
  }

  if (s.burnLeft <= 0) {
    // 无火：进度保留但不推进（MC 中无火进度冻结）
    return;
  }

  // 2. 火焰烧完本帧的燃烧量（无论是否在产出，火焰都持续消耗）
  s.burnLeft = Math.max(0, s.burnLeft - dt);

  // 3. 烧炼进度：只在「有可烧物且产出可入」时推进
  if (!canSmelt || !s.input) return;
  s.progress += dt;
  if (s.progress >= SMELT_SECONDS) {
    s.progress = 0;
    // 消耗 1 个输入
    s.input.count -= 1;
    if (s.input.count <= 0) s.input = null;
    // 产出入格（outputCanAccept 已在上游确认可入；此处再走一遍保持一致性）
    if (result) {
      if (!s.output) s.output = { ...result };
      else s.output.count += result.count;
    }
  }
}

/** 空状态工厂 */
export function emptyFurnaceState(): FurnaceState {
  return { input: null, fuel: null, output: null, burnLeft: 0, burnTotal: 0, progress: 0 };
}

/**
 * 熔炉状态容器：按方块坐标 "x,y,z" 管理全部活跃熔炉。
 * main 每帧 tick(dt)；挖掉熔炉时 take(key) 取走状态（内容由集成侧退给玩家）。
 */
export class FurnaceSystem {
  readonly states = new Map<string, FurnaceState>();

  /** 取（无则建空态）——打开 UI 前调用即可保证槽位存在 */
  get(key: string): FurnaceState {
    let s = this.states.get(key);
    if (!s) {
      s = emptyFurnaceState();
      this.states.set(key, s);
    }
    return s;
  }

  /** 取走并移除（挖掉熔炉）；不存在返回 undefined */
  take(key: string): FurnaceState | undefined {
    const s = this.states.get(key);
    this.states.delete(key);
    return s;
  }

  /** 推进全部熔炉（全量遍历：熔炉数量级小，无需空间索引） */
  tick(dt: number): void {
    for (const s of this.states.values()) tickFurnace(s, dt);
  }
}
