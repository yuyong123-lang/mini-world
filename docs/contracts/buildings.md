# buildings/ 拆分契约（结构几何层）★

> W0 定稿后即为**冻结契约**。`structures.ts` 收缩为内核，几何工具与 stamp 外置到
> `src/world/buildings/`。缺陷处理同 interfaces.md：停止改动、报告、主线程修订。

## §1 目录与职责

| 文件 | 职责 | 归属 |
|---|---|---|
| `src/world/structures.ts` | 内核：STRUCT_CELL / 锚点选点 / anchorSuitable / 四张 Record 表 / switch 分发 | W0-A2，此后冻结 |
| `src/world/buildings/kit.ts` | 公共几何工具 10 个（§2） | W0-A2，此后冻结 |
| `src/world/buildings/classic.ts` | 旧 7 stamp 纯搬家（house/siheyuan/palace/bamboo_house/yurt/oasis_farm/snow_cabin，几何**逐字节不变**） | W0-A2，此后冻结 |
| `src/world/buildings/<组>.ts` ×14 | 43 个新 stamp 按地理分组（组名见 §6） | 各波 agent 独占 |

依赖方向（禁反转）：`terragen.ts → structures.ts → buildings/*`。terragen 只 import structures
的 5 个公共符号；buildings/* 不 import terragen（地形经 `heightAt` 回调注入，避免循环依赖）。

## §2 kit.ts 公共几何工具清单

前 5 个为 structures.ts 既有私有工具**原样迁出**（签名/实现逐字不变）；后 5 个为 W0 新增（下表签名即契约）。

| 工具 | 签名 | 用途 |
|---|---|---|
| `foundation` | `(x0, z0, x1, z1, fy, mat, heightAt, put)` | 地基：每列自地表垫到地板层下沿（斜坡自动垫脚） |
| `clearBox` | `(x0, y0, z0, x1, y1, z1, put)` | 清空内部空间（AIR + overwrite，永不动基岩） |
| `wallsRect` | `(x0, z0, x1, z1, y0, y1, mat, put)` | 空心矩形墙（四边，不含内部） |
| `slab` | `(x0, z0, x1, z1, y, mat, put)` | 实心平板（地板/屋顶平台） |
| `gableRoof` | `(x0, x1, ridgeZ, baseY, halfDepth, mat, put)` | 双坡顶：沿 X 屋脊，两侧逐行外挑下探 |
| `topClamp` | `(fy, h) => number` | 顶高钳制 `min(fy+h, 62)`，防高塔削顶（WORLD_H−2） |
| `hipRoof` | `(x0, x1, z0, z1, baseY, mat, put)` | 四坡顶：逐层内收（攒尖/庑殿/盔顶基形） |
| `ringWall` | `(cx, cz, r, y0, y1, mat, put)` | 圆环墙（土楼/蒙古包/圆柱塔身） |
| `steppedTower` | `(cx, cz, r, baseY, floors, shrink, mat, put)` | 退台塔身（大雁塔/雷峰塔/台北101 竹节） |
| `arch` | `(x0, x1, y, z, mat, put)` | 拱券/桥洞（赵州桥敞肩、城门洞） |

## §3 stamp 几何铁律（重申）

1. 决策只依赖 `(ax, az, fy)` 与 `heightAt` 回调——**绝不读 chunk**、不 import terragen
2. 水平范围（**含出挑屋檐/桥墩**）≤ `FOOTPRINT_R[kind]`；半径 >6 的 kind 靠 anchorMargin 机制保 footprint 不跨 cell（§5）
3. **禁 import three / DOM**（buildings/*.ts 在 Worker 内运行）
4. 输出只经 `put` 回调（`StructPut`）；内部顺序：clearBox → foundation → 墙/顶 → 装饰；高度封顶一律 `topClamp`
5. 确定性：同一 `(ax, az, fy)` 两次 stamp 结果逐位一致；结构内部随机一律 `hash2`，不接 rng 流

## §4 新 kind 接入四步

| 步 | 动作 | 时机 |
|---|---|---|
| 1 | 三张 Record 表各登记一行：`FOOTPRINT_R`（水平半径，上限 8）/ `SLOPE_TOLERANCE`（默认 2，依山建筑 3-4）/ `KIND_SALT`（自 0x88 顺延） | 仅 W0，此后表冻结（Record 穷举，tsc 强制后续只读） |
| 2 | 内核 `stampStructure` switch 加 case，转发到 buildings/<组>.ts 导出的 stamp | 仅 W0 |
| 3 | `FEATURE_BLOCK` 表登记该 kind 的**特征方块 id**（设计期确定：祈年殿→BLUE_TILE、土楼顶→YELLOW_TILE 等；stamp 必须实际用上，测试特征断言以此为锚） | 仅 W0 |
| 4 | buildings/<组>.ts 实现 stamp 函数体（签名 `(ax, az, fy, heightAt, put)`，只用 kit 工具） | W1-W6 各波唯一的接入工作 |

> 结论：W0 之后三张表 + FEATURE_BLOCK + switch 已全部冻结，新波次**只需写函数 + 特征断言**。

## §5 anchorMargin 机制（为什么不能直接改 MAX_STRUCT_RADIUS）

`structureAnchor` 目前用 `MAX_STRUCT_RADIUS(6)` 作 cell 内偏移边距：`span = STRUCT_CELL − 2×6 = 20`。
若把常量直接提到 8 以容纳 r7/r8 建筑：span 缩到 16 → **全部既有 kind 的锚点偏移整体平移** →
旧 6 区所有建筑换位（旧档 diffs 对不上新地形，隐性存档破坏）。因此三层分离（计划 D1）：

| 量 | 值 | 用途 |
|---|---|---|
| `MAX_STRUCT_RADIUS` | 6→8 | **仅作 terragen 扫描边距**：每 chunk 扫描覆盖自身 ±8 的候选 cell（每轴 cell 数算法不变） |
| `anchorMargin(kind)` | `max(6, FOOTPRINT_R[kind])`（新导出） | cell 内锚点偏移边距：`span = STRUCT_CELL − 2×anchorMargin` |
| `FOOTPRINT_R` | 旧 kind ≤6 不变，新 kind 上限 8 | 实际水平半径（含出挑） |

- 旧 kind `FOOTPRINT_R ≤ 6` → `anchorMargin` 恒 6 → span 恒 20 → **旧世界锚点逐位不变**
- 大半径 kind（r7/r8）边距=自身半径 → footprint 仍必不跨 cell，跨 chunk 双算一致成立
- structures.test 的锚点边距断言改用 `anchorMargin(kind)`，不再引用常量 6

## §6 组文件对照（14 组，与 W1-W6 波次表一致）

| 组 | parts | buildings | 覆盖区域 |
|---|---|---|---|
| 东北 | parts/dongbei | northeast | 黑龙江 / 吉林 / 辽宁 |
| 京津冀 | parts/jingjinji | jingjin | 北京增强 / 天津 / 河北 |
| 黄河 | parts/huanghe | huanghe | 山西 / 山东 / 河南 / 陕西 |
| 蒙宁 | parts/mengning | mengning | 内蒙古增强 / 宁夏 |
| 西域 | parts/xiyu | frontier | 新疆增强 / 甘肃 |
| 藏区 | parts/zang | tibet | 西藏 / 青海 |
| 华东1 | parts/east1 | east1 | 江苏 / 安徽 / 江西 |
| 华东2 | parts/east2 | east2 | 上海 / 浙江 / 福建 |
| 中南1 | parts/mid1 | mid1 | 湖北 / 湖南 |
| 中南2 | parts/mid2 | mid2 | 广东 / 广西 / 海南 |
| 台湾 | parts/taiwan | taiwan | 台湾 |
| 西南1 | parts/xinan1 | xinan1 | 四川增强 / 重庆 |
| 西南2 | parts/xinan2 | xinan2 | 贵州 / 云南增强 |
| 港澳 | parts/gangao | greaterba | 香港 / 澳门 |
