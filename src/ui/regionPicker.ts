// ui/regionPicker.ts —— 真实轮廓中国地图选区（新世界流程第一步）
// 无存档启动时展示：canvas 矢量绘制 34 个省级行政区真实边界（数据见 chinaGeo.ts，
// DataV GeoAtlas 简化内嵌），墨卡托投影 + DPR 高清渲染；悬停高亮省份并显示名称/特色，
// 点选后「开始游戏」产出带区域前缀的 seed。
// 纯 DOM overlay + injectStyle（与 MenuSystem 同款模式）。

import { REGIONS, type RegionDef, type RegionId } from '../data/regions';
import { CHINA_GEO, CHINA_LABELS } from './chinaGeo';
import { PICKABLE } from './regionPickerData';

const SEA_COLOR = '#1d3a55';
const BORDER_COLOR = 'rgba(10,16,24,.55)';
const HOVER_OVERLAY = 'rgba(255,255,255,.28)';
const SELECTED_OVERLAY = 'rgba(255,255,255,.42)';
const CANVAS_W = 920; // CSS 像素（buffer 乘 dpr，保证高分屏清晰）
const CANVAS_H = 660;

// ---- 投影（模块级一次性计算：数据静态、画布尺寸固定）----
const rad = Math.PI / 180;
const mercY = (lat: number): number => Math.log(Math.tan(Math.PI / 4 + (lat * rad) / 2));

/** 主图纬度下限（海南以南的三沙小环不参与 bbox，绘制时自然裁出画布外） */
const MAIN_LAT_MIN = 17;
const bbox = ((): { minX: number; maxX: number; minY: number; maxY: number } => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const rings of Object.values(CHINA_GEO)) {
    for (const ring of rings) {
      for (const pt of ring) {
        const lon = pt[0]!, lat = pt[1]!;
        if (lat < MAIN_LAT_MIN) continue; // 南海诸岛小环不撑大主图
        const x = lon * rad, y = mercY(lat);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, maxX, minY, maxY };
})();
const SCALE = Math.min((CANVAS_W * 0.95) / (bbox.maxX - bbox.minX), (CANVAS_H * 0.94) / (bbox.maxY - bbox.minY));
const OFF_X = (CANVAS_W - (bbox.maxX - bbox.minX) * SCALE) / 2;
const OFF_Y = (CANVAS_H - (bbox.maxY - bbox.minY) * SCALE) / 2;
const px = (lon: number): number => (lon * rad - bbox.minX) * SCALE + OFF_X;
const py = (lat: number): number => (bbox.maxY - mercY(lat)) * SCALE + OFF_Y;

/** 地图模型（惰性单例：Path2D/离屏 canvas 属 DOM API，模块加载必须零 DOM 保证 node 可测） */
interface MapModel {
  paths: Map<RegionId, Path2D>;
  labels: Array<{ id: RegionId; x: number; y: number; w: number }>;
  hitCtx: CanvasRenderingContext2D;
}
let model: MapModel | null = null;
function getMapModel(): MapModel {
  if (model) return model;
  // 每省一个 Path2D（全部环并入；构建一次，悬停重绘直接复用）
  const paths = new Map<RegionId, Path2D>();
  for (const [id, rings] of Object.entries(CHINA_GEO)) {
    const path = new Path2D();
    for (const ring of rings) {
      path.moveTo(px(ring[0]![0]!), py(ring[0]![1]!));
      for (let i = 1; i < ring.length; i++) path.lineTo(px(ring[i]![0]!), py(ring[i]![1]!));
      path.closePath();
    }
    paths.set(id as RegionId, path);
  }
  // 命中检测专用上下文：保持恒等变换（与渲染 canvas 的 DPR 变换解耦，
  // 否则 isPointInPath 的点不随 CTM 变换而 path 随——高分屏下整体错位 dpr 倍）
  const hitCtx = document.createElement('canvas').getContext('2d')!;
  // 省名标注：label 像素位置 + 省份像素包围盒宽（判断名字放不放得下）；大省先画
  const labels: Array<{ id: RegionId; x: number; y: number; w: number }> = [];
  for (const [id, rings] of Object.entries(CHINA_GEO)) {
    const label = CHINA_LABELS[id];
    if (!label) continue;
    let minX = Infinity, maxX = -Infinity;
    for (const ring of rings) {
      for (const pt of ring) {
        if (pt[1]! < MAIN_LAT_MIN) continue;
        const x = px(pt[0]!);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    labels.push({ id: id as RegionId, x: px(label[0]), y: py(label[1]), w: maxX - minX });
  }
  labels.sort((a, b) => b.w - a.w);
  model = { paths, labels, hitCtx };
  return model;
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
    const { paths, labels, hitCtx } = getMapModel();
    let selected: RegionId | null = null;
    let hovered: RegionId | null = null;

    const mask = document.createElement('div');
    mask.id = 'region-picker';
    mask.innerHTML = `
<div class="rp-card">
  <h1>选择你的世界</h1>
  <p class="rp-sub">点选地图上的省级行政区，进入属于它的风土世界</p>
  <div class="rp-body">
    <div class="rp-map-wrap"><canvas class="rp-map" width="${CANVAS_W}" height="${CANVAS_H}"></canvas></div>
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
#region-picker .rp-card{text-align:center;color:#fff;max-width:96vw}
#region-picker h1{font-size:32px;margin:0 0 4px}
#region-picker .rp-sub{color:#9aa4b0;margin:0 0 14px;font-size:13px}
#region-picker .rp-body{display:flex;gap:14px;align-items:stretch;
  background:#141a24;border:1px solid #2a3342;border-radius:10px;padding:14px}
#region-picker .rp-map-wrap{border-radius:6px;background:#0d1420;overflow:hidden}
#region-picker .rp-map{display:block;max-width:100%;height:auto;cursor:crosshair}
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
    // DPR 高清：buffer 乘设备像素比，绘制坐标保持 CSS 像素（Path2D 同坐标系）
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(CANVAS_W * dpr);
    canvas.height = Math.round(CANVAS_H * dpr);
    canvas.style.width = `${CANVAS_W}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const infoName = mask.querySelector<HTMLElement>('.rp-name')!;
    const infoBlurb = mask.querySelector<HTMLElement>('.rp-blurb')!;
    const startBtn = mask.querySelector<HTMLButtonElement>('.rp-start')!;

    /** 重绘整图：底色 → 各省填色 → 悬停/选中提亮 → 省界描边 → 选中白描边 */
    function draw(): void {
      ctx.fillStyle = SEA_COLOR;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      // 非悬停省先画，悬停/选中最后画（提亮不被邻省覆盖）
      for (const pass of [0, 1] as const) {
        for (const [id, path] of paths) {
          const active = id === hovered || id === selected;
          if ((pass === 0) === active) continue;
          ctx.fillStyle = REGIONS[id]!.mapColor;
          ctx.fill(path);
          if (active) {
            ctx.fillStyle = id === selected ? SELECTED_OVERLAY : HOVER_OVERLAY;
            ctx.fill(path);
          }
          ctx.strokeStyle = BORDER_COLOR;
          ctx.lineWidth = 0.8;
          ctx.stroke(path);
        }
      }
      // 选中白描边（加粗，压线更醒目）
      if (selected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke(paths.get(selected)!);
      }
      drawLabels();
    }

    /** 省名标注：放得下才画（包围盒容得下文字）；标签锚点必须在省内；悬停/选中加粗 */
    function drawLabels(): void {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const { id, x, y, w } of labels) {
        const active = id === hovered || id === selected;
        const fontSize = active ? 15 : 12;
        ctx.font = `${active ? 'bold ' : ''}${fontSize}px sans-serif`;
        if (ctx.measureText(REGIONS[id]!.name).width > w - 4) continue; // 小省不放名字
        if (!hitCtx.isPointInPath(paths.get(id)!, x, y)) continue; // 锚点飘出省外则跳过
        ctx.strokeStyle = 'rgba(8,12,20,.75)';
        ctx.lineWidth = 3;
        ctx.strokeText(REGIONS[id]!.name, x, y);
        ctx.fillStyle = active ? '#fff' : 'rgba(255,255,255,.92)';
        ctx.fillText(REGIONS[id]!.name, x, y);
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

    /** 命中检测：鼠标 CSS 坐标 → 用无变换的 hitCtx 测试（与渲染 DPR 变换解耦，见 getMapModel 注释） */
    function pickProvince(ev: MouseEvent): RegionId | null {
      const rect = canvas.getBoundingClientRect();
      const mx = ((ev.clientX - rect.left) / rect.width) * CANVAS_W;
      const my = ((ev.clientY - rect.top) / rect.height) * CANVAS_H;
      for (const [id, path] of paths) {
        if (hitCtx.isPointInPath(path, mx, my)) return id;
      }
      return null;
    }

    canvas.addEventListener('mousemove', (ev) => {
      const rid = pickProvince(ev);
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
      const rid = pickProvince(ev);
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
