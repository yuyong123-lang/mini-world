// data/regions/parts/gangao.ts —— 港澳：香港/澳门（W6-A3 波实装：地形定制 +
// 中银大厦/高层住宅楼 + 大三巴牌坊/葡式粉彩小楼 结构表）。
//
// 地形调参思路：两个特区都是「城在海边」的滨海丘陵——
//   - 香港：维港两岸高楼 + 太平山（ridgeAmp 12，全波最高峰压在城区背后）+
//     城市绿化稀树（chance 0.005，榕/风水林）；结构 = 高层住宅楼常见 +
//     中银大厦稀有地标。
//   - 澳门：葡式半岛极平缓（ridgeAmp 4、hillsAmp 1.5——大三巴牌坊需要整片
//     平地落立面与石阶）；结构 = 葡式粉彩小楼常见 + 大三巴稀有地标。

import type { RegionGroup } from '../index';

export const gangaoRegions: RegionGroup<'hongkong' | 'aomen'> = {
  /** 香港：东方之珠维港（W6 定制 + 中银大厦/高层住宅楼） */
  hongkong: {
    id: 'hongkong',
    name: '香港',
    blurb: '维多利亚港摩天天际线 · 中银大厦节节高升 · 霓虹夜色与太平山 · 美食：茶餐厅、烧味、丝袜奶茶',
    mapColor: '#d46f8f', // 维港洋红（邻广东岭南暖金）
    terrain: {
      baseOffset: 0, // 城区贴海：维港岸线就在脚下
      contAmp: 3,
      hillsAmp: 4, // 港岛坡地
      ridgeAmp: 12, // 太平山：城区背后的山海脊线
      tempBias: 0.25, // 亚热带海洋性：终年无雪
      desertBias: 0,
      snowBias: 0,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.005, // 城市绿化：公园与行道树
        kinds: [
          { kind: 'pagoda', weight: 0.5 }, // 风水林/庙前古树
          { kind: 'oak', weight: 0.5 }, // 榕荫行道树
        ],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'hk_tower', cellDensity: 0.2 }, // 高层住宅楼（公屋/私楼塔楼，常见）
        { kind: 'boc_tower', cellDensity: 0.02 }, // 中银大厦（三棱水晶塔，稀有地标）
      ],
    },
    atmosphere: {
      sky: { noon: { top: '#7cc4f4', bottom: '#e0f0fa', fog: '#e0f0fa' } }, // 都市亮丽：现代亮蓝
      fogScale: 1.05, // 维港海雾微濛
      waterTint: '#3a7a9a', // 维多利亚港深青
    },
    animals: [
      { key: 'pig', weight: 0.6 },
      { key: 'cow', weight: 0.5 },
      { key: 'sheep', weight: 0.4 },
    ],
    animalGround: ['GRASS'],
  },

  /** 澳门：中西交汇四百载（W6 定制 + 大三巴牌坊/葡式粉彩小楼） */
  aomen: {
    id: 'aomen',
    name: '澳门',
    blurb: '大三巴牌坊与妈阁庙 · 葡式碎石路与小楼 · 霓虹夜色之外的老城 · 美食：葡挞、猪扒包、水蟹粥',
    mapColor: '#c9a05f', // 葡式沙金（邻广东岭南暖金、香港维港洋红）
    terrain: {
      baseOffset: 0, // 半岛贴海
      contAmp: 3,
      hillsAmp: 1.5, // 极平缓：大三巴立面与石阶需要整片平地
      ridgeAmp: 4, // 东望洋山余脉仅余小丘
      tempBias: 0.25, // 亚热带：终年无雪
      desertBias: 0,
      snowBias: 0,
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.005, // 街心花园稀树
        kinds: [{ kind: 'pagoda', weight: 1 }], // 妈阁庙前古榕
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'pastel_house', cellDensity: 0.18 }, // 葡式粉彩小楼（氹仔老城常见）
        { kind: 'dasanba', cellDensity: 0.02 }, // 大三巴牌坊（世界遗产，稀有地标）
      ],
    },
    atmosphere: {
      sky: { noon: { top: '#8cc8ee', bottom: '#f5efe0', fog: '#f5efe0' } }, // 南欧暖阳：地平线偏暖白
      fogScale: 1.1, // 海风通透
      waterTint: '#2a8a9a', // 湾仔水色青碧
    },
    animals: [
      { key: 'pig', weight: 0.6 },
      { key: 'cow', weight: 0.5 },
      { key: 'sheep', weight: 0.4 },
    ],
    animalGround: ['GRASS'],
  },
};
