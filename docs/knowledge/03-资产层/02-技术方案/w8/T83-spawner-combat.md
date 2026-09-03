---
文档编号: DOC-AST-02-035
标题: T83 刷怪器与玩家攻击
类型: 方案
状态: 现行
日期: 2026-08-27
作者: my-world 项目组
描述: T83 刷怪器与玩家攻击——W8 波次任务卡：目标、独占文件、交付物与验收标准
标签: [任务卡, W8, 多Agent]
---

# T83 刷怪器与玩家攻击

波次: W8（3 并发）| 前置: W7 完成

## 独占文件
- src/entities/spawner.ts
- src/player/attack.ts
- tests/spawner.test.ts / tests/attack.test.ts

## 契约引用
- 02-技术层/05-接口文档/interfaces.md §12 Spawner/tryAttack 签名照抄；上限怪 12 / 动物 20（architecture §2.6）

## 交付物
1. Spawner(world)：
   - tick(dt, playerPos, isNight, counts)：尝试出生检查每 ≥0.5s 一次
   - 动物：仅白天；在玩家 16~32m 环带随机找地表点（surfaceHeight+2），检查该点方块 GRASS 才刷；上限 20 未满才发 onSpawnAnimal
   - 怪物：仅夜间；24~40m 环带随机点、地面方可站立（脚位与头位非 solid 且脚下 solid）；上限 12 未满才发 onSpawnMonster
   - despawn 辅助：>48m 实体标记 dead 由集成侧清理
2. tryAttack(player, dir, targets, heldTool, emitters)：
   - 从 eyePosition 沿 dir 探测最近实体：线段-AABB 相交测试，最大 3 格
   - 命中 → e.hurt(damage[拳1/木剑5/石剑7], player.pos)；emitters.onMobHurt 回调
   - 攻击冷却 0.5s 在调用侧(main)控制，本函数无状态
3. 单测：环带采样合法性（距离范围/地面可站）、上限拦截、线段命中最近实体优先

## 验收标准 / 自测命令
`tsc --noEmit` + `npx vitest run tests/spawner.test.ts tests/attack.test.ts`
