/**
 * 跑道与生物舞台（B 负责）。
 * ---------------------------------------------------------------
 * 只消费 Phenotype / Gate / Judgement。闸门判定完全来自 judge()，
 * 这里负责把它演出来：跑动、停顿、成功穿越、可爱失败、终点旗与结算回调。
 */

import type {
  Gate,
  GateCheck,
  GeneDiff,
  GeneIssue,
  Judgement,
  Level,
  Phenotype,
  StatKey,
} from '../core';
import {
  buildCreature,
  drawCreature,
  type CreatureLayout,
  type CreatureRenderState,
} from './creature';
import {
  clamp,
  easeOutCubic,
  easeOutElastic,
  easeOutQuad,
  hash01,
  lerp,
  progress,
  prefersReducedMotion,
} from './anim';
import { COLORS, FONT_MONO } from './theme';
import { displayUpper, gateLabel, statLabel, t } from './i18n';

export interface StageCallbacks {
  onPass: (judgement: Judgement) => void;
  onFail: (judgement: Judgement) => void;
}

type Phase = 'idle' | 'running' | 'failed' | 'passed';

interface GateBreak {
  index: number;
  at: number;
}

interface RunSegment {
  kind: 'travel' | 'hold' | 'fail' | 'finish';
  start: number;
  end: number;
  fromX: number;
  toX: number;
  gateIndex?: number;
}

interface RunPlan {
  segments: RunSegment[];
  total: number;
  judgement: Judgement;
}

export class Stage {
  private readonly host: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly callbacks: StageCallbacks;
  private readonly ro: ResizeObserver;

  private level: Level;
  private phenotype: Phenotype;
  private judgement: Judgement | null = null;
  private layout: CreatureLayout;

  private phase: Phase = 'idle';
  private plan: RunPlan | null = null;
  private runStart = 0;
  private brokenGates: GateBreak[] = [];
  private failGateIndex: number | null = null;
  private failStart = 0;
  private passedFlag = false;
  private finishedNotified = false;

  private growth: { index: number; start: number; duration: number }[] = [];
  private pendingMorph: { phenotype: Phenotype; diff: GeneDiff; at: number } | null = null;
  private pointer: { x: number; y: number } | null = null;
  private highlightPart: number | null = null;
  private reduced = prefersReducedMotion();
  private width = 800;
  private height = 420;
  private dpr = 1;
  private disposed = false;
  private hoverGate: number | null = null;
  private readonly onPointerMove = (e: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    this.hoverGate = this.gateAtPoint(this.pointer.x, this.pointer.y);
    this.canvas.style.cursor = this.hoverGate !== null ? 'help' : '';
  };
  private readonly onPointerLeave = (): void => {
    this.pointer = null;
    this.hoverGate = null;
    this.canvas.style.cursor = '';
  };

  constructor(host: HTMLElement, level: Level, phenotype: Phenotype, callbacks: StageCallbacks) {
    this.host = host;
    this.level = level;
    this.phenotype = phenotype;
    this.callbacks = callbacks;
    this.layout = buildCreature(phenotype);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stage-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', t('stage.aria'));
    host.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;

    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.initialGrowth();
  }

  dispose(): void {
    this.disposed = true;
    this.ro.disconnect();
  }

  /* ------------------------------ 外部 API ------------------------------ */

  setLevel(level: Level, phenotype: Phenotype): void {
    this.level = level;
    this.phenotype = phenotype;
    this.layout = buildCreature(phenotype);
    this.pendingMorph = null;
    this.phase = 'idle';
    this.plan = null;
    this.judgement = null;
    this.brokenGates = [];
    this.failGateIndex = null;
    this.passedFlag = false;
    this.finishedNotified = false;
    this.initialGrowth();
  }

  setPhenotype(phenotype: Phenotype, diff?: GeneDiff): void {
    const now = performance.now();
    if (!diff) {
      this.pendingMorph = null;
      this.phenotype = phenotype;
      this.layout = buildCreature(phenotype);
      this.initialGrowth(now);
      return;
    }
    // 先让旧身体撑过基因带的平移（约 200ms），再在接缝处重排，
    // 这样舞台上的零件变化会和翻牌同步，而不是提前跳变。
    if (this.pendingMorph) this.applyMorph(this.pendingMorph, now);
    this.pendingMorph = {
      phenotype,
      diff,
      at: now + (this.reduced ? 0 : 200),
    };
  }

  private applyMorph(morph: { phenotype: Phenotype; diff: GeneDiff; at: number }, now = performance.now()): void {
    this.phenotype = morph.phenotype;
    this.layout = buildCreature(morph.phenotype);
    const first = Math.max(0, morph.diff.firstChange);
    const base = morph.at + (this.reduced ? 0 : 20);
    for (const change of morph.diff.partChanges) {
      if (change.kind === 'kept' || !change.after) continue;
      const offset = morph.diff.firstChange >= 0 ? Math.max(0, change.index - first) : 0;
      this.growth = this.growth.filter((g) => g.index !== change.after!.index);
      this.growth.push({
        index: change.after.index,
        start: base + offset * 55,
        duration: this.reduced ? 0 : 360,
      });
    }
    void now;
  }

  private updateMorph(now: number): void {
    if (!this.pendingMorph) return;
    if (now < this.pendingMorph.at) return;
    const morph = this.pendingMorph;
    this.pendingMorph = null;
    this.applyMorph(morph, now);
  }

  setJudgement(judgement: Judgement): void {
    this.judgement = judgement;
  }

  setIssue(_issue: GeneIssue | null): void {
    // 化烟/尾部断口由 phenotype.size 与 issue 决定；目前 issue 仅用于 no_stop 的尾部断口。
    this.issue = _issue;
  }

  private issue: GeneIssue | null = null;

  setHighlightPart(index: number | null): void {
    this.highlightPart = index;
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }

  refreshLanguage(): void {
    this.canvas.setAttribute('aria-label', t('stage.aria'));
  }

  isRunning(): boolean {
    return this.phase === 'running';
  }

  getPhase(): Phase {
    return this.phase;
  }

  /** 开始跑。返回 false 表示基因非法或正在跑。 */
  run(judgement: Judgement): boolean {
    if (this.phase === 'running') return false;
    if (judgement.outcome === 'invalid') return false;
    if (this.pendingMorph) {
      const morph = this.pendingMorph;
      this.pendingMorph = null;
      this.applyMorph(morph);
    }
    this.judgement = judgement;
    this.phase = 'running';
    this.runStart = performance.now();
    this.brokenGates = [];
    this.failGateIndex = null;
    this.passedFlag = false;
    this.finishedNotified = false;
    this.plan = this.buildPlan(judgement, this.runStart);
    return true;
  }

  /** 编辑后清掉上一次跑动留下的失败/通过演出（不重播零件生长）。 */
  clearRun(): void {
    if (this.phase === 'running') return;
    this.phase = 'idle';
    this.plan = null;
    this.brokenGates = [];
    this.failGateIndex = null;
    this.passedFlag = false;
    this.finishedNotified = false;
  }

  /** 回到起跑线（不改变基因）。 */
  resetRun(): void {
    this.phase = 'idle';
    this.plan = null;
    this.brokenGates = [];
    this.failGateIndex = null;
    this.passedFlag = false;
    this.finishedNotified = false;
    this.initialGrowth();
  }

  /* ------------------------------ 布局 ------------------------------ */

  private resize(): void {
    const rect = this.host.getBoundingClientRect();
    if (rect.width === 0) return;
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(this.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.height * this.dpr));
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }

  private initialGrowth(now = performance.now()): void {
    this.growth = this.phenotype.parts.map((part, i) => ({
      index: part.index,
      start: now + 80 + i * 55,
      duration: this.reduced ? 0 : 340,
    }));
  }

  private growthOf(index: number, now: number): number {
    const g = this.growth.find((x) => x.index === index);
    if (!g) return 1;
    const t = progress(now, g.start, g.duration);
    if (t >= 1) return 1;
    if (t <= 0) return 0;
    return easeOutElastic(t);
  }

  private get groundY(): number {
    return this.height - Math.max(64, Math.min(112, this.height * 0.18));
  }

  private get trackX0(): number {
    return Math.max(96, this.width * 0.085);
  }

  private get trackX1(): number {
    return this.width - Math.max(92, this.width * 0.08);
  }

  private gateX(at: number): number {
    return this.trackX0 + at * (this.trackX1 - this.trackX0);
  }

  private get creatureScale(): number {
    return clamp(Math.min(this.width / 820, this.height / 370), 0.58, 2.25);
  }

  private gateAtPoint(x: number, y: number): number | null {
    if (y < this.groundY - 150 || y > this.groundY + 10) return null;
    for (let i = 0; i < this.level.gates.length; i += 1) {
      const gx = this.gateX(this.level.gates[i].at);
      if (Math.abs(x - gx) < 44) return i;
    }
    return null;
  }

  /* ------------------------------ 跑动时间轴 ------------------------------ */

  private buildPlan(judgement: Judgement, start: number): RunPlan {
    const segments: RunSegment[] = [];
    let t = start;
    let pos = 0;
    const track = Math.max(1, this.trackX1 - this.trackX0);
    const speedPerPx = (this.reduced ? 900 : 4200) / track;

    for (let i = 0; i < this.level.gates.length; i += 1) {
      const gate = this.level.gates[i];
      // 停在闸门之前一点：横版视角下不要站在沟壑正上方。
      const stopAt = Math.max(0, gate.at - (gate.kind === 'chasm' ? 0.072 : 0.04));
      if (stopAt > pos) {
        const dur = Math.max(220, (stopAt - pos) * track * speedPerPx);
        segments.push({ kind: 'travel', start: t, end: t + dur, fromX: pos, toX: stopAt, gateIndex: i });
        t += dur;
      }
      const hold = this.reduced ? 260 : 430;
      segments.push({ kind: 'hold', start: t, end: t + hold, fromX: stopAt, toX: stopAt, gateIndex: i });
      t += hold;

      if (judgement.failedGateIndex === i) {
        const failDur = this.reduced ? 320 : 900;
        segments.push({ kind: 'fail', start: t, end: t + failDur, fromX: stopAt, toX: stopAt, gateIndex: i });
        t += failDur;
        return { segments, total: t - start, judgement };
      }
      pos = stopAt;
    }

    // 最后一个闸门之后到终点
    if (pos < 1) {
      const dur = Math.max(300, (1 - pos) * track * speedPerPx);
      segments.push({ kind: 'travel', start: t, end: t + dur, fromX: pos, toX: 1 });
      t += dur;
    }
    segments.push({ kind: 'finish', start: t, end: t + (this.reduced ? 200 : 700), fromX: 1, toX: 1 });
    return { segments, total: t - start, judgement };
  }

  private segmentAt(now: number): { seg: RunSegment; local: number; elapsed: number } | null {
    const plan = this.plan;
    if (!plan) return null;
    const elapsed = now - this.runStart;
    for (const seg of plan.segments) {
      if (now >= seg.start && now < seg.end) {
        return { seg, local: progress(now, seg.start, seg.end - seg.start), elapsed };
      }
    }
    const last = plan.segments[plan.segments.length - 1];
    if (last && now >= last.end) {
      return { seg: last, local: 1, elapsed };
    }
    return plan.segments[0] ? { seg: plan.segments[0], local: 0, elapsed } : null;
  }

  /* ------------------------------ 渲染 ------------------------------ */

  render(now: number): void {
    if (this.disposed) return;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    this.updateMorph(now);
    this.updateRun(now);

    this.drawBackground(ctx, now);

    let pose: Pose = this.poseFor(now);
    const shake = this.shakeAmount(now);
    ctx.save();
    if (shake > 0) {
      ctx.translate(Math.sin(now * 0.09) * shake, Math.cos(now * 0.11) * shake * 0.6);
    }

    this.drawGround(ctx, now);
    this.drawGates(ctx, now);
    this.drawFinish(ctx, now);

    if (this.phenotype.size > 0) {
      const scale = this.creatureScale;
      const state: CreatureRenderState = {
        now,
        running: this.phase === 'running' && pose.moving,
        runPhase: pose.runPhase,
        growth: (index) => this.growthOf(index, now),
        alpha: pose.alpha,
        tilt: pose.tilt,
        pointer: this.pointer,
        highlight: (index) => (this.highlightPart === index ? 1 : 0),
        fracture: this.issue === 'no_stop',
      };
      drawCreature(
        ctx,
        this.layout,
        this.trackX0 + pose.pos * (this.trackX1 - this.trackX0) + pose.dx,
        this.groundY + pose.dy,
        scale,
        state,
      );
    } else {
      this.drawSmoke(ctx, now);
    }

    ctx.restore();

    this.drawProgressStrip(ctx, now);
  }

  private updateRun(now: number): void {
    if (this.phase !== 'running' || !this.plan) return;
    // 所有已经结束的 hold 且判定通过的闸门：标记为已碎裂。
    for (const seg of this.plan.segments) {
      if (seg.kind !== 'hold' || seg.gateIndex === undefined) continue;
      if (now < seg.end) continue;
      const check = this.plan.judgement.gates[seg.gateIndex];
      if (check?.passed && !this.brokenGates.some((b) => b.index === seg.gateIndex)) {
        this.brokenGates.push({ index: seg.gateIndex, at: seg.end });
      }
    }

    const segInfo = this.segmentAt(now);
    if (segInfo) {
      const { seg } = segInfo;
      if (seg.kind === 'fail' && this.failGateIndex === null) {
        this.failGateIndex = seg.gateIndex ?? null;
        this.failStart = seg.start;
      }
      if (seg.kind === 'finish') {
        this.passedFlag = true;
      }
    }

    if (now >= this.runStart + this.plan.total) {
      this.phase = this.plan.judgement.outcome === 'pass' ? 'passed' : 'failed';
      if (!this.finishedNotified) {
        this.finishedNotified = true;
        if (this.plan.judgement.outcome === 'pass') {
          this.callbacks.onPass(this.plan.judgement);
        } else {
          this.callbacks.onFail(this.plan.judgement);
        }
      }
    } else if (this.plan.judgement.outcome === 'fail') {
      const failedSeg = this.plan.segments.find((s) => s.kind === 'fail');
      if (failedSeg && now >= failedSeg.end && !this.finishedNotified) {
        this.finishedNotified = true;
        this.phase = 'failed';
        this.callbacks.onFail(this.plan.judgement);
      }
    }
  }

  private shakeAmount(now: number): number {
    if (this.phase !== 'running' || !this.plan) return 0;
    const failSeg = this.plan.segments.find((s) => s.kind === 'fail');
    if (!failSeg) return 0;
    const t = progress(now, failSeg.start, 180);
    if (t <= 0 || t >= 1) return 0;
    return 3 * (1 - t);
  }

  private poseFor(now: number): Pose {
    const posAtStart = 0.035;
    const base: Pose = {
      pos: posAtStart,
      dx: 0,
      dy: 0,
      tilt: 0,
      alpha: 1,
      moving: false,
      runPhase: 0,
    };
    if (!this.plan || (this.phase !== 'running' && this.phase !== 'failed' && this.phase !== 'passed')) {
      base.runPhase = (now / 1400) % 1;
      return base;
    }

    const segInfo = this.segmentAt(now);
    if (!segInfo) return base;
    const { seg, local: t } = segInfo;

    if (seg.kind === 'travel') {
      const pos = lerp(seg.fromX, seg.toX, easeOutQuad(t) * 0.35 + t * 0.65);
      return {
        pos,
        dx: 0,
        dy: -Math.abs(Math.sin(now / 130)) * 2,
        tilt: 0,
        alpha: 1,
        moving: true,
        runPhase: (now / 260) % 1,
      };
    }
    if (seg.kind === 'hold') {
      return {
        pos: seg.fromX,
        dx: 0,
        dy: 0,
        tilt: Math.sin(now / 240) * 0.012,
        alpha: 1,
        moving: false,
        runPhase: 0,
      };
    }
    if (seg.kind === 'finish') {
      return {
        pos: 1,
        dx: 0,
        dy: -Math.abs(Math.sin(now / 260)) * 7,
        tilt: Math.sin(now / 300) * 0.02,
        alpha: 1,
        moving: true,
        runPhase: (now / 220) % 1,
      };
    }

    // fail：按闸门类型演
    const failGate = this.failGateIndex !== null ? this.level.gates[this.failGateIndex] : undefined;
    const kind = failGate?.kind;
    const local = this.failStart > 0 ? progress(now, this.failStart, 900) : t;
    const e = easeOutCubic(local);
    const failPose = { ...base, pos: seg.fromX, moving: false };
    // 掉进沟壑/沉入水面时先迈到闸门中心，避免在实心地面上「穿模」下坠。
    if (failGate && (failGate.kind === 'chasm' || failGate.kind === 'water')) {
      failPose.pos = lerp(seg.fromX, failGate.at, easeOutCubic(Math.min(1, local * 3)));
    }
    switch (kind) {
      case 'chasm':
        failPose.dy = Math.min(150, 280 * e * e);
        failPose.tilt = 0.6 * e;
        failPose.alpha = 1 - clamp((local - 0.55) / 0.45, 0, 1) * 0.9;
        break;
      case 'thorn':
        failPose.dx = -Math.sin(local * Math.PI * 3.2) * (1 - local) * 34;
        failPose.tilt = Math.sin(local * Math.PI * 5) * 0.14 * (1 - local);
        break;
      case 'dark':
        failPose.tilt = local * Math.PI * 4;
        failPose.dx = Math.sin(local * Math.PI * 4) * 10;
        failPose.alpha = 1 - local * 0.5;
        break;
      case 'water':
        failPose.dy = 70 * e;
        failPose.alpha = 1 - e * 0.8;
        failPose.tilt = Math.sin(local * Math.PI * 3) * 0.05;
        break;
      default:
        failPose.dy = 40 * e;
        failPose.alpha = 1 - e * 0.8;
        break;
    }
    return failPose;
  }

  /* ------------------------------ 背景 / 地面 ------------------------------ */

  private drawBackground(ctx: CanvasRenderingContext2D, now: number): void {
    const g = ctx.createLinearGradient(0, 0, 0, this.height);
    g.addColorStop(0, '#0b1a26');
    g.addColorStop(0.62, '#08131c');
    g.addColorStop(1, '#050b10');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);

    // 顶部冷光锥
    const spot = ctx.createRadialGradient(
      this.width * 0.46,
      -this.height * 0.25,
      10,
      this.width * 0.46,
      -this.height * 0.25,
      this.height * 1.15,
    );
    spot.addColorStop(0, 'rgba(95, 227, 200, 0.1)');
    spot.addColorStop(0.45, 'rgba(72, 140, 160, 0.035)');
    spot.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, this.width, this.height);

    this.drawLabBackdrop(ctx, now);

    // 远景台面刻度
    ctx.save();
    ctx.strokeStyle = 'rgba(110, 155, 180, 0.08)';
    ctx.lineWidth = 1;
    const y = this.groundY;
    for (let i = 0; i < 9; i += 1) {
      const x = (this.width / 8) * i;
      ctx.beginPath();
      ctx.moveTo(x, y - 34 - (i % 3) * 8);
      ctx.lineTo(x, y - 4);
      ctx.stroke();
    }
    // 透视地砖
    ctx.strokeStyle = 'rgba(80, 130, 155, 0.055)';
    for (let i = 0; i <= 12; i += 1) {
      const x = (this.width / 12) * i;
      const xb = this.width / 2 + (x - this.width / 2) * 4.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(xb, this.height);
      ctx.stroke();
    }
    for (let i = 1; i <= 3; i += 1) {
      const yy = y + Math.pow(i / 4, 1.7) * (this.height - y);
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(this.width, yy);
      ctx.stroke();
    }
    ctx.restore();

    // 尘埃
    ctx.save();
    for (let i = 0; i < 28; i += 1) {
      const seed = i * 7.3;
      const speed = 4 + hash01(seed) * 10;
      const x = (hash01(seed + 2) * this.width + now * 0.004 * speed) % this.width;
      const y = 40 + hash01(seed + 5) * (this.groundY - 70);
      const a = 0.03 + hash01(seed + 9) * 0.1;
      ctx.fillStyle = `rgba(160, 220, 230, ${a})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + hash01(seed + 4) * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** 观察窗、吊灯、护栏：把跑道上方的空间填满，同时不抢生物。 */
  private drawLabBackdrop(ctx: CanvasRenderingContext2D, now: number): void {
    const y = this.groundY;
    const x0 = this.trackX0;
    const x1 = this.trackX1;
    const top = Math.max(16, y - Math.min(560, this.height * 0.78));
    const h = y - top - 8;

    // 巨大观察窗
    ctx.save();
    ctx.strokeStyle = 'rgba(95, 160, 185, 0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundRectPath(ctx, x0 - 36, top, x1 - x0 + 72, h, 10);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(95, 160, 185, 0.045)';
    for (let i = 1; i < 6; i += 1) {
      const px = x0 - 36 + ((x1 - x0 + 72) / 6) * i;
      ctx.beginPath();
      ctx.moveTo(px, top + 4);
      ctx.lineTo(px, top + h - 4);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x0 - 30, top + h * 0.42);
    ctx.lineTo(x1 + 30, top + h * 0.42);
    ctx.strokeStyle = 'rgba(95, 160, 185, 0.06)';
    ctx.stroke();

    // 观察窗角标
    ctx.font = `600 7px ${FONT_MONO}`;
    ctx.fillStyle = 'rgba(120, 170, 190, 0.28)';
    ctx.textAlign = 'left';
    ctx.fillText(t('stage.observation'), x0 - 30, top + 12);
    ctx.textAlign = 'right';
    ctx.fillText(t('stage.track'), x1 + 28, top + 12);

    // 吊灯 + 光锥
    const lamps = [x0 + (x1 - x0) * 0.3, x0 + (x1 - x0) * 0.7];
    for (let i = 0; i < lamps.length; i += 1) {
      const lx = lamps[i];
      const ly = 16;
      ctx.strokeStyle = 'rgba(150, 190, 205, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, ly);
      ctx.stroke();
      ctx.fillStyle = 'rgba(120, 165, 185, 0.16)';
      ctx.beginPath();
      roundRectPath(ctx, lx - 17, ly, 34, 4, 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(200, 240, 245, 0.35)';
      ctx.beginPath();
      ctx.roundRect(lx - 11, ly + 4, 22, 2, 1);
      ctx.fill();
      const coneH = y - ly - 12;
      const cone = ctx.createLinearGradient(0, ly, 0, y);
      cone.addColorStop(0, 'rgba(150, 225, 230, 0.07)');
      cone.addColorStop(0.55, 'rgba(110, 190, 200, 0.025)');
      cone.addColorStop(1, 'rgba(80, 150, 165, 0.0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(lx - 11, ly + 6);
      ctx.lineTo(lx + 11, ly + 6);
      ctx.lineTo(lx + 96, ly + coneH);
      ctx.lineTo(lx - 96, ly + coneH);
      ctx.closePath();
      ctx.fill();
    }

    // 远处护栏
    const railY = Math.max(top + 60, y - 208);
    ctx.strokeStyle = 'rgba(120, 165, 185, 0.07)';
    ctx.beginPath();
    ctx.moveTo(18, railY);
    ctx.lineTo(this.width - 18, railY);
    ctx.stroke();
    for (let px = 24; px < this.width - 20; px += 54) {
      ctx.beginPath();
      ctx.moveTo(px, railY);
      ctx.lineTo(px, railY - 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawGround(ctx: CanvasRenderingContext2D, now: number): void {
    const y = this.groundY;
    const x0 = 18;
    const x1 = this.width - 18;

    // 台面厚度
    const floor = ctx.createLinearGradient(0, y, 0, this.height);
    floor.addColorStop(0, 'rgba(18, 38, 52, 0.72)');
    floor.addColorStop(0.35, 'rgba(10, 22, 31, 0.82)');
    floor.addColorStop(1, 'rgba(3, 8, 12, 0.95)');
    ctx.fillStyle = floor;
    ctx.fillRect(0, y + 2, this.width, this.height - y);
    ctx.strokeStyle = 'rgba(120, 180, 200, 0.09)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 14; i += 1) {
      const px = 12 + i * (this.width / 13);
      ctx.beginPath();
      ctx.moveTo(px, y + 7);
      ctx.lineTo(px - 10, this.height);
      ctx.stroke();
    }

    // 深渊在地面之前先挖掉
    const chasm = this.level.gates.find((g) => g.kind === 'chasm');
    let gapStart = -1;
    let gapEnd = -1;
    if (chasm) {
      const gx = this.gateX(chasm.at);
      gapStart = gx - 52;
      gapEnd = gx + 52;
      const broken = this.isGateBroken(chasm);
      if (!broken) {
        const abyss = ctx.createLinearGradient(0, y, 0, this.height);
        abyss.addColorStop(0, 'rgba(2, 6, 10, 0.85)');
        abyss.addColorStop(0.4, 'rgba(3, 8, 12, 0.98)');
        abyss.addColorStop(1, '#02050a');
        ctx.fillStyle = abyss;
        ctx.fillRect(gapStart, y - 2, gapEnd - gapStart, this.height - y + 2);
        // 断口岩齿
        ctx.fillStyle = '#0d1c26';
        for (let i = 0; i < 7; i += 1) {
          const sx = gapStart + i * 8;
          ctx.beginPath();
          ctx.moveTo(sx, y);
          ctx.lineTo(sx + 4, y + 9 + (i % 3) * 4);
          ctx.lineTo(sx + 8, y);
          ctx.fill();
        }
        for (let i = 0; i < 7; i += 1) {
          const sx = gapEnd - i * 8;
          ctx.beginPath();
          ctx.moveTo(sx, y);
          ctx.lineTo(sx - 4, y + 9 + (i % 3) * 4);
          ctx.lineTo(sx - 8, y);
          ctx.fill();
        }
        // 深渊微光
        const glow = ctx.createRadialGradient((gapStart + gapEnd) / 2, y + 30, 2, (gapStart + gapEnd) / 2, y + 30, 70);
        glow.addColorStop(0, 'rgba(255, 90, 80, 0.09)');
        glow.addColorStop(1, 'rgba(255, 90, 80, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(gapStart - 20, y, gapEnd - gapStart + 40, 80);
      }
    }

    // 地面主线
    const segments: [number, number][] = [];
    if (gapStart >= 0 && !this.isGateBroken(chasm!)) {
      segments.push([x0, gapStart], [gapEnd, x1]);
    } else {
      segments.push([x0, x1]);
    }
    ctx.save();
    for (const [a, b] of segments) {
      ctx.strokeStyle = COLORS.ground;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a, y);
      ctx.lineTo(b, y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(95, 227, 200, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a, y - 2.5);
      ctx.lineTo(b, y - 2.5);
      ctx.stroke();
    }

    // 地面刻度 + 起跑线
    ctx.strokeStyle = 'rgba(110, 160, 185, 0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 20; i += 1) {
      const x = x0 + ((x1 - x0) / 20) * i;
      if (gapStart >= 0 && x > gapStart && x < gapEnd) continue;
      ctx.beginPath();
      ctx.moveTo(x, y + 4);
      ctx.lineTo(x, y + (i % 5 === 0 ? 12 : 8));
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(95, 227, 200, 0.4)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(this.trackX0, y - 18);
    ctx.lineTo(this.trackX0, y + 8);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(95, 227, 200, 0.5)';
    ctx.font = `600 8px ${FONT_MONO}`;
    ctx.textAlign = 'left';
    ctx.fillText(t('stage.start'), this.trackX0 + 4, y - 12);

    // 通过后搭桥
    if (chasm && this.isGateBroken(chasm)) {
      const t = progress(now, this.gateBreakAt(chasm), 320);
      ctx.strokeStyle = 'rgba(95, 227, 200, 0.6)';
      ctx.lineWidth = 3 * t;
      ctx.beginPath();
      ctx.moveTo(gapStart, y);
      ctx.lineTo(gapEnd, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ------------------------------ 闸门 ------------------------------ */

  private isGateBroken(gate: Gate): boolean {
    const idx = this.level.gates.indexOf(gate);
    return this.brokenGates.some((b) => b.index === idx);
  }

  private gateBreakAt(gate: Gate): number {
    const idx = this.level.gates.indexOf(gate);
    return this.brokenGates.find((b) => b.index === idx)?.at ?? this.runStart;
  }

  private gateBreakT(gate: Gate, now: number): number {
    if (!this.isGateBroken(gate)) return 0;
    return progress(now, this.gateBreakAt(gate), this.reduced ? 0 : 320);
  }

  private drawGates(ctx: CanvasRenderingContext2D, now: number): void {
    const y = this.groundY;
    this.level.gates.forEach((gate, i) => {
      const x = this.gateX(gate.at);
      const brokenT = this.gateBreakT(gate, now);
      const alpha = 1 - brokenT;
      if (alpha <= 0.01) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);

      if (gate.kind === 'thorn') {
        const collapse = brokenT;
        ctx.scale(1, Math.max(0.02, 1 - collapse));
        ctx.fillStyle = 'rgba(255, 107, 122, 0.2)';
        ctx.strokeStyle = 'rgba(255, 107, 122, 0.75)';
        ctx.lineWidth = 1.2;
        for (let s = -2; s <= 2; s += 1) {
          const sx = s * 15;
          const h = 64 - Math.abs(s) * 6;
          ctx.beginPath();
          ctx.moveTo(sx - 6, 0);
          ctx.lineTo(sx, -h);
          ctx.lineTo(sx + 7, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      } else if (gate.kind === 'dark') {
        const lift = brokenT * 110;
        const veil = ctx.createLinearGradient(0, -160, 0, 0);
        veil.addColorStop(0, 'rgba(2, 5, 9, 0)');
        veil.addColorStop(0.35, 'rgba(2, 5, 9, 0.88)');
        veil.addColorStop(1, 'rgba(2, 5, 9, 0.96)');
        ctx.fillStyle = veil;
        ctx.fillRect(-46, -225 - lift, 92, 225);
        // 两只眼睛
        ctx.fillStyle = 'rgba(95, 227, 200, 0.4)';
        ctx.beginPath();
        ctx.ellipse(-14, -104 - lift, 5, 3, 0, 0, Math.PI * 2);
        ctx.ellipse(14, -112 - lift, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (gate.kind === 'water') {
        const drain = brokenT;
        const level = -48 * (1 - drain);
        if (level < -0.5) {
          ctx.fillStyle = 'rgba(70, 200, 178, 0.16)';
          ctx.beginPath();
          ctx.moveTo(-56, 0);
          ctx.lineTo(-56, level);
          for (let wx = -56; wx <= 56; wx += 8) {
            ctx.quadraticCurveTo(wx + 4, level - 3, wx + 8, level);
          }
          ctx.lineTo(56, 0);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(70, 200, 178, 0.5)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(-56, level);
          ctx.quadraticCurveTo(-26, level - 4, 0, level);
          ctx.quadraticCurveTo(26, level + 4, 56, level);
          ctx.stroke();
          // 气泡
          for (let b = 0; b < 4; b += 1) {
            const bx = -30 + b * 18 + Math.sin(now / 600 + b) * 3;
            const by = level + 6 + ((now / 20 + b * 22) % 24);
            ctx.fillStyle = 'rgba(70, 200, 178, 0.25)';
            ctx.beginPath();
            ctx.arc(bx, by, 1.6 + b * 0.3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (gate.kind === 'chasm') {
        // 断口本身已在地面绘制，这里画警示桩
        ctx.strokeStyle = 'rgba(255, 200, 87, 0.5)';
        ctx.lineWidth = 1;
        for (const sx of [-54, 54]) {
          ctx.beginPath();
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, -14);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(sx - 4, -14);
          ctx.lineTo(sx + 4, -14);
          ctx.stroke();
        }
      }
      ctx.restore();

      // 标签与要求
      this.drawGateLabel(ctx, gate, x, y, i, now);
    });
  }

  private drawGateLabel(
    ctx: CanvasRenderingContext2D,
    gate: Gate,
    x: number,
    y: number,
    index: number,
    now: number,
  ): void {
    const check = this.judgement?.gates[index];
    const broken = this.isGateBroken(gate);
    const results = gate.requires.map((r) => {
      const actual = check ? this.actualFor(check, r.stat, r.min) : this.actualStat(r.stat);
      const met = check
        ? check.checks.find((c) => c.stat === r.stat)?.met ?? actual >= r.min
        : actual >= r.min;
      return { req: r, actual, met };
    });
    const met = gate.mode === 'any' ? results.some((r) => r.met) : results.every((r) => r.met);
    const color = broken ? COLORS.ok : met ? COLORS.accent : COLORS.warn;
    const plateY = Math.max(36, y - 206);
    const label = displayUpper(gateLabel(gate));

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 从牌子垂到闸门的虚线
    ctx.strokeStyle = 'rgba(130, 170, 190, 0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(x, plateY + 48);
    ctx.lineTo(x, y - 18);
    ctx.stroke();
    ctx.setLineDash([]);

    // 名字牌
    ctx.font = `700 11px ${FONT_MONO}`;
    const labelW = Math.max(96, ctx.measureText(label).width + 26);
    ctx.beginPath();
    roundRectPath(ctx, x - labelW / 2, plateY, labelW, 23, 4);
    ctx.fillStyle = 'rgba(6, 14, 20, 0.82)';
    ctx.fill();
    ctx.strokeStyle = withAlphaSafe(color, broken ? 0.5 : 0.42);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = broken ? COLORS.ok : 'rgba(220, 235, 242, 0.9)';
    ctx.fillText(label, x, plateY + 12);

    // 要求牌
    const reqText = results
      .map((r) => `${statLabel(r.req.stat)} ${r.actual}/${r.req.min}`)
      .join('   ');
    const prefix = gate.mode === 'any' ? t('common.any') : t('common.all');
    const full = t('stage.requirement', { mode: prefix, reqs: reqText });
    ctx.font = `600 8.5px ${FONT_MONO}`;
    const reqW = Math.max(labelW, ctx.measureText(full).width + 18);
    ctx.beginPath();
    roundRectPath(ctx, x - reqW / 2, plateY + 26, reqW, 18, 3);
    ctx.fillStyle = 'rgba(6, 14, 20, 0.72)';
    ctx.fill();
    ctx.strokeStyle = withAlphaSafe(color, 0.22);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(full, x, plateY + 35);

    // 停顿/失败时的判定牌
    const emphasis = this.judgementEmphasis(index, now);
    if (emphasis > 0 && check) {
      const ok = check.passed;
      const verdictColor = ok ? COLORS.ok : COLORS.bad;
      const text = ok ? t('stage.cleared') : t('stage.tooShort');
      ctx.globalAlpha = emphasis;
      ctx.font = `700 11px ${FONT_MONO}`;
      const vw = ctx.measureText(text).width + 30;
      const vy = Math.max(8, plateY - 32);
      ctx.beginPath();
      roundRectPath(ctx, x - vw / 2, vy, vw, 23, 4);
      ctx.fillStyle = 'rgba(5, 12, 17, 0.92)';
      ctx.fill();
      ctx.strokeStyle = verdictColor;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.fillStyle = verdictColor;
      ctx.fillText(`${ok ? '✓' : '✕'} ${text}`, x, vy + 12);
      if (!ok) {
        ctx.beginPath();
        ctx.arc(x - vw / 2 - 12, vy + 11.5, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 107, 122, 0.14)';
        ctx.fill();
        ctx.strokeStyle = verdictColor;
        ctx.stroke();
        ctx.fillStyle = verdictColor;
        ctx.font = `700 11px ${FONT_MONO}`;
        ctx.fillText('!', x - vw / 2 - 12, vy + 12);
      }
    }
    ctx.restore();
  }

  private actualStat(stat: StatKey): number {
    return this.phenotype.stats[stat];
  }

  private actualFor(check: GateCheck, stat: StatKey, fallback: number): number {
    const found = check.checks.find((c) => c.stat === stat);
    return found ? found.actual : fallback;
  }

  private judgementEmphasis(index: number, now: number): number {
    if (!this.plan) {
      // 待机时也有淡淡的要求提示
      return this.judgement?.outcome === 'fail' ? 0 : 0;
    }
    const hold = this.plan.segments.find((s) => s.kind === 'hold' && s.gateIndex === index);
    const failSeg = this.plan.segments.find((s) => s.kind === 'fail' && s.gateIndex === index);
    if (failSeg && now >= failSeg.start) return 1;
    if (hold && now >= hold.start) {
      return clamp(progress(now, hold.start, 120), 0, 1);
    }
    return 0;
  }

  /* ------------------------------ 终点 ------------------------------ */

  private drawFinish(ctx: CanvasRenderingContext2D, now: number): void {
    const x = this.trackX1 + 30;
    const y = this.groundY;
    const wave = Math.sin(now / 260) * (this.passedFlag ? 4 : 1.2);
    ctx.save();
    ctx.strokeStyle = 'rgba(190, 215, 228, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 88);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y - 90, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.accent;
    ctx.fill();

    const unfurl = this.passedFlag ? 1 : 0.6;
    const fw = 44 * unfurl;
    ctx.beginPath();
    ctx.moveTo(x + 1, y - 86);
    ctx.quadraticCurveTo(x + fw * 0.55, y - 83 + wave, x + fw, y - 76 + wave);
    ctx.lineTo(x + fw * 0.92, y - 56 + wave * 0.6);
    ctx.quadraticCurveTo(x + fw * 0.45, y - 58, x + 1, y - 60);
    ctx.closePath();
    ctx.fillStyle = this.passedFlag ? 'rgba(95, 227, 200, 0.72)' : 'rgba(95, 227, 200, 0.25)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(95, 227, 200, 0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 旗面暗格
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(4, 14, 17, 0.35)';
    for (let i = 0; i < 2; i += 1) {
      ctx.fillRect(x + 8 + i * 16, y - 86, 8, 32);
    }
    ctx.restore();

    ctx.font = `700 8px ${FONT_MONO}`;
    ctx.fillStyle = 'rgba(95, 227, 200, 0.55)';
    ctx.textAlign = 'left';
    ctx.fillText(t('stage.finish'), x + 2, y - 98);
    ctx.restore();
  }

  /* ------------------------------ 烟 / 判定 / HUD ------------------------------ */

  private drawSmoke(ctx: CanvasRenderingContext2D, now: number): void {
    const x = this.trackX0 + 36;
    const y = this.groundY - 18;
    ctx.save();
    for (let i = 0; i < 7; i += 1) {
      const phase = ((now / 1600 + i * 0.17) % 1);
      const px = x + Math.sin(now / 600 + i * 2) * (8 + phase * 16);
      const py = y - phase * 50;
      const r = 8 + phase * 16;
      const a = (1 - phase) * 0.12;
      ctx.fillStyle = `rgba(170, 200, 210, ${a})`;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawProgressStrip(ctx: CanvasRenderingContext2D, now: number): void {
    if (this.phase !== 'running' || !this.plan) return;
    const done = progress(now, this.runStart, this.plan.total);
    const w = 120;
    const x = this.width / 2 - w / 2;
    const y = 16;
    ctx.save();
    ctx.fillStyle = 'rgba(95, 227, 200, 0.08)';
    roundRectPath(ctx, x, y, w, 3, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(95, 227, 200, 0.65)';
    roundRectPath(ctx, x, y, w * done, 3, 2);
    ctx.fill();
    ctx.font = `600 8px ${FONT_MONO}`;
    ctx.fillStyle = 'rgba(160, 200, 215, 0.65)';
    ctx.textAlign = 'center';
    ctx.fillText(t('stage.running'), this.width / 2, y - 4);
    ctx.restore();
  }
}

interface Pose {
  pos: number;
  dx: number;
  dy: number;
  tilt: number;
  alpha: number;
  moving: boolean;
  runPhase: number;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function withAlphaSafe(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = Number.parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
