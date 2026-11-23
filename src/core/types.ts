/**
 * 拼装小鸡 · 共享类型（A 负责，B 只读）
 * ---------------------------------------------------------------
 * 严格对齐 docs/INTERFACES.md。所有对外结构带 v；逻辑内核不依赖 DOM / three。
 * 单位约定：长度 1 = 1 分米；角度 = 度；战斗内部 HP/伤害用 1/1000 定点（milli-HP）。
 */

/* ==========================================================================
 * 1. 基础
 * ========================================================================== */

export type SlotId = 'body' | 'beak' | 'legs' | 'wings' | 'tail' | 'crest';

/** 固定槽位顺序（UI 侧栏、布局、序列化都按它）。 */
export const SLOT_IDS = ['body', 'beak', 'legs', 'wings', 'tail', 'crest'] as const;

export type Stage = 1 | 2 | 3;

export type Side = 'left' | 'right';

/** 主动技 id；M0 只做事件表现，数值效果保持极简。 */
export type AbilityId = string;

/** 属性增量（部件）或最终值（CreatureStats 复用同名字段）。 */
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

/**
 * 程序化几何生成 key。约定为 `${slot}.${variant}`，
 * 例如 `legs.spring`。B 必须按这个 key 建几何，不要在渲染层按 id 分支。
 */
export type GeometryKey = string;

export interface PartArt {
  /** 程序化几何 key（= `${slot}.${variant}`）。 */
  geometry: GeometryKey;
  material: 'skin' | 'metal' | 'feather' | 'bone';
  /** 挂到骨架的哪个节点。 */
  anchor: SlotId;
  /** 相对锚点的位移（1 单位 = 1 分米）。 */
  offset: [number, number, number];
  /** 欧拉角，度。 */
  rotation: [number, number, number];
  scale: number;
  /** 腿/翼成对时的左右镜像提示。 */
  mirrored?: boolean;
}

export interface PartDef {
  /** 'legs.spring'，命名空间 = 槽位。 */
  id: string;
  name: LocalizedText;
  desc: LocalizedText;
  slot: SlotId;
  tier: 1 | 2 | 3;
  /** 占槽容量；M0 不校验，仅记录。 */
  size: 1 | 2 | 3;
  /** 整数重量，影响速度/起飞。 */
  mass: number;
  /** 增量属性，不是绝对值；缺省按 0。 */
  stats: Partial<Stats>;
  /** 'light' | 'jump' | 'armor' | 'fly' ... */
  tags: readonly string[];
  /** 战斗主动技（可选）。 */
  ability?: AbilityId;
  art: PartArt;
  /** M0 不校验，保留给 M2。 */
  unlock: { level?: number; cost?: number };
}

/* ==========================================================================
 * 3. 运行时：生物
 * ========================================================================== */

export interface PartInstance {
  /** 指向 PartDef.id。 */
  defId: string;
  /** 强化等级，影响 stats 倍率。 */
  level: 1 | 2 | 3;
}

/** 槽位 → 零件列表；可重复挂载，M0 允许 10 条腿。 */
export type SlotMap = Record<SlotId, PartInstance[]>;

export interface Creature {
  v: 1;
  /** 本地 uuid / 玩家标识。 */
  id: string;
  stage: Stage;
  slots: SlotMap;
  skin?: string;
}

export interface CreatureStats {
  v: 1;
  /** 最终 HP（不是增量）。 */
  hp: number;
  /** 最终 ATK（不是增量）。 */
  atk: number;
  /** 最终 DEF（不是增量）。 */
  def: number;
  /** 最终 SPD，约 5..300。 */
  spd: number;
  mass: number;
  capacity: number;
  /** 生效标签（零件 + 协同），去重且有序。 */
  tags: string[];
  abilities: AbilityId[];
  flags: {
    grounded: boolean;
    canGlide: boolean;
    overloaded: boolean;
  };
}

/** 挂点求解结果；渲染层只消费它，不做布局。 */
export interface PlacedPart {
  defId: string;
  /** 1 单位 = 1 分米，身体沿 +x。 */
  position: [number, number, number];
  /** 欧拉角，度。 */
  rotation: [number, number, number];
  scale: number;
  /** 同 defId 的实例可共享几何；这里带序号保证唯一。 */
  instanceKey: string;
}

/* ==========================================================================
 * 4. 协同规则
 * ========================================================================== */

export interface SynergyCondition {
  /** 必须同时具备的标签。 */
  tags?: readonly string[];
  /** 槽位 → 部件 id 前缀（至少一个匹配）。 */
  slots?: Partial<Record<SlotId, string>>;
  maxMass?: number;
  minMass?: number;
  /** 某槽位至少 / 至多几个实例（用于“多腿”）。 */
  minCount?: Partial<Record<SlotId, number>>;
  maxCount?: Partial<Record<SlotId, number>>;
}

export type SynergyEffect =
  | { readonly type: 'grantTag'; readonly tag: string }
  | { readonly type: 'statMul'; readonly stat: keyof Stats; readonly mul: number }
  | { readonly type: 'statAdd'; readonly stat: keyof Stats; readonly add: number }
  | { readonly type: 'unlockAbility'; readonly ability: AbilityId };

export interface SynergyRule {
  id: string;
  when: SynergyCondition;
  effect: SynergyEffect;
  /** 可选附加效果，用于“提速但笨重”这类一条规则两个结果。 */
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
  | { type: 'addPart'; slot: SlotId; defId: string }
  | { type: 'removePart'; slot: SlotId; index: number }
  | { type: 'clearSlot'; slot: SlotId }
  | { type: 'upgrade'; slot: SlotId; index: number }
  | { type: 'changeSkin'; skin: string };

export type EditErrorCode =
  | 'slot_locked'
  | 'size_exceeded'
  | 'not_owned'
  | 'incompatible'
  | 'too_many';

export type EditResult =
  | {
      ok: true;
      creature: Creature;
      stats: CreatureStats;
      notes: SynergyNote[];
    }
  | { ok: false; code: EditErrorCode; detail?: string };

/* ==========================================================================
 * 6. 战斗
 * ========================================================================== */

export interface BattleSide {
  creatureId: string;
  stats: CreatureStats;
  /** 逻辑坐标（整数/定点由调用方决定，内核按传入值使用）。 */
  spawnX: number;
}

export interface BattleConfig {
  v: 1;
  /** uint32 种子。 */
  seed: number;
  /** 默认 30。 */
  tickRate: 30;
  /** 上限 tick，默认 1800（60 秒）。 */
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
      /** 1/1000 定点伤害（milli-HP）。 */
      damage: number;
      crit: boolean;
    }
  | { tick: number; type: 'ability'; side: Side; ability: AbilityId; slot: SlotId }
  | { tick: number; type: 'die'; side: Side }
  | { tick: number; type: 'end'; winner: Side | 'draw'; reason: 'hp' | 'timeout' };

export interface BattleResult {
  v: 1;
  winner: Side | 'draw';
  /** 实际模拟的 tick 数（≤ maxTicks）。 */
  ticks: number;
  /** 剩余 HP，1/1000 定点（milli-HP）。 */
  remainingHp: { left: number; right: number };
  events: BattleEvent[];
  /** 状态哈希，用于回放校验。 */
  hash: string;
}
