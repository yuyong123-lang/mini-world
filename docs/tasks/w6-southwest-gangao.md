# W6 西南 + 港澳（6 区）

波次: W6（3 并发）| 前置: W5 完成（波末集成 commit 后）

## 目标
西南（四川增强/重庆 + 贵州/云南增强）+ 港澳（香港/澳门），34 区收尾波；含乐山大佛/洪崖洞两个 r7 依山体量与三座现代玻璃塔。

## 波内共同约定
- 依山建筑用高 SLOPE_TOLERANCE（hongyadong 3-4）；山地地形压缓防削顶；高度一律 `topClamp`（≤62）
- 熊猫入川、象/孔雀入滇；植被复用 8 种 TreeKind；GLASS_CURTAIN 与 GLASS 同透明通道（opaque:false）
- 测试写到 `tests/regions/<组>.test.ts`，每区 ≤6 用例 + 显式 timeout

## Agent 分工

| Agent | 独占文件 | 产出 | 验收标准 |
|---|---|---|---|
| A1 西南1 | src/data/regions/parts/xinan1.ts、src/world/buildings/xinan1.ts、tests/regions/xinan1.test.ts | sichuan 增强（structures 表追加 leshan_buddha 乐山大佛 r7，依山坐佛，佛身复用 STONE；川西民居 house 不动；动物表加熊猫）、chongqing（hongyadong 洪崖洞吊脚楼群 r7 依山多层 SLOPE_TOLERANCE=3 + jiefangbei 解放碑 r3 CONCRETE）；3 个 stamp | 同 seed 确定性；3 kind 特征方块断言命中；跨 chunk 双算一致；r7 anchorMargin 断言；sichuan 既有结构判定零扰动 |
| A2 西南2 | src/data/regions/parts/xinan2.ts、src/world/buildings/xinan2.ts、tests/regions/xinan2.test.ts | guizhou（甲秀楼：水中石桥+三层三檐楼；常见复用 diaojiaolou 苗寨）、yunnan 增强（structures 表追加 three_pagodas 崇圣寺三塔 r5，一主二辅密檐白塔 WHITE_STONE；傣族竹楼 bamboo_house 不动；象/孔雀权重保留）；2-3 个 stamp | 同上 + 云南既有结构判定零扰动；水中石桥基座不悬空（水面锚点断言） |
| A3 港澳 | src/data/regions/parts/gangao.ts、src/world/buildings/greaterba.ts、tests/regions/gangao.test.ts | hongkong（boc_tower 中银大厦 r4 三棱退台玻璃塔 GLASS_CURTAIN + hk_tower 高层住宅 r4 幕墙玻璃）、aomen（dasanba 大三巴牌坊 r5，巴洛克石立面+阶梯 WHITE_STONE + pastel_house 葡式粉彩小楼 r4 PASTEL_WALL）；4 个 stamp | 同上 + 玻璃幕墙透明渲染断言（opaque:false 出面）；高塔削顶断言（≤62）；旧 6 区黄金回归不破 |

## 依赖
- W5 完成（波次串行推进）
- W0 冻结的 kit/四张表/switch 分发；本波只用 §4 第 4 步（写函数）+ 特征断言
- 三 agent 文件互斥；波内禁并行跑全量测试（波末主线程串行集成）

## 验收命令
```bash
npx tsc --noEmit
npx vitest run tests/regions tests/structures tests/blocks tests/atlas tests/terragen tests/regionPicker
# 波末（主线程串行）
npm test && npm run build
npm run dev   # 冒烟：进 1 个大建筑区（四川乐山大佛 / 重庆洪崖洞）+ 旧 6 区黄金回归
```

> 备注：甲秀楼未列入计划文件第三节的 43 个 kind 清单——主线程在 W0 冻结表时补登记该 kind
> （或明确复用 tengwang_pavilion 型）；执行 agent 不得私改内核表（conventions.md §9）。
