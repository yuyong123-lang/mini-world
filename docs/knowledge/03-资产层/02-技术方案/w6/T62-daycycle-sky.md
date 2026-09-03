---
文档编号: DOC-AST-02-029
标题: T62 昼夜循环与天空
类型: 方案
状态: 现行
日期: 2026-08-27
作者: my-world 项目组
描述: T62 昼夜循环与天空——W6 波次任务卡：目标、独占文件、交付物与验收标准
标签: [任务卡, W6, 多Agent]
---

# T62 昼夜循环与天空

波次: W6（4 并发）| 前置: W5 完成

## 目标
480s+240s 循环、天空色插值、太阳月亮贴片、光照联动。

## 独占文件
- src/survival/daycycle.ts
- src/render/sky.ts
- tests/daycycle.test.ts（DayCycle 类逻辑单测，sky 冒烟）

## 契约引用
- 02-技术层/05-接口文档/interfaces.md §11 DayCycle 签名照抄 + DAY_LENGTH/NIGHT_LENGTH 常量

## 交付物
1. DayCycle.tick(dt)：timeOfDay 循环推进；isNight = timeOfDay >= DAY_LENGTH；fraction 为全周期进度
2. skyColors()：按 fraction 三点插值关键帧色值（黎明橙粉、正午亮蓝、黄昏橙红、深夜暗蓝黑；fog 色随天空底色）
3. render/sky.ts：SkySystem(rendererRef, daycycle)
   - scene.background Color 设置、scene.fog color/near/far 更新（FOG_NEAR/FAR 常量联动）
   - 太阳/月亮：atlas tile 20/21 为贴图的两个 PlaneMesh（MeshBasicMaterial fog:false），绕玩家沿太阳角度轨道旋转
   - 联动 renderer.setSunLight(direction, intensity)：白天强度 0.9、夜间 0.12，方向随 sunAngle 旋转
   - 每帧更新入口 sky.update(dt)，由 main 在 daycycle.tick 后调用
4. emit 'dayTick' 事件（夜幕降临/破晓各一次，供 spawner 和 HUD 时钟使用）

## 风险红线
- 不做任何光照传播/阴影贴图，仅有平行光+环境光全局变化

## 验收标准
一整昼夜 tick 模拟测试：白天→黑夜切换 isNight 正确翻转；skyColors 单调连续（相邻秒色差 < 阈值）

## 自测命令
`npx vitest run tests/daycycle.test.ts`
