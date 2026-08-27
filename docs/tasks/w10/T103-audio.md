# T103 合成音效

波次: W10（4 并发）| 前置: W9 完成

## 独占文件
- src/audio/audio.ts

## 交付物
1. WebAudio API 合成短音效，零素材文件：
   - 'break' 短噪声脉冲(200ms lowpass 衰减)、'place' 低频咚(80ms)、'hurt' 下滑锯齿波(300ms)
   - 'eat' 双短促咬合声、'pickup' 上滑正弦叮(150ms)、'click' 极短咔(30ms)
   - 可选环境：极简 4 和弦琶音 loop（volume 很低）
2. sfx(name, volumeMul?)：首次用户手势后才 init AudioContext（浏览器策略）
3. masterGain 由 Settings.volume 控制（W10 settings 加载前默认 0.5）
4. bus 监听约定列出（供主线程接线参考写在 JSDoc）：blockBroken→break 等

## 验收标准
`tsc --noEmit`；node 环境导入不抛（AudioContext 访问惰性）
