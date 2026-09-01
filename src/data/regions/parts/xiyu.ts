// data/regions/parts/xiyu.ts —— 西域：甘肃（W3 波拥有：地形定制 + 嘉峪关、
// 新疆增强版 + 苏公塔）。当前为 W0 契约占位：甘肃 = generic 地形参数逐字段
// 副本；新疆覆盖位暂引用 legacy 的同一对象（逐字同源、零行为差），
// W3 替换为追加苏公塔后的增强版。

import { legacyRegions } from './legacy';
import type { RegionGroup } from '../index';

export const xiyuRegions: RegionGroup<'gansu' | 'xinjiang'> = {
  /** 甘肃：河西走廊丝路要冲（W3 定制 + 嘉峪关） */
  gansu: {
    id: 'gansu',
    name: '甘肃',
    blurb: '河西走廊丝路要冲 · 嘉峪关雄关 · 美食：牛肉面、浆水面',
    mapColor: '#9f6f5f', // 河西深赭（邻新疆沙金、青海湖蓝、陕西赭红、内蒙古草绿）
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
      structures: [], // W3 填入
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
  // W3 替换为本组内的增强版（追加 sugong_tower 苏公塔稀有结构）。----
  xinjiang: legacyRegions.xinjiang,
};
