/** 从侧栏拖零件到槽位环（pointer events；触屏同样）。 */

import type { PartDef, SlotId } from '../core';
import { el, slotIcon } from './dom';
import type { SlotRings } from './rings';
import { t } from './strings';

export interface DragCallbacks {
  onTap: (def: PartDef) => void;
  onDrop: (def: PartDef, slot: SlotId) => void;
  onWrongSlot: (def: PartDef, slot: SlotId | null) => void;
}

const SLOT_ICON = {
  body: 'body',
  beak: 'beak',
  legs: 'legs',
  wings: 'wings',
  tail: 'tail',
  crest: 'crest',
} as const;

export class PartDrag {
  private readonly ghost: HTMLElement;
  private def: PartDef | null = null;
  private pointerId = -1;
  private startX = 0;
  private startY = 0;
  private active = false;
  private target: SlotId | null = null;

  private readonly move = (e: PointerEvent): void => this.onMove(e);
  private readonly up = (e: PointerEvent): void => this.onUp(e);
  private readonly cancel = (): void => this.stop();

  constructor(
    host: HTMLElement,
    private readonly rings: SlotRings,
    private readonly cb: DragCallbacks,
  ) {
    this.ghost = el('div', 'drag-ghost');
    this.ghost.hidden = true;
    host.appendChild(this.ghost);
  }

  start(def: PartDef, event: PointerEvent): void {
    if (this.pointerId !== -1) return;
    this.def = def;
    this.pointerId = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.active = false;
    this.target = null;
    window.addEventListener('pointermove', this.move, { passive: false });
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.cancel);
    window.addEventListener('keydown', this.onKey);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.stop();
    }
  };

  private activate(x: number, y: number): void {
    const def = this.def;
    if (!def) return;
    this.active = true;
    document.body.classList.add('is-dragging');
    this.ghost.hidden = false;
    this.ghost.replaceChildren();
    const icon = slotIcon(SLOT_ICON[def.slot]);
    const label = el('div', 'drag-ghost-label');
    label.append(el('b', '', def.name.zh), el('span', '', t('drag.ghost')));
    this.ghost.append(icon, label);
    this.moveGhost(x, y);
  }

  private moveGhost(x: number, y: number): void {
    this.ghost.style.left = `${x}px`;
    this.ghost.style.top = `${y}px`;
  }

  private onMove(e: PointerEvent): void {
    if (!this.def || e.pointerId !== this.pointerId) return;
    if (!this.active) {
      if (Math.hypot(e.clientX - this.startX, e.clientY - this.startY) < 5) return;
      this.activate(e.clientX, e.clientY);
    }
    e.preventDefault();
    this.moveGhost(e.clientX, e.clientY);
    const slot = this.rings.slotAt(e.clientX, e.clientY);
    this.target = slot;
    this.rings.setDragTarget(slot, slot !== null && slot === this.def.slot);
  }

  private onUp(e: PointerEvent): void {
    if (!this.def || e.pointerId !== this.pointerId) return;
    const def = this.def;
    if (!this.active) {
      this.stop();
      this.cb.onTap(def);
      return;
    }
    if (this.target === def.slot) {
      this.stop();
      this.cb.onDrop(def, def.slot);
    } else {
      const wrong = this.target;
      this.stop();
      this.cb.onWrongSlot(def, wrong);
    }
  }

  stop(): void {
    this.def = null;
    this.pointerId = -1;
    this.active = false;
    this.target = null;
    this.ghost.hidden = true;
    document.body.classList.remove('is-dragging');
    this.rings.clearDrag();
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.cancel);
    window.removeEventListener('keydown', this.onKey);
  }
}
