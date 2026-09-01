// data/regions/parts/mid1.ts —— 两湖：鄂湘（W5 波拥有：地形定制 +
// 黄鹤楼/岳阳楼+湘西吊脚楼 结构表）。当前为 W0 契约占位：地形参数 =
// generic 逐字段副本，structures 留空，待 W5 填入。

import type { RegionGroup } from '../index';

export const mid1Regions: RegionGroup<'hubei' | 'hunan'> = {
  /** 湖北：千湖之省九省通衢（W5 定制 + 黄鹤楼） */
  hubei: {
    id: 'hubei',
    name: '湖北',
    blurb: '千湖之省九省通衢 · 黄鹤楼 · 美食：热干面、武昌鱼',
    mapColor: '#5fae9f', // 荆楚青（邻河南中原绿、安徽徽墨、江西赣紫、湖南湘绿、重庆山城橙）
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

  /** 湖南：三湘四水（W5 定制 + 岳阳楼/湘西吊脚楼） */
  hunan: {
    id: 'hunan',
    name: '湖南',
    blurb: '三湘四水 · 湘西吊脚楼与岳阳楼 · 美食：剁椒鱼头、臭豆腐',
    mapColor: '#6f9f4f', // 湘西林绿（邻湖北荆楚青、江西赣紫、广东岭南暖金、广西桂北蓝、贵州黔山青）
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
