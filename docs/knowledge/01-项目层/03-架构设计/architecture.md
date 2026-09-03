---
文档编号: DOC-PRJ-03-001
标题: 「迷你世界」架构设计文档
类型: 设计
状态: 现行
日期: 2026-09-01
作者: my-world 项目组
描述: 体素引擎全栈技术架构：chunk 与网格化、地形噪声、Worker 并行、区域系统、实体与存档管线的设计总览
标签: [架构, 体素引擎, three.js, 区域系统, 地形生成]
---

# 「迷你世界」架构设计文档

> 本文档是项目技术设计的唯一权威来源。所有任务卡引用本文档章节。
> 接口签名的冻结版在 [interfaces.md](../../02-技术层/05-接口文档/interfaces.md)。

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

## 6. 34 省级行政区扩展（W0-W7）

> 计划全文见 `~/.claude/plans/rippling-swimming-conway.md`；拆分契约见 [buildings.md](../../02-技术层/05-接口文档/buildings.md)。

总览：RegionId 7→35（generic + 34 省级行政区，东北拆三省）、StructureKind 7→50（43 个新 stamp）、新方块 10 个（id 37-46，全 `drop:null`）、选区像素图 34 色块（区域码 `'2'..'9'+'a'..'z'`）。植被复用 8 种 TreeKind、动物只用 9 物种改权重，**不含新美食/新物品**。

### 6.1 目录结构

```
src/data/regions/
  index.ts        # 全部类型 + seed 解析 + 活动区域状态 + REGIONS 聚合（14 组 spread 一次写全，W0 后冻结）
  parts/legacy.ts # generic + 旧 6 区（逐字冻结）
  parts/<组>.ts   # 14 组，各组导出自己的 RegionDef 组对象（Partial<Record<RegionId, RegionDef>>）
src/world/
  structures.ts   # 内核：锚点/校验/四张 Record 表（FOOTPRINT_R/SLOPE_TOLERANCE/KIND_SALT/FEATURE_BLOCK）/switch 分发（W0 后冻结）
  buildings/
    kit.ts        # 公共几何工具 10 个（W0 后冻结）
    classic.ts    # 旧 7 stamp 纯搬家（几何逐字节不变）
    <组>.ts ×14   # 43 个新 stamp 按地理分组
tests/regions/<组>.test.ts  # 每组一个测试文件（并发所有权单位）
tests/regionPicker.test.ts  # 像素图纯数据校验
```

### 6.2 种子兼容策略

- seed 前缀 `cn_<regionId>_<rand>` 与解析不变，34 个新 id 直接作为 `<regionId>` 段
- **legacy 冻结**：generic + 旧 6 区（含 dongbei）RegionDef 逐字保留 → 旧 seed/旧档地形与建筑逐位不变；dongbei「在表不在图」——定义保留（ICE 水面/spruce/盐值 0x77，structures.test 自动回归继续覆盖）但不给选区图码，从选区/随机自动消失
- **组覆盖增强**：旧 5 区（beijing/sichuan/yunnan/neimenggu/xinjiang）地形/植被/动物字段不动，仅 structures 表追加 1 个稀有标志 kind（cellDensity ~0.02）；新 kind 独立 KIND_SALT → 不扰动既有结构判定
- **anchorMargin 保锚点**：`MAX_STRUCT_RADIUS` 6→8 仅作 terragen 扫描边距，cell 内锚点边距改用 `anchorMargin(kind)=max(6, FOOTPRINT_R[kind])`，旧 kind 恒 6 → 旧世界建筑锚点逐位不变（机制详见 02-技术层/05-接口文档/buildings.md §5）
- 高度封顶 `topClamp(fy,h)=min(fy+h,62)`；现代高塔（24~30 格）所在沿海/城市区域地形压平（低 ridgeAmp）防削顶

### 6.3 区域-建筑映射全表

未列新 kind 的常见建筑一律复用既有 kind（青瓦/青砖/黄土/西北民居 → house；四合院 → siheyuan；雪乡木屋 → snow_cabin；蒙古包/绿洲农庄/傣族竹楼 → 同名旧 kind）。

直辖市（4）：

| id | 区 | 常见建筑 | 稀有标志建筑 | 波 |
|---|---|---|---|---|
| beijing | 北京 | 四合院（已有） | 天坛祈年殿 r6（圆形三重檐攒尖、蓝琉璃） | W1 |
| tianjin | 天津 | 五大道小洋楼 r4 | 天津之眼 r6（跨河摩天轮 Ø11） | W1 |
| shanghai | 上海 | 石库门 r4 | 东方明珠 r5（三球串联 ~26 格） | W4 |
| chongqing | 重庆 | 洪崖洞吊脚楼群 r7（依山多层） | 解放碑 r3 | W6 |

省（23）：

| id | 区 | 常见建筑 | 稀有标志建筑 | 波 |
|---|---|---|---|---|
| hebei | 河北 | 青砖民居 | 赵州桥 r7（敞肩石拱） | W1 |
| shanxi | 山西 | 四合院（复用） | 应县木塔 r5（八角五层木塔） | W2 |
| liaoning | 辽宁 | 雪乡木屋（复用） | 沈阳故宫大政殿 r5（八角重檐攒尖） | W1 |
| jilin | 吉林 | 雪乡木屋（复用） | 朝鲜族青瓦民居 r4 | W1 |
| heilongjiang | 黑龙江 | 雪乡木屋（复用） | 圣索菲亚教堂 r5（红砖墙+绿洋葱穹顶） | W1 |
| jiangsu | 江苏 | 青瓦民居 | 苏州园林 r7（亭+廊+月洞门+水池） | W4 |
| zhejiang | 浙江 | 青瓦民居 | 雷峰塔 r4（八面五层楼阁塔） | W4 |
| anhui | 安徽 | 徽派马头墙民居 r4（即标志） | — | W4 |
| fujian | 福建 | 圆形土楼 r7 Ø15（即标志） | — | W4 |
| jiangxi | 江西 | 青瓦民居 | 滕王阁 r5（多层绿琉璃歇山） | W4 |
| shandong | 山东 | 胶东海草房 r4 | 孔庙大成殿 r5（重檐歇山） | W2 |
| henan | 河南 | 青瓦民居 | 少林塔林 r7（一注多小方塔群） | W2 |
| hubei | 湖北 | 青瓦民居 | 黄鹤楼 r5（五层攒尖金飞檐） | W5 |
| hunan | 湖南 | 湘西吊脚楼 r4 | 岳阳楼 r4（三层盔顶） | W5 |
| guangdong | 广东 | 骑楼街 r5 | 广州塔 r4（细腰扭转 ~28 格） | W5 |
| hainan | 海南 | 湘西吊脚楼（复用） | 骑楼（复用广东） | W5 |
| guizhou | 贵州 | 湘西吊脚楼（复用） | 甲秀楼（水中石桥+三层三檐） | W6 |
| sichuan | 四川 | 川西民居（已有） | 乐山大佛 r7（依山坐佛） | W6 |
| yunnan | 云南 | 傣族竹楼（已有） | 崇圣寺三塔 r5（一主二辅密檐白塔） | W6 |
| shaanxi | 陕西 | 四合院（复用） | 大雁塔 r4（七层方形砖塔） | W2 |
| gansu | 甘肃 | 黄土民居 | 嘉峪关 r8（关城城楼+城墙延伸段） | W3 |
| qinghai | 青海 | 藏式碉房 r4 | 塔尔寺八宝塔群 r7（一排白塔） | W3 |
| taiwan | 台湾 | 闽南红砖古厝 r4 | 台北101 r3（竹节退台 ~28 格） | W5 |

自治区（5）+ 特区（2）：

| id | 区 | 常见建筑 | 稀有标志建筑 | 波 |
|---|---|---|---|---|
| neimenggu | 内蒙古 | 蒙古包（已有） | 敖包 r3（石堆圆台+旗杆） | W2 |
| guangxi | 广西 | 干栏式木楼 r4 | 程阳风雨桥 r8（石墩+木廊+桥头亭） | W5 |
| xizang | 西藏 | 藏式碉房 r4（与青海共用） | 布达拉宫 r8（依山白宫+红宫+金顶，宽 ~16 格） | W3 |
| ningxia | 宁夏 | 西北民居 | 108塔群 r7（阶梯三角排列白塔） | W2 |
| xinjiang | 新疆 | 绿洲农庄（已有） | 苏公塔 r3（圆柱土黄砖塔+锥顶） | W3 |
| hongkong | 香港 | 高层住宅楼 r4（幕墙玻璃） | 中银大厦 r4（三棱退台玻璃塔） | W6 |
| aomen | 澳门 | 葡式粉彩小楼 r4 | 大三巴牌坊 r5（巴洛克石立面+阶梯） | W6 |

波次执行：W0 契约先行 → W1 东北京津冀 → W2 黄河蒙宁 → W3 西域高原 → W4 华东 → W5 中南 → W6 西南港澳 → W7 终验（任务卡见 `docs/knowledge/03-资产层/02-技术方案/w0-contract.md` ~ `w7-final.md`）。
