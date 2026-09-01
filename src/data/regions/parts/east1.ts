// data/regions/parts/east1.ts —— 华东内陆：苏皖赣（W4 波拥有：地形定制 +
// 苏州园林/徽派马头墙民居/滕王阁 结构表）。当前为 W0 契约占位：地形参数 =
// generic 逐字段副本，structures 留空，待 W4 填入。

import type { RegionGroup } from '../index';

export const east1Regions: RegionGroup<'jiangsu' | 'anhui' | 'jiangxi'> = {
  /** 江苏：水乡园林鱼米之乡（W4 定制 + 苏州园林） */
  jiangsu: {
    id: 'jiangsu',
    name: '江苏',
    blurb: '水乡园林鱼米之乡 · 苏州园林 · 美食：盐水鸭、松鼠桂鱼',
    mapColor: '#6fae8f', // 水乡青绿（邻山东沙金、安徽徽墨、浙江黛青、上海蓝灰）
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

  /** 安徽：徽山皖水（W4 定制 + 徽派马头墙民居） */
  anhui: {
    id: 'anhui',
    name: '安徽',
    blurb: '徽山皖水 · 马头墙徽派民居 · 美食：臭鳜鱼、毛豆腐',
    mapColor: '#7f7f5f', // 徽墨橄榄灰（邻江苏水乡青绿、河南中原绿、江西赣紫、湖北荆楚青）
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

  /** 江西：赣鄱大地（W4 定制 + 滕王阁） */
  jiangxi: {
    id: 'jiangxi',
    name: '江西',
    blurb: '赣鄱大地 · 滕王阁临江 · 美食：瓦罐汤、米粉',
    mapColor: '#8f7fae', // 赣鄱紫（邻安徽徽墨、湖北荆楚青、湖南湘绿、福建闽南红）
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
