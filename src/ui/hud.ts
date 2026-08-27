// ui/hud.ts —— HUD DOM overlay：准星/热栏/toast（契约 §13）
// M1 限定：热栏为「无限方块模式」预置 6 种方块，W4 换真实 Inventory 驱动。

import { BLOCK } from '../blocks/registry';

export interface HotbarEntry {
  /** 展示名 */
  name: string;
  /** 可放置的方块 id；null 表示空手位 */
  blockId: number | null;
}

const PRESET: HotbarEntry[] = [
  { name: '草方块', blockId: BLOCK.GRASS },
  { name: '泥土', blockId: BLOCK.DIRT },
  { name: '石头', blockId: BLOCK.STONE },
  { name: '圆石', blockId: BLOCK.COBBLE },
  { name: '木板', blockId: BLOCK.PLANKS },
  { name: '玻璃', blockId: BLOCK.GLASS },
];

export class Hud {
  private root: HTMLElement;
  private slots: HTMLElement[] = [];
  private toastEl: HTMLElement;
  private toastTimer: number | undefined;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'hud';

    // 十字准星
    const crosshair = document.createElement('div');
    crosshair.id = 'crosshair';
    this.root.appendChild(crosshair);

    // 热栏（9 格，M1 预置 6 种 + 3 空手位）
    const bar = document.createElement('div');
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'hud-slot';
      slot.dataset.index = String(i);
      const entry = PRESET[i] ?? { name: '', blockId: null };
      if (entry.blockId !== null) {
        slot.textContent = entry.name.slice(0, 2);
        slot.title = entry.name;
      }
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
.hud-slot.active{border-color:#ffd75e;box-shadow:0 0 8px rgba(255,215,94,.7)}
#toast{position:absolute;left:50%;bottom:74px;transform:translateX(-50%);background:rgba(15,18,26,.78);
  color:#fff;padding:6px 14px;border-radius:6px;font-size:14px;opacity:0;transition:opacity .25s}
#toast.show{opacity:1}
#target-info{position:absolute;left:50%;top:56%;transform:translateX(-50%);color:#fff;font-size:12px;
  opacity:.75;text-shadow:0 1px 2px #000}
`;
  style.id = 'hud-style';
  document.head.appendChild(style);
}
