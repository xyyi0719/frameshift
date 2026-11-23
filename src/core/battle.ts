/**
 * 一维对线战斗模拟（A 负责）
 * ---------------------------------------------------------------
 * 纯函数、确定性、与渲染无关：
 *   - 固定 30 tick/s，整数 tick；
 *   - HP / 伤害内部用 1/1000 定点（milli-HP）；
 *   - xorshift128 种子 RNG（只用于暴击）；
 *   - 同 cfg + 同 cmds ⇒ 同 events + 同 hash。
 *
 * 流程：双方相向移动 → 距离 ≤ CONTACT_RANGE 后每 tick 互打 →
 * HP 归零或到 maxTicks 比剩余 HP 百分比。
 */

import type {
  AbilityId,
  BattleCommand,
  BattleConfig,
  BattleEvent,
  BattleResult,
  BattleSide,
  Side,
  SlotId,
} from './types';

/** 接触距离（逻辑单位）。 */
export const CONTACT_RANGE = 100;

/** milli-HP 常量。 */
const HP_SCALE = 1000;

/** 暴击率 12%，暴击/技能倍率 1.5。 */
const CRIT_PER_MILLE = 120;
const CRIT_MUL = 1.5;
const ABILITY_MUL = 1.5;

/** xorshift128（32 位），确定性、无浮点。 */
class XorShift128 {
  private x: number;
  private y: number;
  private z: number;
  private w: number;

  constructor(seed: number) {
    const s = seed >>> 0;
    this.x = (s ^ 0x9e3779b9) >>> 0;
    this.y = (s + 0x9e3779b9) >>> 0;
    this.z = (s + 0x85ebca6b) >>> 0;
    this.w = (s + 0xc2b2ae35) >>> 0;
    if ((this.x | this.y | this.z | this.w) === 0) this.x = 1;
  }

  nextUint32(): number {
    const t = (this.x ^ (this.x << 11)) >>> 0;
    this.x = this.y;
    this.y = this.z;
    this.z = this.w;
    this.w = (this.w ^ (this.w >>> 19) ^ (t ^ (t >>> 8))) >>> 0;
    return this.w;
  }

  /** 0..999。 */
  nextMille(): number {
    return this.nextUint32() % 1000;
  }
}

/** 每 tick 的基础伤害（milli-HP）。 */
function damagePerTick(
  attacker: Pick<BattleSide, 'stats'>,
  defender: Pick<BattleSide, 'stats'>,
  tickRate: number,
): number {
  const atk = Math.max(0, Math.round(attacker.stats.atk));
  const def = Math.max(0, Math.round(defender.stats.def));
  const denom = HP_SCALE + def * 50;
  const dpsMilli = (atk * 1200 * HP_SCALE) / denom;
  const perTick = Math.round(dpsMilli / Math.max(1, tickRate));
  return Math.max(0, perTick);
}

function eventTypeCode(type: BattleEvent['type']): number {
  switch (type) {
    case 'move':
      return 1;
    case 'attack':
      return 2;
    case 'ability':
      return 3;
    case 'die':
      return 4;
    case 'end':
      return 5;
    default:
      return 0;
  }
}

/** FNV-1a 32 位；只做整数运算，跨端一致。 */
function hashBattle(
  cfg: BattleConfig,
  winner: Side | 'draw',
  ticks: number,
  leftHp: number,
  rightHp: number,
  events: readonly BattleEvent[],
): string {
  let acc = 0x811c9dc5;
  const mix = (value: number): void => {
    acc = Math.imul(acc ^ (value >>> 0), 0x01000193) >>> 0;
  };
  const mixSigned = (value: number): void => {
    mix(value);
  };

  mix(cfg.seed);
  mix(winner === 'left' ? 1 : winner === 'right' ? 2 : 3);
  mixSigned(ticks);
  mixSigned(leftHp);
  mixSigned(rightHp);
  mix(events.length);
  for (const event of events) {
    mix(event.tick);
    mix(eventTypeCode(event.type));
    switch (event.type) {
      case 'move':
        mix(event.side === 'left' ? 1 : 2);
        mix(event.x);
        break;
      case 'attack':
        mix(event.side === 'left' ? 1 : 2);
        mix(event.damage);
        mix(event.crit ? 1 : 0);
        break;
      case 'ability':
        mix(event.side === 'left' ? 1 : 2);
        for (let i = 0; i < event.ability.length; i += 1) {
          mix(event.ability.charCodeAt(i));
        }
        break;
      case 'die':
        mix(event.side === 'left' ? 1 : 2);
        break;
      case 'end':
        mix(event.winner === 'left' ? 1 : event.winner === 'right' ? 2 : 3);
        mix(event.reason === 'hp' ? 1 : 2);
        break;
      default: {
        const never: never = event;
        void never;
      }
    }
  }
  return acc.toString(16).padStart(8, '0');
}

interface Fighter {
  side: Side;
  stats: BattleSide['stats'];
  x: number;
  hp: number;
  maxHp: number;
  boostTicks: number;
  abilityUsed: boolean;
}

function fighterOf(side: Side, config: BattleSide): Fighter {
  const hpMilli = Math.max(0, Math.round(config.stats.hp * HP_SCALE));
  return {
    side,
    stats: config.stats,
    x: Math.round(config.spawnX),
    hp: hpMilli,
    maxHp: hpMilli,
    boostTicks: 0,
    abilityUsed: false,
  };
}

/** 纯函数：同输入必同输出。 */
export function simulate(cfg: BattleConfig, cmds: BattleCommand[]): BattleResult {
  const tickRate = Math.max(1, Math.round(cfg.tickRate));
  const maxTicks = Math.max(0, Math.floor(cfg.maxTicks));
  const rng = new XorShift128(cfg.seed);

  const fighters: Record<Side, Fighter> = {
    left: fighterOf('left', cfg.left),
    right: fighterOf('right', cfg.right),
  };

  const commandsByTick = new Map<number, BattleCommand[]>();
  for (const cmd of cmds) {
    if (cmd.type !== 'ability' || !Number.isInteger(cmd.tick)) continue;
    if (cmd.tick < 0 || cmd.tick >= maxTicks) continue;
    const list = commandsByTick.get(cmd.tick) ?? [];
    list.push(cmd);
    commandsByTick.set(cmd.tick, list);
  }

  const events: BattleEvent[] = [];
  let ended = false;
  /** 最后一个被执行的 tick（0 起）；超时局可能为 maxTicks-1。 */
  let endTick = 0;
  /** 实际执行的 tick 数。 */
  let ticks = 0;

  const emit = (event: BattleEvent): void => {
    events.push(event);
  };

  const tryAbility = (tick: number): void => {
    const queued = commandsByTick.get(tick);
    if (!queued) return;
    for (const cmd of queued) {
      const fighter = fighters[cmd.side];
      if (!fighter || fighter.abilityUsed) continue;
      const ability: AbilityId | undefined = fighter.stats.abilities[0];
      if (!ability) continue;
      fighter.abilityUsed = true;
      fighter.boostTicks = tickRate;
      emit({ tick, type: 'ability', side: cmd.side, ability, slot: cmd.slot });
    }
  };

  const emitMove = (fighter: Fighter, x: number): void => {
    emit({ tick, type: 'move', side: fighter.side, x });
  };

  let tick = 0;

  while (tick < maxTicks && !ended) {
    tryAbility(tick);

    const left = fighters.left;
    const right = fighters.right;
    let gap = right.x - left.x;

    // ---- 相向移动 ----
    if (gap > CONTACT_RANGE) {
      const leftStep = Math.min(
        Math.max(0, Math.round(left.stats.spd / 6)),
        gap - CONTACT_RANGE,
      );
      const rightStep = Math.min(
        Math.max(0, Math.round(right.stats.spd / 6)),
        gap - CONTACT_RANGE,
      );
      if (leftStep > 0) {
        left.x += leftStep;
        emitMove(left, left.x);
      }
      if (rightStep > 0) {
        right.x -= rightStep;
        emitMove(right, right.x);
      }
      gap = right.x - left.x;
    }

    // ---- 接触后互打（同 tick 同时结算）----
    if (gap <= CONTACT_RANGE) {
      const leftDmg = damagePerTick(left, right, tickRate);
      const rightDmg = damagePerTick(right, left, tickRate);

      const leftCrit = rng.nextMille() < CRIT_PER_MILLE;
      const rightCrit = rng.nextMille() < CRIT_PER_MILLE;

      const applyMul = (base: number, fighter: Fighter, crit: boolean): number => {
        let damage = base;
        if (fighter.boostTicks > 0) damage = Math.round(damage * ABILITY_MUL);
        if (crit) damage = Math.round(damage * CRIT_MUL);
        return Math.max(0, damage);
      };

      const finalLeft = applyMul(leftDmg, left, leftCrit);
      const finalRight = applyMul(rightDmg, right, rightCrit);

      if (finalLeft > 0) {
        right.hp = Math.max(0, right.hp - finalLeft);
        emit({
          tick,
          type: 'attack',
          side: 'left',
          target: 'right',
          damage: finalLeft,
          crit: leftCrit,
        });
      }
      if (finalRight > 0) {
        left.hp = Math.max(0, left.hp - finalRight);
        emit({
          tick,
          type: 'attack',
          side: 'right',
          target: 'left',
          damage: finalRight,
          crit: rightCrit,
        });
      }

      if (left.hp <= 0 || right.hp <= 0) {
        ended = true;
        endTick = tick;
        ticks = tick + 1;
        const leftDead = left.hp <= 0;
        const rightDead = right.hp <= 0;
        if (leftDead) emit({ tick, type: 'die', side: 'left' });
        if (rightDead) emit({ tick, type: 'die', side: 'right' });
        const winner: Side | 'draw' =
          leftDead && rightDead ? 'draw' : leftDead ? 'right' : 'left';
        emit({ tick, type: 'end', winner, reason: 'hp' });
      }
    }

    if (left.boostTicks > 0) left.boostTicks -= 1;
    if (right.boostTicks > 0) right.boostTicks -= 1;

    tick += 1;
  }

  // ---- 超时：比剩余 HP 百分比（交叉相乘，避免浮点）----
  if (!ended) {
    ticks = maxTicks;
    endTick = maxTicks > 0 ? maxTicks - 1 : 0;
    const left = fighters.left;
    const right = fighters.right;
    let winner: Side | 'draw' = 'draw';
    const leftScaled = left.hp * Math.max(1, right.maxHp);
    const rightScaled = right.hp * Math.max(1, left.maxHp);
    if (leftScaled > rightScaled) winner = 'left';
    else if (rightScaled > leftScaled) winner = 'right';
    emit({ tick: endTick, type: 'end', winner, reason: 'timeout' });
  }

  const leftHp = fighters.left.hp;
  const rightHp = fighters.right.hp;
  const winnerEvent = events[events.length - 1];
  const winner: Side | 'draw' =
    winnerEvent && winnerEvent.type === 'end' ? winnerEvent.winner : 'draw';

  return {
    v: 1,
    winner,
    ticks,
    remainingHp: { left: leftHp, right: rightHp },
    events,
    hash: hashBattle(cfg, winner, ticks, leftHp, rightHp, events),
  };
}

/** 小工具：从 CreatureStats 生成默认 spawnX 的左/右侧配置，B 可直接用。 */
export function battleSides(
  left: BattleSide['stats'],
  right: BattleSide['stats'],
  leftSpawnX = 200,
  rightSpawnX = 800,
): Pick<BattleConfig, 'left' | 'right'> {
  return {
    left: { creatureId: 'left', stats: left, spawnX: leftSpawnX },
    right: { creatureId: 'right', stats: right, spawnX: rightSpawnX },
  };
}

/** 小工具：判断某个槽位 id 是否合法（命令入参来自 UI 时可用）。 */
export function isSlotId(value: string): value is SlotId {
  return (
    value === 'body' ||
    value === 'beak' ||
    value === 'legs' ||
    value === 'wings' ||
    value === 'tail' ||
    value === 'crest'
  );
}
