// data/regions/parts/huanghe.ts —— 黄河省份（W2 波定制）：晋鲁豫陕。
//   shanxi 黄土高原沟壑（晋中大院 + 应县木塔）/ shandong 泰山与胶东海岸（海草房 + 孔庙）/
//   henan 中原沃野（民居 + 少林塔林）/ shaanxi 关中平原 + 秦岭（关中民居 + 大雁塔）。
// 四区均为 W2 新定制（无 legacy 覆盖位）；参数风格与 W1 波（dongbei3/jingjinji）同族：
//   地形振幅按地貌写意、树表混交乡土树种、结构表「常见民居 + 稀有地标」双条目、
//   动物表以家畜为主（陕西加秦岭大熊猫稀有位 ≤0.08）。

import type { RegionGroup } from '../index';

export const huangheRegions: RegionGroup<'shanxi' | 'shandong' | 'henan' | 'shaanxi'> = {
  /** 山西：表里山河黄土高原（W2 定制 + 应县木塔） */
  shanxi: {
    id: 'shanxi',
    name: '山西',
    blurb: '黄土高原沟壑纵横 · 应县木塔与平遥古城 · 美食：刀削面、老陈醋',
    mapColor: '#a8824f', // 黄土棕（邻河北橄榄、陕西赭红、河南中原绿）
    terrain: {
      baseOffset: 1,
      contAmp: 4,
      hillsAmp: 5, // 沟壑丘陵（四区最碎）
      ridgeAmp: 16, // 吕梁/太行山脊
      tempBias: 0,
      desertBias: 0.2, // 干燥：沙地偶见
      snowBias: 0.25,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.008,
        kinds: [
          { kind: 'oak', weight: 0.6 },
          { kind: 'poplar', weight: 0.4 }, // 杨树（高原行道树）
        ],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'siheyuan', cellDensity: 0.12 }, // 晋中大院（复用四合院形制）
        { kind: 'yingxian_pagoda', cellDensity: 0.02 }, // 应县木塔（地标，稀有）
      ],
    },
    atmosphere: {
      sky: {
        noon: { top: '#a8c0d4', bottom: '#d8c8a0', fog: '#d4c69c' }, // 干燥微黄天空
      },
      fogScale: 1.1,
      waterTint: '#8a7a4a', // 黄河土黄
    },
    animals: [
      { key: 'sheep', weight: 1.5 },
      { key: 'cow', weight: 1 },
      { key: 'pig', weight: 0.5 },
    ],
    animalGround: ['GRASS'],
  },

  /** 山东：齐鲁大地孔孟之乡（W2 定制 + 孔庙大成殿/海草房） */
  shandong: {
    id: 'shandong',
    name: '山东',
    blurb: '泰山巍峨孔庙庄严 · 胶东海草房与碧海 · 美食：煎饼卷大葱、鲅鱼水饺',
    mapColor: '#c2b070', // 胶东沙金（邻河北橄榄、河南中原绿、江苏水乡青）
    terrain: {
      baseOffset: 1,
      contAmp: 4,
      hillsAmp: 4,
      ridgeAmp: 14, // 泰山沂蒙山脊
      tempBias: 0,
      desertBias: 0,
      snowBias: 0.2,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.01,
        kinds: [
          { kind: 'oak', weight: 0.6 },
          { kind: 'pagoda', weight: 0.4 }, // 国槐（孔庙古树）
        ],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'seaweed_house', cellDensity: 0.15 }, // 胶东海草房（常见）
        { kind: 'confucius_hall', cellDensity: 0.02 }, // 孔庙大成殿（地标，稀有）
      ],
    },
    atmosphere: {
      sky: {
        noon: { top: '#8fc8f8', bottom: '#d0e8f8', fog: '#d0e8f8' }, // 晴朗海蓝
      },
      fogScale: 1,
      waterTint: '#3a6a9a', // 渤海蓝
    },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 1 },
      { key: 'sheep', weight: 0.8 },
    ],
    animalGround: ['GRASS'],
  },

  /** 河南：中原沃土华夏之源（W2 定制 + 少林塔林） */
  henan: {
    id: 'henan',
    name: '河南',
    blurb: '中原沃野平畴千里 · 少林塔林与龙门石窟 · 美食：烩面、胡辣汤',
    mapColor: '#97b06a', // 中原绿（邻山西黄土、陕西赭红、山东沙金、湖北荆楚青）
    terrain: {
      baseOffset: 1,
      contAmp: 3,
      hillsAmp: 2.5, // 沃野平缓（四区最平，利农耕）
      ridgeAmp: 8, // 仅西部边缘低山
      tempBias: 0,
      desertBias: 0,
      snowBias: 0.25,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.009,
        kinds: [
          { kind: 'pagoda', weight: 0.5 }, // 国槐/古柏（中原村落树）
          { kind: 'oak', weight: 0.5 },
        ],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'house', cellDensity: 0.15 }, // 中原民居（复用川西民居形制）
        { kind: 'pagoda_forest', cellDensity: 0.02 }, // 少林塔林（地标，稀有）
      ],
    },
    atmosphere: {
      sky: { noon: { top: '#8fc4f5', bottom: '#c8e0f0', fog: '#c8e0f0' } }, // 参照北京
      fogScale: 1,
      waterTint: '#4a7a9a',
    },
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
      baseOffset: 1,
      contAmp: 4,
      hillsAmp: 3.5,
      ridgeAmp: 14, // 秦岭北麓
      tempBias: 0,
      desertBias: 0.25, // 关中偏干燥（黄土台塬）
      snowBias: 0.3,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.008,
        kinds: [
          { kind: 'poplar', weight: 0.6 }, // 关中杨树
          { kind: 'oak', weight: 0.4 },
        ],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'siheyuan', cellDensity: 0.15 }, // 关中民居（复用四合院形制）
        { kind: 'dayan_pagoda', cellDensity: 0.02 }, // 大雁塔（地标，稀有）
      ],
    },
    atmosphere: {
      sky: {
        noon: { top: '#a0c0e0', bottom: '#d8ccb0', fog: '#d4c8ac' }, // 参照北京、偏土黄
      },
      fogScale: 1.05,
      waterTint: '#8a7a4a', // 渭河/黄河土黄
    },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'sheep', weight: 1 },
      { key: 'cow', weight: 1 },
      { key: 'panda', weight: 0.06 }, // 秦岭大熊猫（稀有）
    ],
    animalGround: ['GRASS'],
  },
};
