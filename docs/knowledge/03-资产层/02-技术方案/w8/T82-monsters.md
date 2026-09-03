---
文档编号: DOC-AST-02-034
标题: T82 怪物 AI
类型: 方案
状态: 现行
日期: 2026-08-27
作者: my-world 项目组
描述: T82 怪物 AI——W8 波次任务卡：目标、独占文件、交付物与验收标准
标签: [任务卡, W8, 多Agent]
---

# T82 怪物 AI

波次: W8（3 并发）| 前置: W7 完成

## 目标
敌对生物：夜间刷新的近战追击者。

## 独占文件
- src/entities/monsters.ts
- tests/monsters.test.ts

## 契约引用
- 02-技术层/05-接口文档/interfaces.md §12；怪物伤害 3/次 冷却 1s（architecture §2.8）

## 设计
1. Monster extends Entity：width 0.6 height 1.8，hp 12，移动速度 3.2
2. 状态机 idle ↔ chase(视距 24m 内) ↔ attack(dist<1.5 且冷却≤0)
   - chase: 朝玩家水平方向期望速度 + 跳障（同动物规则）+ 0.8s 粘滞检测重定向（绕行偏移 ±60° 随机 1~2s）
   - attack: 冷却 1s，命中判定 dist<1.5 时 ctx.player.hurt? → 通过 bus emit 'damage' 或直接调用注入的 attackPlayer 回调（EntityCtx 增加 playerAttackHook）；受击方无敌帧由 PlayerController 侧处理——本卡只负责发起
   - 白天：isNight false 时静止缓慢消失（天亮淡出 despawn）——简化为 isNight==false 直接标记 dead（视为消散），不做着火特效
3. hurt 反馈同基类击退；die() 掉落 ITEM_COAL 30%？（不必）——最小实现无掉落或掉 GLOWBLOCK 10%，写死在代码注释里允许后续调整
4. 单测（mock 平地 + 假 player）：chase 进入条件、攻击冷却间隔正确、白天 despawn、粘滞重定向后仍在移动

## 验收标准 / 自测命令
`tsc --noEmit` + `npx vitest run tests/monsters.test.ts`
