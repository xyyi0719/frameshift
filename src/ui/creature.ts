/**
 * 把 Phenotype 拼成一只生物（B 负责）。
 * ---------------------------------------------------------------
 * 完全由 phenotype.parts 驱动：没有任何按关卡号写死的形状。
 * 这里只做「零件挂点」的排布与绘制，不做任何生物学判定。
 */

import type { Locomotion, Part, PartId, Phenotype } from '../core';
import { drawPart, withAlpha } from './parts-art';
import { breathe, clamp } from './anim';
import { FAMILY_COLORS } from './theme';

export type PartCategory = 'front' | 'belly' | 'back' | 'rear';

export interface CreatureSlot {
  readonly part: Part;
  /** 局部坐标（身体中心为原点）。 */
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly rotation: number;
  readonly category: PartCategory;
  /** 同类里的序号，用于步态错相。 */
  readonly ordinal: number;
}

export interface CreatureLayout {
  /** 身体胶囊长度（局部 px）。 */
  readonly length: number;
  /** 身体高度。 */
  readonly height: number;
  readonly locomotion: Locomotion;
  readonly slots: readonly CreatureSlot[];
}

/** 零件 → 挂点类别。 */
function categoryOf(id: PartId): PartCategory {
  switch (id) {
    case 'head':
    case 'eye':
    case 'horn':
    case 'antenna':
      return 'front';
    case 'leg':
    case 'longleg':
    case 'claw':
    case 'fin':
      return 'belly';
    case 'shell':
    case 'spike':
    case 'crest':
    case 'wing':
      return 'back';
    case 'glow':
    case 'maw':
    case 'sac':
    case 'gill':
      return 'rear';
    default: {
      const _never: never = id;
      void _never;
      return 'rear';
    }
  }
}

const FRONT_OFFSETS: Readonly<Record<string, { dx: number; dy: number; size: number }>> = {
  head: { dx: -12, dy: 0, size: 30 },
  eye: { dx: -24, dy: -4, size: 15 },
  horn: { dx: -16, dy: -20, size: 22 },
  antenna: { dx: -25, dy: -27, size: 21 },
};

const BACK_OFFSETS: Readonly<Record<string, { dy: number; size: number }>> = {
  shell: { dy: -15, size: 28 },
  spike: { dy: -16, size: 25 },
  crest: { dy: -18, size: 24 },
  wing: { dy: -20, size: 36 },
};

const REAR_OFFSETS: Readonly<Record<string, { dy: number; size: number }>> = {
  glow: { dy: -4, size: 20 },
  maw: { dy: 9, size: 22 },
  sac: { dy: 3, size: 22 },
  gill: { dy: 2, size: 22 },
};

/** 构造挂点表。 */
export function buildCreature(phenotype: Phenotype): CreatureLayout {
  const length = Math.max(96, 60 + 14 * phenotype.size);
  const half = length / 2;
  const slots: CreatureSlot[] = [];

  const byCategory: Record<PartCategory, Part[]> = {
    front: [],
    belly: [],
    back: [],
    rear: [],
  };
  for (const part of phenotype.parts) {
    byCategory[categoryOf(part.id)].push(part);
  }

  // 前端：头在最前，眼/角/触角依次错开，多头生物会沿身体向后排。
  const frontSeen: Record<string, number> = {};
  for (const part of byCategory.front) {
    const key = part.id;
    const n = frontSeen[key] ?? 0;
    frontSeen[key] = n + 1;
    const offset = FRONT_OFFSETS[key] ?? { dx: -10, dy: 0, size: 24 };
    slots.push({
      part,
      x: half + offset.dx - n * 14,
      y: offset.dy + n * 3,
      size: offset.size,
      rotation: 0,
      category: 'front',
      ordinal: n,
    });
  }

  // 腹侧：腿/爪/鳍沿身体下沿铺开，第一条腿最靠前。
  const belly = byCategory.belly;
  if (belly.length > 0) {
    const span = Math.min(length - 40, belly.length * 30);
    const step = belly.length > 1 ? span / (belly.length - 1) : 0;
    belly.forEach((part, i) => {
      slots.push({
        part,
        x: half - 22 - i * step,
        y: 17,
        size: part.id === 'longleg' ? 32 : part.id === 'claw' ? 25 : 27,
        rotation: 0,
        category: 'belly',
        ordinal: i,
      });
    });
  }

  // 背侧：甲/刺/冠/翼沿背线排开。
  const back = byCategory.back;
  if (back.length > 0) {
    const start = -half + 30;
    const span = Math.max(0, length - 64);
    const step = back.length > 1 ? span / (back.length - 1) : 0;
    back.forEach((part, i) => {
      const offset = BACK_OFFSETS[part.id] ?? { dy: -16, size: 24 };
      slots.push({
        part,
        x: start + i * step,
        y: offset.dy,
        size: offset.size,
        rotation: part.id === 'wing' ? -0.16 : 0,
        category: 'back',
        ordinal: i,
      });
    });
  }

  // 尾段：发光器/口器/气囊/鳃挤在后 1/3。
  const rear = byCategory.rear;
  if (rear.length > 0) {
    const start = -half + 16;
    const span = Math.min(length * 0.36, rear.length * 19);
    const step = rear.length > 1 ? span / (rear.length - 1) : 0;
    rear.forEach((part, i) => {
      const offset = REAR_OFFSETS[part.id] ?? { dy: 0, size: 22 };
      slots.push({
        part,
        x: start + i * step,
        y: offset.dy,
        size: offset.size,
        rotation: 0,
        category: 'rear',
        ordinal: i,
      });
    });
  }

  // 按零件原始顺序排序，动画下标与 Gene.parts 一致。
  slots.sort((a, b) => a.part.index - b.part.index);

  return {
    length,
    height: 36,
    locomotion: phenotype.locomotion,
    slots,
  };
}

export interface CreatureRenderState {
  now: number;
  /** 是否在跑道上奔跑。 */
  running: boolean;
  /** 跑步相位（0..1 循环）。 */
  runPhase: number;
  /** 每个零件的长出比例 0..1（下标 = Part.index）。 */
  growth: (index: number) => number;
  alpha: number;
  /** 整体倾斜（弧度）。 */
  tilt: number;
  /** 鼠标位置（屏幕坐标），用于眼珠追踪。 */
  pointer: { x: number; y: number } | null;
  /** 额外高亮（例如图例 hover），0..1。 */
  highlight?: (index: number) => number;
  /** 没有终止密码子：尾部画一道断口。 */
  fracture?: boolean;
}

/** 身体中心相对脚底的高度。 */
function bodyLift(loc: Locomotion): number {
  switch (loc) {
    case 'fly':
      return 82;
    case 'mixed':
      return 56;
    case 'swim':
      return 29;
    case 'walk':
      return 38;
    case 'none':
      return 23;
    default: {
      const _never: never = loc;
      void _never;
      return 32;
    }
  }
}

/**
 * 画整只生物。
 * @param x 身体中心的屏幕 x
 * @param groundY 地面屏幕 y
 * @param scale 缩放
 */
export function drawCreature(
  ctx: CanvasRenderingContext2D,
  layout: CreatureLayout,
  x: number,
  groundY: number,
  scale: number,
  state: CreatureRenderState,
): void {
  if (layout.slots.length === 0) return;

  const now = state.now;
  const run = state.running;
  const gait = state.runPhase * Math.PI * 2;
  const breath = breathe(now, 1250);

  let lift = bodyLift(layout.locomotion);
  if (layout.locomotion === 'fly' || layout.locomotion === 'mixed') {
    lift += Math.sin(now / 520) * 4;
  } else if (run) {
    lift += Math.abs(Math.sin(gait)) * 4;
  } else if (layout.locomotion === 'none') {
    lift += Math.sin(now / 900) * 1.4;
  }

  ctx.save();
  ctx.translate(x, groundY);
  ctx.scale(scale, scale);
  if (state.tilt) ctx.rotate(state.tilt);
  ctx.globalAlpha *= clamp(state.alpha, 0, 1);

  const bodyH = layout.height * (1 + breath * 0.012);
  const bodyW = layout.length;
  const bodyCX = 0;
  const bodyCY = -lift;

  // 水栖：脚边留一圈水纹
  if (layout.locomotion === 'swim') {
    ctx.save();
    ctx.strokeStyle = 'rgba(70, 200, 178, 0.28)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i += 1) {
      const rr = 26 + i * 15 + Math.sin(now / 900 + i) * 2;
      ctx.globalAlpha = 0.34 - i * 0.09;
      ctx.beginPath();
      ctx.ellipse(0, -1, rr, rr * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 远端地面阴影
  ctx.save();
  ctx.globalAlpha *= 0.24;
  const shadow = ctx.createRadialGradient(0, 2, 2, 0, 2, bodyW * 0.55);
  shadow.addColorStop(0, 'rgba(0,0,0,0.7)');
  shadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(0, 2, bodyW * 0.48, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 呼吸时的身体微倾
  const bodyTilt = Math.sin(now / 1400) * 0.015;

  // 1) 翅膀在身体后面
  for (const slot of layout.slots) {
    if (slot.part.id !== 'wing') continue;
    const grow = state.growth(slot.part.index);
    if (grow <= 0.001) continue;
    const flap = Math.sin(now / 150 + slot.ordinal) * (run || layout.locomotion === 'fly' ? 0.3 : 0.08);
    drawSlot(ctx, slot, bodyCX, bodyCY, grow, flap, state, breath);
  }

  // 2) 腹侧附肢在身体后面（只露出下半段）
  for (const slot of layout.slots) {
    if (slot.category !== 'belly') continue;
    const grow = state.growth(slot.part.index);
    if (grow <= 0.001) continue;
    const swing = run
      ? Math.sin(gait + slot.ordinal * Math.PI) * 0.32
      : Math.sin(gait * 0.22 + slot.ordinal) * 0.035;
    drawSlot(ctx, slot, bodyCX, bodyCY, grow, swing, state, breath);
  }

  // 3) 身体胶囊
  drawBody(ctx, bodyCX, bodyCY, bodyW, bodyH, bodyTilt, layout.locomotion, state);

  if (state.fracture) {
    drawFracture(ctx, -bodyW / 2 + 10, 0, bodyH);
  }

  // 4) 背甲/刺/冠（贴在背线上）
  for (const slot of layout.slots) {
    if (slot.category !== 'back' || slot.part.id === 'wing') continue;
    const grow = state.growth(slot.part.index);
    if (grow <= 0.001) continue;
    drawSlot(ctx, slot, bodyCX, bodyCY, grow, 0, state, breath);
  }

  // 5) 尾段器官
  for (const slot of layout.slots) {
    if (slot.category !== 'rear') continue;
    const grow = state.growth(slot.part.index);
    if (grow <= 0.001) continue;
    drawSlot(ctx, slot, bodyCX, bodyCY, grow, 0, state, breath);
  }

  // 6) 前端零件（头/眼/角/触角）
  for (const slot of layout.slots) {
    if (slot.category !== 'front') continue;
    const grow = state.growth(slot.part.index);
    if (grow <= 0.001) continue;
    const nod = run ? Math.sin(gait * 0.5) * 0.02 : Math.sin(now / 1500) * 0.01;
    drawSlot(ctx, slot, bodyCX, bodyCY, grow, nod, state, breath);
  }

  ctx.restore();
}

function drawFracture(
  ctx: CanvasRenderingContext2D,
  x: number,
  cy: number,
  h: number,
): void {
  ctx.save();
  ctx.translate(x, cy);
  ctx.strokeStyle = 'rgba(255, 107, 122, 0.9)';
  ctx.lineWidth = 1.6;
  ctx.shadowColor = 'rgba(255, 107, 122, 0.55)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  const top = -h / 2 - 2;
  const bottom = h / 2 + 2;
  ctx.moveTo(0, top);
  ctx.lineTo(-3, top + (bottom - top) * 0.28);
  ctx.lineTo(2, top + (bottom - top) * 0.48);
  ctx.lineTo(-2, top + (bottom - top) * 0.7);
  ctx.lineTo(1, bottom);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255, 107, 122, 0.5)';
  ctx.beginPath();
  ctx.arc(-4, top + (bottom - top) * 0.2, 1.4, 0, Math.PI * 2);
  ctx.arc(4, top + (bottom - top) * 0.62, 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSlot(
  ctx: CanvasRenderingContext2D,
  slot: CreatureSlot,
  bodyCX: number,
  bodyCY: number,
  growth: number,
  extraRotation: number,
  state: CreatureRenderState,
  breath: number,
): void {
  const px = bodyCX + slot.x;
  const py = bodyCY + slot.y + breath * 0.6;
  let pupil: { x: number; y: number } | undefined;
  if (slot.part.id === 'eye' && state.pointer) {
    const dx = state.pointer.x - px;
    const dy = state.pointer.y - py;
    const len = Math.hypot(dx, dy) || 1;
    pupil = { x: (dx / len) * 2.6, y: (dy / len) * 2.6 };
  }
  const hl = state.highlight?.(slot.part.index) ?? 0;
  const hintColor = FAMILY_COLORS[slot.part.family];

  if (hl > 0.01) {
    ctx.save();
    ctx.globalAlpha *= 0.4 * hl;
    ctx.fillStyle = withAlpha(hintColor, 0.35);
    ctx.beginPath();
    ctx.arc(px, py, slot.size * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPart(ctx, slot.part.id, px, py, slot.size * growth, slot.part.family, {
    rotation: slot.rotation + extraRotation,
    phase: state.now / 620 + slot.part.index,
    pupil,
    alpha: clamp(0.35 + growth * 0.65, 0, 1),
  });
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  tilt: number,
  locomotion: Locomotion,
  state: CreatureRenderState,
): void {
  const r = h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);

  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, r);
  const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  grad.addColorStop(0, '#34566b');
  grad.addColorStop(0.5, '#223e51');
  grad.addColorStop(1, '#132330');
  ctx.fillStyle = grad;
  if (locomotion === 'swim') ctx.globalAlpha *= 0.86;
  ctx.fill();

  ctx.strokeStyle = 'rgba(150, 196, 216, 0.55)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // 内发光（背线高光）
  ctx.beginPath();
  ctx.roundRect(-w / 2 + 4, -h / 2 + 4, w - 8, h * 0.4, r * 0.7);
  const inner = ctx.createLinearGradient(0, -h / 2, 0, 0);
  inner.addColorStop(0, 'rgba(140, 226, 224, 0.16)');
  inner.addColorStop(1, 'rgba(140, 226, 224, 0)');
  ctx.fillStyle = inner;
  ctx.fill();

  // 体节线
  ctx.strokeStyle = 'rgba(9, 20, 28, 0.35)';
  ctx.lineWidth = 1;
  const segs = Math.max(2, Math.round(w / 34));
  for (let i = 1; i < segs; i += 1) {
    const x = -w / 2 + (w / segs) * i;
    ctx.beginPath();
    ctx.moveTo(x, -h / 2 + 5);
    ctx.quadraticCurveTo(x + 3, 0, x, h / 2 - 5);
    ctx.stroke();
  }

  // 游泳水波
  if (locomotion === 'swim') {
    ctx.globalAlpha *= 0.6;
    ctx.strokeStyle = 'rgba(70, 200, 178, 0.3)';
    for (let i = 0; i < 2; i += 1) {
      const y = 12 + i * 7;
      ctx.beginPath();
      ctx.ellipse(0, y, w * 0.34, 5, 0, 0, Math.PI);
      ctx.stroke();
    }
  }

  // 待机微光
  ctx.globalAlpha *= 0.5 + state.growth(0) * 0.2;
  ctx.beginPath();
  ctx.arc(w * 0.2, -h * 0.14, 6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(146, 228, 220, 0.08)';
  ctx.fill();

  ctx.restore();
}
