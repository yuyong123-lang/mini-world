// ui/hud.ts —— HUD DOM overlay：准星/热栏/toast（契约 §13）
// 热栏由真实 Inventory 驱动（W11 修正：M1 的写死预设已废弃）。

import { ItemRegistry } from '../items/items';
import type { Inventory } from '../items/inventory';

const SLOT_EMPTY_LABEL = '';

export class Hud {
  private root: HTMLElement;
  private slots: HTMLElement[] = [];
  private toastEl: HTMLElement;
  private toastTimer: number | undefined;

  constructor(
    parent: HTMLElement,
    private inv?: Inventory,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'hud';

    // 十字准星
    const crosshair = document.createElement('div');
    crosshair.id = 'crosshair';
    this.root.appendChild(crosshair);

    // 热栏（9 格横排；内容由 renderHotbar 用真实背包驱动）
    const bar = document.createElement('div');
    bar.className = 'bar';
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'hud-slot';
      slot.dataset.index = String(i);
      bar.appendChild(slot);
      this.slots.push(slot);
    }
    this.root.appendChild(bar);

    // toast 区
    this.toastEl = document.createElement('div');
    this.toastEl.id = 'toast';
    this.root.appendChild(this.toastEl);

    injectStyle();
    parent.appendChild(this.root);
  }

  /** 用背包 0..8 槽刷新热栏内容（名称缩写 + 数量角标） */
  renderHotbar(): void {
    if (!this.inv) return;
    this.slots.forEach((slot, i) => {
      const s = this.inv!.slots[i];
      if (!s) {
        slot.textContent = SLOT_EMPTY_LABEL;
        slot.title = '';
        const old = slot.querySelector('.cnt');
        if (old) old.remove();
        return;
      }
      const name = ItemRegistry.has(s.key) ? ItemRegistry.get(s.key).name : s.key;
      slot.textContent = name.slice(0, 2);
      slot.title = `${name} ×${s.count}`;
      let cnt = slot.querySelector<HTMLElement>('.cnt');
      if (!cnt) {
        cnt = document.createElement('span');
        cnt.className = 'cnt';
        slot.appendChild(cnt);
      }
      cnt.textContent = String(s.count);
    });
  }

  /** 当前选中槽位高亮刷新 */
  setHotbarIndex(i: number): void {
    this.slots.forEach((s, idx) => s.classList.toggle('active', idx === i));
  }

  /** 准星指向方块名（或空）——M1 简易信息行 */
  setTargetName(name: string): void {
    let info = this.root.querySelector<HTMLElement>('#target-info');
    if (!info) {
      info = document.createElement('div');
      info.id = 'target-info';
      this.root.appendChild(info);
    }
    info.textContent = name;
  }

  showToast(msg: string, ms = 1800): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, ms);
  }
}

/** 一次性注入 HUD 样式（局部化处理避免另开 css 文件——W10 打磨期再整理） */
function injectStyle(): void {
  if (document.getElementById('hud-style')) return;
  const style = document.createElement('style');
  style.textContent = `
#hud{position:fixed;inset:0;pointer-events:none;z-index:10;font-family:sans-serif}
#crosshair{position:absolute;left:50%;top:50%;width:18px;height:18px;transform:translate(-50%,-50%)}
#crosshair::before,#crosshair::after{content:'';position:absolute;background:#fff;opacity:.85;mix-blend-mode:difference}
#crosshair::before{left:8px;top:2px;width:2px;height:14px}
#crosshair::after{left:2px;top:8px;width:14px;height:2px}
#hud .bar{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;gap:4px}
.hud-slot{width:44px;height:44px;border:2px solid rgba(255,255,255,.5);background:rgba(20,24,32,.55);
  display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;text-shadow:0 1px 2px #000;
  border-radius:4px;box-sizing:border-box}
.hud-slot{position:relative}
.hud-slot.active{border-color:#ffd75e;box-shadow:0 0 8px rgba(255,215,94,.7)}
.hud-slot .cnt{position:absolute;right:3px;bottom:1px;font-size:11px;color:#fff;text-shadow:0 1px 2px #000}
#toast{position:absolute;left:50%;bottom:74px;transform:translateX(-50%);background:rgba(15,18,26,.78);
  color:#fff;padding:6px 14px;border-radius:6px;font-size:14px;opacity:0;transition:opacity .25s}
#toast.show{opacity:1}
#target-info{position:absolute;left:50%;top:56%;transform:translateX(-50%);color:#fff;font-size:12px;
  opacity:.75;text-shadow:0 1px 2px #000}
`;
  style.id = 'hud-style';
  document.head.appendChild(style);
}
