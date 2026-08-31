// ui/hud.ts —— HUD DOM overlay：准星/热栏/toast（契约 §13）
// 热栏由真实 Inventory 驱动（W11 修正：M1 的写死预设已废弃）。

import { ItemRegistry } from '../items/items';
import type { Inventory } from '../items/inventory';
import type { ItemStack } from '../core/types';

export class Hud {
  private root: HTMLElement;
  private slots: HTMLElement[] = [];
  private toastEl: HTMLElement;
  private toastTimer: number | undefined;
  /** 可注入的图标渲染器；缺省保留「名字缩写」文字模式（node 测试/未接线时） */
  private iconRenderer?: (el: HTMLElement, stack: ItemStack | null) => void;
  /** 弓蓄力条元素（构造时创建） */
  private readonly bowBarEl: HTMLElement;
  private readonly bowBarFillEl: HTMLElement;
  /** 被击生物血条元素（构造时创建） */
  private readonly mobHealthEl: HTMLElement;
  private readonly mobHealthNameEl: HTMLElement;
  private readonly mobHealthFillEl: HTMLElement;
  private readonly mobHealthNumEl: HTMLElement;

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

    // 弓蓄力条（底部细条，拉弓时出现）
    const bowBar = document.createElement('div');
    bowBar.id = 'bow-bar';
    const bowFill = document.createElement('div');
    bowFill.id = 'bow-bar-fill';
    bowBar.appendChild(bowFill);
    this.root.appendChild(bowBar);
    this.bowBarEl = bowBar;
    this.bowBarFillEl = bowFill;

    // 被攻击生物的血条（准星下方，攻击命中后短暂显示）
    const mobHealth = document.createElement('div');
    mobHealth.id = 'mob-health';
    mobHealth.classList.add('hidden');
    const mobName = document.createElement('div');
    mobName.id = 'mob-health-name';
    const mobBar = document.createElement('div');
    mobBar.id = 'mob-health-bar';
    const mobFill = document.createElement('div');
    mobFill.id = 'mob-health-fill';
    mobBar.appendChild(mobFill);
    mobHealth.appendChild(mobName);
    mobHealth.appendChild(mobBar);
    const mobNum = document.createElement('div');
    mobNum.id = 'mob-health-num';
    mobHealth.appendChild(mobNum);
    this.root.appendChild(mobHealth);
    this.mobHealthEl = mobHealth;
    this.mobHealthNameEl = mobName;
    this.mobHealthFillEl = mobFill;
    this.mobHealthNumEl = mobNum;

    injectStyle();
    parent.appendChild(this.root);
  }

  /**
   * 显示被击中生物的剩余血量（准星下方）。name 传 null 隐藏。
   * 持续显示由调用方控制（每帧刷新数值；超时/死亡由调用方置 null）。
   */
  setMobHealth(name: string | null, hp?: number, maxHp?: number): void {
    if (name === null) {
      this.mobHealthEl.classList.add('hidden');
      return;
    }
    this.mobHealthEl.classList.remove('hidden');
    this.mobHealthNameEl.textContent = name;
    const ratio = maxHp && maxHp > 0 ? Math.max(0, Math.min(1, hp! / maxHp)) : 0;
    this.mobHealthFillEl.style.width = `${Math.round(ratio * 100)}%`;
    this.mobHealthFillEl.classList.toggle('low', ratio <= 0.3);
    const hpShow = Number.isFinite(hp) ? Math.ceil(hp!) : 0;
    const maxShow = Number.isFinite(maxHp) ? Math.round(maxHp!) : 0;
    this.mobHealthNumEl.textContent = `${hpShow} / ${maxShow}`;
  }

  /** 弓蓄力条：0..1 显示填充；null 隐藏 */
  setBowCharge(charge: number | null): void {
    if (charge === null) {
      this.bowBarEl.classList.remove('show');
      return;
    }
    this.bowBarEl.classList.add('show');
    this.bowBarFillEl.style.width = `${Math.round(Math.max(0, Math.min(1, charge)) * 100)}%`;
    this.bowBarFillEl.classList.toggle('full', charge >= 1);
  }

  /** 注入图标渲染器（与 inventoryUI 的 IconRenderer 同形）；不注入则用名字缩写 */
  setIconRenderer(fn: (el: HTMLElement, stack: ItemStack | null) => void): void {
    this.iconRenderer = fn;
  }

  /** 用背包 0..8 槽刷新热栏内容（图标/名称缩写 + 数量角标） */
  renderHotbar(): void {
    if (!this.inv) return;
    this.slots.forEach((slot, i) => {
      const s = this.inv!.slots[i];
      // 全量重建槽内内容：图标 canvas 由渲染器追加，必须先清空旧节点
      slot.textContent = '';
      if (!s) {
        slot.title = '';
        return;
      }
      const name = ItemRegistry.has(s.key) ? ItemRegistry.get(s.key).name : s.key;
      if (this.iconRenderer) {
        this.iconRenderer(slot, s);
      } else {
        const label = document.createElement('span');
        label.textContent = name.slice(0, 2);
        slot.appendChild(label);
      }
      slot.title = `${name} ×${s.count}`;
      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = String(s.count);
      slot.appendChild(cnt);
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
#bow-bar{position:absolute;left:50%;bottom:12%;transform:translateX(-50%);width:180px;height:8px;
  background:rgba(255,255,255,.15);border-radius:4px;overflow:hidden;opacity:0;transition:opacity .1s;
  border:1px solid rgba(255,255,255,.25)}
#bow-bar.show{opacity:1}
#bow-bar-fill{height:100%;width:0;background:linear-gradient(90deg,#ffd75e,#ff8833)}
#bow-bar-fill.full{background:#7fff6a}
#mob-health{position:absolute;left:50%;top:60%;transform:translateX(-50%);text-align:center;
  pointer-events:none}
#mob-health.hidden{display:none}
#mob-health-name{font-size:13px;color:#fff;text-shadow:0 1px 3px #000;margin-bottom:3px}
#mob-health-bar{width:140px;height:8px;background:rgba(0,0,0,.55);border-radius:4px;overflow:hidden;
  border:1px solid rgba(255,255,255,.35)}
#mob-health-fill{height:100%;width:100%;background:linear-gradient(90deg,#e04a4a,#ff7a6a);
  transition:width .15s}
#mob-health-fill.low{background:#a01818}
#mob-health-num{font-size:11px;color:#ffd9d9;text-shadow:0 1px 2px #000;margin-top:2px}
#target-info{position:absolute;left:50%;top:56%;transform:translateX(-50%);color:#fff;font-size:12px;
  opacity:.75;text-shadow:0 1px 2px #000}
`;
  style.id = 'hud-style';
  document.head.appendChild(style);
}
