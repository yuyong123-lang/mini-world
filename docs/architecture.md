# 「迷你世界」架构设计文档

> 本文档是项目技术设计的唯一权威来源。所有任务卡引用本文档章节。
> 接口签名的冻结版在 [contracts/interfaces.md](contracts/interfaces.md)。

## 1. 技术栈

| 项 | 选择 | 版本 |
|---|---|---|
| 构建 | Vite (vanilla-ts template) | 7.x |
| 语言 | TypeScript strict, target ES2022, moduleResolution bundler | 5.x |
| 渲染 | three | 0.185.x |
| 噪声 | simplex-noise（`createNoise2D(rng)` API） | 4.0.x |
| 测试 | vitest | 3.x |
| UI | 纯 DOM overlay（不用 canvas 画 UI） | - |
| 存档 | localStorage（diff-only） | - |

npm 源：`https://registry.npmmirror.com`

## 2. 核心数据结构

### 2.1 Chunk
- 尺寸：**16(X) × 64(Y) × 16(Z)**，整列式单 chunk，不做 Y 向分片
- 存储：`Uint8Array(16384)`，方块 id 上限 255
- 索引：`(x,y,z) => x | (z << 4) | (y << 8)`，y 是高 8 位
- 常量：`CHUNK_W=16, WORLD_H=64, SEA_LEVEL=28`
- 坐标系：世界坐标 y 向上；chunk 坐标 `cx = floor(x/16), cz = floor(z/16)`；chunk 内坐标 `lx = x - cx*16`（0~15，负数要用 `((x%16)+16)%16` 处理）

### 2.2 方块注册表
- 方块 id = 数字（体素数组用），物品 key = 字符串（背包/合成用），两个 id 空间**分离**
- `BlockDef` 定义见契约 §2；GRASS 挖掉掉 DIRT 物品这类映射写在 `BlockDef.drop`
- 约 19 种方块（全表见契约 §3）

### 2.3 网格化（mesher）
- **逐面剔除（culled faces）**，不做贪婪网格化——AO 顶点色使相邻面亮度不同无法合并
- 每 chunk 输出 opaque mesh + water mesh（半透明），全游戏仅 2 个材质实例
- 顶点色 = `faceShade × aoLevel`：
  - faceShade：顶 1.0 / 南北(z向) 0.8 / 东西(x向) 0.65 / 底 0.5
  - AO 经典 0 顶点法：每顶点查 side1/side2/corner 三邻居 → level ∈ {0,1,2,3} → 亮度 `[0.45, 0.65, 0.82, 1.0]`
  - 按 AO 值翻转四边形对角线防各向异性伪影
- mesher/terragen 必须是**纯函数**：输入输出只有 TypedArray 与数字，不 import three → W10 迁 Worker 零改动

### 2.4 地形生成（terragen）
```
WORLD_H=64, SEA_LEVEL=28
cont   = fbm2(x,z, freq 0.004, octaves 4)      // 大陆起伏
hills  = fbm2(x,z, freq 0.02,  octaves 3)      // 中频细节
ridge  = 1 - |noise2(x*0.01, z*0.01)|          // 山脊 [0,1]
mask   = smoothstep(0.25, 0.65, cont)          // 山只长在内陆
h      = SEA+4 + cont*6 + hills*3 + ridge^1.6 * mask * 26

温度 t = fbm2(另一偏移种子, freq 0.0015)
t > 0.55 且 h > SEA+1 → 沙漠（沙表层无树）
t < -0.55 或 h > 52   → 雪顶
否则                   → 草地

柱状分层: BEDROCK@y0 → STONE(含矿脉) → DIRT/SAND×3 → 表层 GRASS/SAND/SNOW
         若 h < SEA: (h, SEA] 填 WATER
矿石(hash 阈值): 煤 y∈[8,48] / 铁 y∈[4,32] / 金 y∈[2,16]
树: 草地表列坐标 hash p≈1/110，树干高4-6 + 半径2叶球，确定性生成
跨 chunk 树叶: 通过「覆盖层 diff」机制先于玩家 diff 应用
```
M1 只需简单高度地形（单层噪声 + 固定 chunk 半径）；完整版在 W4 升级，签名不变。

### 2.5 物理（physics/collide.ts）
- AABB 分轴扫掠：每帧 X→Z→Y 三轴依次积分位移，与体素网格求交后回退并清零该轴速度
- `moveWithCollisions(body, dt)` 是唯一碰撞入口：玩家、动物、怪物、掉落物全部调用它
- onGround 判定：Y 轴向下回退发生时置 true
- 玩家盒 0.6×1.8×0.6，眼高 1.62；重力 −24 m/s²，跳跃初速 8.4

### 2.6 实体系统
- 轻量类继承（非 ECS）：`Entity`(pos/vel/aabb/hp/dead) ← `Mob`(物理+AI tick) ← `Animal`/`Monster`；`DropEntity` 独立
- AI 不做 A*：直线转向 + 撞障碍自动跳（脚部阻挡且头部有空间）+ 每 0.8s 粘滞检测（位移低于阈值→随机重定向 1-2s）
- 动物状态机 idle↔wander↔flee(受击3s)；怪物 idle↔chase(视距24且夜间)↔attack(1.5格, 冷却1s)
- 上限：怪 12 / 动物 20 / 掉落物 50；>48m 强制 despawn

### 2.7 物品 / 合成
- `ItemStack { key: string, count: number }`；背包 = 9 热栏 + 27 主格，`(ItemStack|null)[]`
- 合成：随身 2×2 + 工作台右键打开 3×3；有序配方归一化裁剪空行空列后比对，无序按多重集比对
- 配方链路（必须全通）：原木→4木板→工作台→木棍(2木板竖排)→木镐→采石→石镐石剑
- 数据驱动：`src/data/{blocks,items,recipes}.json` 启动加载过类型守卫

### 2.8 生存数值（冻结）

| 项 | 值 |
|---|---|
| HP | 20（10 心）；摔落 >3 格时 (落差−3) 点伤害 |
| 饥饿 | 20；行走 0.01/s、疾跑 0.08/s、跳跃 0.05/次 |
| 再生 | 饥饿 ≥18 时每 3s 回 1HP，耗 0.5 饥饿 |
| 饿伤 | 饥饿=0 时每 4s 扣 1HP 至最低 1（不饿死） |
| 昼夜 | 白天 480s + 夜晚 240s 循环；太阳角度线性映射天空色三点插值 |
| 怪物伤害 | 3 点/次，冷却 1s |
| 武器伤害 | 拳 1 / 木剑 5 / 石剑 7；击退冲量 + 0.5s 受击无敌帧 |
| 死亡 | 回出生点满状态重生，背包保留 |

食物：生肉 +3 饥饿（杀动物掉落）、苹果 +2（树叶小概率掉落）。

### 2.9 存档 schema（冻结）
```ts
interface SaveGame {
  v: 1;
  seed: string;
  time: number;                                    // 世界时间秒
  player: { p: [number,number,number]; yaw: number; pitch: number; hp: number; hunger: number };
  inv: ([string, number] | null)[];                // 36 格
  diffs: Record<string, Record<number, number>>;   // "cx,cz" → { 体素index: blockId }
}
```
- 写入时机：每 10s 自动 + beforeunload + 手动保存按钮
- 读档管线：`terragen(chunkData) → apply(diffs["cx,cz"])`，与玩家改动天然同一通道

### 2.10 性能预算（60fps 目标）
- 视距渲染半径 6 chunks（加载半径 7 / 卸载半径 9），≈113 可见 chunk
- draw calls ≈200~250；每帧生成 ≤2 chunk 数据、重建 ≤1 chunk 网格，队列按离玩家距离排序
- pixelRatio 钳 1.5；雾近 78 远 92（与卸载半径绑定，同配置项联动）
- 粒子 ≤200 对象池；挖掘交互距离 5 格

## 3. 美术：全程序化零外部文件

- 启动时离屏 canvas 绘制 **256×256 图集**（16×16 tile 格、每 tile 16px），tile 索引表见契约 §4
- 每材质一个纯函数绘制器：草顶绿底噪点抖动 / 草侧泥土纹+顶部绿锯齿条 / 石头低频斑块 / 圆石 blob 圈线 / 原木侧竖条纹 / 木板横板缝 / 叶子绿噪+透明孔(alphaTest) / 水半透明蓝微波 / 矿石叠彩色簇 等
- Three 设置：`NearestFilter`、关 mipmap、半 texel UV inset 防渗色
- 天空：背景色随昼夜插值 + 太阳/月亮 canvas 小贴片；GLOWBLOCK 自发光贴图近似照明（明确不做 flood-fill 光照引擎、不做水流模拟）

## 4. UI 设计
- HUD DOM overlay：十字准星(css 居中十字)、热栏(9格)、血条心形、饥饿腿形、时间指示
- 打开背包/E：退出 pointer lock、显示 grid 格子、点击拖拽移动物品、hover tooltip
- 主菜单(W10)：新世界(随机 seed)/继续(读档)/设置(视距、灵敏度)

## 5. 风险与规避
1. mesh 卡顿 → mesher M1 就纯函数化 + 帧预算队列（Worker 只是 W10 的优化）
2. atlas 渗色 → NearestFilter + 半 texel UV inset
3. 光照/流体超支 → 明确砍掉 flood-fill 光照与水流模拟
4. 怪物穿墙 → 强制共用 collide.ts 求解器
5. localStorage 写爆 → diff-only 几 KB~几十 KB；try/catch QuotaExceeded 提示；留 IndexedDB 升级口
6. Pointer Lock 怪癖 → 点击手势触发进入；ESC 后显式「继续游戏」按钮恢复
