// data/regions/parts/xiyu.ts —— 西域（W3 波拥有：甘肃定制 + 嘉峪关、
// 新疆增强版 + 苏公塔）。
//
// 甘肃 = W3 新定制：河西走廊大漠戈壁（ridgeAmp 12 祁连山余脉 + snowBias 0.2
// 雪线 + 极稀疏胡杨），复用川西民居 + 稀有地标 jiayuguan（嘉峪关关城）。
// 新疆 = 旧区增强覆盖：legacy xinjiang 全部字段逐字展开保留（大漠绿洲地形/
// 胡杨/氛围/动物表逐字同源，兼容哨兵由 tests/regions/xiyu.test.ts 把关），
// 仅 terrain.structures 追加稀有地标 sugong_tower（苏公塔，cellDensity 0.03）；
// 绿洲农庄 oasis_farm 0.15 照旧。

import { legacyRegions } from './legacy';
import type { RegionGroup } from '../index';

export const xiyuRegions: RegionGroup<'gansu' | 'xinjiang'> = {
  /** 甘肃：河西走廊大漠孤烟（W3 定制 + 嘉峪关） */
  gansu: {
    id: 'gansu',
    name: '甘肃',
    blurb: '河西走廊大漠孤烟 · 嘉峪关雄关 · 敦煌莫高窟 · 美食：牛肉面、浆水面',
    mapColor: '#9f6f5f', // 河西深赭（邻新疆沙金、青海湖蓝、陕西赭红、内蒙古草绿）
    terrain: {
      baseOffset: 1,
      contAmp: 4,
      hillsAmp: 3,
      ridgeAmp: 12, // 祁连山余脉（合黎山/龙首山山脊）
      tempBias: 0.1, // 干旱大陆性气候偏暖
      desertBias: -0.35, // 负值放宽沙漠阈值（terragen 语义：加在阈值上）→ 河西走廊大漠戈壁
      snowBias: 0.2, // 祁连山雪线（高海拔雪原斑）
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.003, // 极稀疏（大漠孤烟，绿洲才见胡杨）
        kinds: [{ kind: 'poplar', weight: 1 }],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'house', cellDensity: 0.1 }, // 河西民居（复用川西民居样式）
        { kind: 'jiayuguan', cellDensity: 0.02 }, // 嘉峪关关城（天下第一雄关，稀有）
      ],
    },
    atmosphere: {
      sky: {
        noon: { top: '#a8c4e0', bottom: '#e8d8a0', fog: '#e0d4a0' }, // 大漠孤烟（沙金地平）
      },
      fogScale: 1.25, // 河西通透
      waterTint: '#8a7a4a', // 讨赖河/疏勒河（戈壁浑黄）
    },
    animals: [
      { key: 'camel', weight: 1.2 }, // 戈壁驼队
      { key: 'sheep', weight: 1.2 }, // 河西绒山羊/绵羊
      { key: 'horse', weight: 0.5 }, // 山丹军马场
      { key: 'pig', weight: 0.3 },
      { key: 'panda', weight: 0.06 }, // 祁连山（白水江保护区，极稀有）
    ],
    animalGround: ['GRASS', 'SAND'], // 驼队可出没于戈壁
  },

  // ---- 旧区增强覆盖位（新疆）：从 legacy xinjiang 展开继承（大漠绿洲地形/
  // 胡杨树表/氛围/动物表逐字同源），仅 terrain.structures 追加稀有地标
  // sugong_tower（苏公塔，cellDensity 0.03）。树表/氛围/动物表是旧档兼容
  // 哨兵，tests/regions/xiyu.test.ts 会断言其与 legacy 逐字段一致。----
  xinjiang: {
    ...legacyRegions.xinjiang,
    terrain: {
      ...legacyRegions.xinjiang.terrain,
      structures: [
        { kind: 'oasis_farm', cellDensity: 0.15 }, // 绿洲农庄（照旧）
        { kind: 'sugong_tower', cellDensity: 0.03 }, // 苏公塔（吐鲁番，W3 增强追加）
      ],
    },
  },
};
