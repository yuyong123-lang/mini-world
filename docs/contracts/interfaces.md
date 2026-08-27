# 冻结接口契约 ★

> 本文档一经 W0 定稿即为**冻结契约**。任何 Agent 不得私自修改此处签名；
> 如实现中发现契约缺陷，停止改动并在任务报告中提出，由主线程修订后再重发受影响任务。

## §1 全局常量与类型（core/constants.ts, core/types.ts）

```ts
// ---- core/constants.ts ----
export const CHUNK_W = 16;
export const WORLD_H = 64;
export const SEA_LEVEL = 28;
export const RENDER_RADIUS_CHUNKS = 6;   // 可被设置页修改（运行期经 Settings 单例读取，见 §11）
export const LOAD_RADIUS_CHUNKS = 7;
export const UNLOAD_RADIUS_CHUNKS = 9;
export const FOG_NEAR = 78;
export const FOG_FAR = 92;
export const GRAVITY = -24;
export const JUMP_SPEED = 8.4;
export const WALK_SPEED = 4.3;
export const SPRINT_SPEED = 5.8;
export const REACH = 5;                  // 挖放交互距离（格）
export const DAY_LENGTH = 480;           // 秒
export const NIGHT_LENGTH = 240;

// 体素索引（0..15, 0..63, 0..15）
export function voxelIndex(lx: number, ly: number, lz: number): number; // lx | lz<<4 | ly<<8

// 世界坐标 → chunk 坐标
export function worldToChunk(n: number): number;                        // Math.floor(n/16)
export function localCoord(worldN: number): number;                     // ((n%16)+16)%16
export function chunkKey(cx: number, cz: number): string;               // `${cx},${cz}`

// ---- core/types.ts ----
export type ToolType = 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'hand';
export type Vec3 = { x: number; y: number; z: number };

export interface AABBox {           // min/max 各为角点
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
}

export interface BlockHit {         // DDA 射线结果
  hit: boolean;
  pos: { x: number; y: number; z: number };       // 命中体素世界坐标（整数）
  prev: { x: number; y: number; z: number };      // 射线进入前最后一个空体素（放置位）
  normal: { x: number; y: number; z: number };    // 命中面法线
  blockId: number;
}

export interface MeshArrays {       // mesher 输出（纯 TypedArray，可结构化克隆进 Worker）
  position: Float32Array;
  uv: Float32Array;
  color: Float32Array;            // rgb 相同灰度 = faceShade × aoLevel
  index: Uint32Array;
}
```

## §2 BlockDef（blocks/registry.ts）

```ts
export interface BlockDef {
  id: number;
  key: string;                                   // 'STONE' 等
  name: string;                                  // 中文名（UI 用）
  solid: boolean;                                // 参与碰撞
  opaque: boolean;                               // 剔除相邻面
  liquid?: boolean;                              // 水
  transparent?: boolean;                         // 玻璃/叶子（非 opaque 但实心）
  emissive?: boolean;                            // GLOWBLOCK
  tex: [top: number, bottom: number, side: number];  // 图集 tile 序号，见 §4
  hardness: number;                              // 徒手基准秒
  tool?: Exclude<ToolType, 'hand'>;              // 有效工具类型
  minTier?: 0 | 1 | 2;                           // 0徒手 1木 2石；不满足则不掉落
  drop?: string;                                 // itemId；缺省掉自身 key 对应物品
}

export const BLOCK = {
  AIR: 0, BEDROCK: 1, STONE: 2, COBBLE: 3, DIRT: 4, GRASS: 5, SAND: 6,
  SANDSTONE: 7, LOG: 8, PLANKS: 9, LEAVES: 10, GLASS: 11, WATER: 12,
  SNOW: 13, GLOWBLOCK: 14, CRAFT_TABLE: 15,
  ORE_COAL: 16, ORE_IRON: 17, ORE_GOLD: 18,
} as const;

export class BlockRegistry {
  static load(defs: BlockDef[]): void;                       // 启动时从 blocks.json 加载
  static get(id: number): BlockDef;
  static byKey(key: string): BlockDef;
  static count(): number;
}
```

## §3 方块属性全表（19 种，blocks.json 内容以此为准）

| key | id | solid | opaque | hardness | tool | minTier | drop | 备注 |
|---|---|---|---|---|---|---|---|---|
| AIR | 0 | ✗ | ✗ | - | - | - | - | |
| BEDROCK | 1 | ✓ | ✓ | Infinity | - | - | 无 | 不可破坏 |
| STONE | 2 | ✓ | ✓ | 7.5 | pickaxe | 1 | COBBLE | |
| COBBLE | 3 | ✓ | ✓ | 10 | pickaxe | 1 | COBBLE | |
| DIRT | 4 | ✓ | ✓ | 0.75 | shovel | 0 | DIRT | |
| GRASS | 5 | ✓ | ✓ | 0.9 | shovel | 0 | DIRT* | *drop 特例 |
| SAND | 6 | ✓ | ✓ | 0.75 | shovel | 0 | SAND | 不做重力下落 |
| SANDSTONE | 7 | ✓ | ✓ | 4 | pickaxe | 1 | SANDSTONE | |
| LOG | 8 | ✓ | ✓ | 3 | axe | 0 | LOG | |
| PLANKS | 9 | ✓ | ✓ | 3 | axe | 0 | PLANKS | |
| LEAVES | 10 | ✓ | ✗ | 0.35 | hand | 0 | 见备注 | 20% 苹果/80% 无 |
| GLASS | 11 | ✓ | ✗ | 0.45 | hand | 0 | 无* | *打碎即碎 |
| WATER | 12 | ✗ | ✗ | Infinity | - | - | 无 | liquid |
| SNOW | 13 | ✓ | ✓ | 0.6 | shovel | 0 | SNOW | |
| GLOWBLOCK | 14 | ✓ | ✓ | 0.5 | hand | 0 | GLOWBLOCK | emissive |
| CRAFT_TABLE | 15 | ✓ | ✓ | 3.75 | axe | 0 | CRAFT_TABLE | 右键开3×3 |
| ORE_COAL | 16 | ✓ | ✓ | 15 | pickaxe | 1 | ITEM_COAL | 掉矿物不掉方块 |
| ORE_IRON | 17 | ✓ | ✓ | 22.5 | pickaxe | 2* | ITEM_RAW_IRON | *需石镐 |
| ORE_GOLD | 18 | ✓ | ✓ | 30 | pickaxe | 2 | ITEM_RAW_GOLD | 需石镐 |

> drops 引用的 `ITEM_*` 是物品 key（§5）。LEAVES/GLOWBLOCK/CRAFT_TABLE 的工具列允许 hand。

## §4 纹理图集 tile 索引（blocks/atlas.ts 唯一依据，16×16 格图集 = 256 tiles，实际使用 24 个）

| tile# | 名称 | tile# | 名称 |
|---|---|---|---|
| 0 | grass_top | 12 | glow |
| 1 | grass_side | 13 | craft_table_top |
| 2 | dirt | 14 | craft_table_side |
| 3 | stone | 15 | snow |
| 4 | cobble | 16 | snow_side |
| 5 | sand | 17 | coal_ore |
| 6 | sandstone | 18 | iron_ore |
| 7 | log_side | 19 | gold_ore |
| 8 | log_top | 20 | sun |
| 9 | planks | 21 | moon |
| 10 | leaves | 22 | apple(占位item图标) |
| 11 | glass | 24 | water(半透明蓝微波)；crack_overlay 十帧挖掘裂纹 → tile 34..43(修订：原 23..32 与 water 冲突) |

`BlockDef.tex` 使用本表。UV 计算统一由 atlas.ts 导出的工具函数完成（含半 texel inset）：

```ts
export function buildAtlasCanvas(seed: number): HTMLCanvasElement;   // 256×256
export function tileUV(tileIndex: number): { u0: number; v0: number; u1: number; v1: number };
export const ATLAS_TILES: Record<string, number>;                    // 名称→序号
export const TILE_PX = 16, ATLAS_GRID = 16;
```

## §5 ItemDef / ItemStack（items/items.ts）

```ts
export interface ToolSpec { type: ToolType; tier: 1 | 2; speedMul: number; damage: number }
export interface ItemDef {
  key: string;                 // 'ITEM_PLANKS'
  name: string;                // 中文名
  stackMax: number;            // 64 或工具类 1
  place?: number;              // 可放置时对应的 BlockDef.id
  tool?: ToolSpec;
  food?: { hunger: number };   // 食用恢复饥饿
  iconTile?: number;           // 图集 tile 作图标（未定义则用纯色块 css）
}

export const ITEMS = {
  BLOCK_STONE: 'ITEM_STONE', BLOCK_COBBLE: 'ITEM_COBBLE', /* ...每个可拾取方块一个 */
} as const;

export class ItemRegistry {
  static load(defs: ItemDef[]): void;
  static get(key: string): ItemDef;
  static has(key: string): boolean;
}

export interface ItemStack { key: string; count: number }

export class Inventory {
  slots: (ItemStack | null)[];              // 36 = 9 hotbar + 27 main
  hotbarIndex: number;                      // 0..8 当前手持
  add(stack: ItemStack): number;            // 返回未装下数量；自动堆叠+首空位
  takeFrom(slot: number, count?: number): ItemStack | null;
  setSlot(slot: number, s: ItemStack | null): void;
  swapSlots(a: number, b: number): void;
  heldItem(): ItemStack | null;             // 当前手持
  consumeHeld(count?: number): void;        // 吃东西/放方块扣减
}
```

初始物品清单（items.json）：ITEM_STONE/COBBLE/DIRT/SAND/SANDSTONE/LOG/PLANKS/LEAVES/GLASS/SNOW/GLOWBLOCK/CRAFT_TABLE（place 类）、ITEM_COAL/RAW_IRON/RAW_GOLD（矿物）、ITEM_APPLE(food+2)、ITEM_RAW_PORK(food+3)、工具 ITEM_WOOD_PICKAXE/WOOD_AXE/WOOD_SWORD/STONE_PICKAXE/STONE_SWORD（tier/speed/damage 按架构 §2.8）。伤害值：拳1/木剑5/石剑7；工具速度：木 ×2 / 石 ×4。

## §6 配方（crafting.ts, recipes.json）

```ts
export interface Recipe {
  out: { key: string; count: number };
  shaped?: string[][];        // 有序：字符矩阵，'P'=任意木板等代称映射进 map
  shapeless?: string[];       // 无序：多重集
  map?: Record<string, string[]>; // 字符 → 可接受的 itemKey 数组（如 P→[LOG 全部木板类]）
  size: 2 | 3;                // 需要 2×2 还是工作台 3×3
}

export class CraftingMatcher {
  static load(recipes: Recipe[]): void;
  static match(grid: (ItemStack|null)[], gridSize: 2|3): Recipe | null;
  static consume(grid: (ItemStack|null)[], recipe: Recipe): (ItemStack|null)[];
}
```

内置配方（recipes.json）：LOG→4 PLANKS(2×2 shapeless)；4 PLANKS→CRAFT_TABLE(2×2)；2 PLANKS 竖排→4 STICK…（STICK 为合成中间材料需要 items.json 含 ITEM_STICK place 空）；板+棍→WOOD_PICKAXE/AXE/SWORD(3×3)；COBBLE+棍→STONE_PICKAXE/SWORD(3×3)。

## §7 Chunk / World

```ts
// world/chunk.ts
export class Chunk {
  readonly cx: number; readonly cz: number;
  data: Uint8Array;                          // 16×64×16
  dirty: boolean;                            // 需要重建网格
  meshes: unknown;                           // renderer 挂载的 three 对象句柄（opaque/water），Chunk 不 import three，用 any
  get(lx: number, ly: number, lz: number): number;
  set(lx: number, ly: number, lz: number, id: number): void;
  disposeMeshes(rendererLike: { removeChunkMeshes(c: Chunk): void }): void;
}

// world/world.ts —— 体素读写唯一入口 + 调度中枢
export class World {
  seed: string;
  diffs: Map<string, Map<number, number>>;   // "cx,cz" → voxelIndex → blockId（含玩家+树叶覆盖）
  spawnPoint: Vec3;
  constructor(seed: string);
  ensureArea(px: number, pz: number, budgetPerFrame: number): void; // 流式加载/卸载（带帧预算队列）
  getBlock(x: number, y: number, z: number): number;   // 越界返回 AIR(0)；未加载 chunk 查询走 terragen 直算? → NO：返回 AIR，调用方只查询已加载区
  setBlock(x: number, y: number, z: number, id: number): void;  // 写 diffs + 标脏自身及受影响邻 chunk
  isSolid(x: number, y: number, z: number): boolean;
  raycast(origin: Vec3, dir: Vec3, maxDist: number): BlockHit;   // DDA
  findSpawnY(x: number, z: number): number;                      // 落地点表面上方
  tick(playerPos: Vec3): void;                                   // 每帧调度（限预算）
}
```
> terragen 完整版引入树叶覆盖后，diffs 里可能存在与再生地形相同的条目——无害，apply 幂等。

## §8 地形生成（world/terragen.ts，纯函数）

```ts
export function initTerrain(seed: string): void;              // 构建噪声函数集（Worker 内各自调一次）
export function createChunkData(cx: number, cz: number): Uint8Array;
export function applyDiffs(data: Uint8Array, diffs: Map<number, number> | undefined): void; // World 在 createChunkData 后调用
export function surfaceHeight(x: number, z: number): number;  // spawn/树判定用
export function isTreeColumn(x: number, z: number): boolean;  // 树干所在列确定性判定
```

## §9 网格化（world/mesher.ts，纯函数）

```ts
export interface NeighborAccess {
  // gx,gy,gz 为世界坐标；在当前 chunk 外时由调用方查询邻 chunk 数据
  get(gx: number, gy: number, gz: number): number;
}
export function meshChunk(cur: Uint8Array, neighbors: NeighborAccess, cx: number, cz: number): {
  opaque: MeshArrays;
  water: MeshArrays | null;
};
```
> 面剔除规则：面可见 ⇔ 邻块非 opaque（AIR/水/玻璃/树叶邻接都出面）；水与水相邻不出面；水面（上邻为 AIR）略降 0.1 格。

## §10 物理（physics/collide.ts）

```ts
export interface PhysicsBody {
  pos: Vec3;               // AABB 中心底部？→ 取「脚底中心」为锚点
  vel: Vec3;
  width: number; height: number;   // 盒宽（x=z）与高
  onGround: boolean;
}
export function moveWithCollisions(b: PhysicsBody, dt: number, world: {
  isSolid(x: number, y: number, z: number): boolean;
}): void;
```
> 分轴顺序 X→Z→Y；body.pos 是脚底中心，AABB 由 width/height 推导。

## §11 渲染 / 昼夜 / 存档 / 事件

```ts
// render/renderer.ts
export class Renderer {
  constructor(container: HTMLElement);
  updateChunkGeometry(c: import('../world/chunk').Chunk, opaque: MeshArrays, water: MeshArrays | null): void;
  removeChunkMeshes(c: unknown): void;
  scene: import('three').Scene;               // sky/particles/audio 等系统挂载自己的对象
  camera: import('three').PerspectiveCamera;
  renderFrame(dt: number): void;              // 含雾/天空色由 daycycle 驱动
}

// survival/daycycle.ts
export class DayCycle {
  timeOfDay: number;                          // 0..(DAY+NIGHT)，从 0 白天开始
  isNight: boolean;
  fraction: number;                           // 0..1 整个周期进度
  constructor(startAt?: number);
  tick(dt: number): void;
  skyColors(): { top: string; bottom: string; fog: string; sunAngle: number };
}

// save/storage.ts（W6 修订：单 SaveSource 入参 + storage 注入 + startAutosave）
export interface SaveSource {
  seed: string;
  time: number;
  player: { p: [number, number, number]; yaw: number; pitch: number; hp: number; hunger: number };
  inventorySlots: (ItemStack | null)[];
  diffs: Map<string, Map<number, number>>;
}
export function saveGame(src: SaveSource, storage?: Storage): boolean;
export function loadGame(storage?: Storage): SavedGame | null;
export function clearSave(storage?: Storage): void;
export function hasSave(storage?: Storage): boolean;
export function startAutosave(getSrc: () => SaveSource | null, intervalMs?: number, storage?: Storage): () => void;
// SavedGame 即架构 §2.9 的 SaveGame 结构；storage 缺省 globalThis.localStorage。
// quota/损坏一律不抛：save 失败返回 false 由接线层弹 toast，load 返回 null。

// core/events.ts
export class EventBus<T extends Record<string, unknown>> {
  on<K extends keyof T>(k: K, fn: (p: T[K]) => void): () => void;
  emit<K extends keyof T>(k: K, p: T[K]): void;
}
// GameEvents 约定键（W0 定义于 core/events.ts 中导出；修订记录见下）：
//   hp:{v:number} hunger:{v:number} death:{} damage:{amount:number,from?:Vec3}
//   invChanged:{} toast:{msg:string} pickup:{key:string,count:number}
//   dayTick:{isNight:boolean} blockBroken:{pos:Vec3,id:number} mobKilled:{drops:ItemStack[]}
//   dropAtPlayer:{stack:ItemStack}
// 修订(W4)：GameEvents 由 interface 改为 type 别名——EventBus<T extends Record<string,unknown>>
// 需要隐式索引签名，interface 不满足；新增 dropAtPlayer 键（背包放不下的物品落地）。
```

## §12 玩家 / 实体 / 战斗

```ts
// player/controller.ts
export class PlayerController implements PhysicsBody {
  pos: Vec3; vel: Vec3; yaw: number; pitch: number;
  hp: number; hunger: number;
  spawnPoint: Vec3;
  readonly width: number; readonly height: number; onGround: boolean;
  sprinting: boolean;
  bind(domRoot: HTMLElement): void;           // pointer lock + 键鼠监听
  tick(dt: number, world: World): void;       // 输入→速度→moveWithCollisions
  respawn(): void;
  eyePosition(): Vec3;
  lookDir(out: { x: number; y: number; z: number }): void;
}

// player/interact.ts
export class Interactor {
  constructor(camera: unknown, player: PlayerController, world: World);
  update(heldItem: ItemStack | null, dt: number, targetEl: HTMLElement): void;  // 挖掘进度/放置/highlight盒
  onBreak(cb: (pos: Vec3, blockId: number) => void): void;
  onPlace(cb: (pos: Vec3) => void): void;
  onUseCraftTable(cb: () => void): void;
}

// entities/entity.ts
export abstract class Entity implements PhysicsBody {
  pos: Vec3; vel: Vec3; width: number; height: number; onGround: boolean;
  hp: number; dead: boolean;
  abstract tick(dt: number, ctx: EntityCtx): void;
  hurt(amount: number, from?: Vec3): void;    // 击退+无敌帧
}
export interface EntityCtx {
  world: World; player: PlayerController; dt helpers...
  spawnDrop(pos: Vec3, stack: ItemStack): void;
  isNight(): boolean;
}

// entities/drops.ts
export class DropEntity extends Entity {       // 小方块旋转 + 距玩家<1.5 磁吸、<0.6 拾取入包(发事件)
  constructor(pos: Vec3, stack: ItemStack);
  tick(dt: number, ctx: EntityCtx): void;      // 用 moveWithCollisions 落地
}

// entities/spawner.ts
export class Spawner {
  constructor(world: World);
  tick(dt: number, playerPos: Vec3, isNight: boolean, entityCount: { animal: number; monster: number }): void;
  onSpawnAnimal(cb: (pos: Vec3) => void): void; onSpawnMonster(cb: (pos: Vec3) => void): void;
}

// player/attack.ts
export function tryAttack(player: PlayerController, dir: Vec3, targets: Entity[],
  heldTool: ToolSpec | undefined, emitters: {
  onMobHurt(e: Entity, dmg: number): void;
}): void;
```

## §13 UI / 音频 / 粒子 / 设置（后期波次对外可见部分）

```ts
// ui/hud.ts：initHud(bus, inventory)、updateHotbar()、showToast(msg)
// ui/statusUI.ts：renderHearts(hp:number)、renderHunger(v:number)、setTimeIcon(isNight:boolean)
// ui/inventoryUI.ts / craftUI.ts：open()/close()/isOpen()，操作直接改 Inventory 实例并刷新
// ui/menu.ts(W10)：主菜单/设置(视距、灵敏度、音量)
// render/particles.ts：spawnBreakParticles(pos, colorHex)
// audio/audio.ts：sfx('break'|'place'|'hurt'|'eat'|'pickup'|'click')，WebAudio 合成
// core/settings.ts(W10)：Settings.load()/get('viewDistance'|'sensitivity'|'volume')/save()
```

## §14 目录所有权总表（并发互斥依据）

| 文件 | 任务 |
|---|---|
| src/core/{constants,rng,events,types,settings}.ts | T02 / W10 settings |
| src/blocks/{registry,atlas}.ts | T11 / T12 |
| src/world/chunk.ts | T13 |
| src/world/terragen.ts | T14(T41 升级) |
| src/world/mesher.ts | T15 |
| src/world/world.ts | T42(T101 本波独占升级) |
| src/physics/collide.ts | T16 |
| src/render/renderer.ts | T21 |
| src/player/controller.ts | T22 |
| src/player/interact.ts | T23 |
| src/ui/hud.ts | T31 |
| src/main.ts | T31(T51,T71,T91 串行阶段可改) |
| src/entities/{entity,drops}.ts | T43 |
| src/items/*.ts + data/items.json recipes.json | T44 |
| src/ui/{inventoryUI,craftUI}.ts | T45 |
| src/survival/stats.ts | T61 |
| src/survival/daycycle.ts + render/sky.ts | T62 |
| src/save/storage.ts | T63 |
| src/ui/statusUI.ts | T64 |
| src/entities/animals.ts | T81 |
| src/entities/monsters.ts | T82 |
| src/entities/spawner.ts + player/attack.ts | T83 |
| src/workers/*, src/render/particles.ts, src/audio/*, src/ui/menu.ts | T101/T102/T103/T104 |
