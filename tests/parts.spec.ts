import { describe, expect, it } from 'vitest';
import {
  LEVEL_DIRECTORY,
  PARTS_BY_SLOT,
  PART_BY_ID,
  PART_DEFS,
  SLOT_IDS,
  STAGE1_CATALOG,
  STAGE1_ENCOUNTERS,
  applyEdit,
  createCreature,
  deriveStats,
  layoutCreature,
  rollThreeRewards,
  simulate,
} from '../src/core';

describe('36 个动物 + 机械零件配置表、6 关目录与第 1 关遭遇', () => {
  it('36 个零件，6 部位各 6 个，id 与 geometry key 全唯一且颜色完整', () => {
    expect(PART_DEFS).toHaveLength(36);
    for (const slot of SLOT_IDS) {
      expect(PARTS_BY_SLOT[slot]).toHaveLength(6);
    }

    const ids = PART_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(36);
    const geometries = PART_DEFS.map((d) => d.art.geometry);
    expect(new Set(geometries).size).toBe(36);

    for (const def of PART_DEFS) {
      expect(def.id).toBe(def.art.geometry);
      expect(def.id.startsWith(`${def.slot}.`)).toBe(true);
      expect(def.art.anchor).toBe(def.slot);
      expect(def.art.scale).toBeGreaterThan(0);
      expect(def.role.length).toBeGreaterThan(0);
      expect(def.source.length).toBeGreaterThan(0);
      expect(PART_BY_ID[def.id]).toBe(def);
    }
  });

  it('关卡目录包含 1~6 关且第 1 关解锁；第 1 关先小怪（单细胞/小动物）再大怪 BOSS', () => {
    expect(LEVEL_DIRECTORY).toHaveLength(6);
    expect(LEVEL_DIRECTORY[0].unlocked).toBe(true);
    expect(LEVEL_DIRECTORY.slice(1).every((l) => !l.unlocked)).toBe(true);

    expect(STAGE1_CATALOG).toHaveLength(3);
    expect(STAGE1_ENCOUNTERS.length).toBeGreaterThanOrEqual(5);
    expect(STAGE1_ENCOUNTERS[0].isBoss).toBe(false);
    expect(STAGE1_ENCOUNTERS[STAGE1_ENCOUNTERS.length - 1].isBoss).toBe(true);

    const chick = createCreature('demo');
    for (const enc of STAGE1_ENCOUNTERS) {
      if (!enc.dropPool) continue;
      for (const id of enc.dropPool) expect(PART_BY_ID[id]).toBeDefined();
      const picks = rollThreeRewards(enc.dropPool, chick, 20261125, enc.isBoss);
      expect(picks).toHaveLength(3);
      expect(new Set(picks.map((p) => p.def.id)).size).toBe(3);
    }
  });

  it('barrel 导出核心运行时函数', () => {
    expect(typeof layoutCreature).toBe('function');
    expect(typeof deriveStats).toBe('function');
    expect(typeof applyEdit).toBe('function');
    expect(typeof simulate).toBe('function');
    expect(createCreature().v).toBe(1);
  });
});
