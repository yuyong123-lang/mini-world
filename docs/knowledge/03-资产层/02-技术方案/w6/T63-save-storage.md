---
文档编号: DOC-AST-02-030
标题: T63 存档系统
类型: 方案
状态: 现行
日期: 2026-08-27
作者: my-world 项目组
描述: T63 存档系统——W6 波次任务卡：目标、独占文件、交付物与验收标准
标签: [任务卡, W6, 多Agent]
---

# T63 存档系统

波次: W6（4 并发）| 前置: W5 完成

## 目标
localStorage diff-only 存读档，保证 F5 精确恢复。

## 独占文件
- src/save/storage.ts
- tests/storage.test.ts（node 环境用内存 Map stub localStorage）

## 契约引用
- 02-技术层/05-接口文档/interfaces.md §11 saveGame/loadGame/clearSave/hasSave 四函数签名照抄
- SaveGame 结构冻结于 01-项目层/03-架构设计/architecture.md §2.9

## 交付物
1. localStorage key `my_world_save_v1`
2. saveGame(w, player, inv)：序列化 diffs（Map→嵌套对象 "cx,cz"→{index:id}）、玩家 pos/yaw/pitch/hp/hunger、背包槽位、world 时间由参数 w.time 提供——World 暴露 currentTime? 若接口缺失 FIXME 并暂存全局 DayCycle 引用注入
3. loadGame()：返回 SavedGame 或 null（无档/损坏时 null + console.warn）
4. 写入时机约定：每 10s 自动 + beforeunload + 手动（接线在 T71 集成波；本卡只导出 API 与 autosave 计时器工厂 startAutosave(getSnapshot, intervalMs=10000): ()=>stop）
5. try/catch QuotaExceeded → console.error + emit toast 事件
6. 单测：roundtrip 序列化反序列化相等、损坏 JSON 返回 null 不抛、quota 异常吞掉并返回 false

## 验收标准 / 自测命令
`tsc --noEmit` + `npx vitest run tests/storage.test.ts`
