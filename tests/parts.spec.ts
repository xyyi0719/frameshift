import { describe, expect, it } from 'vitest';
import {
  PARTS_BY_SLOT,
  PART_BY_ID,
  PART_DEFS,
  SLOT_IDS,
  applyEdit,
  createCreature,
  deriveStats,
  layoutParts,
  simulate,
} from '../src/core';

describe('parts 配置表', () => {
  it('24 个零件，6 槽各 4 个，id 与 geometry key 全唯一', () => {
    expect(PART_DEFS).toHaveLength(24);
    for (const slot of SLOT_IDS) {
      expect(PARTS_BY_SLOT[slot]).toHaveLength(4);
    }

    const ids = PART_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(24);
    const geometries = PART_DEFS.map((d) => d.art.geometry);
    expect(new Set(geometries).size).toBe(24);

    for (const def of PART_DEFS) {
      expect(def.id).toBe(def.art.geometry);
      expect(def.id.startsWith(`${def.slot}.`)).toBe(true);
      expect(def.art.anchor).toBe(def.slot);
      expect(def.art.scale).toBeGreaterThan(0);
      expect(def.tier).toBeGreaterThanOrEqual(1);
      expect(def.tier).toBeLessThanOrEqual(3);
      expect(def.size).toBeGreaterThanOrEqual(1);
      expect(def.size).toBeLessThanOrEqual(3);
      expect(def.mass).toBeGreaterThanOrEqual(0);
      expect(PART_BY_ID[def.id]).toBe(def);
      expect(def.tags.length).toBeGreaterThan(0);
    }

    // 每槽 4 个 tier 覆盖 1/2/3，便于后续解锁。
    for (const slot of SLOT_IDS) {
      const tiers = new Set(PARTS_BY_SLOT[slot].map((d) => d.tier));
      expect(tiers.size).toBeGreaterThanOrEqual(2);
    }
  });

  it('barrel 能拿到全部运行时入口', () => {
    expect(typeof layoutParts).toBe('function');
    expect(typeof deriveStats).toBe('function');
    expect(typeof applyEdit).toBe('function');
    expect(typeof simulate).toBe('function');
    expect(createCreature().v).toBe(1);
  });
});
