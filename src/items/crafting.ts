// 合成匹配器（契约 §6，按任务规格微调：shaped 用 string[] 行矩阵）
//
// shaped 表示法：
//   - 用字符串数组表示行矩阵，如 ["PPP", ".S.", ".S."]；
//   - 每个字符经 map 映射为「可接受的物品 key 数组」；'.' 为必须留空的格子；
//   - 匹配前把玩家摆盘裁掉全空行列归一化，因此配方可任意平移（3×3 工作台内同理）。
// 与契约 §6 的 string[][] 嵌套数组相比更紧凑，语义等价（嵌套数组的内层长度即列）。

import type { ItemStack } from '../core/types';

export interface Recipe {
  /** 产物与数量 */
  out: { key: string; count: number };
  /** 有序：string[] 行矩阵；'.'=必空格；字符由 map 映射到可用物品 */
  shaped?: string[];
  /** 无序：多重集（物品 key 直接列出） */
  shapeless?: string[];
  /** 字符 → 可接受的 itemKey 数组（如 P→[木板类全部]） */
  map?: Record<string, string[]>;
  /** 需要 2×2 还是工作台 3×3 */
  size: 2 | 3;
  /** 是否允许水平镜像匹配（如斧头左右手持皆可） */
  allowMirror?: boolean;
}

type Grid = (ItemStack | null)[];

/** 裁剪全空行列，返回归一化矩阵 */
function trimMatrix(rows: string[][]): string[][] {
  let top = 0, bottom = rows.length - 1;
  const width = rows[0]?.length ?? 0;

  const colEmpty = (c: number) => rows.every((r) => r[c] === '');
  while (top <= bottom && rows[top].every((c) => c === '')) top++;
  while (bottom >= top && rows[bottom].every((c) => c === '')) bottom--;
  let left = 0, right = width - 1;
  while (left <= right && colEmpty(left)) left++;
  while (right >= left && colEmpty(right)) right--;

  if (top > bottom || left > right) return [];
  const out: string[][] = [];
  for (let r = top; r <= bottom; r++) out.push(rows[r].slice(left, right + 1));
  return out;
}

/** 配方字符矩阵 → trim 后的标准形（缓存用） */
function patternToMatrix(pattern: string[]): string[][] {
  return trimMatrix(pattern.map((row) => row.split('')));
}

/** 镜像矩阵（水平翻转每一行） */
function mirrorMatrix(rows: string[][]): string[][] {
  return rows.map((r) => r.slice().reverse());
}

/** pattern 字符是否接受该格子的物品 key（key undefined 表示空格） */
function cellAccepts(ch: string, key: string | undefined, map: Record<string, string[]> | undefined): boolean {
  if (ch === '.') return key === undefined;
  if (key === undefined) return false;
  const accepted = map?.[ch];
  return !!accepted && accepted.includes(key);
}

/** 多重集成分是否接受该物品 key */
function acceptsIngredient(ing: string, key: string, map: Record<string, string[]> | undefined): boolean {
  if (ing === key) return true;
  return !!map?.[ing]?.includes(key);
}

/** 玩家摆盘 → 每个 ItemStack 取 key，空位记 undefined */
function gridToKeys(grid: Grid): (string | undefined)[] {
  return grid.map((s) => s?.key);
}

interface Placement { r0: number; c0: number; mirrored: boolean }

/** 在 size×size 盘面里寻找能放下标准形（或其镜像）的偏移，且每个非'.'格材料充足 */
function findPlacement(
  grid: Grid, size: number, pat: string[][],
  allowMirror: boolean, map: Record<string, string[]> | undefined,
): Placement | null {
  const ph = pat.length;
  const pw = pat[0].length;
  for (const mirrored of allowMirror ? [false, true] : [false]) {
    const m = mirrored ? mirrorMatrix(pat) : pat;
    for (let r0 = 0; r0 + ph <= size; r0++) {
      for (let c0 = 0; c0 + pw <= size; c0++) {
        let ok = true;
        for (let r = 0; ok && r < ph; r++) {
          for (let c = 0; ok && c < pw; c++) {
            const ch = m[r][c];
            const key = grid[(r0 + r) * size + (c0 + c)]?.key;
            if (!cellAccepts(ch, key, map)) ok = false;
          }
        }
        if (ok) return { r0, c0, mirrored };
      }
    }
  }
  return null;
}

function isPerfectSquare(n: number): number | null {
  const r = Math.round(Math.sqrt(n));
  return r * r === n ? r : null;
}

export class CraftingMatcher {
  private static recipes: { recipe: Recipe; pat: string[][] }[] = [];

  static load(recipes: Recipe[]): void {
    CraftingMatcher.recipes = recipes.map((recipe) => ({
      recipe,
      pat: recipe.shaped ? patternToMatrix(recipe.shaped) : [],
    }));
  }

  /**
   * 在玩家摆盘里找一条可成立的配方。
   * - 大小门禁：gridSize 小于配方 size 时直接不考虑；
   * - shaped：裁空归一化后逐格比对（allowMirror 时再比对水平镜像）；
   * - shapeless：非空格物品多重集与 shapeless 列表比对。
   */
  static match(grid: Grid, gridSize: 2 | 3): Recipe | null {
    if (isPerfectSquare(grid.length) !== gridSize) return null;

    for (const { recipe, pat } of CraftingMatcher.recipes) {
      if (gridSize < recipe.size) continue;

      if (recipe.shaped) {
        const keys = gridToKeys(grid);
        // 按行裁剪全空行列
        let mat: string[][] = [];
        for (let r = 0; r < gridSize; r++) {
          mat.push([]);
          for (let c = 0; c < gridSize; c++) mat[r].push(keys[r * gridSize + c] ?? '');
        }
        mat = trimMatrix(mat);
        if (mat.length === 0 || mat.length !== pat.length) continue;
        if ((mat[0]?.length ?? 0) !== (pat[0]?.length ?? 0)) continue;

        const cellsEqual = (m: string[][]) =>
          m.every((row, r) => row.every((cell, c) =>
            cellAccepts(pat[r][c], cell === '' ? undefined : cell, recipe.map)));
        if (cellsEqual(mat) || (recipe.allowMirror === true && cellsEqual(mirrorMatrix(mat)))) {
          return recipe;
        }
      } else if (recipe.shapeless) {
        const items: string[] = [];
        for (let i = 0; i < grid.length; i++) {
          const k = grid[i]?.key;
          if (k !== undefined) items.push(k);
        }
        if (items.length !== recipe.shapeless.length) continue;
        const pool = recipe.shapeless.slice();
        let ok = true;
        for (const key of items) {
          const idx = pool.findIndex((ing) => acceptsIngredient(ing, key, recipe.map));
          if (idx < 0) { ok = false; break; }
          pool.splice(idx, 1);
        }
        if (ok) return recipe;
      }
    }
    return null;
  }

  /**
   * 按 matched 形状扣料，返回新摆盘。
   * 非空格 count 减 1，减到 0 置 null。找不到放置位（材料不足）时原样返回，
   * 调用方约定先经过 match 校验。
   */
  static consume(grid: Grid, recipe: Recipe): Grid {
    const size = isPerfectSquare(grid.length);
    if (size === null) throw new Error(`grid 长度须为完全平方数: ${grid.length}`);

    // 深拷贝一份（不改动调用方传入的堆叠对象）
    const out: Grid = grid.map((s) => (s ? { ...s } : null));
    const dec = (i: number) => {
      const s = out[i];
      if (!s) return;
      s.count -= 1;
      if (s.count <= 0) out[i] = null;
    };

    if (recipe.shaped) {
      const pat = patternToMatrix(recipe.shaped);
      const place = findPlacement(grid, size, pat, recipe.allowMirror === true, recipe.map);
      if (!place) return grid.slice();
      for (let r = 0; r < pat.length; r++) {
        for (let c = 0; c < pat[r].length; c++) {
          if (pat[r][c] !== '.') dec((place.r0 + r) * size + (place.c0 + c));
        }
      }
      return out;
    }

    if (recipe.shapeless) {
      const pool = recipe.shapeless.slice();
      for (let i = 0; i < out.length && pool.length > 0; i++) {
        const k = out[i]?.key;
        if (k === undefined) continue;
        const idx = pool.findIndex((ing) => acceptsIngredient(ing, k, recipe.map));
        if (idx < 0) continue;
        pool.splice(idx, 1);
        dec(i);
      }
      return out;
    }

    return out;
  }
}
