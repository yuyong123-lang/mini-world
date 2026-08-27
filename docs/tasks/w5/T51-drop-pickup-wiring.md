# T51 M2 集成：掉落拾取接线

波次: W5（串行，主线程）| 复置: W4 全部完成

## 目实现
打通 破坏方块→DropEntity→磁吸拾取→入包→UI 刷新 数据链路。

## 允许修改
- src/main.ts（装配扩展）、src/player/interact.ts 若需小调（onBreak 时含 minTier 过滤判定此处接线）
- src/entities/drops.ts 小修（如回调形状对不上时的小适配）

## 步骤
1. interact.onBreak 接线：
   - minTier 不满足 → 方块消失但不掉落（提示 toast "需要更好的镐子"当 tool==pickaxe 类）
   - 计算掉落：BlockDef.drop 缺省→自身对应物品；drop:null→无；LEAVES 用 hash 随机 20% ITEM_APPLE
   - spawn DropEntity(pos中心, stack)，main 维护 entityList
2. entityList tick 循环接入主循环（world.tick 后）；DropEntity 的 EntityCtx 实现在此接线
3. DropEntity onPickup → inventory.add；成功后 emit 'invChanged'/'pickup' → HUD toast “+N 木头”
4. 视觉挂钩 attachView/createDropMesh(atlasTexture) 在 main 完成（0.25 尺寸小方块 uv 取 BlockDef.side tile）
5. 热栏从「无限方块模式」切换为真实 Inventory 驱动；数字键选中的 hand 用于 interact.update
6. 放置消耗：右键放置时 heldItem 是 place 类且 count-- ；到 0 清槽
7. 移除 M1 的临时静态 chunk 生成 → world.ensureArea 流式加载接管

## M2 验收标准
- [ ] 徒手砍树 → 掉 LOG → 拾取 toast → 背包(E)可见
- [ ] 背包内 2×2：LOG→木板→工作台放置可右键打开 3×3
- [ ] 木镐挖掘 STONE 掉 COBBLE 且徒手挖不掉落但可破坏(不掉)；玻璃打碎无掉落物
- [ ] 持续奔跑 60s 性能录製无 >100ms 帧
- [ ] 远途位移区块加载无缝无空洞

## 完成动作
git commit -m "feat(M2): resources loop - drops/pickup/craft"
