---
文档编号: DOC-AST-02-023
标题: T43 实体基类与掉落物
类型: 方案
状态: 现行
日期: 2026-08-27
作者: my-world 项目组
描述: T43 实体基类与掉落物——W4 波次任务卡：目标、独占文件、交付物与验收标准
标签: [任务卡, W4, 多Agent]
---

# T43 实体基类与掉落物

波次: W4（5 并发）| 前置: W3 完成

## 目标
实体基类 + 掉落物实体（旋转小方块 + 磁吸拾取）。

## 独占文件
- src/entities/entity.ts
- src/entities/drops.ts
- tests/drops.test.ts

## 奥约引用
- 02-技术层/05-接口文档/interfaces.md §12 Entity/EntityCtx/DropEntity 签名照抄

## 交付物
1. Entity 抽象类：pos/vel/aabb 派生 /hp/dead/onGround；hurt(amount, from?) 实现：击退冲量（从 from 反向水平 ×6 + 向上 4）、0.5s 受击无敌帧（this.invulUntil 时间戳比较）
2. EntityCtx 接口含：world / player / spawnDrop(pos, stack) / removeEntity(e) / isNight() 等——本卡只定义接口形状，具体实现在集成波接线
3. DropEntity：
   - 视觉：0.25 尺寸小方块旋转 + 上下浮动（three mesh 句柄挂 this.mesh 占位 any 类型，但构建函数独立成 createDropMesh(atlasTexture)，不 hardcode 材质）——或者实体侧不管视觉，仅发事件由 render 侧注册视图工厂。**选择后者**：DropEntity 只做物理与拾取逻辑，视觉由 main/render 挂钩：Entity 增加 attachView(view:{mesh})/detachView() 通用挂钩
   - 物理：重力 + moveWithCollisions 落地弹跳衰减 0.4
   - 距玩家 <1.5 开始磁吸（朝玩家加速），<0.6 发 onPickup(cb) 回调请求并入包（成功才 dead=true）；落地 5 分钟自动 despawn；寿命尾部闪烁提示（事件发给 view 层）
   - 附带 merge：同 key 距离 <0.5 合堆
4. drops.test.ts：磁吸距离触发、拾取回调时机、合堆计数正确、despawn 计时

## 验收标准 / 自测命令
`tsc --noEmit` + `npx vitest run tests/drops.test.ts`
