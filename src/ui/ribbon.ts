/**
 * 基因带（B 负责）。
 * ---------------------------------------------------------------
 * 完全由 Gene.codons 驱动排版，绝不自己按 index % 3 分组。
 * 负责：读框标尺、分组框、碱基格、零件图标、命中测试、
 *       插入/删除/替换的移码动画（由 diffGenes 的 seam/shiftBy/partChanges 驱动）。
 */

import type {
  Base,
  CodonSlot,
  EditOp,
  EditRequest,
  Gene,
  GeneDiff,
  GeneIssue,
  Level,
  Part,
  PartChange,
  StatKey,
} from '../core';
import { BASE_ORDER } from '../core';
import {
  easeInOutCubic,
  easeOutCubic,
  prefersReducedMotion,
  progress,
  clamp,
} from './anim';
import { drawPart } from './parts-art';
import { BASE_COLORS, COLORS, FAMILY_COLORS, FONT_MONO, RIBBON } from './theme';
import { displayUpper, partBlurb, partLabel, statLabel, t } from './i18n';

/* ==========================================================================
 * 类型与回调
 * ========================================================================== */

export interface RibbonCallbacks {
  /** 请求执行编辑；App 调 Session 后会把结果/拒绝反馈给玩家。 */
  onEdit: (req: EditRequest) => void;
  onUndo: () => void;
  onReset: () => void;
  onRun: () => void;
  /** 模式变化（HUD 按钮高亮同步）。 */
  onModeChange: (mode: EditOp) => void;
  /** 悬停某个零件时高亮舞台上的对应部位。 */
  onHoverPart: (partIndex: number | null) => void;
  /** Esc 等关闭上层浮层。 */
  onEscape: () => void;
  /** 悬停 / 键盘光标预览；null = 关闭预览。 */
  onPreview: (req: RibbonPreviewRequest | null) => void;
  /** 从基因带拖起一个碱基（超过 6px 阈值后触发）。 */
  onBaseDragStart: (index: number, base: Base, x: number, y: number) => void;
  /** 触屏点缝隙：先预览、再点卡片落子。 */
  onGapTap: (index: number) => void;
}

export interface RibbonPreviewRequest {
  op: 'insert' | 'delete' | 'replace';
  index: number;
}

interface BaseCell {
  index: number;
  base: Base;
  x: number;
  slotIndex: number;
  role: CodonSlot['role'];
}

interface SlotFrame {
  slot: CodonSlot;
  /** 分组框内容起点（第一个碱基 x）。 */
  x: number;
  width: number;
  cells: BaseCell[];
}

interface Layout {
  cells: BaseCell[];
  slots: SlotFrame[];
  contentWidth: number;
}

interface ShiftAnim {
  diff: GeneDiff;
  start: number;
  duration: number;
  reduced: boolean;
  beforeLayout: Layout;
  afterLayout: Layout;
  fromX: number[];
  newBaseIndex: number | null;
  deletedCell: BaseCell | null;
  scanX: number;
  scanColor: string;
  flips: PartChange[];
  silentFlip: { part: Part; x: number } | null;
  totalDuration: number;
}

interface PickerState {
  op: 'insert' | 'replace';
  index: number;
}

type Hover =
  | { kind: 'gap'; index: number }
  | { kind: 'base'; index: number }
  | { kind: 'slot'; slotIndex: number }
  | null;

/* ==========================================================================
 * 布局
 * ========================================================================== */

/** 水平尺寸可以按视口等比压缩（有下限），保证 1280 宽下末组不被裁掉。 */
interface LayoutMetrics {
  baseW: number;
  baseGap: number;
  codonGap: number;
  padX: number;
  gapW: number;
  gapHit: number;
}

const FULL_METRICS: LayoutMetrics = {
  baseW: RIBBON.baseW,
  baseGap: RIBBON.baseGap,
  codonGap: RIBBON.codonGap,
  padX: RIBBON.padX,
  gapW: RIBBON.gapW,
  gapHit: RIBBON.gapHit,
};

const MIN_METRIC_SCALE = 0.78;

function buildLayout(gene: Gene, m: LayoutMetrics): Layout {
  const cells: BaseCell[] = [];
  const slots: SlotFrame[] = [];
  let cursor = m.padX;
  let baseIndex = 0;
  let prevSlot: CodonSlot | null = null;

  for (const slot of gene.codons) {
    const untranslated = (s: CodonSlot): boolean =>
      s.role === 'junk' || s.role === 'trailer' || s.role === 'partial';
    const gap = prevSlot && untranslated(prevSlot) && untranslated(slot)
      ? m.baseGap
      : m.codonGap;
    const width = slot.bases.length * m.baseW + Math.max(0, slot.bases.length - 1) * m.baseGap;
    const frameCells: BaseCell[] = [];
    for (let j = 0; j < slot.bases.length; j += 1) {
      const cell: BaseCell = {
        index: baseIndex,
        base: slot.bases[j],
        x: cursor + j * (m.baseW + m.baseGap),
        slotIndex: slot.index,
        role: slot.role,
      };
      cells.push(cell);
      frameCells.push(cell);
      baseIndex += 1;
    }
    slots.push({ slot, x: cursor, width, cells: frameCells });
    cursor += width + gap;
    prevSlot = slot;
  }

  return {
    cells,
    slots,
    contentWidth: cursor - m.codonGap + m.padX,
  };
}

/** 下标 i 之前的缝隙中心（内容坐标）。 */
function gapCenterX(layout: Layout, index: number, m: LayoutMetrics): number {
  const cells = layout.cells;
  if (cells.length === 0) return m.padX;
  if (index <= 0) return cells[0].x - m.gapW / 2;
  if (index >= cells.length) {
    const last = cells[cells.length - 1];
    return last.x + m.baseW + m.gapW / 2;
  }
  const prev = cells[index - 1];
  const next = cells[index];
  if (prev.slotIndex === next.slotIndex) {
    return next.x - m.baseGap / 2;
  }
  return (prev.x + m.baseW + next.x) / 2;
}

function statsText(part: Part): string {
  const entries = Object.entries(part.definition.stats) as [StatKey, number][];
  if (entries.length === 0) return t('common.noBonus');
  return entries.map(([k, v]) => `+${v} ${statLabel(k)}`).join('  ');
}

function issueStamp(issue: GeneIssue | null): string {
  switch (issue) {
    case 'no_start':
    case 'empty':
    case 'bad_char':
      return t('state.noStartStamp');
    case 'no_stop':
      return t('state.noStopStamp');
    case null:
      return '';
    default: {
      const _never: never = issue;
      void _never;
      return '';
    }
  }
}

/* ==========================================================================
 * GeneRibbon
 * ========================================================================== */

export class GeneRibbon {
  private readonly host: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly callbacks: RibbonCallbacks;
  private readonly pickerEl: HTMLDivElement;
  private readonly tipEl: HTMLDivElement;
  private readonly stampEl: HTMLDivElement;
  private readonly modeHintEl: HTMLDivElement;
  private readonly keysEl: HTMLDivElement;
  private readonly ro: ResizeObserver;

  private level: Level;
  private gene: Gene;
  private layout: Layout;
  private metrics: LayoutMetrics = { ...FULL_METRICS };
  private mode: EditOp = 'insert';
  private cursor = 0;
  private scrollX = 0;
  private scrollTarget = 0;
  private viewW = 600;
  private viewH: number = RIBBON.height;
  private dpr = 1;

  private hover: Hover = null;
  private pointer: { x: number; y: number } | null = null;
  private picker: PickerState | null = null;
  private locked = false;
  private issue: GeneIssue | null = null;
  private reduced = prefersReducedMotion();

  private anim: ShiftAnim | null = null;
  private hintRequest: EditRequest | null = null;
  private previewKey = '';
  private previewArmed = false;
  private baseDragCandidate: number | null = null;
  private baseDragActive = false;
  private baseDragStart = { x: 0, y: 0 };
  private dragBaseIndex: number | null = null;
  private dropIndicator: { kind: 'insert' | 'move'; index: number; base?: Base } | null = null;
  private externalDrag = false;
  private lastNow = 0;
  private disposed = false;

  // 拖拽滚动
  private dragging = false;
  private dragStartX = 0;
  private dragStartScroll = 0;
  private dragMoved = false;

  private readonly onKeyDown = (e: KeyboardEvent): void => this.handleKey(e);
  private readonly onDocPointerDown = (e: PointerEvent): void => {
    if (!this.picker) return;
    if (this.pickerEl.contains(e.target as Node)) return;
    this.closePicker();
  };

  constructor(host: HTMLElement, level: Level, gene: Gene, callbacks: RibbonCallbacks) {
    this.host = host;
    this.level = level;
    this.gene = gene;
    this.callbacks = callbacks;
    this.layout = buildLayout(gene, this.metrics);
    this.issue = gene.issue;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'ribbon-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', t('ribbon.aria'));
    this.canvas.tabIndex = 0;
    host.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;

    this.pickerEl = document.createElement('div');
    this.pickerEl.className = 'ribbon-picker';
    this.pickerEl.hidden = true;
    this.pickerEl.setAttribute('role', 'dialog');
    this.pickerEl.setAttribute('aria-label', t('ribbon.chooseBaseAria'));
    host.appendChild(this.pickerEl);

    this.tipEl = document.createElement('div');
    this.tipEl.className = 'ribbon-tip';
    this.tipEl.hidden = true;
    host.appendChild(this.tipEl);

    this.stampEl = document.createElement('div');
    this.stampEl.className = 'ribbon-stamp';
    this.stampEl.hidden = true;
    host.appendChild(this.stampEl);

    this.modeHintEl = document.createElement('div');
    this.modeHintEl.className = 'ribbon-mode-hint';
    host.appendChild(this.modeHintEl);

    this.keysEl = document.createElement('div');
    this.keysEl.className = 'ribbon-keys';
    host.appendChild(this.keysEl);
    this.renderKeysHint();

    this.canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e));
    this.canvas.addEventListener('pointerleave', () => this.handlePointerLeave());
    this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    this.canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    this.canvas.addEventListener('pointercancel', () => {
      this.dragging = false;
    });
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.syncModeUi();
    this.syncStamp();

    window.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('pointerdown', this.onDocPointerDown);
  }

  dispose(): void {
    this.disposed = true;
    this.ro.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('pointerdown', this.onDocPointerDown);
  }

  /* ------------------------------ 外部 API ------------------------------ */

  setLevel(level: Level, gene: Gene): void {
    this.level = level;
    this.gene = gene;
    this.metrics = this.computeMetrics();
    this.layout = buildLayout(gene, this.metrics);
    this.issue = gene.issue;
    this.anim = null;
    this.cursor = 0;
    this.scrollX = 0;
    this.clearHint();
    this.clearPreview();
    this.scrollTarget = 0;
    this.hover = null;
    this.closePicker();
    this.syncStamp();
    this.syncModeUi();
  }

  setMode(mode: EditOp): void {
    if (!this.level.ops.includes(mode)) {
      this.flashHint(t('ribbon.notAvailable', { op: t(`hud.${mode}`) }));
      return;
    }
    this.mode = mode;
    this.closePicker();
    this.cursor = this.clampCursor(this.cursor);
    this.syncModeUi();
    this.callbacks.onModeChange(mode);
    this.ensureCursorVisible();
    this.previewArmed = true;
    this.previewFromCursor();
  }

  getMode(): EditOp {
    return this.mode;
  }

  /** 禁用/启用编辑（RUN 期间、通关后）。 */
  setLocked(locked: boolean): void {
    this.locked = locked;
    if (locked) {
      this.closePicker();
      this.clearPreview();
    }
    this.canvas.classList.toggle('is-locked', locked);
    this.modeHintEl.classList.toggle('is-locked', locked);
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }

  /** 语言切换后刷新 Canvas / DOM 里的静态文案。 */
  refreshLanguage(): void {
    this.canvas.setAttribute('aria-label', t('ribbon.aria'));
    this.pickerEl.setAttribute('aria-label', t('ribbon.chooseBaseAria'));
    this.closePicker();
    this.tipEl.hidden = true;
    this.renderKeysHint();
    this.syncStamp();
    this.syncModeUi();
  }

  private renderKeysHint(): void {
    this.keysEl.innerHTML = '';
    const items: [string, string][] = [
      ['←→', t('ribbon.keys.move')],
      ['I', t('ribbon.keys.insert')],
      ['D', t('ribbon.keys.delete')],
      ['R', t('ribbon.keys.replace')],
      ['Ctrl+Z', t('ribbon.keys.undo')],
    ];
    for (const [key, label] of items) {
      const span = document.createElement('span');
      const b = document.createElement('b');
      b.textContent = key;
      span.append(b, document.createTextNode(` ${label}`));
      this.keysEl.appendChild(span);
    }
  }

  /** 同步基因（reset / 关卡切换用，不播动画）。 */
  resetGene(gene: Gene): void {
    this.gene = gene;
    this.metrics = this.computeMetrics();
    this.layout = buildLayout(gene, this.metrics);
    this.issue = gene.issue;
    this.anim = null;
    this.cursor = this.clampCursor(this.cursor);
    this.scrollTarget = clamp(this.scrollTarget, 0, this.maxScroll());
    this.clearHint();
    this.clearPreview();
    this.syncStamp();
  }

  /** 编辑落地后的移码动画。diff 直接来自 Session 事件。 */
  playEdit(diff: GeneDiff): void {
    const now = performance.now();
    const beforeMetrics = this.metrics;
    const beforeLayout = this.layout;
    this.gene = diff.after;
    this.metrics = this.computeMetrics();
    const afterLayout = buildLayout(diff.after, this.metrics);
    this.layout = afterLayout;
    this.issue = diff.after.issue;
    this.syncStamp();

    const seam = clamp(diff.seam, 0, diff.before.seq.length);
    const fromX = new Array<number>(afterLayout.cells.length);
    let newBaseIndex: number | null = null;

    for (const cell of afterLayout.cells) {
      let source: BaseCell | undefined;
      if (diff.shiftBy === 1) {
        if (cell.index < seam) source = beforeLayout.cells[cell.index];
        else if (cell.index === seam) {
          newBaseIndex = cell.index;
          source = beforeLayout.cells[seam];
        } else source = beforeLayout.cells[cell.index - 1];
      } else if (diff.shiftBy === -1) {
        if (cell.index < seam) source = beforeLayout.cells[cell.index];
        else source = beforeLayout.cells[cell.index + 1];
      } else {
        source = beforeLayout.cells[cell.index];
      }
      fromX[cell.index] = source ? source.x : cell.x;
    }

    if (newBaseIndex !== null) {
      fromX[newBaseIndex] = gapCenterX(beforeLayout, seam, beforeMetrics) - beforeMetrics.baseW / 2;
    }

    const deletedCell =
      diff.shiftBy === -1 ? beforeLayout.cells[seam] ?? null : null;

    const flips = diff.partChanges.filter((c) => c.kind !== 'kept');
    let silentFlip: ShiftAnim['silentFlip'] = null;
    if (diff.edit.op === 'replace' && diff.firstChange === -1) {
      const slot = afterLayout.slots.find((frame) => {
        const start = frame.slot.start;
        const end = start + frame.slot.bases.length;
        return diff.seam >= start && diff.seam < end;
      });
      const part = slot ? this.afterPartForSlot(slot.slot, diff.after) : null;
      if (part && slot) {
        silentFlip = { part, x: slot.x + slot.width / 2 };
      }
    }

    const flipCount = flips.length > 0 ? Math.max(...flips.map((c) => c.index)) - (diff.firstChange >= 0 ? diff.firstChange : 0) + 1 : 0;
    const flipTail = silentFlip ? TIMING_FLIP_TAIL : flips.length > 0 ? 240 + flipCount * 55 : 0;
    const totalDuration = this.reduced ? 0 : Math.max(420, 220 + flipTail);

    this.anim = {
      diff,
      start: now,
      duration: this.reduced ? 0 : 210,
      reduced: this.reduced,
      beforeLayout,
      afterLayout,
      fromX,
      newBaseIndex,
      deletedCell,
      scanX: gapCenterX(afterLayout, Math.min(seam, afterLayout.cells.length), this.metrics),
      scanColor: diff.shiftBy > 0 ? COLORS.accent : diff.shiftBy < 0 ? COLORS.bad : COLORS.warn,
      flips,
      silentFlip,
      totalDuration,
    };

    this.cursor = this.clampCursor(diff.seam);
    this.hover = null;
    this.closePicker();
    this.ensureCursorVisible();
    this.clearHint();
    this.clearPreview();
  }

  /** 只刷新基因（例如没有 diff 的 undo 兜底）。 */
  setGene(gene: Gene): void {
    this.gene = gene;
    this.metrics = this.computeMetrics();
    this.layout = buildLayout(gene, this.metrics);
    this.issue = gene.issue;
    this.syncStamp();
    this.cursor = this.clampCursor(this.cursor);
    this.clearHint();
    this.clearPreview();
  }

  setHoverPartHighlight(_index: number | null): void {
    // 舞台负责高亮；基因带保持纯读。
  }

  /** 提示：高亮一个具体编辑位置（不执行、不扣额度）。 */
  showHint(req: EditRequest): void {
    if (!this.level.ops.includes(req.op)) return;
    this.hintRequest = req;
    this.mode = req.op;
    this.cursor = this.clampCursor(req.index);
    this.previewArmed = true;
    this.closePicker();
    this.syncModeUi();
    this.callbacks.onModeChange(req.op);
    this.ensureCursorVisible();
    this.clearPreview();
  }

  clearHint(): void {
    this.hintRequest = null;
  }

  /** 画布上的起始密码子锚点（视口坐标，供贴画布引导使用）。 */
  getStartAnchor(): { x: number; y: number; w: number; h: number } {
    const rect = this.canvas.getBoundingClientRect();
    const frame = this.layout.slots.find((f) => f.slot.role === 'start');
    if (!frame) {
      return { x: rect.left + 12, y: rect.top + RIBBON.baseY, w: this.metrics.baseW * 3, h: RIBBON.baseH };
    }
    const box = this.displayedBox(frame, (c) => c.x);
    return {
      x: rect.left + box.x - this.scrollX,
      y: rect.top + RIBBON.baseY - 4,
      w: box.w,
      h: RIBBON.baseH + 12,
    };
  }

  /** 某个插入缝隙的锚点（视口坐标）。 */
  getGapAnchor(index: number): { x: number; y: number; w: number; h: number } {
    const rect = this.canvas.getBoundingClientRect();
    const gx = gapCenterX(this.layout, index, this.metrics);
    return {
      x: rect.left + gx - this.scrollX - this.metrics.baseW / 2,
      y: rect.top + RIBBON.baseY - 4,
      w: this.metrics.baseW,
      h: RIBBON.baseH + 12,
    };
  }

  setExternalDrag(active: boolean): void {
    this.externalDrag = active;
    if (active) this.clearPreview();
  }

  beginBaseDrag(index: number): void {
    this.dragBaseIndex = index;
    this.hover = null;
    this.tipEl.hidden = true;
    this.clearPreview();
  }

  endBaseDrag(): void {
    this.dragBaseIndex = null;
    this.dropIndicator = null;
  }

  setDropIndicator(indicator: { kind: 'insert' | 'move'; index: number; base?: Base } | null): void {
    this.dropIndicator = indicator;
  }

  getBaseAt(index: number): Base | null {
    return this.gene.bases[index] ?? null;
  }

  getRibbonRect(): DOMRect {
    return this.canvas.getBoundingClientRect();
  }

  /** 拖拽时找最近的缝隙（视口坐标）；不在基因带内返回 null。 */
  hitGapAt(clientX: number, clientY: number): number | null {
    const rect = this.canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return null;
    }
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    if (sy < 24 || sy > RIBBON.baseY + RIBBON.baseH + 62) return null;
    const contentX = sx + this.scrollX;
    let best: number | null = null;
    let bestD = 1e9;
    for (let i = 0; i <= this.gene.seq.length; i += 1) {
      const gx = gapCenterX(this.layout, i, this.metrics);
      const d = Math.abs(contentX - gx);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return bestD <= 34 ? best : null;
  }

  /** 指针下的碱基（与当前模式无关）。 */
  baseAtPoint(clientX: number, clientY: number): number | null {
    const rect = this.canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    if (sy < RIBBON.baseY - 4 || sy > RIBBON.baseY + RIBBON.baseH + 6) return null;
    const contentX = sx + this.scrollX;
    for (const cell of this.layout.cells) {
      if (contentX >= cell.x - 2 && contentX <= cell.x + this.metrics.baseW + 2) return cell.index;
    }
    return null;
  }

  private drawDropGhost(ctx: CanvasRenderingContext2D, now: number): void {
    const drop = this.dropIndicator;
    if (!drop) return;
    const cells = this.layout.cells;
    let x: number;
    if (drop.index < cells.length) {
      x = cells[drop.index].x;
    } else if (cells.length > 0) {
      x = cells[cells.length - 1].x + this.metrics.baseW + this.metrics.baseGap;
    } else {
      x = this.metrics.padX;
    }
    const y = RIBBON.baseY;
    const pulse = 0.55 + Math.sin(now / 220) * 0.18;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = drop.base ? BASE_COLORS[drop.base] : COLORS.accent;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    this.roundRect(ctx, x, y, this.metrics.baseW, RIBBON.baseH, 6);
    ctx.fillStyle = drop.base ? withAlphaSafe(BASE_COLORS[drop.base], 0.14) : 'rgba(95,227,200,0.1)';
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    if (drop.base) {
      ctx.fillStyle = BASE_COLORS[drop.base];
      ctx.font = `700 18px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(drop.base, x + this.metrics.baseW / 2, y + RIBBON.baseH / 2 + 1);
    }
    ctx.restore();
  }

  private commitPreview(req: RibbonPreviewRequest | null): void {
    const key = req ? `${req.op}:${req.index}` : '';
    if (key === this.previewKey) return;
    this.previewKey = key;
    this.callbacks.onPreview(req);
  }

  private clearPreview(resetArmed = true): void {
    if (resetArmed) this.previewArmed = false;
    this.commitPreview(null);
  }

  private previewFromHover(): void {
    if (this.externalDrag) {
      this.commitPreview(null);
      return;
    }
    if (this.locked || !this.hover) {
      this.commitPreview(null);
      return;
    }
    if (this.mode === 'insert' && this.hover.kind === 'gap') {
      this.previewArmed = true;
      this.commitPreview({ op: 'insert', index: this.hover.index });
      return;
    }
    if ((this.mode === 'delete' || this.mode === 'replace') && this.hover.kind === 'base') {
      this.previewArmed = true;
      this.commitPreview({ op: this.mode, index: this.hover.index });
      return;
    }
    this.commitPreview(null);
  }

  private previewFromCursor(): void {
    if (this.externalDrag) {
      this.commitPreview(null);
      return;
    }
    if (this.locked || !this.previewArmed) {
      this.commitPreview(null);
      return;
    }
    const n = this.gene.seq.length;
    if (this.mode === 'insert') {
      this.commitPreview({ op: 'insert', index: this.clampCursor(this.cursor) });
    } else if (n > 0) {
      this.commitPreview({ op: this.mode, index: this.clampCursor(this.cursor) });
    } else {
      this.commitPreview(null);
    }
  }

  /** 金色脉冲圈 + 指向箭头。 */
  private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
    const req = this.hintRequest;
    if (!req) return;
    const n = this.gene.seq.length;
    if (req.index < 0 || (req.op === 'insert' ? req.index > n : req.index >= n)) return;
    let x: number;
    let w: number;
    if (req.op === 'insert') {
      x = gapCenterX(this.layout, req.index, this.metrics) - this.metrics.gapW / 2;
      w = Math.max(this.metrics.baseW, this.metrics.gapW + 10);
    } else {
      const cell = this.layout.cells[req.index];
      if (!cell) return;
      x = cell.x;
      w = this.metrics.baseW;
    }
    const cy = RIBBON.baseY + RIBBON.baseH / 2;
    const pulse = 0.62 + Math.sin(now / 280) * 0.26;
    const ringW = w + 12 + pulse * 4;
    const ringH = RIBBON.baseH + 12 + pulse * 4;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = COLORS.amber;
    ctx.lineWidth = 2;
    ctx.shadowColor = COLORS.amber;
    ctx.shadowBlur = 13;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, cy, ringW / 2, ringH / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 指向箭头（限制在画布顶部以内）
    const ax = x + w / 2;
    const badgeY = 12;
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = COLORS.amber;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(ax, badgeY + 11);
    ctx.lineTo(ax, RIBBON.baseY - 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ax, RIBBON.baseY - 6);
    ctx.lineTo(ax - 5, RIBBON.baseY - 15);
    ctx.lineTo(ax + 5, RIBBON.baseY - 15);
    ctx.closePath();
    ctx.fillStyle = COLORS.amber;
    ctx.fill();

    // 箭头顶部的碱基/操作徽章
    const badge = req.op === 'delete' ? '−' : req.base ?? '±';
    ctx.beginPath();
    ctx.arc(ax, badgeY, 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8, 15, 21, 0.96)';
    ctx.fill();
    ctx.strokeStyle = COLORS.amber;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = req.base ? BASE_COLORS[req.base] : COLORS.amber;
    ctx.font = `700 13px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badge, ax, badgeY + 1);
    ctx.restore();
  }

  /* ------------------------------ 渲染 ------------------------------ */

  render(now: number): void {
    if (this.disposed) return;
    this.lastNow = now;
    const ctx = this.ctx;
    const w = this.viewW;
    const h = this.viewH;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // 平滑滚动
    if (Math.abs(this.scrollTarget - this.scrollX) > 0.4) {
      this.scrollX += (this.scrollTarget - this.scrollX) * 0.22;
    } else {
      this.scrollX = this.scrollTarget;
    }

    this.drawBackdrop(ctx, w, h);

    const anim = this.anim;
    const shiftT = anim ? progress(now, anim.start, anim.duration) : 1;
    const eased = easeInOutCubic(shiftT);
    const frameLayout = anim ? anim.afterLayout : this.layout;

    ctx.save();
    ctx.translate(-this.scrollX, 0);

    const drop = this.dropIndicator;
    const xOf = (cell: BaseCell): number => {
      let x = cell.x;
      if (anim) x = (anim.fromX[cell.index] ?? cell.x) + (cell.x - (anim.fromX[cell.index] ?? cell.x)) * eased;
      if (drop && cell.index >= drop.index) x += this.metrics.baseW + this.metrics.baseGap;
      return x;
    };

    this.drawRuler(ctx, frameLayout, xOf, anim, now);
    this.drawBoxes(ctx, frameLayout, xOf, anim, now);
    this.drawCells(ctx, frameLayout, xOf, anim, now);
    if (anim && anim.deletedCell) this.drawDeletedCell(ctx, anim, now);
    this.drawConnectors(ctx, frameLayout, xOf, anim, now);
    this.drawParts(ctx, frameLayout, xOf, anim, now);
    this.drawCursor(ctx, frameLayout, xOf, now);
    this.drawHint(ctx, now);
    this.drawDropGhost(ctx, now);
    if (anim) this.drawScan(ctx, anim, now);

    ctx.restore();

    this.drawScrollbar(ctx, w, h);
    this.drawOverflowHints(ctx, w, h);

    if (anim && now >= anim.start + anim.totalDuration) {
      this.anim = null;
    }
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // 极淡的实验室网格
    ctx.save();
    ctx.strokeStyle = 'rgba(80, 140, 170, 0.045)';
    ctx.lineWidth = 1;
    const step = 26;
    for (let x = -this.scrollX % step; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, RIBBON.baseY + RIBBON.baseH + 0.5);
    ctx.lineTo(w, RIBBON.baseY + RIBBON.baseH + 0.5);
    ctx.strokeStyle = 'rgba(95, 227, 200, 0.06)';
    ctx.stroke();
    ctx.restore();
  }

  private displayedBox(frame: SlotFrame, xOf: (c: BaseCell) => number): { x: number; w: number } {
    if (frame.cells.length === 0) return { x: frame.x, w: frame.width };
    const first = xOf(frame.cells[0]);
    const last = xOf(frame.cells[frame.cells.length - 1]);
    return { x: Math.min(first, last), w: Math.abs(last - first) + this.metrics.baseW };
  }

  private drawRuler(
    ctx: CanvasRenderingContext2D,
    layout: Layout,
    xOf: (c: BaseCell) => number,
    anim: ShiftAnim | null,
    now: number,
  ): void {
    ctx.save();
    ctx.font = `600 9px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const frame of layout.slots) {
      const role = frame.slot.role;
      if (role === 'junk' || role === 'trailer' || role === 'partial') continue;
      const box = this.displayedBox(frame, xOf);
      const cx = box.x + box.w / 2;
      if (cx < this.scrollX - 40 || cx > this.scrollX + this.viewW + 40) continue;
      const pulse = anim ? 1 : 0.72 + Math.sin(now / 900 + frame.slot.index) * 0.08;
      ctx.fillStyle = role === 'stop' ? COLORS.bad : role === 'start' ? COLORS.accent : COLORS.faint;
      ctx.globalAlpha = pulse;
      ctx.fillText(String(frame.slot.index + 1), cx, RIBBON.rulerY);
      // 刻度线
      ctx.beginPath();
      ctx.moveTo(cx, RIBBON.rulerY + 7);
      ctx.lineTo(cx, RIBBON.rulerY + 12);
      ctx.strokeStyle = ctx.fillStyle as string;
      ctx.globalAlpha = 0.35;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private drawBoxes(
    ctx: CanvasRenderingContext2D,
    layout: Layout,
    xOf: (c: BaseCell) => number,
    anim: ShiftAnim | null,
    now: number,
  ): void {
    ctx.save();
    for (const frame of layout.slots) {
      const role = frame.slot.role;
      const box = this.displayedBox(frame, xOf);
      const top = RIBBON.boxY - 4;
      const height = RIBBON.baseH + 10;
      if (box.x + box.w < this.scrollX - 60 || box.x > this.scrollX + this.viewW + 60) continue;

      if (role === 'junk' || role === 'trailer') {
        // 不画分组框，只画一条极淡的底边与 UNTRANSLATED
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = 'rgba(96, 120, 138, 0.22)';
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(box.x, RIBBON.baseY + RIBBON.baseH + 3.5);
        ctx.lineTo(box.x + box.w, RIBBON.baseY + RIBBON.baseH + 3.5);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        const slotIdx = layout.slots.indexOf(frame);
        const prevRole = slotIdx > 0 ? layout.slots[slotIdx - 1].slot.role : null;
        if (prevRole !== role) {
          this.drawTinyLabel(ctx, t('ribbon.untranslated'), box.x + 1, RIBBON.boxY - 8, COLORS.faint);
        }
        continue;
      }

      let stroke = 'rgba(120, 158, 184, 0.35)';
      let fill = 'rgba(130, 175, 205, 0.045)';
      if (role === 'start') {
        stroke = 'rgba(95, 227, 200, 0.9)';
        fill = 'rgba(95, 227, 200, 0.07)';
      } else if (role === 'stop') {
        stroke = 'rgba(255, 107, 122, 0.85)';
        fill = 'rgba(255, 107, 122, 0.07)';
      } else if (role === 'partial') {
        stroke = 'rgba(255, 200, 87, 0.55)';
      }

      const flash = anim && !anim.reduced
        ? Math.max(0, Math.sin(progress(now, anim.start + anim.totalDuration - 150, 150) * Math.PI))
        : 0;

      ctx.beginPath();
      this.roundRect(ctx, box.x - 4, top, box.w + 8, height, 8);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = role === 'start' || role === 'stop' ? 1.6 : 1;
      if (role === 'partial') ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      if (flash > 0) {
        ctx.globalAlpha = flash * 0.18;
        ctx.fillStyle = COLORS.accent;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      const cx = box.x + box.w / 2;
      if (role === 'start') {
        this.drawBadge(ctx, displayUpper(t('common.start')), cx, top - 8, COLORS.accent);
      } else if (role === 'stop') {
        this.drawBadge(ctx, displayUpper(t('common.stop')), cx, top - 8, COLORS.bad);
      } else if (role === 'partial') {
        this.drawTinyLabel(ctx, t('ribbon.dangling'), box.x, RIBBON.baseY + RIBBON.baseH + 10, COLORS.bad);
      }
    }
    ctx.restore();
  }

  private drawBadge(
    ctx: CanvasRenderingContext2D,
    text: string,
    cx: number,
    y: number,
    color: string,
  ): void {
    ctx.save();
    ctx.font = `700 8px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 8;
    ctx.beginPath();
    this.roundRect(ctx, cx - w / 2, y - 5, w, 10, 3);
    ctx.fillStyle = 'rgba(8, 15, 22, 0.92)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(text, cx, y + 0.5);
    ctx.restore();
  }

  private drawTinyLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string,
  ): void {
    ctx.save();
    ctx.font = `600 8px ${FONT_MONO}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.globalAlpha *= 0.85;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  private drawCells(
    ctx: CanvasRenderingContext2D,
    layout: Layout,
    xOf: (c: BaseCell) => number,
    anim: ShiftAnim | null,
    now: number,
  ): void {
    const hover = this.hover;
    for (const cell of layout.cells) {
      const x = xOf(cell);
      if (x + this.metrics.baseW < this.scrollX - 40 || x > this.scrollX + this.viewW + 40) continue;
      if (this.dragBaseIndex === cell.index) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = COLORS.amber;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        this.roundRect(ctx, x + 1, RIBBON.baseY + 1, this.metrics.baseW - 2, RIBBON.baseH - 2, 5);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      const isNew = anim?.newBaseIndex === cell.index;
      const appearT = isNew && anim ? progress(now, anim.start, 130) : 1;
      const scale = isNew ? 0.4 + 0.6 * easeOutCubic(appearT) : 1;
      const y = RIBBON.baseY;
      const hovered = hover?.kind === 'base' && hover.index === cell.index;
      const dim = cell.role === 'junk' || cell.role === 'trailer' || cell.role === 'partial';

      ctx.save();
      ctx.globalAlpha = dim ? 0.4 : 1;
      const cx = x + this.metrics.baseW / 2;
      const cy = y + RIBBON.baseH / 2;
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      if (hovered && this.mode === 'delete') {
        ctx.translate(0, -2);
      }

      const radius = 6;
      const bx = -this.metrics.baseW / 2;
      const by = -RIBBON.baseH / 2;
      ctx.beginPath();
      this.roundRect(ctx, bx, by, this.metrics.baseW, RIBBON.baseH, radius);
      let fill: string = COLORS.panel2;
      if (hovered && !this.locked) {
        fill = this.mode === 'delete' ? 'rgba(255, 107, 122, 0.18)' : 'rgba(242, 178, 75, 0.16)';
      }
      if (isNew && anim) fill = COLORS.panel3;
      ctx.fillStyle = fill;
      ctx.fill();

      // 碱基 → 家族色底部条
      const color = BASE_COLORS[cell.base];
      ctx.save();
      ctx.beginPath();
      this.roundRect(ctx, bx, by, this.metrics.baseW, RIBBON.baseH, radius);
      ctx.clip();
      ctx.fillStyle = color;
      ctx.globalAlpha *= dim ? 0.45 : 0.9;
      ctx.fillRect(bx, by + RIBBON.baseH - 2, this.metrics.baseW, 2);
      ctx.restore();

      ctx.strokeStyle = hovered
        ? this.mode === 'delete'
          ? COLORS.bad
          : COLORS.warn
        : dim
          ? 'rgba(89, 112, 130, 0.35)'
          : 'rgba(72, 103, 126, 0.55)';
      ctx.lineWidth = hovered ? 1.6 : 1;
      if (cell.role === 'partial') ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = dim ? COLORS.faint : color;
      ctx.font = `700 18px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cell.base, 0, 1);
      ctx.restore();
    }

    // 新碱基落地冲击环
    if (anim && anim.newBaseIndex !== null) {
      const cell = layout.cells[anim.newBaseIndex];
      if (cell) {
        const rt = progress(now, anim.start, 300);
        if (rt > 0 && rt < 1) {
          const cx = xOf(cell) + this.metrics.baseW / 2;
          const cy = RIBBON.baseY + RIBBON.baseH / 2;
          ctx.save();
          ctx.globalAlpha = (1 - rt) * 0.8;
          ctx.strokeStyle = COLORS.amber;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(cx, cy, this.metrics.baseW * 0.5 + rt * 26, RIBBON.baseH * 0.5 + rt * 26, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // 插入幽灵
    if (hover?.kind === 'gap' && this.mode === 'insert' && !this.locked) {
      const gx = gapCenterX(layout, hover.index, this.metrics) - this.scrollX;
      const pulse = 0.55 + Math.sin(now / 320) * 0.18;
      ctx.save();
      ctx.translate(gx, RIBBON.baseY + RIBBON.baseH / 2);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = COLORS.accent;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      this.roundRect(ctx, -this.metrics.baseW / 2, -RIBBON.baseH / 2, this.metrics.baseW, RIBBON.baseH, 6);
      ctx.fillStyle = 'rgba(95, 227, 200, 0.07)';
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.accent;
      ctx.font = `700 16px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+', 0, 1);
      ctx.restore();
    }
  }

  private drawDeletedCell(ctx: CanvasRenderingContext2D, anim: ShiftAnim, now: number): void {
    const cell = anim.deletedCell;
    if (!cell) return;
    const t = progress(now, anim.start, 160);
    if (t >= 1) return;
    const x = cell.x + t * 30;
    const y = RIBBON.baseY - t * 96;
    const scale = 1 - t * 0.8;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.translate(x + this.metrics.baseW / 2, y + RIBBON.baseH / 2);
    ctx.scale(scale, scale);
    ctx.beginPath();
    this.roundRect(ctx, -this.metrics.baseW / 2, -RIBBON.baseH / 2, this.metrics.baseW, RIBBON.baseH, 6);
    ctx.fillStyle = 'rgba(255, 107, 122, 0.22)';
    ctx.fill();
    ctx.strokeStyle = COLORS.bad;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = COLORS.bad;
    ctx.font = `700 18px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cell.base, 0, 1);
    ctx.restore();
  }

  private drawConnectors(
    ctx: CanvasRenderingContext2D,
    layout: Layout,
    xOf: (c: BaseCell) => number,
    anim: ShiftAnim | null,
    now: number,
  ): void {
    ctx.save();
    const shiftAlpha = anim ? 1 - progress(now, anim.start + 120, 160) : 1;
    for (const frame of layout.slots) {
      const role = frame.slot.role;
      if (role === 'junk' || role === 'trailer' || role === 'partial' || role === 'stop') continue;
      const box = this.displayedBox(frame, xOf);
      const cx = box.x + box.w / 2;
      if (cx < this.scrollX - 60 || cx > this.scrollX + this.viewW + 60) continue;
      ctx.globalAlpha = 0.42 * Math.max(0.15, shiftAlpha);
      ctx.strokeStyle = COLORS.dim;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, RIBBON.baseY + RIBBON.baseH + 1);
      ctx.lineTo(cx, RIBBON.iconY - 20);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, RIBBON.iconY - 20, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.dim;
      ctx.fill();
    }
    ctx.restore();
  }

  private afterPartForSlot(slot: CodonSlot, gene: Gene): Part | null {
    if (slot.partId === null) return null;
    return gene.parts.find((p) => p.start === slot.start) ?? null;
  }

  private beforePartForSlot(slot: CodonSlot, gene: Gene): Part | null {
    if (slot.partId === null) return null;
    return gene.parts.find((p) => p.start === slot.start) ?? null;
  }

  private drawParts(
    ctx: CanvasRenderingContext2D,
    layout: Layout,
    xOf: (c: BaseCell) => number,
    anim: ShiftAnim | null,
    now: number,
  ): void {
    const changed = new Set<number>();
    if (anim) for (const c of anim.flips) changed.add(c.index);

    for (const frame of layout.slots) {
      const role = frame.slot.role;
      const box = this.displayedBox(frame, xOf);
      const cx = box.x + box.w / 2;
      if (cx < this.scrollX - 70 || cx > this.scrollX + this.viewW + 70) continue;

      if (role === 'stop') {
        this.drawStopIcon(ctx, cx, RIBBON.iconY);
        ctx.save();
        ctx.fillStyle = COLORS.bad;
        ctx.font = `700 10px ${FONT_MONO}`;
        ctx.textAlign = 'center';
        ctx.fillText(displayUpper(t('common.stop')), cx, RIBBON.labelY);
        ctx.restore();
        continue;
      }
      if (role === 'junk' || role === 'trailer' || role === 'partial') continue;

      const part = this.afterPartForSlot(frame.slot, this.gene);
      if (!part) continue;
      const flip = anim?.flips.find((c) => c.after?.index === part.index || c.before?.index === part.index);
      const p = flip ? progress(now, anim!.start + 220 + (flip.index - Math.max(0, anim!.diff.firstChange)) * 55, 160) : 1;
      const silent = anim?.silentFlip?.part.index === part.index ? progress(now, anim!.start + 220, 220) : 1;
      const useOld = (flip ? p < 0.5 : false) || (silent < 0.5 && silent < 1);
      const shown = useOld ? flip?.before ?? part : part;
      const sy = flip && p > 0 ? Math.abs(Math.cos(p * Math.PI)) : silent < 1 && silent > 0 ? Math.abs(Math.cos(silent * Math.PI)) : 1;

      ctx.save();
      ctx.translate(cx, RIBBON.iconY);
      ctx.scale(1, Math.max(0.02, sy));
      const color = FAMILY_COLORS[shown.family];
      // 图标底光
      ctx.save();
      ctx.globalAlpha = 0.18;
      const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
      halo.addColorStop(0, color);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawPart(ctx, shown.id, 0, 0, RIBBON.iconSize, shown.family, {
        phase: now / 900 + shown.index,
        alpha: 1,
      });
      ctx.restore();

      // 标签
      const labelAlpha = flip ? (p < 0.5 ? 1 - p * 2 : (p - 0.5) * 2) : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0.05, Math.min(1, labelAlpha));
      ctx.fillStyle = COLORS.dim;
      ctx.font = `500 10px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = displayUpper(partLabel(shown.id));
      const maxW = Math.max(30, box.w - 4);
      let size = 10;
      ctx.font = `500 ${size}px ${FONT_MONO}`;
      while (size > 7 && ctx.measureText(label).width > maxW) {
        size -= 0.5;
        ctx.font = `500 ${size}px ${FONT_MONO}`;
      }
      ctx.fillText(label, cx, RIBBON.labelY, maxW);
      ctx.restore();
    }

    // 尾部消失的零件：在旧位置淡出（partChanges.after === null）
    if (anim) {
      for (const change of anim.flips) {
        if (change.after || !change.before) continue;
        const oldSlot = anim.beforeLayout.slots.find((f) => {
          const start = f.slot.start;
          return change.before!.start >= start && change.before!.start < start + f.slot.bases.length;
        });
        if (!oldSlot) continue;
        const oldBox = this.displayedBox(oldSlot, (c) => c.x);
        const ghostX = oldBox.x + oldBox.w / 2;
        if (ghostX < this.scrollX - 70 || ghostX > this.scrollX + this.viewW + 70) continue;
        const gp = progress(
          now,
          anim.start + 220 + Math.max(0, change.index - Math.max(0, anim.diff.firstChange)) * 55,
          160,
        );
        if (gp <= 0 || gp >= 1) continue;
        const fade = 1 - gp;
        ctx.save();
        ctx.globalAlpha = fade * 0.8;
        ctx.translate(ghostX, RIBBON.iconY);
        ctx.scale(1, Math.max(0.02, 1 - gp));
        drawPart(ctx, change.before.id, 0, 0, RIBBON.iconSize, change.before.family, {
          phase: now / 900 + change.index,
          alpha: fade,
        });
        ctx.restore();
      }
    }
  }

  private drawStopIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 107, 122, 0.09)';
    ctx.fill();
    ctx.strokeStyle = withAlphaSafe(COLORS.bad, 0.85);
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, -5);
    ctx.lineTo(5, 5);
    ctx.moveTo(5, -5);
    ctx.lineTo(-5, 5);
    ctx.strokeStyle = COLORS.bad;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
  }

  private drawCursor(
    ctx: CanvasRenderingContext2D,
    layout: Layout,
    xOf: (c: BaseCell) => number,
    now: number,
  ): void {
    if (this.locked) return;
    const idx = clamp(this.cursor, 0, this.gene.seq.length);
    let gx: number;
    // 光标跟随碱基当前位置（动画中）
    if (idx < layout.cells.length) {
      gx = xOf(layout.cells[idx]) - this.metrics.gapW / 2 - 3;
    } else if (layout.cells.length > 0) {
      gx = xOf(layout.cells[layout.cells.length - 1]) + this.metrics.baseW + 3;
    } else {
      gx = this.metrics.padX;
    }
    if (gx < this.scrollX - 30 || gx > this.scrollX + this.viewW + 30) return;
    const pulse = 0.65 + Math.sin(now / 420) * 0.25;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.shadowColor = COLORS.accent;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(gx, RIBBON.baseY - 8);
    ctx.lineTo(gx, RIBBON.baseY + RIBBON.baseH + 8);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.moveTo(gx, RIBBON.baseY - 8);
    ctx.lineTo(gx - 3.5, RIBBON.baseY - 13);
    ctx.lineTo(gx + 3.5, RIBBON.baseY - 13);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawScan(ctx: CanvasRenderingContext2D, anim: ShiftAnim, now: number): void {
    if (anim.reduced) return;
    const p = progress(now, anim.start + 100, 220);
    if (p <= 0 || p >= 1) return;
    const x = anim.scanX;
    const top = RIBBON.baseY - 12;
    const bottom = RIBBON.baseY + RIBBON.baseH + 14;
    const headY = top + (bottom - top) * easeOutCubic(p);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createLinearGradient(x, top, x, bottom);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, withAlphaSafe(anim.scanColor, 0.18));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - 2, top, 4, bottom - top);
    ctx.strokeStyle = anim.scanColor;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = anim.scanColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(x - 8, headY);
    ctx.lineTo(x + 8, headY);
    ctx.stroke();
    ctx.restore();
  }

  private drawOverflowHints(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const max = this.maxScroll();
    if (max <= 0) return;
    const atStart = this.scrollX < 8;
    const atEnd = this.scrollX > max - 16;
    const edge = 34;
    ctx.save();
    if (!atEnd) {
      const g = ctx.createLinearGradient(w - edge, 0, w, 0);
      g.addColorStop(0, 'rgba(8, 16, 23, 0)');
      g.addColorStop(1, 'rgba(8, 16, 23, 0.92)');
      ctx.fillStyle = g;
      ctx.fillRect(w - edge, 26, edge, RIBBON.baseH + 48);
      ctx.fillStyle = COLORS.accent;
      ctx.globalAlpha = 0.55 + Math.sin(this.lastNow / 500) * 0.18;
      ctx.font = `700 12px ${FONT_MONO}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('›', w - 8, RIBBON.baseY + RIBBON.baseH / 2);
      ctx.font = `600 6.5px ${FONT_MONO}`;
      ctx.fillText(t('ribbon.scroll'), w - 9, RIBBON.baseY + RIBBON.baseH / 2 + 13);
    }
    if (!atStart) {
      const g = ctx.createLinearGradient(0, 0, edge, 0);
      g.addColorStop(0, 'rgba(8, 16, 23, 0.92)');
      g.addColorStop(1, 'rgba(8, 16, 23, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 26, edge, RIBBON.baseH + 48);
      ctx.fillStyle = COLORS.dim;
      ctx.globalAlpha = 0.7;
      ctx.font = `700 12px ${FONT_MONO}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('‹', 8, RIBBON.baseY + RIBBON.baseH / 2);
    }
    ctx.restore();
  }

  private drawScrollbar(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const max = this.maxScroll();
    if (max <= 0) return;
    const trackW = Math.min(220, w * 0.4);
    const tx = w - trackW - 14;
    const ty = h - 34;
    const frac = this.viewW / this.layout.contentWidth;
    const thumbW = Math.max(28, trackW * frac);
    const thumbX = tx + (trackW - thumbW) * (this.scrollX / max);
    ctx.save();
    ctx.fillStyle = 'rgba(100, 135, 160, 0.14)';
    this.roundRect(ctx, tx, ty, trackW, 2.5, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(95, 227, 200, 0.4)';
    this.roundRect(ctx, thumbX, ty, thumbW, 2.5, 2);
    ctx.fill();
    ctx.restore();
  }

  /* ------------------------------ 交互 ------------------------------ */

  private resize(): void {
    const rect = this.host.getBoundingClientRect();
    if (rect.width === 0) return;
    this.viewW = rect.width;
    this.viewH = rect.height || RIBBON.height;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(this.viewW * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.viewH * this.dpr));
    this.canvas.style.width = `${this.viewW}px`;
    this.canvas.style.height = `${this.viewH}px`;
    this.metrics = this.computeMetrics();
    this.layout = buildLayout(this.gene, this.metrics);
    this.anim = null;
    this.clearPreview();
    this.scrollTarget = clamp(this.scrollTarget, 0, this.maxScroll());
    this.scrollX = clamp(this.scrollX, 0, this.maxScroll());
  }

  /** 按当前视口决定是否等比压缩槽位；有下限，太小就交给横向滚动。 */
  private computeMetrics(): LayoutMetrics {
    const full = buildLayout(this.gene, FULL_METRICS);
    const fitTarget = Math.max(240, this.viewW - 8);
    if (full.contentWidth <= fitTarget) return { ...FULL_METRICS };
    const scale = clamp(fitTarget / full.contentWidth, MIN_METRIC_SCALE, 1);
    const scaled: LayoutMetrics = {
      baseW: Math.max(21, FULL_METRICS.baseW * scale),
      baseGap: Math.max(2, FULL_METRICS.baseGap * scale),
      codonGap: Math.max(8, FULL_METRICS.codonGap * scale),
      padX: Math.max(12, FULL_METRICS.padX * scale),
      gapW: Math.max(9, FULL_METRICS.gapW * scale),
      gapHit: Math.max(18, FULL_METRICS.gapHit * scale),
    };
    const scaledLayout = buildLayout(this.gene, scaled);
    // 压缩后能放进视口（留一点取整余量）就压缩；仍然放不下说明必须横向滚动，
    // 这时保留 26px 大格子，手机上更好点。
    if (scaledLayout.contentWidth <= Math.max(fitTarget + 8, this.viewW - 2)) return scaled;
    return { ...FULL_METRICS };
  }

  private maxScroll(): number {
    const over = this.layout.contentWidth - this.viewW;
    // 只差一点内边距时不弹「SCROLL」，避免末组看起来被裁。
    return over > 12 ? over : 0;
  }

  private clampCursor(index: number): number {
    const n = this.gene.seq.length;
    const max = this.mode === 'insert' ? n : Math.max(0, n - 1);
    return clamp(index, 0, max);
  }

  private ensureCursorVisible(): void {
    const gapX = gapCenterX(this.layout, this.cursor, this.metrics);
    const margin = 46;
    // 光标右侧可能紧跟着刚插入的碱基，一起滚进视口。
    const rightExtent = this.cursor < this.layout.cells.length ? this.metrics.baseW + 20 : 0;
    if (gapX - this.scrollTarget < margin) {
      this.scrollTarget = Math.max(0, gapX - margin);
    } else if (gapX + rightExtent - this.scrollTarget > this.viewW - margin) {
      this.scrollTarget = Math.min(this.maxScroll(), gapX + rightExtent - this.viewW + margin);
    }
  }

  private localPoint(e: PointerEvent | MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private handlePointerMove(e: PointerEvent): void {
    const pt = this.localPoint(e);
    this.pointer = pt;
    if (this.baseDragCandidate !== null) {
      if (!this.baseDragActive) {
        const dx = e.clientX - this.baseDragStart.x;
        const dy = e.clientY - this.baseDragStart.y;
        if (Math.hypot(dx, dy) >= 6) {
          this.baseDragActive = true;
          this.dragging = false;
          this.beginBaseDrag(this.baseDragCandidate);
          const base = this.getBaseAt(this.baseDragCandidate);
          if (base) this.callbacks.onBaseDragStart(this.baseDragCandidate, base, e.clientX, e.clientY);
        }
      }
      return;
    }
    if (this.dragging) {
      const dx = e.clientX - this.dragStartX;
      if (Math.abs(dx) > 4) this.dragMoved = true;
      this.scrollX = clamp(this.dragStartScroll - dx, 0, this.maxScroll());
      this.scrollTarget = this.scrollX;
      this.canvas.style.cursor = 'grabbing';
      return;
    }
    this.updateHover(pt.x, pt.y);
    this.updateTooltip(pt.x, pt.y);
  }

  private handlePointerLeave(): void {
    this.pointer = null;
    if (this.baseDragCandidate === null) this.hover = null;
    this.tipEl.hidden = true;
    this.callbacks.onHoverPart(null);
    if (!this.baseDragActive) this.clearPreview();
  }

  private handlePointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const pt = this.localPoint(e);
    this.updateHover(pt.x, pt.y);
    const baseIndex = this.locked ? null : this.baseAtPoint(e.clientX, e.clientY);
    if (baseIndex !== null) {
      this.baseDragCandidate = baseIndex;
      this.baseDragActive = false;
      this.baseDragStart = { x: e.clientX, y: e.clientY };
      this.dragging = false;
    } else {
      this.dragging = true;
      this.dragMoved = false;
      this.dragStartX = e.clientX;
      this.dragStartScroll = this.scrollX;
    }
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.focus({ preventScroll: true });
  }

  private handlePointerUp(e: PointerEvent): void {
    if (this.baseDragCandidate !== null) {
      const active = this.baseDragActive;
      this.baseDragCandidate = null;
      this.baseDragActive = false;
      this.dragging = false;
      this.canvas.style.cursor = '';
      if (active) return; // App 的 window pointerup 负责落点
    }
    const wasDragging = this.dragging;
    this.dragging = false;
    this.canvas.style.cursor = '';
    if (wasDragging && this.dragMoved) return;
    const pt = this.localPoint(e);
    this.updateHover(pt.x, pt.y);
    if (this.hover) this.activateHover(this.hover, pt.x, pt.y);
  }

  private handleWheel(e: WheelEvent): void {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      this.scrollTarget = clamp(this.scrollTarget + e.deltaY, 0, this.maxScroll());
      e.preventDefault();
    } else {
      this.scrollTarget = clamp(this.scrollTarget + e.deltaX, 0, this.maxScroll());
      e.preventDefault();
    }
    this.scrollX = this.scrollTarget;
  }

  private updateHover(sx: number, sy: number): void {
    const contentX = sx + this.scrollX;
    const inRow = sy >= RIBBON.baseY - 6 && sy <= RIBBON.baseY + RIBBON.baseH + 6;

    if (inRow) {
      // 先命中碱基
      for (const cell of this.layout.cells) {
        if (contentX >= cell.x - 2 && contentX <= cell.x + this.metrics.baseW + 2) {
          if (this.mode === 'insert') {
            // 插入模式里，点碱基靠近哪一侧的缝隙就吸附哪边
            const mid = cell.x + this.metrics.baseW / 2;
            const idx = contentX < mid ? cell.index : cell.index + 1;
            this.hover = { kind: 'gap', index: idx };
            this.canvas.style.cursor = 'copy';
            this.previewFromHover();
          } else {
            this.hover = { kind: 'base', index: cell.index };
            this.canvas.style.cursor = this.locked ? 'not-allowed' : 'pointer';
            this.previewFromHover();
          }
          return;
        }
      }
      // 再命中缝隙（含首尾）
      const gap = this.findGap(contentX);
      if (gap !== null) {
        this.hover = { kind: 'gap', index: gap };
        this.canvas.style.cursor = 'copy';
        this.previewFromHover();
        return;
      }
    }

    // 分组框 / 零件图标 → tooltip
    const slotIdx = this.findSlot(sx, sy);
    if (slotIdx !== null) {
      this.hover = { kind: 'slot', slotIndex: slotIdx };
      this.canvas.style.cursor = 'help';
      this.previewFromHover();
      const part = this.afterPartForSlot(this.layout.slots[slotIdx].slot, this.gene);
      this.callbacks.onHoverPart(part ? part.index : null);
    } else {
      this.hover = null;
      this.callbacks.onHoverPart(null);
      this.canvas.style.cursor = '';
      this.previewFromHover();
    }
  }

  private findGap(contentX: number): number | null {
    for (let i = 0; i <= this.gene.seq.length; i += 1) {
      const gx = gapCenterX(this.layout, i, this.metrics);
      if (Math.abs(contentX - gx) <= this.metrics.gapHit / 2) return i;
    }
    return null;
  }

  private findSlot(sx: number, sy: number): number | null {
    const contentX = sx + this.scrollX;
    for (let i = 0; i < this.layout.slots.length; i += 1) {
      const frame = this.layout.slots[i];
      const box = this.displayedBox(frame, (c) => c.x);
      const top = RIBBON.boxY - 4;
      const bottom = RIBBON.boxY + 112;
      if (
        contentX >= box.x - 8 &&
        contentX <= box.x + box.w + 8 &&
        sy >= top &&
        sy <= bottom
      ) {
        return i;
      }
    }
    return null;
  }

  private activateHover(hover: Hover, sx: number, sy: number): void {
    void sx;
    void sy;
    if (!hover) return;
    if (this.locked) {
      this.flashHint(t('ribbon.live'));
      return;
    }
    if (this.mode === 'insert') {
      if (hover.kind === 'gap') {
        this.cursor = hover.index;
        const coarse = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          && window.matchMedia('(pointer: coarse)').matches;
        if (coarse || this.viewW < 720) this.callbacks.onGapTap(hover.index);
        else this.openPicker('insert', hover.index);
      } else if (hover.kind === 'base') {
        this.cursor = hover.index;
        this.ensureCursorVisible();
      }
      return;
    }
    if (hover.kind === 'base') {
      const cell = this.layout.cells[hover.index];
      if (!cell) return;
      this.cursor = hover.index;
      if (this.mode === 'delete') {
        this.callbacks.onEdit({ op: 'delete', index: cell.index });
      } else {
        this.openPicker('replace', cell.index);
      }
      return;
    }
    if (hover.kind === 'gap') {
      this.cursor = hover.index;
      this.ensureCursorVisible();
    }
  }

  private openPicker(op: 'insert' | 'replace', index: number): void {
    if (this.locked) return;
    if (!this.level.ops.includes(op)) {
      this.flashHint(t('ribbon.notAvailable', { op: t(`hud.${op}`) }));
      return;
    }
    this.picker = { op, index };
    this.pickerEl.hidden = false;
    this.pickerEl.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'picker-title';
    title.textContent = op === 'insert' ? t('ribbon.insertAt', { n: index }) : t('ribbon.replaceAt', { n: index + 1 });
    this.pickerEl.appendChild(title);

    const row = document.createElement('div');
    row.className = 'picker-row';
    BASE_ORDER.forEach((base, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'picker-base';
      btn.style.setProperty('--base-color', BASE_COLORS[base]);
      btn.innerHTML = `<b>${base}</b><span>${i + 1}</span>`;
      btn.setAttribute('aria-label', t(op === 'insert' ? 'ribbon.insertAria' : 'ribbon.replaceAria', { base }));
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.submitPicker(base);
      });
      row.appendChild(btn);
    });
    this.pickerEl.appendChild(row);

    const hint = document.createElement('div');
    hint.className = 'picker-hint';
    hint.textContent = t('ribbon.pickerCancel');
    this.pickerEl.appendChild(hint);

    const gx = op === 'insert' ? gapCenterX(this.layout, index, this.metrics) : this.layout.cells[index]?.x ?? 0;
    const screenX = op === 'insert' ? gx : gx + this.metrics.baseW / 2;
    const left = clamp(screenX - this.scrollX, 74, this.viewW - 74);
    this.pickerEl.style.left = `${left}px`;
    const pickerTop = Math.min(
      RIBBON.baseY + RIBBON.baseH + 16,
      Math.max(RIBBON.baseY + RIBBON.baseH + 4, this.viewH - 76),
    );
    this.pickerEl.style.top = `${pickerTop}px`;
    this.pickerEl.classList.add('show');
    this.syncModeUi();
  }

  private submitPicker(base: Base): void {
    const picker = this.picker;
    if (!picker) return;
    this.closePicker();
    const req: EditRequest =
      picker.op === 'insert'
        ? { op: 'insert', index: picker.index, base }
        : { op: 'replace', index: picker.index, base };
    this.cursor = clamp(picker.index, 0, this.gene.seq.length);
    this.callbacks.onEdit(req);
  }

  private closePicker(): void {
    if (!this.picker) return;
    this.picker = null;
    this.pickerEl.hidden = true;
    this.pickerEl.classList.remove('show');
    this.syncModeUi();
  }

  private updateTooltip(sx: number, sy: number): void {
    if (this.hover?.kind !== 'slot') {
      this.tipEl.hidden = true;
      return;
    }
    const frame = this.layout.slots[this.hover.slotIndex];
    if (!frame) {
      this.tipEl.hidden = true;
      return;
    }
    const slot = frame.slot;
    let title: string;
    let body: string;
    let footer = '';
    if (slot.role === 'stop') {
      title = t('ribbon.tip.stopTitle', { codon: slot.text });
      body = t('ribbon.tip.stopBody');
      footer = t('ribbon.tip.stopFooter');
    } else if (slot.role === 'junk' || slot.role === 'trailer') {
      title = t('ribbon.tip.junkTitle', { codon: slot.text });
      body = t('ribbon.tip.junkBody');
    } else if (slot.role === 'partial') {
      title = t('ribbon.tip.partialTitle', { codon: slot.text });
      body = t('ribbon.tip.partialBody');
    } else {
      const part = this.afterPartForSlot(slot, this.gene);
      title = t('ribbon.tip.partTitle', {
        codon: slot.text,
        label: part ? partLabel(part.id) : t('common.partFallback'),
      });
      body = part ? statsText(part) : '';
      footer = part ? partBlurb(part.id) : '';
    }

    this.tipEl.innerHTML = '';
    const titleEl = document.createElement('div');
    titleEl.className = 'tip-title';
    titleEl.textContent = title;
    this.tipEl.appendChild(titleEl);
    const b = document.createElement('div');
    b.className = 'tip-body';
    b.textContent = body;
    this.tipEl.appendChild(b);
    if (footer) {
      const f = document.createElement('div');
      f.className = 'tip-footer';
      f.textContent = footer;
      this.tipEl.appendChild(f);
    }

    const px = sx + 14;
    const py = sy + 18;
    this.tipEl.hidden = false;
    const tw = this.tipEl.offsetWidth;
    const th = this.tipEl.offsetHeight;
    this.tipEl.style.left = `${clamp(px, 8, this.viewW - tw - 8)}px`;
    this.tipEl.style.top = `${clamp(py, 8, this.viewH - th - 8)}px`;
  }

  private flashHint(text: string): void {
    this.modeHintEl.textContent = text;
    this.modeHintEl.classList.add('flash');
    window.setTimeout(() => {
      this.modeHintEl.classList.remove('flash');
      this.syncModeUi();
    }, 1300);
  }

  private syncModeUi(): void {
    if (this.picker) {
      this.modeHintEl.textContent = t('ribbon.pickerActive');
      this.modeHintEl.classList.add('active');
      return;
    }
    this.modeHintEl.classList.remove('active');
    const map: Record<EditOp, string> = {
      insert: t('ribbon.modeInsert'),
      delete: t('ribbon.modeDelete'),
      replace: t('ribbon.modeReplace'),
    };
    if (this.locked) {
      this.modeHintEl.textContent = t('ribbon.modeLocked');
    } else {
      this.modeHintEl.textContent = this.level.ops.includes(this.mode)
        ? map[this.mode]
        : t('ribbon.modeSelect');
    }
  }

  private syncStamp(): void {
    const text = issueStamp(this.issue);
    if (!text) {
      this.stampEl.hidden = true;
      this.stampEl.textContent = '';
      return;
    }
    this.stampEl.hidden = false;
    this.stampEl.textContent = text;
  }

  private handleKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (e.metaKey || e.altKey) return;

    if (e.key === 'Escape') {
      if (this.picker) {
        this.closePicker();
        e.preventDefault();
        return;
      }
      this.callbacks.onEscape();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.callbacks.onUndo();
      return;
    }
    if (e.ctrlKey) return;

    if (this.picker) {
      const idx = ['1', '2', '3', '4'].indexOf(e.key);
      if (idx >= 0) {
        e.preventDefault();
        this.submitPicker(BASE_ORDER[idx]);
        return;
      }
      const letter = e.key.toUpperCase();
      if (letter === 'A' || letter === 'U' || letter === 'G' || letter === 'C') {
        e.preventDefault();
        this.submitPicker(letter as Base);
        return;
      }
      // 选字母时不要被 Enter / 快捷键穿透（防止误起跑或误切工具）。
      if (e.key.length === 1 || e.key === 'Enter') {
        e.preventDefault();
      }
      return;
    }

    if (this.locked) {
      if (e.key === 'Enter') {
        // RUN 中/结算时交给 App 决定
        this.callbacks.onRun();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        this.cursor = this.clampCursor(this.cursor - 1);
        this.ensureCursorVisible();
        this.previewArmed = true;
        this.previewFromCursor();
        return;
      case 'ArrowRight':
        e.preventDefault();
        this.cursor = this.clampCursor(this.cursor + 1);
        this.ensureCursorVisible();
        this.previewArmed = true;
        this.previewFromCursor();
        return;
      case 'Home':
        e.preventDefault();
        this.cursor = 0;
        this.ensureCursorVisible();
        this.previewArmed = true;
        this.previewFromCursor();
        return;
      case 'End':
        e.preventDefault();
        this.cursor = this.clampCursor(this.mode === 'insert' ? this.gene.seq.length : this.gene.seq.length - 1);
        this.ensureCursorVisible();
        this.previewArmed = true;
        this.previewFromCursor();
        return;
      case 'Enter':
        e.preventDefault();
        this.callbacks.onRun();
        return;
      case 'Backspace':
        e.preventDefault();
        if (this.gene.seq.length > 0) {
          const idx = clamp(this.cursor, 0, this.gene.seq.length - 1);
          this.cursor = idx;
          this.callbacks.onEdit({ op: 'delete', index: idx });
        }
        return;
      default:
        break;
    }

    const lower = e.key.toLowerCase();
    if (lower === 'i') {
      this.setMode('insert');
      e.preventDefault();
      return;
    }
    if (lower === 'd') {
      this.setMode('delete');
      e.preventDefault();
      return;
    }
    if (lower === 'r') {
      this.setMode('replace');
      e.preventDefault();
      return;
    }
    if (lower === 'u') {
      this.callbacks.onUndo();
      e.preventDefault();
      return;
    }
    if (e.key === '0') {
      this.callbacks.onReset();
      return;
    }

    const digit = ['1', '2', '3', '4'].indexOf(e.key);
    const letter =
      e.key.length === 1 && 'AUGC'.includes(e.key.toUpperCase()) ? (e.key.toUpperCase() as Base) : null;
    const base = digit >= 0 ? BASE_ORDER[digit] : letter;
    if (base) {
      e.preventDefault();
      const idx = clamp(this.cursor, 0, this.mode === 'insert' ? this.gene.seq.length : this.gene.seq.length - 1);
      if (this.mode === 'insert') {
        this.callbacks.onEdit({ op: 'insert', index: idx, base });
      } else if (this.mode === 'replace') {
        this.callbacks.onEdit({ op: 'replace', index: idx, base });
      } else {
        this.cursor = idx;
      }
    }
  }

  private roundRect(
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
}

/* ==========================================================================
 * 小工具
 * ========================================================================== */

function withAlphaSafe(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = Number.parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const TIMING_FLIP_TAIL = 300;
