# T64 血条/饥饿 UI

波次: W6（4 并发）| 前置: W5 完成

## 目标
心形血条 + 腿形饥饿条 + 昼夜时钟图标。

## 独占文件
- src/ui/statusUI.ts
- tests/status-ui.test.ts（纯渲染计数逻辑）

## 契约引用
- interfaces.md §13 renderHearts/renderHunger/setTimeIcon

## 交付物
1. StatusUI(bus)：
   - 左下角 hearts 行（10 心 css 绘制，半心支持）、其上 hunger 行反向（从右往左扣）——DOM 结构与 class 命名自由但保持契约函数名
   - 右上角昼夜表盘：小圆环+指针或太阳/月亮 icon 切换（atlas tile 20/21 dataURL 作背景）
   - bus.on('hp') → 重绘 hearts；bus.on('hunger') → 重绘 hunger；bus.on('dayTick') → 图标切换
   - 受击闪红 vignette 特效（css transition）
2. 纯逻辑函数单测：hp 20→10 心含半心计算；hunger 0 时全空

## 验收标准 / 自测命令
`tsc --noEmit` + `npx vitest run tests/status-ui.test.ts`
