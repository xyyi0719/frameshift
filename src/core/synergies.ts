/**
 * 组合规则（协同 / 冲突）· M0 内置 5 条
 * ---------------------------------------------------------------
 * 全部数据化：stats.ts 只按 when/effect 解释，不写 if-else 特例。
 * 规则按数组顺序求值；后一条能看到前面 grantTag 产生的标签。
 */

import type { SynergyRule } from './types';

export const SYNERGIES: readonly SynergyRule[] = [
  {
    id: 'light_wings_glide',
    when: { tags: ['wing', 'light'] },
    effect: { type: 'grantTag', tag: 'glide' },
    ui: {
      tone: 'buff',
      text: {
        zh: '轻身 + 翼：获得滑翔',
        en: 'Light body + wings: glide unlocked',
      },
    },
  },
  {
    id: 'armored_wings_grounded',
    when: { tags: ['wing', 'armor'] },
    effect: { type: 'grantTag', tag: 'grounded' },
    ui: {
      tone: 'debuff',
      text: {
        zh: '重甲 + 翼：飞不起来，翼已收起',
        en: 'Armour + wings: too heavy to fly, wings folded',
      },
    },
  },
  {
    id: 'sharp_beak_and_claw',
    when: { tags: ['beak', 'sharp', 'claw'] },
    effect: { type: 'grantTag', tag: 'combo' },
    extraEffects: [{ type: 'statMul', stat: 'atk', mul: 1.2 }],
    ui: {
      tone: 'buff',
      text: {
        zh: '尖喙 + 爪：追击连击，攻击 +20%',
        en: 'Sharp beak + claws: follow-up combo, +20% ATK',
      },
    },
  },
  {
    id: 'fat_body_stub_legs',
    when: { tags: ['fat', 'stub'] },
    effect: { type: 'statMul', stat: 'spd', mul: 0.75 },
    ui: {
      tone: 'debuff',
      text: {
        zh: '胖身 + 短腿：移动速度 -25%',
        en: 'Plump body + stub legs: -25% SPD',
      },
    },
  },
  {
    id: 'many_legs',
    when: { minCount: { legs: 4 } },
    effect: { type: 'statMul', stat: 'spd', mul: 1.15 },
    extraEffects: [{ type: 'grantTag', tag: 'clumsy' }],
    ui: {
      tone: 'buff',
      text: {
        zh: '四条以上腿：速度 +15%，但动作笨重',
        en: 'Four or more legs: +15% SPD, but clumsy',
      },
    },
  },
];

export const SYNERGY_BY_ID: Readonly<Record<string, SynergyRule>> = SYNERGIES.reduce(
  (acc, rule) => {
    acc[rule.id] = rule;
    return acc;
  },
  {} as Record<string, SynergyRule>,
);
