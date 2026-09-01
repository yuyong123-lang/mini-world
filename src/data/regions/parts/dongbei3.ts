// data/regions/parts/dongbei3.ts —— 东北三省（W1 波拥有：地形/动物/氛围定制 +
// 索菲亚教堂/朝鲜族民居/大政殿 结构表）。当前为 W0 契约占位：地形参数 =
// generic 逐字段副本，structures 留空，待 W1 填入。
// 旧「东北」区域（dongbei）在 parts/legacy.ts 逐字冻结（D5 在表不在图）。

import type { RegionGroup } from '../index';

export const dongbei3Regions: RegionGroup<'heilongjiang' | 'jilin' | 'liaoning'> = {
  /** 黑龙江：北国冰雪林海（W1 定制 + 圣索菲亚教堂） */
  heilongjiang: {
    id: 'heilongjiang',
    name: '黑龙江',
    blurb: '北国冰雪林海 · 圣索菲亚教堂与俄式风情 · 美食：锅包肉、红肠',
    mapColor: '#9fc8e0', // 冰雪蓝（邻吉林林绿、辽宁河褐）
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
      structures: [], // W1 填入
    },
    atmosphere: { fogScale: 1 },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 1 },
      { key: 'sheep', weight: 1 },
    ],
    animalGround: ['GRASS'],
  },

  /** 吉林：长白林海雾凇（W1 定制 + 朝鲜族青瓦民居） */
  jilin: {
    id: 'jilin',
    name: '吉林',
    blurb: '长白林海雾凇 · 朝鲜族青瓦民居 · 美食：冷面、酸菜白肉',
    mapColor: '#6fae9f', // 长白林青（邻黑龙江冰雪蓝、辽宁河褐）
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
      structures: [], // W1 填入
    },
    atmosphere: { fogScale: 1 },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 1 },
      { key: 'sheep', weight: 1 },
    ],
    animalGround: ['GRASS'],
  },

  /** 辽宁：辽河平原老工业基地（W1 定制 + 沈阳故宫大政殿） */
  liaoning: {
    id: 'liaoning',
    name: '辽宁',
    blurb: '辽河平原 · 沈阳故宫大政殿 · 美食：老边饺子、海鲜焖子',
    mapColor: '#b0895f', // 辽河褐（邻河北橄榄、内蒙古草绿、吉林林青）
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
      structures: [], // W1 填入
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
