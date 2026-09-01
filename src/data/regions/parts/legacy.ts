// data/regions/parts/legacy.ts —— 旧区域定义（冻结区，禁止修改）
//
// generic + 旧六区（sichuan/beijing/yunnan/neimenggu/xinjiang/dongbei）的
// RegionDef 从旧 src/data/regions.ts **逐字节迁移**而来：任何数值/方块 key/
// 结构 cellDensity 的改动都会平移旧世界地形与建筑锚点（隐性存档破坏）。
//
// 旧区增强（W1 起追加标志建筑）不在这里做——各地理组文件用同 id 条目
// 覆盖 legacy（见 index.ts 的 REGIONS 聚合顺序），本文件永远保持原样。
// dongbei 遵循 D5「在表不在图」：定义保留（旧 seed/存档兼容），但不给选区码。

import type { RegionGroup } from '../index';

export const legacyRegions: RegionGroup<
  'generic' | 'sichuan' | 'beijing' | 'yunnan' | 'neimenggu' | 'xinjiang' | 'dongbei'
> = {
  generic: {
    id: 'generic',
    name: '迷你世界',
    blurb: '经典迷你世界：草原、沙漠与雪原自然分布。',
    mapColor: '#7cb464',
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
      structures: [],
    },
    atmosphere: { fogScale: 1 },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 1 },
      { key: 'sheep', weight: 1 },
    ],
    animalGround: ['GRASS'],
  },

  // ---- 六个中国区域（地貌/建筑/动植物/氛围复刻自各地特色）----

  /** 四川：盆地丘陵湿润多水，竹林成片 —— 大熊猫栖息地 */
  sichuan: {
    id: 'sichuan',
    name: '四川',
    blurb: '盆地丘陵，雾气氤氲 · 竹林与熊猫之乡 · 美食：火锅、竹笋',
    mapColor: '#4a8f3c',
    terrain: {
      baseOffset: -2, // 盆地多水
      contAmp: 6,
      hillsAmp: 4,
      ridgeAmp: 14,
      tempBias: 0,
      desertBias: 0,
      snowBias: 0.3, // 湿润：雪线更难触发
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.012,
        kinds: [
          { kind: 'bamboo', weight: 0.7 },
          { kind: 'oak', weight: 0.3 },
        ],
        onBiomes: ['grass'],
      },
      structures: [{ kind: 'house', cellDensity: 0.18 }],
    },
    atmosphere: {
      sky: {
        noon: { top: '#a8c4c0', bottom: '#c8d4cc', fog: '#c8d4cc' }, // 盆地雾气
      },
      fogScale: 0.7,
      waterTint: '#5a7a6a',
    },
    animals: [
      { key: 'pig', weight: 0.35 },
      { key: 'cow', weight: 0.35 },
      { key: 'sheep', weight: 0.3 },
    ],
    animalGround: ['GRASS'],
  },

  /** 北京：华北平原，四合院与红墙黄瓦的帝都气象 */
  beijing: {
    id: 'beijing',
    name: '北京',
    blurb: '华北平原 · 四合院与红墙金瓦 · 美食：烤鸭、糖葫芦',
    mapColor: '#b03a2e',
    terrain: {
      baseOffset: 1,
      contAmp: 4,
      hillsAmp: 2,
      ridgeAmp: 8,
      tempBias: 0,
      desertBias: 0.3, // 干冷：沙漠更难出现
      snowBias: 0.4, // 冬季雪原收紧
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: { chance: 0.007, kinds: [{ kind: 'pagoda', weight: 1 }], onBiomes: ['grass'] },
      structures: [
        { kind: 'siheyuan', cellDensity: 0.22 },
        { kind: 'palace', cellDensity: 0.02 },
      ],
    },
    atmosphere: {
      sky: { noon: { top: '#8fc4f5', bottom: '#c8e0f0', fog: '#c8e0f0' } },
      fogScale: 1,
      waterTint: '#4a7a9a',
    },
    animals: [
      { key: 'pig', weight: 1 },
      { key: 'cow', weight: 1 },
      { key: 'sheep', weight: 1 },
    ],
    animalGround: ['GRASS'],
  },

  /** 云南：热带山地梯田，傣族竹楼与茶树芭蕉 */
  yunnan: {
    id: 'yunnan',
    name: '云南',
    blurb: '热带山地梯田 · 傣家竹楼、大象与孔雀 · 美食：过桥米线',
    mapColor: '#e67e22',
    terrain: {
      baseOffset: 1,
      contAmp: 6,
      hillsAmp: 3,
      ridgeAmp: 22,
      tempBias: 0.35, // 热带：整体偏暖
      desertBias: 0,
      snowBias: 0,
      terraceStep: 4, // 山地梯田量化
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.011,
        kinds: [
          { kind: 'palm', weight: 0.4 },
          { kind: 'banana', weight: 0.3 },
          { kind: 'tea', weight: 0.3 },
        ],
        onBiomes: ['grass'],
      },
      structures: [{ kind: 'bamboo_house', cellDensity: 0.2 }],
    },
    atmosphere: {
      sky: { noon: { top: '#8fd0c0', bottom: '#d8f0d0', fog: '#d0e8d0' } },
      fogScale: 0.9,
      waterTint: '#3a8a6a',
    },
    animals: [
      { key: 'pig', weight: 0.4 },
      { key: 'cow', weight: 0.3 },
      { key: 'sheep', weight: 0.3 },
    ],
    animalGround: ['GRASS'],
  },

  /** 内蒙古：一马平川的大草原，蒙古包与马群羊群 */
  neimenggu: {
    id: 'neimenggu',
    name: '内蒙古',
    blurb: '辽阔草原 · 蒙古包、马群与羊群 · 美食：烤全羊、奶茶',
    mapColor: '#8fd18f',
    terrain: {
      baseOffset: 1,
      contAmp: 3,
      hillsAmp: 1.5,
      ridgeAmp: 0, // 大平原：无山脊
      tempBias: 0,
      desertBias: 0,
      snowBias: 0,
      forceBiome: 'grass',
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: { chance: 0.0015, kinds: [{ kind: 'oak', weight: 1 }], onBiomes: ['grass'] },
      structures: [{ kind: 'yurt', cellDensity: 0.22 }],
    },
    atmosphere: {
      sky: {
        noon: { top: '#9fd0f0', bottom: '#d8e4e8', fog: '#d8e4e8' }, // 天苍苍野茫茫
      },
      fogScale: 1.15,
      waterTint: '#4a8ab0',
    },
    animals: [
      { key: 'sheep', weight: 0.5 },
      { key: 'cow', weight: 0.3 },
      { key: 'pig', weight: 0.2 },
    ],
    animalGround: ['GRASS'],
  },

  /** 新疆：沙漠与绿洲共存，胡杨与葡萄架 */
  xinjiang: {
    id: 'xinjiang',
    name: '新疆',
    blurb: '大漠孤烟 · 绿洲葡萄架与胡杨 · 美食：羊肉串、哈密瓜、馕',
    mapColor: '#d4b46a',
    terrain: {
      baseOffset: 2,
      contAmp: 4,
      hillsAmp: 3,
      ridgeAmp: 10,
      tempBias: 0.2,
      desertBias: -0.5, // 大面积沙漠，绿洲成噪点
      snowBias: 0,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' }, // 绿洲
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: { chance: 0.004, kinds: [{ kind: 'poplar', weight: 1 }], onBiomes: ['grass'] },
      structures: [{ kind: 'oasis_farm', cellDensity: 0.15 }],
    },
    atmosphere: {
      sky: {
        noon: { top: '#a8d0e8', bottom: '#e0d8b8', fog: '#e0d8b8' }, // 大漠晴空
      },
      fogScale: 1.25,
      waterTint: '#5aa0a8',
    },
    animals: [
      { key: 'sheep', weight: 0.4 },
      { key: 'pig', weight: 0.3 },
      { key: 'cow', weight: 0.3 },
    ],
    animalGround: ['GRASS', 'SAND'], // 骆驼可出没于沙漠
  },

  /** 东北：林海雪原，雪乡木屋，猛虎出没 */
  dongbei: {
    id: 'dongbei',
    name: '东北',
    blurb: '林海雪原 · 雪乡木屋与针叶林 · 美食：冻梨、酸菜 · 猛虎出没',
    mapColor: '#a8d4e8',
    terrain: {
      baseOffset: 1,
      contAmp: 5,
      hillsAmp: 3,
      ridgeAmp: 16,
      tempBias: 0,
      desertBias: 0,
      snowBias: 0,
      forceBiome: 'snow',
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      waterTopBlock: 'ICE', // 湖面结冰
      trees: { chance: 0.014, kinds: [{ kind: 'spruce', weight: 1 }], onBiomes: ['snow'] },
      structures: [{ kind: 'snow_cabin', cellDensity: 0.18 }],
    },
    atmosphere: {
      sky: {
        night: { top: '#0a1220', bottom: '#182030', fog: '#202838' }, // 寒夜深远
      },
      fogScale: 0.85,
      waterTint: '#3a5a7a',
    },
    animals: [
      { key: 'sheep', weight: 0.5 },
      { key: 'pig', weight: 0.3 },
      { key: 'cow', weight: 0.2 },
    ],
    animalGround: ['SNOW', 'GRASS'],
  },
};
