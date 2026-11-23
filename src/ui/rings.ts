/** 小鸡周围的 6 个槽位环（DOM 投影；永远面向相机）。 */

import * as THREE from 'three';
import type { SlotId } from '../core';
import { SLOT_IDS } from '../core';
import type { ChickModel } from '../render3d/chick';
import type { SceneView } from '../render3d/scene';
import { el } from './dom';
import { t } from './strings';

const OFFSET: Record<SlotId, readonly [number, number]> = {
  body: [-96, 32],
  beak: [122, 18],
  legs: [16, 104],
  wings: [-94, -78],
  tail: [-196, 10],
  crest: [46, -108],
};

const LABEL: Record<SlotId, string> = {
  body: '躯干',
  beak: '喙',
  legs: '腿',
  wings: '翼',
  tail: '尾',
  crest: '冠',
};

const LABEL_KEY: Record<SlotId, 'slot.body' | 'slot.beak' | 'slot.legs' | 'slot.wings' | 'slot.tail' | 'slot.crest'> = {
  body: 'slot.body',
  beak: 'slot.beak',
  legs: 'slot.legs',
  wings: 'slot.wings',
  tail: 'slot.tail',
  crest: 'slot.crest',
};

export class SlotRings {
  readonly el: HTMLElement;
  private readonly rings = new Map<SlotId, HTMLElement>();
  private readonly counts = new Map<SlotId, HTMLElement>();
  private visible = true;
  private readonly tmp = { x: 0, y: 0, visible: false };
  private readonly world = new THREE.Vector3();

  constructor(host: HTMLElement) {
    this.el = el('div', 'rings-layer');
    for (const slot of SLOT_IDS) {
      const ring = el('div', `slot-ring ring-${slot}`);
      ring.dataset.slot = slot;
      const inner = el('div', 'ring-inner');
      const label = el('span', 'ring-label', t(LABEL_KEY[slot]));
      const count = el('span', 'ring-count', '0');
      const hint = el('span', 'ring-drop-hint', t('ring.hint'));
      inner.append(label, count, hint);
      ring.append(inner);
      this.rings.set(slot, ring);
      this.counts.set(slot, count);
      this.el.append(ring);
    }
    host.appendChild(this.el);
  }

  position(model: ChickModel, scene: SceneView): void {
    if (!this.visible) return;
    for (const slot of SLOT_IDS) {
      const ring = this.rings.get(slot);
      if (!ring) continue;
      model.getSlotWorld(slot, this.world);
      scene.project(this.world, this.tmp);
      const narrow = this.el.clientWidth < 700;
      const scale = narrow ? 0.66 : 1;
      const size = narrow ? 48 : 62;
      const [dx, dy] = OFFSET[slot];
      const x = Math.min(
        this.el.clientWidth - size / 2 - 6,
        Math.max(size / 2 + 6, this.tmp.x + dx * scale),
      );
      const y = Math.min(
        this.el.clientHeight - size / 2 - 6,
        Math.max(size / 2 + 6, this.tmp.y + dy * scale),
      );
      ring.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      ring.style.opacity = this.tmp.visible ? '1' : '0';
      ring.style.pointerEvents = this.tmp.visible ? 'auto' : 'none';
    }
  }

  setCounts(counts: Readonly<Record<SlotId, number>>): void {
    for (const slot of SLOT_IDS) {
      const count = counts[slot] ?? 0;
      const node = this.counts.get(slot);
      if (node) node.textContent = String(count);
      const ring = this.rings.get(slot);
      if (ring) ring.classList.toggle('has-count', count > 0);
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.el.classList.toggle('hidden', !visible);
  }

  setDragTarget(slot: SlotId | null, valid: boolean): void {
    for (const [id, ring] of this.rings) {
      ring.classList.toggle('drag-active', id === slot && valid);
      ring.classList.toggle('drag-wrong', id === slot && !valid);
      ring.classList.toggle('drag-dim', slot !== null && id !== slot);
    }
    this.el.classList.toggle('dragging', slot !== null);
  }

  clearDrag(): void {
    for (const ring of this.rings.values()) {
      ring.classList.remove('drag-active', 'drag-wrong', 'drag-dim');
    }
    this.el.classList.remove('dragging');
  }

  flash(slot: SlotId): void {
    const ring = this.rings.get(slot);
    if (!ring) return;
    ring.classList.remove('flash');
    void ring.offsetWidth;
    ring.classList.add('flash');
    window.setTimeout(() => ring.classList.remove('flash'), 520);
  }

  slotAt(x: number, y: number): SlotId | null {
    for (const [slot, ring] of this.rings) {
      const r = ring.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return slot;
    }
    return null;
  }

  refreshLanguage(): void {
    for (const slot of SLOT_IDS) {
      const ring = this.rings.get(slot);
      const label = ring?.querySelector('.ring-label');
      if (label) label.textContent = t(LABEL_KEY[slot]);
    }
  }

  /** 供调试/测试读标签。 */
  label(slot: SlotId): string {
    return LABEL[slot];
  }
}
