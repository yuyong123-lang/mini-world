// main.ts —— M3 装配：流式世界 + 资源闭环 + 生存循环 + 持久化。
// 在 M2 基础上接入：昼夜天空 / 生存数值 / 死亡重生 / 存读档。（任务卡 T51/T52/T71）

import { BLOCK, BlockRegistry } from './blocks/registry';
import { ITEMS } from './items/items';
import { EventBus, type GameEvents } from './core/events';
import { DAY_LENGTH, chunkKey, worldToChunk } from './core/constants';
import type { ItemStack, Vec3 } from './core/types';
import { DropEntity } from './entities/drops';
import type { EntityCtx } from './entities/entity';
import { Animal, ANIMAL_SPECIES } from './entities/animals';
import { ArrowEntity } from './entities/arrows';
import { bowShot } from './player/bow';
import { Monster } from './entities/monsters';
import { Spawner, shouldDespawn } from './entities/spawner';
import { tryAttack } from './player/attack';
import { solidInBox } from './physics/collide';
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
import { createPlayerModel, type PlayerModel } from './render/playerModel';
import { makeAtlasIconRenderer } from './render/itemIcons';
import { syncAnimalView } from './render/creatureViews';
import { createFirstPersonArms } from './render/firstPersonArm';
import { initAudio, setMasterVolume, sfx } from './audio/audio';
import { Settings, type SettingsData } from './core/settings';
import { Cosmetics } from './core/cosmetics';
import { FurnaceSystem } from './furnace/furnace';
import { FurnaceUI } from './ui/furnaceUI';
import { ArmorSlots } from './survival/armor';
import { MenuSystem, viewDistanceToFog } from './ui/menu';
import { clearSave, hasSave } from './save/storage';
import { DayCycle } from './survival/daycycle';
import { StatsSystem } from './survival/stats';
import {
  loadGame,
  saveGame,
  startAutosave,
  type SaveSource,
} from './save/storage';

const SEED = 'mini-world-m1';

/**
 * 全局错误显示：任何运行时异常直接打到屏幕上（而非只在 console）。
 * 背景：rAF 主循环里的异常每帧重抛但画面静默冻结，玩家侧只看到"不能动"，
 * 却无从得知原因——必须让它可见。
 */
function installErrorOverlay(): void {
  const show = (title: string, detail: string): void => {
    let el = document.getElementById('error-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'error-overlay';
      document.body.appendChild(el);
      const style = document.createElement('style');
      style.textContent = `
#error-overlay{position:fixed;left:12px;top:12px;right:12px;z-index:9999;
  background:rgba(120,10,10,.92);color:#fff;padding:10px 14px;border-radius:8px;
  font:12px/1.5 monospace;white-space:pre-wrap;max-height:40vh;overflow:auto;
  border:1px solid rgba(255,120,120,.6);pointer-events:auto}`;
      style.id = 'error-overlay-style';
      document.head.appendChild(style);
    }
    el.textContent = `${title}\n\n${detail}`;
  };
  window.addEventListener('error', (e) => {
    show('⚠ 运行时错误（游戏已暂停响应）', `${e.message}\n${e.filename}:${e.lineno}:${e.colno}\n\n${e.error?.stack ?? ''}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    show('⚠ 未处理的 Promise 异常', String(e.reason));
  });
}

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

  // ---- 熔炉系统（状态键 "x,y,z" → 三槽 + 燃烧/进度；main 每帧 tick 持续燃烧）----
  const furnaceSys = new FurnaceSystem();
  // ---- 护甲装备（2 槽：头盔/胸甲；每点 -4% 怪物伤害，注入 stats 减伤）----
  const armorSlots = new ArmorSlots();

  // ---- 背包 / 合成 ----
  const inv = new Inventory(36);
  // 熔炉状态（v2 起）：读档回灌（burn/progress 原样恢复，火焰继续烧）
  if (saved?.furnaces) {
    for (const [key, f] of Object.entries(saved.furnaces)) {
      const st = furnaceSys.get(key);
      st.input = f.in ? { key: String(f.in[0]), count: Number(f.in[1]) } : null;
      st.fuel = f.fuel ? { key: String(f.fuel[0]), count: Number(f.fuel[1]) } : null;
      st.output = f.out ? { key: String(f.out[0]), count: Number(f.out[1]) } : null;
      st.burnLeft = Number(f.burn);
      st.burnTotal = Number(f.total);
      st.progress = Number(f.progress);
    }
  }
  if (saved) {
    for (let i = 0; i < saved.inv.length && i < 36; i++) {
      const e = saved.inv[i];
      inv.slots[i] = e ? { key: String(e[0]), count: Number(e[1]) } : null;
    }
    // 装备回灌（v2 可选字段；结构在 storage 侧已收紧）
    if (saved.armor) {
      armorSlots.head = saved.armor.head
        ? { key: String(saved.armor.head[0]), count: Number(saved.armor.head[1]) }
        : null;
      armorSlots.chest = saved.armor.chest
        ? { key: String(saved.armor.chest[0]), count: Number(saved.armor.chest[1]) }
        : null;
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
  // 图集图标渲染器：背包/合成/热栏三处共用（iconTile 的消费方）
  const iconRenderer = makeAtlasIconRenderer(() => {
    const img = renderer.atlasTexture.image;
    return img instanceof HTMLCanvasElement ? img : null;
  });
  const hud = new Hud(app, inv);
  hud.setIconRenderer(iconRenderer);
  const invUI = new InventoryUI(inv, bus, {
    resolver: (key) => (ItemRegistry.has(key) ? ItemRegistry.get(key).name : key),
    renderIcon: iconRenderer,
    armor: {
      slots: armorSlots,
      onChange: () => {
        /* 换装已广播 invChanged；护甲值显示由 UI 侧刷新，无需额外处理 */
      },
    },
  });
  const craftUI = new CraftUI(matcherAdapter, inv, { bus, renderIcon: iconRenderer });
  // 熔炉面板（三槽 + 火焰/进度条）；open 由右键熔炉经 interactor.onUseFurnace 触发
  const furnaceUI = new FurnaceUI(furnaceSys, inv, {
    bus,
    resolver: (key) => (ItemRegistry.has(key) ? ItemRegistry.get(key).name : key),
    renderIcon: iconRenderer,
  });
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
  const stats = new StatsSystem(player, bus, armorSlots);
  player.addJumpHook(() => stats.notifyJump());

  // ---- 玩家身体模型（第三人称可见；第一人称隐藏）----
  // 装扮：启动时读 localStorage 四色 → 构建模型；菜单「扮 装」页即改即存
  const cosmetics = Cosmetics.load();
  const playerModel: PlayerModel = createPlayerModel({
    skin: Number.parseInt(cosmetics.skin.slice(1), 16),
    shirt: Number.parseInt(cosmetics.shirt.slice(1), 16),
    pants: Number.parseInt(cosmetics.pants.slice(1), 16),
    hair: Number.parseInt(cosmetics.hair.slice(1), 16),
  });
  renderer.scene.add(playerModel.root);
  playerModel.setVisible(false);

  // ---- 第一人称双臂（左右交替出拳表现）：挂在相机局部空间，装扮换色联动 ----
  // 相机必须入场景树，其子对象（手臂）才会被渲染
  renderer.scene.add(renderer.camera);
  const fpArm = createFirstPersonArms({
    skin: Number.parseInt(cosmetics.skin.slice(1), 16),
    shirt: Number.parseInt(cosmetics.shirt.slice(1), 16),
  });
  renderer.camera.add(fpArm.group);

  // V 键切换第一/第三人称（不用 F5：那是浏览器刷新键，会重载页面丢指针锁定，
  // 用户侧表现为"突然走不了也挖不了"——已踩坑，勿改回）
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyV') return;
    const mode = player.toggleViewMode();
    playerModel.setVisible(mode === 'third');
    fpArm.group.visible = mode === 'first'; // 第一人称才显示右臂
    hud.showToast(mode === 'third' ? '第三人称视角' : '第一人称视角');
  });

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
  // 面板打开期间禁用「点击画面→锁定指针」：保证弹出框里鼠标一直可用，
  // 选中物品/误点空白都不会被拉回游戏（退出面板走 E 键，退出即自动重锁）
  player.pointerLockGate = () => invUI.isOpen() || craftUI.isOpen() || furnaceUI.isOpen();
  const interactor = new Interactor(renderer.camera, player, {
    getBlock: (x, y, z) => world.getBlock(x, y, z),
    isSolid: (x, y, z) => world.isSolid(x, y, z),
  });
  renderer.scene.add(interactor.highlight);
  renderer.scene.add(interactor.crackOverlay);
  interactor.setupCrackTexture(renderer.atlasTexture);

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
    // 挖掉熔炉：先把三槽内容在原地掉落（无论 toolOk 与否——内容物不该陪葬）
    if (blockId === BLOCK.FURNACE) {
      const key = `${pos.x},${pos.y},${pos.z}`;
      const st = furnaceSys.take(key);
      if (st) {
        for (const stack of [st.input, st.fuel, st.output]) {
          if (stack && stack.count > 0) {
            drops.push(new DropEntity({ x: pos.x + 0.5, y: pos.y + 0.4, z: pos.z + 0.5 }, { ...stack }));
          }
        }
      }
      // 正开着的就是这个炉子 → 关面板
      if (furnaceUI.currentKey() === key) furnaceUI.close();
    }
    world.setBlock(pos.x, pos.y, pos.z, BLOCK.AIR);
    bus.emit('blockBroken', { pos, id: blockId });
    // 粒子：破坏瞬间迸溅 22 粒（两倍默认量，观感更爽）；中途挖掘每 0.15s 也冒 3 粒碎屑
    try {
      const atlasCanvas = renderer.atlasTexture.image as HTMLCanvasElement;
      const color = tileAverageColor(atlasCanvas, BlockRegistry.get(blockId).tex[2]);
      particles.spawnBreak(
        { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 },
        color,
        22,
      );
      // 记录颜色供挖掘中途碎屑复用（挖掘粒子在 update 循环里按节流发射）
      miningDebris.color = color;
      miningDebris.lastPos = { x: pos.x, y: pos.y, z: pos.z };
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
    if (itemDef?.bow) return; // 手持弓：右键走蓄力发射，不提示「不可放置」
    if (!itemDef?.place) {
      hud.showToast('当前物品不可放置');
      return;
    }
    if (world.getBlock(pos.x, pos.y, pos.z) !== BLOCK.AIR) return;
    // 防自埋：目标格不得与玩家 AABB（0.6 宽 × 1.8 高，脚底中心锚点）相交
    const px = player.pos.x;
    const py = player.pos.y;
    const pz = player.pos.z;
    const overlapsPlayer =
      pos.x + 1 > px - 0.3 &&
      pos.x < px + 0.3 &&
      pos.y + 1 > py &&
      pos.y < py + 1.8 &&
      pos.z + 1 > pz - 0.3 &&
      pos.z < pz + 0.3;
    if (overlapsPlayer) {
      hud.showToast('不能把方块放在自己身上');
      return;
    }
    world.setBlock(pos.x, pos.y, pos.z, itemDef.place);
    inv.consumeHeld(1);
    sfx('place');
    bus.emit('invChanged', {});
  });

  // 右键食物：吃（节流 0.5s）。两类右键让位：①准星指着可交互方块（工作台/熔炉）
  // ——那次右键属于「使用方块」；②手持弓——那次右键属于「蓄力拉弓」。
  let lastEatAt = 0;
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 2 || !document.pointerLockElement) return;
    const target = interactor.currentTarget();
    if (target && (target.blockId === BLOCK.CRAFT_TABLE || target.blockId === BLOCK.FURNACE)) return;
    const nowMs = performance.now();
    if (nowMs - lastEatAt < 500) return;
    const held = inv.heldItem();
    if (!held) return;
    const itemDef = ItemRegistry.has(held.key) ? ItemRegistry.get(held.key) : null;
    if (itemDef?.bow) return; // 手持弓：右键是拉弓不是吃
    if (!itemDef?.food) return;
    lastEatAt = nowMs;
    stats.eat(itemDef.food.hunger);
    inv.consumeHeld(1);
    sfx('eat');
    hud.showToast(`吃了${itemDef.name} +${itemDef.food.hunger} 饥饿`);
  });

  // 工作台右键 → 打开 3×3 合成
  interactor.onUseCraftTable(() => craftUI.open(3));
  interactor.onUseFurnace((key) => furnaceUI.open(key));

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
    if (craftUI.isOpen()) {
      craftUI.close();
      void app.requestPointerLock?.(); // 关面板立即回游戏，无需再点一下
      return;
    }
    if (furnaceUI.isOpen()) {
      furnaceUI.close();
      void app.requestPointerLock?.();
      return;
    }
    if (invUI.isOpen()) { invUI.close(); void app.requestPointerLock?.(); return; }
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
    const lockHint = document.getElementById('lock-hint');
    if (!document.pointerLockElement) {
      // ESC 释放指针锁 → 弹暂停菜单（继续/设置/重新开始/保存退出）；
      // 背包/合成/熔炉面板开着时的解锁不算暂停（那是面板自己的解锁流程）
      if (!invUI.isOpen() && !craftUI.isOpen() && !furnaceUI.isOpen()) {
        menu.showPause();
        return;
      }
      // 面板解锁场景：保留原有提示条引导
      if (!lockHint) {
        const hint = document.createElement('div');
        hint.id = 'lock-hint';
        hint.textContent = '按 E 关闭面板后点击画面继续（WASD 移动 · V 切换视角）';
        document.body.appendChild(hint);
        const style = document.createElement('style');
        style.textContent = `
#lock-hint{position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:45;
  background:rgba(15,18,26,.85);color:#ffd75e;padding:12px 26px;border-radius:8px;
  font-size:16px;font-family:sans-serif;pointer-events:none;border:1px solid rgba(255,215,94,.4)}`;
        style.id = 'lock-hint-style';
        document.head.appendChild(style);
      }
    } else {
      // 已锁定：撤掉提示
      lockHint?.remove();
      document.getElementById('lock-hint-style')?.remove();
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
      furnaces: Object.fromEntries(
        [...furnaceSys.states].map(([key, s]) => [
          key,
          {
            in: s.input ? [s.input.key, s.input.count] : null,
            fuel: s.fuel ? [s.fuel.key, s.fuel.count] : null,
            out: s.output ? [s.output.key, s.output.count] : null,
            burn: s.burnLeft,
            total: s.burnTotal,
            progress: s.progress,
          },
        ]),
      ),
      armor: {
        head: armorSlots.head ? [armorSlots.head.key, armorSlots.head.count] : null,
        chest: armorSlots.chest ? [armorSlots.chest.key, armorSlots.chest.count] : null,
      },
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
  let animalRespawnTimer = 0; // 动物死亡后的补充延迟倒数（秒）
  const monsters: Monster[] = [];
  const spawner = new Spawner(world, {
    // groundY 约定 = 「可站立脚底 Y」：surfaceHeight 返回地表实心方块 y，需 +1
    // （此前漏 +1 → 采样点恒嵌在草方块里被悬空校验拒绝 → 动物永不刷新）
    groundY: (x, z) => surfaceHeight(x, z) + 1,
  });
  spawner.onSpawnAnimal((pos, speciesKey) => {
    const a = new Animal(pos, { species: ANIMAL_SPECIES[speciesKey] });
    // 死亡补充延迟：死后数秒内不补刷（尸体倒地 + 短暂空窗），恢复后在
    // 环带 [16,32] 随机方向补充——新群出现在「别的地方」，不在尸体旁原地顶替
    a.onDeath = () => { spawner.animalSpawnPaused = true; animalRespawnTimer = 5; };
    animals.push(a);
  });
  spawner.onSpawnMonster((pos) => {
    const m = new Monster(pos);
    // 怪物近战 → stats 统一入口（无敌帧/钳制/death 一次性全在 stats 侧）
    m.attackPlayer = (dmg: number, from: Vec3) => {
      stats.damageFromMob(dmg, from);
      bus.emit('damage', { amount: dmg, from });
    };
    monsters.push(m);
  });

  /** 左键攻击：单击制（点一下打一次），准星实体命中优先于挖掘（未命中实体时 interactor 才走挖矿） */
  let attackCooldown = 0;
  let miningSwing = 0.3; // 挖掘挥臂节流（0.3s 一挥）
  /** 最近被攻击命中的生物（准星下方血条数据源；until 后隐藏） */
  let hitMob: { e: { hp: number; maxHp: number; dead: boolean }; name: string; until: number } | null = null;
  const entityName = (e: unknown): string => {
    const n = (e as { species?: { name?: string } }).species?.name;
    return n ?? '怪物'; // 动物带物种名；怪物暂无名字字段，统一显示「怪物」
  };
  const tryMeleeAttack = (): void => {
    if (attackCooldown > 0) return; // 攻击节奏限制（单击连点也受冷却）
    const eye = player.eyePosition();
    const cp = renderer.camera.position;
    const camBack = Math.hypot(cp.x - eye.x, cp.y - eye.y, cp.z - eye.z);
    const origin: Vec3 = { x: cp.x, y: cp.y, z: cp.z };
    // getWorldDirection 会调 target.set()——必须传 Vector3 实例，普通对象会抛错
    const dirV = renderer.camera.getWorldDirection(new THREE.Vector3());
    const dir: Vec3 = { x: dirV.x, y: dirV.y, z: dirV.z };
    const held = inv.heldItem();
    const heldDef = held && ItemRegistry.has(held.key) ? ItemRegistry.get(held.key) : null;
    const tool = heldDef?.tool ?? null;
    const all = [...animals, ...monsters];
    const hit = tryAttack(origin, dir, all, tool, (e, dmg) => {
      // onHit 只发通知；实体真实受击走 Entity.hurt（击退+无敌帧在基类）
      (e as unknown as { hurt(d: number, from?: Vec3): void }).hurt(dmg, player.pos);
      // 记录被打目标：准星下方显示其剩余血量（数秒内每帧刷新）
      hitMob = { e: e as unknown as { hp: number; maxHp: number; dead: boolean }, name: entityName(e), until: performance.now() + 3000 };
    }, 3 + camBack); // ATTACK_RANGE + 相机后撤补偿
    if (hit) {
      attackCooldown = 0.5;
    }
    // 无论命中与否都挥臂（攻击有动作反馈；挖掘的挥动在主循环按节流触发）
    fpArm.punch();
  };
  document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && document.pointerLockElement && !(invUI.isOpen() || craftUI.isOpen() || furnaceUI.isOpen())) {
      tryMeleeAttack();
    }
  });

  // ---- 弓：右键按住蓄力、松开发射（蓄力曲线见 player/bow.ts）----
  const arrows: ArrowEntity[] = [];
  let bowChargeStart: number | null = null;
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 2 || !document.pointerLockElement) return;
    if (bowChargeStart !== null) return;
    const held = inv.heldItem();
    const heldDef = held && ItemRegistry.has(held.key) ? ItemRegistry.get(held.key) : null;
    if (!heldDef?.bow) return; // 只有持弓才进入蓄力
    bowChargeStart = performance.now();
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button !== 2 || bowChargeStart === null) return;
    const chargeS = (performance.now() - bowChargeStart) / 1000;
    bowChargeStart = null;
    hud.setBowCharge(null);
    const shot = bowShot(chargeS);
    if (!shot) return; // 蓄力不足：哑火
    const held = inv.heldItem();
    const heldDef = held && ItemRegistry.has(held.key) ? ItemRegistry.get(held.key) : null;
    if (!heldDef?.bow) return; // 松开时已换成其他物品
    if (!consumeOneArrow()) {
      hud.showToast('没有箭了——木棍+铁锭可合成');
      return;
    }
    const eye = player.eyePosition();
    const dirV = renderer.camera.getWorldDirection(new THREE.Vector3());
    arrows.push(new ArrowEntity(
      { x: eye.x, y: eye.y, z: eye.z },
      { x: dirV.x, y: dirV.y, z: dirV.z },
      shot.speed,
      shot.damage,
    ));
    sfx('place'); // 弦响占位音（后续可换专用合成音）
  });
  /** 从背包任意槽消耗一支箭；没有返回 false */
  function consumeOneArrow(): boolean {
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      if (s && s.key === ITEMS.ARROW) {
        inv.takeFrom(i, 1);
        bus.emit('invChanged', {});
        return true;
      }
    }
    return false;
  }

  /** 实体死亡清理：倒地动画播完才回收视图（原实现立即回收 = 尸体瞬间消失，
   *  且只 detachView 不 remove mesh——尸体网格泄漏在场景里永远站立）。 */
  function handleEntityDeaths(): void {
    for (const a of animals) {
      if (!a.dead || !a.deathAnimDone) continue; // 倒地动画播放中不回收
      const v = a.detachView() as { mesh?: import('three').Object3D } | null;
      if (v?.mesh) renderer.scene.remove(v.mesh);
    }
    for (let i = animals.length - 1; i >= 0; i--) {
      if (animals[i].dead && animals[i].deathAnimDone) animals.splice(i, 1);
    }
    for (const m of monsters) {
      if (!m.dead) continue;
      const v = m.detachView() as { mesh?: import('three').Object3D } | null;
      if (v?.mesh) renderer.scene.remove(v.mesh);
    }
    for (let i = monsters.length - 1; i >= 0; i--) if (monsters[i].dead) monsters.splice(i, 1);
  }

  // ---- 配置/暂停菜单（W10 MenuSystem 正式接线）----
  // ESC 释放指针锁 → 暂停菜单；提供继续/设置/重新开始/保存退出/主菜单全套入口。
  // 「重新开始」= 重玩当前世界：保留 seed 与地形改动，重置时间/状态/位置到出生点。
  /** 重置运行时状态到新开局的共用逻辑（不重载页面，世界 diffs 保留或清空由调用方决定） */
  function resetRuntimeState(opts: { resetDiffs: boolean; time: number }): void {
    if (opts.resetDiffs) {
      world.diffs.clear();
      // 已加载 chunk 带着旧 diff 数据——全部标脏让 worker 重生成
      for (const [, c] of world.chunks) c.dirty = true;
    }
    daycycle.timeOfDay = opts.time;
    player.respawn();
    player.spawnPoint = { ...world.spawnPoint };
    // 背包清空
    for (let i = 0; i < inv.slots.length; i++) inv.slots[i] = null;
    // 掉落物清空
    drops.length = 0;
    stats.reset();
    bus.emit('hp', { v: player.hp });
    bus.emit('hunger', { v: player.hunger });
    bus.emit('invChanged', {});
  }

  const menu = new MenuSystem(app, {
    hasSave: () => hasSave(),
    loadCosmetics: () => {
      const c = Cosmetics.load();
      return { skin: c.skin, shirt: c.shirt, pants: c.pants, hair: c.hair };
    },
    onCosmeticsChange: (c) => {
      Cosmetics.save(c); // 内部 normalize（非法 hex/preset 自动回落）
      playerModel.applyColors({
        skin: Number.parseInt(c.skin.slice(1), 16),
        shirt: Number.parseInt(c.shirt.slice(1), 16),
        pants: Number.parseInt(c.pants.slice(1), 16),
        hair: Number.parseInt(c.hair.slice(1), 16),
      });
      fpArm.setColors(
        Number.parseInt(c.skin.slice(1), 16),
        Number.parseInt(c.shirt.slice(1), 16),
      );
    },
    onContinue: () => {
      void app.requestPointerLock?.();
    },
    onResume: () => {
      void app.requestPointerLock?.();
    },
    onNewWorld: () => {
      clearSave();
      // 最干净的换世界方式：清档 + 重置状态 + 换 seed 重载页面
      // （World 的 worker 通道/初始 diffs 均按 seed 绑定，页面重载最可靠）
      try {
        localStorage.setItem('mini_world_next_seed', Math.random().toString(36).slice(2, 10));
      } catch { /* 隐私模式下忽略，沿用固定 seed */ }
      location.reload();
    },
    onRestartWorld: () => {
      resetRuntimeState({ resetDiffs: false, time: DAY_LENGTH * 0.5 });
      saveGame(snapshot());
      void app.requestPointerLock?.();
      hud.showToast('本世界已重新开始');
    },
    onSaveExit: () => {
      saveGame(snapshot());
      menu.showMain();
    },
  });

  // ---- 启动遮罩：新世界显示欢迎+操作说明；读档玩家不弹遮罩，
  //      由 pointerlockchange 的常驻提示条引导点击进入 ----
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
  let stuckFrames = 0; // 卡方块检测计数（连续 30 帧 ≈0.5s 嵌固体内触发自救）
  let worldWaitToast = false; // 物理门控期间的「世界生成中」提示去重
  // 挖掘中途碎屑：节流发射（每 0.15s 3 粒），颜色取自最近破坏的方块
  const miningDebris = {
    color: 0x8a7a5a as number,
    timer: 0,
    lastPos: { x: 0, y: 0, z: 0 } as Vec3,
  };
  let diagTick = 0;    // 诊断面板刷新节流
  const probe = { frames: 0, line: '[探针] 等待采样…' };

  // ---- 屏幕诊断 HUD（左上角小字）：主循环活着 + 玩家内部状态一目了然 ----
  const diag = document.createElement('div');
  diag.id = 'diag';
  document.body.appendChild(diag);
  {
    const style = document.createElement('style');
    style.textContent = `
#diag{position:fixed;left:8px;top:8px;z-index:9000;color:#7fff9f;font:11px/1.5 monospace;
  background:rgba(0,0,0,.45);padding:4px 8px;border-radius:4px;pointer-events:none;white-space:pre}`;
    style.id = 'diag-style';
    document.head.appendChild(style);
  }

  /** 包一层系统 tick：抛错时显示到屏幕（错误浮层）并跳过本帧该系统，主循环不断 */
  function guard<T>(name: string, fn: () => T): T | undefined {
    try {
      return fn();
    } catch (err) {
      showFrameError(name, err);
      return undefined;
    }
  }

  let firstErrorShown = false;
  function showFrameError(system: string, err: unknown): void {
    const msg = `[${system}] ${err instanceof Error ? err.stack ?? err.message : String(err)}`;
    console.error(msg);
    if (firstErrorShown) return; // 每帧重抛会刷屏——只显示一次，后续仅 console
    firstErrorShown = true;
    const el = document.getElementById('error-overlay');
    if (el) el.textContent = `⚠ 主循环异常（游戏可能表现异常）\n\n${msg}`;
  }

  // ---- 相机同步（第一/第三人称）----
  // 必须在 interactor.update 之前调用：准星射线从渲染相机出发（修第三人称视差），
  // 相机滞后一帧 = 转身瞬间目标错位。
  function syncCamera(): void {
    const eye = player.eyePosition();
    const camPos = player.cameraPosition({ x: 0, y: 0, z: 0 });
    if (player.viewMode === 'third') {
      // 防穿墙：理想点位被体素挡住时，把相机拉近到与玩家之间不穿帮的距离
      const dir = {
        x: camPos.x - eye.x,
        y: camPos.y - eye.y,
        z: camPos.z - eye.z,
      };
      const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
      const step = 0.15;
      let t = len;
      while (t > 0) {
        const sx = eye.x + (dir.x / len) * t;
        const sy = eye.y + (dir.y / len) * t;
        const sz = eye.z + (dir.z / len) * t;
        if (!world.isSolid(Math.floor(sx), Math.floor(sy), Math.floor(sz))) break;
        t -= step;
      }
      renderer.camera.position.set(
        eye.x + (dir.x / len) * Math.max(0, t),
        eye.y + (dir.y / len) * Math.max(0, t),
        eye.z + (dir.z / len) * Math.max(0, t),
      );
    } else {
      renderer.camera.position.set(eye.x, eye.y, eye.z);
    }
    // 朝向同步：yaw 绕 Y、pitch 绕 X（欧拉序 YXZ），与 controller 的 lookDir 公式一致
    renderer.camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  }

  function frame(now: number): void {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    guard('daycycle', () => daycycle.tick(dt));
    // 夜幕翻变沿 → dayTick 事件
    emitDayEdge();

    if (invUI.isOpen() || craftUI.isOpen() || furnaceUI.isOpen()) {
      guard('interactor', () => interactor.update(null, dt, null));
      // 防面板幽灵卡死：指针已重新锁定却仍有面板"开着"（状态与显示不一致的病态态）
      // ——此时玩家永久无法移动且看不到面板，症状正是"键按下但人不动"。
      // 检测到即强制关闭恢复游戏。
      if (document.pointerLockElement) {
        if (invUI.isOpen()) invUI.close();
        if (craftUI.isOpen()) craftUI.close();
        if (furnaceUI.isOpen()) furnaceUI.close();
      }
      // 熔炉在面板打开期间照常烧（每帧刷新界面火焰/进度）
      guard('furnace', () => furnaceSys.tick(dt));
      guard('furnace-ui', () => furnaceUI.refresh());
    } else {
      const preX = player.vel.x;
      const preZ = player.vel.z;
      // ---- 物理门控：脚下 chunk 数据未就绪（worker 在途，getBlock 恒 AIR）时冻结物理。
      // 否则出生/读档瞬间玩家会穿过尚未生成的地表掉进虚空（y<0 无地面），
      // 坠落位置又被 autosave 固化——刷新后从虚空深处继续坠，
      // 表现正是「键位/锁定/面板全部正常，WASD 却没反应」。
      const footReady = world.chunks.has(
        chunkKey(worldToChunk(player.pos.x), worldToChunk(player.pos.z)),
      );
      if (footReady) {
        guard('player', () => player.tick(dt, world));
        if (worldWaitToast) {
          worldWaitToast = false;
          hud.showToast('已进入世界');
        }
      } else if (!worldWaitToast) {
        worldWaitToast = true;
        hud.showToast('世界生成中…');
      }
      // 逐帧探针：tick 是否真的执行 + 速度是否被合成（解决"键在但 vel 恒 0"的现场之谜）
      probe.frames++;
      if (probe.frames % 60 === 0) {
        probe.line =
          `[探针] 60帧: tick跑了${probe.frames}次 | 本帧前后 vel.x ${preX.toFixed(2)}→${player.vel.x.toFixed(2)} ` +
          `vel.z ${preZ.toFixed(2)}→${player.vel.z.toFixed(2)} | keys.size=${player.debugKeyCount()}`;
      }
      // ---- 相机同步（必须在 interactor.update 之前：准星射线从渲染相机出发，
      //      用上一帧机位会在转身时出现目标滞后/错位）----
      syncCamera();

      guard('interactor', () => interactor.update(inv.heldItem(), dt, null));
      // 挖掘中途碎屑：准星有目标且正在挖 → 周期性冒 3 粒
      miningDebris.timer += dt;
      const miningNow = interactor.breakProgress() > 0.02;
      const cur = interactor.currentTarget();
      if (miningNow && cur && miningDebris.timer >= 0.15) {
        miningDebris.timer = 0;
        guard('debris', () =>
          particles.spawnBreak(
            { x: cur.pos.x + 0.5, y: cur.pos.y + 0.5, z: cur.pos.z + 0.5 },
            miningDebris.color,
            3,
          ));
      }
      const t = interactor.currentTarget();
      guard('hud', () => hud.setTargetName(t ? BlockRegistry.get(t.blockId).name : ''));
    }

    guard('stats', () => stats.tick(dt));
    // 熔炉持续烧炼（面板关闭时也烧——MC 语义；面板打开分支里另有 tick+refresh）
    if (!furnaceUI.isOpen()) guard('furnace', () => furnaceSys.tick(dt));
    guard('world', () => world.tick(player.pos));

    // ---- 虚空逃逸：世界底 y<0 恒为 AIR、永无地面可落。坠毁存档（读档瞬间
    // 物理门控尚未生效前掉下去的位置）唯一出路是送回出生点，否则每帧 vel.y
    // 持续增大、水平操作毫无存在感——「WASD 不管用」的最终形态。
    if (player.pos.y < -16) {
      player.pos = { ...player.spawnPoint };
      player.vel = { x: 0, y: 0, z: 0 };
      hud.showToast('掉出世界——已送回出生点');
    }

    // ---- 卡方块自救（每帧检查）：身体嵌在固体里且持续无法移动时，
    //      抬升到该柱最高实心面之上。覆盖「读档位置被方块埋住」「放置事故」等情形。
    //      读档校验放在这里而非启动时：启动瞬间 chunk 未加载，getBlock 全 AIR 校验无效。
    //      判定必须与碰撞求解器同语义（整盒 solidInBox）：旧版只查身体中心一点，
    //      偏心嵌入（脚部/头顶在固体、中心在空气）时碰撞侧每帧清零 vel → 永久冻结
    //      而自救永不触发——正是「键正常、锁定正常、vel 恒 0」的冻结盲区。
    let embeddedNow = false;
    if (
      (embeddedNow = solidInBox(
        world,
        player.pos.x - player.width / 2, player.pos.y, player.pos.z - player.width / 2,
        player.pos.x + player.width / 2, player.pos.y + player.height, player.pos.z + player.width / 2,
      ))
    ) {
      stuckFrames += 1;
      if (stuckFrames > 30) {
        // 从玩家当前位置向上找第一个「脚下实心、身位两格空」的安全落脚点；
        // 找不到（极端封闭空间）就顶到世界顶端再落下
        const fx = Math.floor(player.pos.x);
        const fz = Math.floor(player.pos.z);
        const footY = Math.floor(player.pos.y);
        let safeY = -1;
        for (let y = footY; y < 63; y++) {
          if (
            world.isSolid(fx, y - 1, fz) &&
            !world.isSolid(fx, y, fz) &&
            !world.isSolid(fx, y + 1, fz)
          ) {
            safeY = y;
            break;
          }
        }
        player.pos.y = (safeY >= 0 ? safeY : 62) + 0.01;
        player.vel.x = 0;
        player.vel.y = 0;
        player.vel.z = 0;
        stuckFrames = 0;
        hud.showToast('检测到卡方块——已移到安全位置');
      }
    } else {
      stuckFrames = 0;
    }

    // ---- 生物 tick 与清理 ----
    const isNight = daycycle.isNight;
    // 动物死亡补充延迟倒数：归零后解除暂停，spawner 在远处环带自然补刷
    if (animalRespawnTimer > 0) {
      animalRespawnTimer = Math.max(0, animalRespawnTimer - dt);
      if (animalRespawnTimer === 0) spawner.animalSpawnPaused = false;
    }
    guard('spawner', () =>
      spawner.tick(dt, player.pos, isNight, {
        animal: animals.length,
        monster: monsters.length,
      }));
    // ctx.drops 可能混有动物死亡时插入的裸 DropLike 结构——转成真 DropEntity
    guard('drops-sanitize', () => sanitizeRawDrops());
    guard('animals', () => {
      for (const a of animals) a.tick(dt, entityCtx);
    });
    guard('monsters', () => {
      for (const m of monsters) m.tick(dt, { ...entityCtx, isNight });
    });
    handleEntityDeaths();
    // 玩家攻击：单击制——伤害判定在 mousedown 的 tryMeleeAttack() 完成，
    // 这里只推进冷却与挖掘挥臂动画。
    attackCooldown -= dt;
    // 挖掘中途：手臂周期性挥动（0.3s 一挥，与挖掘碎屑节流节奏一致）
    if (interactor.breakProgress() > 0.02) {
      miningSwing += dt;
      if (miningSwing >= 0.3) {
        miningSwing = 0;
        fpArm.punch();
      }
    } else {
      miningSwing = 0.3; // 备满：一开挖立刻出第一拳
    }
    guard('fp-arm', () => fpArm.update(dt));
    // 被击生物血条：3 秒内每帧刷新（目标死亡或超时即隐藏）
    if (hitMob) {
      if (hitMob.e.dead || performance.now() > hitMob.until) {
        hitMob = null;
        hud.setMobHealth(null);
      } else {
        hud.setMobHealth(hitMob.name, hitMob.e.hp, hitMob.e.maxHp);
      }
    }

    // ---- 掉落物 tick + 清理 ----
    guard('drops-tick', () => {
      for (const d of drops) d.tick(dt, entityCtx);
    });
    for (let i = drops.length - 1; i >= 0; i--) if (drops[i].dead) drops.splice(i, 1);

    // ---- 箭投射物 tick + 清理（命中实体/方块在 ArrowEntity.tick 内部处理）----
    guard('arrows', () => {
      const targets = [...animals, ...monsters];
      for (const a of arrows) {
        a.tick(dt, {
          ...entityCtx,
          targets,
          spawnDrop: (stack, pos) => drops.push(new DropEntity({ ...pos }, stack)),
        });
      }
      for (let i = arrows.length - 1; i >= 0; i--) if (arrows[i].dead) arrows.splice(i, 1);
    });
    guard('arrow-views', () => syncArrowViews());

    // 蓄力条更新（按住右键拉弓期间）
    if (bowChargeStart !== null) {
      hud.setBowCharge(Math.min(1, (performance.now() - bowChargeStart) / 1000 / 1.0));
    } else {
      hud.setBowCharge(null);
    }

    // ---- 实体视图同步与 despawn ----
    guard('entity-views', () => syncEntityViews());
    guard('cull', () => cullFarEntities());

    guard('particles', () => particles.update(dt));
    guard('sky', () => sky.update(dt));

    // ---- 玩家模型同步（第三人称才可见）----
    if (player.viewMode === 'third') {
      playerModel.root.position.set(player.pos.x, player.pos.y, player.pos.z);
      playerModel.root.rotation.y = player.yaw;
      const hSpeed = Math.hypot(player.vel.x, player.vel.z);
      playerModel.animate(dt, Math.min(1, hSpeed / 4.3), hSpeed > 0.3);
    }
    hud.setHotbarIndex(inv.hotbarIndex);
    hud.renderHotbar();
    renderer.renderFrame(dt);

    // ---- 诊断行（每 15 帧刷新，≈4Hz）----
    if ((diagTick = (diagTick + 1) % 15) === 0) {
      const p = player.pos;
      const v = player.vel;
      const nan = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : 'NaN!');
      const panel = craftUI.isOpen()
        ? `合成(${craftUI.mode()})`
        : furnaceUI.isOpen()
        ? '熔炉'
        : invUI.isOpen()
        ? '背包'
        : '无';
      const footChunk = world.chunks.get(
        `${Math.floor(p.x / 16)},${Math.floor(p.z / 16)}`,
      );
      const footLoaded = footChunk ? '有' : '无';
      diag.textContent =
        `${probe.line} | 键:${player.debugKeys()} | 面板:${panel}\n` +
        `fps≈${Math.round(1 / Math.max(dt, 1e-3))} 锁定:${document.pointerLockElement ? '是' : '否'} 模式:${player.viewMode}\n` +
        `pos(${nan(p.x)},${nan(p.y)},${nan(p.z)}) vel(${nan(v.x)},${nan(v.y)},${nan(v.z)}) ` +
        `| 水中:${player.inWater ? '是' : '否'} hp:${player.hp.toFixed(0)} 饥饿:${player.hunger.toFixed(1)}\n` +
        `yaw:${nan(player.yaw)} dir:${player.debugMoveDir()} 嵌固:${embeddedNow ? '是' : '否'} ` +
        `| 区块:${world.chunks.size} 脚下:${footLoaded} 掉落物:${drops.length} 生物:${animals.length + monsters.length}`;
    }
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
      const d = drops[i] as unknown as { stack?: ItemStack; dead: boolean; pos?: Vec3 };
      if (d instanceof DropEntity) continue;
      // 裸结构：先取 pos 再 splice——之前反过来取 drops[i]（已错位）导致掉落物全落玩家头上
      const stack = d.stack ?? { key: 'ITEM_RAW_PORK', count: 1 };
      const pos: Vec3 = d.pos ?? { ...player.pos };
      drops.splice(i, 1);
      drops.push(new DropEntity({ ...pos }, stack));
    }
  }

  /** 实体视图：动物按物种多盒组合（猪/牛/羊），怪物保持单盒占位 */
  function syncEntityViews(): void {
    for (const a of animals) syncAnimalView(a, a.species, renderer.scene);
    for (const m of monsters) syncView(m, 0x3c4b3a, 0.6, 1.8);
    syncDropViews();
  }

  /**
   * 掉落物视图：0.28 立方小盒，颜色取物品图标的平均色（iconTile → 图集取色），
   * 上下浮动 + 旋转。此前掉落物完全不可见（只有拾取 toast），玩家打死动物
   * 看不到掉落物以为没掉。
   */
  function syncDropViews(): void {
    const atlasCanvas = renderer.atlasTexture.image instanceof HTMLCanvasElement
      ? renderer.atlasTexture.image
      : null;
    for (const d of drops) {
      type V = { mesh: import('three').Mesh; yaw: number | null };
      let v = d.view as V | null;
      if (!v) {
        // 取色失败回落暖黄（拾取物通用色）
        let color = 0xffd75e;
        try {
          const def = ItemRegistry.get(d.stack.key);
          if (def.iconTile !== undefined) {
            color = tileAverageColor(atlasCanvas as HTMLCanvasElement, def.iconTile);
          }
        } catch { /* 未注册物品用回落色 */ }
        v = {
          mesh: makeBoxMesh(color, 0.28, 0.28),
          yaw: null,
        };
        d.attachView(v);
        renderer.scene.add(v.mesh);
      }
      // 浮动 + 旋转（用游戏时间驱动，各自相位按位置错开）
      const phase = performance.now() / 1000 * 2 + d.pos.x * 1.3;
      v.mesh.position.set(
        d.pos.x,
        d.pos.y + 0.05 + Math.sin(phase) * 0.06,
        d.pos.z,
      );
      v.mesh.rotation.y += 0.03;
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      if (drops[i].dead) {
        const v = drops[i].detachView() as { mesh: import('three').Mesh } | null;
        if (v) renderer.scene.remove(v.mesh);
      }
    }
  }

  /** 箭视图：细长小杆，按飞行方向摆姿（懒建，dead 时回收） */
  function syncArrowViews(): void {
    for (const a of arrows) {
      type V = { mesh: import('three').Mesh; yaw: number | null };
      let v = a.view as V | null;
      if (!v) {
        v = {
          mesh: makeBoxMesh(0xc9a15a, 0.05, 0.5),
          yaw: null,
        };
        // 杆沿 +Y 建模 → 旋转到 +Z 朝向轴，与 facingYaw 约定一致
        v.mesh.rotation.x = Math.PI / 2;
        a.attachView(v);
        renderer.scene.add(v.mesh);
      }
      v.mesh.position.set(a.pos.x, a.pos.y, a.pos.z);
      const yaw = Math.atan2(a.vel.x, a.vel.z);
      if (v.yaw !== yaw) {
        v.mesh.rotation.y = yaw;
        v.yaw = yaw;
      }
    }
    for (let i = arrows.length - 1; i >= 0; i--) {
      if (arrows[i].dead) {
        const v = arrows[i].detachView() as { mesh: import('three').Mesh } | null;
        if (v) renderer.scene.remove(v.mesh);
      }
    }
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
  // 调试钩子：控制台可直查世界内部状态（诊断 HUD 之外的深挖入口）
  (window as unknown as { __game: object }).__game = {
    world,
    player,
    spawner,
    animals,
    monsters,
    drops,
    furnaceSys,
    armorSlots,
  };
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

installErrorOverlay();
boot();
