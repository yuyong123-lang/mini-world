import { describe, expect, it } from 'vitest';
import { BLOCK, BlockRegistry } from '../src/blocks/registry';

describe('方块注册表', () => {
  it('加载 47 种方块', () => {
    expect(BlockRegistry.count()).toBe(47);
  });

  it('get/byKey 双向查表', () => {
    expect(BlockRegistry.get(0).key).toBe('AIR');
    expect(BlockRegistry.byKey('STONE').id).toBe(BLOCK.STONE);
    const g = BlockRegistry.byKey('GRASS');
    expect(g.drop).toBe('ITEM_DIRT');
  });

  it('契约 §3 关键属性抽查', () => {
    expect(BlockRegistry.byKey('STONE').minTier).toBe(1);
    expect(BlockRegistry.byKey('ORE_IRON').minTier).toBe(2);
    expect(BlockRegistry.byKey('WATER').solid).toBe(false);
    expect(BlockRegistry.byKey('LEAVES').opaque).toBe(false);
    expect(BlockRegistry.byKey('GLOWBLOCK').emissive).toBe(true);
    expect(BlockRegistry.byKey('BEDROCK').hardness).toBe(-1);
  });

  it('34 省扩展方块抽查（37..46）：属性与 GLASS 同型的幕墙 + 全部有掉落', () => {
    const keys = [
      'WHITE_STONE', 'RED_BRICK', 'BLUE_TILE', 'GREEN_TILE', 'DARK_TILE',
      'CONCRETE', 'GLASS_CURTAIN', 'DARK_WOOD', 'THATCH', 'PASTEL_WALL',
    ] as const;
    keys.forEach((key, i) => {
      const def = BlockRegistry.byKey(key);
      expect(def.id, key).toBe(BLOCK[key]);
      expect(def.id, key).toBe(37 + i);
      expect(def.solid, key).toBe(true);
      // 挖了要能放回去：掉落物 key 必须存在（可放置配对由 dig-place-loop.test 锁定）
      expect(def.drop, key).toBe(`ITEM_${key}`);
    });
    // 幕墙玻璃：字段模式与 GLASS 完全一致（无 liquid/transparent/emissive）
    const curtain = BlockRegistry.byKey('GLASS_CURTAIN');
    expect(curtain.opaque).toBe(false);
    expect(curtain.liquid).toBeUndefined();
    expect(curtain.transparent).toBeUndefined();
    expect(curtain.emissive).toBeUndefined();
    expect(curtain.hardness).toBe(0.45);
    expect(curtain.tool).toBe('hand');
  });

  it('未知 id/key 抛错', () => {
    expect(() => BlockRegistry.get(99)).toThrow();
    expect(() => BlockRegistry.byKey('NOPE')).toThrow();
  });
});
