// data/regions/parts/zang.ts —— 青藏高原（W3 波定制）：青海 + 西藏。
//   qinghai 青海湖高原（塔尔寺八宝如意塔群 + 藏式碉房）
//   xizang  雪域屋脊（布达拉宫 + 藏式碉房）
// 两区均为 W3 新定制（无 legacy 覆盖位）。参数风格与 W1/W2 波同族：
//   高海拔（baseOffset 4/5）+ 负温偏 + 强雪偏置（snowBias 0.4/0.5）压出「高原雪线」，
//   山脊振幅写意昆仑/唐古拉（14/18），树表只留云杉且极稀（高山草甸不易成林），
//   动物表以高原家畜为主（cow 前置 = 牦牛语义，可出没于雪线草场）。

import type { RegionGroup } from '../index';

export const zangRegions: RegionGroup<'qinghai' | 'xizang'> = {
  /** 青海：江河源头高原湖泊（W3 定制 + 塔尔寺八宝塔群/藏式碉房） */
  qinghai: {
    id: 'qinghai',
    name: '青海',
    blurb: '塔尔寺八宝如意塔 · 青海湖高原牧歌 · 美食：手抓羊肉、老酸奶',
    mapColor: '#6f9fc8', // 高原湖蓝（邻甘肃深赭、西藏雪域紫、新疆沙金）
    terrain: {
      baseOffset: 4, // 高海拔台地
      contAmp: 4,
      hillsAmp: 3,
      ridgeAmp: 14, // 祁连/昆仑山脊
      tempBias: -0.15, // 高寒
      desertBias: 0,
      snowBias: 0.4, // 柴达木/雪线：雪原成片
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: { chance: 0.005, kinds: [{ kind: 'spruce', weight: 1 }], onBiomes: ['grass'] },
      structures: [
        { kind: 'zangdiaofang', cellDensity: 0.15 }, // 藏式碉房（青海/西藏常见民居）
        { kind: 'babao_pagodas', cellDensity: 0.02 }, // 塔尔寺八宝如意塔群（地标，稀有）
      ],
    },
    atmosphere: {
      sky: {
        noon: { top: '#2f66c0', bottom: '#a8c8e8', fog: '#bcd8ee' }, // 高原湛蓝（深蓝高透明）
      },
      fogScale: 1.3, // 高原极通透
      waterTint: '#3a8ab0', // 青海湖青
    },
    animals: [
      { key: 'sheep', weight: 1.5 }, // 高原牧歌
      { key: 'cow', weight: 1 }, // 牦牛语义
      { key: 'horse', weight: 0.4 }, // 河曲马
    ],
    animalGround: ['GRASS', 'SNOW'], // 牲畜可上雪线草场
  },

  /** 西藏：世界屋脊雪域圣地（W3 定制 + 布达拉宫/藏式碉房） */
  xizang: {
    id: 'xizang',
    name: '西藏',
    blurb: '布达拉宫与雪域屋脊 · 大昭寺转经道 · 美食：糌粑、酥油茶',
    mapColor: '#8f6fae', // 雪域紫（邻青海湖蓝、新疆沙金、四川盆地绿、云南暖橙）
    terrain: {
      baseOffset: 5, // 世界屋脊（全图最高基准）
      contAmp: 5,
      hillsAmp: 4,
      ridgeAmp: 18, // 唐古拉/喜马拉雅雪山
      tempBias: -0.2, // 雪域高寒
      desertBias: 0,
      snowBias: 0.5, // 雪线大幅下压：雪山连绵
      surface: {
        grass: { top: 'GRASS', sub: 'DIRT' },
        desert: { top: 'SAND', sub: 'SAND' },
        snow: { top: 'SNOW', sub: 'DIRT' },
      },
      trees: { chance: 0.003, kinds: [{ kind: 'spruce', weight: 1 }], onBiomes: ['grass'] },
      structures: [
        { kind: 'zangdiaofang', cellDensity: 0.13 }, // 藏式碉房（常见民居）
        { kind: 'potala', cellDensity: 0.02 }, // 布达拉宫（全项目最大建筑，稀有）
      ],
    },
    atmosphere: {
      sky: {
        noon: { top: '#2a5cb8', bottom: '#a0c0e4', fog: '#b4cce8' }, // 高原圣湖蓝
        night: { top: '#060a1c', bottom: '#101a34', fog: '#182440' }, // 神圣深蓝夜空
      },
      fogScale: 1.35, // 雪域极通透
      waterTint: '#3a7a9a', // 高原湖泊青蓝
    },
    animals: [
      { key: 'cow', weight: 2 }, // 牦牛（高原主角）
      { key: 'sheep', weight: 1 },
      { key: 'horse', weight: 0.3 }, // 藏马
    ],
    animalGround: ['GRASS', 'SNOW'], // 牦牛可上雪原
  },
};
