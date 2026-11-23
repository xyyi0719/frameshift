/**
 * 碱基拖拽控制器（B 负责）。
 * ---------------------------------------------------------------
 * 拖入：tray 圆片 → gap；拖出：基因带碱基 → 带外/垃圾桶；换位：碱基 → 另一个 gap。
 * 全部走 pointer events（触屏可用），阈值 6px，松手才提交。
 */

import type { Base } from '../core';
import { GeneRibbon } from './ribbon';
import { BASE_COLORS } from './theme';
import { t } from './i18n';

export interface DragCallbacks {
  onInsert: (base: Base, index: number) => void;
  onDelete: (index: number) => void;
  onMove: (from: number, to: number, base: Base) => void;
  onPreview: (req: { base: Base; index: number; fromIndex?: number } | null) => void;
  onActive: (active: boolean) => void;
}

interface DragState {
  kind: 'tray' | 'base';
  base: Base;
  fromIndex?: number;
  startX: number;
  startY: number;
  active: boolean;
  pointerId: number;
  target: 'insert' | 'delete' | 'move' | null;
  targetIndex: number | null;
}

export class DragController {
  private readonly ribbon: GeneRibbon;
  private readonly callbacks: DragCallbacks;
  private state: DragState | null = null;
  private ghost: HTMLDivElement;
  private trash: HTMLDivElement;
  private previewKey = '';
  private readonly trashLabel: HTMLSpanElement;
  private readonly onMoveBound = (e: PointerEvent): void => this.handleMove(e);
  private readonly onUpBound = (e: PointerEvent): void => this.handleUp(e);
  private readonly onCancelBound = (): void => this.finish(false);
  private readonly onWinKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.finish(false);
    }
  };

  constructor(ribbon: GeneRibbon, callbacks: DragCallbacks) {
    this.ribbon = ribbon;
    this.callbacks = callbacks;
    this.ghost = document.createElement('div');
    this.ghost.className = 'drag-ghost';
    this.ghost.hidden = true;
    this.ghost.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.ghost);

    this.trash = document.createElement('div');
    this.trash.className = 'drag-trash';
    this.trash.hidden = true;
    const can = document.createElement('span');
    can.className = 'drag-trash-can';
    const label = document.createElement('span');
    label.className = 'drag-trash-label';
    label.textContent = t('drag.trash');
    this.trashLabel = label;
    this.trash.append(can, label);
    document.body.appendChild(this.trash);
  }

  refreshLanguage(): void {
    this.trashLabel.textContent = t('drag.trash');
  }

  /** 从托盘按下：等 6px 再进入拖拽，避免误触。 */
  startTray(base: Base, event: PointerEvent): void {
    if (this.state) return;
    this.state = {
      kind: 'tray',
      base,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      pointerId: event.pointerId,
      target: null,
      targetIndex: null,
    };
    this.listen();
  }

  /** Ribbon 已越过 6px 阈值：直接进入拖拽。 */
  startBase(index: number, base: Base, x: number, y: number): void {
    if (this.state) return;
    this.state = {
      kind: 'base',
      base,
      fromIndex: index,
      startX: x,
      startY: y,
      active: false,
      pointerId: -1,
      target: null,
      targetIndex: null,
    };
    this.listen();
    this.activate(x, y);
  }

  private listen(): void {
    window.addEventListener('pointermove', this.onMoveBound, { passive: false });
    window.addEventListener('pointerup', this.onUpBound);
    window.addEventListener('pointercancel', this.onCancelBound);
    window.addEventListener('keydown', this.onWinKey);
  }

  private activate(x: number, y: number): void {
    if (!this.state) return;
    this.state.active = true;
    this.ghost.hidden = false;
    this.ghost.textContent = this.state.base;
    this.ghost.style.setProperty('--base-color', BASE_COLORS[this.state.base]);
    this.moveGhost(x, y);
    if (this.state.kind === 'base') this.trash.hidden = false;
    this.ribbon.setExternalDrag(true);
    this.callbacks.onActive(true);
  }

  private moveGhost(x: number, y: number): void {
    this.ghost.style.left = `${x}px`;
    this.ghost.style.top = `${y}px`;
  }

  private handleMove(event: PointerEvent): void {
    const s = this.state;
    if (!s) return;
    if (!s.active) {
      const dist = Math.hypot(event.clientX - s.startX, event.clientY - s.startY);
      if (dist < 6) return;
      this.activate(event.clientX, event.clientY);
    }
    event.preventDefault();
    this.moveGhost(event.clientX, event.clientY);
    this.updateTarget(event.clientX, event.clientY);
  }

  private updateTarget(x: number, y: number): void {
    const s = this.state;
    if (!s) return;
    const rect = this.ribbon.getRibbonRect();
    const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    const gap = inside ? this.ribbon.hitGapAt(x, y) : null;
    const trashRect = this.trash.getBoundingClientRect();
    const overTrash =
      !this.trash.hidden &&
      x >= trashRect.left && x <= trashRect.right && y >= trashRect.top && y <= trashRect.bottom;

    let target: DragState['target'] = null;
    let targetIndex: number | null = null;
    let preview: { base: Base; index: number; fromIndex?: number } | null = null;

    if (s.kind === 'tray') {
      if (gap !== null) {
        target = 'insert';
        targetIndex = gap;
        preview = { base: s.base, index: gap };
      }
    } else if (gap !== null && gap !== s.fromIndex && gap !== (s.fromIndex ?? -1) + 1) {
      target = 'move';
      targetIndex = gap;
      preview = { base: s.base, index: gap, fromIndex: s.fromIndex };
    } else if (overTrash || !inside) {
      target = 'delete';
    }

    this.trash.classList.toggle('active', overTrash || (s.kind === 'base' && target === 'delete'));
    s.target = target;
    s.targetIndex = targetIndex;

    const indicator =
      (target === 'insert' || target === 'move') && targetIndex !== null
        ? { kind: target === 'move' ? ('move' as const) : ('insert' as const), index: targetIndex, base: s.base }
        : null;
    this.ribbon.setDropIndicator(indicator);

    const key = preview ? `${preview.index}:${preview.fromIndex ?? ''}` : '';
    if (key !== this.previewKey) {
      this.previewKey = key;
      this.callbacks.onPreview(preview);
    }
  }

  private handleUp(event: PointerEvent): void {
    const s = this.state;
    if (!s) return;
    if (!s.active) {
      this.finish(false);
      return;
    }
    this.updateTarget(event.clientX, event.clientY);
    const target = s.target;
    const index = s.targetIndex;
    const from = s.fromIndex;
    const base = s.base;
    const kind = s.kind;
    this.finish(false);
    if (target === null) return;
    if (kind === 'base' && target === 'delete' && from !== undefined) {
      this.callbacks.onDelete(from);
      return;
    }
    if (index === null) return;
    if (kind === 'tray' && target === 'insert') {
      this.callbacks.onInsert(base, index);
    } else if (kind === 'base' && target === 'move') {
      this.callbacks.onMove(from ?? -1, index, base);
    }
  }

  private finish(commit: boolean): void {
    void commit;
    this.state = null;
    this.previewKey = '';
    window.removeEventListener('pointermove', this.onMoveBound);
    window.removeEventListener('pointerup', this.onUpBound);
    window.removeEventListener('pointercancel', this.onCancelBound);
    window.removeEventListener('keydown', this.onWinKey);
    this.ghost.hidden = true;
    this.trash.hidden = true;
    this.trash.classList.remove('active');
    this.ribbon.setDropIndicator(null);
    this.ribbon.setExternalDrag(false);
    this.ribbon.endBaseDrag();
    this.callbacks.onPreview(null);
    this.callbacks.onActive(false);
  }
}
