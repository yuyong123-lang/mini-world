# T31 M1 集成装配

波次: W3（串行，主线程亲自执行）| 前置: W1+W2 全部完成

## 目标
把所有模块装配成可玩的 M1：主循环 + HUD 热栏 + 浏览器实测验收。

## 独占文件
- src/main.ts（完整装配）
- src/ui/hud.ts
- src/render/sky*.ts 不在本卡（W6）；需要天空先给 scene.background 固定色即可

## 装配清单
1. main.ts 启动序列：
   - BlockRegistry.load(blocks.json) → ItemRegistry 数据 W4 再说
   - buildAtlasCanvas(seed) → new Renderer(container)
   - initTerrain(seed)；World 实例（M1 临时版：构造后一次性生成半径 5 内所有 chunk 并 mesh——直接调 terragen+mesher，World 流式版 T42 才有；本卡可在 main 里写临时循环）
   - PlayerController.bind；Interactor 挂接 camera
   - rAF 主循环：dt 钳 0.05 → player.tick → interactor.update → world tick(空实现可) → renderer.renderFrame
2. ui/hud.ts：十字准星(css)、热栏 9 格 DOM、数字键 1-9 切换高亮、toast 区
   - M1 热栏预置展示：GRASS/DIRT/STONE/COBBLE/PLANKS/GLASS 六种方块 id 的无限放置模式（W4 接真背包）——热栏 UI 结构照契约 §13
3. 挖掘掉落物 W4 才有：M1 破坏方块即消失，不产生物品

## M1 验收标准（浏览器 npm run dev 实测）
- [ ] 初始加载无控制台报错；固定视距下 Performance 录制 60fps
- [ ] WASD 移动流畅、空格跳跃正常、Shift 疾跑生效
- [ ] 走向墙体被碰撞截停、跳上 1 格台阶、不掉出世界底部（y<0 处 bedrock 有效）
- [ ] 准星指方块出现黑色线框；左键按住按硬度时间破坏；右键放置成功且不会把方块放进自己身体
- [ ] F5 刷新后同 seed 地形完全一致
- [ ] 数字键切换热栏高亮，选中不同方块放置正确贴图

## 完成动作
git commit -m "feat(M1): playable voxel sandbox core"
