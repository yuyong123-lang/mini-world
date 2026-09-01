// data/regions/parts/mid1.ts —— 中南1：两湖鄂湘（W5 波定制）：千湖之省 + 湘西山水。
//   hubei 江汉平原 + 丘陵（baseOffset 0 → 低洼列自然成水，千湖格局 + 黄鹤楼）/
//   hunan 湘西山地 + 洞庭（振幅全面大于湖北，张家界山脊 + 湘西吊脚楼/岳阳楼）。
// 两区均为 W5 新定制；参数风格与 W2-W4 波同族：
//   地形振幅按地貌写意、树表混交乡土树种（国槐/杨树/芭蕉/茶树）、
//   结构表「常见民居/吊脚楼 + 稀有地标」双条目、
//   氛围统一江城水汽/湘水烟云（fogScale < 1）+ 江湖浊青水 tint。

import type { RegionGroup } from '../index';

export const mid1Regions: RegionGroup<'hubei' | 'hunan'> = {
  /** 湖北：千湖之省九省通衢（W5 定制 + 黄鹤楼） */
  hubei: {
    id: 'hubei',
    name: '湖北',
    blurb: '千湖之省 · 长江汉水黄鹤楼 · 美食：热干面、武昌鱼',
    mapColor: '#5fae9f', // 荆楚青（邻河南中原绿、安徽徽墨、江西赣紫、湖南湘绿、重庆山城橙）
    terrain: {
      baseOffset: 0, // 江汉平原低平：基准贴海平面 → 低洼列自然成水（千湖之省）
      contAmp: 3,
      hillsAmp: 2.5,
      ridgeAmp: 9, // 鄂西丘陵低缓（平原为主）
      tempBias: 0.1,
      desertBias: 0,
      snowBias: 0.1,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.01,
        kinds: [
          { kind: 'oak', weight: 0.5 },
          { kind: 'pagoda', weight: 0.3 }, // 国槐（江城行道树）
          { kind: 'poplar', weight: 0.2 }, // 杨树（江滩防护林）
        ],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'house', cellDensity: 0.15 }, // 青瓦民居（复用川西民居形制）
        { kind: 'yellow_crane', cellDensity: 0.02 }, // 黄鹤楼（地标，稀有）
      ],
    },
    atmosphere: {
      sky: {
        noon: { top: '#9cbac9', bottom: '#d5e1df', fog: '#cdd9d6' }, // 江城水汽：雾青
      },
      fogScale: 0.85, // 江湖雾气
      waterTint: '#4a7a7a', // 长江浊青
    },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 1 },
      { key: 'sheep', weight: 0.5 },
    ],
    animalGround: ['GRASS'],
  },

  /** 湖南：三湘四水湘西山水（W5 定制 + 岳阳楼/湘西吊脚楼） */
  hunan: {
    id: 'hunan',
    name: '湖南',
    blurb: '湘西山水洞庭波 · 张家界与岳阳楼 · 湘西吊脚楼 · 美食：剁椒鱼头、臭豆腐',
    mapColor: '#6f9f4f', // 湘西林绿（邻湖北荆楚青、江西赣紫、广东岭南暖金、广西桂北蓝、贵州黔山青）
    terrain: {
      baseOffset: 1,
      contAmp: 4,
      hillsAmp: 4,
      ridgeAmp: 16, // 湘西武陵山脊（张家界）
      tempBias: 0.1,
      desertBias: 0,
      snowBias: 0.1,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.011,
        kinds: [
          { kind: 'oak', weight: 0.45 },
          { kind: 'banana', weight: 0.3 }, // 芭蕉（湘南亚热带）
          { kind: 'tea', weight: 0.25 }, // 茶树（湘西山园）
        ],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'diaojiaolou', cellDensity: 0.18 }, // 湘西吊脚楼（常见民居，高密度）
        { kind: 'yueyang_pavilion', cellDensity: 0.02 }, // 岳阳楼（地标，稀有）
      ],
    },
    atmosphere: {
      sky: {
        noon: { top: '#9cc0c4', bottom: '#d7e3dd', fog: '#ccd9d2' }, // 湘水烟云
      },
      fogScale: 0.85,
      waterTint: '#4a7a6a', // 湘水青碧
    },
    animals: [
      { key: 'pig', weight: 0.8 },
      { key: 'cow', weight: 0.6 },
      { key: 'sheep', weight: 0.3 },
    ],
    animalGround: ['GRASS'],
  },
};
