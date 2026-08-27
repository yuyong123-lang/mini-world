// 全局共享类型（契约 §1）

export type ToolType = 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'hand';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface AABBox {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** DDA 射线结果 */
export interface BlockHit {
  hit: boolean;
  /** 命中体素（整数坐标） */
  pos: Vec3;
  /** 射线进入前最后一个空体素（放置位） */
  prev: Vec3;
  /** 命中面法线 */
  normal: Vec3;
  blockId: number;
}

/** mesher 输出的纯 TypedArray 几何数据（可结构化克隆进 Worker） */
export interface MeshArrays {
  position: Float32Array;
  uv: Float32Array;
  /** rgb 相同灰度 = faceShade × aoLevel */
  color: Float32Array;
  index: Uint32Array;
}

/** 物品堆叠（规范定义在 core；items/items.ts 复用此类型，勿另建） */
export interface ItemStack {
  key: string;
  count: number;
}

