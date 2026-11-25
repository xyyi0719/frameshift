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

function notesOf(spec: Parameters<typeof makeCreature>[0]) {
  const creature = makeCreature(spec);
  return synergyNotes(creature, PART_DEFS, SYNERGIES);
}

describe('deriveStats & 8 组精确特殊组合（P-030）', () => {
  it('空鸡有基础攻击与血量，方便第 1 关教学裸鸡直接操作', () => {
    const stats = statsOf({});
    expect(stats.hp).toBe(30);
    expect(stats.atk).toBe(4);
    expect(stats.flags.canJump).toBe(false);
    expect(stats.flags.canHitAir).toBe(false);
  });

  it('火箭头槌：喷气推进翼 + 犀牛独角', () => {
    const st = statsOf({ wings: ['wings.jetpack'], crest: ['crest.rhino'] });
    expect(st.combos).toContain('combo_rocket_headbutt');
    expect(st.traits).toContain('rocket_headbutt');
  });

  it('躯干拼色彩蛋：反甲铁龟 & 带刺弹力球', () => {
    const st = statsOf({ body: ['body.turtle', 'body.hedgehog', 'body.puffer'] });
    expect(st.combos).toContain('combo_thorn_turtle');
    expect(st.combos).toContain('combo_spiky_puffer');
  });

  it('物理冲突：重型件 + 生物翼 → 太沉啦飞不动；换喷气推进翼无视超重可浮空', () => {
    const heavyBio = statsOf({ body: ['body.turtle'], wings: ['wings.dragonfly'] });
    expect(heavyBio.combos).toContain('conflict_too_heavy_to_fly');
    expect(heavyBio.flags.grounded).toBe(true);
    expect(heavyBio.flags.canGlide).toBe(false);
    expect(notesOf({ body: ['body.turtle'], wings: ['wings.dragonfly'] }).some((n) => n.tone === 'debuff')).toBe(true);

    const heavyJet = statsOf({ body: ['body.turtle'], wings: ['wings.jetpack'] });
    expect(heavyJet.combos).not.toContain('conflict_too_heavy_to_fly');
    expect(heavyJet.flags.grounded).toBe(false);
    expect(heavyJet.flags.canGlide).toBe(true);
  });

  it('对空与跳跃判定标记准确推导（P-008, P-009）', () => {
    const frog = statsOf({ legs: ['legs.frog'], beak: ['beak.woodpecker'] });
    expect(frog.flags.canJump).toBe(true);
    expect(frog.flags.canHitAir).toBe(false);

    const antiAir = statsOf({ beak: ['beak.chameleon'], crest: ['crest.radar'] });
    expect(antiAir.flags.canHitAir).toBe(true);
    expect(antiAir.combos).toContain('combo_radar_lock');
  });
});
