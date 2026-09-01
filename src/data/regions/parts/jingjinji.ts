// data/regions/parts/jingjinji.ts —— 京津冀（W1 波拥有：北京增强 + 祈年殿、
// 天津 + 天津之眼/五大道小洋楼、河北 + 赵州桥）。
//
// 北京 = 旧区增强覆盖：legacy beijing 的全部字段逐字保留（树表/氛围/动物等
// 兼容哨兵由 tests/regions/jingjinji.test.ts 把关），仅 terrain.structures
// 追加第三种稀有地标 qinianden（天坛祈年殿，cellDensity 0.015）。
// 天津/河北 = W1 新定制：天津为海河滨海平原（低振幅，为摩天轮/小洋楼压平），
// 河北为华北平原 + 太行山脚（ridgeAmp 12，西部起山）。

import { legacyRegions } from './legacy';
import type { RegionGroup } from '../index';

export const jingjinjiRegions: RegionGroup<'tianjin' | 'hebei' | 'beijing'> = {
  /** 天津：海河之滨五大道（W1 定制 + 天津之眼/小洋楼） */
  tianjin: {
    id: 'tianjin',
    name: '天津',
    blurb: '海河之滨五大道 · 小洋楼与天津之眼 · 美食：狗不理包子、麻花',
    mapColor: '#d98a5a', // 海河橙（邻北京宫红、河北橄榄）
    terrain: {
      baseOffset: 0, // 滨海平原，地势低平
      contAmp: 3,
      hillsAmp: 1.5,
      ridgeAmp: 6, // 低起伏：现代建筑需要平地
      tempBias: 0.05,
      desertBias: 0,
      snowBias: 0.2,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.008,
        kinds: [
          { kind: 'pagoda', weight: 0.5 }, // 行道树（国槐）
          { kind: 'oak', weight: 0.5 },
        ],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'xiaoyanglou', cellDensity: 0.2 }, // 五大道小洋楼（常见）
        { kind: 'eyed_wheel', cellDensity: 0.02 }, // 天津之眼（跨河摩天轮，稀有）
      ],
    },
    atmosphere: {
      sky: { noon: { top: '#8fc8f8', bottom: '#d0e8f8', fog: '#d0e8f8' } }, // 亮蓝晴空
      fogScale: 1.05,
      waterTint: '#4a7a9a', // 海河蓝
    },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 1 },
      { key: 'sheep', weight: 0.8 },
    ],
    animalGround: ['GRASS'],
  },

  /** 河北：燕赵大地（W1 定制 + 赵州桥） */
  hebei: {
    id: 'hebei',
    name: '河北',
    blurb: '燕赵大地环抱京津 · 赵州桥敞肩石拱 · 美食：驴肉火烧、承德露露',
    mapColor: '#8a9a56', // 燕赵橄榄（邻北京宫红、天津海河橙、山西黄土、山东沙金）
    terrain: {
      baseOffset: 1,
      contAmp: 4,
      hillsAmp: 3,
      ridgeAmp: 12, // 西部太行山脚
      tempBias: 0,
      desertBias: 0,
      snowBias: 0.35,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.009,
        kinds: [
          { kind: 'pagoda', weight: 0.4 },
          { kind: 'oak', weight: 0.6 },
        ],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'house', cellDensity: 0.15 }, // 常见民居（复用川西民居样式）
        { kind: 'zhaozhou_bridge', cellDensity: 0.02 }, // 赵州桥（敞肩石拱，稀有）
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
      { key: 'horse', weight: 0.3 },
    ],
    animalGround: ['GRASS'],
  },

  // ---- 旧区增强覆盖位（北京）：从 legacy beijing 展开继承（id/名称/地形/
  // 树表/氛围/动物表逐字同源），仅 terrain.structures 追加第三种稀有地标
  // qinianden（天坛祈年殿，cellDensity 0.015）。树表/氛围/动物表是旧档兼容
  // 哨兵，tests/regions/jingjinji.test.ts 会断言其与 legacy 逐字段一致。----
  beijing: {
    ...legacyRegions.beijing,
    terrain: {
      ...legacyRegions.beijing.terrain,
      structures: [
        { kind: 'siheyuan', cellDensity: 0.22 },
        { kind: 'palace', cellDensity: 0.02 },
        { kind: 'qinianden', cellDensity: 0.015 }, // 天坛祈年殿（W1 增强追加）
      ],
    },
  },
};
