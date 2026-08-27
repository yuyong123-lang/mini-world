# 协作规则与 DoD（对所有 Agent 生效）

## 1. 文件所有权
- 每个 Agent **只能创建/修改自己任务卡「独占文件清单」中列出的路径**
- 需要改他人文件才能完成的逻辑 → 不改，把所需行为写在报告里交给集成阶段（串行波）
- 同一波次的 Agent 并发运行，交叉写文件会被拒绝

## 2. 契约优先
- 所有公开接口以 [contracts/interfaces.md](interfaces.md) 为准，不得更改导出名/参数形状
- 发现契约缺陷/遗漏：不要自行绕过协议改公共文件；在自己文件的顶部用注释标记 `// FIXME(contract): ...` 并在报告中说明
- 允许在自己的文件内添加契约中未禁止的辅助函数/私有类型

## 3. 技术规范
- TypeScript strict 全开；禁用 `any` 逃逸（mesher/renderer 的边界处白名单除外，须注明原因）
- 禁止在 terragen.ts / mesher.ts / chunk.ts 中 `import * as THREE`（Worker 迁移前提）
- 注释密度：公共导出写一行 JSDoc；算法转折点写行内注释；不写废话注释
- 命名跟随周围代码风格；错误处理用 Result 式返回或抛错均可，但不得吞异常
- 中文面向用户的字符串（物品名/UI 文案/toast），代码标识符英文

## 4. 每张任务卡的 DoD（Definition of Done）
执行完毕前必须全部满足：
1. `npx tsc --noEmit` 零错误（整个项目，不只自己的文件）
2. 自己新增的测试通过：`npx vitest run <相关测试文件>`
3. 未触碰所有权之外的文件（git status 验证）
4. 输出完成报告：做了什么/偏离契约之处/遗留问题

> 若 tsc 因**他人尚未完成的契约文件**报错：只要错误不在你的文件中，视为满足条件 1（在报告中列出这些外部错误即可）。

## 5. 测试要求
- 每个核心模块交付配套 vitest 单测（同目录 `*.test.ts` 或 tests/ 下），至少覆盖：正常路径 + 1~2 个边界（空、越界、极值）
- 纯函数模块（terragen/mesher/collide/crafting/inventory/storage）必须有测试
- 依赖 three/DOM 的模块（renderer/atlas/UI）不强测，但要有最小冒烟导入验证

## 6. 禁止事项（全局风险红线）
- ❌ 引入新的 npm 依赖（three/simplex-noise/vitest 已定）
- ❌ 实现 flood-fill 光照传播、水流扩散模拟（明确砍掉的特性）
- ❌ 给怪物/生物写独立简化物理（必须走 collide.ts 的 moveWithCollisions）
- ❌ 把大计算放进渲染循环未经预算控制（tick 每帧工作量限制见任务卡）
- ❌ 改 package.json 依赖/scripts（脚手架之外）

## 7. 集成阶段职责划分
- 并发波次只保证模块正确；main.ts 装配、系统间连线、浏览器实测一律由串行集成波完成
- 集成波若发现并发交付缺陷：能就地修的小问题（接线遗漏/参数传递错误）可直接修；结构性缺陷记入报告回炉对应模块
