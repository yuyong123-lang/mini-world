// ui/craftUI.ts —— 合成格 UI（任务 T45 / 契约 §6、§13）
//
// 并发约束：crafting 匹配器由 T44 并发交付，本文件【不 import】src/items/crafting——
// 构造器以鸭子类型注入 matcher：
//   match(grid, size) → { out:{key,count}, consume(grid)=>grid' } | null
// （main 接线时把静态 CraftingMatcher 包一层即可，见任务卡。）
//
// grid 是组件自有状态（不属于 Inventory 的 36 槽），open/close 管理其生命周期：
//   · close() 把 grid 中剩余材料逐个退回背包，放不下发 bus 'dropAtPlayer'。
//   · 每次 grid 变化重新 match 刷新输出格预览。
//
// 材料格点击复用与 InventoryUI 同款「光标物品」三态——按任务卡要求此处内置一份
// 轻量实现（handleCraftSlotClick），不 import inventoryUI。

import type { ItemStack } from '../core/types';

/** 合成格堆叠上限（材料只会是普通物品；固定 64，避免依赖 items.ts） */
const CRAFT_STACK_MAX = 64;

// ---------------------------------------------------------------------------
// 鸭子类型（并发产物未就绪也可独立实例化）
// ---------------------------------------------------------------------------

/** 契约 §6 CraftingMatcher 的鸭子化形态（静态类经 main 包装成此对象） */
export interface CraftMatcherLike {
  match(
    grid: (ItemStack | null)[],
    gridSize: 2 | 3,
  ): {
    out: { key: string; count: number };
    consume(grid: (ItemStack | null)[]): (ItemStack | null)[];
  } | null;
}

/** 与 inventoryUI.InventoryLike 同构（独立声明以免跨文件耦合） */
export interface CraftInventoryLike {
  slots: (ItemStack | null)[];
  hotbarIndex: number;
  takeFrom(slot: number, count?: number): ItemStack | null;
  setSlot(slot: number, s: ItemStack | null): void;
  swapSlots(a: number, b: number): void;
  add(stack: ItemStack): number;
}

/**
 * 事件总线鸭子类型（同 inventoryUI.BusLike）。
 *
 * FIXME(契约缺口)：'dropAtPlayer' 键不在 interfaces.md §11 的 GameEvents 约定表里，
 * main 接线时需在 GameEvents 补充 `{ stack: ItemStack }` 后真实总线才能收发。
 */
export interface CraftBusLike {
  emit(event: string, payload?: unknown): void;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  on(event: string, listener: (payload: any) => void): () => void;
}

export interface CraftUIOptions {
  /**
   * 事件总线（InventoryUI 是构造参数，这里按任务卡签名走 opts）：
   * 用于退回溢出发 'dropAtPlayer'、以及每次变更发 'invChanged' 让 HUD 同步。
   * 缺省时退回放不下的部分直接丢弃（控制台告警）。
   */
  bus?: CraftBusLike;
  /** 物品 key → 中文名；缺省显示 key 本身 */
  resolver?: (key: string) => string | undefined;
  /** 图标渲染回调（缺省 css 色块 + 首字）；main 换图集版 */
  renderIcon?: (el: HTMLElement, stack: ItemStack | null) => void;
  parent?: HTMLElement;
}

export interface MatchResultLike {
  out: { key: string; count: number };
  consume(grid: (ItemStack | null)[]): (ItemStack | null)[];
}

// ---------------------------------------------------------------------------
// 纯函数层（导出便于测试：关闭面板时的材料退回清单）
// ---------------------------------------------------------------------------

/** 收集合成格中待退回的物品快照（克隆，避免与组件内部 state 共享引用） */
export function collectRefundStacks(
  grid: readonly (ItemStack | null)[],
): ItemStack[] {
  const out: ItemStack[] = [];
  for (const s of grid) if (s && s.count > 0) out.push({ key: s.key, count: s.count });
  return out;
}

/**
 * 点击合成材料格的三态流转（不可变返回，不改写入参）：
 * 手空拿整堆 / 手空格有拿起 / 同 key 合并溢出留手 / 异 key 或已满交换。
 * 与 inventoryUI.handleSlotClick 行为一致但不含上限注入（合成材料恒为普通物）。
 */
export function handleCraftSlotClick(
  cursor: ItemStack | null,
  grid: readonly (ItemStack | null)[],
  index: number,
): { cursor: ItemStack | null; slots: (ItemStack | null)[] } {
  const next = grid.slice();
  if (index < 0 || index >= next.length) return { cursor, slots: next };

  const hand = cursor ? { ...cursor } : null;
  const raw = next[index];
  const cell = raw ? { ...raw } : null;

  if (!hand) {
    if (!cell) return { cursor, slots: next };
    next[index] = null;
    return { cursor: cell, slots: next };
  }
  if (!cell) {
    next[index] = hand;
    return { cursor: null, slots: next };
  }
  if (cell.key === hand.key && cell.count < CRAFT_STACK_MAX) {
    const move = Math.min(CRAFT_STACK_MAX - cell.count, hand.count);
    cell.count += move;
    hand.count -= move;
    next[index] = cell;
    return { cursor: hand.count > 0 ? hand : null, slots: next };
  }
  next[index] = hand;
  return { cursor: cell, slots: next };
}

// ---------------------------------------------------------------------------
// 组件本体
// ---------------------------------------------------------------------------

interface CellRefs {
  index: number;
  root: HTMLElement;
  icon: HTMLElement;
  count: HTMLElement;
}

/** 合成面板：N×N 材料格 + 输出格（自带光标物品与 tooltip） */
export class CraftUI {
  /** 产出入包成功后的通知钩子（main 可借此发 pickup toast 等） */
  onOutputTaken?: (out: { key: string; count: number }) => void;

  private readonly matcher: CraftMatcherLike;
  private readonly inv: CraftInventoryLike;
  private readonly bus: CraftBusLike | undefined;
  private readonly opts: CraftUIOptions;

  private readonly root: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly gridEl: HTMLElement;
  private readonly outIcon: HTMLElement;
  private readonly outCount: HTMLElement;
  private readonly outCell: HTMLElement;
  private readonly cursorEl: HTMLElement;
  private readonly tooltipEl: HTMLElement;

  private cells: CellRefs[] = [];
  private grid: (ItemStack | null)[] = [];
  private gridSize: 2 | 3 = 2;
  private panelMode: 2 | 3 | null = null;
  private matched: MatchResultLike | null = null;

  private cursor: ItemStack | null = null;
  private detached = false;
  private unsubscribe: () => void;

  constructor(matcher: CraftMatcherLike, inv: CraftInventoryLike, opts: CraftUIOptions = {}) {
    this.matcher = matcher;
    this.inv = inv;
    this.bus = opts.bus;
    this.opts = opts;

    injectStyle();

    this.root = document.createElement('div');
    this.root.id = 'craft-panel';
    this.root.classList.add('hidden');

    this.titleEl = document.createElement('div');
    this.titleEl.className = 'panel-title';
    this.titleEl.textContent = '合成';
    this.root.appendChild(this.titleEl);

    const row = document.createElement('div');
    row.className = 'craft-row';

    this.gridEl = document.createElement('div');
    this.gridEl.id = 'craft-grid';
    this.gridEl.className = 'inv-grid craft-grid';
    row.appendChild(this.gridEl);

    const arrow = document.createElement('div');
    arrow.className = 'craft-arrow';
    arrow.textContent = '→';
    row.appendChild(arrow);

    this.outCell = document.createElement('div');
    this.outCell.className = 'slot output-cell';
    this.outIcon = document.createElement('span');
    this.outIcon.className = 'icon';
    this.outCount = document.createElement('span');
    this.outCount.className = 'count';
    this.outCell.appendChild(this.outIcon);
    this.outCell.appendChild(this.outCount);
    this.outCell.addEventListener('click', (e) => {
      e.preventDefault();
      this.takeOutput();
    });
    this.outCell.addEventListener('mouseenter', () =>
      this.showNameAt(this.outCell, this.matched ? this.matched.out.key : ''),
    );
    this.outCell.addEventListener('mouseleave', () => this.hideTooltip());
    row.appendChild(this.outCell);

    this.root.appendChild(row);

    // 光标物品跟随 + tooltip（fixed 层）
    this.cursorEl = document.createElement('div');
    this.cursorEl.id = 'craft-cursor-item';
    this.cursorEl.classList.add('hidden');
    const curIcon = document.createElement('span');
    curIcon.className = 'icon';
    const curCount = document.createElement('span');
    curCount.className = 'count';
    this.cursorEl.appendChild(curIcon);
    this.cursorEl.appendChild(curCount);

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.id = 'craft-tooltip';
    this.tooltipEl.classList.add('hidden');

    const parent = opts.parent ?? document.body;
    parent.appendChild(this.root);
    parent.appendChild(this.cursorEl);
    parent.appendChild(this.tooltipEl);

    const onMouseMove = (e: MouseEvent): void => {
      if (this.panelMode === null) return;
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

    // 背包外部变动不影响 craft 格自身，但保持 hook 以便将来联动
    this.unsubscribe =
      this.bus?.on('invChanged', () => {}) ?? (() => {});

    this.detachedCleanup = () => window.removeEventListener('mousemove', onMouseMove);
  }

  private detachedCleanup: () => void = () => {};

  isOpen(): boolean {
    return this.panelMode !== null;
  }

  /** 当前打开的规格；未打开返回 null */
  mode(): 2 | 3 | null {
    return this.panelMode;
  }

  /** 打开随身 2×2 或工作台 3×3；跨尺寸打开时已有摆盘按原顺序迁入新格网 */
  open(size: 2 | 3): void {
    if (this.detached) return;
    this.gridSize = size;
    this.panelMode = size;
    // 尺寸切换：保留已摆材料（升 3×3 常见于摆了一半升级工作台），超出的格子丢回背包
    const prev = this.grid;
    this.grid = new Array<ItemStack | null>(size * size).fill(null);
    for (let i = 0; i < Math.min(prev.length, this.grid.length); i++) this.grid[i] = prev[i];
    for (let i = this.grid.length; i < prev.length; i++) {
      const orphan = prev[i];
      if (orphan) this.returnToInventory(orphan);
    }

    this.titleEl.textContent = size === 3 ? '工作台' : '合成';
    this.buildCells();
    this.root.classList.remove('hidden');
    this.refresh();
  }

  /** 关闭面板：材料逐个退回背包，塞不下丢地上 */
  close(): void {
    if (this.panelMode === null) return;

    // 有货的手先试着手动塞一格？——遵守模型约定：整体交还 inv.add
    if (this.cursor) {
      this.returnToInventory(this.cursor);
      this.cursor = null;
    }
    const leftovers = collectRefundStacks(this.grid);
    this.grid = new Array<ItemStack | null>(this.grid.length).fill(null);
    for (const st of leftovers) this.returnToInventory(st);
    this.matched = null;

    this.panelMode = null;
    this.root.classList.add('hidden');
    this.hideTooltip();
    this.updateCursorElement();
    this.paintOutput(null);
  }

  private returnToInventory(stack: ItemStack): void {
    const remain = this.inv.add(stack);
    if (remain > 0) {
      if (this.bus) {
        this.bus.emit('dropAtPlayer', { stack: { key: stack.key, count: remain } });
      } else {
        console.warn(`[craftUI] 背包已满，丢弃 ${stack.key} x${remain}（未接 bus）`);
      }
    }
    this.bus?.emit('invChanged', {});
  }

  // ------------------------------------------------------------------
  // 内部：格子与交互
  // ------------------------------------------------------------------

  private buildCells(): void {
    this.gridEl.innerHTML = '';
    this.cells = [];
    for (let i = 0; i < this.gridSize * this.gridSize; i++) {
      const el = document.createElement('div');
      el.className = 'slot craft-cell';
      el.dataset.index = String(i);
      const icon = document.createElement('span');
      icon.className = 'icon';
      const count = document.createElement('span');
      count.className = 'count';
      el.append(icon, count);

      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.clickMaterial(i);
      });
      el.addEventListener('mouseenter', () => {
        const s = this.grid[i];
        if (s) this.showNameAt(el, s.key);
      });
      el.addEventListener('mouseleave', () => this.hideTooltip());

      this.gridEl.appendChild(el);
      this.cells.push({ index: i, root: el, icon, count });
    }
    // 尺寸样式切换（2×2 / 3×3 两套列模板）
    this.gridEl.style.gridTemplateColumns = `repeat(${this.gridSize}, 40px)`;
  }

  private clickMaterial(index: number): void {
    if (this.panelMode === null) return;
    const res = handleCraftSlotClick(this.cursor, this.grid, index);
    this.cursor = res.cursor;
    this.grid = res.slots;
    this.afterChange();
  }

  /** 点输出格：consume 扣料 + 产物直接入背包（不入手） */
  private takeOutput(): void {
    if (this.panelMode === null || !this.matched) return;
    const m = this.matched;
    const leftover = this.inv.add({ key: m.out.key, count: m.out.count });
    if (leftover > 0 && this.bus) {
      this.bus.emit('dropAtPlayer', { stack: { key: m.out.key, count: leftover } });
    }
    this.onOutputTaken?.(m.out);
    this.grid = m.consume(this.grid);
    this.bus?.emit('invChanged', {});
    this.afterChange();
  }

  private afterChange(): void {
    this.refresh();
  }

  // ------------------------------------------------------------------
  // 渲染
  // ------------------------------------------------------------------

  /** 单向流入口：任何 grid 变化后重跑 match 再刷新全部格子 */
  refresh(): void {
    if (this.panelMode === null) return;
    this.matched = this.matcher.match(this.grid, this.gridSize);
    for (const c of this.cells) this.paint(c, this.grid[c.index] ?? null);
    this.paintOutput(this.matched ? this.matched.out : null);
    this.updateCursorElement();
  }

  private paint(cell: CellRefs, stack: ItemStack | null): void {
    this.drawIcon(cell.icon, stack);
    cell.count.textContent = stack && stack.count > 1 ? String(stack.count) : '';
  }

  private paintOutput(out: { key: string; count: number } | null): void {
    const stack = out ? { key: out.key, count: out.count } : null;
    this.drawIcon(this.outIcon, stack);
    this.outCount.textContent = out && out.count > 1 ? String(out.count) : '';
    this.outCell.classList.toggle('ready', !!out);
    if (!out) this.hideTooltip();
  }

  private updateCursorElement(): void {
    if (this.cursor && this.panelMode !== null) {
      const iconSpan = this.cursorEl.querySelector<HTMLElement>('.icon');
      const countSpan = this.cursorEl.querySelector<HTMLElement>('.count');
      if (iconSpan) this.drawIcon(iconSpan, this.cursor);
      if (countSpan) {
        countSpan.textContent = this.cursor.count > 1 ? String(this.cursor.count) : '';
      }
      this.cursorEl.classList.remove('hidden');
    } else {
      this.cursorEl.classList.add('hidden');
    }
  }

  private drawIcon(el: HTMLElement, stack: ItemStack | null): void {
    if (this.opts.renderIcon) {
      this.opts.renderIcon(el, stack);
      return;
    }
    defaultCraftRenderIcon(el, stack);
  }

  private showNameAt(_anchor: HTMLElement, key: string): void {
    if (!key) return;
    this.tooltipEl.textContent = this.opts.resolver?.(key) ?? key;
    this.tooltipEl.classList.remove('hidden');
  }

  private hideTooltip(): void {
    this.tooltipEl.classList.add('hidden');
  }

  /** 解绑事件并移除 DOM */
  dispose(): void {
    this.unsubscribe();
    this.detachedCleanup();
    this.root.remove();
    this.cursorEl.remove();
    this.tooltipEl.remove();
    this.detached = true;
    this.panelMode = null;
  }
}

/** 缺省图标：色块 + 首（去 ITEM_ 前缀）字 */
export function defaultCraftRenderIcon(el: HTMLElement, stack: ItemStack | null): void {
  if (!stack) {
    el.style.background = 'transparent';
    el.textContent = '';
    return;
  }
  el.style.background = `hsl(${hueOf(stack.key)} 48% 46%)`;
  el.textContent = stack.key.replace(/^ITEM_/, '').slice(0, 1);
}

function hueOf(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function injectStyle(): void {
  if (document.getElementById('craft-ui-style')) return;
  const style = document.createElement('style');
  style.id = 'craft-ui-style';
  style.textContent = `
#craft-panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
  padding:12px;background:rgba(18,22,30,.92);border:2px solid rgba(255,255,255,.25);
  border-radius:8px;z-index:45;font-family:sans-serif;color:#fff;pointer-events:auto;
  box-shadow:0 10px 40px rgba(0,0,0,.5)}
#craft-panel.hidden{display:none}
#craft-panel .panel-title{font-size:14px;margin-bottom:8px;color:#cfd6e4}
#craft-panel .craft-row{display:flex;align-items:center;gap:14px}
#craft-panel .inv-grid{display:grid;gap:4px}
#craft-panel .slot{position:relative;width:40px;height:40px;border:2px solid rgba(255,255,255,.28);
  background:rgba(255,255,255,.06);border-radius:4px;box-sizing:border-box;cursor:pointer;
  display:flex;align-items:center;justify-content:center}
#craft-panel .slot:hover{border-color:rgba(255,255,255,.6)}
#craft-panel .output-cell{border-color:rgba(150,230,160,.5)}
#craft-panel .output-cell.ready{box-shadow:0 0 10px rgba(120,220,140,.55)}
#craft-panel .slot .icon{width:26px;height:26px;display:block;border-radius:3px;font-size:14px;
  line-height:26px;text-align:center;color:#fff;text-shadow:0 1px 2px #000}
#craft-panel .slot .count{position:absolute;right:2px;bottom:0;font-size:12px;
  text-shadow:0 1px 2px #000;pointer-events:none}
#craft-panel .craft-arrow{font-size:20px;color:#cfd6e4}
#craft-cursor-item{position:fixed;width:32px;height:32px;z-index:60;pointer-events:none;
  display:flex;align-items:center;justify-content:center}
#craft-cursor-item.hidden{display:none}
#craft-cursor-item .icon{width:28px;height:28px;border-radius:3px;font-size:15px;line-height:28px;
  text-align:center;color:#fff;text-shadow:0 1px 2px #000}
#craft-cursor-item .count{position:absolute;right:-2px;bottom:-4px;font-size:12px;color:#fff;
  text-shadow:0 1px 2px #000}
#craft-tooltip{position:fixed;z-index:70;background:rgba(10,12,18,.9);color:#fff;padding:4px 8px;
  border-radius:4px;font-size:12px;pointer-events:none;white-space:nowrap;
  border:1px solid rgba(255,255,255,.2)}
#craft-tooltip.hidden{display:none}
`;
  document.head.appendChild(style);
}
