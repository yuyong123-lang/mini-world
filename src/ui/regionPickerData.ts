// ui/regionPickerData.ts —— 选区数据的纯数据层 + 模块级硬校验（node 可安全 import，零 DOM）。
// 地图几何在 chinaGeo.ts（真实省界轮廓：DataV GeoAtlas 简化内嵌，Douglas-Peucker 0.045°）。
// 旧版 48×40 字符像素图已被矢量轮廓取代；本文件保留「可点选区域清单」的唯一权威来源。

import { REGIONS, type RegionId } from '../data/regions';
import { CHINA_GEO } from './chinaGeo';

function fail(msg: string): never {
  throw new Error(`regionPickerData: ${msg}`);
}

// ---- 模块级硬校验：数据残缺在启动即抛错，而不是运行时点不到/点错 ----
const IDS = Object.keys(CHINA_GEO);
if (IDS.length !== 34) fail(`省份数 ${IDS.length} ≠ 34`);
for (const id of IDS) {
  if (!(id in REGIONS)) fail(`CHINA_GEO 的 '${id}' 不在 REGIONS 表`);
  const rings = CHINA_GEO[id]!;
  if (rings.length === 0) fail(`'${id}' 无多边形环`);
  for (const ring of rings) {
    if (ring.length < 3) fail(`'${id}' 存在少于 3 点的环`);
    for (const pt of ring) {
      const [lon, lat] = pt as readonly number[];
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) fail(`'${id}' 坐标含非有限值`);
      if (lon < 73 || lon > 136 || lat < 3 || lat > 54) fail(`'${id}' 坐标越界 (${lon},${lat})`);
    }
  }
}
if ('dongbei' in CHINA_GEO) fail('dongbei 不应出现在选区数据（遗留区域：在表不在图）');
if ('generic' in CHINA_GEO) fail('generic 不应出现在选区数据');

/** 可点选区域清单（= 选区图上的 34 个省级行政区；随机选择同样从这里取） */
export const PICKABLE: readonly RegionId[] = IDS as RegionId[];
