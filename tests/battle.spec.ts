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
    capacity: 8,
    tags: [],
    abilities: [...abilities],
    flags: { grounded: false, canGlide: false, overloaded: false },
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

describe('simulate', () => {
  it('同 seed + 同指令 ⇒ 完全一致（含 events 与 hash）', () => {
    const statsWithAbility = deriveStats(
      makeCreature({ body: ['body.basic'], wings: ['wings.glide'] }),
      PART_DEFS,
      SYNERGIES,
    );
    const cfg = config(
      statsWithAbility,
      deriveStats(makeCreature({ body: ['body.basic'], beak: ['beak.sharp'] }), PART_DEFS, SYNERGIES),
    );
    const cmds: BattleCommand[] = [
      { tick: 10, side: 'left', type: 'ability', slot: 'wings' },
    ];

    const a = simulate(cfg, cmds);
    const b = simulate(cfg, cmds);
    expect(a).toEqual(b);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('打到 HP 归零：end 最后一条、ticks 未超上限、winner 正确', () => {
    const cfg = config(stats(30, 50, 0, 200), stats(10, 1, 0, 100));
    const result = simulate(cfg, []);
    expect(result.winner).toBe('left');
    expect(result.ticks).toBeLessThan(cfg.maxTicks);
    expect(result.remainingHp.right).toBe(0);
    expect(result.remainingHp.left).toBeGreaterThan(0);

    const end = endEvent(result.events);
    expect(end.winner).toBe('left');
    expect(end.reason).toBe('hp');
    expect(end.tick).toBe(result.ticks - 1);
    expect(result.events.filter((e) => e.type === 'end')).toHaveLength(1);
    expect(result.events.filter((e) => e.type === 'die')).toHaveLength(1);
    expect(result.events[result.events.length - 1]).toEqual(end);
  });

  it('时间上限：maxTicks 到达后按剩余 HP 判超时', () => {
    const cfg = config(stats(30, 0, 0, 100), stats(20, 0, 0, 100), { maxTicks: 40 });
    const result = simulate(cfg, []);
    expect(result.ticks).toBe(40);
    const end = endEvent(result.events);
    expect(end.reason).toBe('timeout');
    expect(end.winner).toBe('draw');
    expect(end.tick).toBe(result.ticks - 1);
    expect(result.events.filter((e) => e.type === 'end')).toHaveLength(1);

    const longer = config(stats(30, 0, 0, 100), stats(20, 0, 0, 100), { maxTicks: 1810 });
    const longResult = simulate(longer, []);
    expect(longResult.ticks).toBe(1810);
  });

  it('事件流合法：tick 单调、移动方向正确、伤害非负、end 唯一且最后', () => {
    const cfg = config(stats(40, 8, 2, 100), stats(35, 7, 1, 90), { maxTicks: 300 });
    const result = simulate(cfg, []);
    expect(result.events.length).toBeGreaterThan(0);

    let prevTick = -1;
    for (const event of result.events) {
      expect(event.tick).toBeGreaterThanOrEqual(prevTick);
      expect(event.tick).toBeLessThanOrEqual(cfg.maxTicks);
      prevTick = event.tick;
      if (event.type === 'move') {
        if (event.side === 'left') expect(event.x).toBeGreaterThanOrEqual(200);
        else expect(event.x).toBeLessThanOrEqual(800);
      }
      if (event.type === 'attack') {
        expect(event.damage).toBeGreaterThanOrEqual(0);
        expect(event.target).not.toBe(event.side);
      }
    }
    expect(result.events.filter((e) => e.type === 'end')).toHaveLength(1);
    expect(result.events[result.events.length - 1].type).toBe('end');
    expect(result.ticks).toBeLessThanOrEqual(cfg.maxTicks);
  });

  it('主动技：有 ability 时每个 side 只触发一次；无 ability 时忽略', () => {
    const cfg = config(stats(50, 5, 0, 100, ['glide']), stats(50, 5, 0, 100, ['glide']), {
      maxTicks: 60,
    });
    const result = simulate(cfg, [
      { tick: 1, side: 'left', type: 'ability', slot: 'wings' },
      { tick: 2, side: 'left', type: 'ability', slot: 'wings' },
      { tick: 2, side: 'right', type: 'ability', slot: 'wings' },
    ]);
    const abilities = result.events.filter((e) => e.type === 'ability');
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({
      side: 'left',
      ability: 'glide',
      slot: 'wings',
      tick: 1,
    });
    expect(abilities[1]).toMatchObject({ side: 'right', tick: 2 });

    const noAbility = simulate(
      config(stats(50, 5, 0, 100), stats(50, 5, 0, 100), { maxTicks: 20 }),
      [{ tick: 1, side: 'left', type: 'ability', slot: 'body' }],
    );
    expect(noAbility.events.filter((e) => e.type === 'ability')).toHaveLength(0);
  });

  it('越界 / 超时的指令被忽略，不产生事件', () => {
    const cfg = config(stats(20, 5, 0, 100, ['glide']), stats(20, 5, 0, 100, ['glide']), {
      maxTicks: 10,
    });
    const result = simulate(cfg, [
      { tick: -1, side: 'left', type: 'ability', slot: 'body' },
      { tick: 10, side: 'left', type: 'ability', slot: 'body' },
      { tick: 999, side: 'right', type: 'ability', slot: 'body' },
    ]);
    expect(result.events.filter((e) => e.type === 'ability')).toHaveLength(0);
    expect(result.events[result.events.length - 1].type).toBe('end');
  });

  it('maxTicks = 0 也不崩：直接超时', () => {
    const cfg = config(stats(20, 0, 0, 100), stats(20, 0, 0, 100), { maxTicks: 0 });
    const result = simulate(cfg, []);
    expect(result.ticks).toBe(0);
    expect(endEvent(result.events)).toMatchObject({ reason: 'timeout', winner: 'draw' });
  });

  it('极端 10 腿 + 5 对翼也能跑完一场（性能冒烟）', () => {
    const big = makeCreature({
      body: ['body.plump'],
      beak: ['beak.hammer'],
      legs: Array.from({ length: 10 }, () => 'legs.spring'),
      wings: Array.from({ length: 10 }, () => 'wings.feather'),
      tail: ['tail.fan'],
      crest: ['crest.spike'],
    });
    const bigStats = deriveStats(big, PART_DEFS, SYNERGIES);
    const cfg = config(bigStats, bigStats, { maxTicks: 1800 });
    const result = simulate(cfg, []);
    expect(result.ticks).toBeLessThanOrEqual(1800);
    expect(result.events[result.events.length - 1].type).toBe('end');
    expect(result.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('同 seed 不同 tick 上限：短局的 end 状态与长局前缀一致（确定性）', () => {
    const short = simulate(
      config(stats(40, 8, 0, 100), stats(40, 8, 0, 100), { maxTicks: 20 }),
      [],
    );
    const long = simulate(
      config(stats(40, 8, 0, 100), stats(40, 8, 0, 100), { maxTicks: 21 }),
      [],
    );
    // 前 20 tick 的事件应该一致（除了最后一条 timeout end）。
    const shortBody = short.events.filter((e) => e.type !== 'end');
    const longBody = long.events.filter((e) => e.type !== 'end');
    expect(longBody.slice(0, shortBody.length)).toEqual(shortBody);
  });
});
