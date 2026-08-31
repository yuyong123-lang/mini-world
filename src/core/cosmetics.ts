// core/cosmetics.ts —— 角色装扮：颜色自定义 + 预设皮肤（localStorage 持久化）
//
// 与 core/settings 的关系：设置页是「强钳制数值滑条」（单键 JSON + normalizeSettings），
// 装扮是「4 个 hex 颜色 + 预设名」的外观数据，结构不匹配，故独立存储键
// COSMETICS_KEY。清档（clearSave）不影响装扮——外观跨世界保留。
//
// 模块纯净：storage 可注入（node 测试用内存 stub），load 永不抛出、非法值逐字段回落。

/** localStorage 存储键 */
export const COSMETICS_KEY = 'my_world_cosmetics_v1';

/** 装扮数据：四色 hex（#rrggbb）+ 当前预设名（'custom' 表示手动改过色） */
export interface CosmeticsData {
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
  preset: string;
}

/** 缺省装扮 = playerModel.ts 的历史硬编码四色（视觉零回归） */
export const DEFAULT_COSMETICS: CosmeticsData = {
  skin: '#e0b088',
  shirt: '#3a7bd5',
  pants: '#35415e',
  hair: '#4a3220',
  preset: 'default',
};

/** 预设皮肤表（preset 名 → 四色）；main 菜单页的按钮与之一一对应 */
export const COSMETIC_PRESETS: Readonly<Record<string, Omit<CosmeticsData, 'preset'>>> = {
  default: { skin: '#e0b088', shirt: '#3a7bd5', pants: '#35415e', hair: '#4a3220' },
  wheat: { skin: '#f2d5b0', shirt: '#c98f4a', pants: '#7a5c34', hair: '#d8b46a' },
  night: { skin: '#8a5a3c', shirt: '#2c3342', pants: '#1c222e', hair: '#141414' },
  forest: { skin: '#e8c49c', shirt: '#3f7f46', pants: '#4a3a28', hair: '#5c3a1e' },
};

/** hex 颜色合法性：#rrggbb 严格匹配 */
function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

/**
 * 规范化：逐字段校验 hex，非法回落缺省；preset 允许预设表键与 'custom'
 * （用户手动改过色的标记），其余回落 'default'。脏输入安全（永不抛出）。
 */
export function normalizeCosmetics(v: unknown): CosmeticsData {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  const d = DEFAULT_COSMETICS;
  const preset = typeof o.preset === 'string' && (COSMETIC_PRESETS[o.preset] || o.preset === 'custom')
    ? o.preset
    : 'default';
  return {
    skin: isHexColor(o.skin) ? o.skin : d.skin,
    shirt: isHexColor(o.shirt) ? o.shirt : d.shirt,
    pants: isHexColor(o.pants) ? o.pants : d.pants,
    hair: isHexColor(o.hair) ? o.hair : d.hair,
    preset,
  };
}

/** 解析 storage（显式注入优先；无环境回 null——node 单测路径） */
function resolveStorage(explicit?: Storage): Storage | null {
  if (explicit) return explicit;
  const injected = (globalThis as { localStorage?: Storage | null }).localStorage;
  return injected ?? null;
}

/** 装扮静态门面（模式与 Settings 一致：load/save 可注入 storage） */
export const Cosmetics = {
  load(storage?: Storage): CosmeticsData {
    const store = resolveStorage(storage);
    if (!store) return { ...DEFAULT_COSMETICS };
    try {
      const raw = store.getItem(COSMETICS_KEY);
      if (!raw) return { ...DEFAULT_COSMETICS };
      return normalizeCosmetics(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_COSMETICS };
    }
  },

  save(data: CosmeticsData, storage?: Storage): boolean {
    const store = resolveStorage(storage);
    if (!store) return false;
    try {
      store.setItem(COSMETICS_KEY, JSON.stringify(normalizeCosmetics(data)));
      return true;
    } catch {
      return false;
    }
  },
};
