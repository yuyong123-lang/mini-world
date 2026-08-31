// render/itemIcons.ts —— 图集物品图标渲染器（iconTile 的消费方）
//
// 此前 ItemDef.iconTile 字段存在但全仓无消费方（背包/热栏/合成格都是
// 「哈希色块 + 文字缩写」的占位表现）。本模块把图集 canvas 上的 tile
// 拷贝成 16×16 canvas 图标挂进槽位元素，让新物品一注册即有真实像素图标。
//
// 降级链：无 iconTile / 图集画布不可用（node 测试、纹理未就绪）→
// 回落 inventoryUI 的 defaultRenderIcon（色块 + 首字），行为与旧版一致。

import { ATLAS_GRID, TILE_PX } from '../blocks/atlas';
import { ItemRegistry } from '../items/items';
import type { ItemStack } from '../core/types';
import { defaultRenderIcon, type IconRenderer } from '../ui/inventoryUI';

/** 图标显示边长（px）：适配背包格与热栏格的通用值 */
const ICON_SIZE_PX = 30;

/** 图标 canvas 的幂等样式（一次注入全局复用） */
function ensureIconStyle(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('inv-icon-style')) return;
  const style = document.createElement('style');
  style.textContent = `
.icon-canvas{image-rendering:pixelated;width:${ICON_SIZE_PX}px;height:${ICON_SIZE_PX}px;
  display:block;pointer-events:none}`;
  style.id = 'inv-icon-style';
  document.head.appendChild(style);
}

/**
 * 图集图标渲染器工厂：返回与 IconRenderer 形状兼容的回调，供
 * InventoryUI / CraftUI / Hud 三处注入。
 *
 * @param getCanvas 取图集 canvas（懒取：纹理由启动期程序化生成，可能晚于 UI 构造）
 */
export function makeAtlasIconRenderer(
  getCanvas: () => HTMLCanvasElement | null,
): IconRenderer {
  return (el: HTMLElement, stack: ItemStack | null): void => {
    // 每次全量重绘：清内容与回落色块的背景（槽位由本函数独占，数量角标各 UI 自理）
    el.textContent = '';
    el.style.background = 'transparent';
    if (!stack) return;

    const tile = ItemRegistry.has(stack.key)
      ? ItemRegistry.get(stack.key).iconTile
      : undefined;
    const atlas = getCanvas();
    if (tile === undefined || !atlas || typeof document === 'undefined') {
      defaultRenderIcon(el, stack);
      return;
    }

    ensureIconStyle();
    const cv = document.createElement('canvas');
    cv.width = TILE_PX;
    cv.height = TILE_PX;
    cv.className = 'icon-canvas';
    cv.title = '';
    const g = cv.getContext('2d');
    if (!g) {
      defaultRenderIcon(el, stack);
      return;
    }
    const sx = (tile % ATLAS_GRID) * TILE_PX;
    const sy = Math.floor(tile / ATLAS_GRID) * TILE_PX;
    g.drawImage(atlas, sx, sy, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
    el.appendChild(cv);
  };
}
