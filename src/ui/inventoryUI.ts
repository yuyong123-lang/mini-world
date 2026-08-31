// ui/inventoryUI.ts —— 背包窗口组件（任务 T45 / 契约 §13、§5）
//
// 职责边界：只做展示与「操作转发」——模型就是构造时注入的 InventoryLike 实例，
// 本组件不持世界状态、不监听按键（E 键开合由 main 接线，见任务卡）。
//
// 并发约束：本波次 items.ts(T44) 由他人交付，这里【不 import】items/crafting——
//   · 图标渲染做成可注入回调 renderIcon(el, stack)；缺省实现是 css 色块 + 首字，
//     main 接线时可换成读 ItemDef.iconTile 的图集版本。
//   · 中文名解析做成可注入回调 resolver(key)；缺省直接显示 key。
//   · 堆叠上限做成可选注入 stackMaxOf(key)；缺省 64（工具类 stackMax=1 需要 main 注入真值）。
//
// 核心的点击三态 / 快速转移被抽成导出纯函数（handleSlotClick / planShiftMove /
// applySlotPlan），tests/ui-inventory.test.ts 直接对其测试。

import type { ItemStack } from '../core/types';

// ---------------------------------------------------------------------------
// 鸭子类型（不 import 具体类，保证组件可独立实例化）
// ---------------------------------------------------------------------------

/** 契约 §5 Inventory 的结构子集（并发产物 src/items/inventory.ts 结构兼容） */
export interface InventoryLike {
  slots: (ItemStack | null)[]; // 36 = 9 hotbar + 27 main
  hotbarIndex: number;
  takeFrom(slot: number, count?: number): ItemStack | null;
  setSlot(slot: number, s: ItemStack | null): void;
  swapSlots(a: number, b: number): void;
  add(stack: ItemStack): number;
}

/**
 * 事件总线鸭子类型。
 *
 * 真实 EventBus.on 是泛型方法 `<K extends keyof T>(k, fn: (p: T[K]) => void) => () => void`，
 * 用 `(p: unknown) => void` 承接会因逆变失败（TS2367 实测），故此处显式 any。
 * 组件只转发载荷、从不读取字段。
 *
 * FIXME(契约缺口)：'dropAtPlayer' 键不在 interfaces.md §11 的 GameEvents 约定表里，
 * main 接线时需在 GameEvents 中补上 `{ stack: ItemStack }`，否则真实总线无法收发。
 */
export interface BusLike {
  emit(event: string, payload?: unknown): void;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  on(event: string, listener: (payload: any) => void): () => void;
}

/** 图标渲染回调：el 为格子内的 .icon 容器，stack 为 null 时应清空 */
export type IconRenderer = (el: HTMLElement, stack: ItemStack | null) => void;

/** 装备区鸭子面（survival/armor.ts 的 ArmorSlots 结构；独立声明避免 UI 耦合） */
export interface ArmorSlotsLike {
  head: ItemStack | null;
  chest: ItemStack | null;
  armorPoints(): number;
  canPlace(slot: 'head' | 'chest', key: string): boolean;
  put(slot: 'head' | 'chest', s: ItemStack | null): ItemStack | null;
}

export interface InventoryUIOptions {
  /** 物品 key → 中文名；缺省显示 key 本身 */
  resolver?: (key: string) => string | undefined;
  /** 图标渲染器；缺省 css 色块 + 首字 */
  renderIcon?: IconRenderer;
  /** 堆叠上限查询（工具为 1）；缺省一律 64 */
  stackMaxOf?: (key: string) => number;
  /** 装备区（可选）：注入后在面板顶部渲染 头/胸 两格装备槽 */
  armor?: { slots: ArmorSlotsLike; onChange?: () => void };
  /** 挂载父元素；缺省 document.body */
  parent?: HTMLElement;
}

// ---------------------------------------------------------------------------
// 槽位布局常量（契约 §5：0..8 热栏 / 9..35 主背包）
// ---------------------------------------------------------------------------

export const HOTBAR_SIZE = 9;
export const MAIN_START = 9;
/** 缺省堆叠上限 */
export const DEFAULT_STACK_MAX = 64;

function maxStackFor(key: string, opts: { stackMaxOf?: (key: string) => number }): number {
  const v = opts.stackMaxOf?.(key);
  return typeof v === 'number' && v > 0 ? v : DEFAULT_STACK_MAX;
}

/** 浅比较两个槽位是否等价（用于把差量写回模型，减少无谓 setSlot） */
export function sameStack(a: ItemStack | null, b: ItemStack | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.key === b.key && a.count === b.count;
}

// ---------------------------------------------------------------------------
// 纯函数层：cursorStack 三态 + shift 快速转移计划（导出供测试/复用）
// ---------------------------------------------------------------------------

export interface SlotClickOptions {
  stackMaxOf?: (key: string) => number;
}

export interface SlotClickResult {
  /** 操作后的光标物品（null = 手上空） */
  cursor: ItemStack | null;
  /** 操作后的完整槽位快照（新数组；不动入参） */
  slots: (ItemStack | null)[];
}

/**
 * 点击第 index 格的三态流转（不可变语义：总是返回新数组，不改写入参）：
 *  · 光标空 + 格空   → 无变化；
 *  · 光标空 + 格有货 → 整堆拿起，格清空；
 *  · 光标有 + 格空   → 全部放下，手清空；
 *  · 同 key 未满     → 先填格，装不下的余量留在手上；
 *  · 同 key 已满 / 异 key → 整组交换。
 */
export function handleSlotClick(
  cursor: ItemStack | null,
  slots: readonly (ItemStack | null)[],
  index: number,
  opts: SlotClickOptions = {},
): SlotClickResult {
  const next = slots.slice();
  if (index < 0 || index >= next.length) return { cursor, slots: next };

  const hand = cursor ? { ...cursor } : null;
  const rawCell = next[index];
  const cell = rawCell ? { ...rawCell } : null;

  // 手空：拿或无操作
  if (!hand) {
    if (!cell) return { cursor, slots: next };
    next[index] = null;
    return { cursor: cell, slots: next };
  }

  // 手有 + 格空：全部放下
  if (!cell) {
    next[index] = hand;
    return { cursor: null, slots: next };
  }

  const max = maxStackFor(hand.key, opts);

  // 同 key 且格未满：合并，溢出留手
  if (cell.key === hand.key && cell.count < max) {
    const move = Math.min(max - cell.count, hand.count);
    cell.count += move;
    hand.count -= move;
    next[index] = cell;
    return { cursor: hand.count > 0 ? hand : null, slots: next };
  }

  // 异 key 或格已满：交换
  next[index] = hand;
  return { cursor: cell, slots: next };
}

/**
 * shift-click 快速转移计划：hotbar ↔ main 跨区移动一整堆。
 * 返回 [目标格序号, 转移数量] 步骤序列，按顺序执行后等价于 MC 行为：
 * 目标区先找同 key 未满位补满（下标小者优先），再落入第一个空位。
 * 源格不够移/没有可用目标时返回 []。纯函数，不改写入参。
 */
export function planShiftMove(
  slots: readonly (ItemStack | null)[],
  fromIndex: number,
  opts: SlotClickOptions = {},
): Array<[number, number]> {
  const src = slots[fromIndex];
  if (!src) return [];
  if (fromIndex < 0 || fromIndex >= slots.length) return [];

  const hotbar = range(0, Math.min(HOTBAR_SIZE, slots.length));
  const main = range(MAIN_START, slots.length);
  const targetIdx = fromIndex < MAIN_START ? main : hotbar;

  const max = maxStackFor(src.key, opts);
  let remain = src.count;
  const plan: Array<[number, number]> = [];
  // 深拷贝工作副本：slice 只拷数组，元素引用必须逐个克隆，否则
  // 模拟堆叠会原地改写调用方的槽位对象（破坏「纯函数」语义与差量写回）。
  const work: (ItemStack | null)[] = slots.map((s) => (s ? { ...s } : null));

  // 1) 同 key 堆叠位优先
  for (const t of targetIdx) {
    if (remain <= 0) break;
    if (t === fromIndex) continue;
    const cur = work[t];
    if (!cur || cur.key !== src.key || cur.count >= max) continue;
    const move = Math.min(max - cur.count, remain);
    cur.count += move;
    remain -= move;
    plan.push([t, move]);
  }

  // 2) 再落空位
  for (const t of targetIdx) {
    if (remain <= 0) break;
    if (t === fromIndex) continue;
    if (work[t]) continue;
    const put = Math.min(max, remain);
    work[t] = { key: src.key, count: put };
    remain -= put;
    plan.push([t, put]);
  }

  return plan;
}

/** 把转移计划应用到槽位快照，得到新数组（不可变；不改入参） */
export function applySlotPlan(
  slots: readonly (ItemStack | null)[],
  fromIndex: number,
  plan: ReadonlyArray<readonly [number, number]>,
): (ItemStack | null)[] {
  const next = slots.slice();
  const src = next[fromIndex];
  if (!src) return next;

  let movedTotal = 0;
  for (const [, n] of plan) movedTotal += n;
  const left = src.count - movedTotal;
  next[fromIndex] = left > 0 ? { key: src.key, count: left } : null;

  for (const [idx, n] of plan) {
    const cur = next[idx];
    next[idx] = cur ? { key: cur.key, count: cur.count + n } : { key: src.key, count: n };
  }
  return next;
}

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i < end; i++) out.push(i);
  return out;
}

// ---------------------------------------------------------------------------
// 组件本体
// ---------------------------------------------------------------------------

interface TileRefs {
  index: number;
  root: HTMLElement;
  icon: HTMLElement;
  count: HTMLElement;
}

/** 背包面板：27 主格 + 底部热栏镜像行 + 光标物品 + tooltip */
export class InventoryUI {
  private readonly inv: InventoryLike;
  private readonly bus: BusLike;
  private readonly opts: InventoryUIOptions;
  private readonly root: HTMLElement;
  private readonly cursorEl: HTMLElement;
  private readonly tooltipEl: HTMLElement;
  private readonly tiles: TileRefs[] = [];
  private readonly unsubscribe: () => void;
  private readonly detachInput: () => void;

  private cursor: ItemStack | null = null;
  private visible = false;
  private disposed = false;
  /** 装备格图标/数量元素（注入 armor 选项时创建） */
  private readonly armorTiles: Partial<Record<'head' | 'chest', { icon: HTMLElement; count: HTMLElement }>> = {};
  private armorPtsEl: HTMLElement | null = null;

  constructor(inv: InventoryLike, bus: BusLike, opts: InventoryUIOptions = {}) {
    this.inv = inv;
    this.bus = bus;
    this.opts = opts;

    injectStyle();

    // ---- 面板骨架 ----
    this.root = document.createElement('div');
    this.root.id = 'inventory-panel';
    this.root.classList.add('ui-panel', 'hidden');

    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = '背包';
    this.root.appendChild(title);

    // ---- 装备区（可选注入）：头/胸两格 + 护甲值小字 ----
    if (opts.armor) {
      const armorRow = document.createElement('div');
      armorRow.id = 'inv-armor-row';
      for (const slot of ['head', 'chest'] as const) {
        const cell = document.createElement('div');
        cell.className = 'slot armor-slot';
        cell.dataset.armorSlot = slot;
        cell.title = slot === 'head' ? '头盔位' : '胸甲位';
        const icon = document.createElement('span');
        icon.className = 'icon';
        const count = document.createElement('span');
        count.className = 'count';
        cell.appendChild(icon);
        cell.appendChild(count);
        cell.addEventListener('click', (e) => {
          e.preventDefault();
          this.activateArmor(slot);
        });
        cell.addEventListener('mouseenter', () => {
          const s = this.opts.armor?.slots[slot];
          if (s && this.visible) {
            this.tooltipEl.textContent = this.nameOf(s.key);
            this.tooltipEl.classList.remove('hidden');
          }
        });
        cell.addEventListener('mouseleave', () => this.hideTooltip());
        armorRow.appendChild(cell);
        this.armorTiles[slot] = { icon, count };
      }
      const ptsLabel = document.createElement('span');
      ptsLabel.id = 'inv-armor-points';
      ptsLabel.className = 'armor-points';
      armorRow.appendChild(ptsLabel);
      this.armorPtsEl = ptsLabel;
      this.root.appendChild(armorRow);
    }

    const mainGrid = document.createElement('div');
    mainGrid.id = 'inv-main-grid';
    mainGrid.className = 'inv-grid main-grid';
    for (let i = MAIN_START; i < MAIN_START + HOTBAR_SIZE * 3 && i < inv.slots.length; i++) {
      mainGrid.appendChild(this.makeTile(i));
    }
    this.root.appendChild(mainGrid);

    const hotbarGrid = document.createElement('div');
    hotbarGrid.id = 'inv-hotbar-grid';
    hotbarGrid.className = 'inv-grid hotbar-grid';
    for (let i = 0; i < HOTBAR_SIZE; i++) hotbarGrid.appendChild(this.makeTile(i));
    this.root.appendChild(hotbarGrid);

    // ---- 光标物品 / tooltip（fixed 定位，独立于面板隐藏状态）----
    this.cursorEl = document.createElement('div');
    this.cursorEl.id = 'cursor-item';
    this.cursorEl.classList.add('hidden');
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.id = 'inv-tooltip';
    this.tooltipEl.classList.add('hidden');

    const parent = opts.parent ?? document.body;
    parent.appendChild(this.root);
    parent.appendChild(this.cursorEl);
    parent.appendChild(this.tooltipEl);

    // ---- 输入与同步 ----
    const onMouseMove = (e: MouseEvent): void => this.trackPointer(e.clientX, e.clientY);
    window.addEventListener('mousemove', onMouseMove);
    this.detachInput = () => window.removeEventListener('mousemove', onMouseMove);

    this.unsubscribe = bus.on('invChanged', () => {
      if (this.visible) this.renderTiles();
    });

    this.renderTiles();
  }

  isOpen(): boolean {
    return this.visible;
  }

  open(): void {
    if (this.disposed) return;
    this.visible = true;
    this.root.classList.remove('hidden');
    this.renderTiles();
  }

  close(): void {
    if (!this.visible) return;
    // 光标上有货：优先塞回背包，塞不下丢地上
    if (this.cursor) {
      const leftover = this.inv.add(this.cursor);
      const dropped: ItemStack = { key: this.cursor.key, count: leftover };
      this.cursor = null;
      if (dropped.count > 0) this.emitDrop(dropped);
      this.bus.emit('invChanged', {});
    }
    this.visible = false;
    this.root.classList.add('hidden');
    this.hideTooltip();
    this.updateCursorElement();
    this.renderTiles();
  }

  toggle(): void {
    if (this.visible) this.close();
    else this.open();
  }

  /** 外部（HUD/接线方）手动触发全量刷新 */
  refresh(): void {
    this.renderTiles();
    this.updateCursorElement();
  }

  /** 解绑事件并移除 DOM（main 卸载场景用） */
  dispose(): void {
    this.unsubscribe();
    this.detachInput();
    this.root.remove();
    this.cursorEl.remove();
    this.tooltipEl.remove();
    this.disposed = true;
    this.visible = false;
  }

  // ------------------------------------------------------------------
  // 内部：格子构建与交互
  // ------------------------------------------------------------------

  private makeTile(index: number): HTMLElement {
    const el = document.createElement('div');
    el.className = 'slot';
    el.dataset.index = String(index);

    const icon = document.createElement('span');
    icon.className = 'icon';
    const count = document.createElement('span');
    count.className = 'count';
    el.appendChild(icon);
    el.appendChild(count);

    el.addEventListener('click', (e) => {
      e.preventDefault();
      this.activate(index, e.shiftKey);
    });
    el.addEventListener('mouseenter', () => this.maybeShowTooltip(index));
    el.addEventListener('mouseleave', () => this.hideTooltip());

    this.tiles.push({ index, root: el, icon, count });
    return el;
  }

  /** 单次点击入口：shift 走快速转移，否则走光标三态 */
  private activate(index: number, shift: boolean): void {
    if (!this.visible) return;
    if (shift) {
      this.transferQuick(index);
      return;
    }
    const res = handleSlotClick(this.cursor, this.inv.slots, index, {
      stackMaxOf: this.opts.stackMaxOf,
    });
    this.cursor = res.cursor;
    this.writeBack(res.slots);
  }

  /** shift-click：热栏↔主背包快速转移（手工局部转移，避免动 inv.add 的全域放置语义） */
  private transferQuick(fromIndex: number): void {
    const plan = planShiftMove(this.inv.slots, fromIndex, { stackMaxOf: this.opts.stackMaxOf });
    if (plan.length === 0) return;
    this.writeBack(applySlotPlan(this.inv.slots, fromIndex, plan));
  }

  /** 把快照差量写回模型，再统一刷新 + 广播 */
  private writeBack(snapshot: readonly (ItemStack | null)[]): void {
    const cur = this.inv.slots;
    for (let i = 0; i < snapshot.length; i++) {
      if (!sameStack(cur[i], snapshot[i])) this.inv.setSlot(i, snapshot[i] ?? null);
    }
    this.afterChange();
  }

  private afterChange(): void {
    this.renderTiles();
    this.updateCursorElement();
    this.bus.emit('invChanged', {});
  }

  // ------------------------------------------------------------------
  // 渲染
  // ------------------------------------------------------------------

  private renderTiles(): void {
    for (const t of this.tiles) {
      const stack = this.inv.slots[t.index] ?? null;
      this.paint(t, stack);
      const isHotbarActive =
        t.index < MAIN_START && t.index === this.inv.hotbarIndex;
      t.root.classList.toggle('active', isHotbarActive);
      t.root.classList.toggle('hotbar-cell', t.index < MAIN_START);
    }
    this.renderArmor();
  }

  /** 装备区刷新（未注入 armor 选项时为 no-op） */
  private renderArmor(): void {
    if (!this.opts.armor) return;
    for (const slot of ['head', 'chest'] as const) {
      const tile = this.armorTiles[slot];
      if (!tile) continue;
      const stack = this.opts.armor.slots[slot];
      this.iconOf(tile.icon, stack);
      tile.count.textContent = stack && stack.count > 1 ? String(stack.count) : '';
    }
    if (this.armorPtsEl) this.armorPtsEl.textContent = `护甲 ${this.opts.armor.slots.armorPoints()}`;
  }

  /** 装备格点击：手空拿起旧件 / 手持适配物放入或交换 / 不适配静默拒绝 */
  private activateArmor(slot: 'head' | 'chest'): void {
    const armor = this.opts.armor;
    if (!armor || !this.visible) return;
    const slots = armor.slots;
    const current = slots[slot];

    if (!this.cursor) {
      // 手空：拿起旧件
      if (current) {
        const old = slots.put(slot, null);
        this.cursor = old;
        armor.onChange?.();
        this.bus.emit('invChanged', {});
      }
      return;
    }
    // 手持：仅护甲且槽位适配时放入/交换
    if (!slots.canPlace(slot, this.cursor.key)) {
      this.hideTooltip();
      return;
    }
    const old = slots.put(slot, this.cursor);
    this.cursor = old; // 换下的旧件上手（无旧件则手清空）
    armor.onChange?.();
    this.bus.emit('invChanged', {});
  }

  private paint(tile: TileRefs, stack: ItemStack | null): void {
    this.iconOf(tile.icon, stack);
    tile.count.textContent = stack && stack.count > 1 ? String(stack.count) : '';
    if (stack) tile.root.title = '';
  }

  /** 图标渲染（可注入）：缺省色块 + 首字 */
  private iconOf(el: HTMLElement, stack: ItemStack | null): void {
    if (this.opts.renderIcon) {
      this.opts.renderIcon(el, stack);
      return;
    }
    defaultRenderIcon(el, stack);
  }

  private maybeShowTooltip(index: number): void {
    const stack = this.inv.slots[index];
    if (!stack || !this.visible) return;
    this.tooltipEl.textContent = this.nameOf(stack.key);
    this.tooltipEl.classList.remove('hidden');
  }

  private hideTooltip(): void {
    this.tooltipEl.classList.add('hidden');
  }

  private trackPointer(x: number, y: number): void {
    if (this.visible && this.cursor) {
      this.positionAt(this.cursorEl, x, y);
    }
    if (!this.tooltipEl.classList.contains('hidden')) {
      this.positionAt(this.tooltipEl, x + 14, y + 14);
    }
  }

  private positionAt(el: HTMLElement, x: number, y: number): void {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  private updateCursorElement(): void {
    if (this.cursor && this.visible) {
      const iconSpan = this.cursorEl.querySelector<HTMLElement>('.icon');
      if (iconSpan) this.iconOf(iconSpan, this.cursor);
      const countSpan = this.cursorEl.querySelector<HTMLElement>('.count');
      if (countSpan) {
        countSpan.textContent = this.cursor.count > 1 ? String(this.cursor.count) : '';
      }
      this.cursorEl.classList.remove('hidden');
    } else {
      this.cursorEl.classList.add('hidden');
    }
  }

  private nameOf(key: string): string {
    return this.opts.resolver?.(key) ?? key;
  }

  private emitDrop(stack: ItemStack): void {
    this.bus.emit('dropAtPlayer', { stack });
  }
}

/** 缺省图标：以 key 哈希取色相的色块 + key 首字母（去 ITEM_ 前缀） */
export function defaultRenderIcon(el: HTMLElement, stack: ItemStack | null): void {
  if (!stack) {
    el.style.background = 'transparent';
    el.textContent = '';
    return;
  }
  const hue = hashHue(stack.key);
  el.style.background = `hsl(${hue} 48% 46%)`;
  el.textContent = stack.key.replace(/^ITEM_/, '').slice(0, 1);
}

function hashHue(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

/** 一次性注入样式（ID 区别于 hud-style，避免互相覆盖） */
function injectStyle(): void {
  if (document.getElementById('inventory-ui-style')) return;
  const style = document.createElement('style');
  style.id = 'inventory-ui-style';
  style.textContent = `
#inventory-panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
  width:408px;padding:12px;background:rgba(18,22,30,.92);border:2px solid rgba(255,255,255,.25);
  border-radius:8px;z-index:40;font-family:sans-serif;color:#fff;pointer-events:auto;
  box-shadow:0 10px 40px rgba(0,0,0,.5)}
#inventory-panel.hidden{display:none}
#inventory-panel .panel-title{font-size:14px;margin-bottom:8px;color:#cfd6e4}
#inv-armor-row{display:flex;gap:6px;align-items:center;margin-top:4px}
#inv-armor-row .armor-slot{border-color:rgba(160,220,160,.45)}
#inv-armor-row .armor-points{font-size:12px;color:#9fd8a0;margin-left:6px}
#inventory-panel .inv-grid{display:grid;gap:4px;margin-top:8px}
#inventory-panel .main-grid{grid-template-columns:repeat(9,40px)}
#inventory-panel .hotbar-grid{grid-template-columns:repeat(9,40px);margin-top:12px;
  border-top:1px solid rgba(255,255,255,.15);padding-top:10px}
#inventory-panel .slot{position:relative;width:40px;height:40px;border:2px solid rgba(255,255,255,.28);
  background:rgba(255,255,255,.06);border-radius:4px;box-sizing:border-box;cursor:pointer;
  display:flex;align-items:center;justify-content:center}
#inventory-panel .slot:hover{border-color:rgba(255,255,255,.6)}
#inventory-panel .slot.hotbar-cell{border-color:rgba(120,190,255,.45)}
#inventory-panel .slot.active{border-color:#ffd75e;box-shadow:0 0 8px rgba(255,215,94,.65)}
#inventory-panel .slot .icon{width:26px;height:26px;display:block;border-radius:3px;
  font-size:14px;line-height:26px;text-align:center;color:#fff;text-shadow:0 1px 2px #000}
#inventory-panel .slot .count{position:absolute;right:2px;bottom:0;font-size:12px;
  text-shadow:0 1px 2px #000;pointer-events:none}
#cursor-item{position:fixed;width:32px;height:32px;z-index:60;pointer-events:none;
  display:flex;align-items:center;justify-content:center}
#cursor-item.hidden{display:none}
#cursor-item .icon{width:28px;height:28px;border-radius:3px;font-size:15px;line-height:28px;
  text-align:center;color:#fff;text-shadow:0 1px 2px #000}
#cursor-item .count{position:absolute;right:-2px;bottom:-4px;font-size:12px;color:#fff;
  text-shadow:0 1px 2px #000}
#inv-tooltip{position:fixed;z-index:70;background:rgba(10,12,18,.9);color:#fff;
  padding:4px 8px;border-radius:4px;font-size:12px;pointer-events:none;white-space:nowrap;
  border:1px solid rgba(255,255,255,.2)}
#inv-tooltip.hidden{display:none}
`;
  document.head.appendChild(style);
}
