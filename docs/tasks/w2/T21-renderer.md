# T21 渲染器

波次: W2（3 并发）| 前置: W1 完成（需 atlas 与 MeshArrays 类型）

## 目标
Three.js 场景壳与 chunk 几何管理。

## 独占文件
- src/render/renderer.ts

## 契约引用
- interfaces.md §11（Renderer 类签名照抄）；architecture.md §2.10 性能预算

## 交付物
1. WebGLRenderer（antialias, pixelRatio 钳 1.5）、PerspectiveCamera、Scene
2. **全游戏仅 2 个材质实例**：
   - opaque: `MeshLambertMaterial({ map: atlasTexture, vertexColors: true })`
   - water: 同上 + transparent + opacity ~0.75 + depthWrite false
3. atlasTexture 由 buildAtlasCanvas 生成：`CanvasTexture` + NearestFilter + generateMipmaps=false
4. updateChunkGeometry(c, opaque, water)：MeshArrays→BufferGeometry（position/uv/color/index）→ 替换 chunk.meshes 句柄并 add 到 scene；geometry.computeBoundingSphere() 供视锥剔除
5. removeChunkMeshes：dispose geometry 并从 scene 移除
6. 环境光 + 平行光（daycycle W6 会调它——暴露 setSunLight(dirNormalized, intensity) 辅助方法）
7. renderFrame(dt)：渲染一帧（雾更新等由其他系统直接改 scene.fog）
8. 冒烟测试（node 环境 mock canvas 不可行则只验证模块导入与纯逻辑部分）

## 验收标准 / 自测命令
`tsc --noEmit` + 最小导入冒烟
