// data/regions/parts/xinan1.ts —— 川渝（W6-A1 波拥有：重庆定制 + 洪崖洞/解放碑、
// 四川增强版 + 乐山大佛）。
//
// 四川 = 旧区增强覆盖：legacy sichuan 的全部字段逐字展开保留（盆地多水地形/
// 竹林稀树/雾气氛围/动物表等兼容哨兵由 tests/regions/xinan1.test.ts 把关），仅
// terrain.structures 追加稀有地标 leshan_buddha（乐山大佛，cellDensity 0.02）；
// 川西民居 house 0.18 照旧。
// 重庆 = W6 新定制：山城雾都（ridgeAmp 20 山城坡地 + 雾气氤氲 + 两江浑黄），
// 常见结构 hongyadong（洪崖洞吊脚楼群）+ 稀有地标 jiefangbei（解放碑）。

import { legacyRegions } from './legacy';
import type { RegionGroup } from '../index';

export const xinan1Regions: RegionGroup<'chongqing' | 'sichuan'> = {
  /** 重庆：山城雾都（W6 定制 + 洪崖洞吊脚楼群/解放碑） */
  chongqing: {
    id: 'chongqing',
    name: '重庆',
    blurb: '山城雾都 8D 魔幻 · 洪崖洞吊脚楼群与解放碑 · 山城夜景 · 美食：火锅、小面',
    mapColor: '#d9773f', // 山城橙（邻四川盆地绿、湖北荆楚青、湖南湘绿、贵州黔山青、陕西赭红）
    terrain: {
      baseOffset: 2, // 山城坡地整体抬升
      contAmp: 4,
      hillsAmp: 5,
      ridgeAmp: 20, // 山城坡地：脊线起伏显著（大于四川盆地）
      tempBias: 0.1,
      desertBias: 0,
      snowBias: 0.15,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.01, // 竹木混生（山地竹丛 + 香樟杂树）
        kinds: [
          { kind: 'bamboo', weight: 0.5 },
          { kind: 'oak', weight: 0.5 },
        ],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'hongyadong', cellDensity: 0.15 }, // 洪崖洞吊脚楼群（山城常见）
        { kind: 'jiefangbei', cellDensity: 0.02 }, // 解放碑（都市地标，稀有）
      ],
    },
    atmosphere: {
      sky: {
        noon: { top: '#8fa8b0', bottom: '#c0ccc8', fog: '#b8c4c0' }, // 雾都：青灰雾面
      },
      fogScale: 0.7, // 雾都（同四川盆地雾气量级）
      waterTint: '#6a7a5a', // 长江/嘉陵江两江浑黄
    },
    animals: [
      { key: 'pig', weight: 0.6 },
      { key: 'cow', weight: 0.5 },
      { key: 'sheep', weight: 0.3 },
    ],
    animalGround: ['GRASS'],
  },

  // ---- 旧区增强覆盖位（四川）：从 legacy sichuan 展开继承（盆地多水地形/
  // 竹林稀树表/雾气氛围/动物表逐字同源），仅 terrain.structures 追加稀有地标
  // leshan_buddha（乐山大佛，cellDensity 0.02）。竹林/雾气/熊猫氛围是旧档兼容
  // 哨兵，tests/regions/xinan1.test.ts 会断言其与 legacy 逐字段一致。----
  sichuan: {
    ...legacyRegions.sichuan,
    terrain: {
      ...legacyRegions.sichuan.terrain,
      structures: [
        { kind: 'house', cellDensity: 0.18 }, // 川西民居（照旧）
        { kind: 'leshan_buddha', cellDensity: 0.02 }, // 乐山大佛（W6 增强追加）
      ],
    },
  },
};
