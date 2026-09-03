---
文档编号: DOC-AST-02-009
标题: T01 项目脚手架
类型: 方案
状态: 现行
日期: 2026-08-27
作者: my-world 项目组
描述: T01 项目脚手架——W0 波次任务卡：目标、独占文件、交付物与验收标准
标签: [任务卡, W0, 多Agent]
---

# T01 项目脚手架

波次: W0（串行）| 执行者: 主线程 | 前置: 无

## 目标
建立 Vite + TypeScript 项目骨架，npm 源指向镜像，git 初始化。

## 独占文件
- package.json / tsconfig.json / vite.config.ts / index.html / .gitignore
- src/main.ts（占位） / src/style.css（占位）

## 步骤
```bash
cd D:/Users/13720/Desktop/my_world
git init
npm config set registry https://registry.npmmirror.com   # 仅当未配置
npm create vite@latest . -- --template vanilla-ts         # 当前目录非空(有docs)时按提示选忽略现有文件
npm i three@0.185 simplex-noise
npm i -D @types/three vitest
```
- tsconfig 追加/确认：`"strict": true, "target": "ES2022", "moduleResolution": "bundler", "noUncheckedIndexedAccess": true`
- package.json scripts 增加 `"test": "vitest run"`
- index.html：`<div id="app"></div>` 容器；挂 `src/main.ts`
- .gitignore 加 node_modules/dist

## 验收标准
- `npm run dev` 能打开空白页不报错
- `npx tsc --noEmit` 零错误
- git 初始 commit 完成
