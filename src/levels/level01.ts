/**
 * 关卡 1 · One Base Short（A 负责）。
 * 数据逐字来自 docs/SPEC.md 3.1，不要凭感觉改序列或阈值。
 */

import type { Level } from '../core/types';

export const LEVEL_01: Level = {
  id: 'l01',
  number: 1,
  name: 'One Base Short',
  species: 'Gill Blob',
  target: 'IT CANNOT WALK. Seven gills, no legs — and the crack is dry.',
  hint: 'One base is missing. The reading frame is off by one — slide it back.',
  intro:
    'Specimen 011. It breathes through seven gills and owns no legs at all. ' +
    'The crack ahead is four metres of dry rock.',
  sequence: 'AUGCGUCGUCAGGGCCGACCUGAAUAG',
  budget: 2,
  ops: ['insert', 'delete'],
  gates: [
    {
      id: 'crack',
      kind: 'chasm',
      label: 'The Crack',
      hint: '4 m across. Swimming will not help.',
      at: 0.55,
      mode: 'all',
      requires: [{ stat: 'stride', min: 4 }],
    },
  ],
  hudStats: ['stride', 'swim', 'spikes'],
  parEdits: 1,
  solutionNote: 'INS@3+U → stride 7. 13 other inserts also pass (stride 5).',
};

export default LEVEL_01;
