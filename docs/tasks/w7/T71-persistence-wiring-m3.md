# T71 M3 集成：生存循环与持久化接线

波次: W7（串行，主线程）| 前置: W6 全部完成

## 目标
StatsSystem/SkySystem/存档 全部接入主循环，死亡重生闭环，浏览器实测 M3。

## 允许修改
- src/main.ts（装配扩展）、src/player/controller.ts 小修（暴露跳跃 hook / hp 字段一致性）、src/survival/* 接线适配小调

## 步骤
1. main 循环接入：daycycle.tick(dt) → sky.update(dt) → stats.tick(dt)（顺序固定，sky 需 sunAngle 决定平行光方向）
2. stats 的 death 事件 → player.respawn() + toast「你死了」+ 血量重绘；死亡不丢背包
3. 吃东西：右键手持食物 → stats.eat(food.hunger)，consumeHeld(1)，sfx 'eat'（W10 音效先空），帧率友好（按住右键节流 0.5s）
4. 存档接线：
   - 启动时 hasSave() → 弹「继续游戏(读档)/新世界」两按钮遮罩（简单 DOM 即可，W10 才升级成完整菜单）——「新世界」clearSave + 随机 seed
   - 读档路径：seed/时间/玩家状态/diffs 先行 initTerrain(seed)，inv 恢复到 Inventory
   - 每 10s startAutosave + beforeunload saveGame
   - 手动保存按钮放 HUD 角落（P 键亦可）
5. M3 实测清单：
   - [ ] 挖几个方块、拿几样物品、推进到下午 → F5 → 继续：地形改动/背包/时刻/位置精确恢复
   - [ ] 从高塔跳下扣血；饥饿跑空后 HP 缓慢降至 1 不死；吃苹果回饥饿且≥18 开始回血
   - [ ] 一整夜挂机 isNight 翻转正确、天亮自动转白天

## 完成动作
git commit -m "feat(M3): survival loop + persistence"
