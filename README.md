# 迷你世界 · Mini World

网页版 3D 体素沙盒游戏 —— 掘地建造 / 资源合成 / 昼夜生存 / 生物战斗，**零外部素材**（纹理程序化生成、音效 WebAudio 实时合成）。

![tech](https://img.shields.io/badge/TypeScript-strict-blue) ![three](https://img.shields.io/badge/three.js-0.185-orange) ![tests](https://img.shields.io/badge/tests-411_pass-brightgreen) ![vite](https://img.shields.io/badge/Vite-7-purple)

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
| **左键按住** | 挖掘方块（裂纹+碎屑特效）/ 攻击生物 |
| **右键** | 放置方块 / 吃食物 / 开工作台 |
| 1~9 | 切换热栏 |
| E | 背包 + 2×2 合成 |
| **V** | 切换第一 / 第三人称（第三人称带走路摆臂动画） |
| **ESC** | 暂停菜单（继续 / 设置 / 重新开始本世界 / 保存退出） |
| P | 手动保存 |

## 玩法循环

1. **徒手砍树** → 原木 → 合成木板 / 工作台
2. **木镐** → 采石 → 石镐石剑 → 挖矿（煤 / 铁 / 金）
3. **生存**：饥饿归零掉血到 1；吃苹果（树叶掉落）/ 猪肉（打猎）回复；满饥饿自动回血
4. **昼夜**：白天 8 分钟刷动物、夜晚 4 分钟刷怪——造个庇护所或者拿起剑
5. **存档**：世界改动 / 背包 / 时间每 10 秒自动保存（+ 退出时 + P 键），随时继续
6. 游泳、摔落伤害、卡方块自救、防把方块放进自己身体——都替你想好了

## 技术架构

```
体素引擎   Chunk 16×64×16 · Uint8Array · 逐面剔除网格化 + AO 顶点色
地形生成   simplex fbm 大陆/丘陵/山脊/温度噪声 · 三群系 · 矿脉 · 跨区块树
物理       分轴扫掠 AABB（玩家/生物/掉落物共用求解器，子步防穿墙）
世界调度   流式加载（帧预算 ≤2 chunk/帧）· diff 记录 → localStorage 存档
Worker     terragen+mesher 全量入 Web Worker（transferable 零拷贝 + 三重同步降级）
渲染       Three.js · 全局仅 2 材质 · 视距 6 chunks ≈113 区块 · 60fps
美术       启动时 canvas 程序化生成 34+ tile 图集，NearestFilter 像素风
音效       WebAudio 六音效实时合成（挖/放/受伤/吃/拾取/点击），无素材文件
UI         全 DOM overlay：热栏/背包/合成/血条/昼夜钟/暂停菜单/错误浮层/诊断 HUD
测试       vitest 411 用例，引擎层纯函数全覆盖
```

## 开发方式

本项目采用**多 Agent 波次化并发**开发：28 张任务卡分 11 个波次，波内多 Agent 并发（文件所有权互斥 + 契约先行），波末串行集成冒烟。详见 [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md)。

- 设计文档：[docs/architecture.md](docs/architecture.md)
- 接口契约：[docs/contracts/interfaces.md](docs/contracts/interfaces.md)
- 协作规则：[docs/contracts/conventions.md](docs/contracts/conventions.md)
- 任务卡：[docs/tasks/](docs/tasks/)

## 构建与测试

```bash
npm test        # vitest run，411 测试
npm run build   # tsc 类型检查 + vite 生产构建（含 worker chunk）
npm run preview # 预览生产构建
```
