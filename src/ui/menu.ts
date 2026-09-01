// ui/menu.ts —— 主菜单 / 设置页 / 暂停页（W10 T104，契约 §13）
//
// 替代 main.ts 里 M3 版简易二选一遮罩 #first-run-mask：同款深色遮罩 + 金色标题，
// 信息更全（继续游戏、新世界、设置、暂停、操作说明折叠小字）。
//
// 页面状态机：
//   main   ：标题「迷你世界」+[继续游戏(hasSave 才显示)|新世界]+设置 —— 开局入口
//            └ confirm-new：存在旧档时点「新世界」先弹内嵌确认（替代 window.confirm）
//   settings：三个滑条（视距 3..8 chunks / 灵敏度 rad/px / 音量）+「完成」回到来源页；
//             任一滑条 input 即改即存（Settings.save）
//   pause  ：ESC 松开指针锁后进入；[继续游戏|设置|保存并退出到主菜单]
//
// 纯逻辑决策抽成模块级导出函数供 node 单测（模式同 statusUI 的 heartsFor）：
//   viewDistanceToFog(rd) / buttonsFor(hasSave)。DOM 行为不强测。
//
// 模块纯净性：只 import core/settings 与 core/constants（均无 DOM/three 依赖），
// 世界半径重构与雾联动由构造注入的 RuntimeLike.setViewDistance 在 main 侧实现。

import {
  DEFAULT_SETTINGS,
  SENSITIVITY_MAX,
  SENSITIVITY_MIN,
  VOLUME_MAX,
  VOLUME_MIN,
  VIEW_DISTANCE_MAX,
  VIEW_DISTANCE_MIN,
  Settings,
  type SettingsData,
} from '../core/settings';
import { FOG_FAR, FOG_NEAR } from '../core/constants';

// ---------------------------------------------------------------------------
// 纯逻辑决策（单测锚点）
// ---------------------------------------------------------------------------

/** 视距基准值：FOG_NEAR/FOG_FAR 常量按 RENDER_RADIUS_CHUNKS=6 标定 */
const REFERENCE_VIEW_DISTANCE = 6;

/**
 * 视距 → 雾距。视距变更时雾距按比例缩放：
 *   fogNear = FOG_NEAR × (rd / 6)，fogFar = FOG_FAR × (rd / 6)
 * 例：rd=6 → {near:78, far:92}；rd=3 → {near:39, far:46}
 * 输入先取整再钳制到 [3,8]，脏输入安全。
 */
export function viewDistanceToFog(rd: number): { near: number; far: number } {
  const clamped =
    Number.isFinite(rd) ? Math.min(VIEW_DISTANCE_MAX, Math.max(VIEW_DISTANCE_MIN, Math.round(rd))) : REFERENCE_VIEW_DISTANCE;
  const k = clamped / REFERENCE_VIEW_DISTANCE;
  return { near: Math.round(FOG_NEAR * k), far: Math.round(FOG_FAR * k) };
}

/** 主菜单按钮可见性决策：有档才给「继续游戏」，顺序恒为 continue 在前 */
export function buttonsFor(hasSave: boolean): Array<'continue' | 'new'> {
  return hasSave ? ['continue', 'new'] : ['new'];
}

// ---------------------------------------------------------------------------
// 鸭子类型
// ---------------------------------------------------------------------------

/** main 注入的运行时句柄：世界半径与雾联动在 main 的 setViewDistance 实现里闭环 */
export interface RuntimeLike {
  camera: { fov: number };
  setViewDistance(viewDistance: number): void;
  /** 可选：T103 音频系统就绪后由 main 注入，否则音量仅落盘 */
  setMasterVolume?(volume: number): void;
}

/** 菜单动作回调（main 接线注入） */
export interface MenuHooks {
  /** 是否存在有效存档（决定「继续游戏」是否出现） */
  hasSave(): boolean;
  /** 读最近存档进游戏；来自暂停页的「继续游戏」也走它（main 按上下文决定行为） */
  onContinue(): void;
  /** 清存档 + 随机 seed 开新世界（旧档存在时本组件先弹内嵌确认） */
  onNewWorld(): void;
  /** 可选：独立实例化冒烟用启动路径（渲染成第三个小按钮），不传则不显示 */
  onStartForTest?(): void;
  /** 可选：暂停页「保存并退出到主菜单」注入 saveGame 快照；不传则隐藏该按钮 */
  onSaveExit?(): void;
  /**
   * 可选扩展（超出任务卡，但向后兼容）：暂停页「继续游戏」的专用回调；
   * 缺省回落 onContinue。差异在于 main 可以只做「重锁指针」而不重读档。
   */
  onResume?(): void;
  /** 可选扩展：暂停页「重新开始本世界」（保留存档种子，重置时间/背包/位置到出生点）。
   *  与 onNewWorld（清档换种子）不同：这是「重玩当前世界」。不传则不显示该按钮。
   */
  onRestartWorld?(): void;
  /**
   * 可选扩展：「切换区域」——随时换地图（像素中国地图选区 → 清档重载进新区域）。
   * main 侧弹 regionPicker 并处理跨页面交接；不传则主菜单/暂停页不显示该按钮。
   */
  onSwitchRegion?(): void;
  /**
   * 可选扩展：装扮页四色/预设变化（即改即存由 main 负责）。不传则菜单只改本地
   * 表单状态（main 不接 UI 的场景，纯冒烟用）。
   */
  onCosmeticsChange?(c: {
    skin: string;
    shirt: string;
    pants: string;
    hair: string;
    preset: string;
  }): void;
  /** 可选：装扮页打开时回填当前四色（main 从 Cosmetics.load 取） */
  loadCosmetics?(): { skin: string; shirt: string; pants: string; hair: string };
}

// ---------------------------------------------------------------------------
// 页面滑条定义
// ---------------------------------------------------------------------------

type SliderKey = keyof SettingsData;

interface SliderSpec {
  key: SliderKey;
  label: string;
  min: number;
  max: number;
  step: number;
  fmt(v: number): string;
}

const SLIDER_SPECS: readonly SliderSpec[] = [
  {
    key: 'viewDistance',
    label: '视距',
    min: VIEW_DISTANCE_MIN,
    max: VIEW_DISTANCE_MAX,
    step: 1,
    fmt: (v) => `${v} 区块`,
  },
  {
    key: 'sensitivity',
    label: '鼠标灵敏度',
    min: SENSITIVITY_MIN,
    max: SENSITIVITY_MAX,
    step: 0.0001,
    fmt: (v) => v.toFixed(4),
  },
  {
    key: 'volume',
    label: '音量',
    min: VOLUME_MIN,
    max: VOLUME_MAX,
    step: 0.05,
    fmt: (v) => `${Math.round(v * 100)}%`,
  },
] as const;

/** 操作说明折叠小字内容（与 M3 遮罩的提示行一致并补全） */
const HELP_TEXT =
  'WASD 移动 · 空格跳跃 · Shift 疾跑 · 左键挖掘/攻击 · 右键放置/吃 · E 背包 · 数字键切换快捷栏 · P 手动保存';

type PageName = 'main' | 'settings' | 'pause' | 'confirm-new' | 'cosmetics';

/** 隐藏后重新上锁期间忽略 ESC 触发的宽限毫秒数（防止 resume 尚未生效时误弹暂停） */
const RESUME_GRACE_MS = 300;

export class MenuSystem {
  private readonly parent: HTMLElement;
  private readonly hooks: MenuHooks;

  /** 当前生效设置（构造时装载，滑条改动同步进来） */
  private data: SettingsData;
  /** 设置页来源页：「完成」与 settings 内按 ESC 回到这里 */
  private settingsReturnTo: PageName = 'main';
  private page: PageName | null = null;

  private readonly root: HTMLElement; // #menu-overlay
  private readonly cardEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly captionEl: HTMLElement;
  private readonly bodyEl: HTMLElement;

  /** 菜单打开瞬间的时间戳，用于 resume 宽限判定 */
  private resumedAtMs = -Infinity;

  // ---- 全局监听（dispose 时统一解绑）----
  private readonly onPointerLockChange = (): void => {
    if (document.pointerLockElement) return;
    if (this.isOpen()) return; // 面板已开着（本就处于暂停态）
    if (performance.now() - this.resumedAtMs < RESUME_GRACE_MS) return; // 刚 resume、锁定还没生效
    this.showPause();
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || !this.isOpen()) return;
    if (this.page === 'settings') {
      // settings 里按 ESC 等价于「完成」：回上一页且已即时落盘
      this.backFromSettings();
    }
  };

  constructor(parent: HTMLElement, hooks: MenuHooks) {
    this.parent = parent;
    this.hooks = hooks;
    injectStyle();

    this.root = document.createElement('div');
    this.root.id = 'menu-overlay';
    this.root.hidden = true; // 初始不占位，show* 时再展开

    this.cardEl = document.createElement('div');
    this.cardEl.className = 'menu-card';

    this.titleEl = document.createElement('h1');
    this.titleEl.className = 'menu-title';
    this.titleEl.textContent = '迷你世界';

    this.captionEl = document.createElement('p');
    this.captionEl.className = 'menu-caption';

    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'menu-body';

    const help = document.createElement('details');
    help.className = 'menu-help';
    help.innerHTML = `<summary>操作说明</summary><p>${HELP_TEXT}</p>`;

    this.cardEl.appendChild(this.titleEl);
    this.cardEl.appendChild(this.captionEl);
    this.cardEl.appendChild(this.bodyEl);
    this.cardEl.appendChild(help);
    this.root.appendChild(this.cardEl);

    // 事件委托：所有按钮带 data-action，一处分发；input 冒泡可用同一 root 监听
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('input', (e) => this.onInput(e));

    this.parent.appendChild(this.root);

    this.data = Settings.load();
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    window.addEventListener('keydown', this.onKeyDown);
  }

  // ---- 状态查询 ----

  isOpen(): boolean {
    return this.page !== null;
  }

  /** 当前页面名（main/settings/pause/confirm-new）；未打开为 null。接线层可用于互斥判断 */
  currentPage(): PageName | null {
    return this.page;
  }

  /** 只读视图：当前设置快照（深拷贝，防外部改坏内部状态） */
  getSettings(): SettingsData {
    return { ...this.data };
  }

  // ---- 页面切换 ----

  /** 主菜单：标题 + [继续游戏|新世界] + 设置 */
  showMain(): void {
    this.renderPage('main');
  }

  /** 设置页：三个滑条 + 完成。「完成」回到打开它的那一页（默认 main） */
  showSettings(returnTo: PageName = 'main'): void {
    this.settingsReturnTo = returnTo === 'settings' ? 'main' : returnTo;
    this.renderPage('settings');
  }

  /** 装扮页：四色板 + 预设。「完成」回到打开它的那一页（默认 main） */
  showCosmetics(returnTo: PageName = 'main'): void {
    this.settingsReturnTo = returnTo === 'cosmetics' ? 'main' : returnTo;
    this.renderPage('cosmetics');
  }

  /** ESC 暂停页：继续游戏（恢复指针锁）/ 设置 / 保存并退出到主菜单 */
  showPause(): void {
    this.renderPage('pause');
  }

  /** 收起面板（不改页面记忆）。接线层随后应自行重请求 pointer lock */
  hide(): void {
    this.page = null;
    this.root.hidden = true;
  }

  // ---- 设置应用 ----

  /**
   * 把一份设置推给运行时：视距经 runtime.setViewDistance 让 main 做世界半径重构 +
   * 按 viewDistanceToFog 缩放雾距；音量在有音频系统时一并下发。相机 fov 固定 75 不动。
   */
  applySettingsToRuntime(data: SettingsData, runtime: RuntimeLike): void {
    const rd = Math.min(
      VIEW_DISTANCE_MAX,
      Math.max(VIEW_DISTANCE_MIN, Math.round(Number.isFinite(data.viewDistance) ? data.viewDistance : DEFAULT_SETTINGS.viewDistance)),
    );
    runtime.setViewDistance(rd);
    runtime.setMasterVolume?.(
      Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, Number.isFinite(data.volume) ? data.volume : DEFAULT_SETTINGS.volume)),
    );
  }

  // ---- 生命周期 ----

  /** 移除全部全局监听与自建 DOM。style 节点保留复用（id 幂等）。重复调用安全 */
  dispose(): void {
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    window.removeEventListener('keydown', this.onKeyDown);
    this.root.remove();
    this.page = null;
  }

  // ---- 内部：渲染 ----

  private renderPage(page: PageName): void {
    this.page = page;
    this.root.hidden = false;
    switch (page) {
      case 'main':
        this.titleEl.textContent = '迷你世界';
        this.captionEl.textContent = '';
        this.bodyEl.replaceChildren(...this.buildMainButtons());
        break;
      case 'settings':
        this.titleEl.textContent = '设置';
        this.captionEl.textContent = '调整会立即保存';
        this.bodyEl.replaceChildren(...this.buildSettingsBody());
        break;
      case 'pause':
        this.titleEl.textContent = '已暂停';
        this.captionEl.textContent = '';
        this.bodyEl.replaceChildren(...this.buildPauseButtons());
        break;
      case 'confirm-new':
        this.titleEl.textContent = '新世界';
        this.captionEl.textContent = '';
        this.bodyEl.replaceChildren(...this.buildConfirmBody());
        break;
      case 'cosmetics':
        this.titleEl.textContent = '装扮';
        this.captionEl.textContent = '颜色即改即存，第三人称（V 键）可见';
        this.bodyEl.replaceChildren(...this.buildCosmeticsBody());
        break;
    }
  }

  private makeButton(label: string, action: string, variant: 'primary' | 'ghost' = 'primary'): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `menu-btn${variant === 'ghost' ? ' menu-btn-ghost' : ''}`;
    b.dataset.action = action;
    b.textContent = label;
    return b;
  }

  private buildMainButtons(): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const kind of buttonsFor(this.hooks.hasSave())) {
      out.push(kind === 'continue' ? this.makeButton('继续游戏', 'continue') : this.makeButton('新世界', 'new'));
    }
    if (this.hooks.onSwitchRegion) out.push(this.makeButton('切 换 区 域', 'switch-region'));
    out.push(this.makeButton('设 置', 'settings'));
    out.push(this.makeButton('扮 装', 'cosmetics'));
    if (this.hooks.onStartForTest) out.push(this.makeButton('开始（测试）', 'start-test', 'ghost'));
    return out;
  }

  private buildPauseButtons(): HTMLElement[] {
    const out: HTMLElement[] = [];
    out.push(this.makeButton('继续游戏', this.hooks.onResume ? 'resume' : 'continue'));
    out.push(this.makeButton('设 置', 'settings-from-pause'));
    out.push(this.makeButton('扮 装', 'cosmetics-from-pause'));
    if (this.hooks.onSwitchRegion) out.push(this.makeButton('切换区域', 'switch-region'));
    if (this.hooks.onRestartWorld) out.push(this.makeButton('重新开始本世界', 'restart-world', 'ghost'));
    if (this.hooks.onSaveExit) out.push(this.makeButton('保存并退出到主菜单', 'save-exit', 'ghost'));
    return out;
  }

  /** 装扮页：四个部位色板 + 预设按钮行 + 完成 */
  private buildCosmeticsBody(): HTMLElement[] {
    const cur = this.hooks.loadCosmetics?.() ?? { skin: '#e0b088', shirt: '#3a7bd5', pants: '#35415e', hair: '#4a3220' };
    const wrap: HTMLElement[] = [];

    for (const [part, label] of [
      ['skin', '肤色'],
      ['shirt', '上衣'],
      ['pants', '裤子'],
      ['hair', '头发'],
    ] as const) {
      const row = document.createElement('label');
      row.className = 'menu-slider-row';
      const head = document.createElement('span');
      head.className = 'menu-slider-head';
      const name = document.createElement('span');
      name.className = 'menu-slider-label';
      name.textContent = label;
      const val = document.createElement('span');
      val.className = 'menu-slider-value';
      val.textContent = cur[part];
      head.appendChild(name);
      head.appendChild(val);

      const input = document.createElement('input');
      input.type = 'color';
      input.className = 'menu-color';
      input.dataset.color = part;
      input.value = cur[part];

      row.appendChild(head);
      row.appendChild(input);
      wrap.push(row);
    }

    const presetRow = document.createElement('div');
    presetRow.className = 'menu-row';
    for (const [key, name] of [
      ['default', '经典'],
      ['wheat', '小麦'],
      ['night', '暗夜'],
      ['forest', '森语'],
    ] as const) {
      const b = this.makeButton(name, `preset-${key}`, 'ghost');
      b.style.width = '72px';
      b.style.padding = '6px 0';
      presetRow.appendChild(b);
    }
    wrap.push(presetRow);

    wrap.push(this.makeButton('完 成', 'done'));
    return wrap;
  }

  private buildConfirmBody(): HTMLElement[] {
    const p = document.createElement('p');
    p.className = 'menu-confirm-text';
    p.textContent = '检测到已有存档——开新世界会清空它，确定吗？';
    const row = document.createElement('div');
    row.className = 'menu-row';
    row.appendChild(this.makeButton('确 定', 'confirm-new'));
    row.appendChild(this.makeButton('取 消', 'cancel-new', 'ghost'));
    return [p, row];
  }

  private buildSettingsBody(): HTMLElement[] {
    const wrap: HTMLElement[] = [];
    for (const spec of SLIDER_SPECS) {
      const row = document.createElement('label');
      row.className = 'menu-slider-row';

      const head = document.createElement('span');
      head.className = 'menu-slider-head';
      const name = document.createElement('span');
      name.className = 'menu-slider-label';
      name.textContent = spec.label;
      const val = document.createElement('span');
      val.className = 'menu-slider-value';
      val.id = `menu-val-${spec.key}`;
      val.textContent = spec.fmt(this.data[spec.key]);
      head.appendChild(name);
      head.appendChild(val);

      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'menu-slider';
      input.dataset.key = spec.key;
      input.id = `menu-slider-${spec.key}`;
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = String(spec.step);
      input.value = String(this.data[spec.key]);

      row.appendChild(head);
      row.appendChild(input);
      wrap.push(row);
    }

    const done = this.makeButton('完 成', 'done');
    wrap.push(done);
    return wrap;
  }

  // ---- 内部：事件分发 ----

  private onClick(ev: Event): void {
    const target = ev.target as HTMLElement | null;
    const btn = target?.closest<HTMLButtonElement>('button[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'continue':
        this.hide();
        this.markResume();
        this.hooks.onContinue();
        break;
      case 'resume':
        this.hide();
        this.markResume();
        this.hooks.onResume!(); // buildPauseButtons 保证仅在注入了该钩子时才发出此 action
        break;
      case 'new':
        // 有旧档先确认；无旧档直接开新世界
        if (this.hooks.hasSave()) this.renderPage('confirm-new');
        else this.startNewWorld();
        break;
      case 'confirm-new':
        this.startNewWorld();
        break;
      case 'cancel-new':
        this.renderPage('main');
        break;
      case 'settings':
        this.showSettings('main');
        break;
      case 'settings-from-pause':
        this.showSettings('pause');
        break;
      case 'cosmetics':
        this.showCosmetics('main');
        break;
      case 'cosmetics-from-pause':
        this.showCosmetics('pause');
        break;
      case 'done':
        this.backFromSettings();
        break;
      case 'save-exit':
        this.hide();
        this.hooks.onSaveExit?.();
        break;
      case 'restart-world':
        this.hide();
        this.markResume();
        this.hooks.onRestartWorld!(); // buildPauseButtons 保证仅在注入了该钩子时才可达
        break;
      case 'switch-region':
        // 切换区域：收起菜单 → main 侧弹选区地图（选定后清档重载，不回到游戏）
        this.hide();
        this.markResume();
        this.hooks.onSwitchRegion?.();
        break;
      case 'start-test':
        this.hide();
        this.markResume();
        this.hooks.onStartForTest!(); // 仅在 buildMainButtons 渲染该按钮时可达
        break;
      default:
        // 装扮预设按钮：data-action = "preset-<key>"
        if (btn.dataset.action?.startsWith('preset-')) {
          this.applyPreset(btn.dataset.action.slice('preset-'.length));
        }
        break;
    }
  }

  private onInput(ev: Event): void {
    const target = ev.target as HTMLInputElement | null;
    if (!target) return;
    // 装扮色板（type=color，data-color 标识部位）
    if (target.dataset.color !== undefined && target instanceof HTMLInputElement) {
      this.applyColor(target.dataset.color, target.value, target);
      return;
    }
    if (target.dataset.key === undefined) return;
    const spec = SLIDER_SPECS.find((s) => s.key === target.dataset.key);
    if (!spec) return;

    const raw = Number(target.value);
    // 输入即规范化 + 落盘（变更即存）
    const next: SettingsData = { ...this.data, [spec.key]: raw };
    this.data = normalizeLocal(next);
    target.value = String(this.data[spec.key]);
    const valEl = this.bodyEl.querySelector<HTMLElement>(`#menu-val-${spec.key}`);
    if (valEl) valEl.textContent = spec.fmt(this.data[spec.key]);
    Settings.save(this.data);
  }

  private startNewWorld(): void {
    this.hide();
    this.markResume();
    this.hooks.onNewWorld();
  }

  private backFromSettings(): void {
    const dest = this.settingsReturnTo;
    if (dest === 'pause') this.showPause();
    else if (dest === 'cosmetics') this.showCosmetics('main');
    else this.showMain();
  }

  /** 装扮：应用预设（展开四色到表单 + 回调） */
  private applyPreset(key: string): void {
    const presets: Record<string, { skin: string; shirt: string; pants: string; hair: string }> = {
      default: { skin: '#e0b088', shirt: '#3a7bd5', pants: '#35415e', hair: '#4a3220' },
      wheat: { skin: '#f2d5b0', shirt: '#c98f4a', pants: '#7a5c34', hair: '#d8b46a' },
      night: { skin: '#8a5a3c', shirt: '#2c3342', pants: '#1c222e', hair: '#141414' },
      forest: { skin: '#e8c49c', shirt: '#3f7f46', pants: '#4a3a28', hair: '#5c3a1e' },
    };
    const p = presets[key];
    if (!p || this.page !== 'cosmetics') return;
    for (const part of ['skin', 'shirt', 'pants', 'hair'] as const) {
      const input = this.bodyEl.querySelector<HTMLInputElement>(`input[data-color="${part}"]`);
      if (input) input.value = p[part];
      const val = this.bodyEl.querySelector<HTMLElement>(`#menu-val-${part}`) ??
        this.bodyEl.querySelectorAll('.menu-slider-value')[['skin', 'shirt', 'pants', 'hair'].indexOf(part)];
      if (val) val.textContent = p[part];
    }
    this.hooks.onCosmeticsChange?.({ ...p, preset: key });
  }

  /** 装扮：单色变化（color input 即改即回调，preset 置 custom——不在预设表，normalize 会回落） */
  private applyColor(part: string, value: string, input: HTMLInputElement): void {
    if (this.page !== 'cosmetics') return;
    if (!/#[0-9a-fA-F]{6}/.test(value)) return;
    const cur = this.hooks.loadCosmetics?.() ?? {
      skin: input.value,
      shirt: input.value,
      pants: input.value,
      hair: input.value,
    };
    const next = {
      skin: part === 'skin' ? value : cur.skin,
      shirt: part === 'shirt' ? value : cur.shirt,
      pants: part === 'pants' ? value : cur.pants,
      hair: part === 'hair' ? value : cur.hair,
      preset: 'custom',
    };
    // 值回显
    const idx = ['skin', 'shirt', 'pants', 'hair'].indexOf(part);
    const val = this.bodyEl.querySelectorAll('.menu-slider-value')[idx];
    if (val) val.textContent = value;
    this.hooks.onCosmeticsChange?.(next);
  }

  /** 从面板回到游戏：记下时间戳，让随之而来的 pointerlockchange（尚无锁定）不误触发暂停 */
  private markResume(): void {
    this.resumedAtMs = performance.now();
  }
}

/** 本地钳制（阈值唯一出处是 core/settings 的常量；复用其 normalize 以保持口径一致） */
function normalizeLocal(d: SettingsData): SettingsData {
  // Settings.normalize 未导出；此处以 roundtrip save/load 同款规则手写最薄版本，
  // 只是展示层兜底——真正权威仍是 Settings.save 里的 normalizeSettings。
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    viewDistance: clamp(Math.round(Number.isFinite(d.viewDistance) ? d.viewDistance : DEFAULT_SETTINGS.viewDistance), VIEW_DISTANCE_MIN, VIEW_DISTANCE_MAX),
    sensitivity: clamp(Number.isFinite(d.sensitivity) ? d.sensitivity : DEFAULT_SETTINGS.sensitivity, SENSITIVITY_MIN, SENSITIVITY_MAX),
    volume: clamp(Number.isFinite(d.volume) ? d.volume : DEFAULT_SETTINGS.volume, VOLUME_MIN, VOLUME_MAX),
  };
}

// ---------------------------------------------------------------------------
// 样式（id 幂等注入）
// ---------------------------------------------------------------------------

function injectStyle(): void {
  if (document.getElementById('menu-style')) return;
  const style = document.createElement('style');
  style.textContent = `
#menu-overlay{position:fixed;inset:0;z-index:60;background:rgba(8,10,16,.86);
  display:flex;align-items:center;justify-content:center;font-family:sans-serif;user-select:none}
#menu-overlay[hidden]{display:none}
#menu-overlay .menu-card{text-align:center;color:#fff;background:rgba(16,20,28,.72);
  border:1px solid rgba(255,215,94,.25);border-radius:12px;padding:28px 44px 20px;
  min-width:320px;max-width:520px;box-shadow:0 18px 48px rgba(0,0,0,.55)}
#menu-overlay .menu-title{font-size:42px;margin:0 0 6px;color:#ffd75e;
  text-shadow:0 2px 10px rgba(255,180,40,.35)}
#menu-overlay .menu-caption{margin:0 0 14px;color:#9aa4b2;font-size:13px}
#menu-overlay .menu-body{display:flex;flex-direction:column;gap:10px;align-items:center}
#menu-overlay .menu-btn{font-size:17px;padding:9px 30px;border-radius:6px;border:0;cursor:pointer;
  background:#ffd75e;color:#33303a;font-weight:bold;width:220px}
#menu-overlay .menu-btn:hover{filter:brightness(1.08)}
#menu-overlay .menu-btn-ghost{background:#2c3342;color:#d7dee8;font-weight:normal;border:1px solid rgba(255,255,255,.18)}
#menu-overlay .menu-row{display:flex;gap:10px}
#menu-overlay .menu-confirm-text{margin:0 0 4px;font-size:15px;line-height:1.6}
#menu-overlay .menu-slider-row{display:flex;flex-direction:column;gap:4px;width:260px;text-align:left}
#menu-overlay .menu-slider-head{display:flex;justify-content:space-between;align-items:baseline}
#menu-overlay .menu-slider-label{font-size:14px;color:#d7dee8}
#menu-overlay .menu-slider-value{font-size:13px;color:#ffd75e;font-variant-numeric:tabular-nums}
#menu-overlay .menu-slider{width:100%;accent-color:#ffd75e;cursor:pointer}
#menu-overlay .menu-help{margin-top:16px;text-align:left;color:#8f99a8;font-size:12px}
#menu-overlay .menu-help summary{cursor:pointer;color:#aab4c2}
#menu-overlay .menu-help p{margin:6px 0 0;line-height:1.7}
`;
  style.id = 'menu-style';
  document.head.appendChild(style);
}

/*
 * FIXME（依赖缺陷 / 契约缺口记录，待主线程裁决）：
 * 1) player/controller.ts 的 MOUSE_SENS 是私有常量（0.0022）且无注入口——灵敏度设置
 *    目前只能落盘，玩家视角实际不变。需要 controller 提供 setSensitivity()/可写字段，
 *    属他人文件所有权，未越权修改。
 * 2) audio/audio.ts（T103 并发波次）仓库中尚不存在，音量经 RuntimeLike.setMasterVolume?
 *    下发，若 main 未实现该方法则静默跳过（duck 可选方法）。
 * 3) 任务卡原文 MenuSystem(onStart:(seed:string, loadSave:boolean)=>void) 与父任务下发的
 *    规格（hasSave/onContinue/onNewWorld 三钩子 + onViewdistance Fog 缩放）不一致；
 *    采用后者，随机 seed 的产生与 clearSave 调用在 main 的 onNewWorld 闭包内完成，
 *    本组件不触碰 save/storage（避免与新世界流程耦合）。
 * 4) interfaces.md §1 注释「RENDER_RADIUS_CHUNKS 可被设置页修改」暗示可在运行期改导出常量
 *    ——ESM 导出绑定不可写，实际路径只能是 main 维护可变运行值并以 setViewDistance 注入。
 *    契约表述建议下一轮修订为「运行期有效视距由 Settings 提供，常量仅作默认/标定基准」。
 */
