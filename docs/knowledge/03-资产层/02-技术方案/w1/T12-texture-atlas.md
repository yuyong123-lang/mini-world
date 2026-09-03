---
文档编号: DOC-AST-02-012
标题: T12 程序化纹理图集
类型: 方案
状态: 现行
日期: 2026-08-27
作者: my-world 项目组
描述: T12 程序化纹理图集——W1 波次任务卡：目标、独占文件、交付物与验收标准
标签: [任务卡, W1, 多Agent]
---

# T12 程序化纹理图集

波次: W1（6 并发）| 前置: W0 完成

## 目标
启动时用离屏 canvas 生成全部方块纹理图集——项目唯一美术来源。

## 独占文件
- src/blocks/atlas.ts

## 契约引用
- 02-技术层/05-接口文档/interfaces.md §4（tile 索引表 + 导出签名：buildAtlasCanvas/tileUV/ATLAS_TILES/TILE_PX/ATLAS_GRID）

## 交付物
1. 每个材质一个纯绘制函数（ctx 上画 16×16），tile 内容按 §4 名称：
   - grass_top 绿底+像素噪点抖动；grass_side 泥土纹+顶部 4px 绿锯齿条；dirt 棕噪点
   - stone 灰底低频斑块；cobble 圆石 blob 圈线；sand 米黄噪点；sandstone 分层横纹
   - log_side 竖条纹明暗；log_top 年轮圈；planks 横板缝+钉点；leaves 绿噪+少量透明孔(alphaTest 用)
   - glass 边框+高光斜线+大部分透明；water 半透明蓝微波；snow 白噪点；snow_side 泥土+白顶条
   - glow 亮黄绿放射纹；craft_table_top 网格面；craft_table_side 工具纹样
   - coal/iron/gold_ore = 石头函数叠彩色像素簇（黑/米橘/黄）；sun/moon 用于天空贴片
2. `buildAtlasCanvas(seed)`：拼装 256×256 返回 canvas；内部用 mulberry32(seed) 保证同 seed 同纹理
3. `tileUV(i)`：返回该 tile 的 u0/v0/u1/v1，**半 texel inset**（0.5px）防渗色
4. 冒烟测试：jsdom 或直接函数级验证 ATLAS_TILES 完整性与 tileUV 数值正确性（不必渲染 canvas）

## 验收标准 / 自测命令
`tsc --noEmit` + `npx vitest run tests/atlas.test.ts`
