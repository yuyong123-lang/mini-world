# T91 M4 集成：生物系统接线与验收

波次: W9（串行，主线程）| 前置: W8 全部完成

## 允许修改
- src/main.ts（装配扩展）、src/render/renderer.ts 小修（实体视图注册辅助）
- 实体文件小适配（回调形状对齐）

## 步骤
1. main 维护统一 entityList；spawner.onSpawnAnimal/onSpawnMonster → new Animal/Monster + attachView
2. 视觉搭建（简单但可辨识）：
   - 猪：粉色 body box(0.7×0.5×0.9) + 头 box + 4 腿小 box，材质取 atlas 纯色近似色或直接 MeshLambertMaterial color
   - 羊(可选): 白色变体复用猪模型换色
   - 怪物：深绿/黑色 humanoid：body+head+双臂双腿 box 组合，夜晚发光眼（自发光小面片）
   - 实体视图同步：view.mesh.position = pos(+height/2)，朝向 = 运动方向 yaw
3. 战斗接线：左键按下时若准星实体命中优先于挖掘（先 tryAttack，未中实体则走 interact 挖掘）；attackPlayer hook 接 stats 系统扣血+红闪
4. 战利品闭环：Animal.die→spawnDrop(RAW_PORK)→拾取→背包→右键吃 +3 饥饿（T61 eat 已有入口，此次真正接上）
5. 实体数统计传 spawner.tick 的 counts 参数
6. >48m despawn 清理 + view detach
7. M4 实测清单：
   - [ ] 白天草地可见动物漫游，打一下会逃跑
   - [ ] 夜晚等待 <2 分钟出现怪物并追击玩家；玩家被打掉血掉闪红
   - [ ] 用剑反杀怪物可行（HP12，木剑 3 刀内？5×4=20>12 两三刀 OK）
   - [ ] 杀猪掉肉 → 吃肉回饥饿 → 满饥饿回血 全链路
   - [ ] 实体满额（杀满 12 怪不消失尸体时间过长导致堆积）帧率稳定 >55fps

## 完成动作
git commit -m "feat(M4): creatures & combat"
