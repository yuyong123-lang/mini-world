---
文档编号: DOC-AST-02-008
标题: W7 终验（34 省扩展收官）
类型: 方案
状态: 现行
日期: 2026-09-01
作者: my-world 项目组
描述: W7 波次任务卡：W7 终验（34 省扩展收官）——Agent 分工、独占文件与波次验收标准
标签: [任务卡, W7, 多Agent]
---

# W7 终验（34 省扩展收官）

波次: W7（串行，主线程）| 前置: W6 完成（波末集成 commit 后）

## 目标
全量回归 + 构建 + 性能抽测 + README/memory 文档收官，34 省级行政区扩展发布。

## 步骤
1. 全量回归：`npx vitest run` + `npx tsc --noEmit` 零错误（Windows 负载噪声假超时重跑即过）
2. `npm run build` 零错误；`npm run dev` 冷启动无 console 报错
3. 性能抽测：选 4 个重结构区（potala 西藏 / hongyadong 重庆 / tulou 福建 / jiayuguan 甘肃）chunk 生成耗时 vs 基线（扩展前版本同坐标），记录对比表；回退明显则定位优化（structures 扫描窗口、stamp 体量）
4. 人工冒烟：选区图 34 色块逐块点选（34 区全部生成成功、标志建筑目视正确）；旧档进旧 6 区确认建筑位置逐格不变（anchorMargin 生效）
5. README.md 更新为 34 区表：区域 → 常见/稀有标志建筑映射 + 选区图说明（唯一允许动 README 的波次）
6. memory（my-world-region-system.md）追加 34 区扩展约定：buildings/ 拆分、anchorMargin、冻结文件清单
7. docs/knowledge/01-项目层/02-核心流程/EXECUTION_PLAN.md 追加 W0-W7 八卡进度状态并勾选

## 验收标准
- 全量测试绿 + build 成功；4 个重结构区 chunk 耗时无显著回退
- 34 区选区图全部可点选、seed 可复现、同 seed 刷新一致
- 旧 6 区黄金回归通过（旧档建筑位置不变、dongbei「在表不在图」）
- README / memory / EXECUTION_PLAN 三处文档同步完成

## 完成动作
```bash
npm test && npm run build
git commit -m "feat(regions): 34 province-level regions with landmark buildings (W0-W7)"
```
