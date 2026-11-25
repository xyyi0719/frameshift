import { describe, expect, it } from 'vitest';
import {
  PART_DEFS,
  SYNERGIES,
  deriveStats,
  simulate,
} from '../src/core';
import type {
  BattleCommand,
  BattleConfig,
  BattleEvent,
  CreatureStats,
} from '../src/core';
import { makeCreature } from './helpers';

function stats(
  hp: number,
  atk: number,
  def: number,
  spd: number,
  abilities: string[] = [],
): CreatureStats {
  return {
    v: 1,
    hp,
    atk,
    def,
    spd,
    mass: 0,
    capacity: 10,
    tags: [],
    traits: [],
    combos: [],
    abilities: [...abilities],
    flags: { grounded: false, canGlide: false, overloaded: false, canJump: false, canHitAir: false },
  };
}

function config(
  left: CreatureStats,
  right: CreatureStats,
  overrides: Partial<Pick<BattleConfig, 'seed' | 'maxTicks'>> = {},
): BattleConfig {
  return {
    v: 1,
    seed: overrides.seed ?? 12345,
    tickRate: 30,
    maxTicks: overrides.maxTicks ?? 1800,
    arena: { width: 1000 },
    left: { creatureId: 'left-chick', stats: left, spawnX: 200 },
    right: { creatureId: 'right-chick', stats: right, spawnX: 800 },
  };
}

function endEvent(events: readonly BattleEvent[]): Extract<BattleEvent, { type: 'end' }> {
  const last = events[events.length - 1];
  if (!last || last.type !== 'end') throw new Error('missing end event');
  return last;
}

describe('simulate（确定性回归守护）', () => {
  it('同 seed + 同指令 ⇒ 完全一致（含 events 与 hash）', () => {
    const left = deriveStats(
      makeCreature({ body: ['body.turtle'], wings: ['wings.dragonfly'] }),
      PART_DEFS,
      SYNERGIES,
    );
    const right = deriveStats(
      makeCreature({ body: ['body.hedgehog'], beak: ['beak.croc'] }),
      PART_DEFS,
      SYNERGIES,
    );
    const cfg = config(left, right);
    const cmds: BattleCommand[] = [{ tick: 10, side: 'left', type: 'ability', slot: 'wings' }];

    const a = simulate(cfg, cmds);
    const b = simulate(cfg, cmds);
    expect(a).toEqual(b);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('打到 HP 归零：end 最后一条、winner 正确', () => {
    const cfg = config(stats(30, 50, 0, 200), stats(10, 1, 0, 100));
    const result = simulate(cfg, []);
    expect(result.winner).toBe('left');
    expect(result.remainingHp.right).toBe(0);
    expect(endEvent(result.events).reason).toBe('hp');
  });
});
