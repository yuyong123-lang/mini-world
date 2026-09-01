// data/regions/parts/mid2.ts —— 岭南：粤桂琼（W5 波拥有：地形定制 +
// 广州塔+骑楼街/程阳风雨桥+干栏木楼 结构表）。当前为 W0 契约占位：地形参数 =
// generic 逐字段副本，structures 留空，待 W5 填入。

import type { RegionGroup } from '../index';

export const mid2Regions: RegionGroup<'guangdong' | 'guangxi' | 'hainan'> = {
  /** 广东：岭南门户（W5 定制 + 广州塔/骑楼街） */
  guangdong: {
    id: 'guangdong',
    name: '广东',
    blurb: '岭南门户 · 骑楼街与广州塔 · 美食：早茶、烧鹅',
    mapColor: '#e0a05a', // 岭南暖金（邻福建闽南红砖、江西赣紫、湖南湘绿、广西桂北蓝）
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

  /** 广西：桂林山水甲天下（W5 定制 + 程阳风雨桥/干栏木楼） */
  guangxi: {
    id: 'guangxi',
    name: '广西',
    blurb: '桂林山水甲天下 · 干栏木楼与风雨桥 · 美食：螺蛳粉、米粉',
    mapColor: '#4f7f9f', // 桂北蓝（邻湖南湘绿、广东岭南暖金、云南暖橙、贵州黔山青）
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

  /** 海南：热带椰风海韵（W5 定制 + 骑楼老街） */
  hainan: {
    id: 'hainan',
    name: '海南',
    blurb: '热带椰风海韵 · 骑楼老街 · 美食：文昌鸡、清补凉',
    mapColor: '#a8c85f', // 椰林新绿（隔海峡邻广东岭南暖金）
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
