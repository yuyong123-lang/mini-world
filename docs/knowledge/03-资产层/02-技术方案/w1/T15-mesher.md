---
文档编号: DOC-AST-02-015
标题: T15 网格化 + AO
类型: 方案
状态: 现行
日期: 2026-08-27
作者: my-world 项目组
描述: T15 网格化 + AO——W1 波次任务卡：目标、独占文件、交付物与验收标准
标签: [任务卡, W1, 多Agent]
---

# T15 网格化 + AO

波次: W1（6 并发）| 前置: W0 完成（运行期依赖 registry 数据但编码无需等待）

## 目标
把 chunk 体素数据变成可渲染 TypedArray。这是性能与画面的核心。

## 独占文件
- src/world/mesher.ts
- tests/mesher.test.ts

## 媒体引用
- 02-技术层/05-接口文档/interfaces.md §9（NeighborAccess/meshChunk 签名）、§4（tileUV 规则：半 texel inset）；AO 参数见 01-项目层/03-架构设计/architecture.md §2.3（faceShade/AO 亮度表/对角线翻转规则全按文档执行）

## 交付物
1. 6 向面生成 + 剔除：面可见 ⇔ 邻块非 opaque；水-水相邻不出面；水面(top exposed)顶面 y 降 0.1
2. AO 经典 0 顶点法（side1/side2/corner → level∈{0,1,2,3} → [0.45,0.65,0.82,1.0]）+ 按 AO 翻转四边形对角线
3. faceShade：+Y 1.0 / Z向 0.8 / X向 0.65 / -Y 0.5
4. UV 来自 atlas.tileUV(block.tex[faceIndex])——top 用 [0]、bottom 用 [1]、侧面 [2]；注意 canvas 图像 y 翻转问题需在 UV 中处理（v 取反）
5. 叶子/玻璃 non-opaque 但 solid 的邻接规则正确处理（透明块之间的面：相同 key 相邻剔除、不同则画）
6. 输出水独立 MeshArrays（water mesh 无 AO 需求可全亮）
7. 需要 BlockRegistry 数据判断 opaque/liquid → 通过构造注入或导入 registry 实例均可（保持纯函数性的前提下最小化耦合，mesher 内部不得 import three）

## 性能要求
- 每 chunk <5ms（现代桌面 CPU 单线程），内部避免对象分配热点（用预分配数组 push 后转 TypedArray 一次性）

## 验收标准
- 单 chunk 全 STONE：仅外表面朝 AIR 的面出现；被完全包裹的 STONE 无任何面
- 单个悬浮 DIRT：6 面 24 顶点，顶点色顶面 1.0 底面 0.5
- 两相邻方块间无面；水列: 水与空气交界有面且顶点 y-0.1；水下沙子与水交界面存在
- AO：L 形三方块角落内侧顶点色 ≈0.45

## 自测命令
`npx vitest run tests/mesher.test.ts`
