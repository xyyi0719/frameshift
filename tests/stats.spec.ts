import { describe, expect, it } from 'vitest';
import {
  PART_DEFS,
  SYNERGIES,
  deriveStats,
  synergyNotes,
} from '../src/core';
import { makeCreature } from './helpers';

function statsOf(spec: Parameters<typeof makeCreature>[0]) {
  const creature = makeCreature(spec);
  return deriveStats(creature, PART_DEFS, SYNERGIES);
}

describe('deriveStats', () => {
  it('空鸡：基础 HP / 容量 / 速度，无标签无能力', () => {
    const stats = statsOf({});
    expect(stats).toMatchObject({
      v: 1,
      hp: 20,
      atk: 0,
      def: 0,
      spd: 100,
      mass: 0,
      capacity: 8,
    });
    expect(stats.tags).toEqual([]);
    expect(stats.abilities).toEqual([]);
    expect(stats.flags).toEqual({ grounded: false, canGlide: false, overloaded: false });
  });

  it('躯干 / 喙的加成翻倍，质量与容量正确', () => {
    const body = statsOf({ body: ['body.basic'] });
    expect(body.hp).toBe(32); // 20 + 6 + 躯干 6
    expect(body.def).toBe(1);
    expect(body.mass).toBe(4);
    expect(body.capacity).toBe(16);
    expect(body.spd).toBe(75);

    const beak = statsOf({ beak: ['beak.sharp'] });
    expect(beak.atk).toBe(10); // 5 + 喙 5
    expect(beak.hp).toBe(20);
  });

  it('强化等级按 1 / 1.25 / 1.5 放大属性', () => {
    const creature = makeCreature({ body: ['body.basic'] });
    creature.slots.body[0] = { defId: 'body.basic', level: 2 };
    const stats = deriveStats(creature, PART_DEFS, SYNERGIES);
    expect(stats.hp).toBe(36); // 20 + 8 + 躯干 8
    expect(stats.capacity).toBe(16);
  });

  it('协同：轻身 + 翼 → glide', () => {
    const stats = statsOf({ body: ['body.slim'], wings: ['wings.feather'] });
    expect(stats.tags).toContain('glide');
    expect(stats.flags.canGlide).toBe(true);
    expect(stats.flags.grounded).toBe(false);
    expect(synergyNotes(makeCreature({ body: ['body.slim'], wings: ['wings.feather'] }), PART_DEFS, SYNERGIES).map((n) => n.ruleId)).toContain(
      'light_wings_glide',
    );
  });

  it('冲突：重甲 + 翼 → grounded，不能滑翔', () => {
    const stats = statsOf({ body: ['body.tough'], wings: ['wings.feather'] });
    expect(stats.tags).toContain('grounded');
    expect(stats.flags.grounded).toBe(true);
    expect(stats.flags.canGlide).toBe(false);
    const notes = synergyNotes(makeCreature({ body: ['body.tough'], wings: ['wings.feather'] }), PART_DEFS, SYNERGIES);
    expect(notes.some((n) => n.ruleId === 'armored_wings_grounded' && n.tone === 'debuff')).toBe(true);
  });

  it('超重：10 条腿 + 小身板 → overloaded', () => {
    const stats = statsOf({ body: ['body.basic'], legs: Array.from({ length: 10 }, () => 'legs.spring') });
    expect(stats.mass).toBe(24);
    expect(stats.capacity).toBe(16);
    expect(stats.flags.overloaded).toBe(true);
    expect(stats.flags.grounded).toBe(false); // 没有翼
  });

  it('连击：尖喙 + 爪 → combo 且 ATK +20%', () => {
    const stats = statsOf({ beak: ['beak.sharp'], legs: ['legs.claw'] });
    expect(stats.tags).toContain('combo');
    expect(stats.atk).toBe(14); // (5 + 2 + 喙 5) = 12 → ×1.2
  });

  it('胖身 + 短腿 → 减速 25%', () => {
    const stats = statsOf({ body: ['body.plump'], legs: ['legs.stub'] });
    expect(stats.tags).toEqual(expect.arrayContaining(['fat', 'stub']));
    expect(stats.spd).toBe(34); // 100×(1-0.55)=45 → ×0.75
  });

  it('四条以上腿 → 提速 15%，并获得 clumsy', () => {
    const stats = statsOf({ legs: Array.from({ length: 4 }, () => 'legs.runner') });
    expect(stats.tags).toContain('clumsy');
    expect(stats.spd).toBe(104); // (100+80)×0.5=90 → ×1.15
  });

  it('标签去重并排序，能力去重并排序', () => {
    const stats = statsOf({
      beak: ['beak.hammer', 'beak.hammer'],
      crest: ['crest.horn'],
    });
    expect(stats.abilities).toEqual(['charge', 'hammer_peck']);
    expect(new Set(stats.tags).size).toBe(stats.tags.length);
    expect([...stats.tags].sort()).toEqual(stats.tags);
  });

  it('纯函数：不修改 Creature', () => {
    const creature = makeCreature({ body: ['body.basic'], legs: ['legs.spring'] });
    const snapshot = JSON.stringify(creature);
    deriveStats(creature, PART_DEFS, SYNERGIES);
    expect(JSON.stringify(creature)).toBe(snapshot);
  });
});
