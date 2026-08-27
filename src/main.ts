// main.ts —— M1 装配：把体素引擎/渲染器/玩家/交互装成可玩状态。
// W3 串行集成（任务卡 T31）。流式加载 world.ensureArea 在 W4(T42) 替换本文件的静态生成循环。

import { BLOCK, BlockRegistry } from './blocks/registry';
import {
  WORLD_H,
  localCoord,
  voxelIndex,
  worldToChunk,
} from './core/constants';
import type { Vec3 } from './core/types';
import { Hud } from './ui/hud';
import { PlayerController } from './player/controller';
import { Interactor } from './player/interact';
import { Renderer } from './render/renderer';
import { Chunk } from './world/chunk';
import { createChunkData, initTerrain, meshNeighborhood } from './world/pipeline-m1';

const SEED = 'mini-world-m1';

function boot(): void {
  BlockRegistry.load();
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('#app 容器缺失');

  // ---- 渲染与玩家 ----
  const renderer = new Renderer(app);
  const player = new PlayerController({ x: 8.5, y: 50, z: 8.5 });
  player.bind(app);

  // ---- 世界（M1 静态版：半径 5 内全部一次性生成 + 网格化）----
  initTerrain(SEED);
  const chunks = new Map<string, Chunk>();
  const genRadius = 5;
  for (let cx = -genRadius; cx <= genRadius; cx++) {
    for (let cz = -genRadius; cz <= genRadius; cz++) {
      const c = new Chunk(cx, cz);
      c.data.set(createChunkData(cx, cz));
      chunks.set(`${cx},${cz}`, c);
    }
  }
  // 初始脏标记 → 全部网格化
  for (const c of chunks.values()) c.dirty = true;

  // 把玩家落到地表
  spawnPlayerOnGround(player);

  const interactor = new Interactor(renderer.camera, player, {
    getBlock: (x, y, z) => getBlock(x, y, z),
    isSolid: (x, y, z) => isSolid(x, y, z),
    setBlock: (x, y, z, id) => setBlock(x, y, z, id),
  });
  renderer.scene.add(interactor.highlight);

  const hud = new Hud(app);

  // 挖掘：直接置 AIR（M1 无掉落物，W4 接 DropEntity）
  interactor.onBreak((pos) => {
    setBlock(pos.x, pos.y, pos.z, BLOCK.AIR);
  });

  // 放置：选中热栏方块；目标位必须是 AIR（放自己身体里的保护在 interactor.prev 语义中已保证）
  let hotbarIndex = 0;
  const hotbarIds: (number | null)[] = [BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.COBBLE, BLOCK.PLANKS, BLOCK.GLASS, null, null, null];
  interactor.onPlace((pos) => {
    const id = hotbarIds[hotbarIndex];
    if (id !== null && getBlock(pos.x, pos.y, pos.z) === BLOCK.AIR) {
      setBlock(pos.x, pos.y, pos.z, id);
    } else if (id === null) {
      hud.showToast('空手位——按 1~6 选择方块');
    }
  });

  // 数字键切换热栏
  window.addEventListener('keydown', (e) => {
    if (!document.pointerLockElement) return;
    const n = Number(e.code.replace('Digit', ''));
    if (/^Digit[1-9]$/.test(e.code)) {
      hotbarIndex = n - 1;
      hud.setHotbarIndex(hotbarIndex);
    }
  });
  hud.setHotbarIndex(0);

  // ---- 体素读写（M1 直接查 chunk 表；越界按契约返回 AIR / 忽略）----
  function chunkAt(x: number, z: number): Chunk | undefined {
    return chunks.get(`${worldToChunk(x)},${worldToChunk(z)}`);
  }

  function getBlock(x: number, y: number, z: number): number {
    const c = chunkAt(x, z);
    if (!c || y < 0 || y >= WORLD_H) return 0;
    return c.data[voxelIndex(localCoord(x), y, localCoord(z))];
  }

  function isSolid(x: number, y: number, z: number): boolean {
    const d = BlockRegistry.get(getBlock(x, y, z));
    return d.solid;
  }

  function setBlock(x: number, y: number, z: number, id: number): void {
    const c = chunkAt(x, z);
    if (!c || y < 0 || y >= WORLD_H) return;
    c.data[voxelIndex(localCoord(x), y, localCoord(z))] = id;
    markDirtyAround(x, y, z);
  }

  /** 本块标脏；贴边时邻块也标脏（跨 chunk 面剔除依赖邻居） */
  function markDirtyAround(x: number, _y: number, z: number): void {
    const cx = worldToChunk(x);
    const cz = worldToChunk(z);
    dirtify(cx, cz);
    if (localCoord(x) === 0) dirtify(cx - 1, cz);
    if (localCoord(x) === 15) dirtify(cx + 1, cz);
    if (localCoord(z) === 0) dirtify(cx, cz - 1);
    if (localCoord(z) === 15) dirtify(cx, cz + 1);
    if (localCoord(x) === 0 && localCoord(z) === 0) dirtify(cx - 1, cz - 1);
    if (localCoord(x) === 15 && localCoord(z) === 0) dirtify(cx + 1, cz - 1);
    if (localCoord(x) === 0 && localCoord(z) === 15) dirtify(cx - 1, cz + 1);
    if (localCoord(x) === 15 && localCoord(z) === 15) dirtify(cx + 1, cz + 1);
  }

  function dirtify(cx: number, cz: number): void {
    const c = chunks.get(`${cx},${cz}`);
    if (c) c.dirty = true;
  }

  // ---- 主循环 ----
  let last = performance.now();
  let meshBudgetThisFrame = 0;

  function frame(now: number): void {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    player.tick(dt, { isSolid });
    interactor.update(null, dt, null);

    // 显示准星指向的方块名
    const t = interactor.currentTarget();
    hud.setTargetName(t ? BlockRegistry.get(t.blockId).name : '');

    // 脏 chunk 重建网格：每帧最多 2 个（帧预算）
    meshBudgetThisFrame = 2;
    for (const c of chunks.values()) {
      if (meshBudgetThisFrame <= 0) break;
      if (!c.dirty) continue;
      remesh(c);
      meshBudgetThisFrame--;
    }

    // 相机跟随玩家眼睛
    const eye = player.eyePosition();
    renderer.camera.position.set(eye.x, eye.y, eye.z);
    renderer.renderFrame(dt);
  }
  requestAnimationFrame(frame);

  function remesh(c: Chunk): void {
    const res = meshNeighborhood(
      c,
      (gx, gy, gz) => {
        const nc = chunkAt(gx, gz);
        if (!nc) return gy < 0 ? BLOCK.BEDROCK : 0;
        if (gy < 0 || gy >= WORLD_H) return gy < 0 ? BLOCK.BEDROCK : 0;
        return nc.data[voxelIndex(localCoord(gx), gy, localCoord(gz))];
      },
      c.cx,
      c.cz,
    );
    renderer.updateChunkGeometry(c, res.opaque, res.water);
    c.dirty = false;
  }

  // 把玩家从空中落到地面并设为出生点
  function spawnPlayerOnGround(p: PlayerController): void {
    let y = WORLD_H - 2;
    while (y > 1 && !isSolid(Math.floor(p.pos.x), y, Math.floor(p.pos.z))) y--;
    p.pos.y = y + 1.01;
    p.spawnPoint = { ...p.pos } as Vec3;
  }

  console.log(`[mini-world] M1 就绪 seed=${SEED} chunks=${chunks.size}`);
}

boot();
