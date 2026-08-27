// ui/statusUI.ts —— 心形血条 + 饥饿条 + 昼夜表盘 + 受击红晕（契约 §11/§13，任务 T64）
//
// 布局：
//   左下角 #status-panel     ：hunger 行（上、右对齐、row-reverse 镜像损耗）+ hearts 行（下）
//   右上角 #status-clock     ：圆形小表盘，内部 icon ☀/🌙 切换
//   全屏   #damage-vignette  ：受击红晕，opacity 0→0.5，300ms 过渡淡出
//
// 纯逻辑函数 heartsFor / drumsticksFor 导出供单测；DOM 渲染与本文件耦合的
// 回调绑定抽成 bindStatusEvents(bus, actions)，node 无 jsdom 也能验证订阅键与分发映射。

/**
 * 与 core/events.ts 泛型总线解耦的鸭子类型。
 * 注意：这里故意**不** import EventBus/GameEvents 具体类型，
 * EventBus<GameEvents>.on 按方法声明协变可直接赋给本接口。
 */
export interface BusLike {
  on(k: string, fn: (p: any) => void): () => void;
}

/** 图标状态：满 / 半 / 空 */
export type IconState = 'full' | 'half' | 'empty';

/** 一行图标数量（契约：hp/hunger 均为 0..20 → 10 格） */
export const MAX_ICONS = 10;
/** 点数上限 */
export const MAX_POINTS = 20;

/**
 * 点数 → 图标序列（长度恒为 MAX_ICONS）。
 *
 * 约定：索引 0 是「最后一命」（最耐用的一格），从高索引先耗：
 *   points=k → 前 floor(k/2) 个为 full，k 为奇数则紧跟一个 half，其余 empty。
 * 即 hearts 视觉上从右往左灭（左起第一颗最后消失），符合 MC 惯例。
 *
 * 边界：负数 clamp 0、>20 clamp 20、非整数 floor；NaN 视作 0，±Infinity clamp 到界。
 */
export function segmentsFor(points: number): IconState[] {
  let v = typeof points === 'number' ? points : NaN;
  if (!Number.isFinite(v)) v = v > 0 ? MAX_POINTS : 0; // NaN/-Infinity→0，+Infinity→20
  v = Math.floor(Math.max(0, Math.min(MAX_POINTS, v)));

  const out = new Array<IconState>(MAX_ICONS).fill('empty');
  for (let i = 0; i < MAX_ICONS; i++) {
    const left = v - i * 2; // 该格还剩多少点
    if (left >= 2) out[i] = 'full';
    else if (left === 1) out[i] = 'half';
    else break;
  }
  return out;
}

/** 血条：0..20 → 10 心（含半心），索引 0 最耐用（视觉最左）。 */
export function heartsFor(hp: number): IconState[] {
  return segmentsFor(hp);
}

/**
 * 饥饿条：与 hearts 同一套点数规则，但**视觉镜像**——索引 9 先耗且显示在最左侧
 * （渲染容器用 flex-direction:row-reverse 实现，纯函数仍按从左算）。
 */
export function drumsticksFor(v: number): IconState[] {
  return segmentsFor(v);
}

/** 组件对四类事件的反应动作（抽出以便无 DOM 单测绑定关系） */
export interface StatusActions {
  renderHearts(hp: number): void;
  renderHunger(v: number): void;
  setTimeIcon(isNight: boolean): void;
  flashDamage(amount?: number): void;
}

/** 本组件订阅的事件键清单（GameEvents，见 interfaces.md §11） */
export const STATUS_SUBSCRIBE_KEYS = ['hp', 'hunger', 'dayTick', 'damage'] as const;

/**
 * 事件订阅 → 动作分发的唯一实现。构造器委托它，测试直接喂 spy bus 断言。
 * 映射约定（interfaces.md §11 GameEvents）：
 *   hp:{v:number}        → renderHearts(v)
 *   hunger:{v:number}    → renderHunger(v)
 *   dayTick:{isNight}    → setTimeIcon(isNight)
 *   damage:{amount,from} → flashDamage(amount)（from 不用于 UI）
 */
export function bindStatusEvents(bus: BusLike, a: StatusActions): Array<() => void> {
  return [
    bus.on('hp', (p: { v: number }) => a.renderHearts(p.v)),
    bus.on('hunger', (p: { v: number }) => a.renderHunger(p.v)),
    bus.on('dayTick', (p: { isNight: boolean }) => a.setTimeIcon(p.isNight)),
    bus.on('damage', (p: { amount: number }) => a.flashDamage(p.amount)),
  ];
}

export class StatusUI implements StatusActions {
  private readonly root: HTMLElement; // #status-panel
  private readonly hearts: HTMLElement[] = [];
  private readonly sticks: HTMLElement[] = [];
  private readonly clockEl: HTMLElement; // #status-clock
  private readonly timeIcon: HTMLElement; // 表盘内的 ☀/🌙
  private readonly vignette: HTMLElement; // #damage-vignette
  private unsubs: Array<() => void>;
  private flashTimer: number | undefined;

  constructor(bus: BusLike, parent: HTMLElement) {
    injectStyle();

    // ---- 左下角面板：hunger 行在上、hearts 行在下 ----
    this.root = document.createElement('div');
    this.root.id = 'status-panel';

    const hungerRow = document.createElement('div');
    hungerRow.className = 'status-row status-hunger-row';
    const heartsRow = document.createElement('div');
    heartsRow.className = 'status-row status-hearts-row';

    // dataset.base 记住基础类名，applyStates 重刷 className 时据此还原
    for (let i = 0; i < MAX_ICONS; i++) {
      const stick = document.createElement('span');
      stick.dataset.base = 'drumstick';
      stick.className = 'drumstick empty'; // hunger 行 row-reverse：数组序号越大越靠左显示
      hungerRow.appendChild(stick);
      this.sticks.push(stick);

      const heart = document.createElement('span');
      heart.dataset.base = 'heart';
      heart.className = 'heart empty';
      heartsRow.appendChild(heart);
      this.hearts.push(heart);
    }

    this.root.appendChild(hungerRow);
    this.root.appendChild(heartsRow);

    // ---- 右上角昼夜表盘 ----
    this.clockEl = document.createElement('div');
    this.clockEl.id = 'status-clock';
    this.timeIcon = document.createElement('span');
    this.timeIcon.className = 'status-time-icon';
    this.timeIcon.textContent = '☀️'; // 默认白天 ☀️
    this.clockEl.appendChild(this.timeIcon);

    // ---- 受击红晕 ----
    this.vignette = document.createElement('div');
    this.vignette.id = 'damage-vignette';

    parent.appendChild(this.root);
    parent.appendChild(this.clockEl);
    parent.appendChild(this.vignette);

    // 初始满血满饥饿（事件只在变化时发，开局先给一个完整快照）
    this.renderHearts(MAX_POINTS);
    this.renderHunger(MAX_POINTS);

    this.unsubs = bindStatusEvents(bus, this);
  }

  /** 重绘 10 颗心（hp 0..20，支持半心 linear-gradient 左红右灰 + clip-path 心形） */
  renderHearts(hp: number): void {
    applyStates(this.hearts, heartsFor(hp));
  }

  /** 重绘 10 个鸡腿形图标（row-reverse 视觉镜像：损耗方向与 hearts 相反） */
  renderHunger(v: number): void {
    applyStates(this.sticks, drumsticksFor(v));
  }

  /** 昼夜图标切换：☀️ / 🌙（css 文本方案，不依赖 atlas canvas） */
  setTimeIcon(isNight: boolean): void {
    this.timeIcon.textContent = isNight ? '🌙' : '☀️';
    this.timeIcon.classList.toggle('night', isNight);
    this.clockEl.classList.toggle('night', isNight);
  }

  /** 受击红晕：加 .flash 使 opacity 升到 0.5，300ms 后移除（transition 淡出） */
  flashDamage(_amount?: number): void {
    this.vignette.classList.add('flash');
    if (this.flashTimer !== undefined) clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => {
      this.vignette.classList.remove('flash');
      this.flashTimer = undefined;
    }, 300);
  }

  /** 解绑全部事件并移除自建 DOM 节点（重复调用安全） */
  dispose(): void {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    if (this.flashTimer !== undefined) {
      clearTimeout(this.flashTimer);
      this.flashTimer = undefined;
    }
    this.vignette.remove();
    this.clockEl.remove();
    this.root.remove();
  }
}

/** 把 states 序列刷到对应 span 的 class 上（保留构造期写入的 dataset.base 基础类名） */
function applyStates(els: HTMLElement[], states: IconState[]): void {
  for (let i = 0; i < els.length && i < states.length; i++) {
    const el = els[i];
    el.className = `${el.dataset.base ?? ''} ${states[i]}`.trim();
  }
}

/**
 * 一次性注入本组件样式（style id=status-style 防重复注入，模式同 ui/hud.ts）。
 * 心形：红色块 + clip-path polygon 多边形近似心形；半心用 linear-gradient 左红右灰。
 */
function injectStyle(): void {
  if (document.getElementById('status-style')) return;
  const style = document.createElement('style');
  style.textContent = `
#status-panel{position:fixed;left:16px;bottom:12px;z-index:11;pointer-events:none;
  display:flex;flex-direction:column;align-items:flex-end;gap:5px;user-select:none}
#status-panel .status-row{display:flex;gap:3px}
/* hunger 在 hearts 上方、右对齐，row-reverse 让序号大的（先耗的）落在左边 */
#status-panel .status-hunger-row{flex-direction:row-reverse}
.heart,.drumstick{display:block;width:18px;height:18px;background:#3d3d47;
  filter:drop-shadow(0 1px 1px rgba(0,0,0,.65));box-sizing:border-box}
.drumstick{width:16px;height:16px;margin-top:2px;border-radius:58% 42% 45% 55%/62% 55% 45% 38%}
.heart{clip-path:polygon(50% 93%,44% 87%,33% 76%,17% 61%,7% 44%,5% 27%,12% 12%,26% 6%,
  38% 9%,50% 21%,62% 9%,74% 6%,88% 12%,95% 27%,93% 44%,83% 61%,67% 76%,56% 87%)}
.heart.full{background:linear-gradient(#ff5a52,#cf1d1d)}
.heart.half{background:linear-gradient(90deg,#f2423c 0 50%,#3d3d47 50% 100%)}
.heart.empty{opacity:.75}
.drumstick.full{background:linear-gradient(135deg,#cf8537,#8c4c14)}
.drumstick.full::after{content:'';display:block;width:5px;height:5px;margin-top:9px;margin-left:2px;
  border-radius:50%;background:#efe6d8}            /* 啃剩的小骨头头 */
.drumstick.half{background:linear-gradient(90deg,#bf7c31 0 50%,#3d3d47 50% 100%)}
.drumstick.empty{opacity:.75}
#status-clock{position:fixed;right:18px;top:16px;width:52px;height:52px;z-index:11;pointer-events:none;
  border-radius:50%;background:rgba(18,22,30,.62);border:2px solid rgba(255,255,255,.45);
  display:flex;align-items:center;justify-content:center;
  font-size:24px;line-height:1;text-shadow:0 1px 3px #000;transition:border-color .4s}
#status-clock.night{border-color:rgba(150,170,220,.6)}
#status-clock .status-time-icon{transform-origin:50% 60%;transition:transform .4s}
#status-clock.night .status-time-icon{transform:rotate(-18deg)}
#damage-vignette{position:fixed;inset:0;z-index:30;pointer-events:none;opacity:0;
  background:radial-gradient(ellipse at center,rgba(0,0,0,0) 40%,rgba(196,8,8,.9) 100%);
  transition:opacity .3s ease-out}
#damage-vignette.flash{opacity:.5}
`;
  style.id = 'status-style';
  document.head.appendChild(style);
}

/*
 * FIXME（依赖缺陷记录，非本文件文件所有权问题）：
 * 1) blocks/atlas.ts 目前只导出 buildAtlasCanvas(seed)，没有导出「单 tile → dataURL」的工具；
 *    任务书建议表盘 icon 可用 atlas tile 20/21 作背景图，如需像素风太阳/月亮需 atlas 侧补
 *    tileDataURL(tileIndex) 后再替换现在的 css 字形方案（不影响接口签名）。
 * 2) interfaces.md §11 GameEvents 只有变化型键（hp/hunger/dayTick），没有初始快照键；
 *    组件只能在构造时假设满血满饥饿。若玩家加载存档，需在 save/storage 加载完成后 emit
 *    一次 hp/hunger/dayTick 才能同步到 UI（建议在 W10 打磨期补一条契约说明即可，非阻塞）。
 * 3) hp/hunger 语义以整数点数计（0..20）已由 survival/stats 推定；若后续引入小数伤害
 *    （如 half-heart 以下精度），segmentsFor 会 floor——届时需要契约确认取整方向。
 */
