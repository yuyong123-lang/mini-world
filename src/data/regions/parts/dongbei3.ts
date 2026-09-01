// data/regions/parts/dongbei3.ts —— 东北三省（W1-A1 波定制）：
//   heilongjiang 林海雪原（圣索菲亚教堂）/ jilin 长白山地（朝鲜族青瓦民居）/
//   liaoning 辽河平原（沈阳故宫大政殿）。
// 旧「东北」区域（dongbei）仍在 parts/legacy.ts 逐字冻结（D5 在表不在图）：
// 本文件三区是「比旧 dongbei 更细分」的新区域，参数风格与其保持同族
// （forceBiome/ICE 湖面/spruce 树表/深蓝寒夜/虎权重 ≤0.05 仅黑吉两区）。

import type { RegionGroup } from '../index';

export const dongbei3Regions: RegionGroup<'heilongjiang' | 'jilin' | 'liaoning'> = {
  /** 黑龙江：北国冰雪林海（比旧 dongbei 更冷峻：低山 + 全图雪原 + 结冰湖面） */
  heilongjiang: {
    id: 'heilongjiang',
    name: '黑龙江',
    blurb: '林海雪原 · 哈尔滨圣索菲亚教堂与冰雪大世界 · 美食：锅包肉、红肠',
    mapColor: '#9fc8e0', // 冰雪蓝（邻吉林林绿、辽宁河褐）
    terrain: {
      baseOffset: 1,
      contAmp: 5,
      hillsAmp: 3,
      ridgeAmp: 18, // 低缓山丘，雪原辽阔
      tempBias: 0,
      desertBias: 0,
      snowBias: 0.5, // 雪线大幅放宽（配合 forceBiome，语义上「永远隆冬」）
      forceBiome: 'snow',
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      waterTopBlock: 'ICE', // 湖面结冰
      trees: { chance: 0.015, kinds: [{ kind: 'spruce', weight: 1 }], onBiomes: ['snow'] },
      structures: [
        { kind: 'snow_cabin', cellDensity: 0.18 }, // 雪乡木屋常见
        { kind: 'sophia_church', cellDensity: 0.02 }, // 圣索菲亚教堂（地标，稀有）
      ],
    },
    atmosphere: {
      sky: {
        night: { top: '#0a1220', bottom: '#182030', fog: '#202838' }, // 寒夜深远（同旧 dongbei 系）
      },
      fogScale: 0.85,
      waterTint: '#3a5a7a',
    },
    animals: [
      { key: 'sheep', weight: 0.5 },
      { key: 'pig', weight: 0.3 },
      { key: 'cow', weight: 0.2 },
      { key: 'tiger', weight: 0.05 }, // 东北虎稀有出没
    ],
    animalGround: ['SNOW', 'GRASS'],
  },

  /** 吉林：长白山山地（三省最高峻：山脊振幅 22 + 高山雪线 + 雾凇冷青雾） */
  jilin: {
    id: 'jilin',
    name: '吉林',
    blurb: '长白山天池雾凇 · 朝鲜族青瓦民居 · 美食：冷面、酸菜白肉',
    mapColor: '#6fae9f', // 长白林青（邻黑龙江冰雪蓝、辽宁河褐）
    terrain: {
      baseOffset: 2,
      contAmp: 5,
      hillsAmp: 4,
      ridgeAmp: 22, // 长白山山地
      tempBias: -0.25, // 整体偏冷
      desertBias: 0,
      snowBias: 0.45, // 高山雪线（海拔 + 低温双路触发）
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.012,
        kinds: [
          { kind: 'spruce', weight: 0.7 }, // 针阔混交（红松之乡）
          { kind: 'oak', weight: 0.3 },
        ],
        onBiomes: ['grass', 'snow'],
      },
      structures: [
        { kind: 'snow_cabin', cellDensity: 0.12 },
        { kind: 'chaoxian_house', cellDensity: 0.03 }, // 朝鲜族青瓦民居
      ],
    },
    atmosphere: {
      sky: {
        noon: { top: '#a8c8c8', bottom: '#d4e6e2', fog: '#cfe2de' }, // 雾凇冷青
      },
      fogScale: 0.9,
      waterTint: '#4a7a8a',
    },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'sheep', weight: 0.8 },
      { key: 'cow', weight: 0.4 },
      { key: 'tiger', weight: 0.04 }, // 虎仅黑吉且稀有
    ],
    animalGround: ['SNOW', 'GRASS'],
  },

  /** 辽宁：辽河平原（三省最温和：低丘 + 晴空偏冷，沈阳故宫大政殿） */
  liaoning: {
    id: 'liaoning',
    name: '辽宁',
    blurb: '辽河平原 · 沈阳故宫大政殿 · 美食：老边饺子、海鲜焖子',
    mapColor: '#b0895f', // 辽河褐（邻河北橄榄、内蒙古草绿、吉林林青）
    terrain: {
      baseOffset: 1,
      contAmp: 4,
      hillsAmp: 2.5,
      ridgeAmp: 10, // 平原缓丘
      tempBias: -0.1,
      desertBias: 0,
      snowBias: 0.3, // 冬季偶有积雪，雪原收紧
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.01,
        kinds: [
          { kind: 'oak', weight: 0.6 },
          { kind: 'spruce', weight: 0.4 },
        ],
        onBiomes: ['grass', 'snow'],
      },
      structures: [
        { kind: 'snow_cabin', cellDensity: 0.1 },
        { kind: 'dazhengdian', cellDensity: 0.02 }, // 沈阳故宫大政殿（地标，稀有）
      ],
    },
    atmosphere: {
      sky: {
        noon: { top: '#7fb2e0', bottom: '#c4dcec', fog: '#cadcea' }, // 华北晴空偏冷
      },
      fogScale: 1,
      waterTint: '#4a7a9a',
    },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 1 },
      { key: 'sheep', weight: 0.5 },
    ],
    animalGround: ['GRASS'],
  },
};
