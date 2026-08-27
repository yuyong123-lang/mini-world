# T104 设置与主菜单

波次: W10（4 并发）| 前置: W9 完成

## 独占文件
- src/ui/menu.ts
- src/core/settings.ts

## 契约引用
- interfaces.md §13 core/settings.ts 签名

## 交付物
1. core/settings.ts：Settings.load/save/get/set('viewDistance'|'sensitivity'|'volume')，localStorage key `my_world_settings_v1`
   - viewDistance 变更需触发世界半径重构（联动 FOG_NEAR/FAR 缩放）——提供 onChange 回调注册
2. ui/menu.ts：
   - 主菜单遮罩 #menu-overlay：标题「迷你世界」+ 按钮：继续游戏(hasSave)、新世界、设置
   - 新世界 = clearSave + 随机 seed + 开始；设置页含视距滑条 3..8 chunks、鼠标灵敏度、音量
   - ESC/pause：游戏暂停显示菜单（恢复按钮进入 pointer lock）
   - 组件类 MenuSystem(onStart:(seed:string, loadSave:boolean)=>void)，挂载/卸载钩子齐备
3. 与 T63 存档起始界面的关系：M3 版简易二选一遮罩在本卡交付后被本组件替换（main 接线由主线程做）

## 验收标准
`tsc --noEmit`；组件独立实例化冒烟
