/** 小鸡周围的 6 个可点击/可拖放槽位环（点击直接打开部位造型微调，P-028）。 */

import * as THREE from 'three';
import type { Creature, SlotId } from '../core';
import { MAX_BODY_FUSION, SLOT_IDS } from '../core';
import type { ChickModel } from '../render3d/chick';
import type { SceneView } from '../render3d/scene';
import { el } from './dom';
import { t } from './strings';

const OFFSET: Record<SlotId, readonly [number, number]> = {
  body: [-98, 28],
  beak: [122, 16],
  legs: [16, 108],
  wings: [-94, -78],
  tail: [-194, 10],
  crest: [48, -112],
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

  constructor(host: HTMLElement, onClickSlot?: (slot: SlotId) => void) {
    this.el = el('div', 'rings-layer');
    for (const slot of SLOT_IDS) {
      const ring = el('div', `slot-ring ring-${slot}`);
      ring.dataset.slot = slot;
      ring.title = '点击微调该部位造型，或拖入零件';
      const inner = el('div', 'ring-inner');
      const label = el('span', 'ring-label', t(LABEL_KEY[slot]));
      const count = el('span', 'ring-count', '0');
      const hint = el('span', 'ring-drop-hint', t('ring.hint'));
      inner.append(label, count, hint);
      ring.append(inner);
      ring.addEventListener('click', () => onClickSlot?.(slot));
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
      const size = 62;
      const [dx, dy] = OFFSET[slot];
      const x = Math.min(
        this.el.clientWidth - size / 2 - 6,
        Math.max(size / 2 + 6, this.tmp.x + dx),
      );
      const y = Math.min(
        this.el.clientHeight - size / 2 - 6,
        Math.max(size / 2 + 6, this.tmp.y + dy),
      );
      ring.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      ring.style.opacity = this.tmp.visible ? '1' : '0';
      ring.style.pointerEvents = this.tmp.visible ? 'auto' : 'none';
    }
  }

  setCreature(creature: Creature): void {
    for (const slot of SLOT_IDS) {
      const list = creature.slots[slot];
      const node = this.counts.get(slot);
      if (node) {
        if (slot === 'body') {
          node.textContent = list.length > 0 ? `${list.length}/${MAX_BODY_FUSION}` : '0';
        } else {
          node.textContent = list[0] ? `Lv.${list[0].level}` : '0';
        }
      }
      const ring = this.rings.get(slot);
      if (ring) ring.classList.toggle('has-count', list.length > 0);
    }
  }

  setSelected(slot: SlotId | null): void {
    for (const [id, ring] of this.rings) {
      ring.classList.toggle('selected', id === slot);
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
}
