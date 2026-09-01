// data/regions/parts/jingjinji.ts —— 京津冀（W1 波拥有：河北定制 + 赵州桥、
// 北京增强版 + 祈年殿、天津 + 天津之眼/小洋楼）。当前为 W0 契约占位：
// 天津/河北 = generic 地形参数逐字段副本；北京覆盖位暂引用 legacy 的同一
// 对象（逐字同源、零行为差），W1 替换为追加祈年殿后的增强版。

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

  /** 河北：燕赵大地（W1 定制 + 赵州桥） */
  hebei: {
    id: 'hebei',
    name: '河北',
    blurb: '燕赵大地环抱京津 · 赵州桥敞肩石拱 · 美食：驴肉火烧、承德露露',
    mapColor: '#8a9a56', // 燕赵橄榄（邻北京宫红、天津海河橙、山西黄土、山东沙金）
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

  // ---- 旧区增强覆盖位：W0 阶段与 legacy 逐字同源（同一对象引用，零行为差），
  // W1 替换为本组内的增强版（追加 qinianden 祈年殿稀有结构）。----
  beijing: legacyRegions.beijing,
};
