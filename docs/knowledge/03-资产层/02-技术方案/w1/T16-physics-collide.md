---
文档编号: DOC-AST-02-016
标题: T16 AABB 分轴碰撞
类型: 方案
状态: 现行
日期: 2026-08-27
作者: my-world 项目组
描述: T16 AABB 分轴碰撞——W1 波次任务卡：目标、独占文件、交付物与验收标准
标签: [任务卡, W1, 多Agent]
---

# T16 AABB 分轴碰撞

波次: W1（6 并发）| 前置: world.isSolid 接口存在即可（契约编程）

## 目标
把玩家/动物/怪物/掉落物共用的碰撞求解器做扎实，杜绝穿墙。

## 独占文件
- src/physics/collide.ts
- tests/collide.test.ts

## 契约引用
- 02-技术层/05-接口文档/interfaces.md §10（PhysicsBody/moveWithCollisions 签名照抄；pos = 脚底中心锚点）

## 交付物
1. 分轴扫掠 X→Z→Y：每轴「试探移动 → 与新位置 AABB 覆盖的体素求交 → 若相交回退到贴合位置并清零该轴速度」
2. onGround 仅在 Y 轴向下碰撞时 true（其余轴处理前先置 false）
3. 用确定式的逐体素扫描：候选覆盖集合 = AABB 扫过区域覆盖的所有体素，不依赖 epsilon 夹逼
4. 需要处理 dt 大时穿墙：内部将单帧位移拆分为 ≤0.5 格的子步

> 替代方案告知：若扫描式太复杂可用纯分轴加小 epsilon(0.001)，但测试必须证明高速下不穿墙

## 验收标准
- 方块网格中自由落体落到地面：onGround=true 且脚底 y == 整数面 +0（无穿透/悬空）
- 向墙走：X 被截停，Z/Y 不受影响
- 高速斜冲墙角：三轴依次处理顺序下不产生穿插
- 天花板跳跃撞击：vel.y 清零回落

## 自测命令
`npx vitest run tests/collide.test.ts`
