// data/regions/parts/taiwan.ts —— 台湾（W5 波拥有：地形定制 + 台北101/
// 闽南红砖古厝 结构表）。当前为 W0 契约占位：地形参数 = generic 逐字段副本，
// structures 留空，待 W5 填入。

import type { RegionGroup } from '../index';

export const taiwanRegions: RegionGroup<'taiwan'> = {
  /** 台湾：宝岛山海（W5 定制 + 台北101/闽南红砖古厝） */
  taiwan: {
    id: 'taiwan',
    name: '台湾',
    blurb: '宝岛山海 · 闽南红砖古厝与台北101 · 美食：卤肉饭、珍珠奶茶',
    mapColor: '#b06f8f', // 宝岛洋红（海上岛屿，与闽粤沿海色系区分）
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
      structures: [], // W5 填入
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
