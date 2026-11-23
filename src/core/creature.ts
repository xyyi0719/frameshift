/**
 * 装配编辑（A 负责）
 * ---------------------------------------------------------------
 * UI 不直接改 Creature，只发 EditIntent；这里返回新对象 + 最新 stats/notes。
 * M0 规则：不校验解锁 / 容量 / 尺寸，只保留 64 个零件的硬上限（性能保护）。
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
  SynergyRule,
} from './types';
import { SLOT_IDS } from './types';
import { deriveStats, synergyNotes } from './stats';
import { PART_DEFS } from '../data/parts';
import { SYNERGIES } from './synergies';

/** M0 硬上限：保护布局/渲染，避免一次拖 10 万个零件。 */
export const MAX_PARTS = 64;

export function emptySlots(): SlotMap {
  return { body: [], beak: [], legs: [], wings: [], tail: [], crest: [] };
}

/** 新建一只空鸡；M0 默认 stage 3（六槽全开）。 */
export function createCreature(id = 'local-chick', stage: Creature['stage'] = 3, skin?: string): Creature {
  const creature: Creature = { v: 1, id, stage, slots: emptySlots() };
  if (skin !== undefined) creature.skin = skin;
  return creature;
}

/** 深拷贝（slots 里的数组也复制），避免编辑污染旧状态。 */
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
  if (creature.skin !== undefined) clone.skin = creature.skin;
  return clone;
}

export function countParts(creature: Creature): number {
  let total = 0;
  for (const slot of SLOT_IDS) total += creature.slots[slot]?.length ?? 0;
  return total;
}

function fail(code: EditErrorCode, detail: string): EditResult {
  return { ok: false, code, detail };
}

/**
 * 纯函数：应用一次装配意图。
 * 成功时返回新的 creature / stats / notes；失败不修改输入。
 */
export function applyEdit(
  creature: Creature,
  intent: EditIntent,
  defs: readonly PartDef[] = PART_DEFS,
  synergies: readonly SynergyRule[] = SYNERGIES,
): EditResult {
  let next: Creature;

  switch (intent.type) {
    case 'addPart': {
      const def = defs.find((candidate) => candidate.id === intent.defId);
      if (!def) {
        return fail('incompatible', `unknown part: ${intent.defId}`);
      }
      if (def.slot !== intent.slot) {
        return fail('incompatible', `${def.id} belongs to ${def.slot}, not ${intent.slot}`);
      }
      if (countParts(creature) >= MAX_PARTS) {
        return fail('too_many', `M0 hard limit is ${MAX_PARTS} parts`);
      }
      next = cloneCreature(creature);
      const instance: PartInstance = { defId: def.id, level: 1 };
      next.slots[intent.slot].push(instance);
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
      break;
    }
    case 'clearSlot': {
      next = cloneCreature(creature);
      next.slots[intent.slot] = [];
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
      if (current.level >= 3) {
        return fail('incompatible', `${current.defId} is already level 3`);
      }
      next = cloneCreature(creature);
      next.slots[intent.slot][intent.index] = {
        defId: current.defId,
        level: (current.level + 1) as 1 | 2 | 3,
      };
      break;
    }
    case 'changeSkin': {
      next = cloneCreature(creature);
      next.skin = intent.skin;
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
  };
}

/** 按槽位取零件（UI 常用；越界槽位返回空数组）。 */
export function partsInSlot(creature: Creature, slot: SlotId): readonly PartInstance[] {
  return creature.slots[slot] ?? [];
}

/**
 * 按固定槽位顺序摊平所有零件实例。
 * B 调 layoutParts 前用它，避免自己决定槽位遍历顺序。
 */
export function allParts(creature: Creature): PartInstance[] {
  const parts: PartInstance[] = [];
  for (const slot of SLOT_IDS) {
    parts.push(...(creature.slots[slot] ?? []));
  }
  return parts;
}
