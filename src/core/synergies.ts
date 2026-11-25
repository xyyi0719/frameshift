/**
 * 少量特殊组合与物理直觉冲突（P-007, P-030）
 * ---------------------------------------------------------------
 * 全部采用精确部位/零件归属判定，彻底杜绝旧版“全身标签混并串台”问题。
 */

import type { SynergyRule } from './types';

export const SYNERGIES: readonly SynergyRule[] = [
  {
    id: 'combo_rocket_headbutt',
    name: { zh: '火箭头槌', en: 'Rocket Headbutt' },
    when: {
      slotAnyIds: {
        wings: ['wings.jetpack'],
        crest: ['crest.rhino'],
      },
    },
    effect: { type: 'grantTrait', trait: 'rocket_headbutt' },
    extraEffects: [
      { type: 'statMul', stat: 'atk', mul: 1.25 },
      { type: 'statAdd', stat: 'spd', add: 15 },
    ],
    ui: {
      tone: 'buff',
      text: {
        zh: '彩蛋 · 火箭头槌：喷气+犀牛角，冲锋破防 ATK+25%',
        en: 'Combo · Rocket Headbutt: Jet + Rhino Horn, +25% ATK',
      },
    },
  },
  {
    id: 'combo_meat_grinder',
    name: { zh: '贴脸绞肉机', en: 'Close-Range Grinder' },
    when: {
      slotAnyIds: {
        legs: ['legs.octopus'],
      },
      anyIds: ['beak.chainsaw', 'wings.mantis'],
    },
    effect: { type: 'grantTrait', trait: 'meat_grinder' },
    extraEffects: [{ type: 'statMul', stat: 'atk', mul: 1.22 }],
    ui: {
      tone: 'buff',
      text: {
        zh: '彩蛋 · 贴脸绞肉机：触手粘人+高频锯/镰，ATK+22%',
        en: 'Combo · Grinder: Tentacles + Saw/Scythes, +22% ATK',
      },
    },
  },
  {
    id: 'combo_sky_turret',
    name: { zh: '高空制空炮台', en: 'Sky Turret' },
    when: {
      slotAnyIds: {
        wings: ['wings.dragonfly', 'wings.jetpack'],
        beak: ['beak.cannon', 'beak.chameleon'],
      },
    },
    effect: { type: 'grantTrait', trait: 'sky_turret' },
    extraEffects: [{ type: 'statMul', stat: 'atk', mul: 1.18 }],
    ui: {
      tone: 'buff',
      text: {
        zh: '彩蛋 · 高空制空炮台：滞空+远程对空，空中伤害提升',
        en: 'Combo · Sky Turret: Hover + Anti-Air ranged bonus',
      },
    },
  },
  {
    id: 'combo_iron_fortress',
    name: { zh: '移动铁桶堡垒', en: 'Mobile Fortress' },
    when: {
      slotAnyIds: {
        body: ['body.turtle', 'body.iron'],
        wings: ['wings.shield'],
        legs: ['legs.elephant'],
      },
    },
    effect: { type: 'grantTrait', trait: 'iron_fortress' },
    extraEffects: [
      { type: 'statAdd', stat: 'def', add: 6 },
      { type: 'statMul', stat: 'hp', mul: 1.2 },
    ],
    ui: {
      tone: 'buff',
      text: {
        zh: '彩蛋 · 移动铁桶堡垒：免疫击退，HP+20% DEF+6',
        en: 'Combo · Iron Fortress: Knockback immune, +20% HP, +6 DEF',
      },
    },
  },
  {
    id: 'combo_radar_lock',
    name: { zh: '全图制导锁定', en: 'Full Radar Lock' },
    when: {
      slotAnyIds: {
        crest: ['crest.radar'],
      },
      anyIds: ['beak.chameleon', 'beak.cannon', 'tail.tesla'],
    },
    effect: { type: 'grantTrait', trait: 'guaranteed_lock' },
    extraEffects: [{ type: 'statMul', stat: 'atk', mul: 1.15 }],
    ui: {
      tone: 'buff',
      text: {
        zh: '彩蛋 · 全图制导锁定：必中对空且暴击大幅提升',
        en: 'Combo · Radar Lock: Guaranteed anti-air lock & high crit',
      },
    },
  },
  {
    id: 'combo_spiky_puffer',
    name: { zh: '带刺弹力球', en: 'Spiky Bouncer' },
    when: {
      bodyFusionAll: ['body.puffer', 'body.hedgehog'],
    },
    effect: { type: 'grantTrait', trait: 'spiky_puffer' },
    extraEffects: [{ type: 'statAdd', stat: 'hp', add: 12 }],
    ui: {
      tone: 'buff',
      text: {
        zh: '拼色彩蛋 · 带刺弹力球：弹开对手同时附带双倍反伤',
        en: 'Fusion · Spiky Puffer: Knockback + double thorns',
      },
    },
  },
  {
    id: 'combo_thorn_turtle',
    name: { zh: '反甲铁龟', en: 'Thorn Turtle' },
    when: {
      bodyFusionAll: ['body.turtle', 'body.hedgehog'],
    },
    effect: { type: 'grantTrait', trait: 'thorn_turtle' },
    extraEffects: [{ type: 'statAdd', stat: 'def', add: 4 }],
    ui: {
      tone: 'buff',
      text: {
        zh: '拼色彩蛋 · 反甲铁龟：超高防御 + 强力贴身反刺',
        en: 'Fusion · Thorn Turtle: Heavy armor + boosted thorns',
      },
    },
  },
  {
    id: 'conflict_too_heavy_to_fly',
    name: { zh: '太沉啦飞不动！', en: 'Too Heavy to Fly!' },
    when: {
      slotAnyIds: {
        wings: ['wings.dragonfly', 'wings.bat'],
      },
      anyIds: ['body.turtle', 'body.iron', 'legs.elephant', 'wings.shield'],
    },
    effect: { type: 'grantTag', tag: 'grounded' },
    extraEffects: [{ type: 'statMul', stat: 'spd', mul: 0.85 }],
    ui: {
      tone: 'debuff',
      text: {
        zh: '物理冲突 · 太沉啦飞不动！换轻躯干或改用喷气推进翼',
        en: 'Conflict · Too heavy to fly! Try a lighter body or Jet Wings',
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
