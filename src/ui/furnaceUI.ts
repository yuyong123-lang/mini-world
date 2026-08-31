// ui/furnaceUI.ts —— 熔炉界面：输入/燃料/输出三槽 + 火焰与烧炼进度
//
// 结构与 craftUI 同款（鸭子类型 + 光标三态 + 可注入 renderIcon/resolver）：
// - 输入/燃料槽点击复用 craftUI 的 handleCraftSlotClick 纯函数；
// - 输出槽为「只许拿」语义（takeOnlySlotClick 纯函数，导出供测试）；
// - close() 时三槽内容**留在炉内**（MC 行为），与合成面板的「退回背包」不同；
// - 火焰条 = burnLeft/burnTotal，箭头进度 = progress/SMELT_SECONDS，由
//   main 每帧调 refresh() 刷新（仅打开时）。
//
// 状态源是注入的 FurnaceSystemLike（furnace/furnace.ts 的 FurnaceSystem 鸭子面），
// 本组件不 import furnace 模块（解耦 UI 与数值系统，node 可独立实例化测试）。

import type { ItemStack } from '../core/types';
// 槽位三态流转复用 craftUI 的导出纯函数（ craftUI 不依赖本文件，无环）
import { handleCraftSlotClick } from './craftUI';

/** FurnaceState 的鸭子形态（与 furnace/furnace.ts 同构） */
export interface FurnaceStateLike {
  input: ItemStack | null;
  fuel: ItemStack | null;
  output: ItemStack | null;
  burnLeft: number;
  burnTotal: number;
  progress: number;
}

/** FurnaceSystem 的最小面（get/take/tick 由 main 每帧驱动，UI 只读 get） */
export interface FurnaceSystemLike {
  get(key: string): FurnaceStateLike;
}

/** 与 CraftInventoryLike 同构（独立声明以免跨文件耦合） */
export interface FurnaceInventoryLike {
  add(stack: ItemStack): number;
}

export interface FurnaceBusLike {
  emit(event: string, payload?: unknown): void;
}

export interface FurnaceUIOptions {
  bus?: FurnaceBusLike;
  /** 物品 key → 中文名；缺省显示 key 本身 */
  resolver?: (key: string) => string | undefined;
  /** 图标渲染回调（缺省 css 色块 + 首字） */
  renderIcon?: (el: HTMLElement, stack: ItemStack | null) => void;
  parent?: HTMLElement;
}



// ---------------------------------------------------------------------------
// 纯函数层（导出供 node 测试）
// ---------------------------------------------------------------------------

/**
 * 输出格点击（只许拿）：手空 → 整堆拿起；手有物品（无论同异种）→ 拒绝。
 * @returns cursor 为新手持，placed 非 null 表示本格物品已被拿走
 */
export function takeOnlySlotClick(
  cursor: ItemStack | null,
  stack: ItemStack | null,
): { cursor: ItemStack | null; placed: ItemStack | null } {
  if (cursor) return { cursor, placed: null }; // 手上有东西：拒绝
  if (!stack || stack.count <= 0) return { cursor, placed: null };
  return { cursor: { ...stack }, placed: stack };
}

// ---------------------------------------------------------------------------
// 组件本体
// ---------------------------------------------------------------------------

interface FurnaceSlotRefs {
  icon: HTMLElement;
  count: HTMLElement;
  cell: HTMLElement;
}

/** 熔炉面板：三槽 + 火焰指示 + 箭头进度 */
export class FurnaceUI {
  private readonly sys: FurnaceSystemLike;
  private readonly inv: FurnaceInventoryLike;
  private readonly bus: FurnaceBusLike | undefined;
  private readonly opts: FurnaceUIOptions;

  private readonly root: HTMLElement;
  private readonly cursorEl: HTMLElement;
  private readonly tooltipEl: HTMLElement;
  private readonly flameEl: HTMLElement;
  private readonly arrowEl: HTMLElement;
  private readonly slots: Record<'input' | 'fuel' | 'output', FurnaceSlotRefs>;

  private furnaceKey: string | null = null;
  private cursor: ItemStack | null = null;
  private detached = false;

  constructor(sys: FurnaceSystemLike, inv: FurnaceInventoryLike, opts: FurnaceUIOptions = {}) {
    this.sys = sys;
    this.inv = inv;
    this.bus = opts.bus;
    this.opts = opts;

    injectStyle();

    this.root = document.createElement('div');
    this.root.id = 'furnace-panel';
    this.root.classList.add('hidden');

    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = '熔炉';
    this.root.appendChild(title);

    const row = document.createElement('div');
    row.className = 'craft-row';

    // 左列：输入 + 火焰 + 燃料
    const col = document.createElement('div');
    col.className = 'furnace-col';
    const input = this.makeSlot('input', '烧炼物');
    const fuel = this.makeSlot('fuel', '燃料');
    col.appendChild(input.cell);

    this.flameEl = document.createElement('div');
    this.flameEl.className = 'furnace-flame';
    const flameFill = document.createElement('div');
    flameFill.className = 'furnace-flame-fill';
    this.flameEl.appendChild(flameFill);
    this.flameEl.dataset.role = 'flame';
    col.appendChild(this.flameEl);

    col.appendChild(fuel.cell);
    row.appendChild(col);

    // 中间：箭头进度
    const arrow = document.createElement('div');
    arrow.className = 'craft-arrow furnace-arrow';
    this.arrowEl = document.createElement('div');
    this.arrowEl.className = 'furnace-arrow-fill';
    arrow.appendChild(this.arrowEl);
    row.appendChild(arrow);

    // 右侧：输出槽（只许拿）
    const output = this.makeSlot('output', '产物');
    row.appendChild(output.cell);

    this.slots = { input, fuel, output };
    this.root.appendChild(row);

    // 光标物品跟随 + tooltip
    this.cursorEl = document.createElement('div');
    this.cursorEl.id = 'furnace-cursor-item';
    this.cursorEl.classList.add('hidden');
    const curIcon = document.createElement('span');
    curIcon.className = 'icon';
    const curCount = document.createElement('span');
    curCount.className = 'count';
    this.cursorEl.appendChild(curIcon);
    this.cursorEl.appendChild(curCount);

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.id = 'furnace-tooltip';
    this.tooltipEl.classList.add('hidden');

    const parent = opts.parent ?? document.body;
    parent.appendChild(this.root);
    parent.appendChild(this.cursorEl);
    parent.appendChild(this.tooltipEl);

    const onMouseMove = (e: MouseEvent): void => {
      if (this.furnaceKey === null) return;
      if (this.cursor) {
        this.cursorEl.style.left = `${e.clientX}px`;
        this.cursorEl.style.top = `${e.clientY}px`;
      }
      if (!this.tooltipEl.classList.contains('hidden')) {
        this.tooltipEl.style.left = `${e.clientX + 14}px`;
        this.tooltipEl.style.top = `${e.clientY + 14}px`;
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    this.detachedCleanup = () => window.removeEventListener('mousemove', onMouseMove);
  }

  private detachedCleanup: () => void = () => {};

  isOpen(): boolean {
    return this.furnaceKey !== null;
  }

  /** 当前打开的熔炉 key；未打开为 null */
  currentKey(): string | null {
    return this.furnaceKey;
  }

  /** 打开指定熔炉（光标残留物先退回背包防丢） */
  open(furnaceKey: string): void {
    if (this.detached) return;
    if (this.cursor) this.refundCursor();
    this.furnaceKey = furnaceKey;
    this.root.classList.remove('hidden');
    this.refresh();
  }

  /** 关闭面板：光标物退回背包（三槽留在炉内——MC 行为），并广播背包变化 */
  close(): void {
    if (this.furnaceKey === null) return;
    this.furnaceKey = null;
    this.root.classList.add('hidden');
    this.hideTooltip();
    if (this.cursor) this.refundCursor();
    this.updateCursorElement();
    this.bus?.emit('invChanged', {});
  }

  /**
   * 每帧刷新（仅打开时有意义）：三槽图标 + 火焰/箭头进度。
   * 直接每帧全量 paint（图标 canvas 重绘开销可忽略，熔炉通常只开一个）。
   */
  refresh(): void {
    if (this.furnaceKey === null) return;
    const s = this.sys.get(this.furnaceKey);
    this.paint(this.slots.input, s.input);
    this.paint(this.slots.fuel, s.fuel);
    this.paint(this.slots.output, s.output);

    const flame = Math.max(0, Math.min(1, s.burnTotal > 0 ? s.burnLeft / s.burnTotal : 0));
    (this.flameEl.firstElementChild as HTMLElement).style.height = `${Math.round(flame * 100)}%`;
    this.flameEl.classList.toggle('lit', s.burnLeft > 0);

    const prog = Math.max(0, Math.min(1, s.progress / 10)); // SMELT_SECONDS=10（鸭子化不引常量）
    (this.arrowEl as HTMLElement).style.width = `${Math.round(prog * 100)}%`;
  }

  /** ---------- 内部 ---------- */

  private makeSlot(role: 'input' | 'fuel' | 'output', hint: string): FurnaceSlotRefs {
    const cell = document.createElement('div');
    cell.className = `slot furnace-slot furnace-${role}`;
    cell.title = hint;
    const icon = document.createElement('span');
    icon.className = 'icon';
    const count = document.createElement('span');
    count.className = 'count';
    cell.appendChild(icon);
    cell.appendChild(count);

    cell.addEventListener('click', (e) => {
      e.preventDefault();
      this.onSlotClick(role);
    });
    cell.addEventListener('mouseenter', () => {
      const s = this.furnaceKey ? this.sys.get(this.furnaceKey) : null;
      const stack = s ? this.slotStack(s, role) : null;
      this.showNameAt(cell, stack ? stack.key : '');
    });
    cell.addEventListener('mouseleave', () => this.hideTooltip());
    return { cell, icon, count };
  }

  private slotStack(s: FurnaceStateLike, role: 'input' | 'fuel' | 'output'): ItemStack | null {
    return role === 'input' ? s.input : role === 'fuel' ? s.fuel : s.output;
  }

  private setSlotStack(s: FurnaceStateLike, role: 'input' | 'fuel' | 'output', v: ItemStack | null): void {
    if (role === 'input') s.input = v;
    else if (role === 'fuel') s.fuel = v;
    else s.output = v;
  }

  private onSlotClick(role: 'input' | 'fuel' | 'output'): void {
    if (this.furnaceKey === null) return;
    const s = this.sys.get(this.furnaceKey);

    if (role === 'output') {
      // 只许拿：手空才可拿整堆
      const stack = this.slotStack(s, role);
      const res = takeOnlySlotClick(this.cursor, stack);
      this.cursor = res.cursor;
      if (res.placed) this.setSlotStack(s, role, null);
      this.afterChange();
      return;
    }

    // 输入/燃料：与合成格同款三态（手空拿/手有放/同种并/异种换）
    const asGrid: (ItemStack | null)[] = [this.slotStack(s, role)];
    const res = handleCraftSlotClick(this.cursor, asGrid, 0);
    this.cursor = res.cursor;
    this.setSlotStack(s, role, res.slots[0]);
    this.afterChange();
  }

  private afterChange(): void {
    this.updateCursorElement();
    this.refresh();
    this.bus?.emit('invChanged', {});
  }

  private paint(tile: FurnaceSlotRefs, stack: ItemStack | null): void {
    if (this.opts.renderIcon) {
      this.opts.renderIcon(tile.icon, stack);
    } else {
      defaultIcon(tile.icon, stack);
    }
    tile.count.textContent = stack && stack.count > 1 ? String(stack.count) : '';
  }

  /** 光标物退回背包，放不下丢地上 */
  private refundCursor(): void {
    if (!this.cursor) return;
    const leftover = this.inv.add(this.cursor);
    const dropped: ItemStack = { key: this.cursor.key, count: leftover };
    this.cursor = null;
    if (dropped.count > 0) this.bus?.emit('dropAtPlayer', { stack: dropped });
  }

  private updateCursorElement(): void {
    const icon = this.cursorEl.children[0] as HTMLElement;
    const count = this.cursorEl.children[1] as HTMLElement;
    if (this.cursor && this.furnaceKey !== null) {
      this.cursorEl.classList.remove('hidden');
      if (this.opts.renderIcon) this.opts.renderIcon(icon, this.cursor);
      else defaultIcon(icon, this.cursor);
      count.textContent = this.cursor.count > 1 ? String(this.cursor.count) : '';
    } else {
      this.cursorEl.classList.add('hidden');
    }
  }

  private showNameAt(anchor: HTMLElement, key: string): void {
    if (this.furnaceKey === null || !key) {
      this.hideTooltip();
      return;
    }
    const name = this.opts.resolver ? this.opts.resolver(key) : key;
    this.tooltipEl.textContent = name ?? key;
    this.tooltipEl.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    this.tooltipEl.style.left = `${r.left}px`;
    this.tooltipEl.style.top = `${r.top - 26}px`;
  }

  private hideTooltip(): void {
    this.tooltipEl.classList.add('hidden');
  }

  /** 卸载：解绑全局监听并移除 DOM（页面级收尾用） */
  dispose(): void {
    if (this.detached) return;
    this.detached = true;
    this.detachedCleanup();
    this.root.remove();
    this.cursorEl.remove();
    this.tooltipEl.remove();
    this.furnaceKey = null;
  }
}

/** 缺省图标：key 哈希色块 + 首字（与 inventoryUI.defaultRenderIcon 同款独立实现） */
function defaultIcon(el: HTMLElement, stack: ItemStack | null): void {
  if (!stack) {
    el.style.background = 'transparent';
    el.textContent = '';
    return;
  }
  let h = 5381;
  for (let i = 0; i < stack.key.length; i++) h = ((h << 5) + h + stack.key.charCodeAt(i)) | 0;
  el.style.background = `hsl(${Math.abs(h) % 360} 48% 46%)`;
  el.textContent = stack.key.replace(/^ITEM_/, '').slice(0, 1);
}

/** 一次性注入样式（复用 craftUI 的槽位视觉变量，id 幂等） */
function injectStyle(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('furnace-ui-style')) return;
  const style = document.createElement('style');
  style.textContent = `
#furnace-panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:40;
  background:rgba(18,22,30,.94);border:1px solid rgba(255,215,94,.35);border-radius:10px;
  padding:14px 18px;color:#fff;font-family:sans-serif;user-select:none}
#furnace-panel.hidden{display:none}
#furnace-panel .panel-title{font-size:15px;color:#ffd75e;margin-bottom:10px;text-align:center}
#furnace-panel .furnace-col{display:flex;flex-direction:column;align-items:center;gap:6px}
#furnace-panel .furnace-slot{width:44px;height:44px;border:2px solid rgba(255,255,255,.4);
  border-radius:4px;background:rgba(10,12,18,.6);position:relative;display:flex;
  align-items:center;justify-content:center;cursor:pointer;box-sizing:border-box}
#furnace-panel .slot .icon{font-size:20px;pointer-events:none}
#furnace-panel .slot .count{position:absolute;right:3px;bottom:1px;font-size:11px;
  color:#fff;text-shadow:0 1px 2px #000;pointer-events:none}
#furnace-panel .furnace-flame{width:16px;height:20px;position:relative;overflow:hidden;
  background:rgba(255,255,255,.08);border-radius:3px}
#furnace-panel .furnace-flame-fill{position:absolute;bottom:0;left:0;right:0;height:0;
  background:linear-gradient(#ffdd55,#ff7722)}
#furnace-panel .furnace-flame.lit{box-shadow:0 0 8px rgba(255,150,40,.8)}
#furnace-panel .furnace-arrow{width:60px;height:12px;position:relative;overflow:hidden;
  background:rgba(255,255,255,.1);border-radius:6px;margin:0 12px}
#furnace-panel .furnace-arrow-fill{height:100%;width:0;background:#ffd75e;border-radius:6px}
#furnace-cursor-item{position:fixed;z-index:60;pointer-events:none;display:flex;
  align-items:center;gap:2px}
#furnace-cursor-item .icon{font-size:20px}
#furnace-cursor-item .count{font-size:11px;color:#fff;text-shadow:0 1px 2px #000}
#furnace-cursor-item.hidden{display:none}
#furnace-tooltip{position:fixed;z-index:60;background:rgba(10,12,18,.9);color:#fff;
  font-size:12px;padding:3px 8px;border-radius:4px;pointer-events:none}
#furnace-tooltip.hidden{display:none}
`;
  style.id = 'furnace-ui-style';
  document.head.appendChild(style);
}
