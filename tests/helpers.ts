/**
 * 测试用装配助手（A）。
 * 不进入运行时 barrel，只给 tests/*.spec.ts 用。
 */

import type { Creature, PartInstance, SlotId } from '../src/core';
import { createCreature } from '../src/core';

export type SlotSpec = Partial<Record<SlotId, string[]>>;

/** 用 "槽位 → defId 列表" 快速造一只鸡；level 默认 1。 */
export function makeCreature(spec: SlotSpec, id = 'test-chick'): Creature {
  const creature = createCreature(id);
  for (const slot of Object.keys(spec) as SlotId[]) {
    const ids = spec[slot] ?? [];
    creature.slots[slot] = ids.map((defId): PartInstance => ({ defId, level: 1 }));
  }
  return creature;
}
