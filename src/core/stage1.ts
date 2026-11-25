/**
 * 关卡目录（1~6 关）与第 1 关「2.5D 横版推进」配置（纯数据 + 掉落逻辑）
 * ---------------------------------------------------------------
 * 对齐 P-031 ~ P-038：
 *   - 6 关目录结构（1 关已解锁可玩，2~6 关带动物预告的锁定态）；
 *   - 第 1 关为 38m 立体横版推进关：
 *       起点教学区(0~10m) → 单细胞生物小怪(变形虫/草履虫) → 菜园小动物小怪(小刺猬/小青蛙)
 *       → 关底大怪 BOSS(巨型弹跳青蛙王，击败掉落 BOSS 技能/零件三选一) → 终点旗帜(36m)！
 */

import { PART_BY_ID } from '../data/parts';
import { applyEdit, MAX_BODY_FUSION, MAX_PART_LEVEL } from './creature';
import { SYNERGIES } from './synergies';
import { deriveStats } from './stats';
import type { Creature, PartDef } from './types';

export type EnemyKind = 'amoeba' | 'paramecium' | 'hedgehog_mob' | 'frog_mob' | 'boss_frog_king';

export interface LevelDirectoryItem {
  readonly number: number;
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly unlocked: boolean;
  readonly badge: string;
  readonly themeColor: string;
  readonly enemiesPreview: readonly string[];
  readonly dropsPreview: readonly string[];
}

export interface StageEncounter {
  readonly id: string;
  readonly kind: EnemyKind;
  readonly isBoss: boolean;
  readonly name: string;
  readonly bioTag: string;
  readonly bioFact: string;
  readonly spawnX: number;
  readonly hp: number;
  readonly atk: number;
  readonly def: number;
  readonly spd: number;
  readonly aiStyle: 'crawl' | 'glide_cell' | 'roller' | 'hopper' | 'boss_king';
  /** 击败该遭遇（或整组小怪）是否触发一次随机三选一。 */
  readonly triggersLoot?: boolean;
  readonly lootTitle?: string;
  readonly dropPool?: readonly string[];
}

export interface RewardOption {
  readonly def: PartDef;
  readonly badge: string;
  readonly badgeTone: 'upgrade' | 'fusion' | 'combo' | 'boss' | 'new';
  readonly comboHint?: string;
}

export const STAGE1_LENGTH = 36;
export const STAGE1_HURDLE_X = 6.2;

/** 关卡目录：1 ~ 6 关（P-035） */
export const LEVEL_DIRECTORY: readonly LevelDirectoryItem[] = [
  {
    number: 1,
    id: 'stage-1',
    name: '微光池畔 · 生命初遇',
    subtitle: '第 1 关 · 教学与进化启蒙',
    unlocked: true,
    badge: '新手教学 · 可玩',
    themeColor: '#45c45e',
    enemiesPreview: ['变形虫', '草履虫', '菜园小刺猬', 'BOSS 弹跳青蛙王'],
    dropsPreview: ['legs.frog', 'body.caterpillar', 'body.hedgehog', 'beak.chameleon'],
  },
  {
    number: 2,
    id: 'stage-2',
    name: '硬壳小丘',
    subtitle: '第 2 关 · 护甲与反伤试炼',
    unlocked: false,
    badge: '即将开放',
    themeColor: '#2f8c52',
    enemiesPreview: ['硬壳小乌龟', '鼓气河豚', 'BOSS 重甲刺猬龟'],
    dropsPreview: ['body.turtle', 'body.puffer', 'wings.crab'],
  },
  {
    number: 3,
    id: 'stage-3',
    name: '潮汐河滩',
    subtitle: '第 3 关 · 钳击与巨颚',
    unlocked: false,
    badge: '即将开放',
    themeColor: '#e64a3e',
    enemiesPreview: ['横行小蟹', '刀锋螳螂', 'BOSS 河滩鳄鱼王'],
    dropsPreview: ['wings.crab', 'wings.mantis', 'beak.croc'],
  },
  {
    number: 4,
    id: 'stage-4',
    name: '风铃湿地',
    subtitle: '第 4 关 · 立体对空战',
    unlocked: false,
    badge: '即将开放',
    themeColor: '#5cd8f0',
    enemiesPreview: ['水畔蜻蜓', '夜行蝙蝠', 'BOSS 天穹雨燕'],
    dropsPreview: ['wings.dragonfly', 'wings.bat', 'body.swift'],
  },
  {
    number: 5,
    id: 'stage-5',
    name: '幽暗毒沼',
    subtitle: '第 5 关 · 施毒与缠绕',
    unlocked: false,
    badge: '即将开放',
    themeColor: '#8b3db8',
    enemiesPreview: ['毒尾小蝎', '深海章鱼', 'BOSS 断尾毒蜥'],
    dropsPreview: ['tail.scorpion', 'legs.octopus', 'tail.gecko'],
  },
  {
    number: 6,
    id: 'stage-6',
    name: '废铁工坊',
    subtitle: '第 6 关 · 动物 × 机械融合',
    unlocked: false,
    badge: '即将开放',
    themeColor: '#ff7a24',
    enemiesPreview: ['弹簧铁兵', '电锯发条鸡', 'BOSS 缝合机械霸王'],
    dropsPreview: ['legs.spring', 'wings.jetpack', 'beak.chainsaw', 'crest.radar'],
  },
];

/** 第 1 关横版 36m 遭遇序列：先单细胞生物小怪 → 再菜园小动物 → 关底大怪 BOSS（P-038） */
export const STAGE1_ENCOUNTERS: readonly StageEncounter[] = [
  {
    id: 'mob-amoeba-1',
    kind: 'amoeba',
    isBoss: false,
    name: '绿藻变形虫',
    bioTag: '单细胞生物 · 伪足运动',
    bioFact: '变形虫没有固定形状，靠伸出“伪足”向前爬行，是最经典的单细胞真核生物！',
    spawnX: 11.2,
    hp: 20,
    atk: 4,
    def: 0,
    spd: 46,
    aiStyle: 'crawl',
    triggersLoot: false,
  },
  {
    id: 'mob-paramecium-1',
    kind: 'paramecium',
    isBoss: false,
    name: '纤毛草履虫',
    bioTag: '单细胞生物 · 纤毛游动',
    bioFact: '草履虫长得像一只倒放的草鞋，靠全身细密纤毛摆动在水中快速滑行！',
    spawnX: 15.8,
    hp: 26,
    atk: 5,
    def: 0,
    spd: 68,
    aiStyle: 'glide_cell',
    triggersLoot: true,
    lootTitle: '击败了单细胞群落！获得首次进化掉落',
    dropPool: [
      'body.caterpillar',
      'body.swift',
      'beak.woodpecker',
      'legs.frog',
      'crest.rabbit',
      'tail.gecko',
    ],
  },
  {
    id: 'mob-hedgehog-1',
    kind: 'hedgehog_mob',
    isBoss: false,
    name: '菜园小刺猬',
    bioTag: '多细胞小动物 · 硬刺防御',
    bioFact: '演化出体表硬刺的小型哺乳动物，遇到危险会竖起尖刺防身！',
    spawnX: 22.4,
    hp: 38,
    atk: 6,
    def: 2,
    spd: 62,
    aiStyle: 'roller',
    triggersLoot: false,
  },
  {
    id: 'mob-frog-1',
    kind: 'frog_mob',
    isBoss: false,
    name: '跳跳小青蛙',
    bioTag: '两栖小动物 · 后肢弹跳',
    bioFact: '强壮折叠的后肢赋予两栖动物跃向空中的能力，可轻松跳过地面障碍！',
    spawnX: 25.6,
    hp: 40,
    atk: 7,
    def: 1,
    spd: 74,
    aiStyle: 'hopper',
    triggersLoot: true,
    lootTitle: '击败了菜园小动物！再挑一件进化零件准备迎战 BOSS',
    dropPool: [
      'body.hedgehog',
      'body.turtle',
      'body.puffer',
      'legs.frog',
      'beak.chameleon',
      'wings.crab',
      'tail.scorpion',
    ],
  },
  {
    id: 'boss-frog-king',
    kind: 'boss_frog_king',
    isBoss: true,
    name: '巨型弹跳青蛙王',
    bioTag: '第 1 关大怪 BOSS · 技能持有者',
    bioFact: '池畔霸主！掌握「强力高跳砸地」与「远程黏液泡泡」，击败它可夺取它身上的招牌技能零件！',
    spawnX: 32.5,
    hp: 105,
    atk: 10,
    def: 3,
    spd: 82,
    aiStyle: 'boss_king',
    triggersLoot: true,
    lootTitle: '🏆 击败 BOSS 巨型弹跳青蛙王！夺取它的招牌技能零件',
    dropPool: [
      'legs.spring',
      'legs.frog',
      'beak.chameleon',
      'wings.dragonfly',
      'wings.jetpack',
      'body.turtle',
      'crest.rhino',
      'crest.crown',
    ],
  },
];

/** 保留旧导出别名以兼容单测或工具引用 */
export const STAGE1_WAVES = STAGE1_ENCOUNTERS;

export interface AnimalCatalogEntry {
  readonly name: string;
  readonly wave: number;
  readonly iconColor: string;
  readonly blurb: string;
  readonly sampleDrops: readonly string[];
}

export const STAGE1_CATALOG: readonly AnimalCatalogEntry[] = [
  {
    name: '单细胞群落（变形虫 / 草履虫）',
    wave: 1,
    iconColor: '#56e3b8',
    blurb: '生命起源的第一步：变形虫伪足爬行、草履虫纤毛滑行，掉落基础进化零件。',
    sampleDrops: ['body.caterpillar', 'body.swift', 'beak.woodpecker', 'crest.rabbit'],
  },
  {
    name: '菜园小动物（小刺猬 / 跳跳蛙）',
    wave: 2,
    iconColor: '#8b5a3c',
    blurb: '演化出硬刺与弹跳后肢的小动物，掉落刺猬身、乌龟壳、青蛙腿与长舌。',
    sampleDrops: ['body.hedgehog', 'body.turtle', 'legs.frog', 'beak.chameleon'],
  },
  {
    name: '关底 BOSS · 巨型弹跳青蛙王',
    wave: 3,
    iconColor: '#ff7a24',
    blurb: '池畔大怪！会蓄力高跳砸地与吐泡泡弹，击败后随机三选一夺取强力技能零件！',
    sampleDrops: ['legs.spring', 'beak.chameleon', 'wings.dragonfly', 'wings.jetpack'],
  },
];

/** 生成「随机三选一」战利品卡片，自动标注叠阶 / 躯干拼色 / BOSS 技能 / 彩蛋预告。 */
export function rollThreeRewards(
  dropPool: readonly string[],
  creature: Creature,
  seed: number,
  isBossLoot = false,
): RewardOption[] {
  let s = (seed ^ 0x9e3779b9) >>> 0;
  const nextRand = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const eligible = dropPool.filter((id) => {
    const def = PART_BY_ID[id];
    if (!def) return false;
    const cur = creature.slots[def.slot].find((p) => p.defId === id);
    if (cur && cur.level >= MAX_PART_LEVEL) return false;
    return true;
  });

  const pool = [...(eligible.length >= 3 ? eligible : dropPool)];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

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
        return { def, badge: '✨ 触发彩蛋组合', badgeTone: 'combo', comboHint };
      }
      if (existing && existing.level < MAX_PART_LEVEL) {
        const nextLv = existing.level + 1;
        return {
          def,
          badge: nextLv === 3 ? '⚡ 满阶觉醒 Lv.3' : `⬆ 叠强升阶 Lv.${nextLv}`,
          badgeTone: 'upgrade',
        };
      }
      if (def.slot === 'body' && slotList.length > 0 && slotList.length < MAX_BODY_FUSION) {
        return {
          def,
          badge: `🎨 躯干拼色（1/${slotList.length + 1}）`,
          badgeTone: 'fusion',
        };
      }
      if (isBossLoot) {
        return { def, badge: '👑 BOSS 招牌技能', badgeTone: 'boss' };
      }
      return {
        def,
        badge: def.theme === 'mech' ? '⚙ 机械零件' : '🐾 动物零件',
        badgeTone: 'new',
      };
    });
}
