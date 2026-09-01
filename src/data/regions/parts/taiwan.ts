// data/regions/parts/taiwan.ts —— 台湾（W5-A3 波实装：地形定制 + 台北101/
// 闽南红砖古厝 结构表）。
//
// 地形调参思路：宝岛 = 中央山脉纵贯 + 西岸平原 → 中高起伏（ridgeAmp 14，山地在
// 中央、平原在西，anchorSuitable 把结构挡在缓坡上）；北回归线过岛 → 亚热带
// （tempBias 0.25，终年无雪）；棕榈/榕树/芭蕉混植；台湾海峡水色偏青蓝。

import type { RegionGroup } from '../index';

export const taiwanRegions: RegionGroup<'taiwan'> = {
  /** 台湾：宝岛山海（W5 定制 + 台北101/闽南红砖古厝） */
  taiwan: {
    id: 'taiwan',
    name: '台湾',
    blurb: '台北101 与日月潭 · 闽南红砖古厝 · 阿里山云海 · 美食：卤肉饭、珍珠奶茶',
    mapColor: '#b06f8f', // 宝岛洋红（海上岛屿，与闽粤沿海色系区分）
    terrain: {
      baseOffset: 1, // 西岸平原略高于海面
      contAmp: 4,
      hillsAmp: 3, // 丘陵台地
      ridgeAmp: 14, // 中央山脉：中高起伏（雪山山脉/阿里山余脉）
      tempBias: 0.25, // 北回归线过岛：亚热带
      desertBias: 0,
      snowBias: 0, // 平地终年无雪
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.012, // 亚热带植被茂密
        kinds: [
          { kind: 'palm', weight: 0.4 }, // 椰林大道
          { kind: 'oak', weight: 0.35 }, // 榕树/樟树
          { kind: 'banana', weight: 0.25 }, // 香蕉园
        ],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'minnan_house', cellDensity: 0.18 }, // 闽南红砖古厝（西岸平原常见聚落）
        { kind: 'taipei_101', cellDensity: 0.02 }, // 台北101（信义计划区地标，稀有）
      ],
    },
    atmosphere: {
      sky: { noon: { top: '#8ccdf5', bottom: '#d6f0f7', fog: '#d6f0f7' } }, // 海岛晴朗
      fogScale: 1, // 海岛通透
      waterTint: '#2a8a9a', // 台湾海峡青蓝
    },
    animals: [
      { key: 'pig', weight: 0.8 },
      { key: 'cow', weight: 0.6 },
      { key: 'sheep', weight: 0.4 },
    ],
    animalGround: ['GRASS'],
  },
};
