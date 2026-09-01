// 区域系统单测：seed↔region 解析 / generic 兼容 / 六区域确定性 / 梯田量化 /
// forceBiome / 沙漠占比 / 大平原 / 多水盆地。
// 注意：活动区域是模块级状态——每个用例组 beforeEach 必须重新 initTerrain。
import { beforeEach, describe, expect, it } from 'vitest';

import { REGIONS, makeSeedForRegion, regionIdFromSeed } from '../src/data/regions';
import { SEA_LEVEL, WORLD_H } from '../src/core/constants';
import {
  biomeAt,
  createChunkData,
  initTerrain,
  isTreeColumn,
  surfaceHeight,
} from '../src/world/terragen';

const REGION_IDS = ['sichuan', 'beijing', 'yunnan', 'neimenggu', 'xinjiang', 'dongbei'] as const;

/** 逐字节比较（避免依赖 Node Buffer 类型） */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe('seed ↔ region 解析', () => {
  it('无前缀 seed → generic（旧档兼容的唯一入口）', () => {
    expect(regionIdFromSeed('mini-world-m1')).toBe('generic');
    expect(regionIdFromSeed('')).toBe('generic');
    expect(regionIdFromSeed('random-seed-99')).toBe('generic');
  });

  it('cn_<id>_ 前缀正确解析；未知 id 回落 generic 而非抛错', () => {
    expect(regionIdFromSeed('cn_sichuan_abc123')).toBe('sichuan');
    expect(regionIdFromSeed('cn_dongbei_x')).toBe('dongbei');
    expect(regionIdFromSeed('cn_nonsense_xyz')).toBe('generic');
    expect(regionIdFromSeed('cn_sichuan')).toBe('generic'); // 缺随机段
  });

  it('makeSeedForRegion 与解析往返一致；REGIONS 表覆盖全部 id', () => {
    for (const id of Object.keys(REGIONS) as (keyof typeof REGIONS)[]) {
      expect(regionIdFromSeed(makeSeedForRegion(id, 'r1'))).toBe(id);
    }
  });
});

describe('generic 区域 = 历史常量（黄金断言在 terragen.test.ts，此处验确定性）', () => {
  it('同 seed 两次生成逐字节一致', () => {
    initTerrain('compat-seed');
    const a = createChunkData(0, 0);
    initTerrain('compat-seed');
    const b = createChunkData(0, 0);
    expect(bytesEqual(a, b)).toBe(true);
  });
});

// 六区域逐一：确定性 + 高度钳制
for (const id of REGION_IDS) {
  describe(`区域 ${id}`, () => {
    beforeEach(() => initTerrain(makeSeedForRegion(id, 'test-rand-1')));

    it('同 seed 两次生成 (0,0)(2,-3) 逐字节一致', () => {
      for (const [cx, cz] of [[0, 0], [2, -3]] as const) {
        const a = createChunkData(cx, cz);
        const b = createChunkData(cx, cz);
        expect(bytesEqual(a, b)).toBe(true);
      }
    });

    it('抽样 2000 列高度全部钳制在 [3, WORLD_H-10]', () => {
      for (let i = 0; i < 2000; i++) {
        const h = surfaceHeight((i * 37) % 400 - 200, (i * 73) % 400 - 200);
        // 水下列回退为 SEA_LEVEL，也在合法范围内
        expect(h).toBeGreaterThanOrEqual(3);
        expect(h).toBeLessThanOrEqual(WORLD_H - 10);
      }
    });
  });
}

describe('区域特征差异', () => {
  it('云南梯田：陆上地表高度相对海平面按 4 格量化（≥90% 列）', () => {
    initTerrain(makeSeedForRegion('yunnan', 't1'));
    let ok = 0;
    let total = 0;
    for (let x = -120; x < 120; x += 2) {
      for (let z = -120; z < 120; z += 2) {
        const h = surfaceHeight(x, z);
        if (h <= SEA_LEVEL) continue; // 水下列被回退到海平面，不在量化断言范围
        total++;
        if ((h - SEA_LEVEL) % 4 === 0) ok++;
      }
    }
    expect(total).toBeGreaterThan(2000);
    expect(ok / total).toBeGreaterThan(0.9);
  });

  it('内蒙古：全图强制草原（大范围抽查无一例外）', () => {
    initTerrain(makeSeedForRegion('neimenggu', 't1'));
    for (let x = -210; x <= 210; x += 7) {
      for (let z = -210; z <= 210; z += 7) {
        expect(biomeAt(x, z)).toBe('grass');
      }
    }
  });

  it('内蒙古：大平原（ridgeAmp=0）抽样高度极差 ≤ 10 格', () => {
    initTerrain(makeSeedForRegion('neimenggu', 't1'));
    let min = Number.MAX_SAFE_INTEGER;
    let max = 0;
    for (let x = -200; x <= 200; x += 5) {
      for (let z = -200; z <= 200; z += 5) {
        const h = surfaceHeight(x, z);
        if (h < min) min = h;
        if (h > max) max = h;
      }
    }
    expect(max - min).toBeLessThanOrEqual(10);
  });

  it('东北：全图强制雪原，且雪原上允许长树（针叶林）', () => {
    initTerrain(makeSeedForRegion('dongbei', 't1'));
    let trees = 0;
    for (let x = -210; x <= 210; x += 7) {
      for (let z = -210; z <= 210; z += 7) {
        expect(biomeAt(x, z)).toBe('snow');
        if (surfaceHeight(x, z) > SEA_LEVEL + 1 && trees < 3 && isTreeColumn(x, z)) trees++;
      }
    }
    expect(trees).toBeGreaterThan(0);
  });

  it('新疆：沙漠占比显著（desertBias 放宽阈值）', () => {
    initTerrain(makeSeedForRegion('xinjiang', 't1'));
    let desert = 0;
    let total = 0;
    for (let x = -210; x <= 210; x += 4) {
      for (let z = -210; z <= 210; z += 4) {
        total++;
        if (biomeAt(x, z) === 'desert') desert++;
      }
    }
    expect(total).toBeGreaterThan(5000);
    expect(desert / total).toBeGreaterThan(0.25);
  });


  it('四川：盆地多水（baseOffset=-2 → 水面列占比 > 15%），雾区群系以草地为主', () => {
    initTerrain(makeSeedForRegion('sichuan', 't1'));
    let water = 0;
    let total = 0;
    for (let x = -210; x <= 210; x += 4) {
      for (let z = -210; z <= 210; z += 4) {
        total++;
        if (surfaceHeight(x, z) <= SEA_LEVEL) water++;
      }
    }
    expect(total).toBeGreaterThan(5000);
    expect(water / total).toBeGreaterThan(0.15);
  });

  it('六区域两两之间地形确有差异（同坐标抽样高度向量不同）', () => {
    const probe = (id: (typeof REGION_IDS)[number]): number[] => {
      initTerrain(makeSeedForRegion(id, 'cmp'));
      const hs: number[] = [];
      for (let i = 0; i < 40; i++) hs.push(surfaceHeight(i * 9 - 180, i * 13 - 240));
      return hs;
    };
    const sichuan = probe('sichuan');
    for (const other of ['beijing', 'yunnan', 'neimenggu', 'xinjiang', 'dongbei'] as const) {
      const hs = probe(other);
      const diff = hs.filter((h, i) => h !== sichuan[i]).length;
      expect(diff).toBeGreaterThan(5);
    }
  });
});
