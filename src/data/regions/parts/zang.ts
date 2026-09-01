// data/regions/parts/zang.ts —— 青藏高原：青海+西藏（W3 波拥有：地形定制 +
// 塔尔寺八宝塔/藏式碉房、布达拉宫）。当前为 W0 契约占位：地形参数 =
// generic 逐字段副本，structures 留空，待 W3 填入。

import type { RegionGroup } from '../index';

export const zangRegions: RegionGroup<'qinghai' | 'xizang'> = {
  /** 青海：江河源头高原湖泊（W3 定制 + 塔尔寺八宝塔群/藏式碉房） */
  qinghai: {
    id: 'qinghai',
    name: '青海',
    blurb: '江河源头高原湖泊 · 塔尔寺八宝塔 · 美食：手抓羊肉、老酸奶',
    mapColor: '#6f9fc8', // 高原湖蓝（邻甘肃深赭、西藏雪域紫、新疆沙金）
    terrain: {
      baseOffset: 4,
      contAmp: 6,
      hillsAmp: 3,
      ridgeAmp: 26,
      tempBias: 0,
      desertBias: 0,
      snowBias: 0,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: { chance: 0.009, kinds: [{ kind: 'oak', weight: 1 }], onBiomes: ['grass'] },
      structures: [], // W3 填入
    },
    atmosphere: { fogScale: 1 },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 1 },
      { key: 'sheep', weight: 1 },
    ],
    animalGround: ['GRASS'],
  },

  /** 西藏：世界屋脊雪域圣地（W3 定制 + 布达拉宫/藏式碉房） */
  xizang: {
    id: 'xizang',
    name: '西藏',
    blurb: '世界屋脊雪域圣地 · 布达拉宫与藏式碉房 · 美食：糌粑、酥油茶',
    mapColor: '#8f6fae', // 雪域紫（邻青海湖蓝、新疆沙金、四川盆地绿、云南暖橙）
    terrain: {
      baseOffset: 4,
      contAmp: 6,
      hillsAmp: 3,
      ridgeAmp: 26,
      tempBias: 0,
      desertBias: 0,
      snowBias: 0,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: { chance: 0.009, kinds: [{ kind: 'oak', weight: 1 }], onBiomes: ['grass'] },
      structures: [], // W3 填入
    },
    atmosphere: { fogScale: 1 },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 1 },
      { key: 'sheep', weight: 1 },
    ],
    animalGround: ['GRASS'],
  },
};
