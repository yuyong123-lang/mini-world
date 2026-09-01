// 结构生成单测：确定性 / 锚点校验 / 结构存在性 / 跨 chunk 无缝（硬闸）/ 树压制。
// 跨 chunk 一致性是本系统的根基：stamp 决策禁止读 chunk 数据，
// 本文件用「双 chunk 拼接读取」对每个区域结构做边界连续性断言。
import { beforeEach, describe, expect, it } from 'vitest';

import { REGIONS, makeSeedForRegion } from '../src/data/regions';
import { SEA_LEVEL, CHUNK_W, voxelIndex } from '../src/core/constants';
import { BLOCK } from '../src/blocks/registry';
import {
  MAX_STRUCT_RADIUS,
  STRUCT_CELL,
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

describe('锚点选点与校验', () => {
  it('structureAnchor 同输入同输出；density=0 恒 null', () => {
    const a1 = structureAnchor(3, -2, 'yurt', 0.22);
    const a2 = structureAnchor(3, -2, 'yurt', 0.22);
    expect(a1).toEqual(a2);
    expect(structureAnchor(3, -2, 'yurt', 0)).toBeNull();
  });

  it('锚点必落在 cell 内部边距内（footprint 不跨 cell）', () => {
    for (let i = 0; i < 50; i++) {
      const a = structureAnchor(i, -i, 'house', 1);
      if (!a) continue;
      expect(a.x).toBeGreaterThanOrEqual(i * STRUCT_CELL + MAX_STRUCT_RADIUS);
      expect(a.x).toBeLessThan((i + 1) * STRUCT_CELL - MAX_STRUCT_RADIUS);
    }
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

// 各区域结构存在性 + 跨 chunk 无缝
const REGION_STRUCT: Array<[keyof typeof REGIONS, number]> = [
  ['sichuan', BLOCK.GREY_TILE], // 川西民居顶
  ['beijing', BLOCK.GREY_BRICK], // 四合院墙
  ['yunnan', BLOCK.BAMBOO_PLANK], // 竹楼地板
  ['neimenggu', BLOCK.WOOL], // 蒙古包毡墙
  ['xinjiang', BLOCK.GRAPE_VINE], // 葡萄棚
  ['dongbei', BLOCK.SPRUCE_LOG], // 雪乡木屋墙
];

for (const [regionId, featureBlock] of REGION_STRUCT) {
  describe(`区域结构 ${regionId}`, () => {
    const seed = makeSeedForRegion(regionId, 'struct-test');
    beforeEach(() => initTerrain(seed));

    it('锚点处特征方块存在（结构真实落块）', () => {
      const found = findAnchor(seed, regionId);
      expect(found).not.toBeNull();
      const { anchor } = found!;
      const { get } = makeReader(seed);
      // 在锚点 footprint 内自地表向上找特征方块
      const fy = surfaceHeight(anchor.x, anchor.z) + 1;
      let seen = false;
      for (let dx = -2; dx <= 2 && !seen; dx++) {
        for (let dz = -2; dz <= 2 && !seen; dz++) {
          for (let y = fy; y <= fy + 8; y++) {
            if (get(anchor.x + dx, y, anchor.z + dz) === featureBlock) {
              seen = true;
              break;
            }
          }
        }
      }
      expect(seen).toBe(true);
    });

    it('跨 chunk 无缝：footprint 覆盖 chunk 边界时两侧数据一致（硬闸）', () => {
      const found = findAnchor(seed, regionId);
      expect(found).not.toBeNull();
      const { anchor } = found!;
      const { get } = makeReader(seed);
      // 找一个穿过 footprint 的 chunk 边界（x 或 z 方向的 16 倍数）
      const fy = surfaceHeight(anchor.x, anchor.z) + 1;
      let boundary = -1;
      for (let wx = anchor.x - 4; wx <= anchor.x + 4; wx++) {
        if (wx !== 0 && wx % CHUNK_W === 0) {
          boundary = wx;
          break;
        }
      }
      if (boundary < 0) {
        // 该锚点不跨边界 → 换 z 方向试
        for (let wz = anchor.z - 4; wz <= anchor.z + 4; wz++) {
          if (wz !== 0 && wz % CHUNK_W === 0) {
            boundary = wz;
            break;
          }
        }
      }
      if (boundary < 0) return; // 锚点完全在单 chunk 内：无边界可测，跳过
      // 沿边界线扫描 footprint 段：两侧列在同层的体素必须都是「非空气或都空气」的
      // 连续墙体（结构几何在两个 chunk 各自 stamp 后必须严丝合缝）
      let mismatch = 0;
      for (let off = -4; off <= 4; off++) {
        for (let y = fy; y <= fy + 4; y++) {
          const left = boundary % CHUNK_W === 0 && Math.abs(boundary) >= CHUNK_W
            ? get(boundary - 1, y, anchor.z + off)
            : get(anchor.x + off, y, boundary - 1);
          const right = boundary % CHUNK_W === 0
            ? get(boundary, y, anchor.z + off)
            : get(anchor.x + off, y, boundary);
          // 无缝的充要判定：两侧同层要么都是实心、要么都是空气（不会一侧有一侧无）
          if (left === BLOCK.AIR !== (right === BLOCK.AIR)) mismatch++;
        }
      }
      // 允许极少量边界正好落在门洞/窗户等 intentional 空洞上（同层洞两侧应为同空，
      // 此断言实际应为 0；>0 说明 stamp 决策读到了 chunk 局部状态——硬闸报警）
      expect(mismatch).toBe(0);
    }, 30000);
  });
}

describe('结构与树/地形交互', () => {
  const seed = makeSeedForRegion('neimenggu', 'struct-tree');
  it('结构 footprint（含余量）内的树被压制', () => {
    initTerrain(seed);
    const found = findAnchor(seed, 'neimenggu');
    if (!found) return; // 该 seed 无有效锚点时跳过
    const { anchor } = found!;
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
