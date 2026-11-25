import { describe, expect, it } from 'vitest';
import {
  MAX_BODY_FUSION,
  MAX_PART_LEVEL,
  PART_DEFS,
  SYNERGIES,
  applyEdit,
  cloneCreature,
  countParts,
  createCreature,
  deriveStats,
} from '../src/core';

describe('assembly / applyEdit（双 3 上限、分部位融合、精简版微调）', () => {
  it('同件重复装配自动叠强 1→2→3 阶，满 3 阶返回 max_level', () => {
    let c = createCreature('chick-1');
    const r1 = applyEdit(c, { type: 'equipOrUpgrade', slot: 'legs', defId: 'legs.frog' });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.action).toBe('equipped');
    expect(r1.creature.slots.legs).toEqual([{ defId: 'legs.frog', level: 1 }]);
    c = r1.creature;

    const r2 = applyEdit(c, { type: 'equipOrUpgrade', slot: 'legs', defId: 'legs.frog' });
    expect(r2.ok && r2.action === 'upgraded').toBe(true);
    if (!r2.ok) return;
    expect(r2.creature.slots.legs[0].level).toBe(2);
    c = r2.creature;

    const r3 = applyEdit(c, { type: 'equipOrUpgrade', slot: 'legs', defId: 'legs.frog' });
    expect(r3.ok && r3.action === 'upgraded').toBe(true);
    if (!r3.ok) return;
    expect(r3.creature.slots.legs[0].level).toBe(MAX_PART_LEVEL);
    expect(r3.stats.spd).toBeGreaterThan(r1.stats.spd);
    c = r3.creature;

    const r4 = applyEdit(c, { type: 'equipOrUpgrade', slot: 'legs', defId: 'legs.frog' });
    expect(r4.ok).toBe(false);
    if (!r4.ok) expect(r4.code).toBe('max_level');
  });

  it('非躯干部位换不同零件时直接替换主轮廓，保持实体清晰（P-027）', () => {
    let c = createCreature();
    const r1 = applyEdit(c, { type: 'equipOrUpgrade', slot: 'beak', defId: 'beak.croc' });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    c = r1.creature;

    const r2 = applyEdit(c, { type: 'equipOrUpgrade', slot: 'beak', defId: 'beak.cannon' });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.action).toBe('replaced');
    expect(r2.creature.slots.beak).toEqual([{ defId: 'beak.cannon', level: 1 }]);
  });

  it(`躯干支持最多 ${MAX_BODY_FUSION} 种异件拼色融合，满上限返回 fusion_full（P-025, P-026）`, () => {
    let c = createCreature();
    for (const id of ['body.turtle', 'body.hedgehog', 'body.puffer']) {
      const r = applyEdit(c, { type: 'equipOrUpgrade', slot: 'body', defId: id });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      c = r.creature;
    }
    expect(c.slots.body).toHaveLength(3);

    const blocked = applyEdit(c, { type: 'equipOrUpgrade', slot: 'body', defId: 'body.swift' });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe('fusion_full');

    // 满 3 种时，给已融合的乌龟壳继续叠阶仍然允许
    const up = applyEdit(c, { type: 'equipOrUpgrade', slot: 'body', defId: 'body.turtle' });
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    expect(up.creature.slots.body[0].level).toBe(2);
  });

  it('downgradePart 逐阶降级，降到 0 自动卸下并清理微调', () => {
    let c = createCreature();
    const r1 = applyEdit(c, { type: 'equipOrUpgrade', slot: 'crest', defId: 'crest.rhino' });
    if (!r1.ok) return;
    const r2 = applyEdit(r1.creature, { type: 'equipOrUpgrade', slot: 'crest', defId: 'crest.rhino' });
    if (!r2.ok) return;
    c = r2.creature;

    const d1 = applyEdit(c, { type: 'downgradePart', slot: 'crest', defId: 'crest.rhino' });
    expect(d1.ok && d1.action === 'downgraded').toBe(true);
    if (!d1.ok) return;
    expect(d1.creature.slots.crest[0].level).toBe(1);

    const d2 = applyEdit(d1.creature, { type: 'downgradePart', slot: 'crest', defId: 'crest.rhino' });
    expect(d2.ok && d2.action === 'removed').toBe(true);
    if (!d2.ok) return;
    expect(d2.creature.slots.crest).toHaveLength(0);
    expect(countParts(d2.creature)).toBe(0);
  });

  it('部位内精简版造型微调只改外观，绝对不影响战斗数值（P-006, P-028）', () => {
    const r1 = applyEdit(createCreature(), { type: 'equipOrUpgrade', slot: 'body', defId: 'body.turtle' });
    if (!r1.ok) return;
    const beforeStats = deriveStats(r1.creature, PART_DEFS, SYNERGIES);

    const tweaked = applyEdit(r1.creature, {
      type: 'setTweak',
      slot: 'body',
      tweak: { offset: [0.3, -0.2, 0.1], rotation: [10, 20, -15], scale: 1.3 },
    });
    expect(tweaked.ok).toBe(true);
    if (!tweaked.ok) return;
    expect(tweaked.stats).toEqual(beforeStats);
    expect(tweaked.creature.tweaks?.body?.scale).toBe(1.3);

    const copy = cloneCreature(tweaked.creature);
    expect(copy.tweaks).toEqual(tweaked.creature.tweaks);
  });
});
