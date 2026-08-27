# T23 DDA 射线选块与挖放交互

波次: W2（3 并发）| 前置: W1 完成（world.raycast 由本卡实现于 interact.ts 内部？——否，raycast 在 World 上由 T42 提供。本卡消费契约 BlockHit 结构自行实现 DDA 步进函数，导出供 World 使用亦可）

## 目标
准星选中方块 + 高亮线框 + 左键挖掘进度条 + 右键放置校验。

## 独占文件
- src/player/interact.ts
- tests/raycast.test.ts（DDA 步进函数单测）

## 契约引用
- interfaces.md §12 Interactor 签名、§1 BlockHit 结构；REACH=5

## 设计约定（重要）
- 本卡导出纯函数 `ddaRaycast(getBlock:(x,y,z)=>number, origin:Vec3, dir:Vec3, maxDist:number): BlockHit`（Amanatides & Woo 体素步进）。World.raycast（T42）内部委托此函数——避免两处实现漂移
- AIR 与 WATER 不可被选中命中（穿透）；命中返回 pos 与 prev（放置位）

## 交付物
1. ddaRaycast 纯函数（含 origin 恰在方块边界/inside a block 的边界情形）
2. Interactor 类：
   - 每帧用 camera 位置+朝向做 raycast → 更新高亮盒（LineSegments EdgesGeometry 黑色半透明）位置或隐藏
   - mousedown left 开始挖掘：progress += dt × toolSpeedMul / hardness；切目标重置；progress≥1 → 发 onBreak 回调
   - hardness/tool 匹配按 BlockDef（§2）：工具类型不符 speedMul=1；minTier 不满足仍可挖但不掉落（掉落过滤在 T51 接线处，本卡通过 onBreak(pos,id) 暴露原始事件即可）
   - mousedown right → onPlace(prev 位)；放置前校验 prev 位当前为 AIR 且不与任何实体 AABB 相交（实体列表经构造注入的可选 provider）
   - 对 CRAFT_TABLE 右键 → onUseCraftTable 优先于放置
   - 裂纹视觉：M2 简化为高亮盒颜色随 progress 加深（tile 23..32 裂纹贴图留 W10 打磨）
3. update(heldItem, dt, targetEl)：入口由主循环调

## 验收标准
- DDA 单测：直线穿越多块命中正确块；斜线命中面法线正确；maxDist 外不命中；origin 在 solid 内立即返回该块
- tsc --noEmit 零错误

## 自测命令
`npx vitest run tests/raycast.test.ts`
