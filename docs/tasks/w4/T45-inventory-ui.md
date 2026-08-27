# T45 背包与合成 UI

波次: W4（5 并发）| 前置: W3 完成

## 目标
DOM 背包窗口 + 合成格 UI。只管展示与操作转发，不碰世界状态。

## 独占文件
- src/ui/inventoryUI.ts / src/ui/craftUI.ts
- tests/ui-inventory.test.ts（逻辑层：格子↔模型同步函数）

## 契约引用
- interfaces.md §13（open/close/isOpen）；§5 Inventory/ItemStack 结构

## 交付物
1. InventoryUI(inv, bus)：
   - 根元素 `#inventory-panel`（hidden 默认）；grid 9×3 主背包 + 底部热栏镜像行
   - 每格 div.slot：显示 count 角标与图标（iconTile 有值时用 background-position 从图集 dataURL 取图；无则 css 纯色块+首字）
   - 点击拾取/放下/交换的光标物品逻辑（cursorStack 模式）：click 槽位 = 拿起/放下/交换；shift-click 快速移动 hotbar↔main
   - hover tooltip（div 定位跟随鼠标）显示物品中文名
   - E 键开合切换（监听由 main 注册以免与 controller 冲突），关闭时光标物品退回背包（add 失败则丢地上——发 bus 事件 dropAtPlayer）
   - isOpen()/open()/close()
2. CraftUI(matcher, inv)：2×2 随身格(背包内嵌) + 右键工作台打开 3×3 模式
   - 输出格显示 match(grid) 结果预览，点击输出格 = 消耗并产出到手（cursorStack 或直接入背包）
   - 关闭面板时 craft 格内物品自动退回背包
3. 所有刷新走「模型变更→renderSlots()」单向流；bus.on('invChanged') 也触发刷新

## 验收标准
- 逻辑层单测：cursorStack 拿放交换三态、shift-click 移动、craft 格退回逻辑
- tsc --noEmit 零错误；组件可独立实例化（构造即渲染 DOM 骨架）

## 自测命令
`npx vitest run tests/ui-inventory.test.ts`
