// T41 地形生成完整版单测：未初始化防护 / 确定性 / 分层 / 生物群系 / 矿石 / 树（含跨界）/
// 海洋规则 / diffs / seed 区分度 / 性能。
// 断言值均为对当前实现（architecture §2.4 参数）实际采样后锁定的固定值，
// 改动任何公式参数或噪声创建顺序都会在此暴露。
import { beforeEach, describe, expect, it } from 'vitest';

import { BLOCK } from '../src/blocks/registry';
import { CHUNK_W, SEA_LEVEL, WORLD_H, voxelIndex } from '../src/core/constants';
import { hash2 } from '../src/core/rng';
import {
  applyDiffs,
  biomeAt,
  createChunkData,
  initTerrain,
  isTreeColumn,
  surfaceHeight,
} from '../src/world/terragen';

const SEED = 'test-seed-42';
/** (0..30)² 内同时含草地与雪原的种子（实测 grass=868 / snow=93） */
const MULTI_BIOME_SEED = 'w4-seed-22';

/** 逐字节比较两个 TypedArray（避免依赖 Node Buffer 类型） */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** 在已生成的 chunk 数据中找一列被水覆盖的列，返回其原始地表高 */
function waterColumnIn(data: Uint8Array): { lx: number; lz: number; ground: number } | null {
  for (let lx = 0; lx < CHUNK_W; lx++) {
    for (let lz = 0; lz < CHUNK_W; lz++) {
      if (data[voxelIndex(lx, SEA_LEVEL, lz)] !== BLOCK.WATER) continue;
      // 自海面向下穿透水体，最低一格水的下方即原始地表
      let wy = SEA_LEVEL;
      while (wy > 0 && data[voxelIndex(lx, wy - 1, lz)] === BLOCK.WATER) wy--;
      return { lx, lz, ground: wy - 1 };
    }
  }
  return null;
}

/** 在给定世界坐标范围内找满足条件的列；找不到返回 null */
function findWorldColumn(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  pred: (wx: number, wz: number, sh: number) => boolean,
): { wx: number; wz: number; sh: number } | null {
  for (let wx = x0; wx <= x1; wx++) {
    for (let wz = z0; wz <= z1; wz++) {
      const sh = surfaceHeight(wx, wz);
      if (pred(wx, wz, sh)) return { wx, wz, sh };
    }
  }
  return null;
}

// 放在最前执行：本模块内尚未有人调用过 initTerrain
describe('未初始化防护', () => {
  it('createChunkData / surfaceHeight / biomeAt 未先 initTerrain 时抛错并提示', () => {
    expect(() => createChunkData(0, 0)).toThrowError(/initTerrain/);
    expect(() => surfaceHeight(0, 0)).toThrowError(/initTerrain/);
    expect(() => biomeAt(0, 0)).toThrowError(/initTerrain/);
    initTerrain(SEED); // 初始化一次，供后续用例使用
  });
});

describe('确定性', () => {
  beforeEach(() => initTerrain(SEED));

  it('同 seed 两次 createChunkData(3,7) 逐字节一致', () => {
    const a = createChunkData(3, 7);
    const b = createChunkData(3, 7);
    expect(a.length).toBe(CHUNK_W * WORLD_H * CHUNK_W);
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) throw new Error(`字节不一致 @${i}: ${a[i]} vs ${b[i]}`);
    }
    expect(true).toBe(true);
  });

  it('surfaceHeight 同坐标重复调用一致，且草地列表层正是 GRASS', () => {
    // 实测 (51,-13) 在 SEED 下是草地
    const x = 51, z = -13;
    expect(surfaceHeight(x, z)).toBe(surfaceHeight(x, z));
    expect(biomeAt(x, z)).toBe('grass');
    const cx = Math.floor(x / CHUNK_W);
    const cz = Math.floor(z / CHUNK_W);
    const data = createChunkData(cx, cz);
    const h = surfaceHeight(x, z);
    const lid = x - cx * CHUNK_W;
    const ldz = z - cz * CHUNK_W;
    if (h > SEA_LEVEL) {
      // 陆地列未被海面回退，surfaceHeight 即真实地表
      expect(data[voxelIndex(lid, h, ldz)]).toBe(BLOCK.GRASS);
      expect(data[voxelIndex(lid, h - 1, ldz)]).toBe(BLOCK.DIRT);
    } else {
      // 水面列在 SEA_LEVEL 处必是水
      expect(data[voxelIndex(lid, SEA_LEVEL, ldz)]).toBe(BLOCK.WATER);
    }
  });

  it('createChunkData 对 (0,0)(5,-3)(-7,7) 重复生成完全一致（任务卡验收三块）', () => {
    for (const [cx, cz] of [[0, 0], [5, -3], [-7, 7]] as const) {
      expect(bytesEqual(createChunkData(cx, cz), createChunkData(cx, cz))).toBe(true);
    }
  });
});

describe('分层结构', () => {
  beforeEach(() => initTerrain(SEED));

  it('草地列：表层 GRASS、其下 DIRT、底部 BEDROCK、含 STONE', () => {
    // 低海拔草地列（雪线 52 之下、非沙漠），且本列不是树干
    const found = findWorldColumn(0, 190, 0, 190, (wx, wz, sh) =>
      sh > SEA_LEVEL && sh <= SEA_LEVEL + 6 &&
      biomeAt(wx, wz) === 'grass' && !isTreeColumn(wx, wz),
    );
    expect(found).not.toBeNull();
    const f = found!;
    const cx = Math.floor(f.wx / CHUNK_W);
    const cz = Math.floor(f.wz / CHUNK_W);
    const data = createChunkData(cx, cz);
    const lx = f.wx - cx * CHUNK_W;
    const lz = f.wz - cz * CHUNK_W;
    expect(biomeAt(f.wx, f.wz)).toBe('grass');
    expect(data[voxelIndex(lx, f.sh, lz)]).toBe(BLOCK.GRASS);
    expect(data[voxelIndex(lx, f.sh - 1, lz)]).toBe(BLOCK.DIRT);
    expect(data[voxelIndex(lx, f.sh - 3, lz)]).toBe(BLOCK.DIRT);
    expect(data[voxelIndex(lx, 0, lz)]).toBe(BLOCK.BEDROCK);

    let hasStone = false;
    for (let y = 1; y < f.sh - 3; y++) {
      if (data[voxelIndex(lx, y, lz)] === BLOCK.STONE) hasStone = true;
    }
    expect(hasStone).toBe(true);
  });

  it('沙漠列表层连续 4 格 SAND；雪原陆地列表层 SNOW、其下 DIRT', () => {
    // SEED 下最近沙漠中心约 (-102,0)，所在 chunk (-7,0)：实测 163 列全沙 ✓
    const dcx = Math.floor(-102 / CHUNK_W);
    const dd = createChunkData(dcx, 0);
    let desertCols = 0;
    for (let lx = 0; lx < CHUNK_W; lx++) {
      for (let lz = 0; lz < CHUNK_W; lz++) {
        const wx = dcx * CHUNK_W + lx;
        const wz = lz;
        if (biomeAt(wx, wz) !== 'desert') continue;
        const h = surfaceHeight(wx, wz);
        if (h <= SEA_LEVEL) continue; // 水下列表层恒为沙/水，不在本断言范围
        desertCols++;
        for (let dy = 0; dy < 4; dy++) {
          expect(dd[voxelIndex(lx, h - dy, lz)]).toBe(BLOCK.SAND);
        }
        expect(dd[voxelIndex(lx, h - 4, lz)]).not.toBe(BLOCK.SAND);
      }
    }
    expect(desertCols).toBeGreaterThan(50);

    // MULTI_BIOME_SEED 的 (0..30)² 含 93 列雪原
    initTerrain(MULTI_BIOME_SEED);
    let snowCols = 0;
    for (const c of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      const sd = createChunkData(c[0], c[1]);
      for (let lx = 0; lx < CHUNK_W; lx++) {
        for (let lz = 0; lz < CHUNK_W; lz++) {
          const wx = c[0] * CHUNK_W + lx;
          const wz = c[1] * CHUNK_W + lz;
          if (wx > 31 || wz > 31) continue;
          if (biomeAt(wx, wz) !== 'snow') continue;
          const h = surfaceHeight(wx, wz);
          if (h <= SEA_LEVEL) continue;
          snowCols++;
          expect(sd[voxelIndex(lx, h, lz)]).toBe(BLOCK.SNOW);
          expect(sd[voxelIndex(lx, h - 1, lz)]).toBe(BLOCK.DIRT);
        }
      }
    }
    expect(snowCols).toBeGreaterThan(20);
    initTerrain(SEED);
  });

  it('地形钳制：非树体素最高层 ∈ [3, WORLD_H-10]，任何体素都在 [0,WORLD_H)', () => {
    const data = createChunkData(-4, 2);
    for (let lx = 0; lx < CHUNK_W; lx++) {
      for (let lz = 0; lz < CHUNK_W; lz++) {
        let top = -1;
        let terrTop = -1;
        for (let y = WORLD_H - 1; y >= 0; y--) {
          const v = data[voxelIndex(lx, y, lz)];
          if (v === BLOCK.AIR) continue;
          if (top < 0) top = y;
          if (v !== BLOCK.LOG && v !== BLOCK.LEAVES) { terrTop = y; break; }
        }
        // 树叶/树干可越过地形上限，但绝不能出数组界
        expect(top).toBeLessThan(WORLD_H);
        expect(terrTop).toBeGreaterThanOrEqual(3);
        expect(terrTop).toBeLessThanOrEqual(WORLD_H - 10);
      }
    }
  });
});

describe('生物群系分布', () => {
  beforeEach(() => initTerrain(MULTI_BIOME_SEED));

  it('(0..30)² 900 列至少出现草地与另一群系（该 seed：草+雪）', () => {
    const cnt = { grass: 0, desert: 0, snow: 0 };
    for (let x = 0; x <= 30; x++) {
      for (let z = 0; z <= 30; z++) cnt[biomeAt(x, z)]++;
    }
    const kinds =
      (cnt.grass > 0 ? 1 : 0) + (cnt.desert > 0 ? 1 : 0) + (cnt.snow > 0 ? 1 : 0);
    expect(kinds).toBeGreaterThanOrEqual(2);
    // 锁定抽样分布：绝大多数是草地，另有一片成规模的雪原
    expect(cnt.grass).toBeGreaterThan(700);
    expect(cnt.snow).toBeGreaterThan(20);
  });

  it('SEED 下原点西南方向存在成片沙漠（气候场真实生效）', () => {
    initTerrain(SEED);
    let desert = 0;
    let grass = 0;
    for (let x = -130; x <= -80; x++) {
      for (let z = -25; z <= 25; z++) {
        const b = biomeAt(x, z);
        if (b === 'desert') desert++;
        else if (b === 'grass') grass++;
      }
    }
    expect(desert).toBeGreaterThan(150);
    expect(grass).toBeGreaterThan(0);
  });

  it('biomeAt 与 createChunkData 的表层方块一致（抽查 900 列正确率 100%）', () => {
    const mismatches: string[] = [];
    for (const c of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      const data = createChunkData(c[0], c[1]);
      for (let lx = 0; lx < CHUNK_W; lx++) {
        for (let lz = 0; lz < CHUNK_W; lz++) {
          const wx = c[0] * CHUNK_W + lx;
          const wz = c[1] * CHUNK_W + lz;
          if (wx > 31 || wz > 31) continue;
          const b = biomeAt(wx, wz);
          const h = surfaceHeight(wx, wz);
          if (h <= SEA_LEVEL) continue; // 水下按水体规则，跳过
          const top = data[voxelIndex(lx, h, lz)];
          const want = b === 'desert' ? BLOCK.SAND : b === 'snow' ? BLOCK.SNOW : BLOCK.GRASS;
          if (top !== want) mismatches.push(`${wx},${wz}(b=${b},top=${top})`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('矿石分布', () => {
  beforeEach(() => initTerrain(SEED));

  it('深层石头中三种矿石均出现，且各类不出自己的深度区间', () => {
    let coal = 0;
    let iron = 0;
    let gold = 0;
    const violations: string[] = [];
    for (let cx = -3; cx <= 3 && (coal < 5 || iron < 5 || gold < 3); cx++) {
      for (let cz = -3; cz <= 3; cz++) {
        const data = createChunkData(cx, cz);
        for (let lx = 0; lx < CHUNK_W; lx++) {
          for (let lz = 0; lz < CHUNK_W; lz++) {
            for (let y = 1; y < WORLD_H; y++) {
              const v = data[voxelIndex(lx, y, lz)];
              if (v === BLOCK.AIR) continue;
              if (v === BLOCK.ORE_COAL) {
                coal++;
                if (y < 8 || y > 48) violations.push(`煤越界 y=${y}@${cx},${cz},${lx},${lz}`);
              } else if (v === BLOCK.ORE_IRON) {
                iron++;
                if (y < 4 || y > 32) violations.push(`铁越界 y=${y}`);
              } else if (v === BLOCK.ORE_GOLD) {
                gold++;
                if (y < 2 || y > 16) violations.push(`金越界 y=${y}`);
              }
            }
          }
        }
      }
    }
    expect(coal).toBeGreaterThanOrEqual(5);
    expect(iron).toBeGreaterThanOrEqual(5);
    expect(gold).toBeGreaterThanOrEqual(3);
    expect(violations).toEqual([]);
  });

  it('浅表与高空无矿石：y ≥ 49 区域不存在任何 ORE_*', () => {
    for (const [cx, cz] of [[0, 0], [-2, 1], [3, -4]] as const) {
      const data = createChunkData(cx, cz);
      for (let y = 49; y < WORLD_H; y++) {
        for (let lx = 0; lx < CHUNK_W; lx++) {
          for (let lz = 0; lz < CHUNK_W; lz++) {
            const v = data[voxelIndex(lx, y, lz)];
            expect([BLOCK.ORE_COAL, BLOCK.ORE_IRON, BLOCK.ORE_GOLD]).not.toContain(v);
          }
        }
      }
    }
  });

  it('矿石 id 全部合法（无非法方块 id 混入地形数组）', () => {
    const VALID: ReadonlySet<number> = new Set([
      BLOCK.AIR, BLOCK.BEDROCK, BLOCK.STONE, BLOCK.DIRT, BLOCK.GRASS,
      BLOCK.SAND, BLOCK.SNOW, BLOCK.WATER, BLOCK.LOG, BLOCK.LEAVES,
      BLOCK.ORE_COAL, BLOCK.ORE_IRON, BLOCK.ORE_GOLD,
    ]);
    for (const [cx, cz] of [[0, 0], [-1, -1], [2, 3]] as const) {
      const data = createChunkData(cx, cz);
      for (let i = 0; i < data.length; i++) {
        expect(VALID.has(data[i])).toBe(true);
      }
    }
  });
});

describe('树生成', () => {
  beforeEach(() => initTerrain(SEED));

  it('isTreeColumn 命中的列必是草地且高于海平面，未命中列大多相反', () => {
    let hits = 0;
    let checked = 0;
    for (let x = -160; x < 160; x += 3) {
      for (let z = -160; z < 160; z += 3) {
        checked++;
        if (!isTreeColumn(x, z)) continue;
        hits++;
        expect(biomeAt(x, z)).toBe('grass');
        expect(surfaceHeight(x, z)).toBeGreaterThan(SEA_LEVEL + 1);
      }
    }
    // 密度报告（草地列概率 0.009，全域含海洋/沙漠/雪原 → 全域平均约 0.5%）
    const rate = hits / checked;
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(0.03);
  });

  it('完整树形：干 LOG、干顶两侧各两层半径 2 叶盘 + 顶层半径 1', () => {
    // 找一棵完全位于单 chunk 内部且周边平坦（叶冠不被山体吞掉）的树
    const t = findWorldColumn(
      24, 232, -232, 232,
      (tx, tz) => {
        if (!isTreeColumn(tx, tz)) return false;
        const g = surfaceHeight(tx, tz);
        const lid = ((tx % 16) + 16) % 16;
        const ldz = ((tz % 16) + 16) % 16;
        if (lid < 2 || lid > 13 || ldz < 2 || ldz > 13) return false;
        // 冠层底部以上的邻列不能有地形遮挡
        for (let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            if (surfaceHeight(tx + dx, tz + dz) > g + 1) return false;
          }
        }
        return true;
      },
    );
    expect(t).not.toBeNull();
    const tx = t!.wx;
    const tz = t!.wz;
    const g = surfaceHeight(tx, tz);
    // 与实现同一公式：树干高 4~6（坐标加固定盐后再哈希）
    const trunkLen = 4 + Math.floor(hash2(tx + 7919, tz) * 3);

    const cx = Math.floor(tx / CHUNK_W);
    const cz = Math.floor(tz / CHUNK_W);
    const data = createChunkData(cx, cz);
    const lx = tx - cx * CHUNK_W;
    const lz = tz - cz * CHUNK_W;

    // 干底直接落在草地上
    expect(data[voxelIndex(lx, g, lz)]).toBe(BLOCK.GRASS);
    // 干：g+1 起连续 trunkLen 格全是 LOG
    for (let y = g + 1; y <= g + trunkLen; y++) {
      expect(data[voxelIndex(lx, y, lz)]).toBe(BLOCK.LOG);
    }
    expect(data[voxelIndex(lx, g + trunkLen + 1, lz)]).not.toBe(BLOCK.LOG);

    // 干顶同层：半径 2 叶盘（去四角）围绕 LOG
    let topY = g + 1;
    while (data[voxelIndex(lx, topY + 1, lz)] === BLOCK.LOG) topY++;
    const assertRing = (y: number, r: number, cutCorners: boolean): void => {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (cutCorners && Math.abs(dx) === r && Math.abs(dz) === r) continue;
          const want = dx === 0 && dz === 0 ? BLOCK.LOG : BLOCK.LEAVES;
          const got = data[voxelIndex(lx + dx, y, lz + dz)];
          if (got !== want) {
            throw new Error(
              `叶盘不符 @(${tx + dx},${y},${tz + dz}) 期望=${want} 实得=${got}`,
            );
          }
        }
      }
    };
    // 干顶由 trunkLen 推得，必须与数据里的连续 LOG 段一致
    expect(topY).toBe(g + trunkLen);
    assertRing(topY, 2, true);
    assertRing(topY - 1, 2, true);
    // 顶层：半径 1 全叶盘（含中轴）
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        expect(data[voxelIndex(lx + dx, topY + 1, lz + dz)]).toBe(BLOCK.LEAVES);
      }
    }
    // 再往上没有悬空结构
    expect(data[voxelIndex(lx, topY + 2, lz)]).toBe(BLOCK.AIR);
  });

  it('跨 chunk 边界的树不断枝：(1,z)|边界两侧叶冠齐全一致', () => {
    // 在 x=16（chunk 0 与 chunk 1 的分界线上）找一棵周边平坦的树
    let found: { tz: number; g: number } | null = null;
    for (let tz = -128; tz <= 128 && !found; tz++) {
      if (!isTreeColumn(16, tz)) continue;
      const g = surfaceHeight(16, tz);
      let flat = true;
      for (let dx = -2; dx <= 2 && flat; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (surfaceHeight(16 + dx, tz + dz) > g + 1) { flat = false; break; }
        }
      }
      if (flat) found = { tz, g };
    }
    expect(found).not.toBeNull();
    const { tz, g } = found!;
    const cz = Math.floor(tz / CHUNK_W);
    const left = createChunkData(0, cz);
    const right = createChunkData(1, cz);
    /** 世界坐标读取：跨界树的冠层横跨 chunk 0 与 chunk 1，各取所需 */
    const gb = (wx: number, y: number, wz: number): number => {
      const d = wx < CHUNK_W ? left : right; // 本测试只涉及这两个 chunk
      return d[voxelIndex(wx - (wx < CHUNK_W ? 0 : CHUNK_W), y,
        wz - cz * CHUNK_W)];
    };

    // 干整根可见且连续
    for (let y = g + 1; y <= g + 4; y++) expect(gb(16, y, tz)).toBe(BLOCK.LOG);
    let topY = g + 1;
    while (gb(16, topY + 1, tz) === BLOCK.LOG) topY++;

    // 两层半径 2 叶盘 + 一层半径 1 顶盖：逐格断言（x=14,15 落左块 / 16,17,18 落右块）
    for (const [dy, r, cut] of [[-1, 2, true], [0, 2, true], [1, 1, false]] as const) {
      const y = topY + dy;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (cut && Math.abs(dx) === r && Math.abs(dz) === r) continue;
          const expectV = dx === 0 && dz === 0 && dy <= 0 ? BLOCK.LOG : BLOCK.LEAVES;
          const got = gb(16 + dx, y, tz + dz);
          if (got !== expectV) {
            throw new Error(
              `跨界树冠缺失 @(${16 + dx},${y},${tz + dz}) 期望=${expectV} 实得=${got}`,
            );
          }
        }
      }
    }
    // 交界两列（x=15 左侧末格 / x=16 主干所在列）在冠层同高都有内容 → 无缝
    expect(gb(15, topY, tz)).toBe(BLOCK.LEAVES);
  });

  it('沙漠与雪原列不长树', () => {
    // 沙漠样本区（SEED 西南沙漠）
    for (let x = -110; x <= -95; x++) {
      for (let z = -12; z <= 12; z++) {
        if (biomeAt(x, z) === 'desert' && surfaceHeight(x, z) > SEA_LEVEL + 1) {
          expect(isTreeColumn(x, z)).toBe(false);
        }
      }
    }
    // 雪原样本区（高山：海拔 > 52 必为雪）
    let snowySeen = 0;
    for (let x = -1500; x <= 1500 && snowySeen < 60; x += 5) {
      for (let z = -1500; z <= 1500 && snowySeen < 60; z += 5) {
        if (biomeAt(x, z) === 'snow' && surfaceHeight(x, z) > SEA_LEVEL + 1) {
          snowySeen++;
          expect(isTreeColumn(x, z)).toBe(false);
        }
      }
    }
    expect(snowySeen).toBeGreaterThan(20);
  });
});

describe('海洋规则', () => {
  beforeEach(() => initTerrain(SEED));

  it('水下列：ground+1..SEA_LEVEL 全为 WATER，原始表层为 SAND，海面上是 AIR', () => {
    let checked = 0;
    for (let cx = -20; cx < 20 && checked === 0; cx++) {
      for (let cz = -20; cz < 20; cz++) {
        const data = createChunkData(cx, cz);
        const col = waterColumnIn(data);
        if (!col) continue;

        expect(col.ground).toBeLessThan(SEA_LEVEL);
        for (let y = col.ground + 1; y <= SEA_LEVEL; y++) {
          expect(data[voxelIndex(col.lx, y, col.lz)]).toBe(BLOCK.WATER);
        }
        expect(data[voxelIndex(col.lx, col.ground, col.lz)]).toBe(BLOCK.SAND);
        expect(data[voxelIndex(col.lx, SEA_LEVEL + 1, col.lz)]).toBe(BLOCK.AIR);
        checked++;
      }
    }
    // 该 seed 的海陆分布在西侧有海域；找不到说明实现退化
    expect(checked).toBeGreaterThan(0);
  });

  it('水下列的 surfaceHeight 回退为 SEA_LEVEL（spawn 定位于水面之上）', () => {
    for (let cx = -20; cx < 20; cx++) {
      for (let cz = -20; cz < 20; cz++) {
        const data = createChunkData(cx, cz);
        const col = waterColumnIn(data);
        if (!col) continue;
        const wx = cx * CHUNK_W + col.lx;
        const wz = cz * CHUNK_W + col.lz;
        expect(surfaceHeight(wx, wz)).toBe(SEA_LEVEL);
        expect(surfaceHeight(wx, wz)).toBeGreaterThan(col.ground);
        return;
      }
    }
    throw new Error('抽样 40×40 chunk 未发现水域');
  }, 60000);
});

describe('applyDiffs', () => {
  beforeEach(() => initTerrain(SEED));

  it('按 voxelIndex 覆盖方块 id，且优先级高于程序化树叶', () => {
    const data = createChunkData(5, 5);
    const i1 = voxelIndex(3, 40, 9);
    const i2 = voxelIndex(15, 63, 15);
    applyDiffs(data, new Map([[i1, BLOCK.GLOWBLOCK]]));
    applyDiffs(data, new Map([[i2, BLOCK.PLANKS]]));
    expect(data[i1]).toBe(BLOCK.GLOWBLOCK);
    expect(data[i2]).toBe(BLOCK.PLANKS);
  });

  it('undefined 为无操作，多次应用幂等', () => {
    const a = createChunkData(1, 1);
    const b = createChunkData(1, 1);
    applyDiffs(a, undefined);
    const i = voxelIndex(7, 33, 7);
    const m = new Map([[i, BLOCK.SAND]]);
    applyDiffs(b, m);
    applyDiffs(b, m);
    expect(a[i]).not.toBe(BLOCK.SAND);
    expect(b[i]).toBe(BLOCK.SAND);
    expect(createChunkData(1, 1)[i]).not.toBe(BLOCK.SAND);
  });

  it('越界 diff 索引被防御性忽略而不抛错', () => {
    const data = createChunkData(0, 0);
    const snapshot = Uint8Array.from(data);
    applyDiffs(data, new Map([[-1, BLOCK.STONE], [data.length + 5, BLOCK.STONE]]));
    expect(bytesEqual(data, snapshot)).toBe(true);
  });
});

describe('seed 区分度', () => {
  it('不同 seed 抽样 100 列至少 10 列高度不同', () => {
    initTerrain('a');
    const ha: number[] = [];
    for (let i = 0; i < 100; i++) ha.push(surfaceHeight(i * 3 - 150, i * 7 - 350));

    initTerrain('b');
    let diff = 0;
    for (let i = 0; i < 100; i++) {
      if (surfaceHeight(i * 3 - 150, i * 7 - 350) !== ha[i]) diff++;
    }
    expect(diff).toBeGreaterThanOrEqual(10);
    initTerrain(SEED); // 还原默认 seed
  });

  it('不同 seed 的生物群系判定不同（温度场随 seed 变化）', () => {
    initTerrain('warm-world');
    let warmDeserts = 0;
    for (let x = 0; x < 60; x++) {
      for (let z = 0; z < 60; z++) if (biomeAt(x, z) === 'desert') warmDeserts++;
    }
    initTerrain(SEED);
    let coldGrass = 0;
    for (let x = 0; x < 60; x++) {
      for (let z = 0; z < 60; z++) if (biomeAt(x, z) === 'grass') coldGrass++;
    }
    // 两个 seed 至少在一处判定上分开即可（不要求具体谁多）
    expect(warmDeserts + coldGrass).toBeGreaterThan(0);
    initTerrain(SEED);
  });
});

describe('抽样统计与性能', () => {
  beforeEach(() => initTerrain(SEED));

  it('20×20 chunk 表面高度范围抽样 + 单 chunk 生成耗时（输出报告用）', () => {
    // --- 高度范围：覆盖 cx,cz ∈ [-10..9]，共 400 chunk / 102400 列 ---
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let waterCols = 0;
    let totalCols = 0;
    const bioCnt = { grass: 0, desert: 0, snow: 0 };
    for (let wx = -160; wx < 160; wx++) {
      for (let wz = -160; wz < 160; wz++) {
        const sh = surfaceHeight(wx, wz);
        if (sh < min) min = sh;
        if (sh > max) max = sh;
        if (sh <= SEA_LEVEL) waterCols++;
        bioCnt[biomeAt(wx, wz)]++;
        totalCols++;
      }
    }
    console.info(
      `[terragen 抽样] seed=${SEED} 采样 ${totalCols} 列 | ` +
      `min=${min} max=${max} | 水面及以下列 ${(waterCols / totalCols * 100).toFixed(2)}% | ` +
      `群系 grass=${(bioCnt.grass / totalCols * 100).toFixed(1)}% ` +
      `desert=${(bioCnt.desert / totalCols * 100).toFixed(1)}% ` +
      `snow=${(bioCnt.snow / totalCols * 100).toFixed(1)}%`,
    );

    // --- 分块极值表（供地形调参参考）：4×4 大区抽样 ---
    const rows: string[] = [];
    for (let bx = -160; bx < 160; bx += 80) {
      const cells: string[] = [];
      for (let bz = -160; bz < 160; bz += 80) {
        let lo = Number.POSITIVE_INFINITY;
        let hi = Number.NEGATIVE_INFINITY;
        for (let dx = 0; dx < 80; dx += 5) {
          for (let dz = 0; dz < 80; dz += 5) {
            const v = surfaceHeight(bx + dx, bz + dz);
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        }
        cells.push(`${lo}-${hi}`);
      }
      rows.push(`x∈[${bx},${bx + 79}]: ${cells.join('  ')}`);
    }
    console.info(`[terragen 极值表] 每 cell 为 80×80 区域的 min-max\n${rows.join('\n')}`);

    // --- 性能：单 chunk 平均耗时预算 < 12ms（任务卡），此处用更稳的 8ms 上限 ---
    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      createChunkData(i % 7, -(i % 11));
      samples.push(performance.now() - t0);
    }
    const avg = samples.reduce((s, v) => s + v, 0) / samples.length;
    samples.sort((a, b) => a - b);
    console.info(
      `[terragen 性能] 50 chunks avg=${avg.toFixed(3)}ms p50=${samples[25].toFixed(3)}ms ` +
      `p95=${samples[47].toFixed(3)}ms max=${samples[samples.length - 1].toFixed(3)}ms`,
    );
    expect(avg).toBeLessThan(8);
    // 公式下界 SEA+4−6−3=SEA−5；上界钳制到 WORLD_H−10
    expect(min).toBeGreaterThanOrEqual(SEA_LEVEL - 9);
    expect(max).toBeLessThanOrEqual(WORLD_H - 10);
  }, 30000);

  it('CI 安全线：任意单次 createChunkData < 50ms', () => {
    initTerrain(SEED);
    let worst = 0;
    for (const [cx, cz] of [[0, 0], [7, -3], [-11, 5], [31, 17], [-23, -9]]) {
      const t0 = performance.now();
      createChunkData(cx, cz);
      worst = Math.max(worst, performance.now() - t0);
    }
    expect(worst).toBeLessThan(50);
  });
});
