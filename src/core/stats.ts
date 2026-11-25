/**
 * 属性与组合推导（纯函数）
 * ---------------------------------------------------------------
 * Creature + 配置表 + 特殊组合规则 → CreatureStats & SynergyNote[]。
 * 造型微调（creature.tweaks）严格不参与数值推导（P-006, P-028）。
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

export const BASE_HP = 30;
export const BASE_ATK = 4;
export const BASE_CAPACITY = 10;
/** 1 阶基础 / 2 阶变色强化 / 3 阶满级粒子觉醒（P-026）。 */
export const LEVEL_SCALE = [1, 1.35, 1.75] as const;

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

function resolve(
  creature: Creature,
  defs: readonly PartDef[],
  synergies: readonly SynergyRule[],
): Resolved {
  const byId = defMap(defs);

  const totals: Stats = { hp: 0, atk: 0, def: 0, spd: 0 };
  const tags = new Set<string>();
  const traits = new Set<string>();
  const abilities = new Set<AbilityId>();
  const allIds = new Set<string>();
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
  let hasAirHitPart = false;

  for (const slot of SLOT_IDS) {
    const instances: readonly PartInstance[] = creature.slots[slot] ?? [];
    for (const instance of instances) {
      const def = byId.get(instance.defId);
      if (!def) continue;
      const scale = LEVEL_SCALE[instance.level - 1] ?? 1;

      slotCounts[slot] += 1;
      slotIds[slot].add(def.id);
      allIds.add(def.id);
      mass += def.mass;

      if (slot === 'body') {
        bodySize += def.size;
        bodyHp += Math.round((def.stats.hp ?? 0) * scale);
      }
      if (slot === 'beak') {
        beakAtk += Math.round((def.stats.atk ?? 0) * scale);
      }
      if (def.canHitAir) hasAirHitPart = true;

      for (const key of STAT_KEYS) {
        const increment = def.stats[key] ?? 0;
        totals[key] += Math.round(increment * scale);
      }
      for (const tag of def.tags) tags.add(tag);
      for (const tr of def.traits) traits.add(tr);
      if (def.ability) abilities.add(def.ability);
    }
  }

  const capacity = BASE_CAPACITY + bodySize * 4;
  const massRatio = capacity > 0 ? clamp(mass / (capacity * 1.4), 0, 0.55) : 0.55;

  // 黄金王冠光环加成（P-024）
  const crownMul = traits.has('crown_aura') ? 1.15 : 1;

  const stats: CreatureStats = {
    v: 1,
    hp: Math.round((BASE_HP + totals.hp + Math.round(bodyHp * 0.5)) * crownMul),
    atk: Math.round((BASE_ATK + totals.atk + Math.round(beakAtk * 0.5)) * crownMul),
    def: Math.round(totals.def * crownMul),
    spd: clamp(Math.round((100 + totals.spd * 4) * (1 - massRatio)), 25, 320),
    mass,
    capacity,
    tags: [],
    traits: [],
    combos: [],
    abilities: [],
    flags: {
      grounded: false,
      canGlide: false,
      overloaded: false,
      canJump: false,
      canHitAir: false,
    },
  };

  const notes: SynergyNote[] = [];
  const combos: string[] = [];

  const applyEffect = (effect: SynergyRule['effect']): void => {
    switch (effect.type) {
      case 'grantTag':
        tags.add(effect.tag);
        break;
      case 'grantTrait':
        traits.add(effect.trait);
        break;
      case 'statMul': {
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

    if (when.slotAnyIds) {
      for (const slot of SLOT_IDS) {
        const candidates = when.slotAnyIds[slot];
        if (!candidates || candidates.length === 0) continue;
        let hit = false;
        for (const id of candidates) {
          if (slotIds[slot].has(id)) {
            hit = true;
            break;
          }
        }
        if (!hit) return false;
      }
    }

    if (when.bodyFusionAll) {
      for (const reqId of when.bodyFusionAll) {
        if (!slotIds.body.has(reqId)) return false;
      }
    }

    if (when.anyIds && !when.anyIds.some((id) => allIds.has(id))) return false;
    if (when.anyIds2 && !when.anyIds2.some((id) => allIds.has(id))) return false;

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
    combos.push(rule.id);
  }

  const hasBioWing = tags.has('bio_wing');
  const hasJet = traits.has('jet_boost');
  const overloaded = mass > capacity;
  // 喷气推进翼无视超重强行浮空；生物翼超重或触发太沉冲突则 grounded
  const grounded = !hasJet && (tags.has('grounded') || (hasBioWing && overloaded));
  const canGlide = (traits.has('glide') || tags.has('glide')) && !grounded;
  const canJump = traits.has('jump') || tags.has('jump');
  const canHitAir = hasAirHitPart || traits.has('anti_air');

  stats.tags = [...tags].sort();
  stats.traits = [...traits].sort();
  stats.combos = combos;
  stats.abilities = [...abilities].sort();
  stats.flags = { grounded, canGlide, overloaded, canJump, canHitAir };

  return { stats, notes };
}

export function deriveStats(
  creature: Creature,
  defs: readonly PartDef[],
  synergies: readonly SynergyRule[],
): CreatureStats {
  return resolve(creature, defs, synergies).stats;
}

export function synergyNotes(
  creature: Creature,
  defs: readonly PartDef[],
  synergies: readonly SynergyRule[],
): SynergyNote[] {
  return resolve(creature, defs, synergies).notes;
}
