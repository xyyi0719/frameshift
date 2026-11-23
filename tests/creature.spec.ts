import { describe, expect, it } from 'vitest';
import {
  MAX_PARTS,
  PART_DEFS,
  SYNERGIES,
  applyEdit,
  cloneCreature,
  countParts,
  createCreature,
  deriveStats,
} from '../src/core';
import type { PartInstance } from '../src/core';

describe('assembly / applyEdit', () => {
  it('createCreature：六个空槽、stage 3、可改皮肤', () => {
    const creature = createCreature('chick-1');
    expect(creature.v).toBe(1);
    expect(creature.id).toBe('chick-1');
    expect(creature.stage).toBe(3);
    expect(Object.keys(creature.slots).sort()).toEqual(
      ['beak', 'body', 'crest', 'legs', 'tail', 'wings'],
    );
    expect(countParts(creature)).toBe(0);

    const skinned = createCreature('chick-2', 3, 'gold');
    expect(skinned.skin).toBe('gold');
  });

  it('addPart：返回新对象、旧对象不变、stats 同步', () => {
    const before = createCreature();
    const result = applyEdit(before, { type: 'addPart', slot: 'body', defId: 'body.basic' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(before.slots.body).toHaveLength(0);
    expect(result.creature.slots.body).toEqual([{ defId: 'body.basic', level: 1 }]);
    expect(result.creature).not.toBe(before);
    expect(result.stats).toEqual(deriveStats(result.creature, PART_DEFS, SYNERGIES));
    expect(result.stats.hp).toBe(32);
    expect(result.notes).toEqual([]);
  });

  it('M0 不校验容量：连续装 10 条腿仍然 ok', () => {
    let creature = createCreature();
    for (let i = 0; i < 10; i += 1) {
      const result = applyEdit(creature, {
        type: 'addPart',
        slot: 'legs',
        defId: 'legs.spring',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      creature = result.creature;
    }
    expect(countParts(creature)).toBe(10);
    expect(creature.slots.legs).toHaveLength(10);
    expect(deriveStats(creature, PART_DEFS, SYNERGIES).flags.overloaded).toBe(true);
  });

  it('未知零件 / 放错槽位 → incompatible', () => {
    const creature = createCreature();
    const unknown = applyEdit(creature, {
      type: 'addPart',
      slot: 'body',
      defId: 'nope.part',
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.code).toBe('incompatible');

    const wrongSlot = applyEdit(creature, {
      type: 'addPart',
      slot: 'legs',
      defId: 'body.basic',
    });
    expect(wrongSlot.ok).toBe(false);
    if (!wrongSlot.ok) expect(wrongSlot.code).toBe('incompatible');
  });

  it('removePart / clearSlot：删除指定实例或整槽清空', () => {
    const creature = createCreature();
    creature.slots.legs = [
      { defId: 'legs.spring', level: 1 },
      { defId: 'legs.claw', level: 1 },
      { defId: 'legs.runner', level: 1 },
    ];

    const removed = applyEdit(creature, { type: 'removePart', slot: 'legs', index: 1 });
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.creature.slots.legs.map((p) => p.defId)).toEqual([
      'legs.spring',
      'legs.runner',
    ]);
    expect(creature.slots.legs).toHaveLength(3);

    const cleared = applyEdit(creature, { type: 'clearSlot', slot: 'legs' });
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.creature.slots.legs).toEqual([]);

    const bad = applyEdit(creature, { type: 'removePart', slot: 'legs', index: 9 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('incompatible');
  });

  it('upgrade：等级 1→2→3，属性提升；到顶返回 incompatible', () => {
    const creature = createCreature();
    creature.slots.body = [{ defId: 'body.basic', level: 1 }];

    const level2 = applyEdit(creature, { type: 'upgrade', slot: 'body', index: 0 });
    expect(level2.ok).toBe(true);
    if (!level2.ok) return;
    expect(level2.creature.slots.body[0].level).toBe(2);

    const level3 = applyEdit(level2.creature, { type: 'upgrade', slot: 'body', index: 0 });
    expect(level3.ok).toBe(true);
    if (!level3.ok) return;
    expect(level3.creature.slots.body[0].level).toBe(3);
    expect(level3.stats.hp).toBe(38); // 20 + 9 + 躯干 9

    const cap = applyEdit(level3.creature, { type: 'upgrade', slot: 'body', index: 0 });
    expect(cap.ok).toBe(false);
    if (!cap.ok) expect(cap.code).toBe('incompatible');
    expect(creature.slots.body[0].level).toBe(1);
  });

  it('changeSkin 只改皮肤', () => {
    const creature = createCreature();
    const result = applyEdit(creature, { type: 'changeSkin', skin: 'neon' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.creature.skin).toBe('neon');
    expect(result.creature.slots).toEqual(creature.slots);
  });

  it(`硬上限 ${MAX_PARTS}：装满后 addPart → too_many，删掉一个后可再装`, () => {
    const full = createCreature();
    full.slots.legs = Array.from({ length: MAX_PARTS }, (): PartInstance => ({
      defId: 'legs.runner',
      level: 1,
    }));
    expect(countParts(full)).toBe(MAX_PARTS);

    const blocked = applyEdit(full, { type: 'addPart', slot: 'body', defId: 'body.basic' });
    expect(blocked).toEqual({ ok: false, code: 'too_many', detail: expect.any(String) });

    const removed = applyEdit(full, { type: 'removePart', slot: 'legs', index: 0 });
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    const added = applyEdit(removed.creature, {
      type: 'addPart',
      slot: 'body',
      defId: 'body.basic',
    });
    expect(added.ok).toBe(true);
  });

  it('cloneCreature 是深拷贝；失败结果不污染输入', () => {
    const creature = createCreature();
    creature.slots.legs = [{ defId: 'legs.spring', level: 1 }];
    const clone = cloneCreature(creature);
    clone.slots.legs[0].level = 3;
    clone.slots.legs.push({ defId: 'legs.claw', level: 1 });
    expect(creature.slots.legs).toHaveLength(1);
    expect(creature.slots.legs[0].level).toBe(1);

    const snapshot = JSON.stringify(creature);
    applyEdit(creature, { type: 'addPart', slot: 'body', defId: 'unknown' });
    expect(JSON.stringify(creature)).toBe(snapshot);
  });
});
