// main.ts —— M3 装配：流式世界 + 资源闭环 + 生存循环 + 持久化。
// 在 M2 基础上接入：昼夜天空 / 生存数值 / 死亡重生 / 存读档。（任务卡 T51/T52/T71）

import { BLOCK, BlockRegistry } from './blocks/registry';
import { EventBus, type GameEvents } from './core/events';
import type { ItemStack } from './core/types';
import { DropEntity } from './entities/drops';
import type { EntityCtx } from './entities/entity';
import { Inventory } from './items/inventory';
import { ItemRegistry } from './items/items';
import { CraftingMatcher, type Recipe } from './items/crafting';
import recipesJson from './data/recipes.json';
import { World } from './world/world';
import { Hud } from './ui/hud';
import { InventoryUI } from './ui/inventoryUI';
import { CraftUI } from './ui/craftUI';
import { StatusUI } from './ui/statusUI';
import { PlayerController } from './player/controller';
import { Interactor } from './player/interact';
import { Renderer } from './render/renderer';
import { SkySystem } from './render/sky';
import { DayCycle } from './survival/daycycle';
import { StatsSystem } from './survival/stats';
import {
  loadGame,
  saveGame,
  startAutosave,
  type SaveSource,
} from './save/storage';

const SEED = 'mini-world-m1';

function boot(): void {
  const bus = new EventBus<GameEvents>();
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('#app 容器缺失');

  BlockRegistry.load();
  CraftingMatcher.load(recipesJson as never); // crafting.ts 不自动加载，boot 时显式喂入
  const renderer = new Renderer(app);

  // ---- 读档（若有）：seed 与初始状态来自存档 ----
  const saved = loadGame();
  const seed = saved?.seed ?? SEED;

  // ---- 世界（流式加载中枢，terragen 在其构造器内 init）----
  const world = new World(seed);
  world.onChunkReady = (c, opaque, water) => {
    renderer.updateChunkGeometry(c, opaque, water);
    c.meshes = c.meshes ?? null; // renderer 已写回句柄；此处兜底满足卸载协议
  };
  world.onChunkUnload = (c) => {
    renderer.removeChunkMeshes(c);
  };

  // 读档：先灌 diff 再生成 chunk，保证地形改动正确回放
  if (saved) {
    for (const [key, m] of Object.entries(saved.diffs)) {
      world.diffs.set(key, new Map(Object.entries(m).map(([k, v]) => [Number(k), Number(v)])));
    }
  }

  // ---- 背包 / 合成 ----
  const inv = new Inventory(36);
  if (saved) {
    for (let i = 0; i < saved.inv.length && i < 36; i++) {
      const e = saved.inv[i];
      inv.slots[i] = e ? { key: String(e[0]), count: Number(e[1]) } : null;
    }
  }
  // CraftingMatcher 是静态方法类——包一层实例形状适配 CraftUI 的 duck type
  const matcherAdapter = {
    match: (grid: (ItemStack | null)[], gridSize: 2 | 3) =>
      CraftingMatcher.match(grid, gridSize) as unknown as {
        out: { key: string; count: number };
        consume(grid2: (ItemStack | null)[]): (ItemStack | null)[];
      } | null,
    consume: (grid: (ItemStack | null)[], recipe: Recipe) => CraftingMatcher.consume(grid, recipe),
  };
  const hud = new Hud(app);
  const invUI = new InventoryUI(inv, bus, {
    resolver: (key) => (ItemRegistry.has(key) ? ItemRegistry.get(key).name : key),
  });
  const craftUI = new CraftUI(matcherAdapter, inv, { bus });
  app.appendChild((invUI as unknown as { rootEl?: HTMLElement }).rootEl ?? new DocumentFragment());

  // ---- 昼夜与生存 ----
  const daycycle = new DayCycle(saved?.time ?? 0);
  const sky = new SkySystem(renderer, daycycle);
  // 玩家位置：存档优先
  const p0 = saved?.player.p;
  const player = new PlayerController({
    x: p0 ? p0[0] : world.spawnPoint.x + 0.5,
    y: p0 ? p0[1] : world.spawnPoint.y + 2,
    z: p0 ? p0[2] : world.spawnPoint.z + 0.5,
  });
  player.yaw = saved?.player.yaw ?? 0;
  player.pitch = saved?.player.pitch ?? 0;
  player.hp = saved?.player.hp ?? 20;
  player.hunger = saved?.player.hunger ?? 20;
  player.spawnPoint = { ...world.spawnPoint };
  const stats = new StatsSystem(player, bus);
  player.addJumpHook(() => stats.notifyJump());

  // ---- 交互 ----
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
    drops: [],
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
  entityCtx.drops = drops;

  /** 破坏方块的掉落表（BlockDef.drop + LEAVES 特例） */
  function dropTableFor(blockId: number): ItemStack | null {
    if (blockId === BLOCK.LEAVES) {
      return Math.random() < 0.2 ? { key: 'ITEM_APPLE', count: 1 } : null;
    }
    const def = BlockRegistry.get(blockId);
    if (!def.drop) return null;
    return { key: def.drop, count: 1 };
  }

  bus.on('pickup', ({ key, count }) => {
    const name = ItemRegistry.has(key) ? ItemRegistry.get(key).name : key;
    hud.showToast(`+${count} ${name}`);
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
      drops.push(new DropEntity({ x: pos.x + 0.5, y: pos.y + 0.4, z: pos.z + 0.5 }, table));
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

  // 右键食物：吃（节流 0.5s）
  let lastEatAt = 0;
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 2 || !document.pointerLockElement) return;
    const nowMs = performance.now();
    if (nowMs - lastEatAt < 500) return;
    const held = inv.heldItem();
    if (!held) return;
    const itemDef = ItemRegistry.has(held.key) ? ItemRegistry.get(held.key) : null;
    if (!itemDef?.food) return;
    lastEatAt = nowMs;
    stats.eat(itemDef.food.hunger);
    inv.consumeHeld(1);
    hud.showToast(`吃了${itemDef.name} +${itemDef.food.hunger} 饥饿`);
  });

  // 工作台右键 → 打开 3×3 合成
  interactor.onUseCraftTable(() => craftUI.open(3));

  // ---- 死亡重生 ----
  let deathToastShown = false;
  bus.on('death', () => {
    if (deathToastShown) return;
    deathToastShown = true;
    hud.showToast('你死了——回到出生点');
    setTimeout(() => {
      player.respawn();
      stats.reset();
      deathToastShown = false;
      // respawn 满状态后主动广播一次让 UI 同步（T64 FIXME：变化型事件需初始快照）
      bus.emit('hp', { v: player.hp });
      bus.emit('hunger', { v: player.hunger });
    }, 900);
  });

  // ---- E 键 / 数字键 / pointer lock 提示 ----
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE') return;
    if (craftUI.isOpen()) { craftUI.close(); return; }
    if (invUI.isOpen()) { invUI.close(); void document.exitPointerLock?.(); return; }
    if (document.pointerLockElement) {
      invUI.open();
      void document.exitPointerLock?.();
    }
  });
  window.addEventListener('keydown', (e) => {
    if (!/^Digit[1-9]$/.test(e.code)) return;
    inv.hotbarIndex = Number(e.code.slice(5)) - 1;
    bus.emit('invChanged', {});
  });
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && !invUI.isOpen() && !craftUI.isOpen()) {
      hud.showToast('点击画面继续游戏');
    }
  });

  // ---- 存档 ----
  function snapshot(): SaveSource {
    return {
      seed,
      time: daycycle.timeOfDay,
      player: {
        p: [player.pos.x, player.pos.y, player.pos.z],
        yaw: player.yaw,
        pitch: player.pitch,
        hp: player.hp,
        hunger: player.hunger,
      },
      inventorySlots: inv.slots.map((s) => (s ? { ...s } : null)),
      diffs: world.diffs,
    };
  }

  window.addEventListener('beforeunload', () => saveGame(snapshot()));
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyP') return;
    hud.showToast(saveGame(snapshot()) ? '已保存' : '保存失败');
  });
  startAutosave(() => (document.hidden ? null : snapshot()), 10_000);

  // ---- UI 最后装配（依赖 player/stats 就绪后的初始快照广播）----
  app.appendChild((invUI as unknown as { rootEl?: HTMLElement }).rootEl ?? new DocumentFragment());
  void new StatusUI(bus, app); // 自订阅 bus 事件并自挂 DOM，无需保存句柄

  // ---- M3 简易续档遮罩（W10 换成完整主菜单）----
  if (!saved) {
    showFirstRunMask(app, world.spawnPoint);
  }

  // 初始快照事件（读档场景让 UI 与存档对齐）
  requestAnimationFrame(() => {
    bus.emit('hp', { v: player.hp });
    bus.emit('hunger', { v: player.hunger });
    bus.emit('dayTick', { isNight: daycycle.isNight });
  });

  // ---- 主循环 ----
  let last = performance.now();

  function frame(now: number): void {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    daycycle.tick(dt);
    // 夜幕翻变沿 → dayTick 事件
    emitDayEdge();

    if (invUI.isOpen() || craftUI.isOpen()) {
      interactor.update(null, dt, null);
    } else {
      player.tick(dt, world);
      interactor.update(inv.heldItem(), dt, null);
      const t = interactor.currentTarget();
      hud.setTargetName(t ? BlockRegistry.get(t.blockId).name : '');
    }

    stats.tick(dt);
    world.tick(player.pos);
    for (const d of drops) d.tick(dt, entityCtx);
    for (let i = drops.length - 1; i >= 0; i--) if (drops[i].dead) drops.splice(i, 1);

    sky.update(dt);
    const eye = player.eyePosition();
    renderer.camera.position.set(eye.x, eye.y, eye.z);
    hud.setHotbarIndex(inv.hotbarIndex);
    renderer.renderFrame(dt);
  }
  requestAnimationFrame(frame);

  let prevIsNight = daycycle.isNight;
  function emitDayEdge(): void {
    const cur = daycycle.isNight;
    if (cur !== prevIsNight) {
      prevIsNight = cur;
      bus.emit('dayTick', { isNight: cur });
    }
  }

  console.log(`[mini-world] M3 就绪 seed=${seed} ${saved ? '(读档)' : '(新世界)'}`);
}

/** 首次运行提示遮罩：任意键进入并请求指针锁 */
function showFirstRunMask(app: HTMLElement, spawn: { x: number; y: number; z: number }): void {
  const mask = document.createElement('div');
  mask.id = 'first-run-mask';
  mask.innerHTML =
    '<div class="mask-card"><h1>迷你世界</h1>' +
    `<p>出生点 (${Math.round(spawn.x)}, ${Math.round(spawn.y)}, ${Math.round(spawn.z)})</p>` +
    '<p>WASD 移动 · 空格跳 · 左键挖 · 右键放/吃 · E 背包 · P 保存</p>' +
    '<button id="start-btn">开始游戏</button></div>';
  app.appendChild(mask);
  const style = document.createElement('style');
  style.textContent = `
#first-run-mask{position:fixed;inset:0;z-index:50;background:rgba(8,10,16,.82);display:flex;
  align-items:center;justify-content:center}
#first-run-mask .mask-card{text-align:center;color:#fff;font-family:sans-serif}
#first-run-mask h1{font-size:42px;margin-bottom:12px}
#first-run-mask button{font-size:18px;padding:10px 34px;border-radius:6px;border:0;cursor:pointer;
  background:#ffd75e;color:#333;font-weight:bold}
`;
  style.id = 'first-run-style';
  document.head.appendChild(style);
  mask.querySelector('#start-btn')?.addEventListener('click', () => {
    mask.remove();
    document.getElementById('first-run-style')?.remove();
    void document.querySelector<HTMLElement>('#app')?.requestPointerLock?.();
  });
}

boot();
