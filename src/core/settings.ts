// core/settings.ts —— 全局设置持久化（W10 T104，契约 §13）
//
// 存储：localStorage 单键 'my_world_settings_v1'，JSON 扁平三字段（含版本号）。
// 存储获取方式与 save/storage.ts 同款「optional-storage 注入」模式：
//   · 浏览器调用省略参数（默认 globalThis.localStorage）
//   · node 测试注入内存 stub（见 tests/settings.test.ts 的 memoryStorage）
//   · 无显式注入且环境中不存在 localStorage 时：load 回落默认值、save 返 false
//
// 容错策略（任务卡：逐字段 clamp 校验）：设置**永不整体作废**——
//   单个字段缺失/类型错误 → 该字段回落默认值；数值越界 → 钳制到合法区间。
//   只有整个键读不出来（JSON 损坏 / getItem 抛异常）才整体回到 DEFAULT_SETTINGS。
// 永不抛出，与 storage.ts 的容错口径一致。
//
// 模块纯净性：不 import three / World / DOM，纯 node 可测。

/** localStorage 键 */
export const SETTINGS_KEY = 'my_world_settings_v1';

/** 写入 payload 顶层版本号；载入时不匹配仅告警并尽力逐字段兼容（设置不像存档那样致命） */
const SETTINGS_VERSION = 1;

// ---- 字段边界（设置页滑条的 min/max/step 与运行期钳制的唯一出处）----

export const VIEW_DISTANCE_MIN = 3; // 区块
export const VIEW_DISTANCE_MAX = 8; // 区块

export const SENSITIVITY_MIN = 0.0005; // rad/px
export const SENSITIVITY_MAX = 0.005; // rad/px
export const SENSITIVITY_STEP = 0.0001; // rad/px

export const VOLUME_MIN = 0;
export const VOLUME_MAX = 1;
export const VOLUME_STEP = 0.05;

/** 一份完整设置快照 */
export interface SettingsData {
  /** 渲染视距（chunks，整数 3..8）；变更需触发世界半径重构并联动雾距 */
  viewDistance: number;
  /** 鼠标灵敏度（rad/px，0.0005..0.005），默认同 player/controller 的 0.0022 */
  sensitivity: number;
  /** 主音量（0..1） */
  volume: number;
}

/** 默认设置（只读冻结）。 */
export const DEFAULT_SETTINGS: SettingsData = Object.freeze({
  viewDistance: 6,
  sensitivity: 0.0022,
  volume: 0.5,
});

/** unknown → 数值；非有限数一律回落 fallback */
function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * 逐字段规范化：非法字段回落默认值、越界字段钳制到区间。
 * 另做步长量化（灵敏度 1e-4 / 音量 1e-2），消除滑条连续取值带来的浮点漂移，
 * 使 save→load 的深相等稳定成立。
 */
export function normalizeSettings(input: unknown): SettingsData {
  const o: Record<string, unknown> =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};

  // 视距：四舍五入成整数区块后再钳制（99 → 8）
  const rawRd = Math.round(numOr(o.viewDistance, DEFAULT_SETTINGS.viewDistance));
  const viewDistance = Math.min(VIEW_DISTANCE_MAX, Math.max(VIEW_DISTANCE_MIN, rawRd));

  // 灵敏度：量化到 0.0001 再钳制
  const qs = Math.round(numOr(o.sensitivity, DEFAULT_SETTINGS.sensitivity) * 10000) / 10000;
  const sensitivity = Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, qs));

  // 音量：量化到 0.01 再钳制（-1 → 0）
  const qv = Math.round(numOr(o.volume, DEFAULT_SETTINGS.volume) * 100) / 100;
  const volume = Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, qv));

  return { viewDistance, sensitivity, volume };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 解析实际使用的 Storage（模式同 save/storage.ts）。
 * node 测试注入内存 stub；无显式注入且环境无 localStorage 时返回 null。
 */
function resolveStorage(explicit?: Storage): Storage | null {
  if (explicit) return explicit;
  const injected = (globalThis as { localStorage?: Storage | null }).localStorage;
  if (!injected) {
    console.warn('[settings] 当前环境无可用的 localStorage，设置不可用');
    return null;
  }
  return injected;
}

/** 静态门面：契约 §13 形态（无实例状态，全部走即时读写） */
export class Settings {
  /**
   * 读取设置。缺档 / JSON 损坏 / getItem 抛异常 → 整体回落 DEFAULT_SETTINGS；
   * 可解析但单项异常 → 该字段回落或钳制（normalizeSettings）。永不抛出。
   */
  static load(storage?: Storage): SettingsData {
    const store = resolveStorage(storage);
    if (!store) return { ...DEFAULT_SETTINGS };

    let raw: string | null;
    try {
      raw = store.getItem(SETTINGS_KEY);
    } catch (err) {
      console.warn('[settings] 读取设置失败，已回落默认值', err);
      return { ...DEFAULT_SETTINGS };
    }
    if (!raw) return { ...DEFAULT_SETTINGS };

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      console.warn('[settings] 设置数据不是合法 JSON，已回落默认值');
      return { ...DEFAULT_SETTINGS };
    }
    if (!isRecord(data)) {
      console.warn('[settings] 设置数据不是对象，已回落默认值');
      return { ...DEFAULT_SETTINGS };
    }
    if (data.v !== undefined && data.v !== SETTINGS_VERSION) {
      console.warn(`[settings] 设置版本 ${String(data.v)} 不符，按当前规则逐字段兼容`);
    }
    return normalizeSettings(data);
  }

  /**
   * 写入设置（先规范化，脏输入也安全落盘）。
   * @returns 目标不可用 / 配额溢出等异常时 false（吞掉异常并 console.error）
   */
  static save(data: SettingsData, storage?: Storage): boolean {
    const store = resolveStorage(storage);
    if (!store) return false;
    const clean = normalizeSettings(data);
    try {
      store.setItem(SETTINGS_KEY, JSON.stringify({ v: SETTINGS_VERSION, ...clean }));
      return true;
    } catch (err) {
      console.error('[settings] 写入设置失败', err);
      return false;
    }
  }

  /**
   * 单字段便捷读取（契约 §13 列出的第三形态）。等价于 load()[key]，低频调用无性能顾虑。
   */
  static get(key: keyof SettingsData, storage?: Storage): number {
    return Settings.load(storage)[key];
  }
}

/*
 * FIXME（依赖缺陷 / 契约缺口记录，待主线程裁决）：
 * 1) docs/tasks/w10/T104-settings-menu.md 要求「Settings.load/save/get/set(...) +
 *    onChange 回调注册」且「viewDistance 变更需触发世界半径重构」；但父任务下发的冻结实现
 *    规格收敛为纯静态 load/save（无实例状态），故此处未实现 set()/onChange 订阅表。
 *    菜单侧的等效行为是：滑条 input 即改即存（Settings.save），并由菜单把新值推给
 *    RuntimeLike.setViewDistance —— 若接线层希望全局监听（如 HUD 提示），建议在 W10 收尾
 *    把 onChange 补成 main 自己的事件（core/events.ts 增加 'settingsChanged' 键）而非改本文件。
 * 2) player/controller.ts 的 MOUSE_SENS 是模块私有常量 0.0022，**没有外部注入口**——
 *    灵敏度设置落盘后玩家侧不生效，需要 controller 提供 setSensitivity()/可写字段。
 *    跨文件改动超出本卡所有权，主线程接线时处理。
 * 3) audio/audio.ts 属 T103 并发波次，本仓库尚不存在该模块，音量目前只能落盘。
 *    menu.RuntimeLike 已预留可选 setMasterVolume?(v)，T103 就绪后 main 注入即生效。
 * 4) contracts/interfaces.md §13 未约定存储键名与 payload 结构（只写了 key 的名字在任务卡里），
 *    本文件以 SETTINGS_KEY 导出为准；若契约修订为多槽位（如按用户分档），需要同步改这里。
 */
