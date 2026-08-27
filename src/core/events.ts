// 极简泛型事件总线（契约 §11）
// GameEvents 约定键为系统间解耦的唯一通道。

import type { ItemStack, Vec3 } from './types';

export interface GameEvents {
  hp: { v: number };
  hunger: { v: number };
  death: Record<string, never>;
  damage: { amount: number; from?: Vec3 };
  invChanged: Record<string, never>;
  toast: { msg: string };
  pickup: { key: string; count: number };
  dayTick: { isNight: boolean };
  blockBroken: { pos: Vec3; id: number };
  mobKilled: { drops: ItemStack[] };
}

export class EventBus<T extends Record<string, unknown>> {
  private map = new Map<keyof T, Set<(p: never) => void>>();

  on<K extends keyof T>(k: K, fn: (p: T[K]) => void): () => void {
    let set = this.map.get(k);
    if (!set) this.map.set(k, (set = new Set()));
    set.add(fn as (p: never) => void);
    return () => this.off(k, fn);
  }

  off<K extends keyof T>(k: K, fn: (p: T[K]) => void): void {
    this.map.get(k)?.delete(fn as (p: never) => void);
  }

  emit<K extends keyof T>(k: K, p: T[K]): void {
    const set = this.map.get(k);
    if (!set) return;
    for (const fn of [...set]) fn(p as never);
  }
}
