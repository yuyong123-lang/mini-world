// data/regions/parts/east2.ts —— 华东沿海：沪浙闽（W4-A2 波实装）。
//   - shanghai 上海：都市平原（为东方明珠/石库门压平地形）+ 石库门/东方明珠
//   - zhejiang 浙江：江南山水（西湖烟雨）+ 民居/雷峰塔
//   - fujian 福建：闽地山海（八山一水一分田）+ 圆形土楼/民居
//
// 地形调参思路：上海长江三角洲冲积平原 → 全场最低振幅（ridgeAmp 5，比天津还平），
// 高塔地基整体浇筑不怕差异沉降；浙江江南丘陵水网 → 中低起伏 + 烟雨雾距；
// 福建闽东山地 → 全波最高起伏（ridgeAmp 18），土楼只落山间盆地（anchorSuitable 把关）。

import type { RegionGroup } from '../index';

export const east2Regions: RegionGroup<'shanghai' | 'zhejiang' | 'fujian'> = {
  /** 上海：十里洋场摩登都会（W4 定制 + 东方明珠/石库门） */
  shanghai: {
    id: 'shanghai',
    name: '上海',
    blurb: '东方明珠与外滩天际线 · 石库门弄堂 · 美食：小笼包、生煎',
    mapColor: '#7f8fae', // 都会蓝灰（邻江苏水乡青绿、浙江黛青）
    terrain: {
      baseOffset: 0, // 长江三角洲冲积平原：地势最低
      contAmp: 3,
      hillsAmp: 1.5,
      ridgeAmp: 5, // 极平：高塔/联排住宅需要整片平地
      tempBias: 0.15,
      desertBias: 0,
      snowBias: 0.05,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.006, // 行道树密度（梧桐/香樟）
        kinds: [
          { kind: 'pagoda', weight: 0.5 }, // 行道树（悬铃木冠形）
          { kind: 'oak', weight: 0.5 },
        ],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'shikumen', cellDensity: 0.2 }, // 石库门弄堂（常见联排）
        { kind: 'pearl_tower', cellDensity: 0.02 }, // 东方明珠（陆家嘴地标，稀有）
      ],
    },
    atmosphere: {
      sky: { noon: { top: '#8ecaf8', bottom: '#d4eaf8', fog: '#d4eaf8' } }, // 都市亮蓝晴空
      fogScale: 1,
      waterTint: '#4a7a9a', // 黄浦江蓝
    },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 0.8 },
      { key: 'sheep', weight: 0.5 },
    ],
    animalGround: ['GRASS'],
  },

  /** 浙江：江南水乡丝绸之府（W4 定制 + 雷峰塔） */
  zhejiang: {
    id: 'zhejiang',
    name: '浙江',
    blurb: '雷峰塔与西湖烟雨 · 龙井茶山 · 美食：西湖醋鱼、东坡肉',
    mapColor: '#3f7f8f', // 西湖黛青（邻上海蓝灰、江苏水乡青绿、安徽徽墨、福建闽南红）
    terrain: {
      baseOffset: 0,
      contAmp: 3,
      hillsAmp: 3, // 江南丘陵
      ridgeAmp: 10, // 低山起伏（天目山余脉）
      tempBias: 0.15,
      desertBias: 0,
      snowBias: 0.05,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.011, // 茶山/水乡绿意
        kinds: [
          { kind: 'tea', weight: 0.4 }, // 龙井茶丛
          { kind: 'oak', weight: 0.35 },
          { kind: 'pagoda', weight: 0.25 }, // 水乡古树（香樟）
        ],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'house', cellDensity: 0.16 }, // 江南民居（复用川西民居样式）
        { kind: 'leifeng_pagoda', cellDensity: 0.02 }, // 雷峰塔（西湖地标，稀有）
      ],
    },
    atmosphere: {
      sky: { noon: { top: '#9ec4d8', bottom: '#cfdfe4', fog: '#cfdfe4' } }, // 烟雨灰蓝
      fogScale: 0.8, // 西湖烟雨：雾距收紧
      waterTint: '#3a8a6a', // 西湖绿
    },
    animals: [
      { key: 'pig', weight: 0.8 },
      { key: 'cow', weight: 0.6 },
      { key: 'sheep', weight: 0.5 },
    ],
    animalGround: ['GRASS'],
  },

  /** 福建：八山一水一分田（W4 定制 + 圆形土楼） */
  fujian: {
    id: 'fujian',
    name: '福建',
    blurb: '八山一水一分田 · 福建土楼与鼓浪屿 · 武夷山云雾 · 美食：沙茶面、佛跳墙',
    mapColor: '#c97f5f', // 闽南红砖（邻浙江黛青、江西赣紫、广东岭南暖金）
    terrain: {
      baseOffset: 1,
      contAmp: 4,
      hillsAmp: 5, // 闽中大山带
      ridgeAmp: 18, // 多山：武夷山/戴云山
      tempBias: 0.2, // 亚热带
      desertBias: 0,
      snowBias: 0, // 终年无雪
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.012, // 亚热带植被最密
        kinds: [
          { kind: 'palm', weight: 0.4 }, // 闽海棕榈
          { kind: 'banana', weight: 0.3 }, // 芭蕉
          { kind: 'oak', weight: 0.3 },
        ],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'tulou', cellDensity: 0.1 }, // 圆形土楼（闽西南常见）
        { kind: 'house', cellDensity: 0.08 }, // 闽地民居
      ],
    },
    atmosphere: {
      sky: { noon: { top: '#8ac6f0', bottom: '#d0ecf4', fog: '#d0ecf4' } }, // 闽海清朗
      fogScale: 0.9,
      waterTint: '#2a7a9a', // 东海蓝
    },
    animals: [
      { key: 'pig', weight: 0.7 },
      { key: 'cow', weight: 0.5 },
      { key: 'sheep', weight: 0.4 },
    ],
    animalGround: ['GRASS'],
  },
};
