// data/regions/parts/xinan2.ts —— 黔滇（W6 波拥有：贵州定制 + 苗寨/甲秀楼、
// 云南增强版 + 崇圣寺三塔）。
//
// 贵州（新定制）：苗岭山地（ridgeAmp 17 起伏介于湘西与桂北之间）+ 黔山云雾
//（fogScale 0.8）+ 竹/杉/茶混交；结构 = 苗寨吊脚楼（复用湘西 diaojiaolou kind）
// 常见 + 甲秀楼（jiaxiu_pavilion，南明河水中石楼）稀有。
//
// 云南（旧区增强覆盖）：以 legacy 为底仅替换 terrain.structures——傣族竹楼照旧，
// 追加崇圣寺三塔（three_pagodas，大理苍山）稀有地标；其余字段（梯田 terraceStep 4、
// 棕榈/芭蕉/茶树、孔雀动物表、氛围）逐字保留（兼容哨兵由 tests/regions/xinan2.test.ts 把关）。

import { legacyRegions } from './legacy';
import type { RegionGroup } from '../index';

export const xinan2Regions: RegionGroup<'guizhou' | 'yunnan'> = {
  /** 贵州：苗岭山地喀斯特（W6 定制 + 苗寨吊脚楼/甲秀楼） */
  guizhou: {
    id: 'guizhou',
    name: '贵州',
    blurb: '黔山云雾 · 千户苗寨吊脚楼 · 甲秀楼与黄果树 · 美食：酸汤鱼、肠旺面',
    mapColor: '#7f9fae', // 黔山青灰（邻湖南湘绿、广西桂北蓝、云南暖橙、重庆山城橙、四川盆地绿）
    terrain: {
      baseOffset: 1,
      contAmp: 4,
      hillsAmp: 4.5,
      ridgeAmp: 17, // 苗岭山地：起伏高于湘桂之间、低于横断
      tempBias: 0.1, // 湿润亚热带
      desertBias: 0,
      snowBias: 0.1, // 雪线收紧（无雪原）
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.011,
        kinds: [
          { kind: 'bamboo', weight: 0.4 }, // 竹林
          { kind: 'oak', weight: 0.35 }, // 杂木
          { kind: 'tea', weight: 0.25 }, // 茶山
        ],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'diaojiaolou', cellDensity: 0.16 }, // 复用湘西吊脚楼 kind 作苗寨吊脚楼
        { kind: 'jiaxiu_pavilion', cellDensity: 0.02 }, // 甲秀楼（稀有地标）
      ],
    },
    atmosphere: {
      fogScale: 0.8, // 黔山云雾（多雾）
      waterTint: '#3a8a6a', // 南明河/舞阳河青碧
    },
    animals: [
      { key: 'pig', weight: 0.8 },
      { key: 'cow', weight: 0.5 },
      { key: 'sheep', weight: 0.4 },
    ],
    animalGround: ['GRASS'],
  },

  // ---- 旧区增强覆盖位：以 legacy.yunnan 为底展开，仅替换 terrain.structures
  //（傣族竹楼 0.2 照旧 + 追加 three_pagodas 崇圣寺三塔 0.02 稀有地标），
  // 其余字段逐字保留（梯田/棕榈芭蕉茶树/孔雀/氛围）——非同一对象，覆盖生效。----
  yunnan: {
    ...legacyRegions.yunnan,
    terrain: {
      ...legacyRegions.yunnan.terrain,
      structures: [
        { kind: 'bamboo_house', cellDensity: 0.2 },
        // 0.035（非 0.02）：云南水面占比 ~85%（梯田量化把低处整片压成湖面），
        // 0.02 时 ±16 cell 扫描窗内 20 个候选锚点全部落水 → anchorSuitable 全拒，
        // structures.test 派生用例（±16 找锚点）不可行。0.035 为最小可行密度。
        { kind: 'three_pagodas', cellDensity: 0.035 }, // 崇圣寺三塔（大理，稀有地标）
      ],
    },
  },
};
