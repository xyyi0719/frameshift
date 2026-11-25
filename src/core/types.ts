/**
 * 拼装小鸡 · 共享类型（逻辑内核纯 TS，无 DOM / three 依赖）
 * ---------------------------------------------------------------
 * 支持：
 *   - 6 部位跨动物 + 机械混搭（P-013, P-014, P-017）
 *   - 同件叠强 1~3 阶、躯干最多 3 种异件融合拼色（P-022, P-025, P-026, P-027）
 *   - 部位内精简版造型微调（P-028，仅影响造型，不影响战斗）
 *   - 8 组精确归属特殊组合与冲突（P-030）
 */

/* ==========================================================================
 * 1. 基础
 * ========================================================================== */

export type SlotId = 'body' | 'beak' | 'legs' | 'wings' | 'tail' | 'crest';

/** 固定槽位顺序（UI 侧栏、布局、序列化都按它）。 */
export const SLOT_IDS = ['body', 'beak', 'legs', 'wings', 'tail', 'crest'] as const;

export type Stage = 1 | 2 | 3;

export type Side = 'left' | 'right';

export type AbilityId = string;

export type PartTheme = 'animal' | 'mech';

export type PatternKind =
  | 'turtle'
  | 'hedgehog'
  | 'puffer'
  | 'swift'
  | 'caterpillar'
  | 'iron'
  | 'solid';

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

export interface LocalizedText {
  zh: string;
  en: string;
}

/* ==========================================================================
 * 2. 配置表：零件
 * ========================================================================== */

export type GeometryKey = string;

export interface PartArt {
  geometry: GeometryKey;
  material: 'skin' | 'metal' | 'feather' | 'bone';
  anchor: SlotId;
  offset: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  mirrored?: boolean;
  /** 主色调（hex，如 0x2f8c52），用于 3D 着色、分区拼色与 UI 色块。 */
  color: number;
  /** 辅色（用于图案点缀与 2/3 阶粒子色）。 */
  accentColor: number;
  /** 躯干表面纹样 key（P-025）。 */
  pattern?: PatternKind;
  /** 是否成对渲染（腿、侧肢默认成对，P-012）。 */
  paired?: boolean;
}

export interface PartDef {
  id: string;
  name: LocalizedText;
  desc: LocalizedText;
  /** 一句话核心玩法作用（P-007）。 */
  role: string;
  /** 来源动物或机械原型（用于第 1 关图鉴与战利品卡片）。 */
  source: string;
  theme: PartTheme;
  slot: SlotId;
  tier: 1 | 2 | 3;
  size: 1 | 2 | 3;
  mass: number;
  stats: Partial<Stats>;
  tags: readonly string[];
  /** 战斗机制特性标记（如 jump / glide / anti_air / thorns / poison 等）。 */
  traits: readonly string[];
  /** 攻击是否可直接命中空中目标（P-009）。 */
  canHitAir?: boolean;
  ability?: AbilityId;
  art: PartArt;
  unlock: { level?: number; cost?: number };
}

/* ==========================================================================
 * 3. 运行时：生物与造型微调
 * ========================================================================== */

export interface PartInstance {
  defId: string;
  /** 叠强阶数：1 阶基础 / 2 阶变色发光 / 3 阶满级粒子升阶（P-022, P-026）。 */
  level: 1 | 2 | 3;
}

/** 精简版部位内造型微调（P-028，仅影响 3D 外观，不参与战斗数值）。 */
export interface SlotTweak {
  offset: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}

export type SlotMap = Record<SlotId, PartInstance[]>;

export interface Creature {
  v: 1;
  id: string;
  stage: Stage;
  slots: SlotMap;
  tweaks?: Partial<Record<SlotId, SlotTweak>>;
  skin?: string;
}

export interface CreatureStats {
  v: 1;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  mass: number;
  capacity: number;
  tags: string[];
  traits: string[];
  combos: string[];
  abilities: AbilityId[];
  flags: {
    grounded: boolean;
    canGlide: boolean;
    overloaded: boolean;
    canJump: boolean;
    canHitAir: boolean;
  };
}

export interface PlacedPart {
  defId: string;
  slot: SlotId;
  level: 1 | 2 | 3;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  side: 'R' | 'L';
  instanceKey: string;
}

/* ==========================================================================
 * 4. 协同 / 特殊组合规则（P-007, P-030）
 * ========================================================================== */

export interface SynergyCondition {
  /** 全身必须同时具备的标签（兼容旧规则）。 */
  tags?: readonly string[];
  /** 指定槽位必须匹配的前缀。 */
  slots?: Partial<Record<SlotId, string>>;
  /** 精确按部位限定：每个指定部位至少包含列表中的任意一个 defId。 */
  slotAnyIds?: Partial<Record<SlotId, readonly string[]>>;
  /** 躯干同时融合包含的多个 defId（P-025 躯干拼色彩蛋）。 */
  bodyFusionAll?: readonly string[];
  /** 全身任意部位包含列表中至少一个 defId（用于物理冲突检查等）。 */
  anyIds?: readonly string[];
  /** 全身任意部位包含第二组列表中至少一个 defId。 */
  anyIds2?: readonly string[];
  maxMass?: number;
  minMass?: number;
  minCount?: Partial<Record<SlotId, number>>;
  maxCount?: Partial<Record<SlotId, number>>;
}

export type SynergyEffect =
  | { readonly type: 'grantTag'; readonly tag: string }
  | { readonly type: 'grantTrait'; readonly trait: string }
  | { readonly type: 'statMul'; readonly stat: keyof Stats; readonly mul: number }
  | { readonly type: 'statAdd'; readonly stat: keyof Stats; readonly add: number }
  | { readonly type: 'unlockAbility'; readonly ability: AbilityId };

export interface SynergyRule {
  id: string;
  name?: LocalizedText;
  when: SynergyCondition;
  effect: SynergyEffect;
  extraEffects?: readonly SynergyEffect[];
  ui: { text: LocalizedText; tone: 'buff' | 'debuff' };
}

export interface SynergyNote {
  ruleId: string;
  tone: 'buff' | 'debuff';
  text: LocalizedText;
}

/* ==========================================================================
 * 5. 装配交互
 * ========================================================================== */

export type EditIntent =
  | { type: 'equipOrUpgrade'; slot: SlotId; defId: string }
  | { type: 'downgradePart'; slot: SlotId; defId: string }
  | { type: 'addPart'; slot: SlotId; defId: string }
  | { type: 'removePart'; slot: SlotId; index: number }
  | { type: 'clearSlot'; slot: SlotId }
  | { type: 'upgrade'; slot: SlotId; index: number }
  | { type: 'setTweak'; slot: SlotId; tweak: SlotTweak }
  | { type: 'resetTweak'; slot: SlotId }
  | { type: 'resetAllTweaks' }
  | { type: 'changeSkin'; skin: string };

export type EditErrorCode =
  | 'slot_locked'
  | 'size_exceeded'
  | 'not_owned'
  | 'incompatible'
  | 'max_level'
  | 'fusion_full'
  | 'too_many';

export type EditResult =
  | {
      ok: true;
      creature: Creature;
      stats: CreatureStats;
      notes: SynergyNote[];
      action?: 'equipped' | 'upgraded' | 'replaced' | 'fused' | 'downgraded' | 'removed' | 'updated';
    }
  | { ok: false; code: EditErrorCode; detail?: string };

/* ==========================================================================
 * 6. 确定性一维战斗（保留单测兼容）
 * ========================================================================== */

export interface BattleSide {
  creatureId: string;
  stats: CreatureStats;
  spawnX: number;
}

export interface BattleConfig {
  v: 1;
  seed: number;
  tickRate: 30;
  maxTicks: number;
  arena: { width: number };
  left: BattleSide;
  right: BattleSide;
}

export interface BattleCommand {
  tick: number;
  side: Side;
  type: 'ability';
  slot: SlotId;
}

export type BattleEvent =
  | { tick: number; type: 'move'; side: Side; x: number }
  | {
      tick: number;
      type: 'attack';
      side: Side;
      target: Side;
      damage: number;
      crit: boolean;
    }
  | { tick: number; type: 'ability'; side: Side; ability: AbilityId; slot: SlotId }
  | { tick: number; type: 'die'; side: Side }
  | { tick: number; type: 'end'; winner: Side | 'draw'; reason: 'hp' | 'timeout' };

export interface BattleResult {
  v: 1;
  winner: Side | 'draw';
  ticks: number;
  remainingHp: { left: number; right: number };
  events: BattleEvent[];
  hash: string;
}
