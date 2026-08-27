# T102 挖掘粒子

波次: W10（4 并发）| 前置: W9 完成

## 独占文件
- src/render/particles.ts

## 交付物
1. 对象池粒子系统（≤200 粒子）：THREE.Points 或 InstancedMesh 小方片
2. spawnBreakParticles(pos: Vec3, colorHex: number)：
   - 一次 12~16 个，初速随机向上外扩，重力下落，0.6~1s 寿命
   - 颜色由调用方传入（集成时从 atlas tile 平均色取样，main 里写个 tileAverageColor(tileIdx) 工具放本文件导出）
3. update(dt) 池更新与回收；不新建对象（池化强制）
4. 接线（允许在报告中给出挂接点说明，实际连线留主线程）：破坏事件 → spawnBreakParticles(blockCenter, avgColor)

## 验收标准
`tsc --noEmit`；池边界测试（超 200 时复用最老粒子）
