// data/regions/parts/east2.ts —— 华东沿海：沪浙闽（W4 波拥有：地形定制 +
// 东方明珠+石库门/雷峰塔/圆形土楼 结构表）。当前为 W0 契约占位：地形参数 =
// generic 逐字段副本，structures 留空，待 W4 填入。

import type { RegionGroup } from '../index';

export const east2Regions: RegionGroup<'shanghai' | 'zhejiang' | 'fujian'> = {
  /** 上海：十里洋场摩登都会（W4 定制 + 东方明珠/石库门） */
  shanghai: {
    id: 'shanghai',
    name: '上海',
    blurb: '十里洋场摩登都会 · 石库门与东方明珠 · 美食：小笼包、生煎',
    mapColor: '#7f8fae', // 都会蓝灰（邻江苏水乡青绿、浙江黛青）
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
      structures: [], // W4 填入
    },
    atmosphere: { fogScale: 1 },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 1 },
      { key: 'sheep', weight: 1 },
    ],
    animalGround: ['GRASS'],
  },

  /** 浙江：江南水乡丝绸之府（W4 定制 + 雷峰塔） */
  zhejiang: {
    id: 'zhejiang',
    name: '浙江',
    blurb: '江南水乡丝绸之府 · 雷峰塔与西湖 · 美食：西湖醋鱼、东坡肉',
    mapColor: '#3f7f8f', // 西湖黛青（邻上海蓝灰、江苏水乡青绿、安徽徽墨、福建闽南红）
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
      structures: [], // W4 填入
    },
    atmosphere: { fogScale: 1 },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 1 },
      { key: 'sheep', weight: 1 },
    ],
    animalGround: ['GRASS'],
  },

  /** 福建：八山一水一分田（W4 定制 + 圆形土楼） */
  fujian: {
    id: 'fujian',
    name: '福建',
    blurb: '八山一水一分田 · 圆形土楼 · 美食：沙茶面、佛跳墙',
    mapColor: '#c97f5f', // 闽南红砖（邻浙江黛青、江西赣紫、广东岭南暖金）
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
      structures: [], // W4 填入
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
