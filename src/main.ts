// main.ts —— M2 装配：流式世界 + 资源闭环。
// 数据链：破坏→掉落物→磁吸拾取→入包→UI 刷新→放置/合成消耗。（任务卡 T51/T52）

import { BLOCK, BlockRegistry } from './blocks/registry';
import { EventBus, type GameEvents } from './core/events';
import type { ItemStack } from './core/types';
import { DropEntity } from './entities/drops';
import type { EntityCtx } from './entities/entity';
import { Inventory } from './items/inventory';
import { ItemRegistry } from './items/items';
import { CraftingMatcher } from './items/crafting';
import recipesJson from './data/recipes.json';
import { World } from './world/world';
import { Hud } from './ui/hud';
import { InventoryUI } from './ui/inventoryUI';
import { CraftUI } from './ui/craftUI';
import { PlayerController } from './player/controller';
import { Interactor } from './player/interact';
import { Renderer } from './render/renderer';

const SEED = 'mini-world-m1';

function boot(): void {
  const bus = new EventBus<GameEvents>();
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('#app 容器缺失');

  BlockRegistry.load();
  CraftingMatcher.load(recipesJson as never); // crafting.ts 不自动加载，boot 时显式喂入
  const renderer = new Renderer(app);

  // ---- 世界（流式加载中枢，terragen 在其构造器内 init）----
  const world = new World(SEED);
  world.onChunkReady = (c, opaque, water) => {
    renderer.updateChunkGeometry(c, opaque, water);
    c.meshes = c.meshes ?? null; // renderer 已写回句柄；此处兜底满足卸载协议
  };
  world.onChunkUnload = (c) => {
    renderer.removeChunkMeshes(c);
  };

  // ---- 背包 / 合成 ----
  const inv = new Inventory(36);
  // CraftingMatcher 是静态方法类——包一层实例形状适配 CraftUI 的 duck type
  const matcherAdapter = {
    match: ((grid, gridSize) => CraftingMatcher.match(grid, gridSize)) as (
      grid: (ItemStack | null)[],
      gridSize: 2 | 3,
    ) => { out: { key: string; count: number }; consume(grid: (ItemStack | null)[]): (ItemStack | null)[] } | null,
    consume: (grid: (ItemStack | null)[], recipe: { out: { key: string; count: number }; consume(grid: (ItemStack | null)[]): (ItemStack | null)[] }) =>
      recipe.consume(grid),
  };
  const hud = new Hud(app);
  const invUI = new InventoryUI(inv, bus, {
    resolver: (key) => (ItemRegistry.has(key) ? ItemRegistry.get(key).name : key),
  });
  const craftUI = new CraftUI(matcherAdapter, inv, { bus });
  app.appendChild((invUI as unknown as { rootEl?: HTMLElement }).rootEl ?? new DocumentFragment());

  // ---- 玩家与交互 ----
  const player = new PlayerController({ x: 8.5, y: world.spawnPoint.y + 2, z: 8.5 });
  player.spawnPoint = { ...world.spawnPoint };
  player.bind(app);
  const interactor = new Interactor(renderer.camera, player, {
    getBlock: (x, y, z) => world.getBlock(x, y, z),
    isSolid: (x, y, z) => world.isSolid(x, y, z),
  });
  renderer.scene.add(interactor.highlight);

  // ---- 掉落物系统 ----
  const drops: DropEntity[] = [];
  const entityCtx: EntityCtx = {
    world,
    playerPos: player.pos,
    drops: [], // 运行时由 tick 前动态赋值（见 frame 循环）
    now: () => performance.now(),
    tryPickup: (d) => {
      const stack = d.stack;
      const remain = inv.add({ ...stack });
      if (remain === 0) {
        bus.emit('pickup', { key: stack.key, count: stack.count });
        return true;
      }
      return false;
    },
  };
  entityCtx.drops = drops; // EntityCtx.drops 为 DropLike[]，DropEntity 满足结构

  /** 破坏方块的掉落表（BlockDef.drop + LEAVES 特例） */
  function dropTableFor(blockId: number): ItemStack | null {
    if (blockId === BLOCK.LEAVES) {
      // 20% 苹果（hash 取模确定性随机——这里用 Math.random 即可，视觉层不要求可复现）
      return Math.random() < 0.2 ? { key: 'ITEM_APPLE', count: 1 } : null;
    }
    const def = BlockRegistry.get(blockId);
    if (!def.drop) return null;
    return { key: def.drop, count: 1 };
  }

  let lastToastPickup = '';
  bus.on('pickup', ({ key, count }) => {
    const name = ItemRegistry.has(key) ? ItemRegistry.get(key).name : key;
    const msg = `+${count} ${name}`;
    if (msg !== lastToastPickup) hud.showToast(msg);
    lastToastPickup = msg;
  });

  bus.on('dropAtPlayer', ({ stack }) => {
    drops.push(new DropEntity({ ...player.pos, y: player.pos.y + 1 }, stack));
  });

  // ---- 挖掘 / 放置接线 ----
  interactor.onBreak((pos, blockId) => {
    world.setBlock(pos.x, pos.y, pos.z, BLOCK.AIR);
    bus.emit('blockBroken', { pos, id: blockId });
    // minTier 过滤：需要工具等级的方块用错误工具挖不掉落（契约 §3）
    const def = BlockRegistry.get(blockId);
    const held = inv.heldItem();
    const heldDef = held ? (ItemRegistry.has(held.key) ? ItemRegistry.get(held.key) : null) : null;
    const needTier = def.minTier ?? 0;
    const haveTier = heldDef?.tool?.tier ?? 0;
    // JSON 里 tool 可能为 'hand'（徒手可挖），统一字符串比较规避类型差异
    const needTool = String(def.tool ?? '');
    const haveTool = heldDef?.tool?.type != null ? String(heldDef.tool.type) : '';
    const toolOk =
      needTier === 0 ||
      needTool === '' ||
      needTool === 'hand' ||
      (haveTier >= needTier && haveTool === needTool);
    if (!toolOk) return; // 方块已破坏但不掉落
    const table = dropTableFor(blockId);
    if (table)
      drops.push(
        new DropEntity(
          { x: pos.x + 0.5, y: pos.y + 0.4, z: pos.z + 0.5 },
          table,
        ),
      );
  });

  interactor.onPlace((pos) => {
    const held = inv.heldItem();
    if (!held) {
      hud.showToast('手持空位——按 E 打开背包');
      return;
    }
    const itemDef = ItemRegistry.has(held.key) ? ItemRegistry.get(held.key) : null;
    if (!itemDef?.place) {
      hud.showToast('当前物品不可放置');
      return;
    }
    if (world.getBlock(pos.x, pos.y, pos.z) !== BLOCK.AIR) return;
    world.setBlock(pos.x, pos.y, pos.z, itemDef.place);
    inv.consumeHeld(1);
    bus.emit('invChanged', {});
  });

  // 工作台右键 → 打开 3×3 合成
  interactor.onUseCraftTable(() => {
    craftUI.open(3);
  });

  // ---- E 键：背包开合（退出指针锁）----
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE') return;
    if (craftUI.isOpen()) {
      craftUI.close();
      return;
    }
    if (invUI.isOpen()) {
      invUI.close();
      void document.exitPointerLock?.();
      return;
    }
    if (document.pointerLockElement) {
      invUI.open();
      void document.exitPointerLock?.();
    }
  });

  // 数字键切换热栏
  window.addEventListener('keydown', (e) => {
    if (!/^Digit[1-9]$/.test(e.code)) return;
    inv.hotbarIndex = Number(e.code.slice(5)) - 1;
    bus.emit('invChanged', {});
  });

  // 关 UI 时若没有面板开着且无指针锁 → 提示点击恢复
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && !invUI.isOpen() && !craftUI.isOpen()) {
      hud.showToast('点击画面继续游戏');
    }
  });

  // ---- 主循环 ----
  let last = performance.now();
  let toastThrottle = '';

  function frame(now: number): void {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (invUI.isOpen() || craftUI.isOpen()) {
      // 面板打开：世界暂停玩家输入但保持渲染
      hud.setTargetName('');
      interactor.update(null, dt, null);
    } else {
      player.tick(dt, world);
      interactor.update(inv.heldItem(), dt, null);
      const t = interactor.currentTarget();
      hud.setTargetName(t ? BlockRegistry.get(t.blockId).name : '');
    }

    world.tick(player.pos);
    for (const d of drops) d.tick(dt, entityCtx);
    // 清理死亡掉落物
    for (let i = drops.length - 1; i >= 0; i--) if (drops[i].dead) drops.splice(i, 1);

    // 相机跟随
    const eye = player.eyePosition();
    renderer.camera.position.set(eye.x, eye.y, eye.z);

    hud.setHotbarIndex(inv.hotbarIndex);
    renderer.renderFrame(dt);

    const msg = `drops:${drops.length}`;
    if (msg !== toastThrottle) toastThrottle = msg;
  }
  requestAnimationFrame(frame);

  console.log(`[mini-world] M2 就绪 seed=${SEED}`);
}

boot();
