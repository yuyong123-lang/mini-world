// 选区地图数据单测（node 环境，零 DOM——chinaGeo.ts / regionPickerData.ts 是纯数据模块）：
// 34 省齐全 / 几何合法 / PICKABLE 派生 / dongbei「在表不在图」。
// 地图为真实省界轮廓（DataV GeoAtlas 简化内嵌），旧字符像素图已退役。
import { describe, expect, it } from 'vitest';

import { REGIONS } from '../src/data/regions';
import { CHINA_GEO, CHINA_LABELS } from '../src/ui/chinaGeo';
import { PICKABLE } from '../src/ui/regionPickerData';

const EXPECT_34 = [
  'beijing', 'tianjin', 'shanghai', 'chongqing',
  'hebei', 'shanxi', 'liaoning', 'jilin', 'heilongjiang',
  'jiangsu', 'zhejiang', 'anhui', 'fujian', 'jiangxi', 'shandong', 'henan',
  'hubei', 'hunan', 'guangdong', 'hainan', 'sichuan', 'guizhou', 'yunnan',
  'shaanxi', 'gansu', 'qinghai', 'taiwan',
  'neimenggu', 'guangxi', 'xizang', 'ningxia', 'xinjiang',
  'hongkong', 'aomen',
] as const;

describe('CHINA_GEO 省界数据', () => {
  it('恰好 34 个省级行政区，且与清单一致', () => {
    expect(Object.keys(CHINA_GEO).sort()).toEqual([...EXPECT_34].sort());
  });

  it('每省至少 1 个环、每环至少 3 个有限坐标点、经纬度在中国范围', () => {
    for (const [id, rings] of Object.entries(CHINA_GEO)) {
      expect(rings.length, id).toBeGreaterThan(0);
      for (const ring of rings) {
        expect(ring.length, `${id} 环点数`).toBeGreaterThanOrEqual(3);
        for (const pt of ring) {
          const [lon, lat] = pt as number[];
          expect(Number.isFinite(lon) && Number.isFinite(lat), `${id} 坐标有限`).toBe(true);
          expect(lon, `${id} lon`).toBeGreaterThanOrEqual(73);
          expect(lon, `${id} lon`).toBeLessThanOrEqual(136);
          expect(lat, `${id} lat`).toBeGreaterThanOrEqual(3);
          expect(lat, `${id} lat`).toBeLessThanOrEqual(54);
        }
      }
    }
  });

  it('主图 bbox 覆盖疆域四至（漠河/喀什/抚远/三亚量级）', () => {
    let minLon = 999, maxLon = -999, maxLat = -999;
    for (const rings of Object.values(CHINA_GEO)) {
      for (const ring of rings) {
        for (const pt of ring) {
          const [lon, lat] = pt as number[];
          if (lat < 17) continue; // 南海诸岛不参与主图 bbox（与渲染层一致）
          minLon = Math.min(minLon, lon);
          maxLon = Math.max(maxLon, lon);
          maxLat = Math.max(maxLat, lat);
        }
      }
    }
    expect(minLon).toBeLessThan(74);    // 帕米尔
    expect(maxLon).toBeGreaterThan(134); // 抚远
    expect(maxLat).toBeGreaterThan(53);  // 漠河
  });

  it('大型省份轮廓点数不低于简化保底（防止过度抽稀丢形）', () => {
    const FLOORS: Partial<Record<string, number>> = {
      xinjiang: 300, neimenggu: 400, xizang: 300, qinghai: 250,
      heilongjiang: 250, gansu: 300, sichuan: 250, yunnan: 300,
    };
    for (const [id, floor] of Object.entries(FLOORS)) {
      let pts = 0;
      for (const ring of CHINA_GEO[id]!) pts += ring.length;
      expect(pts, id).toBeGreaterThanOrEqual(floor!);
    }
  });
});

describe('CHINA_LABELS 省名标注锚点', () => {
  it('34 省齐全且与 CHINA_GEO 键一致', () => {
    expect(Object.keys(CHINA_LABELS).sort()).toEqual(Object.keys(CHINA_GEO).sort());
  });

  it('坐标有限且在中国范围内', () => {
    for (const [id, [lon, lat]] of Object.entries(CHINA_LABELS)) {
      expect(Number.isFinite(lon) && Number.isFinite(lat), id).toBe(true);
      expect(lon).toBeGreaterThanOrEqual(73);
      expect(lon).toBeLessThanOrEqual(136);
      expect(lat).toBeGreaterThanOrEqual(18);
      expect(lat).toBeLessThanOrEqual(54);
    }
  });
});

describe('PICKABLE 可选区域清单', () => {
  it('= CHINA_GEO 键集（34 项）且全部在 REGIONS', () => {
    expect([...PICKABLE].sort()).toEqual(Object.keys(CHINA_GEO).sort());
    expect(PICKABLE).toHaveLength(34);
    for (const id of PICKABLE) expect(id in REGIONS).toBe(true);
  });

  it('遗留 dongbei 在表不在图；generic 不在图', () => {
    expect('dongbei' in REGIONS).toBe(true);
    expect(PICKABLE).not.toContain('dongbei');
    expect(PICKABLE).not.toContain('generic');
  });
});
