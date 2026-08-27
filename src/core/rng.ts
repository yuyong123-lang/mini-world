// 确定性随机工具：同 seed 永远得到相同序列（契约 §1 / T02）

/** mulberry32 PRNG：返回 [0,1) 均匀分布 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 字符串 → 32 位种子 */
export function hashStr(s: string): number {
  let h = 2166136261 | 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 内部 32 位雪崩混合，输出 [0,1) */
function mix(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^= h >>> 16) >>> 0) / 4294967296;
}

/** 整数坐标二维确定性哈希 → [0,1)。用于树列判定、矿石等 */
export function hash2(x: number, z: number): number {
  return mix(Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263));
}

/** 整数坐标三维确定性哈希 → [0,1)。用于矿石分布 */
export function hash3(x: number, y: number, z: number): number {
  return mix(
    Math.imul(x | 0, 374761393) +
      Math.imul(y | 0, 1103515245) +
      Math.imul(z | 0, 668265263),
  );
}
