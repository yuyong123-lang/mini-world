// data/regions/parts/xinan1.ts —— 川渝（W6 波拥有：重庆定制 + 洪崖洞/解放碑、
// 四川增强版 + 乐山大佛）。当前为 W0 契约占位：重庆 = generic 地形参数逐字段
// 副本；四川覆盖位暂引用 legacy 的同一对象（逐字同源、零行为差），
// W6 替换为追加乐山大佛后的增强版。

import { legacyRegions } from './legacy';
import type { RegionGroup } from '../index';

export const xinan1Regions: RegionGroup<'chongqing' | 'sichuan'> = {
  /** 重庆：山城江雾（W6 定制 + 洪崖洞吊脚楼群/解放碑） */
  chongqing: {
    id: 'chongqing',
    name: '重庆',
    blurb: '山城江雾 8D 魔幻 · 洪崖洞吊脚楼群 · 美食：火锅、小面',
    mapColor: '#d9773f', // 山城橙（邻四川盆地绿、湖北荆楚青、湖南湘绿、贵州黔山青、陕西赭红）
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
  // W6 替换为本组内的增强版（追加 leshan_buddha 乐山大佛稀有结构）。----
  sichuan: legacyRegions.sichuan,
};
