import { describe, expect, it } from 'vitest';
import { applyEdit, createCreature, layoutCreature, layoutParts } from '../src/core';

describe('layoutCreature（躯干单轮廓融合 + 腿/侧肢成对 + 3 阶缩放 + 微调）', () => {
  it('空鸡输出空挂点', () => {
    expect(layoutParts([])).toEqual([]);
    expect(layoutCreature(createCreature())).toEqual([]);
  });

  it('腿与侧肢默认按 1 对左右对称输出（P-012, P-016）', () => {
    let c = createCreature();
    const r1 = applyEdit(c, { type: 'equipOrUpgrade', slot: 'legs', defId: 'legs.frog' });
    if (!r1.ok) return;
    const r2 = applyEdit(r1.creature, { type: 'equipOrUpgrade', slot: 'wings', defId: 'wings.crab' });
    if (!r2.ok) return;

    const placed = layoutCreature(r2.creature);
    const legs = placed.filter((p) => p.slot === 'legs');
    const wings = placed.filter((p) => p.slot === 'wings');
    expect(legs).toHaveLength(2);
    expect(legs[0].side).toBe('R');
    expect(legs[1].side).toBe('L');
    expect(legs[0].position[2]).toBeCloseTo(-legs[1].position[2], 6);

    expect(wings).toHaveLength(2);
    expect(wings[0].side).toBe('R');
    expect(wings[1].side).toBe('L');
  });

  it('躯干融合 3 种不同零件时保持单一主实体且等级取最高阶（P-025）', () => {
    let c = createCreature();
    for (const id of ['body.turtle', 'body.hedgehog', 'body.puffer', 'body.hedgehog', 'body.hedgehog']) {
      const r = applyEdit(c, { type: 'equipOrUpgrade', slot: 'body', defId: id });
      if (r.ok) c = r.creature;
    }
    const placed = layoutCreature(c);
    const bodies = placed.filter((p) => p.slot === 'body');
    expect(bodies).toHaveLength(1);
    expect(bodies[0].level).toBe(3);
  });

  it('部位微调会正确反映在 3D PlacedPart 上', () => {
    let c = createCreature();
    const r1 = applyEdit(c, { type: 'equipOrUpgrade', slot: 'crest', defId: 'crest.rhino' });
    if (!r1.ok) return;
    const base = layoutCreature(r1.creature)[0];

    const r2 = applyEdit(r1.creature, {
      type: 'setTweak',
      slot: 'crest',
      tweak: { offset: [0.2, 0.1, 0], rotation: [0, 15, 0], scale: 1.25 },
    });
    if (!r2.ok) return;
    const tweaked = layoutCreature(r2.creature)[0];
    expect(tweaked.position[0]).toBeCloseTo(base.position[0] + 0.2, 5);
    expect(tweaked.rotation[1]).toBeCloseTo(base.rotation[1] + 15, 5);
    expect(tweaked.scale).toBeCloseTo(base.scale * 1.25, 5);
  });
});
