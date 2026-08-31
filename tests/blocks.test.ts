import { describe, expect, it } from 'vitest';
import { BLOCK, BlockRegistry } from '../src/blocks/registry';

describe('方块注册表', () => {
  it('加载 21 种方块', () => {
    expect(BlockRegistry.count()).toBe(21);
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

  it('未知 id/key 抛错', () => {
    expect(() => BlockRegistry.get(99)).toThrow();
    expect(() => BlockRegistry.byKey('NOPE')).toThrow();
  });
});
