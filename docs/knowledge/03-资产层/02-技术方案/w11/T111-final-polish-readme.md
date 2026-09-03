---
文档编号: DOC-AST-02-041
标题: T111 终检打磨与 README
类型: 方案
状态: 现行
日期: 2026-08-27
作者: my-world 项目组
描述: T111 终检打磨与 README——W11 波次任务卡：目标、独占文件、交付物与验收标准
标签: [任务卡, W11, 多Agent]
---

# T111 终检打磨与 README

波次: W11（串行，主线程）| 前置: W10 全部完成

## 步骤
1. 全量回归：`npx vitest run` + `npx tsc --noEmit` 零错误
2. 浏览器完整流程实测：新世界→砍树→合成→夜战→吃肉→存档→读档→设置调整视距/音量生效
3. Performance profile：冷启动、奔跑 5 分钟、夜战满实体三场景采样；>100ms 帧热点就地优化（小改允许）
4. README.md 撰写：游戏简介/运行方法(npm i && npm run dev)/操作说明表/技术架构一段/截图占位
5. 更新 docs/knowledge/01-项目层/02-核心流程/EXECUTION_PLAN.md 状态勾选全部完成

## 最终验收（对应五里程碑全清单复查）
M1 60fps 走跳挖放 / M2 资源闭环 / M3 F5 恢复+生存数值 / M4 夜战+食物闭环 / M5 冷启动<10s+内存平稳+降级可玩

## 完成动作
git commit -m "release: mini world v1 - complete voxel sandbox"
