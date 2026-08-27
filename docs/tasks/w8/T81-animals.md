# T81 动物 AI（猪/羊）

波次: W8（3 并发）| 前置: W7 完成

## 目标
被动生物：漫游/逃跑/被杀掉肉。

## 独占程序文件
- src/entities/animals.ts
- tests/animals.test.ts

## 契约引用
- interfaces.md §12 Entity/Mob/EntityCtx；掉落物由 ctx.spawnDrop

## 设计
1. Animal extends Entity（直接继承 entity.ts 的基类，勿新建中间类）：width 0.7 height 0.9，hp 10
2. 视觉：本卡只做逻辑；view 挂钩同 DropEntity 模式（attachView）——main/W9 用两个 box 组合搭个猪羊形状即可（W9 打磨外观）
3. 状态机 idle(1~3s 站立) ↔ wander(随机水平方向走 2~4s, 速度 1.2) ↔ flee(受击后 fleeTimer=3s, 速度 3 远离玩家)
   - tick 顺序：状态计时器 → 设定期望 vel.x/z → 重力 → moveWithCollisions(this, dt, world)
   - 跳障：前方脚位 solid 且头位非 solid 且 onGround → vel.y = JUMP_SPEED×0.9
   - 卡死检测：每 0.8s 位移 <0.05 → 强制换向
4. hurt(amount, from) 已有基类击退；Animal.hurt 额外触发 flee 状态
5. die()：ctx.spawnDrop(pos, {key:'ITEM_RAW_PORK', count: 1+(hash<0.5?1:0)}) + dead=true；发 'mobKilled'
6. 单测（mock world.isSolid 平地）：状态转移定时正确；flee 方向远离玩家；死亡掉落调用

## 验收标准 / 自测命令
`tsc --noEmit` + `npx vitest run tests/animals.test.ts`
