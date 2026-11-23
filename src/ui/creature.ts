/**
 * 把 Phenotype 拼成一只生物（B 负责）。
 * ---------------------------------------------------------------
 * 完全由 phenotype.parts 驱动。内部按 docs/CREATURE.md 重画：
 *   地面投影 → 远侧肢体/远侧翼 → 身体（缓存精灵）→ 近侧肢体 → 尾器官 →
 *   头/眼/角/触角 → 近侧翼/背甲 → 发光叠加。
 * 对外签名保持不变：
 *   buildCreature(phenotype) / drawCreature(ctx, layout, x, groundY, scale, state)
 */

import type { PartId } from '../core';
import { drawLimb, drawWing } from './parts-art';
import {
  TAU,
  clamp,
  profileAt,
  solveLeg,
  smoothstep,
  spineAt,
  type Anchor,
  type CreatureLayout,
  type LimbRest,
} from './creature-geometry';

export type { CreatureLayout } from './creature-geometry';
export { buildCreature } from './creature-geometry';

export interface CreatureRenderState {
  now: number;
  /** 是否在跑道上奔跑。 */
  running: boolean;
  /** 跑步相位（0..1 循环）；仅用于和舞台对齐，步态相位一律按时间现算。 */
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

/* ==========================================================================
 * 色板（§6）
 * ========================================================================== */

const BODY_TOP = '#24485c';
const BODY_MID = '#15293a';
const BODY_LOW = '#0b1722';
const OUTLINE = 'rgba(143,185,204,0.55)';
const BACK_HL = 'rgba(143,227,220,0.16)';
const SEG_SEAM = 'rgba(6,14,20,0.38)';
const INK = '#050b10';
const FRACTURE = '#ff6b7a';

const FAMILY_FILL: Readonly<Record<string, string>> = {
  A: '#3d3120',
  U: '#16302e',
  G: '#2b2440',
  C: '#3a2430',
};
const FAMILY_LINE: Readonly<Record<string, string>> = {
  A: '#f2b24b',
  U: '#46c8b2',
  G: '#a58bf0',
  C: '#ef7d9b',
};

/* ==========================================================================
 * 缓存
 * ========================================================================== */

interface BodySprite {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  w: number;
  h: number;
}

const bodySpriteCache = new Map<string, BodySprite>();

function lodOf(effHeight: number): 0 | 1 | 2 {
  return effHeight >= 26 ? 2 : effHeight >= 14 ? 1 : 0;
}

function prefersReduced(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function frac(x: number): number {
  return x - Math.floor(x);
}

/* ==========================================================================
 * 时间量（§4）
 * ========================================================================== */

interface Timing {
  t: number;
  breath: number;
  blink: number;
  glow: number;
  lift: number;
  gait: number;
  runTilt: number;
  bodyX: number;
  pointerLocal: { x: number; y: number } | null;
}

function timingOf(layout: CreatureLayout, state: CreatureRenderState): Timing {
  const t = state.now / 1000;
  const H = layout.H;
  const U = layout.U;
  const running = state.running;
  const reduced = prefersReduced();
  const gaitT = reduced ? 0 : t;

  const breath = Math.sin((TAU * t) / 3.2);
  const bp = t % 4.4;
  let blink = bp > 4.24 ? Math.sin((Math.PI * (bp - 4.24)) / 0.16) : 0;
  if (Math.floor(t / 4.4) % 3 === 2) {
    const bp2 = (bp + 4.18) % 4.4;
    if (bp2 > 4.24) blink = Math.max(blink, Math.sin((Math.PI * (bp2 - 4.24)) / 0.16) * 0.7);
  }
  const glow = 0.5 + 0.5 * Math.sin((TAU * t) / 2.6);
  const bob = reduced ? 0 : 1.6 * U * Math.sin((TAU * 2 * gaitT) / 0.62 + 0.6);

  let lift = layout.liftWalk;
  switch (layout.locomotion) {
    case 'walk':
      lift += bob;
      break;
    case 'mixed':
      lift += layout.liftExtra + bob * 0.6;
      break;
    case 'fly':
      lift += layout.liftExtra + Math.sin((TAU * t) / 2.4) * (reduced ? 0 : 2) * U;
      break;
    case 'swim':
      lift = 0.26 * H + 0.4 * layout.rMedian + Math.sin((TAU * t) / 1.6) * 2 * U;
      break;
    case 'none':
      lift = 0.5 * H * 0.92;
      break;
    default: {
      const _never: never = layout.locomotion;
      void _never;
    }
  }

  return {
    t,
    breath,
    blink: reduced ? 0 : blink,
    glow,
    lift,
    gait: gaitT,
    runTilt: running && !reduced ? 0.07 : 0,
    bodyX: 0.6 * U * Math.sin((TAU * t) / 5.1),
    pointerLocal: null,
  };
}

/* ==========================================================================
 * 身体精灵（§7.3 缓存）
 * ========================================================================== */

function getBodySprite(layout: CreatureLayout): BodySprite {
  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const key = `${Math.round(layout.L)}:${Math.round(layout.H)}:${layout.n}:${dpr}`;
  const cached = bodySpriteCache.get(key);
  if (cached) return cached;
  const U = layout.U;
  const pad = 12 * U;
  const w = layout.L + pad * 2;
  const h = layout.H * 1.8 + pad * 2;
  let canvas: HTMLCanvasElement | OffscreenCanvas;
  const pw = Math.max(1, Math.round(w * dpr));
  const ph = Math.max(1, Math.round(h * dpr));
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(pw, ph);
  } else {
    const el = document.createElement('canvas');
    el.width = pw;
    el.height = ph;
    canvas = el;
  }
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, (w / 2) * dpr, (h / 2) * dpr);
    paintBody(ctx as CanvasRenderingContext2D, layout);
  }
  const sprite: BodySprite = { canvas, w, h };
  bodySpriteCache.set(key, sprite);
  return sprite;
}

/** 在身体局部坐标里画分节身体（尾 → 头）。 */
function paintBody(ctx: CanvasRenderingContext2D, layout: CreatureLayout): void {
  const { H, U } = layout;
  const N = layout.segRY.length;

  const grad = ctx.createLinearGradient(0, -H * 0.6, 0, H * 0.6);
  grad.addColorStop(0, BODY_TOP);
  grad.addColorStop(0.55, BODY_MID);
  grad.addColorStop(1, BODY_LOW);

  // 1) 每节先描边
  ctx.lineWidth = 1.4 * U;
  ctx.strokeStyle = OUTLINE;
  for (let k = 0; k < N; k += 1) {
    ctx.beginPath();
    ctx.ellipse(layout.segX[k], layout.segY[k], layout.segRX[k], layout.segRY[k], layout.segRot[k], 0, TAU);
    ctx.stroke();
  }
  // 2) 整体填充（盖住内部描边，只留外轮廓）
  ctx.fillStyle = grad;
  for (let k = 0; k < N; k += 1) {
    ctx.beginPath();
    ctx.ellipse(layout.segX[k], layout.segY[k], layout.segRX[k], layout.segRY[k], layout.segRot[k], 0, TAU);
    ctx.fill();
  }

  // 3) 节间缝（下半圈）
  ctx.strokeStyle = SEG_SEAM;
  ctx.lineWidth = 1.1 * U;
  for (let k = 1; k < N; k += 1) {
    const s = k / N;
    const p = spineAt(s, layout.L, H);
    const r = 0.5 * H * profileAt(s);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.92, 0.25 * Math.PI, 0.75 * Math.PI);
    ctx.stroke();
  }

  // 4) 背线高光（三段渐隐）
  ctx.strokeStyle = BACK_HL;
  ctx.lineWidth = 2.2 * U;
  for (let i = 0; i < 3; i += 1) {
    const s0 = 0.15 + (i * 0.71) / 3;
    const s1 = 0.15 + ((i + 1) * 0.71) / 3;
    const a = spineAt(s0, layout.L, H);
    const b = spineAt(s1, layout.L, H);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 - 0.46 * H - 3 * U;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - 0.46 * H);
    ctx.quadraticCurveTo(mx, my, b.x, b.y - 0.46 * H);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 5) 头形：s = 0.96 处一个更大的椭圆
  const head = spineAt(0.96, layout.L, H);
  ctx.beginPath();
  ctx.ellipse(head.x, head.y, 0.62 * H, 0.58 * H, head.tan, 0, TAU);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.6 * U;
  ctx.stroke();

  // 6) 贴地一侧的环境光
  ctx.beginPath();
  ctx.ellipse(0, H * 0.2, layout.L * 0.36, H * 0.16, 0, 0, TAU);
  ctx.fillStyle = 'rgba(95,227,200,0.06)';
  ctx.fill();
}

/* ==========================================================================
 * 主绘制
 * ========================================================================== */

export function drawCreature(
  ctx: CanvasRenderingContext2D,
  layout: CreatureLayout,
  x: number,
  groundY: number,
  scale: number,
  state: CreatureRenderState,
): void {
  if (layout.n === 0 || state.alpha <= 0.001) return;
  const H = layout.H;
  const lod = lodOf(H * scale);
  const tm = timingOf(layout, state);
  tm.pointerLocal = state.pointer
    ? { x: (state.pointer.x - x) / scale, y: (state.pointer.y - groundY) / scale }
    : null;

  ctx.save();
  ctx.translate(x, groundY);
  ctx.scale(scale, scale);
  if (state.tilt) ctx.rotate(state.tilt);
  const baseAlpha = clamp(state.alpha, 0, 1);
  ctx.globalAlpha *= baseAlpha;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  drawShadow(ctx, layout, tm.lift);
  if (layout.locomotion === 'swim' && lod > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(70,200,178,0.24)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i += 1) {
      ctx.globalAlpha = 0.32 - i * 0.08;
      ctx.beginPath();
      ctx.ellipse(0, -1, layout.L * (0.18 + i * 0.1), 3 * layout.U, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(tm.bodyX, -tm.lift);
  if (tm.runTilt) ctx.rotate(tm.runTilt);

  // 远侧：翅膀 + 肢体压暗 65%，画完立刻还原（§7.6-1）
  const savedAlpha = ctx.globalAlpha;
  ctx.globalAlpha = savedAlpha * 0.65;
  for (const anchor of layout.anchors) {
    if (anchor.id !== 'wing' || anchor.j % 2 === 0) continue;
    drawAnchored(ctx, layout, anchor, tm, state, lod);
  }
  for (const limb of layout.limbs) {
    if (limb.far) drawLeg(ctx, layout, limb, tm, state, lod);
  }
  ctx.globalAlpha = savedAlpha;

  // 身体
  if (state.fracture) drawFracturedBody(ctx, layout, lod);
  else if (layout.locomotion === 'swim' || layout.locomotion === 'none') drawWavingBody(ctx, layout, tm, lod);
  else drawBodyLayer(ctx, layout, tm, lod);

  // 近侧肢体
  for (const limb of layout.limbs) {
    if (!limb.far) drawLeg(ctx, layout, limb, tm, state, lod);
  }

  // 尾器官 → 头 → 近侧翼/背甲
  for (const anchor of layout.anchors) {
    if (layerOf(anchor.id) !== 1) continue;
    drawAnchored(ctx, layout, anchor, tm, state, lod);
  }
  for (const anchor of layout.anchors) {
    if (layerOf(anchor.id) !== 2) continue;
    drawAnchored(ctx, layout, anchor, tm, state, lod);
  }
  for (const anchor of layout.anchors) {
    if (layerOf(anchor.id) !== 0) continue;
    if (anchor.id === 'wing' && anchor.j % 2 === 1) continue;
    drawAnchored(ctx, layout, anchor, tm, state, lod);
  }

  // 发光叠加（最后）
  for (const anchor of layout.anchors) {
    if (anchor.id !== 'glow') continue;
    drawGlowHalo(ctx, layout, anchor, tm, state);
  }

  ctx.restore();
  ctx.restore();
}

function layerOf(id: PartId): 0 | 1 | 2 | 3 {
  switch (id) {
    case 'wing':
    case 'shell':
    case 'spike':
    case 'crest':
      return 0;
    case 'maw':
    case 'gill':
    case 'sac':
      return 1;
    case 'head':
    case 'eye':
    case 'horn':
    case 'antenna':
      return 2;
    case 'glow':
    case 'leg':
    case 'longleg':
    case 'claw':
    case 'fin':
      return 3;
    default: {
      const _never: never = id;
      void _never;
      return 3;
    }
  }
}

function drawShadow(ctx: CanvasRenderingContext2D, layout: CreatureLayout, lift: number): void {
  const rx = layout.L * 0.45;
  const ry = 5 * layout.U;
  ctx.save();
  const scaleX = clamp(1 - lift / (layout.H * 6), 0.5, 1);
  ctx.translate(0, 1);
  ctx.scale(scaleX, 1);
  const g = ctx.createRadialGradient(0, 0, 1, 0, 0, rx);
  g.addColorStop(0, 'rgba(0,0,0,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawBodyLayer(
  ctx: CanvasRenderingContext2D,
  layout: CreatureLayout,
  tm: Timing,
  lod: 0 | 1 | 2,
): void {
  if (lod === 0) {
    for (let k = 0; k < layout.segRY.length; k += 1) {
      ctx.beginPath();
      ctx.ellipse(layout.segX[k], layout.segY[k], layout.segRX[k], layout.segRY[k], layout.segRot[k], 0, TAU);
      ctx.fillStyle = '#16303a';
      ctx.fill();
    }
    return;
  }
  const sprite = getBodySprite(layout);
  ctx.save();
  ctx.scale(1 - 0.010 * tm.breath, 1 + 0.022 * tm.breath);
  ctx.drawImage(sprite.canvas as CanvasImageSource, -sprite.w / 2, -sprite.h / 2, sprite.w, sprite.h);
  ctx.restore();
}

function drawWavingBody(
  ctx: CanvasRenderingContext2D,
  layout: CreatureLayout,
  tm: Timing,
  lod: 0 | 1 | 2,
): void {
  const { H, U } = layout;
  const period = layout.locomotion === 'swim' ? 1.15 : 1.8;
  const amp = (layout.locomotion === 'swim' ? 2.2 : 1.4) * U;
  const grad = ctx.createLinearGradient(0, -H * 0.6, 0, H * 0.6);
  grad.addColorStop(0, BODY_TOP);
  grad.addColorStop(0.55, BODY_MID);
  grad.addColorStop(1, BODY_LOW);
  ctx.save();
  for (let k = 0; k < layout.segRY.length; k += 1) {
    const s = (k + 0.5) / layout.segRY.length;
    const dy = amp * Math.sin(TAU * (s * 1.6 - tm.t / period));
    ctx.beginPath();
    ctx.ellipse(layout.segX[k], layout.segY[k] + dy, layout.segRX[k], layout.segRY[k], layout.segRot[k], 0, TAU);
    ctx.fillStyle = grad;
    ctx.fill();
    if (lod > 0) {
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.4 * U;
      ctx.stroke();
    }
  }
  const head = spineAt(0.96, layout.L, H);
  const dy = amp * Math.sin(TAU * (0.96 * 1.6 - tm.t / period));
  ctx.beginPath();
  ctx.ellipse(head.x, head.y + dy, 0.62 * H, 0.58 * H, head.tan, 0, TAU);
  ctx.fillStyle = grad;
  ctx.fill();
  if (lod > 0) {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6 * U;
    ctx.stroke();
  }
  ctx.restore();
}

function drawFracturedBody(ctx: CanvasRenderingContext2D, layout: CreatureLayout, lod: 0 | 1 | 2): void {
  const cutS = 0.18;
  const { H, U } = layout;
  for (let k = 0; k < layout.segRY.length; k += 1) {
    const s = (k + 0.5) / layout.segRY.length;
    if (s < cutS) continue;
    ctx.beginPath();
    ctx.ellipse(layout.segX[k], layout.segY[k], layout.segRX[k], layout.segRY[k], layout.segRot[k], 0, TAU);
    ctx.fillStyle = lod === 0 ? '#16303a' : '#1a3444';
    ctx.fill();
    if (lod > 0) {
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.4 * U;
      ctx.stroke();
    }
  }
  const p = spineAt(cutS, layout.L, H);
  const r = 0.5 * H * profileAt(cutS);
  ctx.strokeStyle = FRACTURE;
  ctx.lineWidth = 1.6 * U;
  if (lod > 0) {
    ctx.shadowColor = FRACTURE;
    ctx.shadowBlur = 8;
  }
  ctx.beginPath();
  const teeth = 5;
  for (let i = 0; i <= teeth; i += 1) {
    const yy = p.y - r + (2 * r * i) / teeth;
    const xx = p.x + (i % 2 === 0 ? -3 : 2) * U;
    if (i === 0) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

/* ==========================================================================
 * 四肢（IK 驱动，§3.5 / §4.1）
 * ========================================================================== */

function drawLeg(
  ctx: CanvasRenderingContext2D,
  layout: CreatureLayout,
  limb: LimbRest,
  tm: Timing,
  state: CreatureRenderState,
  lod: 0 | 1 | 2,
): void {
  const U = layout.U;
  const H = layout.H;
  const growth = clamp(state.growth(limb.partIndex), 0, 1);
  if (growth <= 0.001) return;

  const hipH = tm.lift - 0.26 * H;
  const S = 0.66 * limb.reach;
  const T = 0.62;
  const D = 0.62;
  let fx: number;
  let fy: number;
  let grounded: boolean;
  let swingU = 0;

  switch (layout.locomotion) {
    case 'fly':
      fx = -0.42 * limb.reach;
      fy = hipH - 0.1 * limb.reach;
      grounded = false;
      break;
    case 'swim':
      fx = -0.5 * limb.reach;
      fy = hipH * 0.92;
      grounded = false;
      break;
    case 'none':
      fx = Math.sin(tm.t / 1.8 + limb.j) * 2 * U;
      fy = hipH;
      grounded = true;
      break;
    default: {
      const p = state.running
        ? frac(tm.gait / T - limb.phase)
        : frac(0.35 + 0.05 * Math.sin((TAU * tm.t) / 3.2 + limb.j));
      if (p < D) {
        fx = S * (0.5 - p / D);
        fy = hipH;
        grounded = true;
      } else {
        const u = (p - D) / (1 - D);
        swingU = u;
        fx = S * (-0.5 + smoothstep(u));
        fy = hipH - 8 * U * Math.sin(Math.PI * u);
        grounded = false;
      }
      break;
    }
  }

  const amp = layout.locomotion === 'mixed' ? 0.7 : 1;
  const sol = solveLeg(limb.a * growth, limb.b * growth, fx * amp, fy);
  const hx = limb.hx;
  const hy = limb.hy;
  const kneeX = hx + sol.kneeX;
  const kneeY = hy + sol.kneeY;
  const footX = hx + sol.footX;
  const footY = hy + sol.footY;
  const footRot = grounded ? 0 : -0.35 * Math.sin(Math.PI * swingU);
  drawLimb(
    ctx,
    limb.id,
    limb.family,
    U,
    { x: hx, y: hy },
    { x: kneeX, y: kneeY },
    { x: footX, y: footY },
    footRot,
    lod,
    state.highlight?.(limb.partIndex) ?? 0,
  );
}

/* ==========================================================================
 * 锚定零件
 * ========================================================================== */

function drawAnchored(
  ctx: CanvasRenderingContext2D,
  layout: CreatureLayout,
  anchor: Anchor,
  tm: Timing,
  state: CreatureRenderState,
  lod: 0 | 1 | 2,
): void {
  if (anchor.id === 'glow') return;
  if (state.fracture && anchor.s < 0.18 && anchor.id !== 'head') return;
  if (anchor.id === 'head') {
    drawHead(ctx, layout, tm, state, anchor, lod);
    return;
  }
  const U = layout.U;
  const growth = clamp(state.growth(anchor.partIndex), 0, 1);
  if (growth <= 0.001) return;
  const hl = state.highlight?.(anchor.partIndex) ?? 0;
  const line = FAMILY_LINE[anchor.family] ?? '#ffffff';

  ctx.save();
  ctx.translate(anchor.x, anchor.y);

  if (anchor.id === 'wing') {
    drawWingDirect(ctx, layout, anchor, tm, state, lod);
    ctx.restore();
    return;
  }

  if (anchor.id === 'eye') {
    ctx.save();
    ctx.rotate(anchor.rot);
    if (anchor.flip) ctx.scale(1, -1);
    drawEye(ctx, U, tm, growth, anchor, lod);
    ctx.restore();
    ctx.restore();
    return;
  }

  ctx.rotate(anchor.rot);
  if (anchor.flip) ctx.scale(1, -1);
  ctx.scale(growth, growth);
  if (hl > 0.01) {
    ctx.shadowColor = line;
    ctx.shadowBlur = 14 * hl;
  }

  switch (anchor.id) {
    case 'horn':
      drawHorn(ctx, U, anchor.size);
      break;
    case 'antenna':
      drawAntenna(ctx, U, tm, anchor.j);
      break;
    case 'shell':
      drawShell(ctx, U, anchor, lod);
      break;
    case 'spike':
      drawSpike(ctx, U, anchor);
      break;
    case 'crest':
      drawCrest(ctx, U);
      break;
    case 'maw':
      drawMawPart(ctx, U, lod);
      break;
    case 'sac':
      drawSacPart(ctx, U, tm);
      break;
    case 'gill':
      ctx.rotate(0.45);
      drawGillPart(ctx, U, tm, anchor.j);
      break;
    default:
      // 肢体由 drawLeg 处理；这里只剩理论上的未知 id。
      break;
  }
  ctx.restore();
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  layout: CreatureLayout,
  tm: Timing,
  state: CreatureRenderState,
  anchor: Anchor,
  lod: 0 | 1 | 2,
): void {
  const H = layout.H;
  const U = layout.U;
  const growth = clamp(state.growth(anchor.partIndex), 0, 1);
  if (growth <= 0.001) return;
  const head = spineAt(0.96 - 0.1 * anchor.j, layout.L, H);

  ctx.save();
  ctx.translate(head.x, head.y);

  if (anchor.j > 0) {
    const r = 0.62 * H * Math.pow(0.72, anchor.j) * growth;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = '#1c3646';
    ctx.fill();
    ctx.strokeStyle = FAMILY_LINE.A;
    ctx.lineWidth = 1.4 * U;
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.translate(0, -1.2 * U * Math.sin((TAU * 2 * tm.t) / 0.62 - 0.35));
  ctx.rotate(0.02 * Math.sin((TAU * tm.t) / 0.62 - 1.1));
  ctx.scale(growth, growth);
  ctx.lineCap = 'round';

  ctx.strokeStyle = 'rgba(233,242,248,0.22)';
  ctx.lineWidth = 2.4 * U;
  ctx.beginPath();
  ctx.moveTo(-0.3 * H, -0.22 * H);
  ctx.quadraticCurveTo(0.02 * H, -0.34 * H, 0.34 * H, -0.16 * H);
  ctx.stroke();

  if (lod > 0) {
    ctx.strokeStyle = 'rgba(6,14,20,0.55)';
    ctx.lineWidth = 1.6 * U;
    ctx.beginPath();
    ctx.moveTo(0.1 * H, 0.26 * H);
    ctx.quadraticCurveTo(0.42 * H, 0.3 * H, 0.58 * H, 0.1 * H);
    ctx.stroke();
    ctx.fillStyle = 'rgba(6,14,20,0.6)';
    ctx.beginPath();
    ctx.ellipse(0.52 * H, -0.02 * H, 1.6 * U, 1.1 * U, 0, 0, TAU);
    ctx.fill();
  }
  if (lod === 2) {
    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.lineWidth = 2 * U;
    ctx.beginPath();
    ctx.arc(0, 0, 0.58 * H, Math.PI * 1.05, Math.PI * 1.45);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  U: number,
  tm: Timing,
  growth: number,
  anchor: Anchor,
  lod: 0 | 1 | 2,
): void {
  const sizeScale = anchor.size / (8.6 * U);
  const r = 7.5 * U * growth * sizeScale;
  if (r < 0.4) return;
  const blink = tm.blink;

  // 瞳孔方向：把屏幕指针换算到眼睛所在的局部坐标。
  let px = 0;
  let py = 0;
  if (tm.pointerLocal && lod > 0) {
    const eyeX = anchor.x + tm.bodyX;
    const eyeY = anchor.y - tm.lift;
    const dx = tm.pointerLocal.x - eyeX;
    const dy = tm.pointerLocal.y - eyeY;
    const len = Math.hypot(dx, dy) || 1;
    px = (dx / len) * 2.2 * U;
    py = -(dy / len) * 2.2 * U;
  }

  ctx.fillStyle = '#0a161e';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = FAMILY_LINE.A;
  ctx.lineWidth = 1.5 * U;
  ctx.stroke();

  const open = Math.max(0.35, 1 - blink);
  ctx.fillStyle = 'rgba(95,227,200,0.55)';
  ctx.beginPath();
  ctx.arc(0, 0, 4.6 * U * open, 0, TAU);
  ctx.fill();

  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(px, py, 3.2 * U * open, 3.6 * U * open, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(px - 1.4 * U, py - 1.6 * U, 1.2 * U, 0, TAU);
  ctx.fill();

  if (blink > 0.01 && lod > 0) {
    const lidY = -8.6 * U + 17.2 * U * blink;
    ctx.fillStyle = '#1c3646';
    ctx.beginPath();
    ctx.ellipse(0, 0, r + 1.2 * U, r + 1.2 * U, 0, Math.PI, TAU);
    ctx.lineTo(r + 1.2 * U, lidY);
    ctx.lineTo(-(r + 1.2 * U), lidY);
    ctx.closePath();
    ctx.fill();
  }
}

function drawHorn(ctx: CanvasRenderingContext2D, U: number, size: number): void {
  const len = Math.max(8, size);
  ctx.rotate(0.28);
  const g = ctx.createLinearGradient(0, 0, 0, len);
  g.addColorStop(0, '#3d3120');
  g.addColorStop(1, FAMILY_LINE.A);
  ctx.fillStyle = g;
  ctx.strokeStyle = FAMILY_LINE.A;
  ctx.lineWidth = 1.5 * U;
  ctx.beginPath();
  ctx.moveTo(-3.5 * U, 0);
  ctx.quadraticCurveTo(-3.5 * U, len * 0.55, 0, len);
  ctx.quadraticCurveTo(3.5 * U, len * 0.55, 3.5 * U, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,224,163,0.35)';
  ctx.lineWidth = 1 * U;
  ctx.beginPath();
  ctx.moveTo(0, 1 * U);
  ctx.lineTo(0, len * 0.9);
  ctx.stroke();
}

function drawAntenna(ctx: CanvasRenderingContext2D, U: number, tm: Timing, j: number): void {
  const a1 = 0.13 * Math.sin((TAU * tm.t) / 1.9 + j);
  const a2 = 0.13 * 1.7 * Math.sin((TAU * (tm.t - 0.13)) / 1.9 + j);
  ctx.rotate(a1);
  ctx.strokeStyle = FAMILY_LINE.A;
  ctx.lineWidth = 2.2 * U;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(5 * U, 12 * U);
  ctx.stroke();
  ctx.rotate(a2 * 0.5);
  ctx.lineWidth = 1.4 * U;
  ctx.beginPath();
  ctx.moveTo(5 * U, 12 * U);
  ctx.lineTo(12 * U, 22 * U);
  ctx.stroke();
  ctx.fillStyle = FAMILY_LINE.A;
  ctx.beginPath();
  ctx.arc(12 * U, 22 * U, 2.4 * U, 0, TAU);
  ctx.fill();
}

function drawShell(ctx: CanvasRenderingContext2D, U: number, anchor: Anchor, lod: 0 | 1 | 2): void {
  const scale = Math.pow(0.92, Math.max(0, anchor.m - 1 - anchor.j));
  const r = 20 * U * scale;
  ctx.rotate(0.06 * Math.sin((Math.PI * anchor.j) / Math.max(1, anchor.m)));
  ctx.fillStyle = FAMILY_FILL.G;
  ctx.strokeStyle = FAMILY_LINE.G;
  ctx.lineWidth = 1.6 * U;
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI * 1.05, Math.PI * 1.95);
  ctx.arc(0, 0, r - 9 * U * scale, Math.PI * 1.95, Math.PI * 1.05, true);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (lod === 2) {
    ctx.strokeStyle = 'rgba(214,200,255,0.28)';
    ctx.lineWidth = 1 * U;
    ctx.beginPath();
    ctx.arc(0, 0, r - 2 * U, Math.PI * 1.15, Math.PI * 1.5);
    ctx.stroke();
  }
}

function drawSpike(ctx: CanvasRenderingContext2D, U: number, anchor: Anchor): void {
  const heights = [11, 13, 11];
  ctx.fillStyle = FAMILY_FILL.G;
  ctx.strokeStyle = FAMILY_LINE.G;
  ctx.lineWidth = 1.4 * U;
  ctx.rotate(-0.06 * anchor.j);
  for (let i = 0; i < 3; i += 1) {
    const bx = (i - 1) * 6 * U;
    const h = heights[i] * U;
    ctx.beginPath();
    ctx.moveTo(bx - 2.5 * U, 0);
    ctx.lineTo(bx, -h);
    ctx.lineTo(bx + 2.5 * U, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawCrest(ctx: CanvasRenderingContext2D, U: number): void {
  const heights = [8, 10.5, 12, 10.5, 8];
  ctx.fillStyle = FAMILY_FILL.G;
  ctx.strokeStyle = FAMILY_LINE.G;
  ctx.lineWidth = 1.4 * U;
  ctx.beginPath();
  ctx.moveTo(-14 * U, 0);
  heights.forEach((h, i) => {
    const x = (-14 + i * 7) * U;
    ctx.lineTo(x + 3.5 * U, -h * U);
    ctx.lineTo(x + 7 * U, 0);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawWingDirect(
  ctx: CanvasRenderingContext2D,
  layout: CreatureLayout,
  anchor: Anchor,
  tm: Timing,
  state: CreatureRenderState,
  lod: 0 | 1 | 2,
): void {
  const U = layout.U;
  const growth = clamp(state.growth(anchor.partIndex), 0, 1);
  if (growth <= 0.001) return;
  const loco = layout.locomotion;
  const Tw = loco === 'fly' ? 0.34 : state.running ? 0.42 : 0.52;
  const amp = loco === 'fly' ? 0.62 : state.running ? 0.4 : 0.12;
  const phase = anchor.m === 2 ? anchor.j * 0.5 : 0;
  const w = (TAU * tm.t) / Tw - phase * TAU;
  const flap = -0.08 + amp * Math.sin(w);
  const lag = (Math.sin(w - (TAU * 0.09) / Tw) * 1.15 - Math.sin(w)) * 3 * U;

  ctx.scale(growth, growth);
  drawWing(ctx, U, flap, lag, lod);
}

function drawMawPart(ctx: CanvasRenderingContext2D, U: number, lod: 0 | 1 | 2): void {
  ctx.rotate(0.17);
  ctx.fillStyle = FAMILY_FILL.C;
  ctx.strokeStyle = FAMILY_LINE.C;
  ctx.lineWidth = 1.4 * U;
  ctx.beginPath();
  ctx.arc(0, 0, 8 * U, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#120a0f';
  ctx.beginPath();
  ctx.ellipse(0, 2 * U, 5 * U, 4 * U, 0, 0, TAU);
  ctx.fill();
  if (lod === 2) {
    ctx.fillStyle = '#ffd9e2';
    for (let i = 0; i < 8; i += 1) {
      const a = (Math.PI * i) / 7;
      const x = Math.cos(a) * 7.2 * U;
      const y = Math.sin(a) * 7.2 * U;
      ctx.beginPath();
      ctx.moveTo(x - 1.5 * U, y);
      ctx.lineTo(x, y + 4 * U);
      ctx.lineTo(x + 1.5 * U, y);
      ctx.fill();
    }
  }
}

function drawSacPart(ctx: CanvasRenderingContext2D, U: number, tm: Timing): void {
  const b = Math.sin((TAU * (tm.t - 0.8)) / 3.2);
  ctx.scale(1 + 0.04 * b, 1 + 0.06 * b);
  ctx.fillStyle = FAMILY_FILL.C;
  ctx.strokeStyle = FAMILY_LINE.C;
  ctx.lineWidth = 1.4 * U;
  ctx.beginPath();
  ctx.ellipse(0, 0, 7.5 * U, 6 * U, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,184,200,0.20)';
  ctx.lineWidth = 0.9 * U;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(-5 * U, (-3 + i * 3) * U);
    ctx.quadraticCurveTo(0, (-4 + i * 3) * U, 5 * U, (-3 + i * 3) * U);
    ctx.stroke();
  }
}

function drawGillPart(ctx: CanvasRenderingContext2D, U: number, tm: Timing, j: number): void {
  for (let k = 0; k < 3; k += 1) {
    const scaleY = 1 + 0.12 * Math.sin((TAU * (tm.t - 0.11 * k)) / 0.54 + j);
    const x = (k - 1) * 4 * U;
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(1, scaleY);
    ctx.strokeStyle = FAMILY_LINE.C;
    ctx.lineWidth = 2 * U;
    ctx.beginPath();
    ctx.moveTo(0, -6 * U);
    ctx.quadraticCurveTo(1.4 * U, 0, 0, 6 * U);
    ctx.stroke();
    ctx.restore();
  }
}

function drawGlowHalo(
  ctx: CanvasRenderingContext2D,
  layout: CreatureLayout,
  anchor: Anchor,
  tm: Timing,
  state: CreatureRenderState,
): void {
  const U = layout.U;
  const growth = clamp(state.growth(anchor.partIndex), 0, 1);
  if (growth <= 0.001) return;
  const r = 16 * U * (1 + 0.08 * tm.glow);

  ctx.save();
  ctx.translate(anchor.x, anchor.y);
  ctx.scale(growth, growth);
  const g = ctx.createRadialGradient(0, 0, 0.5, 0, 0, r);
  g.addColorStop(0, `rgba(239,125,155,${0.25 + 0.3 * tm.glow})`);
  g.addColorStop(1, 'rgba(239,125,155,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();

  ctx.fillStyle = '#3a2430';
  ctx.strokeStyle = FAMILY_LINE.C;
  ctx.lineWidth = 1.4 * U;
  ctx.beginPath();
  ctx.arc(0, 0, 6 * U, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffd9e2';
  ctx.shadowColor = '#ef7d9b';
  ctx.shadowBlur = 10 + 10 * tm.glow;
  ctx.beginPath();
  ctx.arc(0, 0, 3 * U, 0, TAU);
  ctx.fill();
  ctx.restore();
}
