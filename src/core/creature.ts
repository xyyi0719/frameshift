/**
 * 装配编辑（纯函数）
 * ---------------------------------------------------------------
 * 对齐 P-022 / P-025 / P-026 / P-027 / P-028 / P-030：
 *   - 躯干 `body` 支持最多 3 种不同零件融合（表面 1 / 1/2 / 1/3 拼色）；
 *   - 其余 5 个部位单种替换主轮廓（保持 3D 美观清晰）；
 *   - 同一零件重复装配转为叠强 1 → 2 → 3 阶（变色/粒子升阶）；
 *   - 部位内精简版微调（offset / rotation / scale），仅影响造型不影响战斗。
 */

import type {
  Creature,
  EditErrorCode,
  EditIntent,
  EditResult,
  PartDef,
  PartInstance,
  SlotId,
  SlotMap,
  SlotTweak,
  SynergyRule,
} from './types';
import { SLOT_IDS } from './types';
import { deriveStats, synergyNotes } from './stats';
import { PART_DEFS } from '../data/parts';
import { SYNERGIES } from './synergies';

export const MAX_PARTS = 64;
/** 同件叠强上限：3 阶（P-026）。 */
export const MAX_PART_LEVEL = 3;
/** 大面积躯干异件融合上限：3 种（P-026, P-030）。 */
export const MAX_BODY_FUSION = 3;

export function defaultTweak(): SlotTweak {
  return { offset: [0, 0, 0], rotation: [0, 0, 0], scale: 1 };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function sanitizeTweak(tweak: SlotTweak): SlotTweak {
  return {
    offset: [
      clamp(tweak.offset[0], -0.45, 0.45),
      clamp(tweak.offset[1], -0.45, 0.45),
      clamp(tweak.offset[2], -0.45, 0.45),
    ],
    rotation: [
      clamp(tweak.rotation[0], -45, 45),
      clamp(tweak.rotation[1], -45, 45),
      clamp(tweak.rotation[2], -45, 45),
    ],
    scale: clamp(tweak.scale, 0.65, 1.45),
  };
}

export function emptySlots(): SlotMap {
  return { body: [], beak: [], legs: [], wings: [], tail: [], crest: [] };
}

export function createCreature(id = 'local-chick', stage: Creature['stage'] = 3, skin?: string): Creature {
  const creature: Creature = { v: 1, id, stage, slots: emptySlots() };
  if (skin !== undefined) creature.skin = skin;
  return creature;
}

export function cloneCreature(creature: Creature): Creature {
  const slots = emptySlots();
  for (const slot of SLOT_IDS) {
    slots[slot] = (creature.slots[slot] ?? []).map((part) => ({ ...part }));
  }
  const clone: Creature = {
    v: 1,
    id: creature.id,
    stage: creature.stage,
    slots,
  };
  if (creature.tweaks) {
    const tweaks: Partial<Record<SlotId, SlotTweak>> = {};
    for (const slot of SLOT_IDS) {
      const tw = creature.tweaks[slot];
      if (tw) {
        tweaks[slot] = {
          offset: [...tw.offset] as [number, number, number],
          rotation: [...tw.rotation] as [number, number, number],
          scale: tw.scale,
        };
      }
    }
    clone.tweaks = tweaks;
  }
  if (creature.skin !== undefined) clone.skin = creature.skin;
  return clone;
}

export function countParts(creature: Creature): number {
  let total = 0;
  for (const slot of SLOT_IDS) total += creature.slots[slot]?.length ?? 0;
  return total;
}

export function totalLevels(creature: Creature): number {
  let total = 0;
  for (const slot of SLOT_IDS) {
    for (const part of creature.slots[slot] ?? []) total += part.level;
  }
  return total;
}

function fail(code: EditErrorCode, detail: string): EditResult {
  return { ok: false, code, detail };
}

export function applyEdit(
  creature: Creature,
  intent: EditIntent,
  defs: readonly PartDef[] = PART_DEFS,
  synergies: readonly SynergyRule[] = SYNERGIES,
): EditResult {
  let next: Creature;
  let action: Extract<EditResult, { ok: true }>['action'] = 'updated';

  switch (intent.type) {
    case 'equipOrUpgrade': {
      const def = defs.find((c) => c.id === intent.defId);
      if (!def) return fail('incompatible', `unknown part: ${intent.defId}`);
      if (def.slot !== intent.slot) {
        return fail('incompatible', `${def.id} belongs to ${def.slot}, not ${intent.slot}`);
      }
      next = cloneCreature(creature);
      const list = next.slots[intent.slot];
      const existingIdx = list.findIndex((p) => p.defId === def.id);
      if (existingIdx >= 0) {
        const cur = list[existingIdx];
        if (cur.level >= MAX_PART_LEVEL) {
          return fail('max_level', `${def.name.zh} 已满 ${MAX_PART_LEVEL} 阶`);
        }
        list[existingIdx] = { defId: cur.defId, level: (cur.level + 1) as 1 | 2 | 3 };
        action = 'upgraded';
      } else if (intent.slot === 'body') {
        if (list.length >= MAX_BODY_FUSION) {
          return fail('fusion_full', `躯干最多融合 ${MAX_BODY_FUSION} 种，请先拆掉一个`);
        }
        list.push({ defId: def.id, level: 1 });
        action = list.length > 1 ? 'fused' : 'equipped';
      } else {
        const hadOther = list.length > 0;
        next.slots[intent.slot] = [{ defId: def.id, level: 1 }];
        action = hadOther ? 'replaced' : 'equipped';
      }
      break;
    }

    case 'downgradePart': {
      const list = creature.slots[intent.slot] ?? [];
      const idx = list.findIndex((p) => p.defId === intent.defId);
      if (idx < 0) return fail('incompatible', `${intent.defId} not equipped`);
      next = cloneCreature(creature);
      const cur = next.slots[intent.slot][idx];
      if (cur.level > 1) {
        next.slots[intent.slot][idx] = { defId: cur.defId, level: (cur.level - 1) as 1 | 2 | 3 };
        action = 'downgraded';
      } else {
        next.slots[intent.slot].splice(idx, 1);
        if (next.slots[intent.slot].length === 0 && next.tweaks) {
          delete next.tweaks[intent.slot];
        }
        action = 'removed';
      }
      break;
    }

    case 'addPart': {
      const def = defs.find((candidate) => candidate.id === intent.defId);
      if (!def) return fail('incompatible', `unknown part: ${intent.defId}`);
      if (def.slot !== intent.slot) {
        return fail('incompatible', `${def.id} belongs to ${def.slot}, not ${intent.slot}`);
      }
      if (countParts(creature) >= MAX_PARTS) {
        return fail('too_many', `hard limit is ${MAX_PARTS} parts`);
      }
      next = cloneCreature(creature);
      next.slots[intent.slot].push({ defId: def.id, level: 1 });
      action = 'equipped';
      break;
    }

    case 'removePart': {
      if (!Number.isInteger(intent.index) || intent.index < 0) {
        return fail('incompatible', `bad index: ${intent.index}`);
      }
      const list = creature.slots[intent.slot] ?? [];
      if (intent.index >= list.length) {
        return fail('incompatible', `index ${intent.index} out of range for ${intent.slot}`);
      }
      next = cloneCreature(creature);
      next.slots[intent.slot].splice(intent.index, 1);
      if (next.slots[intent.slot].length === 0 && next.tweaks) {
        delete next.tweaks[intent.slot];
      }
      action = 'removed';
      break;
    }

    case 'clearSlot': {
      next = cloneCreature(creature);
      next.slots[intent.slot] = [];
      if (next.tweaks) delete next.tweaks[intent.slot];
      action = 'removed';
      break;
    }

    case 'upgrade': {
      if (!Number.isInteger(intent.index) || intent.index < 0) {
        return fail('incompatible', `bad index: ${intent.index}`);
      }
      const list = creature.slots[intent.slot] ?? [];
      const current = list[intent.index];
      if (!current) {
        return fail('incompatible', `index ${intent.index} out of range for ${intent.slot}`);
      }
      if (current.level >= MAX_PART_LEVEL) {
        return fail('max_level', `${current.defId} is already level ${MAX_PART_LEVEL}`);
      }
      next = cloneCreature(creature);
      next.slots[intent.slot][intent.index] = {
        defId: current.defId,
        level: (current.level + 1) as 1 | 2 | 3,
      };
      action = 'upgraded';
      break;
    }

    case 'setTweak': {
      next = cloneCreature(creature);
      next.tweaks = next.tweaks ?? {};
      next.tweaks[intent.slot] = sanitizeTweak(intent.tweak);
      action = 'updated';
      break;
    }

    case 'resetTweak': {
      next = cloneCreature(creature);
      if (next.tweaks) delete next.tweaks[intent.slot];
      action = 'updated';
      break;
    }

    case 'resetAllTweaks': {
      next = cloneCreature(creature);
      delete next.tweaks;
      action = 'updated';
      break;
    }

    case 'changeSkin': {
      next = cloneCreature(creature);
      next.skin = intent.skin;
      action = 'updated';
      break;
    }

    default: {
      const never: never = intent;
      return fail('incompatible', `unknown intent: ${JSON.stringify(never)}`);
    }
  }

  return {
    ok: true,
    creature: next,
    stats: deriveStats(next, defs, synergies),
    notes: synergyNotes(next, defs, synergies),
    action,
  };
}

export function partsInSlot(creature: Creature, slot: SlotId): readonly PartInstance[] {
  return creature.slots[slot] ?? [];
}

export function allParts(creature: Creature): PartInstance[] {
  const parts: PartInstance[] = [];
  for (const slot of SLOT_IDS) {
    parts.push(...(creature.slots[slot] ?? []));
  }
  return parts;
}
