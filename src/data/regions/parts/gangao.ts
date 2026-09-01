// data/regions/parts/gangao.ts —— 港澳（W6 波拥有：地形定制 +
// 中银大厦+高层住宅/大三巴+葡式粉彩小楼 结构表）。当前为 W0 契约占位：
// 地形参数 = generic 逐字段副本，structures 留空，待 W6 填入。

import type { RegionGroup } from '../index';

export const gangaoRegions: RegionGroup<'hongkong' | 'aomen'> = {
  /** 香港：东方之珠维港（W6 定制 + 中银大厦/高层住宅） */
  hongkong: {
    id: 'hongkong',
    name: '香港',
    blurb: '东方之珠维港 · 中银大厦与摩天楼群 · 美食：茶餐厅、烧味',
    mapColor: '#d46f8f', // 维港洋红（邻广东岭南暖金）
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
      structures: [], // W6 填入
    },
    atmosphere: { fogScale: 1 },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 1 },
      { key: 'sheep', weight: 1 },
    ],
    animalGround: ['GRASS'],
  },

  /** 澳门：中西交汇（W6 定制 + 大三巴牌坊/葡式粉彩小楼） */
  aomen: {
    id: 'aomen',
    name: '澳门',
    blurb: '中西交汇四百载 · 大三巴牌坊与葡式小楼 · 美食：葡挞、猪扒包',
    mapColor: '#c9a05f', // 葡式沙金（邻广东岭南暖金、香港维港洋红）
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
      structures: [], // W6 填入
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
