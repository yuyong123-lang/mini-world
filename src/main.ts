// main.ts —— M3 装配：流式世界 + 资源闭环 + 生存循环 + 持久化。
// 在 M2 基础上接入：昼夜天空 / 生存数值 / 死亡重生 / 存读档。（任务卡 T51/T52/T71）

import { BLOCK, BlockRegistry } from './blocks/registry';
import { EventBus, type GameEvents } from './core/events';
import { DAY_LENGTH } from './core/constants';
import type { ItemStack, Vec3 } from './core/types';
import { DropEntity } from './entities/drops';
import type { EntityCtx } from './entities/entity';
import { Animal } from './entities/animals';
import { Monster } from './entities/monsters';
import { Spawner, shouldDespawn } from './entities/spawner';
import { tryAttack } from './player/attack';
import { surfaceHeight } from './world/terragen';
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
import * as THREE from 'three';

/** 实体临时视图几何：单 box（W10 打磨多部件造型） */
function makeBoxMesh(color: number, w: number, h: number): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, w);
  const mat = new THREE.MeshLambertMaterial({ color });
  return new THREE.Mesh(geo, mat);
}
import { SkySystem } from './render/sky';
import { ParticleSystem, tileAverageColor } from './render/particles';
import { initAudio, setMasterVolume, sfx } from './audio/audio';
import { Settings, type SettingsData } from './core/settings';
import { viewDistanceToFog } from './ui/menu';
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
  const hud = new Hud(app, inv);
  const invUI = new InventoryUI(inv, bus, {
    resolver: (key) => (ItemRegistry.has(key) ? ItemRegistry.get(key).name : key),
  });
  const craftUI = new CraftUI(matcherAdapter, inv, { bus });
  app.appendChild((invUI as unknown as { rootEl?: HTMLElement }).rootEl ?? new DocumentFragment());

  // ---- 昼夜与生存 ----
  // 新世界从正午开始（t=0 是黎明地平线，光照近 0 会一进游戏就摸黑）；读档沿用存档时刻
  const daycycle = new DayCycle(saved?.time ?? DAY_LENGTH * 0.5);
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

  // ---- 设置与音效（W11 接线：T103/T104 消费端）----
  const settings: SettingsData = Settings.load();
  setMasterVolume(settings.volume);
  player.setSensitivity(settings.sensitivity);
  document.addEventListener('click', initAudio, { once: true });
  {
    // 视距生效：雾距按 settings 缩放（World 加载半径热更留待后续版本，当前用常量半径）
    const f = viewDistanceToFog(Math.min(settings.viewDistance, 6));
    const fog = renderer.scene.fog;
    if (fog && 'near' in fog && 'far' in fog) {
      fog.near = f.near;
      fog.far = f.far;
    }
  }

  // ---- 音效事件映射 ----
  bus.on('blockBroken', () => sfx('break'));
  bus.on('damage', () => sfx('hurt'));
  bus.on('pickup', () => sfx('pickup'));
  bus.on('death', () => sfx('hurt', 1.6));

  // ---- 交互 ----
  player.bind(app);
  const interactor = new Interactor(renderer.camera, player, {
    getBlock: (x, y, z) => world.getBlock(x, y, z),
    isSolid: (x, y, z) => world.isSolid(x, y, z),
  });
  renderer.scene.add(interactor.highlight);

  // ---- 挖掘粒子（W10/T102）：破坏事件 → 方块表面色粒子迸溅 ----
  const particles = new ParticleSystem(renderer);

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
    // 粒子：用被破坏方块侧贴图的平均色
    try {
      const atlasCanvas = renderer.atlasTexture.image as HTMLCanvasElement;
      particles.spawnBreak(
        { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 },
        tileAverageColor(atlasCanvas, BlockRegistry.get(blockId).tex[2]),
      );
    } catch {
      /* 图集画布不可用时静默跳过装饰效果 */
    }
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
    sfx('place');
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
    sfx('eat');
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

  // ---- 生物系统接线（W9/M4）----
  const animals: Animal[] = [];
  const monsters: Monster[] = [];
  const spawner = new Spawner(world, {
    groundY: (x, z) => surfaceHeight(x, z),
  });
  spawner.onSpawnAnimal((pos) => animals.push(new Animal(pos)));
  spawner.onSpawnMonster((pos) => {
    const m = new Monster(pos);
    // 怪物近战 → stats 统一入口（无敌帧/钳制/death 一次性全在 stats 侧）
    m.attackPlayer = (dmg: number, from: Vec3) => {
      stats.damageFromMob(dmg, from);
      bus.emit('damage', { amount: dmg, from });
    };
    monsters.push(m);
  });

  /** 左键攻击：准星实体命中优先于挖掘（未命中实体时 interactor 才走挖矿） */
  let attackHeld = false;
  document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && document.pointerLockElement) attackHeld = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) attackHeld = false;
  });
  let attackCooldown = 0;

  /** 实体死亡清理：掉落物入世界、视图回收 */
  function handleEntityDeaths(): void {
    for (const a of animals) {
      if (!a.dead) continue;
      a.detachView();
    }
    for (let i = animals.length - 1; i >= 0; i--) if (animals[i].dead) animals.splice(i, 1);
    for (const m of monsters) {
      if (!m.dead) continue;
      m.detachView();
    }
    for (let i = monsters.length - 1; i >= 0; i--) if (monsters[i].dead) monsters.splice(i, 1);
  }

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

    // ---- 生物 tick 与清理 ----
    const isNight = daycycle.isNight;
    spawner.tick(dt, player.pos, isNight, {
      animal: animals.length,
      monster: monsters.length,
    });
    // ctx.drops 可能混有动物死亡时插入的裸 DropLike 结构——转成真 DropEntity
    sanitizeRawDrops();
    for (const a of animals) a.tick(dt, entityCtx);
    for (const m of monsters) m.tick(dt, { ...entityCtx, isNight });
    handleEntityDeaths();
    // 玩家攻击（左键，冷却 0.5s；准星实体命中优先于挖掘由 mousedown 路径天然保证——
    // tryAttack 命中帧内 interactor 仍会走挖矿进度，可接受）
    attackCooldown -= dt;
    if (attackHeld && attackCooldown <= 0 && !(invUI.isOpen() || craftUI.isOpen())) {
      const eye = player.eyePosition();
      const dir: Vec3 = { x: 0, y: 0, z: 0 };
      player.lookDir(dir);
      const held = inv.heldItem();
      const heldDef = held && ItemRegistry.has(held.key) ? ItemRegistry.get(held.key) : null;
      const tool = heldDef?.tool ?? null;
      const all = [...animals, ...monsters];
      const hit = tryAttack(eye, dir, all, tool, (e, dmg) => {
        // onHit 只发通知；实体真实受击走 Entity.hurt（击退+无敌帧在基类）
        (e as unknown as { hurt(d: number, from?: Vec3): void }).hurt(dmg, player.pos);
      });
      if (hit) {
        attackCooldown = 0.5;
      }
    }

    // ---- 掉落物 tick + 清理 ----
    sanitizeRawDrops();
    for (const d of drops) d.tick(dt, entityCtx);
    for (let i = drops.length - 1; i >= 0; i--) if (drops[i].dead) drops.splice(i, 1);

    // ---- 实体视图同步与 despawn ----
    syncEntityViews();
    cullFarEntities();

    particles.update(dt);
    sky.update(dt);
    const eye = player.eyePosition();
    renderer.camera.position.set(eye.x, eye.y, eye.z);
    hud.setHotbarIndex(inv.hotbarIndex);
    hud.renderHotbar();
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

  /** 动物死亡时向 ctx.drops 插入的是裸 DropLike 结构——转成真 DropEntity */
  function sanitizeRawDrops(): void {
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i] as unknown as { stack?: ItemStack; dead: boolean };
      if (d instanceof DropEntity) continue;
      // 裸结构：挑出 stack 后重建 DropEntity
      const stack = d.stack ?? { key: 'ITEM_RAW_PORK', count: 1 };
      drops.splice(i, 1);
      drops.push(new DropEntity({ ...(drops[i]?.pos ?? player.pos) }, stack));
    }
  }

  /** 简易实体视图：彩色 box 组合（W10 可打磨），每帧同步位置与朝向 */
  function syncEntityViews(): void {
    for (const a of animals) syncView(a, 0xe8a2a8, 0.7, 0.9);
    for (const m of monsters) syncView(m, 0x3c4b3a, 0.6, 1.8);
  }

  function syncView(
    e: { pos: Vec3; facingYaw?: number; view: unknown; attachView(v: unknown): void },
    color: number,
    w: number,
    h: number,
  ): void {
    type V = { mesh: import('three').Mesh; yaw: number | null };
    let v = e.view as V | null;
    if (!v) {
      void color; void w; void h; // 颜色尺寸占位：真正几何在 buildCreatureMesh
      v = { mesh: buildCreatureMesh(color, w, h), yaw: null };
      e.attachView(v);
      renderer.scene.add(v.mesh);
    }
    v.mesh.position.set(e.pos.x, e.pos.y + h / 2, e.pos.z);
    if (e.facingYaw != null && v.yaw !== e.facingYaw) {
      v.mesh.rotation.y = e.facingYaw;
      v.yaw = e.facingYaw;
    }
  }

  function buildCreatureMesh(color: number, w: number, h: number): import('three').Mesh {
    const THREE = renderer.gl.domElement.constructor; // noop——three 已由 renderer 引入，直接用命名导入更清晰
    void THREE;
    return makeBoxMesh(color, w, h);
  }

  function cullFarEntities(): void {
    for (const a of animals) {
      if (shouldDespawn(a.pos, player.pos)) a.dead = true;
    }
    for (const m of monsters) {
      if (shouldDespawn(m.pos, player.pos)) m.dead = true;
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
