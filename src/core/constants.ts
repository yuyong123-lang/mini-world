// 全局常量与坐标工具——所有数值的唯一出处（契约 §1）
export const CHUNK_W = 16;
export const CHUNK_H = 64; // 即 WORLD_H
export const WORLD_H = 64;
export const SEA_LEVEL = 28;

// 世界尺寸参数（设置页可改视距，其余冻结）
export const RENDER_RADIUS_CHUNKS = 6;
export const LOAD_RADIUS_CHUNKS = 7;
export const UNLOAD_RADIUS_CHUNKS = 9;
export const FOG_NEAR = 78;
export const FOG_FAR = 92;

// 物理
export const GRAVITY = -24;
export const JUMP_SPEED = 8.4;
export const WALK_SPEED = 4.3;
export const SPRINT_SPEED = 5.8;

// 交互
export const REACH = 5;

// 昼夜
export const DAY_LENGTH = 480;
export const NIGHT_LENGTH = 240;

/** 体素局部索引：(0..15, 0..63, 0..15) → x | z<<4 | y<<8 */
export function voxelIndex(lx: number, ly: number, lz: number): number {
  return lx | (lz << 4) | (ly << 8);
}

/** 世界坐标 → chunk 坐标 */
export function worldToChunk(n: number): number {
  return Math.floor(n / 16);
}

/** 世界坐标 → chunk 内局部坐标（负数安全） */
export function localCoord(worldN: number): number {
  return ((worldN % 16) + 16) % 16;
}

/** chunk 坐标 → 存档键 */
export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}
