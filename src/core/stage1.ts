/**
 * 第 1 关（教学关 · 菜园初遇）配置与肉鸽三选一掉落生成器（纯函数）
 * ---------------------------------------------------------------
 * 对齐 P-031 ~ P-034：
 *   - 第 1 关三波递进教学遭遇（弹跳大青蛙 → 硬壳刺猬龟 → 机械青蛙王）；
 *   - 展示第 1 关可遇到的动物/机械及对应可掉落零件；
 *   - 击败每波后触发「随机三选一」盲盒零件选择，智能标注叠阶 / 拼色融合 / 彩蛋预告！
 */

import { PART_BY_ID } from '../data/parts';
import { applyEdit, MAX_BODY_FUSION, MAX_PART_LEVEL } from './creature';
import { SYNERGIES } from './synergies';
import { deriveStats } from './stats';
import type { Creature, PartDef, SlotId } from './types';

export interface StageWaveDef {
  readonly id: string;
  readonly waveNumber: number;
  readonly name: string;
  readonly subtitle: string;
  readonly animalTag: string;
  readonly tip: string;
  readonly hp: number;
  readonly atk: number;
  readonly def: number;
  readonly spd: number;
  readonly aiStyle: 'hopper' | 'armored' | 'boss_flyer';
  readonly loadout: Partial<Record<SlotId, string[]>>;
  /** 本波击败后三选一掉落池（均来自该动物与同生态零件）。 */
  readonly dropPool: readonly string[];
}

export interface RewardOption {
  readonly def: PartDef;
  readonly badge: string;
  readonly badgeTone: 'upgrade' | 'fusion' | 'combo' | 'new';
  readonly comboHint?: string;
}

export const STAGE1_WAVES: readonly StageWaveDef[] = [
  {
    id: 's1-w1',
    waveNumber: 1,
    name: '弹跳大青蛙',
    subtitle: '第 1 关 · 第 1 波（操作教学）',
    animalTag: '菜园弹跳青蛙',
    tip: '它会高高跳起！跳在半空时地面攻击会 MISS——按 Space 跳起躲它的砸地，再趁它落地按 J 反击！',
    hp: 42,
    atk: 6,
    def: 1,
    spd: 75,
    aiStyle: 'hopper',
    loadout: {
      body: ['body.caterpillar'],
      legs: ['legs.frog'],
      beak: ['beak.chameleon'],
      tail: ['tail.gecko'],
    },
    dropPool: [
      'legs.frog',
      'beak.woodpecker',
      'beak.chameleon',
      'body.swift',
      'body.caterpillar',
      'crest.rabbit',
      'tail.gecko',
    ],
  },
  {
    id: 's1-w2',
    waveNumber: 2,
    name: '硬壳刺猬龟',
    subtitle: '第 1 关 · 第 2 波（拼色与破甲）',
    animalTag: '硬壳乌龟 × 刺猬',
    tip: '它身上融合了绿龟壳与刺猬刺，防高还会反伤！试试刚拿到的新零件，赢了再抽一件冲 2 阶或躯干 1/2 拼色！',
    hp: 68,
    atk: 8,
    def: 5,
    spd: 58,
    aiStyle: 'armored',
    loadout: {
      body: ['body.turtle', 'body.hedgehog'],
      legs: ['legs.elephant'],
      wings: ['wings.crab'],
      beak: ['beak.croc'],
      tail: ['tail.scorpion'],
    },
    dropPool: [
      'body.turtle',
      'body.hedgehog',
      'body.puffer',
      'wings.crab',
      'beak.croc',
      'tail.scorpion',
      'legs.frog',
      'legs.octopus',
    ],
  },
  {
    id: 's1-w3',
    waveNumber: 3,
    name: '机械弹跳蛙王',
    subtitle: '第 1 关 · 守关头目（立体对空）',
    animalTag: '废铁改造蛙王',
    tip: '它装了机械弹簧腿与蜻蜓翼，会滞空发射炮弹！用跳打、对空武器（长舌/炮口/电尾）或喷气翼拿下它！',
    hp: 96,
    atk: 11,
    def: 4,
    spd: 88,
    aiStyle: 'boss_flyer',
    loadout: {
      body: ['body.iron', 'body.puffer'],
      legs: ['legs.spring'],
      wings: ['wings.jetpack'],
      beak: ['beak.cannon'],
      tail: ['tail.tesla'],
      crest: ['crest.radar'],
    },
    dropPool: [
      'legs.spring',
      'wings.jetpack',
      'wings.dragonfly',
      'beak.chainsaw',
      'beak.cannon',
      'tail.tesla',
      'crest.rhino',
      'crest.radar',
      'crest.crown',
      'body.iron',
    ],
  },
];

/** 第 1 关图鉴预览：开场就能告诉玩家本关能遇到哪些动物、能爆哪些好东西。 */
export interface AnimalCatalogEntry {
  readonly name: string;
  readonly wave: number;
  readonly iconColor: string;
  readonly blurb: string;
  readonly sampleDrops: readonly string[];
}

export const STAGE1_CATALOG: readonly AnimalCatalogEntry[] = [
  {
    name: '弹跳大青蛙',
    wave: 1,
    iconColor: '#45c45e',
    blurb: '爱在空中一蹦一跳，掉落跳跃腿、对空长舌、轻量雨燕身等。',
    sampleDrops: ['legs.frog', 'beak.chameleon', 'body.swift', 'crest.rabbit'],
  },
  {
    name: '硬壳刺猬龟',
    wave: 2,
    iconColor: '#2f8c52',
    blurb: '绿棕双色拼壳反伤硬汉，掉落龟壳、刺猬身、河豚身与破甲大钳。',
    sampleDrops: ['body.turtle', 'body.hedgehog', 'body.puffer', 'wings.crab'],
  },
  {
    name: '机械弹跳蛙王',
    wave: 3,
    iconColor: '#ff7a24',
    blurb: '动物 × 废铁机械融合头目，掉落弹簧腿、喷气翼、电锯嘴与雷达锅。',
    sampleDrops: ['legs.spring', 'wings.jetpack', 'beak.chainsaw', 'crest.radar'],
  },
];

/** 生成「随机三选一」战利品卡片，自动预览叠阶 / 躯干拼色 / 彩蛋组合效果。 */
export function rollThreeRewards(
  wave: StageWaveDef,
  creature: Creature,
  seed: number,
): RewardOption[] {
  // 简易确定性洗牌
  let s = (seed ^ 0x9e3779b9) >>> 0;
  const nextRand = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };

  // 过滤掉已经满 3 阶的零件，避免抽到完全装不了的废卡
  const eligible = wave.dropPool.filter((id) => {
    const def = PART_BY_ID[id];
    if (!def) return false;
    const cur = creature.slots[def.slot].find((p) => p.defId === id);
    if (cur && cur.level >= MAX_PART_LEVEL) return false;
    return true;
  });

  const pool = [...(eligible.length >= 3 ? eligible : wave.dropPool)];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // 尽量让 3 张卡分布在不同零件（且优先把一个可叠阶或可拼色的惊喜放进去）
  const picked = pool.slice(0, 3);
  const currentCombos = new Set(deriveStats(creature, Object.values(PART_BY_ID), SYNERGIES).combos);

  return picked
    .map((id) => PART_BY_ID[id])
    .filter((d): d is PartDef => Boolean(d))
    .map((def): RewardOption => {
      const slotList = creature.slots[def.slot];
      const existing = slotList.find((p) => p.defId === def.id);
      const preview = applyEdit(creature, { type: 'equipOrUpgrade', slot: def.slot, defId: def.id });

      let comboHint: string | undefined;
      if (preview.ok) {
        const newNote = preview.notes.find(
          (n) => n.tone === 'buff' && !currentCombos.has(n.ruleId),
        );
        if (newNote) comboHint = newNote.text.zh;
      }

      if (comboHint) {
        return { def, badge: '✨ 可触发彩蛋组合', badgeTone: 'combo', comboHint };
      }
      if (existing && existing.level < MAX_PART_LEVEL) {
        const nextLv = existing.level + 1;
        return {
          def,
          badge: nextLv === 3 ? '⚡ 满阶觉醒 Lv.3（粒子爆发）' : `⬆ 叠强升阶 Lv.${nextLv}（变色发光）`,
          badgeTone: 'upgrade',
        };
      }
      if (def.slot === 'body' && slotList.length > 0 && slotList.length < MAX_BODY_FUSION) {
        return {
          def,
          badge: `🎨 躯干拼色融合（1/${slotList.length + 1}）`,
          badgeTone: 'fusion',
        };
      }
      return {
        def,
        badge: def.theme === 'mech' ? '⚙ 机械零件' : '🐾 动物零件',
        badgeTone: 'new',
      };
    });
}
