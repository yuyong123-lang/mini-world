// data/regions/parts/xinan2.ts —— 黔滇（W6 波拥有：贵州定制 + 苗寨/甲秀楼、
// 云南增强版 + 崇圣寺三塔）。当前为 W0 契约占位：贵州 = generic 地形参数逐字段
// 副本；云南覆盖位暂引用 legacy 的同一对象（逐字同源、零行为差），
// W6 替换为追加三塔后的增强版。

import { legacyRegions } from './legacy';
import type { RegionGroup } from '../index';

export const xinan2Regions: RegionGroup<'guizhou' | 'yunnan'> = {
  /** 贵州：喀斯特山水（W6 定制 + 苗寨/甲秀楼） */
  guizhou: {
    id: 'guizhou',
    name: '贵州',
    blurb: '喀斯特山水 · 苗寨与甲秀楼 · 美食：酸汤鱼、肠旺面',
    mapColor: '#7f9fae', // 黔山青灰（邻湖南湘绿、广西桂北蓝、云南暖橙、重庆山城橙、四川盆地绿）
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

  // ---- 旧区增强覆盖位：W0 阶段与 legacy 逐字同源（同一对象引用，零行为差），
  // W6 替换为本组内的增强版（追加 three_pagodas 崇圣寺三塔稀有结构）。----
  yunnan: legacyRegions.yunnan,
};
