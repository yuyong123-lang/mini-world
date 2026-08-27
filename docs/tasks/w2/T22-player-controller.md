# T22 第一人称玩家控制器

波次: W2（3 并发）| 前置: W1 完成（collide 可用）

## 目标
Pointer Lock 视角 + WASD 移动 + 跳跃疾跑的完整手感。

## 独占文件
- src/player/controller.ts
- tests/controller.test.ts（逻辑部分：不依赖 DOM 的速度合成/朝向计算）

## 契约引用
- interfaces.md §12 PlayerController 签名照抄；常量 GRAVITY/JUMP_SPEED/WALK_SPEED/SPRINT_SPEED 从 constants 取

## 交付物
1. bind(domRoot)：
   - click → requestPointerLock；mousemove 累积 yaw/pitch（灵敏度 0.0022 rad/px），pitch 夹 ±89°
   - keydown/up 记录 WASD/空格/Shift(疾跑)；E 键发事件由集成接背包
   - ESC 后自动解锁是浏览器行为，恢复由 HUD 提示层处理
2. tick(dt, world)：
   - 水平期望速度由输入向量（相机 yaw 平面投影归一化）× 当前速度档
   - vel.y += GRAVITY*dt；jump 仅 onGround 时 JUMP_SPEED
   - 调 moveWithCollisions(this, dt, world)；冲刺判定 = Shift 且前进且 hunger>0（数值逻辑 W6 接，本卡先留 hook）
3. respawn()：pos=spawnPoint，vel 清零，hp/hunger 满
4. eyePosition()：pos + (0, 1.62, 0)；lookDir(out)：yaw/pitch → 单位向量（注意 three 坐标系 z 向观察者，约定 -z 为初始视线方向）
5. PhysicsBody 接口满足：pos 脚底中心 / width 0.6 / height 1.8

## 验收标准
- lookDir 在 yaw=0,pitch=0 时为 (0,0,-1)；yaw=π/2 时 (-1,0,0) 或按统一约定并在注释声明
- 输入合成单测：仅 W 时速度沿前方；W+D 归一化不超最大速度
- tsc --noEmit 零错误

## 自测命令
`npx vitest run tests/controller.test.ts`
