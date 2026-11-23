/**
 * 16 个零件的程序化绘制（B 负责）。
 * ---------------------------------------------------------------
 * 全部在 32×32 的局部坐标里画（原点 = 零件中心），由 drawPart()
 * 统一做平移/缩放/旋转。对 PartId 做穷尽 switch，以后加零件会编译报错。
 * 只画形状，不判定生物学。
 */

import type { Family, PartId } from '../core';
import { FAMILY_COLORS } from './theme';

export interface PartArtOptions {
  /** 覆盖家族色（默认按 family 取）。 */
  color?: string;
  alpha?: number;
  rotation?: number;
  /** 发光/拍翼的相位（0..2π 的任意实数）。 */
  phase?: number;
  /** 眼珠看向（局部坐标，-2..2）。 */
  pupil?: { x: number; y: number };
}

/** 把 #rrggbb 转成 rgba()。 */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = Number.parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const TAU = Math.PI * 2;

/**
 * 画一个零件。
 * @param x,y 屏幕/局部坐标中的中心点
 * @param size 目标包围盒边长（px）
 */
export function drawPart(
  ctx: CanvasRenderingContext2D,
  id: PartId,
  x: number,
  y: number,
  size: number,
  family: Family,
  opts: PartArtOptions = {},
): void {
  const color = opts.color ?? FAMILY_COLORS[family];
  const phase = opts.phase ?? 0;
  ctx.save();
  ctx.translate(x, y);
  if (opts.rotation) ctx.rotate(opts.rotation);
  const s = size / 32;
  ctx.scale(s, s);
  ctx.globalAlpha *= opts.alpha ?? 1;
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;

  switch (id) {
    case 'head':
      drawHead(ctx, color);
      break;
    case 'eye':
      drawEye(ctx, color, opts.pupil);
      break;
    case 'horn':
      drawHorn(ctx, color);
      break;
    case 'antenna':
      drawAntenna(ctx, color, phase);
      break;
    case 'leg':
      drawLeg(ctx, color, false);
      break;
    case 'longleg':
      drawLeg(ctx, color, true);
      break;
    case 'claw':
      drawClaw(ctx, color);
      break;
    case 'fin':
      drawFin(ctx, color);
      break;
    case 'shell':
      drawShell(ctx, color);
      break;
    case 'spike':
      drawSpike(ctx, color);
      break;
    case 'crest':
      drawCrest(ctx, color);
      break;
    case 'wing':
      drawWingGlyph(ctx, color);
      break;
    case 'glow':
      drawGlow(ctx, color, phase);
      break;
    case 'maw':
      drawMaw(ctx, color);
      break;
    case 'sac':
      drawSac(ctx, color);
      break;
    case 'gill':
      drawGill(ctx, color);
      break;
    default: {
      // 穷尽检查：PartId 新增成员时这里编译失败。
      const _never: never = id;
      void _never;
      break;
    }
  }

  ctx.restore();
}

/* ==========================================================================
 * 各零件画法
 * ========================================================================== */

function drawHead(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.beginPath();
  ctx.moveTo(-12, 3);
  ctx.bezierCurveTo(-12, -7, -5, -12, 2, -11);
  ctx.bezierCurveTo(10, -10, 13, -4, 12, 1);
  ctx.bezierCurveTo(11, 8, 4, 12, -3, 11);
  ctx.bezierCurveTo(-9, 10, -12, 7, -12, 3);
  ctx.closePath();
  ctx.fillStyle = withAlpha(color, 0.2);
  ctx.fill();
  ctx.stroke();

  // 下颌线
  ctx.beginPath();
  ctx.moveTo(-7, 6);
  ctx.quadraticCurveTo(1, 9, 9, 4);
  ctx.globalAlpha *= 0.65;
  ctx.stroke();
  ctx.globalAlpha /= 0.65;

  // 鼻/吻端
  ctx.beginPath();
  ctx.arc(7, -1, 1.15, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  color: string,
  pupil: { x: number; y: number } | undefined,
): void {
  const px = Math.max(-2.4, Math.min(2.4, pupil?.x ?? 0));
  const py = Math.max(-2.4, Math.min(2.4, pupil?.y ?? 0));

  ctx.beginPath();
  ctx.ellipse(0, 0, 11, 8, -0.08, 0, TAU);
  ctx.fillStyle = withAlpha(color, 0.14);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(px, py, 5.4, 0, TAU);
  ctx.fillStyle = withAlpha(color, 0.72);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(px + 0.6, py + 0.4, 2.3, 0, TAU);
  ctx.fillStyle = 'rgba(8, 14, 20, 0.92)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(px - 1.8, py - 2, 1.15, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fill();
}

function drawHorn(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.beginPath();
  ctx.moveTo(-6, 9);
  ctx.bezierCurveTo(-8, 2, -2, -4, 3, -13);
  ctx.bezierCurveTo(5, -4, 9, 1, 8, 9);
  ctx.closePath();
  ctx.fillStyle = withAlpha(color, 0.2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-1, 8);
  ctx.quadraticCurveTo(0, -1, 2.4, -8.5);
  ctx.globalAlpha *= 0.55;
  ctx.stroke();
  ctx.globalAlpha /= 0.55;
}

function drawAntenna(
  ctx: CanvasRenderingContext2D,
  color: string,
  phase: number,
): void {
  const sway = Math.sin(phase) * 1.2;
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.quadraticCurveTo(-3, 2, -2 + sway, -9);
  ctx.lineWidth = 1.9;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(-2 + sway, -10.5, 2.7, 0, TAU);
  ctx.fillStyle = withAlpha(color, 0.45);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-2 + sway, -9);
  ctx.quadraticCurveTo(-7, -10, -8, -6);
  ctx.globalAlpha *= 0.5;
  ctx.stroke();
  ctx.globalAlpha /= 0.5;
}

function drawLeg(ctx: CanvasRenderingContext2D, color: string, long: boolean): void {
  const bottom = long ? 15 : 10;
  ctx.lineWidth = 3.1;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(-4, long ? 1 : -1);
  ctx.lineTo(2, long ? 8 : 5);
  ctx.lineTo(-1, bottom);
  ctx.stroke();

  // 关节节点
  ctx.beginPath();
  ctx.arc(-4, long ? 1 : -1, 1.5, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();

  // 脚
  ctx.beginPath();
  ctx.ellipse(1, bottom + 1, long ? 5.2 : 4.4, 2.1, 0, 0, TAU);
  ctx.fillStyle = withAlpha(color, 0.34);
  ctx.fill();
  ctx.stroke();
}

function drawClaw(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.beginPath();
  ctx.moveTo(-10, 6);
  ctx.quadraticCurveTo(-11, -1, -8.5, -6);
  ctx.quadraticCurveTo(-4, -1, -3, 7);
  ctx.closePath();
  ctx.fillStyle = withAlpha(color, 0.28);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-2, 7);
  ctx.quadraticCurveTo(0, -2, 4, -8);
  ctx.quadraticCurveTo(6, -1, 5, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(7, 6);
  ctx.quadraticCurveTo(9, 0, 12, -4);
  ctx.quadraticCurveTo(11, 3, 10, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawFin(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.beginPath();
  ctx.moveTo(-9, 8);
  ctx.bezierCurveTo(-12, -1, 2, -12, 11, -3);
  ctx.bezierCurveTo(5, 5, -2, 11, -9, 8);
  ctx.closePath();
  ctx.fillStyle = withAlpha(color, 0.2);
  ctx.fill();
  ctx.stroke();

  ctx.globalAlpha *= 0.5;
  ctx.beginPath();
  ctx.moveTo(-7, 6);
  ctx.quadraticCurveTo(1, 1, 8, -1);
  ctx.moveTo(-6, 7);
  ctx.quadraticCurveTo(0, 5, 4, 4);
  ctx.stroke();
  ctx.globalAlpha /= 0.5;
}

function drawShell(ctx: CanvasRenderingContext2D, color: string): void {
  for (let i = 0; i < 3; i += 1) {
    const y = 8 - i * 5;
    const w = 11 - i * 2;
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.bezierCurveTo(-w + 1, y - 8, w - 1, y - 8, w, y);
    ctx.fillStyle = withAlpha(color, 0.1 + i * 0.05);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, 9);
  ctx.lineTo(0, -2);
  ctx.globalAlpha *= 0.4;
  ctx.stroke();
  ctx.globalAlpha /= 0.4;
}

function drawSpike(ctx: CanvasRenderingContext2D, color: string): void {
  const triangles: readonly [number, number, number, number][] = [
    [-10, 7, -7, -3],
    [-3, 7, 0, -9],
    [5, 7, 8, -4],
  ];
  for (const [x1, y1, tipX, tipY] of triangles) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(x1 + 5, y1);
    ctx.closePath();
    ctx.fillStyle = withAlpha(color, 0.24);
    ctx.fill();
    ctx.stroke();
  }
}

function drawCrest(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.beginPath();
  ctx.moveTo(-11, 7);
  ctx.lineTo(-8, -3);
  ctx.lineTo(-4, 4);
  ctx.lineTo(0, -7);
  ctx.lineTo(4, 4);
  ctx.lineTo(8, -4);
  ctx.lineTo(11, 7);
  ctx.closePath();
  ctx.fillStyle = withAlpha(color, 0.2);
  ctx.fill();
  ctx.stroke();
}

function drawWingGlyph(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.beginPath();
  ctx.moveTo(-5, 5);
  ctx.bezierCurveTo(-10, -4, 1, -13, 12, -10);
  ctx.bezierCurveTo(11, -2, 5, 6, -5, 7);
  ctx.closePath();
  ctx.fillStyle = withAlpha(color, 0.16);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-5, 6);
  ctx.bezierCurveTo(-2, 0, 2, -3, 6, -5);
  ctx.globalAlpha *= 0.55;
  ctx.stroke();
  ctx.globalAlpha /= 0.55;

  ctx.beginPath();
  ctx.moveTo(-5, 5);
  ctx.quadraticCurveTo(2, 2, 9, -2);
  ctx.stroke();
}

function drawGlow(
  ctx: CanvasRenderingContext2D,
  color: string,
  phase: number,
): void {
  const pulse = 0.75 + 0.25 * Math.sin(phase);
  const halo = ctx.createRadialGradient(0, 0, 1, 0, 0, 15);
  halo.addColorStop(0, withAlpha(color, 0.5 * pulse));
  halo.addColorStop(0.45, withAlpha(color, 0.16 * pulse));
  halo.addColorStop(1, withAlpha(color, 0));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(0, 0, 5.6, 0, TAU);
  ctx.fillStyle = withAlpha(color, 0.72);
  ctx.fill();
  ctx.strokeStyle = withAlpha(color, 0.95);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(-1.7, -1.9, 1.5, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();
}

function drawMaw(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.beginPath();
  ctx.ellipse(0, 1, 10, 7.5, 0, 0, TAU);
  ctx.fillStyle = 'rgba(9, 15, 22, 0.65)';
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const x = -6.5 + i * 3.2;
    ctx.moveTo(x, -5.6);
    ctx.lineTo(x + 1.4, -2.6);
    ctx.lineTo(x + 2.8, -5.6);
  }
  ctx.fillStyle = withAlpha(color, 0.5);
  ctx.fill();
  ctx.stroke();
}

function drawSac(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.beginPath();
  ctx.ellipse(0, 1, 9.5, 10, 0, 0, TAU);
  ctx.fillStyle = withAlpha(color, 0.18);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(-3, -3, 3.2, Math.PI * 1.1, Math.PI * 1.7);
  ctx.globalAlpha *= 0.6;
  ctx.stroke();
  ctx.globalAlpha /= 0.6;
}

function drawGill(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.lineWidth = 2.2;
  for (let i = 0; i < 3; i += 1) {
    const x = -6 + i * 6;
    ctx.beginPath();
    ctx.moveTo(x, -7);
    ctx.quadraticCurveTo(x + 2.2, 0, x, 7);
    ctx.strokeStyle = withAlpha(color, 0.9 - i * 0.12);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 9.5, 0, 0, TAU);
  ctx.strokeStyle = withAlpha(color, 0.28);
  ctx.stroke();
}


/* ==========================================================================
 * 关节肢体 / 翅膀（供 creature.ts 的 IK 与扇动使用）
 * ========================================================================== */

export interface Point2 {
  x: number;
  y: number;
}

/** 用 IK 解出的髋/膝/脚画一条两段小腿（+脚掌/爪/鳍蹼）。 */
export function drawLimb(
  ctx: CanvasRenderingContext2D,
  kind: 'leg' | 'longleg' | 'claw' | 'fin',
  family: Family,
  U: number,
  hip: Point2,
  knee: Point2,
  foot: Point2,
  footRot: number,
  lod: 0 | 1 | 2,
  highlight = 0,
): void {
  const fill = FAMILY_FILL[family];
  const line = FAMILY_COLORS[family];
  const hl = FAMILY_HL[family];
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (highlight > 0.01) {
    ctx.shadowColor = line;
    ctx.shadowBlur = 14 * highlight;
  }

  if (lod === 0) {
    ctx.strokeStyle = fill;
    ctx.lineWidth = 4.4 * U;
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(knee.x, knee.y);
    ctx.lineTo(foot.x, foot.y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.strokeStyle = fill;
  ctx.lineWidth = 4.4 * U;
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(knee.x, knee.y);
  ctx.stroke();
  ctx.lineWidth = 3.2 * U;
  ctx.beginPath();
  ctx.moveTo(knee.x, knee.y);
  ctx.lineTo(foot.x, foot.y);
  ctx.stroke();

  if (lod === 2) {
    ctx.strokeStyle = withAlpha(hl, 0.35);
    ctx.lineWidth = 1 * U;
    ctx.beginPath();
    ctx.moveTo(hip.x + (knee.x - hip.x) * 0.15 - 1 * U, hip.y + (knee.y - hip.y) * 0.15 - 1 * U);
    ctx.lineTo(hip.x + (knee.x - hip.x) * 0.6 - 1 * U, hip.y + (knee.y - hip.y) * 0.6 - 1 * U);
    ctx.stroke();
  }

  ctx.fillStyle = fill;
  ctx.strokeStyle = line;
  ctx.lineWidth = 1.2 * U;
  ctx.beginPath();
  ctx.arc(hip.x, hip.y, 3.2 * U, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0f2321';
  ctx.beginPath();
  ctx.arc(knee.x, knee.y, 2.8 * U, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.translate(foot.x, foot.y);
  ctx.rotate(footRot);
  ctx.fillStyle = withAlpha(line, 0.22);
  ctx.strokeStyle = line;
  ctx.lineWidth = 1.2 * U;
  if (kind === 'claw') {
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(i * 4 * U, 6 * U);
      ctx.lineTo((i + 0.4) * 4 * U, 2 * U);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (kind === 'fin') {
    ctx.beginPath();
    ctx.ellipse(2 * U, 0, 8 * U, 4 * U, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (lod === 2) {
      ctx.strokeStyle = withAlpha(line, 0.3);
      ctx.lineWidth = 0.8 * U;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(2 * U + i * 2.5 * U, (i - 1) * 2.4 * U);
        ctx.stroke();
      }
    }
  } else {
    const rw = kind === 'longleg' ? 9 * U : 8 * U;
    ctx.beginPath();
    ctx.ellipse(1.5 * U, 1.3 * U, rw / 2, 2.2 * U, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

/** 三片翼膜 + 前缘骨，调用前把 ctx 移到肩部并做扇动旋转。 */
export function drawWing(
  ctx: CanvasRenderingContext2D,
  U: number,
  flap: number,
  lag: number,
  lod: 0 | 1 | 2,
  alpha = 1,
): void {
  ctx.save();
  ctx.rotate(flap);
  ctx.scale(1, 0.94 + 0.06 * Math.abs(Math.cos(flap)));
  ctx.globalAlpha *= alpha;
  const wx = 3 * U;
  const wy = -34 * U;
  const tips: [number, number][] = [
    [-16 * U + lag, -27 * U],
    [-30 * U, -7 * U],
    [-13 * U, -2 * U],
  ];

  for (let i = 0; i < 3; i += 1) {
    const tip = tips[i];
    const prev = i === 0 ? ([0, 0] as [number, number]) : tips[i - 1];
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(wx, wy);
    ctx.quadraticCurveTo((wx + tip[0]) / 2 + 4 * U, (wy + tip[1]) / 2 - 2 * U, tip[0], tip[1]);
    ctx.quadraticCurveTo((tip[0] + prev[0]) / 2 - 2 * U, (tip[1] + prev[1]) / 2 + 2 * U, prev[0], prev[1]);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? 'rgba(165,139,240,0.25)' : 'rgba(165,139,240,0.16)';
    ctx.fill();
    if (lod > 0) {
      ctx.strokeStyle = 'rgba(214,200,255,0.38)';
      ctx.lineWidth = 0.9 * U;
      ctx.stroke();
    }
  }

  ctx.strokeStyle = FAMILY_COLORS.G;
  ctx.lineWidth = 2.8 * U;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(wx, wy);
  ctx.stroke();
  ctx.fillStyle = FAMILY_COLORS.G;
  ctx.beginPath();
  ctx.arc(wx, wy, 2.4 * U, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(214,200,255,0.5)';
  ctx.lineWidth = 0.9 * U;
  for (const tip of tips) {
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.lineTo(tip[0] * 0.96, tip[1] * 0.96);
    ctx.stroke();
  }
  ctx.restore();
}

const FAMILY_FILL: Readonly<Record<Family, string>> = {
  A: '#3d3120',
  U: '#16302e',
  G: '#2b2440',
  C: '#3a2430',
};
const FAMILY_HL: Readonly<Record<Family, string>> = {
  A: '#ffe0a3',
  U: '#9df0e0',
  G: '#d6c8ff',
  C: '#ffb8c8',
};
