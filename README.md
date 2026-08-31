# 迷你世界 · Mini World

网页版 3D 体素沙盒游戏 —— 掘地建造 / 资源合成 / 熔炉冶炼 / 昼夜生存 / 狩猎战斗，**零外部素材**（纹理程序化生成、音效 WebAudio 实时合成）。

![tech](https://img.shields.io/badge/TypeScript-strict-blue) ![three](https://img.shields.io/badge/three.js-0.185-orange) ![tests](https://img.shields.io/badge/tests-467_pass-brightgreen) ![vite](https://img.shields.io/badge/Vite-7-purple)

## 快速开始

```bash
npm install
npm run dev        # 打开浏览器 http://localhost:5173
```

## 操作说明

| 输入 | 动作 |
|---|---|
| WASD | 移动 |
| 鼠标 | 视角（点击画面锁定指针） |
| 空格 | 跳跃 / 水中上浮 |
| Shift+W | 疾跑（消耗饥饿） |
| **左键单击** | 攻击生物（左右拳交替出拳，命中显示血条）/ 按住挖掘方块（裂纹+碎屑特效） |
| **右键** | 放置方块 / 吃食物 / 开工作台 / **开熔炉** / **按住拉弓蓄力、松开发射** |
| 1~9 | 切换热栏 |
| E | 背包 + 2×2 合成 + **护甲装备区** |
| **V** | 切换第一 / 第三人称（第三人称带走路摆臂动画，装扮可见） |
| **ESC** | 暂停菜单（继续 / 设置 / **扮 装** / 重新开始本世界 / 保存退出） |
| P | 手动保存 |

## 玩法循环

1. **徒手砍树** → 原木 → 合成木板 / 工作台 / **木剑**（8 格圆石合成**熔炉**）
2. **白天狩猎**：草原上成群的**猪 / 牛 / 羊**——击杀掉生肉（可食用）、牛皮（**皮革**）、羊毛（可放置方块）；动物受击会逃跑，血条实时显示
3. **熔炉冶炼**：粗铁 / 粗金 + 燃料（煤 80s / 木板 15s / 木棍 5s）烧成**铁锭 / 金锭**；生肉烧成熟肉（回复更多饥饿）
4. **铁器与弓箭**：铁剑（伤 9）/ 铁镐（挖金矿）/ 铁斧；木棍+木板做**弓**、铁锭+木棍做**箭**——按住右键蓄力，松手放箭（满蓄伤害 ×4.5，箭可捡回 60%）
5. **护甲防身**：皮革套装（猎牛产出）/ 铁质套装（熔炉产出），头盔+胸甲每点护甲减 4% 怪物伤害
6. **角色装扮**：暂停菜单 →「扮 装」——肤色 / 上衣 / 裤子 / 头发四色自定义 + 4 款预设皮肤，即改即存，第三人称实时可见
7. **生存**：饥饿归零掉血到 1；吃肉 / 苹果回复；满饥饿自动回血；夜晚刷怪（穿甲减少伤害）
8. **存档**：世界改动 / 背包 / 装备 / 熔炉进度每 10 秒自动保存（+ 退出时 + P 键），随时继续
9. 游泳、摔落伤害、卡方块自救、掉出世界自动送回、防把方块放进自己身体——都替你想好了

## 技术架构

```
体素引擎   Chunk 16×64×16 · Uint8Array · 逐面剔除网格化 + AO 顶点色
地形生成   simplex fbm 大陆/丘陵/山脊/温度噪声 · 三群系 · 矿脉 · 跨区块树
物理       分轴扫掠 AABB（玩家/生物/掉落物/箭矢共用求解器，子步防穿墙）
世界调度   流式加载（帧预算 ≤2 chunk/帧）· diff 记录 → localStorage 存档 v2
Worker     terragen+mesher 全量入 Web Worker（transferable 零拷贝 + 三重同步降级）
渲染       Three.js · 全局仅 2 材质 · 视距 6 chunks ≈113 区块 · 60fps
生物       物种数据表驱动（猪/牛/羊）· 三态 AI（闲逛/漫游/逃跑）· 成群刷新 · 倒地动画
熔炉       燃烧热值 + 烧炼进度（MC 语义）· 状态随存档持久化
投射物     弓蓄力曲线 → 箭实体（重力弹道 · 子步命中 · 插墙可捡回）
战斗       近战贴身锥形兜底 · 装备护甲减伤（每点 -4%，上限 20 点）
美术       启动时 canvas 程序化生成 66+ tile 图集 · 物品/掉落物真实图标 · 双臂第一人称视图
音效       WebAudio 六音效实时合成（挖/放/受伤/吃/拾取/点击），无素材文件
UI         全 DOM overlay：热栏/背包(装备区)/合成/熔炉/血条/蓄力条/昼夜钟/暂停菜单/装扮页/诊断 HUD
测试       vitest 467 用例，引擎层纯函数全覆盖
```

## 开发方式

本项目采用**多 Agent 波次化并发**开发：28 张任务卡分 11 个波次，波内多 Agent 并发（文件所有权互斥 + 契约先行），波末串行集成冒烟。详见 [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md)。

- 设计文档：[docs/architecture.md](docs/architecture.md)
- 接口契约：[docs/contracts/interfaces.md](docs/contracts/interfaces.md)
- 协作规则：[docs/contracts/conventions.md](docs/contracts/conventions.md)
- 任务卡：[docs/tasks/](docs/tasks/)

## 构建与测试

```bash
npm test        # vitest run，467 测试
npm run build   # tsc 类型检查 + vite 生产构建（含 worker chunk）
npm run preview # 预览生产构建
```
