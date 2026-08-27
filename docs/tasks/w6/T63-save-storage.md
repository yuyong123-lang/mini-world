# T63 存档系统

波次: W6（4 并发）| 前置: W5 完成

## 目标
localStorage diff-only 存读档，保证 F5 精确恢复。

## 独占文件
- src/save/storage.ts
- tests/storage.test.ts（node 环境用内存 Map stub localStorage）

## 契约引用
- interfaces.md §11 saveGame/loadGame/clearSave/hasSave 四函数签名照抄
- SaveGame 结构冻结于 architecture.md §2.9

## 交付物
1. localStorage key `my_world_save_v1`
2. saveGame(w, player, inv)：序列化 diffs（Map→嵌套对象 "cx,cz"→{index:id}）、玩家 pos/yaw/pitch/hp/hunger、背包槽位、world 时间由参数 w.time 提供——World 暴露 currentTime? 若接口缺失 FIXME 并暂存全局 DayCycle 引用注入
3. loadGame()：返回 SavedGame 或 null（无档/损坏时 null + console.warn）
4. 写入时机约定：每 10s 自动 + beforeunload + 手动（接线在 T71 集成波；本卡只导出 API 与 autosave 计时器工厂 startAutosave(getSnapshot, intervalMs=10000): ()=>stop）
5. try/catch QuotaExceeded → console.error + emit toast 事件
6. 单测：roundtrip 序列化反序列化相等、损坏 JSON 返回 null 不抛、quota 异常吞掉并返回 false

## 验收标准 / 自测命令
`tsc --noEmit` + `npx vitest run tests/storage.test.ts`
