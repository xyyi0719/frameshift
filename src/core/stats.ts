/**
 * 属性推导（A 负责）
 * ---------------------------------------------------------------
 * 纯函数：Creature + 配置表 + 协同规则 → CreatureStats。
 * 不读取存档、不写全局、不依赖时间/随机。
 *
 * 数值模型（M0，可调）：
 *   HP   = 20 + Σ 部件 hp + 躯干 hp（躯干加成翻倍）
 *   ATK  = Σ 部件 atk + 喙 atk（喙加成翻倍）
 *   DEF  = Σ 部件 def
 *   SPD  = clamp(100 + Σ spd*4, 20, 400) × (1 - clamp(mass/capacity, 0, 0.6))
 *   capacity = 8 + Σ 躯干 size*4
 * 然后按 SYNERGIES 顺序应用 grantTag / statMul / statAdd / unlockAbility。
 */

import type {
  AbilityId,
  Creature,
  CreatureStats,
  PartDef,
  PartInstance,
  SlotId,
  Stats,
  SynergyNote,
  SynergyRule,
} from './types';
import { SLOT_IDS } from './types';

export const BASE_HP = 20;
export const BASE_CAPACITY = 8;
export const LEVEL_SCALE = [1, 1.25, 1.5] as const;

const STAT_KEYS: readonly (keyof Stats)[] = ['hp', 'atk', 'def', 'spd'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function defMap(defs: readonly PartDef[]): ReadonlyMap<string, PartDef> {
  return new Map(defs.map((def) => [def.id, def]));
}

interface Resolved {
  stats: CreatureStats;
  notes: SynergyNote[];
}

/** 单次求值：基础属性 → 协同规则 → flags。 */
function resolve(
  creature: Creature,
  defs: readonly PartDef[],
  synergies: readonly SynergyRule[],
): Resolved {
  const byId = defMap(defs);

  const totals: Stats = { hp: 0, atk: 0, def: 0, spd: 0 };
  const tags = new Set<string>();
  const abilities = new Set<AbilityId>();
  const slotCounts: Record<SlotId, number> = {
    body: 0,
    beak: 0,
    legs: 0,
    wings: 0,
    tail: 0,
    crest: 0,
  };
  const slotIds: Record<SlotId, Set<string>> = {
    body: new Set(),
    beak: new Set(),
    legs: new Set(),
    wings: new Set(),
    tail: new Set(),
    crest: new Set(),
  };

  let mass = 0;
  let bodySize = 0;
  let bodyHp = 0;
  let beakAtk = 0;

  for (const slot of SLOT_IDS) {
    const instances: readonly PartInstance[] = creature.slots[slot] ?? [];
    for (const instance of instances) {
      const def = byId.get(instance.defId);
      if (!def) continue;
      const scale = LEVEL_SCALE[instance.level - 1] ?? 1;

      slotCounts[slot] += 1;
      slotIds[slot].add(def.id);
      mass += def.mass;
      if (slot === 'body') {
        bodySize += def.size;
        bodyHp += Math.round((def.stats.hp ?? 0) * scale);
      }
      if (slot === 'beak') {
        beakAtk += Math.round((def.stats.atk ?? 0) * scale);
      }

      for (const key of STAT_KEYS) {
        const increment = def.stats[key] ?? 0;
        totals[key] += Math.round(increment * scale);
      }
      for (const tag of def.tags) tags.add(tag);
      if (def.ability) abilities.add(def.ability);
    }
  }

  const capacity = BASE_CAPACITY + bodySize * 4;
  const massRatio = capacity > 0 ? clamp(mass / capacity, 0, 0.6) : 0.6;

  const stats: CreatureStats = {
    v: 1,
    hp: BASE_HP + totals.hp + bodyHp,
    atk: totals.atk + beakAtk,
    def: totals.def,
    spd: clamp(Math.round((100 + totals.spd * 4) * (1 - massRatio)), 5, 400),
    mass,
    capacity,
    tags: [],
    abilities: [],
    flags: { grounded: false, canGlide: false, overloaded: false },
  };

  const notes: SynergyNote[] = [];

  const applyEffect = (effect: SynergyRule['effect']): void => {
    switch (effect.type) {
      case 'grantTag':
        tags.add(effect.tag);
        break;
      case 'statMul': {
        // 用 1/1000 定点做倍率，避免 90 * 1.15 = 103.4999... 这类浮点误差。
        const milli = Math.round(effect.mul * 1000);
        stats[effect.stat] = Math.round((stats[effect.stat] * milli) / 1000);
        break;
      }
      case 'statAdd':
        stats[effect.stat] += effect.add;
        break;
      case 'unlockAbility':
        abilities.add(effect.ability);
        break;
      default: {
        const never: never = effect;
        throw new RangeError(`unknown synergy effect: ${JSON.stringify(never)}`);
      }
    }
  };

  const matchRule = (rule: SynergyRule): boolean => {
    const when = rule.when;
    if (when.tags && !when.tags.every((tag) => tags.has(tag))) return false;
    if (when.slots) {
      for (const slot of SLOT_IDS) {
        const prefix = when.slots[slot];
        if (prefix === undefined) continue;
        let hit = false;
        for (const id of slotIds[slot]) {
          if (id.startsWith(prefix)) {
            hit = true;
            break;
          }
        }
        if (!hit) return false;
      }
    }
    if (when.minMass !== undefined && mass < when.minMass) return false;
    if (when.maxMass !== undefined && mass > when.maxMass) return false;
    if (when.minCount) {
      for (const slot of SLOT_IDS) {
        const min = when.minCount[slot];
        if (min !== undefined && slotCounts[slot] < min) return false;
      }
    }
    if (when.maxCount) {
      for (const slot of SLOT_IDS) {
        const max = when.maxCount[slot];
        if (max !== undefined && slotCounts[slot] > max) return false;
      }
    }
    return true;
  };

  for (const rule of synergies) {
    if (!matchRule(rule)) continue;
    applyEffect(rule.effect);
    for (const extra of rule.extraEffects ?? []) applyEffect(extra);
    notes.push({ ruleId: rule.id, tone: rule.ui.tone, text: rule.ui.text });
  }

  const hasWing = tags.has('wing');
  const overloaded = mass > capacity;
  const grounded = tags.has('grounded') || (hasWing && overloaded);
  const canGlide = tags.has('glide') && !grounded;

  stats.tags = [...tags].sort();
  stats.abilities = [...abilities].sort();
  stats.flags = { grounded, canGlide, overloaded };

  return { stats, notes };
}

/** 纯函数：推导最终属性。 */
export function deriveStats(
  creature: Creature,
  defs: readonly PartDef[],
  synergies: readonly SynergyRule[],
): CreatureStats {
  return resolve(creature, defs, synergies).stats;
}

/** 纯函数：本次装配触发了哪些协同/冲突（UI 的 chip 用）。 */
export function synergyNotes(
  creature: Creature,
  defs: readonly PartDef[],
  synergies: readonly SynergyRule[],
): SynergyNote[] {
  return resolve(creature, defs, synergies).notes;
}
