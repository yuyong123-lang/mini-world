// data/regions/parts/mengning.ts —— 蒙宁（W2 波拥有：宁夏定制 + 108塔群、
// 内蒙古增强版 + 敖包）。
//
// 内蒙古 = 旧区增强覆盖：legacy neimenggu 的全部字段逐字展开保留（草原地形/
// 稀树/马羊权重/氛围等兼容哨兵由 tests/regions/mengning.test.ts 把关），仅
// terrain.structures 追加稀有地标 aobao（敖包，cellDensity 0.03）；蒙古包
// yurt 0.22 照旧。
// 宁夏 = W2 新定制：西北黄河灌区 + 沙漠边缘（desertBias 0.3 只给一线沙带），
// 复用川西民居 + 稀有地标 towers_108（青铜峡108塔群）。

import { legacyRegions } from './legacy';
import type { RegionGroup } from '../index';

export const mengningRegions: RegionGroup<'ningxia' | 'neimenggu'> = {
  /** 宁夏：塞上江南黄河金岸（W2 定制 + 108塔群） */
  ningxia: {
    id: 'ningxia',
    name: '宁夏',
    blurb: '塞上江南 · 108塔群与西夏王陵 · 美食：手抓羊肉、枸杞',
    mapColor: '#d4a86a', // 河套金（邻内蒙古草绿、甘肃深赭、陕西赭红）
    terrain: {
      baseOffset: 1,
      contAmp: 3,
      hillsAmp: 3,
      ridgeAmp: 10, // 贺兰山脚缓岭
      tempBias: 0.1, // 西北干燥偏暖
      desertBias: -0.2, // 负值放宽沙漠阈值（terragen 语义：加在阈值上）→ 腾格里东缘一线沙带
      snowBias: 0.1,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.004, // 灌区稀树（新疆杨）
        kinds: [{ kind: 'poplar', weight: 1 }],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'house', cellDensity: 0.12 }, // 西北民居（复用川西民居样式）
        { kind: 'towers_108', cellDensity: 0.02 }, // 108塔群（青铜峡，稀有）
      ],
    },
    atmosphere: {
      sky: { noon: { top: '#a8c8e8', bottom: '#e8e0b0', fog: '#e8e0b0' } }, // 干燥亮黄天空
      fogScale: 1.2, // 通透
      waterTint: '#8a7a4a', // 黄河水色
    },
    animals: [
      { key: 'sheep', weight: 1.5 }, // 滩羊
      { key: 'camel', weight: 0.8 }, // 沙漠边缘骆驼
      { key: 'cow', weight: 0.5 },
    ],
    animalGround: ['GRASS', 'SAND'], // 骆驼可出没于沙带
  },

  // ---- 旧区增强覆盖位（内蒙古）：从 legacy neimenggu 展开继承（id/名称/
  // 草原地形/树表/氛围/动物表逐字同源），仅 terrain.structures 追加稀有地标
  // aobao（敖包，cellDensity 0.03）。树表/氛围/动物表是旧档兼容哨兵，
  // tests/regions/mengning.test.ts 会断言其与 legacy 逐字段一致。----
  neimenggu: {
    ...legacyRegions.neimenggu,
    terrain: {
      ...legacyRegions.neimenggu.terrain,
      structures: [
        { kind: 'yurt', cellDensity: 0.22 }, // 蒙古包（照旧）
        { kind: 'aobao', cellDensity: 0.03 }, // 敖包（W2 增强追加）
      ],
    },
  },
};
