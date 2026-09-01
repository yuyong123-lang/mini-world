// data/regions/parts/huanghe.ts —— 黄河省份：晋鲁豫陕（W2 波拥有：地形定制 +
// 应县木塔/孔庙大成殿+海草房/塔林/大雁塔 结构表）。当前为 W0 契约占位：
// 地形参数 = generic 逐字段副本，structures 留空，待 W2 填入。

import type { RegionGroup } from '../index';

export const huangheRegions: RegionGroup<'shanxi' | 'shandong' | 'henan' | 'shaanxi'> = {
  /** 山西：表里山河黄土高原（W2 定制 + 应县木塔） */
  shanxi: {
    id: 'shanxi',
    name: '山西',
    blurb: '表里山河黄土高原 · 应县木塔与晋商大院 · 美食：刀削面、老陈醋',
    mapColor: '#a8824f', // 黄土棕（邻河北橄榄、陕西赭红、河南中原绿）
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
      structures: [], // W2 填入
    },
    atmosphere: { fogScale: 1 },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 1 },
      { key: 'sheep', weight: 1 },
    ],
    animalGround: ['GRASS'],
  },

  /** 山东：齐鲁大地孔孟之乡（W2 定制 + 孔庙大成殿/海草房） */
  shandong: {
    id: 'shandong',
    name: '山东',
    blurb: '齐鲁大地孔孟之乡 · 胶东海草房 · 美食：煎饼卷大葱、鲅鱼水饺',
    mapColor: '#c2b070', // 胶东沙金（邻河北橄榄、河南中原绿、江苏水乡青）
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
      structures: [], // W2 填入
    },
    atmosphere: { fogScale: 1 },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 1 },
      { key: 'sheep', weight: 1 },
    ],
    animalGround: ['GRASS'],
  },

  /** 河南：中原沃土华夏之源（W2 定制 + 少林塔林） */
  henan: {
    id: 'henan',
    name: '河南',
    blurb: '中原沃土华夏之源 · 少林塔林 · 美食：烩面、胡辣汤',
    mapColor: '#97b06a', // 中原绿（邻山西黄土、陕西赭红、山东沙金、湖北荆楚青）
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
      structures: [], // W2 填入
    },
    atmosphere: { fogScale: 1 },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 1 },
      { key: 'sheep', weight: 1 },
    ],
    animalGround: ['GRASS'],
  },

  /** 陕西：八百里秦川（W2 定制 + 大雁塔） */
  shaanxi: {
    id: 'shaanxi',
    name: '陕西',
    blurb: '八百里秦川 · 大雁塔与古城垣 · 美食：羊肉泡馍、肉夹馍',
    mapColor: '#b34f4f', // 秦川赭红（邻山西黄土、河南中原绿、甘肃深赭、四川盆地绿）
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
      structures: [], // W2 填入
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
