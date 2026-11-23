/** 左侧零件库（B 负责）。 */

import type { Creature, PartDef, SlotId } from '../core';
import { PARTS_BY_SLOT, SLOT_IDS } from '../core';
import { el, slotIcon } from './dom';
import { t } from './strings';

export interface SidebarCallbacks {
  onPartPointerDown: (def: PartDef, event: PointerEvent) => void;
  onAdd: (def: PartDef) => void;
  onRemove: (def: PartDef) => void;
  onClear: (slot: SlotId) => void;
  onClearAll: () => void;
}

interface Row {
  readonly def: PartDef;
  readonly root: HTMLDivElement;
  readonly count: HTMLSpanElement;
  readonly minus: HTMLButtonElement;
  readonly group: HTMLElement;
}

const SLOT_ICON: Record<SlotId, 'body' | 'beak' | 'legs' | 'wings' | 'tail' | 'crest'> = {
  body: 'body',
  beak: 'beak',
  legs: 'legs',
  wings: 'wings',
  tail: 'tail',
  crest: 'crest',
};

function statsText(def: PartDef): string {
  const bits: string[] = [];
  if (def.stats.hp) bits.push(`HP+${def.stats.hp}`);
  if (def.stats.atk) bits.push(`ATK+${def.stats.atk}`);
  if (def.stats.def) bits.push(`DEF+${def.stats.def}`);
  if (def.stats.spd) bits.push(`SPD${def.stats.spd > 0 ? '+' : ''}${def.stats.spd}`);
  if (bits.length === 0) bits.push('—');
  return bits.join(' · ');
}

export class Sidebar {
  readonly el: HTMLElement;
  private readonly rows: Row[] = [];
  private readonly groups = new Map<SlotId, HTMLElement>();
  private readonly groupCounts = new Map<SlotId, HTMLElement>();
  private disabled = false;
  private readonly list: HTMLElement;
  private lastPointerType = 'mouse';

  constructor(host: HTMLElement, private readonly cb: SidebarCallbacks) {
    this.el = el('aside', 'sidebar');
    const head = el('div', 'sidebar-head');
    const titleWrap = el('div', 'sidebar-title-wrap');
    titleWrap.append(el('div', 'eyebrow', t('sidebar.title')), el('h2', 'sidebar-title', '24 个零件 · 全部解锁'));
    head.append(titleWrap);
    const clearAll = el('button', 'icon-btn ghost', '清空');
    clearAll.type = 'button';
    clearAll.title = t('button.reset');
    clearAll.addEventListener('click', () => this.cb.onClearAll());
    head.append(clearAll);
    this.el.append(head);
    this.el.append(el('p', 'sidebar-hint', t('sidebar.hint')));

    const list = el('div', 'part-groups');
    this.list = list;
    for (const slot of SLOT_IDS) {
      const section = el('section', `slot-section slot-${slot}`);
      const sHead = el('div', 'slot-head');
      const icon = slotIcon(SLOT_ICON[slot]);
      const label = el('div', 'slot-label');
      label.append(
        el('span', 'slot-name', t(`slot.${slot}.full` as 'slot.body.full')),
        el('span', 'slot-key', slot.toUpperCase()),
      );
      const count = el('span', 'slot-count', '0');
      const clear = el('button', 'slot-clear', '清空');
      clear.type = 'button';
      clear.addEventListener('click', () => this.cb.onClear(slot));
      sHead.append(icon, label, count, clear);
      section.append(sHead);

      for (const def of PARTS_BY_SLOT[slot]) {
        const row = this.makeRow(def, section);
        this.rows.push(row);
      }
      this.groups.set(slot, section);
      this.groupCounts.set(slot, count);
      list.append(section);
    }
    this.el.append(list);
    host.append(this.el);
  }

  private makeRow(def: PartDef, group: HTMLElement): Row {
    const root = el('div', 'part-card');
    root.tabIndex = 0;
    root.dataset.def = def.id;
    root.dataset.slot = def.slot;
    root.setAttribute('role', 'button');
    root.setAttribute('aria-label', `${def.name.zh}，${t('sidebar.add')}`);

    const icon = slotIcon(SLOT_ICON[def.slot]);
    const main = el('div', 'part-main');
    const nameRow = el('div', 'part-name-row');
    const name = el('span', 'part-name', def.name.zh);
    const tier = el('span', 'part-tier', `T${def.tier}`);
    nameRow.append(name, tier);
    const meta = el('div', 'part-meta');
    meta.append(
      el('span', 'part-mass', t('sidebar.mass', { n: def.mass })),
      el('span', 'part-dot', '·'),
      el('span', 'part-stats', statsText(def)),
    );
    main.append(nameRow, meta);

    const side = el('div', 'part-side');
    const grip = el('button', 'part-drag', '⠿');
    grip.type = 'button';
    grip.title = '拖到槽位环';
    grip.setAttribute('aria-label', `拖动 ${def.name.zh} 到槽位环`);
    grip.addEventListener('pointerdown', (e) => {
      if (this.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      this.lastPointerType = e.pointerType;
      this.cb.onPartPointerDown(def, e);
    });
    const count = el('span', 'part-count', '0');
    const minus = el('button', 'part-minus', '−');
    minus.type = 'button';
    minus.title = t('sidebar.remove');
    minus.setAttribute('aria-label', `${t('sidebar.remove')} ${def.name.zh}`);
    minus.addEventListener('pointerdown', (e) => e.stopPropagation());
    minus.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cb.onRemove(def);
    });
    side.append(grip, count, minus);
    root.append(icon, main, side);

    root.addEventListener('pointerdown', (e) => {
      if (this.disabled) return;
      const target = e.target as HTMLElement;
      if (target.closest('button')) return;
      if (e.button !== 0) return;
      this.lastPointerType = e.pointerType;
      // 触屏：卡片区域留给纵向滚动；拖拽请用右侧 ⠿ 手柄。
      if (e.pointerType !== 'mouse') return;
      e.preventDefault();
      this.cb.onPartPointerDown(def, e);
    });
    root.addEventListener('click', (e) => {
      if (this.disabled) return;
      const target = e.target as HTMLElement;
      if (target.closest('button')) return;
      if (this.lastPointerType === 'mouse') return;
      this.cb.onAdd(def);
    });
    root.addEventListener('keydown', (e) => {
      if (this.disabled) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.cb.onAdd(def);
      }
    });

    root.addEventListener('contextmenu', (e) => e.preventDefault());
    group.append(root);
    return { def, root, count, minus, group };
  }

  setCreature(creature: Creature): void {
    this.list.scrollLeft = 0;
    const perDef = new Map<string, number>();
    const perSlot = new Map<SlotId, number>();
    for (const slot of SLOT_IDS) {
      const list = creature.slots[slot];
      perSlot.set(slot, list.length);
      for (const instance of list) perDef.set(instance.defId, (perDef.get(instance.defId) ?? 0) + 1);
    }
    for (const row of this.rows) {
      const count = perDef.get(row.def.id) ?? 0;
      row.count.textContent = String(count);
      row.root.classList.toggle('installed', count > 0);
      row.minus.disabled = count <= 0;
      row.minus.style.visibility = count > 0 ? 'visible' : 'hidden';
      row.root.setAttribute('aria-label', `${row.def.name.zh}，已装 ${count}，${t('sidebar.add')}`);
    }
    for (const slot of SLOT_IDS) {
      const countEl = this.groupCounts.get(slot);
      if (countEl) countEl.textContent = String(perSlot.get(slot) ?? 0);
      const section = this.groups.get(slot);
      if (section) section.classList.toggle('has-parts', (perSlot.get(slot) ?? 0) > 0);
    }
  }

  setDisabled(disabled: boolean): void {
    this.disabled = disabled;
    this.el.classList.toggle('disabled', disabled);
  }

  refreshLanguage(): void {
    // 当前结构预留；M0 不接切换
  }
}
