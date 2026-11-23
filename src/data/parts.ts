/**
 * 16 个零件的静态定义 + 英文文案（A 负责）。
 * ---------------------------------------------------------------
 * 顺序是固定的，图例按这个顺序排：
 *   A 家族 4 个、U 家族 4 个、G 家族 4 个、C 家族 4 个。
 * 属性数值必须与 docs/SPEC.md 2.1 的零件表逐项一致。
 */

import type { PartDefinition, PartId } from '../core/types';

export const PART_DEFS: readonly PartDefinition[] = [
  /* ---------------- A · 感官 / 头 ---------------- */
  {
    id: 'head',
    label: 'Head',
    family: 'A',
    variant: 'G',
    stats: { sight: 1 },
    blurb: 'The first word read. Everything else follows it.',
  },
  {
    id: 'eye',
    label: 'Eye',
    family: 'A',
    variant: 'C',
    stats: { sight: 2 },
    blurb: 'Wide and unblinking, tuned to the dark.',
  },
  {
    id: 'horn',
    label: 'Horn',
    family: 'A',
    variant: 'A',
    stats: { spikes: 2 },
    blurb: 'Bone pointed forward, for arguing with rocks.',
  },
  {
    id: 'antenna',
    label: 'Antenna',
    family: 'A',
    variant: 'U',
    stats: { sight: 1 },
    blurb: 'A thin feeler tasting the air ahead.',
  },

  /* ---------------- U · 肢体 ---------------- */
  {
    id: 'leg',
    label: 'Leg',
    family: 'U',
    variant: 'G',
    stats: { stride: 2 },
    blurb: 'Two good steps, if the ground agrees.',
  },
  {
    id: 'longleg',
    label: 'Long Leg',
    family: 'U',
    variant: 'A',
    stats: { stride: 3 },
    blurb: 'Three steps at once, and a long reach.',
  },
  {
    id: 'claw',
    label: 'Claw',
    family: 'U',
    variant: 'C',
    stats: { stride: 1, grip: 2 },
    blurb: 'One step, but it holds whatever it finds.',
  },
  {
    id: 'fin',
    label: 'Fin',
    family: 'U',
    variant: 'U',
    stats: { swim: 2 },
    blurb: 'A soft paddle that prefers water to stone.',
  },

  /* ---------------- G · 外壳 ---------------- */
  {
    id: 'shell',
    label: 'Shell',
    family: 'G',
    variant: 'G',
    stats: { armor: 2 },
    blurb: 'Layered plate, warm and very difficult to open.',
  },
  {
    id: 'spike',
    label: 'Spike',
    family: 'G',
    variant: 'C',
    stats: { spikes: 2 },
    blurb: 'A row of small warnings along the back.',
  },
  {
    id: 'crest',
    label: 'Crest',
    family: 'G',
    variant: 'A',
    stats: { armor: 1 },
    blurb: 'A raised ridge, half display and half shield.',
  },
  {
    id: 'wing',
    label: 'Wing',
    family: 'G',
    variant: 'U',
    stats: { flight: 2 },
    blurb: 'Two thin membranes that insist on height.',
  },

  /* ---------------- C · 内脏 ---------------- */
  {
    id: 'glow',
    label: 'Glow Organ',
    family: 'C',
    variant: 'G',
    stats: { glow: 2 },
    blurb: 'A small lamp grown from living tissue.',
  },
  {
    id: 'maw',
    label: 'Maw',
    family: 'C',
    variant: 'C',
    stats: { bite: 2 },
    blurb: 'A ring of teeth with no particular manners.',
  },
  {
    id: 'sac',
    label: 'Air Sac',
    family: 'C',
    variant: 'A',
    stats: { armor: 1, swim: 1 },
    blurb: 'A pocket of air under a layer of hide.',
  },
  {
    id: 'gill',
    label: 'Gill',
    family: 'C',
    variant: 'U',
    stats: { swim: 2 },
    blurb: 'Three wet slits, breathing the shallows.',
  },
];

/** id → 静态定义。键完整覆盖 PartId，图例/美术可直接取。 */
export const PART_BY_ID: Readonly<Record<PartId, PartDefinition>> =
  PART_DEFS.reduce((acc, def) => {
    acc[def.id] = def;
    return acc;
  }, {} as Record<PartId, PartDefinition>);
