---
文档编号: DOC-AST-02-028
标题: T61 生存数值系统
类型: 方案
状态: 现行
日期: 2026-08-27
作者: my-world 项目组
描述: T61 生存数值系统——W6 波次任务卡：目标、独占文件、交付物与验收标准
标签: [任务卡, W6, 多Agent]
---

# T61 生存数值系统

波次: W6（4 并发）| 前置: W5 完成
> 数值以 01-项目层/03-架构设计/architecture.md §2.8 表格为准，禁止自创数值。

## 目标
HP/饥饿/摔落伤/再生/饿伤全数值系统。

## 独占文件
- src/survival/stats.ts
- tests/stats.test.ts

## 契约引用
- events 键 hp/hunger/death 见 02-技术层/05-接口文档/interfaces.md §11 GameEvents
- PlayerController 已有 hp/hunger 字段与 respawn()（T22），StatsSystem 作为**外部调节器**写入它们

## 交付物
1. StatsSystem(player, bus)：
   - tick(dt)：饥饿消耗按行为累计——行走 0.01/s、疾跑 0.08/s、跳跃 0.05/次；跳跃计数需 player 暴露 hook（如 player.onJump(cb)），若接口缺失用 FIXME 标记并按疾跑时长近似
   - 再生：hunger≥18 每 3s 回 1HP 耗 0.5 饥饿；饿伤：hunger≤0 每 4s 扣 1HP 至最低 1
   - 摔落伤：检测落地瞬间由落地速度反推落差 (v²/(2g))，>3 格部分每格 1 点伤害
   - bus.emit hp/hunger 变化；hp<=0 → death 事件一次
2. eat(hungerValue)：外部调用入口（集成波接右键食物）
3. 单测：阈值边界（17/18 分界、饥饿 0 扣血下限到 1）、再生周期计时不漂移（固定 dt 步进模拟）

## 验收标准 / 自测命令
`tsc --noEmit` + `npx vitest run tests/stats.test.ts`
