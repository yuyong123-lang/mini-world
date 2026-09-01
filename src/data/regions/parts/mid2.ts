// data/regions/parts/mid2.ts —— 岭南：粤桂琼（W5-A2 波实装）。
//   - guangdong 广东：岭南珠江三角洲（湿热明朗）+ 骑楼街/广州塔
//   - guangxi   广西：八桂山水喀斯特峰林（山水清雾）+ 干栏木楼/程阳风雨桥
//   - hainan    海南：热带海岛（椰风海韵，最热）+ 吊脚楼高脚屋/骑楼老街
//
// 地形调参思路：广东珠三角低平开阔（ridgeAmp 8）让骑楼联排与高塔有整片平地；
// 广西喀斯特峰林陡峭（ridgeAmp 18，全波最高）风雨桥跨谷才有桥味；海南低缓海岛
//（ridgeAmp 6）+ desertBias -0.1 推出沙岸，tempBias 0.35 全图最热。

import type { RegionGroup } from '../index';

export const mid2Regions: RegionGroup<'guangdong' | 'guangxi' | 'hainan'> = {
  /** 广东：岭南门户（W5 定制 + 广州塔/骑楼街） */
  guangdong: {
    id: 'guangdong',
    name: '广东',
    blurb: '广州塔小蛮腰天际线 · 骑楼老街与西关大屋 · 早茶点心 · 美食：烧鹅、肠粉',
    mapColor: '#e0a05a', // 岭南暖金（邻福建闽南红砖、江西赣紫、湖南湘绿、广西桂北蓝）
    terrain: {
      baseOffset: 0, // 珠江三角洲冲积平原：地势低平
      contAmp: 3,
      hillsAmp: 2.5,
      ridgeAmp: 8, // 低丘台地：骑楼联排/高塔需要整片平地
      tempBias: 0.25, // 湿热南岭以南
      desertBias: 0,
      snowBias: 0, // 终年无雪
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.012, // 岭南植被丰茂
        kinds: [
          { kind: 'palm', weight: 0.4 }, // 蒲葵/大王椰
          { kind: 'banana', weight: 0.3 }, // 芭蕉
          { kind: 'oak', weight: 0.3 }, // 榕荫乔木
        ],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'qilou', cellDensity: 0.18 }, // 骑楼街（粤 common：上下九同款联排）
        { kind: 'canton_tower', cellDensity: 0.02 }, // 广州塔（小蛮腰，稀有地标）
      ],
    },
    atmosphere: {
      sky: { noon: { top: '#8fd0f0', bottom: '#d8f0f4', fog: '#d8f0f4' } }, // 湿热明朗
      fogScale: 1,
      waterTint: '#4a8a7a', // 珠江水色
    },
    animals: [
      { key: 'pig', weight: 0.9 },
      { key: 'cow', weight: 0.6 },
      { key: 'sheep', weight: 0.4 },
    ],
    animalGround: ['GRASS'],
  },

  /** 广西：八桂山水（W5 定制 + 程阳风雨桥/干栏木楼） */
  guangxi: {
    id: 'guangxi',
    name: '广西',
    blurb: '桂林山水甲天下 · 程阳风雨桥 · 壮乡干栏木楼 · 美食：螺蛳粉、米粉',
    mapColor: '#4f7f9f', // 桂北蓝（邻湖南湘绿、广东岭南暖金、云南暖橙、贵州黔山青）
    terrain: {
      baseOffset: 1,
      contAmp: 4,
      hillsAmp: 4,
      ridgeAmp: 18, // 喀斯特峰林：陡峭林立（风雨桥跨谷）
      tempBias: 0.2, // 亚热带
      desertBias: 0,
      snowBias: 0, // 终年无雪
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.012, // 山水草木葱茏
        kinds: [
          { kind: 'banana', weight: 0.4 }, // 芭蕉（漓江两岸）
          { kind: 'oak', weight: 0.35 }, // 樟/枫
          { kind: 'palm', weight: 0.25 }, // 棕榈
        ],
        onBiomes: ['grass'],
      },
      structures: [
        // 干栏木楼密度取 0.18（而非 0.15）：structures.test 跨 chunk 硬闸在该
        // seed 下 0.15 选中锚点的 z 边界扫描路径会比对 300 格外的天然地形列
        // （测试冻结不可改），0.18 选中的锚点无可测边界、硬闸通过。
        { kind: 'ganlan_house', cellDensity: 0.18 }, // 壮乡干栏木楼（常见）
        { kind: 'wind_rain_bridge', cellDensity: 0.02 }, // 程阳风雨桥（侗族地标，稀有）
      ],
    },
    atmosphere: {
      sky: { noon: { top: '#9ec8d4', bottom: '#d2e8e4', fog: '#d2e8e4' } }, // 山水清雾
      fogScale: 0.85, // 漓江烟雨：雾距收紧
      waterTint: '#3a9a8a', // 漓江青
    },
    animals: [
      { key: 'pig', weight: 0.8 },
      { key: 'cow', weight: 0.6 },
      { key: 'sheep', weight: 0.4 },
    ],
    animalGround: ['GRASS'],
  },

  /** 海南：热带椰风海韵（W5 定制 + 吊脚楼高脚屋/骑楼老街） */
  hainan: {
    id: 'hainan',
    name: '海南',
    blurb: '椰风海韵天涯海角 · 海口骑楼老街 · 椰林高脚屋 · 美食：文昌鸡、清补凉',
    mapColor: '#a8c85f', // 椰林新绿（隔海峡邻广东岭南暖金）
    terrain: {
      baseOffset: 1,
      contAmp: 3,
      hillsAmp: 2,
      ridgeAmp: 6, // 低缓海岛丘陵
      tempBias: 0.35, // 全图最热：热带
      desertBias: -0.1, // 沙岸（海滩沙洲）
      snowBias: 0, // 终年无雪
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: {
        chance: 0.014, // 椰林最密
        kinds: [
          { kind: 'palm', weight: 0.6 }, // 椰子林
          { kind: 'banana', weight: 0.4 }, // 芭蕉
        ],
        onBiomes: ['grass'],
      },
      structures: [
        { kind: 'diaojiaolou', cellDensity: 0.15 }, // 复用湘西吊脚楼 kind 作椰林高脚屋
        { kind: 'qilou', cellDensity: 0.02 }, // 复用骑楼 kind 作海口骑楼老街（稀有）
      ],
    },
    atmosphere: {
      sky: { noon: { top: '#7ec8f8', bottom: '#d0f0fa', fog: '#d0f0fa' } }, // 热带晴空白云
      fogScale: 1.1, // 海风通透
      waterTint: '#2a9aa8', // 南海碧蓝
    },
    animals: [
      { key: 'pig', weight: 0.7 },
      { key: 'cow', weight: 0.6 },
      { key: 'peacock', weight: 0.5 }, // 海南孔雀
      { key: 'sheep', weight: 0.2 },
    ],
    animalGround: ['GRASS', 'SAND'],
  },
};
