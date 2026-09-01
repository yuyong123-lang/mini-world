// data/regions/parts/mengning.ts —— 蒙宁（W2 波拥有：宁夏定制 + 108塔群、
// 内蒙古增强版 + 敖包）。当前为 W0 契约占位：宁夏 = generic 地形参数逐字段
// 副本；内蒙古覆盖位暂引用 legacy 的同一对象（逐字同源、零行为差），
// W2 替换为追加敖包后的增强版。

import { legacyRegions } from './legacy';
import type { RegionGroup } from '../index';

export const mengningRegions: RegionGroup<'ningxia' | 'neimenggu'> = {
  /** 宁夏：塞上江南黄河金岸（W2 定制 + 108塔群） */
  ningxia: {
    id: 'ningxia',
    name: '宁夏',
    blurb: '塞上江南黄河金岸 · 108塔群 · 美食：手抓羊肉、枸杞',
    mapColor: '#d4a86a', // 河套金（邻内蒙古草绿、甘肃深赭、陕西赭红）
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
      structures: [], // W2 填入
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
  // W2 替换为本组内的增强版（追加 aobao 敖包稀有结构）。----
  neimenggu: legacyRegions.neimenggu,
};
