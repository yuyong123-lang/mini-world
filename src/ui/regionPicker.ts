// ui/regionPicker.ts —— 像素风中国地图选区（新世界流程第一步）
// 无存档启动时展示：canvas 逐格绘制 48×40 像素地图，悬停高亮区域并显示
// 名称/特色，点选后「开始游戏」产出带区域前缀的 seed。
// 纯 DOM overlay + injectStyle（与 MenuSystem 同款模式），风格承接原首启遮罩。

import { REGIONS, type RegionDef, type RegionId } from '../data/regions';

/**
 * 像素中国地图：48 列 × 40 行。
 *   经度 73°E–135°E → col 0–47（约 1.29°/格）；纬度 54°N–18°N → row 0–39（0.9°/格）。
 * 字符含义：'0'=海 '1'=其他陆地 '2'..'7'=六区域（见 CODE_TO_REGION）。
 */
const CHINA_MAP: readonly string[] = [
  '000000000000000000000000000000000000077700000000',
  '000000000000000000000000000000000055577777000000',
  '000000000000000000000000000000005557777777000000',
  '000000000000000000000000000000055557777777700000',
  '000000000000000000000000000005555555577777777700',
  '000000000666660000000000000055555555577777777000',
  '000000006666666000000000000000555555777777770000',
  '000000066666666600000000000000005555777777700000',
  '000000066666666600000000000000000555577777700000',
  '000000066666666666000055555555555555577777770000',
  '000000066666666666000055555555555555577777700000',
  '000000066666666666055555555555555555577777700000',
  '000000066666666666055555555555555555777777000000',
  '000000066666666666055555555555555557777770000000',
  '000000066666666666555555555555555117777000000000',
  '000000066666666666555555555555511331770000000000',
  '000000066666666666555555555111111110077000000000',
  '000000066666666665555555551111111110000000000000',
  '000000066666666661111111111111111111111000000000',
  '000000066666666661111111111111111111000000000000',
  '000000066666666661111111111111111110000000000000',
  '000111111111111111111111111111111111000000000000',
  '000111111111111111111111111111111111100000000000',
  '000111111111111111222222222211111111100000000000',
  '000111111111111111122222222211111111110000000000',
  '000111111111111111112222222211111111110000000000',
  '000111111111111111112222222111111111000000000000',
  '000111111111111111122222221111111110000000000000',
  '000111111111111111122222441111111110000000000000',
  '000111111111111111144444441111111100000000000000',
  '000000000000000000044444441111111100000000000000',
  '000000000000000000044444441111111000000000000000',
  '000000000000000000044444441111110000000000000000',
  '000000000000000000044444441111100000000000000000',
  '000000000000000000044444411111000000000000000000',
  '000000000000000000044444111110000000010000000000',
  '000000000000000000004440000010000000000000000000',
  '000000000000000000000000000011000000000000000000',
  '000000000000000000000000000011000000000000000000',
  '000000000000000000000000000010000000000000000000',
];

/** 地图字符 → 区域 id */
const CODE_TO_REGION: Readonly<Record<string, RegionId>> = {
  '2': 'sichuan',
  '3': 'beijing',
  '4': 'yunnan',
  '5': 'neimenggu',
  '6': 'xinjiang',
  '7': 'dongbei',
};

/** 可选区域 id（供「随机选择」与校验使用） */
const PICKABLE: readonly RegionId[] = Object.values(CODE_TO_REGION);

/** 地图列数/行数与每格像素 */
const MAP_W = 48;
const MAP_H = 40;
const CELL = 6;

const SEA_COLOR = '#27435f';
const LAND_COLOR = '#7d7a6a';

/** 模块加载即校验地图数据形状（手写数据的第一道防线） */
for (const [i, row] of CHINA_MAP.entries()) {
  if (row.length !== MAP_W) {
    throw new Error(`CHINA_MAP 第 ${i} 行长度 ${row.length} ≠ ${MAP_W}`);
  }
}
if (CHINA_MAP.length !== MAP_H) {
  throw new Error(`CHINA_MAP 行数 ${CHINA_MAP.length} ≠ ${MAP_H}`);
}

/**
 * 弹出区域选择界面（全屏遮罩）。
 * @returns 玩家确认的区域 id（含随机选择）；组件关闭后遮罩自移除。
 */
export function showRegionPicker(parent: HTMLElement): Promise<RegionId> {
  // 防御性释放：无论从哪条路径弹出，选区过程中鼠标必须保持自由
  try {
    document.exitPointerLock?.();
  } catch { /* 未锁定时无害 */ }
  return new Promise((resolve) => {
    let selected: RegionId | null = null;
    let hovered: RegionId | null = null;

    const mask = document.createElement('div');
    mask.id = 'region-picker';
    mask.innerHTML = `
<div class="rp-card">
  <h1>选择你的世界</h1>
  <p class="rp-sub">点选地图上的区域，进入属于它的风土世界</p>
  <div class="rp-body">
    <canvas class="rp-map" width="${MAP_W * CELL}" height="${MAP_H * CELL}"></canvas>
    <div class="rp-side">
      <div class="rp-info">
        <div class="rp-name">中国</div>
        <div class="rp-blurb">移动鼠标查看各区域特色，点击选中后开始游戏。</div>
      </div>
      <button class="rp-start" disabled>开始游戏</button>
      <button class="rp-random">🎲 随机选择</button>
    </div>
  </div>
  <p class="rp-help">WASD 移动 · 空格跳 · 左键挖 · 右键放/吃 · E 背包 · ESC 菜单</p>
</div>`;
    parent.appendChild(mask);

    // ---- 样式（id 幂等注入）----
    const styleId = 'region-picker-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
#region-picker{position:fixed;inset:0;z-index:60;background:rgba(8,10,16,.88);
  display:flex;align-items:center;justify-content:center;font-family:sans-serif}
#region-picker .rp-card{text-align:center;color:#fff}
#region-picker h1{font-size:34px;margin:0 0 4px}
#region-picker .rp-sub{color:#9aa4b0;margin:0 0 14px;font-size:13px}
#region-picker .rp-body{display:flex;gap:14px;align-items:stretch;
  background:#141a24;border:1px solid #2a3342;border-radius:10px;padding:14px}
#region-picker .rp-map{image-rendering:pixelated;border-radius:6px;cursor:crosshair;
  background:#0d1420}
#region-picker .rp-side{width:220px;display:flex;flex-direction:column;gap:10px}
#region-picker .rp-info{text-align:left;flex:1;background:#1a2230;border-radius:8px;
  padding:10px 12px;min-height:120px}
#region-picker .rp-name{font-size:20px;font-weight:bold;margin-bottom:6px}
#region-picker .rp-blurb{font-size:12px;line-height:1.6;color:#b8c0cc}
#region-picker button{font-size:15px;padding:9px 12px;border-radius:6px;border:0;
  cursor:pointer;font-weight:bold}
#region-picker .rp-start{background:#ffd75e;color:#333}
#region-picker .rp-start:disabled{background:#4a4f58;color:#888;cursor:not-allowed}
#region-picker .rp-random{background:#2a3342;color:#cfd6e0;font-weight:normal}
#region-picker .rp-help{color:#79828e;font-size:12px;margin-top:12px}
`;
      document.head.appendChild(style);
    }

    const canvas = mask.querySelector<HTMLCanvasElement>('.rp-map')!;
    const ctx = canvas.getContext('2d')!;
    const infoName = mask.querySelector<HTMLElement>('.rp-name')!;
    const infoBlurb = mask.querySelector<HTMLElement>('.rp-blurb')!;
    const startBtn = mask.querySelector<HTMLButtonElement>('.rp-start')!;

    /** 重绘整图：base=悬停/选中区域叠加提亮 */
    function draw(): void {
      for (let r = 0; r < MAP_H; r++) {
        for (let c = 0; c < MAP_W; c++) {
          const code = CHINA_MAP[r]![c]!;
          let color: string;
          if (code === '0') color = SEA_COLOR;
          else if (code === '1') color = LAND_COLOR;
          else color = REGIONS[CODE_TO_REGION[code]!]!.mapColor;
          ctx.fillStyle = color;
          ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
          // 悬停/选中区域整块提亮（像素风的简化高亮）
          const rid = code === '1' || code === '0' ? null : CODE_TO_REGION[code]!;
          if (rid && (rid === hovered || rid === selected)) {
            ctx.fillStyle = rid === selected ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.25)';
            ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
          }
        }
      }
      // 选中描边：把选中区域的边界格描一圈深色（逐格检查四邻）
      if (selected) {
        ctx.fillStyle = '#fff';
        for (let r = 0; r < MAP_H; r++) {
          for (let c = 0; c < MAP_W; c++) {
            if (CHINA_MAP[r]![c]! === '0' || CODE_TO_REGION[CHINA_MAP[r]![c]!] !== selected) {
              continue;
            }
            const border =
              c === 0 || CHINA_MAP[r]![c - 1]! === '0' ||
              c === MAP_W - 1 || CHINA_MAP[r]![c + 1]! === '0' ||
              r === 0 || CHINA_MAP[r - 1]![c]! === '0' ||
              r === MAP_H - 1 || CHINA_MAP[r + 1]![c]! === '0';
            if (border) ctx.fillRect(c * CELL, r * CELL, CELL, 1);
          }
        }
      }
    }

    function showInfo(def: RegionDef | null): void {
      if (def) {
        infoName.textContent = def.name;
        infoBlurb.textContent = def.blurb;
        infoName.style.color = def.mapColor;
      } else {
        infoName.textContent = '中国';
        infoName.style.color = '#fff';
        infoBlurb.textContent = '移动鼠标查看各区域特色，点击选中后开始游戏。';
      }
    }

    function pickCell(ev: MouseEvent): RegionId | null {
      const rect = canvas.getBoundingClientRect();
      const c = Math.floor(((ev.clientX - rect.left) / rect.width) * MAP_W);
      const r = Math.floor(((ev.clientY - rect.top) / rect.height) * MAP_H);
      if (c < 0 || c >= MAP_W || r < 0 || r >= MAP_H) return null;
      const code = CHINA_MAP[r]![c]!;
      return code === '0' || code === '1' ? null : CODE_TO_REGION[code]!;
    }

    canvas.addEventListener('mousemove', (ev) => {
      const rid = pickCell(ev);
      if (rid !== hovered) {
        hovered = rid;
        draw();
        showInfo(rid ? REGIONS[rid]! : null);
      }
    });
    canvas.addEventListener('mouseleave', () => {
      hovered = null;
      draw();
      showInfo(selected ? REGIONS[selected]! : null);
    });

    function finish(id: RegionId): void {
      mask.remove();
      document.getElementById(styleId)?.remove();
      resolve(id);
    }

    canvas.addEventListener('click', (ev) => {
      const rid = pickCell(ev);
      if (!rid) return;
      selected = rid;
      startBtn.disabled = false;
      startBtn.textContent = `进入${REGIONS[rid]!.name}`;
      draw();
      showInfo(REGIONS[rid]!);
    });

    startBtn.addEventListener('click', () => {
      if (selected) finish(selected);
    });
    mask.querySelector('.rp-random')?.addEventListener('click', () => {
      finish(PICKABLE[Math.floor(Math.random() * PICKABLE.length)]!);
    });

    draw(); // 初始渲染：遮罩打开即显示完整地图
  });
}
