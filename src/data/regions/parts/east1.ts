// data/regions/parts/east1.ts —— 华东内陆：苏皖赣（W4 波定制）：江南水乡气候带。
//   jiangsu 水网低平（低 baseOffset + 低振幅 → 近海平面列自然成水，水乡格局 +
//   苏州园林）/ anhui 皖南山区（徽派马头墙民居即标志，单结构高密度）/
//   jiangxi 赣鄱丘陵（民居 + 滕王阁）。
// 三区均为 W4 新定制（无 legacy 覆盖位）；参数风格与 W2/W3 波同族：
//   地形振幅按地貌写意、树表混交乡土树种（茶树/芭蕉/国槐/杨树）、
//   结构表「常见民居 + 稀有地标」双条目（安徽以徽派民居为唯一标志结构）、
//   氛围统一湿润多雾（fogScale < 1）+ 水乡绿水 tint。

import type { RegionGroup } from '../index';

export const east1Regions: RegionGroup<'jiangsu' | 'anhui' | 'jiangxi'> = {
  /** 江苏：江南水乡园林之城（W4 定制 + 苏州园林） */
  jiangsu: {
    id: 'jiangsu',
    name: '江苏',
    blurb: '江南水乡园林之城 · 苏州园林与中山陵 · 美食：盐水鸭、松鼠桂鱼',
    mapColor: '#6fae8f', // 水乡青绿（邻山东沙金、安徽徽墨、浙江黛青、上海蓝灰）
    terrain: {
      baseOffset: 0, // 低平：基准贴海平面 → 低洼列自然成水（水网密布）
      contAmp: 3,
      hillsAmp: 2,
      ridgeAmp: 6, // 宁镇丘陵，低缓
      tempBias: 0.15, // 温润
      desertBias: 0,
      snowBias: 0.05,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.011,
        kinds: [
          { kind: 'oak', weight: 0.5 },
          { kind: 'pagoda', weight: 0.3 }, // 国槐（水乡村头树）
          { kind: 'tea', weight: 0.2 }, // 茶树（太湖沿岸）
        ],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'house', cellDensity: 0.16 }, // 青瓦民居（复用川西民居形制）
        { kind: 'garden_pavilion', cellDensity: 0.02 }, // 苏州园林（地标，稀有）
      ],
    },
    atmosphere: {
      sky: {
        noon: { top: '#9ec3d6', bottom: '#d9e6e2', fog: '#cfdeda' }, // 江南烟雨：雾白偏青
      },
      fogScale: 0.8, // 多雾
      waterTint: '#3a8a6a', // 水乡绿
    },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 1 },
      { key: 'sheep', weight: 0.6 },
    ],
    animalGround: ['GRASS'],
  },

  /** 安徽：皖南山区徽派故里（W4 定制 + 徽派马头墙民居） */
  anhui: {
    id: 'anhui',
    name: '安徽',
    blurb: '徽山皖水马头墙 · 黄山与宣纸之乡 · 美食：臭鳜鱼、毛豆腐',
    mapColor: '#7f7f5f', // 徽墨橄榄灰（邻江苏水乡青绿、河南中原绿、江西赣紫、湖北荆楚青）
    terrain: {
      baseOffset: 1,
      contAmp: 4,
      hillsAmp: 4,
      ridgeAmp: 16, // 皖南山地（黄山余脉）
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
          { kind: 'oak', weight: 0.5 },
          { kind: 'tea', weight: 0.3 }, // 茶树（皖南山园）
          { kind: 'poplar', weight: 0.2 },
        ],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'hui_house', cellDensity: 0.18 }, // 徽派马头墙民居（即标志，单结构高密度）
      ],
    },
    atmosphere: {
      sky: {
        noon: { top: '#9db8c8', bottom: '#d4ddd8', fog: '#ccd8d2' }, // 山间云雾
      },
      fogScale: 0.75, // 三区最雾
      waterTint: '#3a8a6a',
    },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 0.8 },
      { key: 'sheep', weight: 0.5 },
    ],
    animalGround: ['GRASS'],
  },

  /** 江西：赣鄱丘陵（W4 定制 + 滕王阁） */
  jiangxi: {
    id: 'jiangxi',
    name: '江西',
    blurb: '赣鄱丘陵滕王阁 · 鄱阳湖与景德镇 · 美食：瓦罐汤、米粉',
    mapColor: '#8f7fae', // 赣鄱紫（邻安徽徽墨、湖北荆楚青、湖南湘绿、福建闽南红）
    terrain: {
      baseOffset: 1,
      contAmp: 4,
      hillsAmp: 3.5,
      ridgeAmp: 14, // 赣东北/赣南丘陵山脊
      tempBias: 0.15,
      desertBias: 0,
      snowBias: 0.05,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.011,
        kinds: [
          { kind: 'oak', weight: 0.4 },
          { kind: 'tea', weight: 0.35 }, // 茶树（赣东北茶乡）
          { kind: 'banana', weight: 0.25 }, // 芭蕉（赣南亚热带）
        ],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'house', cellDensity: 0.15 }, // 青瓦民居（复用川西民居形制）
        { kind: 'tengwang_pavilion', cellDensity: 0.02 }, // 滕王阁（地标，稀有）
      ],
    },
    atmosphere: {
      sky: {
        noon: { top: '#a2c8dc', bottom: '#dde9e6', fog: '#d4e2de' }, // 参照江苏、略清朗
      },
      fogScale: 0.9,
      waterTint: '#3a8a6a',
    },
    animals: [
      { key: 'pig', weight: 0.8 },
      { key: 'cow', weight: 0.7 },
      { key: 'sheep', weight: 0.4 },
    ],
    animalGround: ['GRASS'],
  },
};
