/**
 * 生物几何：脊柱、体厚、体节、锚点、IK（B 负责）。
 * ---------------------------------------------------------------
 * 纯函数 + 预计算表，不碰 ctx，方便调试与单测。
 * 数值全部照抄 docs/CREATURE.md §2 / §3.5 / §4.1。
 */

import type { Family, Locomotion, Part, PartId, Phenotype } from '../core';

export const TAU = Math.PI * 2;
export const SPINE_SAMPLES = 32;

/** 腹侧肢体（需要 IK 的零件）。 */
export type LimbKind = 'leg' | 'longleg' | 'claw' | 'fin';

const LIMB_KINDS: ReadonlySet<PartId> = new Set<PartId>(['leg', 'longleg', 'claw', 'fin']);

export function isLimb(id: PartId): id is LimbKind {
  return LIMB_KINDS.has(id);
}

/** 需要 scale(1,-1) 的背侧零件（+y = 离开脊柱 = 向上）。 */
const FLIP_PARTS: ReadonlySet<PartId> = new Set<PartId>([
  'horn',
  'antenna',
  'spike',
  'crest',
  'wing',
  'glow',
  'sac',
  'eye',
]);

export interface LimbRest {
  readonly partIndex: number;
  readonly id: LimbKind;
  readonly family: Family;
  readonly a: number;
  readonly b: number;
  readonly reach: number;
  readonly phase: number;
  readonly j: number;
  readonly far: boolean;
  /** 髋点（已内缩 0.26H）在身体局部坐标里的位置。 */
  readonly hx: number;
  readonly hy: number;
  readonly rot: number;
}

export interface Anchor {
  readonly partIndex: number;
  readonly id: PartId;
  readonly family: Family;
  readonly s: number;
  readonly x: number;
  readonly y: number;
  readonly rot: number;
  readonly flip: boolean;
  readonly size: number;
  readonly j: number;
  readonly m: number;
  /** 生长时从哪个角度切入（原点 = 锚点本身）。 */
  readonly growthOrigin: 'anchor' | 'hip';
}

export interface CreatureLayout {
  readonly phenotype: Phenotype;
  readonly n: number;
  readonly L: number;
  readonly H: number;
  readonly U: number;
  readonly locomotion: Locomotion;
  readonly segX: Float32Array;
  readonly segY: Float32Array;
  readonly segRX: Float32Array;
  readonly segRY: Float32Array;
  readonly segRot: Float32Array;
  readonly anchors: readonly Anchor[];
  readonly limbs: readonly LimbRest[];
  /** 走路时的基准抬升（含 0.26H + 0.80R），不含上下起伏。 */
  readonly liftWalk: number;
  /** 飞行/混合/游泳/无腿时的额外抬升。 */
  readonly liftExtra: number;
  /** 所有腹侧肢体的 R 中位数。 */
  readonly rMedian: number;
}

/* ==========================================================================
 * 脊柱与体厚
 * ========================================================================== */

/** 体厚剖面（§2.3），9 段线性表。 */
const PROFILE_S: readonly number[] = [0, 0.06, 0.14, 0.26, 0.4, 0.56, 0.7, 0.82, 0.92, 1];
const PROFILE_V: readonly number[] = [0.1, 0.34, 0.62, 0.86, 1, 1, 0.94, 0.8, 0.62, 0.34];

export function profileAt(s: number): number {
  const x = s <= 0 ? 0 : s >= 1 ? 1 : s;
  for (let i = 1; i < PROFILE_S.length; i += 1) {
    if (x <= PROFILE_S[i]) {
      const t = (x - PROFILE_S[i - 1]) / (PROFILE_S[i] - PROFILE_S[i - 1]);
      return PROFILE_V[i - 1] + (PROFILE_V[i] - PROFILE_V[i - 1]) * t;
    }
  }
  return PROFILE_V[PROFILE_V.length - 1];
}

function bodyLength(n: number): number {
  return Math.min(264, Math.max(104, 104 + 15 * (n - 1)));
}

function bodyHeight(n: number): number {
  return Math.min(52, Math.max(32, 32 + 1.6 * n));
}

/** 脊柱：尾尖 s=0 → 头端 s=1。返回局部坐标（身体中心为原点）。 */
export function spineAt(s: number, L: number, H: number): { x: number; y: number; tan: number } {
  const A = 0.09 * H;
  const x = -L / 2 + s * L;
  const y = -A * Math.sin(Math.PI * s);
  const dx = L;
  const dy = -A * Math.PI * Math.cos(Math.PI * s);
  return { x, y, tan: Math.atan2(dy, dx) };
}

/* ==========================================================================
 * IK
 * ========================================================================== */

export interface LegSolution {
  kneeX: number;
  kneeY: number;
  footX: number;
  footY: number;
  flex: number;
  d: number;
}

/**
 * 两骨骼 IK：髋在原点，脚目标 (fx, fy)（+x 前、+y 下）。膝盖朝前。
 * 三处 acos 全部 clamp；d 也 clamp，避免腿伸直/过近时变 NaN。
 */
export function solveLeg(a: number, b: number, fx: number, fy: number): LegSolution {
  const raw = Math.hypot(fx, fy);
  const d = Math.min(a + b - 1, Math.max(Math.abs(a - b) + 1, raw));
  const dir = Math.atan2(fx, fy);
  const beta = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  const psi = dir + beta;
  const kneeX = a * Math.sin(psi);
  const kneeY = a * Math.cos(psi);
  // 脚点按 d/raw 收回到可达范围，保证小腿长度恒为 b。
  const k = raw > 0 ? d / raw : 0;
  const footX = raw > 0 ? fx * k : 0;
  const footY = raw > 0 ? fy * k : d;
  const flex = Math.PI - Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
  return { kneeX, kneeY, footX, footY, flex, d };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function frac(x: number): number {
  return x - Math.floor(x);
}

export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/* ==========================================================================
 * 尺寸表
 * ========================================================================== */

/** 四肢 a/b（单位 U），§3.5。 */
function limbAB(id: LimbKind, U: number): { a: number; b: number } {
  switch (id) {
    case 'leg':
      return { a: 16 * U, b: 17 * U };
    case 'longleg':
      return { a: 22 * U, b: 23 * U };
    case 'claw':
      return { a: 14 * U, b: 15 * U };
    case 'fin':
      return { a: 11 * U, b: 10 * U };
    default: {
      const _never: never = id;
      void _never;
      return { a: 16 * U, b: 17 * U };
    }
  }
}

/* ==========================================================================
 * buildCreature
 * ========================================================================== */

export function buildCreature(phenotype: Phenotype): CreatureLayout {
  const n = phenotype.size;
  const L = bodyLength(n);
  const H = bodyHeight(n);
  const U = H / 48;

  // ---- 脊柱采样（只算一次）----
  const sx = new Float32Array(SPINE_SAMPLES + 1);
  const sy = new Float32Array(SPINE_SAMPLES + 1);
  const tan = new Float32Array(SPINE_SAMPLES + 1);
  for (let i = 0; i <= SPINE_SAMPLES; i += 1) {
    const p = spineAt(i / SPINE_SAMPLES, L, H);
    sx[i] = p.x;
    sy[i] = p.y;
    tan[i] = p.tan;
  }

  const sample = (s: number): { x: number; y: number; tan: number } => {
    const k = clamp(s, 0, 1) * SPINE_SAMPLES;
    const i = Math.min(SPINE_SAMPLES - 1, Math.floor(k));
    const f = k - i;
    return {
      x: sx[i] + (sx[i + 1] - sx[i]) * f,
      y: sy[i] + (sy[i + 1] - sy[i]) * f,
      tan: tan[i] + (tan[i + 1] - tan[i]) * f,
    };
  };

  // ---- 体节 ----
  const Nseg = clamp(Math.round(L / 23), 5, 13);
  const segX = new Float32Array(Nseg);
  const segY = new Float32Array(Nseg);
  const segRX = new Float32Array(Nseg);
  const segRY = new Float32Array(Nseg);
  const segRot = new Float32Array(Nseg);
  for (let k = 0; k < Nseg; k += 1) {
    const s = (k + 0.5) / Nseg;
    const p = sample(s);
    segX[k] = p.x;
    segY[k] = p.y;
    segRX[k] = (L / Nseg) * 0.7;
    segRY[k] = 0.5 * H * profileAt(s);
    segRot[k] = p.tan;
  }

  // ---- 分类 ----
  const groups = new Map<PartId, Part[]>();
  for (const part of phenotype.parts) {
    const list = groups.get(part.id) ?? [];
    list.push(part);
    groups.set(part.id, list);
  }
  const limbsParts: Part[] = [];
  for (const id of ['leg', 'longleg', 'claw', 'fin'] as const) {
    for (const part of groups.get(id) ?? []) limbsParts.push(part);
  }

  const anchors: Anchor[] = [];
  const limbs: LimbRest[] = [];
  const far = new Set<Part>();

  // 远侧：类别内序号为偶数的肢体压暗、先画（§3 的景深三层）
  limbsParts.forEach((part, j) => {
    if (j % 2 === 0) far.add(part);
  });

  const pushAnchor = (part: Part, s: number, rot: number, flip: boolean, size: number, j: number, m: number): void => {
    const p = sample(s);
    anchors.push({
      partIndex: part.index,
      id: part.id,
      family: part.family,
      s,
      x: p.x,
      y: p.y,
      rot: p.tan + rot,
      flip,
      size,
      j,
      m,
      growthOrigin: isLimb(part.id) ? 'hip' : 'anchor',
    });
  };

  const count = (id: PartId): number => (groups.get(id) ?? []).length;

  // 头
  const heads = groups.get('head') ?? [];
  heads.forEach((part, k) => pushAnchor(part, 0.96 - 0.1 * k, 0, false, 0.62 * H * Math.pow(0.72, k), k, heads.length));
  // 眼
  (groups.get('eye') ?? []).forEach((part, k) =>
    pushAnchor(part, 0.93 - 0.09 * k, -0.35, true, 8.6 * U * Math.pow(0.85, k), k, count('eye')),
  );
  // 角
  (groups.get('horn') ?? []).forEach((part, k) => pushAnchor(part, 0.88 - 0.07 * k, 0.28, true, 16 * U, k, count('horn')));
  // 触角
  (groups.get('antenna') ?? []).forEach((part, k) => pushAnchor(part, 0.91 - 0.06 * k, -0.6, true, 22 * U, k, count('antenna')));
  // 甲
  const shells = groups.get('shell') ?? [];
  shells.forEach((part, j) => pushAnchor(part, shells.length > 1 ? 0.34 + 0.46 * (j / (shells.length - 1)) : 0.56, -0.06, true, 20 * U, j, shells.length));
  // 刺
  const spikes = groups.get('spike') ?? [];
  spikes.forEach((part, j) => pushAnchor(part, spikes.length > 1 ? 0.3 + 0.5 * (j / (spikes.length - 1)) : 0.52, -0.06 * j, true, 13 * U, j, spikes.length));
  // 冠
  const crests = groups.get('crest') ?? [];
  crests.forEach((part, j) => pushAnchor(part, crests.length > 1 ? 0.28 + 0.54 * (j / (crests.length - 1)) : 0.55, 0, true, 12 * U, j, crests.length));
  // 翼
  const wings = groups.get('wing') ?? [];
  wings.forEach((part, j) => pushAnchor(part, wings.length > 1 ? 0.66 - 0.26 * (j / (wings.length - 1)) : 0.58, 0.38, true, 22 * U, j, wings.length));
  // 发光器
  (groups.get('glow') ?? []).forEach((part, j) => pushAnchor(part, Math.max(0.05, 0.16 - 0.07 * j), -0.2, true, 6 * U, j, count('glow')));
  // 口器
  (groups.get('maw') ?? []).forEach((part, k) => pushAnchor(part, 0.9, 0.17, false, 8 * U, k, count('maw')));
  // 气囊
  (groups.get('sac') ?? []).forEach((part, j) => pushAnchor(part, 0.26, -0.1, true, 15 * U, j, count('sac')));
  // 鳃
  (groups.get('gill') ?? []).forEach((part, j) => pushAnchor(part, Math.max(0.12, 0.44 - 0.08 * j), 0.1 * (j - 1), false, 12 * U, j, count('gill')));

  // 四肢：同类内等距 + 每类单独一条带子
  const limbOffset = 0;
  void limbOffset;
  const limbsByKind = new Map<LimbKind, Part[]>();
  for (const part of limbsParts) {
    if (!isLimb(part.id)) continue;
    const list = limbsByKind.get(part.id) ?? [];
    list.push(part);
    limbsByKind.set(part.id, list);
  }
  let limbJ = 0;
  for (const kind of ['leg', 'longleg', 'claw', 'fin'] as const) {
    const list = limbsByKind.get(kind) ?? [];
    const m = list.length;
    list.forEach((part, j) => {
      const s = m > 1 ? 0.7 - 0.44 * (j / (m - 1)) : 0.56;
      const p = sample(s);
      const { a, b } = limbAB(kind, U);
      // 髋点往体内缩 0.26H（沿旋转后的「向下」方向）
      const inward = 0.26 * H;
      const rot = p.tan;
      // frame 未翻转：+y 即向下；髋点沿旋转后的向下方向往体内缩。
      const hx = p.x + Math.sin(rot) * inward;
      const hy = p.y + Math.cos(rot) * inward;
      const phase = frac(limbJ * 0.5 + limbJ * 0.07);
      limbs.push({
        partIndex: part.index,
        id: kind,
        family: part.family,
        a,
        b,
        reach: a + b,
        phase,
        j: limbJ,
        far: far.has(part),
        hx,
        hy,
        rot,
      });
      anchors.push({
        partIndex: part.index,
        id: part.id,
        family: part.family,
        s,
        x: p.x,
        y: p.y,
        rot,
        flip: false,
        size: (a + b) / U,
        j,
        m,
        growthOrigin: 'hip',
      });
      limbJ += 1;
    });
  }

  anchors.sort((x, y) => x.partIndex - y.partIndex);
  const reaches = limbs.map((l) => l.reach).sort((x, y) => x - y);
  const rMedian = reaches.length > 0 ? reaches[Math.floor(reaches.length / 2)] : 0;

  const liftWalk = limbs.length > 0 ? 0.26 * H + 0.8 * rMedian : 0.5 * H * 0.92;
  let liftExtra = 0;
  switch (phenotype.locomotion) {
    case 'fly':
      liftExtra = 0.95 * H;
      break;
    case 'mixed':
      liftExtra = 0.3 * H;
      break;
    case 'swim':
      liftExtra = -0.4 * H * 0.0;
      break;
    default:
      liftExtra = 0;
      break;
  }

  return {
    phenotype,
    n,
    L,
    H,
    U,
    locomotion: phenotype.locomotion,
    segX,
    segY,
    segRX,
    segRY,
    segRot,
    anchors,
    limbs,
    liftWalk,
    liftExtra,
    rMedian,
  };
}
