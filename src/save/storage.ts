// 存档存储层（T63，契约 §11 / 架构 §2.9 schema 冻结）
// diff-only localStorage 存读档：世界本体由 seed 经 terragen 重生成，
// 玩家改动以 "cx,cz" → { 体素index: blockId } 增量落盘，F5 精确恢复。
//
// 与契约的偏差说明（FIXME 记录）：
// FIXME(docs) contracts/interfaces.md §11 中 saveGame 的签名是旧版三段式
//   saveGame(w: WorldSaveSource, player: PlayerSnapshot, inv: Inventory): void
// 且 loadGame/clearSave/hasSave 无参数。T63 冻结接口改为单 SaveSource 入参 +
// boolean 返回值 + 各函数可选 storage 注入；契约文档待下一轮统一修订。
//
// 模块纯净性：刻意不 import World——main 接线时把 world/player/inventory
// 适配成 SaveSource 传入即可，本文件可在纯 node 环境测试。

import type { ItemStack } from '../core/types';

/** localStorage 存档槽位键 */
export const SAVE_KEY = 'my_world_save_v1';

/** 当前存档版本号（写入 payload 顶层，载入时强校验） */
const SAVE_VERSION = 2;

/** 单个熔炉的持久化快照（FurnaceState 的 JSON 友形，槽位为 [key,count] 元组） */
export interface FurnaceSnapshot {
  in: [string, number] | null;
  fuel: [string, number] | null;
  out: [string, number] | null;
  burn: number;
  total: number;
  progress: number;
}

/** 玩家快照：脚底中心坐标 + 视角 + 生存数值 */
export interface PlayerSnapshot {
  p: [number, number, number];
  yaw: number;
  pitch: number;
  hp: number;
  hunger: number;
}

/** 载入得到的世界状态（架构 §2.9 的 SaveGame 结构去掉版本号后的可用视图） */
export interface SavedGame {
  seed: string;
  time: number;
  player: PlayerSnapshot;
  /** 36 格，每格 [物品key, 数量] 元组或 null */
  inv: ([string, number] | null)[];
  /** "cx,cz" → { 体素index: blockId } */
  diffs: Record<string, Record<number, number>>;
  /** "x,y,z" → 熔炉三槽与燃烧/进度快照（v2 起；v1 旧档为空对象） */
  furnaces: Record<string, FurnaceSnapshot>;
  /** 装备槽（可选）：head/chest 各一格 [物品key, 数量] */
  armor?: { head: [string, number] | null; chest: [string, number] | null };
  /** 区域 id（可选；区域已编进 seed 前缀，此字段仅供 UI 快速显示） */
  region?: string;
}

/**
 * 采集存档数据的源接口。main 接线时传真实 world/player/inventory 适配对象：
 * - time 语义由接线方决定（DayCycle.timeOfDay 或累计总时长）
 * - diffs 直接引用 World.diffs（Map<string, Map<number,number>>），此处只读遍历
 */
export interface SaveSource {
  seed: string;
  time: number;
  player: PlayerSnapshot;
  inventorySlots: (ItemStack | null)[];
  diffs: Map<string, Map<number, number>>;
  /** v2 起可选：熔炉状态持久化（"x,y,z" → 三槽 + 燃烧/进度快照） */
  furnaces?: Record<string, FurnaceSnapshot>;
  /** v2 起可选：装备槽持久化 */
  armor?: { head: [string, number] | null; chest: [string, number] | null };
  /** v2 起可选：区域 id（冗余于 seed 前缀，供 UI 免解析显示） */
  region?: string;
}

/** 落盘的真实结构（架构 §2.9），带版本号顶层字段 */
interface SavePayload {
  v: 1 | 2;
  seed: string;
  time: number;
  player: PlayerSnapshot;
  inv: ([string, number] | null)[];
  diffs: Record<string, Record<number, number>>;
  furnaces?: Record<string, FurnaceSnapshot>;
  armor?: { head: [string, number] | null; chest: [string, number] | null };
  region?: string;
}

/**
 * 解析实际使用的 Storage。
 * 浏览器环境调用各函数时可完全省略参数（默认 globalThis.localStorage）；
 * node 测试经参数注入内存 stub。无显式注入且环境中不存在 localStorage 时返回 null。
 */
function resolveStorage(explicit?: Storage): Storage | null {
  if (explicit) return explicit;
  const injected = (globalThis as { localStorage?: Storage | null }).localStorage;
  if (!injected) {
    console.warn('[save] 当前环境无可用的 localStorage，存档功能不可用');
    return null;
  }
  return injected;
}

/** Map 型 diffs → 嵌套普通对象（JSON 友好），不修改源数据 */
function serializeDiffs(diffs: Map<string, Map<number, number>>): Record<string, Record<number, number>> {
  const out: Record<string, Record<number, number>> = {};
  for (const [chunkKey, voxels] of diffs) {
    const rec: Record<number, number> = {};
    for (const [index, blockId] of voxels) rec[index] = blockId;
    out[chunkKey] = rec;
  }
  return out;
}

/** ItemStack 槽位数组 → [key, count] | null 元组数组（结构还原校验放 main 接线层） */
function serializeInventory(slots: (ItemStack | null)[]): ([string, number] | null)[] {
  return slots.map((s) => (s ? ([s.key, s.count] as [string, number]) : null));
}

/**
 * 序列化并存入 localStorage。
 * @returns 写入成功 true；序列化失败、配额溢出（QuotaExceededError）或目标不可用时
 *          返回 false（异常吞掉并 console.error，绝不让上层崩溃）。
 *
 * 浏览器环境可直接 `saveGame(src)`；node 测试传入内存 stub。
 */
export function saveGame(src: SaveSource, storage?: Storage): boolean {
  const store = resolveStorage(storage);
  if (!store) return false;

  // 深拷贝玩家快照，避免保存后源对象继续变化影响已在写的字符串——
  // 实际 stringify 在下行同步完成，这里复制仅为防御后续复用引用时的语义混淆
  const player: PlayerSnapshot = { ...src.player, p: [...src.player.p] };

  const payload: SavePayload = {
    v: SAVE_VERSION,
    seed: src.seed,
    time: src.time,
    player,
    inv: serializeInventory(src.inventorySlots),
    diffs: serializeDiffs(src.diffs),
    furnaces: src.furnaces ?? {},
    armor: src.armor ?? undefined,
    region: src.region ?? undefined,
  };

  try {
    store.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    // 典型来源：QuotaExceededError（localStorage 通常 5MB 上限）
    console.error('[save] 写入存档失败', err);
    return false;
  }
}

/**
 * 从 localStorage 读档并做完整性校验。
 * @returns 无档 / JSON 损坏 / 版本不符 / 缺关键字段（v/seed/diffs 等）一律返回 null；
 *          可解析但结构性异常时额外 console.warn。永不抛出。
 *
 * 浏览器环境可直接 `loadGame()`。
 */
export function loadGame(storage?: Storage): SavedGame | null {
  const store = resolveStorage(storage);
  if (!store) return null;

  let raw: string | null;
  try {
    raw = store.getItem(SAVE_KEY);
  } catch (err) {
    console.warn('[save] 读取存档失败', err);
    return null;
  }
  if (!raw) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    console.warn('[save] 存档数据不是合法 JSON，已忽略');
    return null;
  }

  const parsed = parsePayload(data);
  if (!parsed) {
    console.warn('[save] 存档内容缺失关键字段或版本不符，已忽略');
    return null;
  }
  return parsed;
}

/** 结构化校验（unknown → SavePayload）；仅挡住会导致下游崩溃的硬伤。
 *  接受 v1 与 v2：v2 新增可选 furnaces 字段，v1 旧档补空对象，双向兼容。 */
function parsePayload(data: unknown): SavedGame | null {
  if (typeof data !== 'object' || data === null) return null;
  const o = data as Record<string, unknown>;
  if (o.v !== 1 && o.v !== 2) return null;
  if (typeof o.seed !== 'string') return null;
  if (typeof o.time !== 'number' || !Number.isFinite(o.time)) return null;
  if (!isRecord(o.diffs)) return null;
  if (!Array.isArray(o.inv)) return null;

  const pl = o.player as Record<string, unknown> | undefined;
  if (
    !pl ||
    !Array.isArray(pl.p) ||
    pl.p.length !== 3 ||
    !pl.p.every((n) => typeof n === 'number' && Number.isFinite(n)) ||
    typeof pl.yaw !== 'number' ||
    typeof pl.pitch !== 'number' ||
    typeof pl.hp !== 'number' ||
    typeof pl.hunger !== 'number'
  ) {
    return null;
  }

  return {
    seed: o.seed,
    time: o.time,
    player: {
      p: [pl.p[0], pl.p[1], pl.p[2]],
      yaw: pl.yaw,
      pitch: pl.pitch,
      hp: pl.hp,
      hunger: pl.hunger,
    },
    inv: o.inv.map((slot) => {
      if (!Array.isArray(slot) || slot.length < 2) return null;
      return [slot[0] as string, slot[1] as number] as [string, number];
    }),
    diffs: normalizeDiffs(o.diffs),
    furnaces: o.furnaces === undefined ? {} : normalizeFurnaces(o.furnaces),
    armor: parseArmor(o.armor),
    region: typeof o.region === 'string' ? o.region : undefined,
  };
}

/** 装备槽收紧：结构不合的槽位剔除（置 null）而非整体拒档 */
function parseArmor(raw: unknown): { head: [string, number] | null; chest: [string, number] | null } | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) return undefined;
  const slot = (v: unknown): [string, number] | null => {
    if (!Array.isArray(v) || v.length < 2) return null;
    if (typeof v[0] !== 'string' || typeof v[1] !== 'number') return null;
    return [v[0], v[1]];
  };
  return { head: slot(raw.head), chest: slot(raw.chest) };
}

/** 逐熔炉收紧为 FurnaceSnapshot；结构不合的条目剔除而非整体拒档 */
function normalizeFurnaces(raw: unknown): Record<string, FurnaceSnapshot> {
  const out: Record<string, FurnaceSnapshot> = {};
  if (!isRecord(raw)) return out;
  for (const [key, val] of Object.entries(raw)) {
    if (!isRecord(val)) continue;
    const slot = (v: unknown): [string, number] | null => {
      if (!Array.isArray(v) || v.length < 2) return null;
      if (typeof v[0] !== 'string' || typeof v[1] !== 'number') return null;
      return [v[0], v[1]];
    };
    const f = val as Record<string, unknown>;
    if (
      typeof f.burn !== 'number' ||
      typeof f.total !== 'number' ||
      typeof f.progress !== 'number' ||
      !Number.isFinite(f.burn) ||
      !Number.isFinite(f.total) ||
      !Number.isFinite(f.progress)
    ) {
      continue;
    }
    out[key] = {
      in: slot(f.in),
      fuel: slot(f.fuel),
      out: slot(f.out),
      burn: f.burn,
      total: f.total,
      progress: f.progress,
    };
  }
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 逐 chunk 收紧为 Record<number, number>，剔除无法表达的项而非整体拒档 */
function normalizeDiffs(raw: Record<string, unknown>): Record<string, Record<number, number>> {
  const out: Record<string, Record<number, number>> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!isRecord(val)) continue;
    const rec: Record<number, number> = {};
    for (const [idx, id] of Object.entries(val)) {
      const i = Number(idx);
      if (Number.isInteger(i) && typeof id === 'number') rec[i] = id;
    }
    out[key] = rec;
  }
  return out;
}

/** 清除存档。从未有过档也视为成功；底层异常静默吞掉（浏览器隐私模式等场景）。 */
export function clearSave(storage?: Storage): void {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.removeItem(SAVE_KEY);
  } catch (err) {
    console.warn('[save] 清除存档失败', err);
  }
}

/** 是否存在有效存档。浏览器环境可直接 `hasSave()`。 */
export function hasSave(storage?: Storage): boolean {
  const store = resolveStorage(storage);
  if (!store) return false;
  try {
    return store.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * 自动存档计时器工厂：每 intervalMs 毫秒调一次 getSrc()，非 null 时执行 saveGame。
 * @param getSrc     取当前可保存的快照；游戏尚未初始化/主菜单时返回 null 即跳过本轮
 * @param intervalMs 间隔毫秒，默认 10000（任务卡约定每 10s）
 * @returns stop 函数：清除计时器；重复调用安全
 *
 * 浏览器环境可直接 `startAutosave(srcGetter)`；
 * beforeunload 与手动保存按钮由接线方（T71 集成波）另接，不走此工厂。
 */
export function startAutosave(
  getSrc: () => SaveSource | null,
  intervalMs = 10_000,
  storage?: Storage,
): () => void {
  const id = setInterval(() => {
    const src = getSrc();
    if (src) saveGame(src, storage);
  }, intervalMs);
  return () => clearInterval(id);
}
