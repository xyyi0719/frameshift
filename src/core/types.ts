/**
 * FRAMESHIFT — 契约类型（唯一真源）
 * ---------------------------------------------------------------
 * 这个文件由「需求与规格」负责人维护，A / B 两个实现代理都只能 *读*，不能改。
 * 需要新增字段：先找负责人确认，再统一改这里，两边同一天对齐。
 *
 * 设计原则：
 *  1. 本文件只有类型与常量性的「形状」，没有任何函数实现、没有任何 import。
 *  2. A 负责产出这些类型的运行时对象；B 只消费它们，绝不自己重算生物学。
 *  3. 所有面向玩家的文案（英文）都在数据层给好，UI 层不要硬编码生物学名词。
 */

/* ==========================================================================
 * 1. 字母 / 密码子 / 零件
 * ========================================================================== */

/** DNA/RNA 字母表。游戏里统一用 RNA 写法（U 代替 T）。 */
export type Base = 'A' | 'U' | 'G' | 'C';

/** 碱基字母的固定顺序。UI 调色板、按钮、图例列都按这个顺序排。 */
export const BASE_ORDER = ['A', 'U', 'G', 'C'] as const;

/** 三个字母组成的密码子字符串，例如 "AUG"。运行时只保证长度为 3 且字符合法。 */
export type Codon = string;

/** 家族 = 密码子第一个字母。A=感官/头，U=肢体，G=外壳/外骨骼，C=内脏/发光。 */
export type Family = 'A' | 'U' | 'G' | 'C';

/**
 * 变体 = 密码子第三个字母，决定家族里的具体零件。
 * G = 基础型，A = 长/大型，C = 尖/刃型，U = 膜/鳍型。
 * 中间那个字母是「沉默位」：不参与决定零件（见 SPEC 第 2.1 节）。
 */
export type Variant = 'G' | 'A' | 'C' | 'U';

/** 16 种身体零件 + 终止。id 同时也是美术绘制的 switch key。 */
export type PartId =
  | 'head'      // A?G 头（起始密码子长出来的就是它）
  | 'eye'       // A?C 眼
  | 'horn'      // A?A 角
  | 'antenna'   // A?U 触角
  | 'leg'       // U?G 腿
  | 'longleg'   // U?A 长腿
  | 'claw'      // U?C 爪
  | 'fin'       // U?U 鳍足
  | 'shell'     // G?G 甲
  | 'spike'     // G?C 刺
  | 'crest'     // G?A 冠
  | 'wing'      // G?U 翼
  | 'glow'      // C?G 发光器
  | 'maw'       // C?C 口器
  | 'sac'       // C?A 气囊
  | 'gill';     // C?U 鳃

/**
 * 九种身体属性。跑道上的每个闸门都在检查这里的某一项。
 * 语义（必须由 A 的 phenotype() 严格实现）：
 *  - stride 步幅：腿 2 / 长腿 3 / 爪 1
 *  - flight 升力：翼 2
 *  - swim   泳力：鳍足 2 / 鳃 2 / 气囊 1
 *  - armor  护甲：甲 2 / 冠 1 / 气囊 1
 *  - spikes 尖刺：刺 2 / 角 2
 *  - glow   发光：发光器 2
 *  - sight  感知：头 1 / 眼 2 / 触角 1
 *  - grip   抓握：爪 2
 *  - bite   咬合：口器 2
 */
export type StatKey =
  | 'stride'
  | 'flight'
  | 'swim'
  | 'armor'
  | 'spikes'
  | 'glow'
  | 'sight'
  | 'grip'
  | 'bite';

/** 固定顺序，HUD / 图例 / 调试输出都按这个顺序。 */
export const STAT_ORDER = [
  'stride',
  'flight',
  'swim',
  'armor',
  'spikes',
  'glow',
  'sight',
  'grip',
  'bite',
] as const;

/** 一个零件类型的静态定义（不是某一只生物身上的实例）。 */
export interface PartDefinition {
  readonly id: PartId;
  /** 英文显示名，例如 "Long Leg"。UI 直接显示，不要自己拼。 */
  readonly label: string;
  /** 家族（= 第一个碱基）。 */
  readonly family: Family;
  /** 变体（= 第三个碱基）。 */
  readonly variant: Variant;
  /** 它给身体加的属性；0 项也要给空对象。 */
  readonly stats: Readonly<Partial<Record<StatKey, number>>>;
  /** 一句英文风味描述，用于 hover 提示 / 标本罐。 */
  readonly blurb: string;
}

/** 生物身上真实存在的一个零件实例（按读取顺序排列）。 */
export interface Part {
  /** 在零件链里的序号，0 起，恒等于 Gene.parts 中的下标。 */
  readonly index: number;
  readonly id: PartId;
  readonly family: Family;
  readonly variant: Variant;
  /** 译出它的密码子，例如 "UCG"。 */
  readonly codon: Codon;
  /** 该密码子在整条序列里的起始碱基下标。 */
  readonly start: number;
  /** 指向静态定义，B 可直接取 label / stats，不必再查表。 */
  readonly definition: PartDefinition;
}

/* ==========================================================================
 * 2. 基因（解码结果）
 * ========================================================================== */

/**
 * 解码失败的原因。null 表示这条基因可以发育成一只生物。
 * - empty      : 空序列
 * - bad_char   : 出现 A/U/G/C 以外的字符
 * - no_start   : 找不到 AUG
 * - no_stop    : 有 AUG，但在序列结束前没有遇到终止密码子
 */
export type GeneIssue = 'empty' | 'bad_char' | 'no_start' | 'no_stop';

/**
 * 密码子槽位：基因带上「怎么分组」的唯一权威描述。
 * 基因带 UI 必须完全按这个数组渲染分组，不要自己按 index%3 切。
 */
export interface CodonSlot {
  /** 槽位序号，从 0 开始，按 start 升序。 */
  readonly index: number;
  /** 该槽位第一个碱基在序列中的下标。 */
  readonly start: number;
  /** 槽位里的碱基，1~3 个（末尾残缺密码子是 1 或 2 个）。 */
  readonly bases: readonly Base[];
  /** 槽位文本，例如 "AUG"；残缺槽位就是 1~2 个字母。 */
  readonly text: string;
  /**
   * 角色：
   * - 'junk'    起始密码子之前的碱基（不翻译，暗淡显示，仍可编辑）
   * - 'start'   起始密码子 AUG（它同时也译出 head 零件）
   * - 'part'    普通零件密码子
   * - 'stop'    终止密码子（UAA/UAG/UGA），不产生零件
   * - 'partial' 序列末尾不足 3 个碱基的残片（不翻译，暗淡显示）
   * - 'trailer' 终止密码子之后的碱基（不翻译，暗淡显示）
   */
  readonly role: 'junk' | 'start' | 'part' | 'stop' | 'partial' | 'trailer';
  /** 该槽位译出的零件；junk/stop/partial/trailer 为 null。 */
  readonly partId: PartId | null;
}

/** 一条序列的完整解码结果。A 的 decode() 返回它，B 只读。 */
export interface Gene {
  /** 原始序列，大写，只含 A/U/G/C。非法字符会被原样保留在 seq 里但 issue='bad_char'。 */
  readonly seq: string;
  /** seq 逐字符拆开，供渲染层按下标取用。 */
  readonly bases: readonly Base[];
  /** null = 可以发育；否则是失败原因。 */
  readonly issue: GeneIssue | null;
  /**
   * 读框起点：有 AUG 时 = 第一个 AUG 的下标；没有 AUG 时 = 0。
   * 基因带的分组、插入/删除后的「滑一格」都以它为基准。
   */
  readonly frameStart: number;
  /** 第一个 AUG 的下标；没有则 -1。 */
  readonly startIndex: number;
  /** 终止密码子的起始下标；没有则 -1。 */
  readonly stopIndex: number;
  /** 终止密码子文本（"UAA" 等）；没有则 null。 */
  readonly stopCodon: Codon | null;
  /** 完整槽位表（含 junk / stop / trailer / partial），按 start 升序。 */
  readonly codons: readonly CodonSlot[];
  /** 只含真正长出来的零件，顺序 = 读取顺序，index 连续。 */
  readonly parts: readonly Part[];
  /** 终止密码子之后第一个碱基的下标（不翻译区起点）；无终止时 = seq.length。 */
  readonly trailerStart: number;
}

/* ==========================================================================
 * 3. 表型
 * ========================================================================== */

/** 跑动风格，B 用它挑动画：没有腿就蠕动，有翼就滑翔，等等。 */
export type Locomotion = 'none' | 'walk' | 'fly' | 'swim' | 'mixed';

/** 由零件链推导出的身体。judge() 只看它，不看序列。 */
export interface Phenotype {
  /** 九项属性的求和，缺省为 0，保证每一项都存在。 */
  readonly stats: Readonly<Record<StatKey, number>>;
  /** 零件数。 */
  readonly size: number;
  /** 零件链本体（与 Gene.parts 同一引用）。 */
  readonly parts: readonly Part[];
  /** 每个家族贡献了几个零件，用于「身体构成」小图。 */
  readonly families: Readonly<Record<Family, number>>;
  /** 移动方式，推导规则见 SPEC 2.6。 */
  readonly locomotion: Locomotion;
}

/* ==========================================================================
 * 4. 编辑
 * ========================================================================== */

/** 三种手术。replace 在早期关卡被锁。 */
export type EditOp = 'insert' | 'delete' | 'replace';

/** 编辑请求：UI 层构造，交给 Session。 */
export interface EditRequest {
  readonly op: EditOp;
  /**
   * 目标下标。
   * - insert  : 新碱基插在 index 位置之前；合法范围 0..seq.length（含末尾）
   * - delete  : 删除 index 位置的碱基；合法范围 0..seq.length-1
   * - replace : 把 index 位置的碱基换成 base；合法范围 0..seq.length-1
   */
  readonly index: number;
  /** insert / replace 必填；delete 忽略。 */
  readonly base?: Base;
}

/** 一次已发生的编辑（撤销栈里存的就是它）。 */
export interface Edit {
  readonly op: EditOp;
  readonly index: number;
  /** insert/replace 写入的碱基。 */
  readonly base?: Base;
  /** delete 移除的碱基；replace 被替换掉的碱基。 */
  readonly removed?: Base;
}

/** 编辑被拒绝的原因（不会抛异常，全部走返回值）。 */
export type EditRejection =
  | 'locked_op'          // 本关没解锁这种手术
  | 'no_budget'          // 编辑额度用完
  | 'index_out_of_range' // 下标越界
  | 'invalid_base'       // base 不是 A/U/G/C（或 insert/replace 没给 base）
  | 'too_long'           // 序列超过 MAX_SEQUENCE_LENGTH
  | 'no_change';         // replace 成同一个字母

/** 编辑结果：判别联合，先看 ok。 */
export type EditResult =
  | {
      readonly ok: true;
      readonly edit: Edit;
      readonly gene: Gene;
      readonly phenotype: Phenotype;
      readonly budgetUsed: number;
    }
  | {
      readonly ok: false;
      readonly reason: EditRejection;
    };

/* ==========================================================================
 * 5. 差异（给「整段滑一格」的动画用）
 * ========================================================================== */

export type PartChangeKind = 'kept' | 'flipped' | 'appeared' | 'vanished';

/** 零件链按序号对齐后，每个位置的去留。 */
export interface PartChange {
  readonly index: number;
  readonly kind: PartChangeKind;
  readonly before: Part | null;
  readonly after: Part | null;
}

/**
 * 一次编辑前后基因的结构性差异。B 的动画全部由它驱动，不要自己 diff 字符串。
 */
export interface GeneDiff {
  readonly edit: Edit;
  /**
   * 接缝：编辑发生处的碱基下标（insert 就是插入点，delete 是被删处，replace 是被换处）。
   * 接缝左侧的碱基分组不变，右侧全体位移。
   */
  readonly seam: number;
  /**
   * 读框位移量：
   * - insert : +1（接缝及其右侧的碱基都往后挪一格）
   * - delete : -1
   * - replace: 0（不发生位移，只有单个零件翻转）
   */
  readonly shiftBy: -1 | 0 | 1;
  /** 按零件序号对齐的逐项变化，长度 = max(before.parts.length, after.parts.length)。 */
  readonly partChanges: readonly PartChange[];
  /** 第一个发生变化的零件序号；完全没有变化（例如换了沉默位）时为 -1。 */
  readonly firstChange: number;
  /** 编辑是否改变了合法性（例如把 AUG 删掉了）。 */
  readonly validityChanged: boolean;
  /** 编辑前的解码结果，方便动画做前后对照。 */
  readonly before: Gene;
  /** 编辑后的解码结果，等于 Session.gene。 */
  readonly after: Gene;
}

/* ==========================================================================
 * 6. 关卡 / 闸门 / 判定
 * ========================================================================== */

/** 闸门类型决定 B 画什么障碍物；判定逻辑与 kind 无关，只看 requires。 */
export type GateKind = 'chasm' | 'thorn' | 'dark' | 'water';

/** 一条属性要求。 */
export interface StatRequirement {
  readonly stat: StatKey;
  readonly min: number;
}

/** 跑道上的一个闸门。 */
export interface Gate {
  readonly id: string;
  readonly kind: GateKind;
  /** 英文短名，例如 "The Crack"。 */
  readonly label: string;
  /** 英文提示，例如 "4 m across. Legs, or wings." */
  readonly hint: string;
  /** 归一化位置 0..1（0 = 起跑线，1 = 终点线）。 */
  readonly at: number;
  /** all = 所有要求都满足；any = 满足一条即可。 */
  readonly mode: 'all' | 'any';
  readonly requires: readonly StatRequirement[];
}

/** 单个闸门的判定明细。 */
export interface GateCheck {
  readonly gateId: string;
  readonly passed: boolean;
  /** 逐条要求的实际值 vs 要求值，UI 用来显示 "2 / 4"。 */
  readonly checks: readonly {
    readonly stat: StatKey;
    readonly actual: number;
    readonly min: number;
    readonly met: boolean;
  }[];
}

/** 整次跑道的判定结果。 */
export interface Judgement {
  /** pass = 通关；fail = 有闸门没过；invalid = 基因本身就不能发育。 */
  readonly outcome: 'pass' | 'fail' | 'invalid';
  readonly reason: 'passed' | 'gate_failed' | 'no_start' | 'no_stop';
  /** 每个闸门的明细，invalid 时为空数组。 */
  readonly gates: readonly GateCheck[];
  /** 第一个失败的闸门下标；没有则 null。 */
  readonly failedGateIndex: number | null;
  /**
   * 失败发生的归一化 x（0..1）；成功或无闸门失败时 = 1。
   * B 用它决定「跑到哪儿摔倒」。
   */
  readonly failAtX: number;
  readonly phenotype: Phenotype;
}

/** 一个关卡的全部数据。纯数据，无函数，方便以后搬到 JSON。 */
export interface Level {
  /** 稳定 id，例如 "l01" / "l02"。 */
  readonly id: string;
  /** 显示用序号，从 1 开始。 */
  readonly number: number;
  /** 英文关名，例如 "One Base Short"。 */
  readonly name: string;
  /** 英文物种名，例如 "Gill Blob"。 */
  readonly species: string;
  /** 英文目标句（主界面最大的一行字）。 */
  readonly target: string;
  /** 英文提示（失败后浮现，别直接给答案）。 */
  readonly hint: string;
  /** 英文开场白，1~2 句。 */
  readonly intro: string;
  /** 初始序列，大写，只含 A/U/G/C。 */
  readonly sequence: string;
  /** 编辑额度：整局允许的净编辑次数。 */
  readonly budget: number;
  /** 本关解锁的手术。前两关是 ['insert','delete']。 */
  readonly ops: readonly EditOp[];
  /** 跑道闸门，按 at 升序。 */
  readonly gates: readonly Gate[];
  /** HUD 上要显示的属性（按给定顺序），别把九项都塞上去。 */
  readonly hudStats: readonly StatKey[];
  /** 设计解用了几刀（用于 "par" 显示，不做硬判定）。 */
  readonly parEdits: number;
  /** 内部备注：预期解法，只在调试面板显示。 */
  readonly solutionNote: string;
}

/* ==========================================================================
 * 7. Session 事件
 * ========================================================================== */

export type SessionEvent =
  | {
      readonly type: 'edit';
      readonly edit: Edit;
      readonly diff: GeneDiff;
      readonly gene: Gene;
      readonly phenotype: Phenotype;
      readonly budgetUsed: number;
    }
  | {
      readonly type: 'undo';
      readonly edit: Edit;
      readonly gene: Gene;
      readonly phenotype: Phenotype;
      readonly budgetUsed: number;
    }
  | {
      readonly type: 'reset';
      readonly gene: Gene;
      readonly phenotype: Phenotype;
      readonly budgetUsed: number;
    };

/** 取消订阅函数。 */
export type Unsubscribe = () => void;

/* ==========================================================================
 * 8. 常量（A 的运行时也必须用这些值，别写魔法数字）
 * ========================================================================== */

/** 序列长度上限：超过就不允许再插入，防止玩家把基因组撑爆。 */
export const MAX_SEQUENCE_LENGTH = 64;

/** 终止密码子集合。 */
export const STOP_CODONS = ['UAA', 'UAG', 'UGA'] as const;

/** 起始密码子。 */
export const START_CODON = 'AUG';

/** 合法的碱基集合。 */
export const BASES: readonly Base[] = BASE_ORDER;

/** 判定一个字符是不是碱基（B 做输入/展示时可以复用）。 */
export type BaseGuard = (ch: string) => ch is Base;
