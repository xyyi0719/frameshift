/**
 * 关卡 2 · The Long Way Down（A 负责）。
 * 数据逐字来自 docs/SPEC.md 3.2。
 */

import type { Level } from '../core/types';

export const LEVEL_02: Level = {
  id: 'l02',
  number: 2,
  name: 'The Long Way Down',
  species: 'Bramble Fin',
  target:
    'THE RAVINE IS TOO WIDE TO WALK. Nothing with six plates of armour gets airborne.',
  hint: 'You cannot add your way out of this one. Remove a single base and read again.',
  intro:
    'Specimen 027. Armoured, spined, finned — and far too heavy to fly. ' +
    'The ravine does not care how well you swim.',
  sequence: 'AUGGGCGAGUCUGGGUCUGUGACAUAA',
  budget: 1,
  ops: ['insert', 'delete'],
  gates: [
    {
      id: 'ravine',
      kind: 'chasm',
      label: 'The Ravine',
      hint: '6 m gap, far side higher. Wings only.',
      at: 0.6,
      mode: 'all',
      requires: [{ stat: 'flight', min: 4 }],
    },
  ],
  hudStats: ['flight', 'armor', 'swim'],
  parEdits: 1,
  solutionNote: 'DEL@7 or DEL@8 → flight 4. No single insert works.',
};

export default LEVEL_02;
