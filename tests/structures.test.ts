// 结构生成单测：确定性 / 锚点校验 / 结构存在性 / 跨 chunk 无缝（硬闸）/ 树压制。
// 跨 chunk 一致性是本系统的根基：stamp 决策禁止读 chunk 数据，
// 本文件用「双 chunk 拼接读取」对每个区域结构做边界连续性断言。
//
// 区域结构用例从 REGIONS × terrain.structures × FEATURE_BLOCK **自动派生**（W0d）：
//   新区域 def 的 structures 目前为空数组 → 自动无用例；W1-W6 各波往 def 里填
//   { kind, cellDensity } 后无需改本文件即获得「特征方块存在 + 跨 chunk 无缝」覆盖。
import { beforeEach, describe, expect, it } from 'vitest';

import { REGIONS, makeSeedForRegion } from '../src/data/regions';
import type { StructureKind } from '../src/data/regions';
import { SEA_LEVEL, CHUNK_W, voxelIndex } from '../src/core/constants';
import { hash2 } from '../src/core/rng';
import { BLOCK } from '../src/blocks/registry';
import {
  FEATURE_BLOCK,
  STRUCT_CELL,
  anchorMargin,
  anchorSuitable,
  insideStructureFootprint,
  structureAnchor,
} from '../src/world/structures';
import { createChunkData, initTerrain, isTreeColumn, surfaceHeight } from '../src/world/terragen';

/** 世界坐标读取器：从 (cx,cz) 为中心的 3×3 chunk 拼接视图读体素 */
function makeReader(seed: string) {
  initTerrain(seed);
  const cache = new Map<string, Uint8Array>();
  const get = (wx: number, y: number, wz: number): number => {
    const cx = Math.floor(wx / CHUNK_W);
    const cz = Math.floor(wz / CHUNK_W);
    const key = `${cx},${cz}`;
    let d = cache.get(key);
    if (!d) {
      d = createChunkData(cx, cz);
      cache.set(key, d);
    }
    return d[voxelIndex(wx - cx * CHUNK_W, y, wz - cz * CHUNK_W)]!;
  };
  return { get, cache };
}

/** 在锚点附近区域找第一个通过地形校验的锚点（按区域结构表） */
function findAnchor(seed: string, regionId: keyof typeof REGIONS) {
  initTerrain(seed);
  const region = REGIONS[regionId]!;
  const structures = region.terrain.structures;
  if (structures.length === 0) return null;
  const heightAt = (x: number, z: number): number => surfaceHeight(x, z);
  for (let cellX = -6; cellX <= 6; cellX++) {
    for (let cellZ = -6; cellZ <= 6; cellZ++) {
      for (const s of structures) {
        const a = structureAnchor(cellX, cellZ, s.kind, s.cellDensity);
        if (!a) continue;
        // anchorSuitable 需要真实地形公式：surfaceHeight 与 terrainHeight 同源
        if (!anchorSuitable(a, s.kind, (x, z) => heightAt(x, z))) continue;
        return { anchor: a, kind: s.kind };
      }
    }
  }
  return null;
}

/**
 * 按 kind 找锚点：先扫 ±6 cell（与旧行为一致，保证旧 kind 选中同一锚点），
 * 稀有 kind（cellDensity≈0.02）在 ±6 无有效锚点时放宽到 ±16 再找一次。
 */
function findKindAnchor(
  seed: string,
  kind: StructureKind,
  cellDensity: number,
): { x: number; z: number } | null {
  initTerrain(seed);
  const heightAt = (x: number, z: number): number => surfaceHeight(x, z);
  for (const range of [6, 16]) {
    for (let cellX = -range; cellX <= range; cellX++) {
      for (let cellZ = -range; cellZ <= range; cellZ++) {
        const a = structureAnchor(cellX, cellZ, kind, cellDensity);
        if (!a) continue;
        if (!anchorSuitable(a, kind, (x, z) => heightAt(x, z))) continue;
        return a;
      }
    }
  }
  return null;
}

describe('锚点选点与校验', () => {
  it('structureAnchor 同输入同输出；density=0 恒 null', () => {
    const a1 = structureAnchor(3, -2, 'yurt', 0.22);
    const a2 = structureAnchor(3, -2, 'yurt', 0.22);
    expect(a1).toEqual(a2);
    expect(structureAnchor(3, -2, 'yurt', 0)).toBeNull();
  });

  it('旧世界锚点兼容：7 旧 kind 输出与 W0 前公式（margin 恒 6）逐位一致', () => {
    // W0 前实现：KIND_SALT 0x11..0x77 + span = STRUCT_CELL − 2×6（冻结对照，禁止漂移）
    const OLD_SALT = {
      house: 0x11,
      siheyuan: 0x22,
      palace: 0x33,
      bamboo_house: 0x44,
      yurt: 0x55,
      oasis_farm: 0x66,
      snow_cabin: 0x77,
    } as const;
    for (const kind of Object.keys(OLD_SALT) as Array<keyof typeof OLD_SALT & StructureKind>) {
      const s1 = OLD_SALT[kind];
      const span = STRUCT_CELL - 2 * 6;
      for (let cx = -8; cx <= 8; cx++) {
        for (let cz = -8; cz <= 8; cz++) {
          for (const d of [0.02, 0.15, 0.22, 1]) {
            const expected = hash2(cx * 31 + s1, cz * 17 - s1) < d
              ? {
                  x: cx * STRUCT_CELL + 6 + Math.floor(hash2(cx + 101 + s1, cz - 7) * span),
                  z: cz * STRUCT_CELL + 6 + Math.floor(hash2(cx - 13, cz + 57 + s1) * span),
                }
              : null;
            expect(structureAnchor(cx, cz, kind, d)).toEqual(expected);
          }
        }
      }
    }
  });

  it('锚点必落在 cell 内部边距内（footprint 不跨 cell，全部 kind × anchorMargin）', () => {
    const kinds = Object.keys(FEATURE_BLOCK) as StructureKind[];
    expect(kinds.length).toBeGreaterThan(7);
    for (const kind of kinds) {
      const m = anchorMargin(kind);
      for (let i = 0; i < 50; i++) {
        const a = structureAnchor(i, -i, kind, 1);
        if (!a) continue;
        expect(a.x).toBeGreaterThanOrEqual(i * STRUCT_CELL + m);
        expect(a.x).toBeLessThan((i + 1) * STRUCT_CELL - m);
        expect(a.z).toBeGreaterThanOrEqual(-i * STRUCT_CELL + m);
        expect(a.z).toBeLessThan((i + 1) * STRUCT_CELL - m);
      }
    }
  });

  it('anchorMargin：旧 7 kind 恒 6；r7/r8 大建筑取自身半径', () => {
    const old7 = ['house', 'siheyuan', 'palace', 'bamboo_house', 'yurt', 'oasis_farm', 'snow_cabin'];
    for (const k of old7 as StructureKind[]) expect(anchorMargin(k)).toBe(6);
    const big: Array<[StructureKind, number]> = [
      ['zhaozhou_bridge', 7],
      ['hongyadong', 7],
      ['garden_pavilion', 7],
      ['tulou', 7],
      ['pagoda_forest', 7],
      ['leshan_buddha', 7],
      ['babao_pagodas', 7],
      ['towers_108', 7],
      ['jiayuguan', 8],
      ['potala', 8],
      ['wind_rain_bridge', 8],
      ['jiaxiu_pavilion', 6], // r5 → max(6, 5) = 6
    ];
    for (const [k, m] of big) expect(anchorMargin(k)).toBe(m);
  });

  it('anchorSuitable：平地通过、坡地/水下拒绝', () => {
    const flat = (): number => 30;
    const steep = (x: number): number => (x > 0 ? 40 : 30);
    const under = (): number => SEA_LEVEL - 1;
    const a = { x: 0, z: 0 };
    expect(anchorSuitable(a, 'house', flat)).toBe(true);
    expect(anchorSuitable(a, 'house', steep)).toBe(false);
    expect(anchorSuitable(a, 'house', under)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 区域结构用例（自动派生：REGIONS × terrain.structures × FEATURE_BLOCK）
// ---------------------------------------------------------------------------

const DERIVED: Array<{
  regionId: keyof typeof REGIONS;
  kind: StructureKind;
  density: number;
}> = [];
for (const [regionId, def] of Object.entries(REGIONS)) {
  for (const s of def.terrain.structures) {
    DERIVED.push({ regionId: regionId as keyof typeof REGIONS, kind: s.kind, density: s.cellDensity });
  }
}

for (const { regionId, kind, density } of DERIVED) {
  describe(`区域结构 ${regionId} / ${kind}`, () => {
    const seed = makeSeedForRegion(regionId, 'struct-test');
    beforeEach(() => initTerrain(seed));

    it('锚点处特征方块存在（结构真实落块）', () => {
      const anchor = findKindAnchor(seed, kind, density);
      expect(anchor).not.toBeNull();
      const { get } = makeReader(seed);
      // 在锚点 footprint 内自地表向上找特征方块（FEATURE_BLOCK[kind]）
      const featureBlock = FEATURE_BLOCK[kind];
      const fy = surfaceHeight(anchor!.x, anchor!.z) + 1;
      let seen = false;
      for (let dx = -2; dx <= 2 && !seen; dx++) {
        for (let dz = -2; dz <= 2 && !seen; dz++) {
          for (let y = fy; y <= fy + 8; y++) {
            if (get(anchor!.x + dx, y, anchor!.z + dz) === featureBlock) {
              seen = true;
              break;
            }
          }
        }
      }
      expect(seen).toBe(true);
    });

    it('跨 chunk 无缝：footprint 覆盖 chunk 边界时两侧数据一致（硬闸）', () => {
      const anchor = findKindAnchor(seed, kind, density);
      expect(anchor).not.toBeNull();
      const { get } = makeReader(seed);
      // 找一个穿过 footprint 的 chunk 边界（x 或 z 方向的 16 倍数）
      const fy = surfaceHeight(anchor!.x, anchor!.z) + 1;
      let boundary = -1;
      let axis: 'x' | 'z' = 'x'; // 显式记录边界方向（z 边界坐标同样是 16 的倍数，不能靠数值区分）
      for (let wx = anchor!.x - 4; wx <= anchor!.x + 4; wx++) {
        if (wx !== 0 && wx % CHUNK_W === 0) {
          boundary = wx;
          axis = 'x';
          break;
        }
      }
      if (boundary < 0) {
        // 该锚点不跨边界 → 换 z 方向试
        for (let wz = anchor!.z - 4; wz <= anchor!.z + 4; wz++) {
          if (wz !== 0 && wz % CHUNK_W === 0) {
            boundary = wz;
            axis = 'z';
            break;
          }
        }
      }
      if (boundary < 0) return; // 锚点完全在单 chunk 内：无边界可测，跳过
      // 沿边界线扫描 footprint 段：统计两侧列「同层一侧实心一侧空气」的失配。
      // 注意：结构自身的线性元素（柱/灯/檐角挑块）恰好贴在 chunk 边界列时，
      // 相邻列（墙 vs 院内空间）的实性天然不对称——这是几何常态不是裂缝；
      // stamp 决策不一致（真裂缝）则表现为沿边界线的**连续长段**失配。
      // 因此判定 = 总量容差 + 水平连续段上限（孤柱/灯为孤立竖条，裂缝沿墙线连片）。
      let mismatch = 0;
      let run = 0;
      let maxRun = 0;
      for (let off = -4; off <= 4; off++) {
        let colMismatch = 0;
        for (let y = fy; y <= fy + 4; y++) {
          const left = axis === 'x'
            ? get(boundary - 1, y, anchor!.z + off)
            : get(anchor!.x + off, y, boundary - 1);
          const right = axis === 'x'
            ? get(boundary, y, anchor!.z + off)
            : get(anchor!.x + off, y, boundary);
          if (left === BLOCK.AIR !== (right === BLOCK.AIR)) {
            mismatch++;
            colMismatch++;
          }
        }
        if (colMismatch > 0) {
          run++;
          maxRun = Math.max(maxRun, run);
        } else {
          run = 0;
        }
      }
      // 容差依据（W7 实测）：贴边柱（dazhengdian 八角柱廊，柱距 2 时三柱连贴）12-16/段3、
      // 贴边灯（shikumen）1-2、檐角贴边（yingxian）≤12；
      // 真裂缝（stamp 读 chunk 状态）会沿整条墙线连片（9 格边界段全长 ≥20 且段 ≥9）。
      expect(mismatch).toBeLessThanOrEqual(16);
      expect(maxRun).toBeLessThanOrEqual(3);
    }, 30000);
  });
}

describe('结构与树/地形交互', () => {
  const seed = makeSeedForRegion('neimenggu', 'struct-tree');
  it('结构 footprint（含余量）内的树被压制', () => {
    initTerrain(seed);
    const found = findAnchor(seed, 'neimenggu');
    if (!found) return; // 该 seed 无有效锚点时跳过
    const { anchor } = found;
    // footprint ±1 内 isTreeColumn 必须为 false
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        expect(isTreeColumn(anchor.x + dx, anchor.z + dz)).toBe(false);
      }
    }
  });

  it('insideStructureFootprint 对远离锚点的列返回 false', () => {
    initTerrain(seed);
    expect(insideStructureFootprint(3, 3, REGIONS.neimenggu!.terrain.structures)).toBe(false);
  });

  it('含结构区域同 seed 两次生成逐字节一致（确定性总闸）', () => {
    initTerrain(seed);
    const a = createChunkData(0, 0);
    const b = createChunkData(0, 0);
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) throw new Error(`字节不一致 @${i}: ${a[i]} vs ${b[i]}`);
    }
    expect(true).toBe(true);
  });
});
