// ui/regionPickerData.ts —— 选区像素中国地图的纯数据 + 模块级硬校验。
// 零 DOM / 零 canvas：从 regionPicker.ts 抽出以便 vitest node 环境直接
// import 校验（tests/regionPicker.test.ts），也保证手写像素图一改错就
// 在模块加载瞬间抛错（W0e 契约：34 省级行政区恰好 34 个码槽）。
//
// 像素网格按经纬映射：col = (lon − 73) / 1.29°，row = (54 − lat) / 0.9°
// → 48 列覆盖 73°E–134.9°E，40 行覆盖 54°N–18.9°N。

import { REGIONS, type RegionId } from '../data/regions';

/** 地图列数/行数（经纬映射见文件头注释） */
export const MAP_W = 48;
export const MAP_H = 40;

/**
 * 像素中国地图：48 列 × 40 行，34 省级行政区各占一个 4-连通色块。
 * 字符含义：'0'=海 '1'=无区域陆地（俄蒙中亚印度东南亚等）
 *           '2'..'9' + 'a'..'z' = 34 个区域码（见 CODE_TO_REGION）。
 * 旧六区码沿用不动（2四川 3北京 4云南 5内蒙古 6新疆）；
 * 7 接管旧 dongbei 的图区位置并向北扩展，东北拆为 7黑龙江/8吉林/9辽宁；
 * dongbei 不给码——「在表不在图」（REGIONS.dongbei 仍存在，旧档兼容），
 * 从选区/随机自动消失。
 */
export const CHINA_MAP: readonly string[] = [
  '000000000000000000000000000000000000000777777000',
  '000000000000000000000000000000000055557777777770',
  '000000000000000000000000000000555555577777777770',
  '000000000000000000000000000555555557777777777770',
  '000000000000000000000000055555555577777777777770',
  '000000066666666661111111555555555577777777770000',
  '000000666666666666111111115555555550077777700000',
  '000006666666666666111111115555555550007777700000',
  '000006666666666666111111111555555555000777777000',
  '000006666666666666155555555555555555557777777700',
  '000006666666666666155555555555555555557777777700',
  '000006666666666661155555555555555555557777777000',
  '000006666666666666655555555555555555088888877000',
  '00000666666666666ggggg55555555555555999988888000',
  '00000666666666666ggggg5555555555bbb9999998888000',
  '00000666666666666ggggg5555555555b33a999998880000',
  '00000666666666666ggggg555555555bb33a999900000000',
  '00000666666666666ggggg55iiiffcccbbba099900000000',
  '000006666666666hhhhhggggiiifffcccbbb000000000000',
  '000006666666666hhhhhhgggiiifffcccbbdddd000000000',
  '00000666666666hhhhhhhhgggiifffccbbbdddd000000000',
  '0000066666666jjhhhhhhhgggiiffcceedddd00000000000',
  '0000jjjjjjjjjjhhhhhhhhhggggfffeeeddddd0000000000',
  '0000jjjjjjjjjjjjjjj2222222fffeeeeelll00000000000',
  '0000jjjjjjjjjjjjjjj22222222ffqqqqllll00000000000',
  '0000jjjjjjjjjjjjjjj222222vvqqqqqnnnllkk000000000',
  '0000jjjjjjjjjjjjjjj222222vvvqqqqqnnmmkk000000000',
  '0000jjjjjjjjjjjjjjj222222vvvqqqqnnnmmm0000000000',
  '0000jjjjjjjjjjjjjjj222222vvvrrrrppppmm0000000000',
  '0000jjjjjjjjjjjjjjj224444wwwwrrrppooomm000000000',
  '0000111111111111111444444wwwwrrrpppooo0000000000',
  '0000111111111111111444444wwwwrrrppooo00000000000',
  '0000111111111111111444444ttttrrrpppoo0xx00000000',
  '0000111111111111111444444ttttsssssooo0xx00000000',
  '0000111111111111111444444ttttsssss0000xx00000000',
  '0000111111111111111444444ttttsszzyy0000000000000',
  '000011111111111111144444tttttsssss00000000000000',
  '000011111111111111111111111100000000000000000000',
  '000000000000000000000000000uuu000000000000000000',
  '000000000000000000000000000uuu000000000000000000',
];

/**
 * 地图字符 → 区域 id（恰好 34 项；'0'/'1' 不在表内）。
 * 码序沿经纬排布：东北三省 7/8/9，京津冀 3/a/b，黄河 c/d/e/f，西北 g/h/i，
 * 青藏 j，华东 k-n，中南 o-s，西南 t/u/v/w（含广西/海南/重庆/贵州），
 * 东南海岛 x 台湾，特区 y/z。
 */
export const CODE_TO_REGION: Readonly<Record<string, RegionId>> = {
  '2': 'sichuan',
  '3': 'beijing',
  '4': 'yunnan',
  '5': 'neimenggu',
  '6': 'xinjiang',
  '7': 'heilongjiang',
  '8': 'jilin',
  '9': 'liaoning',
  'a': 'tianjin',
  'b': 'hebei',
  'c': 'shanxi',
  'd': 'shandong',
  'e': 'henan',
  'f': 'shaanxi',
  'g': 'gansu',
  'h': 'qinghai',
  'i': 'ningxia',
  'j': 'xizang',
  'k': 'shanghai',
  'l': 'jiangsu',
  'm': 'zhejiang',
  'n': 'anhui',
  'o': 'fujian',
  'p': 'jiangxi',
  'q': 'hubei',
  'r': 'hunan',
  's': 'guangdong',
  't': 'guangxi',
  'u': 'hainan',
  'v': 'chongqing',
  'w': 'guizhou',
  'x': 'taiwan',
  'y': 'hongkong',
  'z': 'aomen',
};

/** 可选区域 id（供「随机选择」与校验使用），从码表派生 */
export const PICKABLE: readonly RegionId[] = Object.values(CODE_TO_REGION);

// ---------------------------------------------------------------------------
// 模块级硬校验（手写像素图的第一道防线：画错启动即抛错）
// ---------------------------------------------------------------------------

function fail(msg: string): never {
  throw new Error(`regionPickerData: ${msg}`);
}

if (CHINA_MAP.length !== MAP_H) {
  fail(`行数 ${CHINA_MAP.length} ≠ ${MAP_H}`);
}
const CODES = new Set(Object.keys(CODE_TO_REGION));
if (CODES.size !== 34) {
  fail(`码表 ${CODES.size} 项 ≠ 34（34 省级行政区必须恰好 34 个码槽）`);
}
const pixels = new Map<string, Array<[number, number]>>();
for (const [r, row] of CHINA_MAP.entries()) {
  if (row.length !== MAP_W) {
    fail(`第 ${r} 行长度 ${row.length} ≠ ${MAP_W}`);
  }
  for (const [c, ch] of [...row].entries()) {
    if (ch !== '0' && ch !== '1' && !CODES.has(ch)) {
      fail(`(${r},${c}) 非法字符 '${ch}'`);
    }
    if (CODES.has(ch)) {
      const list = pixels.get(ch) ?? [];
      list.push([r, c]);
      pixels.set(ch, list);
    }
  }
}
for (const code of CODES) {
  const pts = pixels.get(code);
  if (!pts || pts.length < 2) {
    fail(`码 '${code}'（${CODE_TO_REGION[code]!}）仅 ${pts?.length ?? 0} 像素，< 2 不可点选`);
  }
  // 4-连通 flood fill：全部像素必须彼此相邻可达（色块断裂会导致选中描边破碎）
  const seen = new Set<string>([pts[0]!.join(',')]);
  const stack: Array<[number, number]> = [pts[0]!];
  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const key = `${r + dr},${c + dc}`;
      if (!seen.has(key) && pts.some(([pr, pc]) => pr === r + dr && pc === c + dc)) {
        seen.add(key);
        stack.push([r + dr, c + dc]);
      }
    }
  }
  if (seen.size !== pts.length) {
    fail(`码 '${code}'（${CODE_TO_REGION[code]!}）色块不 4-连通：${seen.size}/${pts.length}`);
  }
}
for (const id of PICKABLE) {
  if (!Object.prototype.hasOwnProperty.call(REGIONS, id)) {
    fail(`码表区域 '${id}' 不在 REGIONS 表中`);
  }
}
