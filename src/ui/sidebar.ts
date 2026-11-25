/**
 * 左侧零件库（支持肉鸽闯关已获仓库 / 全件自由试装切换 + 叠阶显示 + 部位微调入口）
 */

import type { Creature, PartDef, SlotId } from '../core';
import { MAX_BODY_FUSION, PARTS_BY_SLOT, SLOT_IDS } from '../core';
import { el, slotIcon } from './dom';
import { t } from './strings';

export interface SidebarCallbacks {
  onPartPointerDown: (def: PartDef, event: PointerEvent) => void;
  onAdd: (def: PartDef) => void;
  onRemove: (def: PartDef) => void;
  onClear: (slot: SlotId) => void;
  onClearAll: () => void;
  onTweakSlot: (slot: SlotId) => void;
  onToggleSandbox: (sandbox: boolean) => void;
}

interface Row {
  readonly def: PartDef;
  readonly root: HTMLDivElement;
  readonly badge: HTMLSpanElement;
  readonly minus: HTMLButtonElement;
  readonly group: HTMLElement;
}

function hexCss(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export class Sidebar {
  readonly el: HTMLElement;
  private readonly rows: Row[] = [];
  private readonly groups = new Map<SlotId, HTMLElement>();
  private readonly groupCounts = new Map<SlotId, HTMLElement>();
  private readonly titleEl: HTMLElement;
  private readonly modeBtn: HTMLButtonElement;
  private disabled = false;
  private sandboxMode = false;
  private ownedIds = new Set<string>();
  private lastPointerType = 'mouse';

  constructor(host: HTMLElement, private readonly cb: SidebarCallbacks) {
    this.el = el('aside', 'sidebar');

    const head = el('div', 'sidebar-head');
    const titleWrap = el('div', 'sidebar-title-wrap');
    this.titleEl = el('h2', 'sidebar-title', '肉鸽零件背包（0 / 36）');
    titleWrap.append(el('div', 'eyebrow', t('sidebar.title')), this.titleEl);

    const headActions = el('div', 'sidebar-head-actions');
    this.modeBtn = el('button', 'btn ghost mode-toggle', '全件试装');
    this.modeBtn.type = 'button';
    this.modeBtn.title = '切换：肉鸽掉落背包 / 解锁全部 36 件自由体验';
    this.modeBtn.addEventListener('click', () => {
      this.sandboxMode = !this.sandboxMode;
      this.cb.onToggleSandbox(this.sandboxMode);
    });

    const clearAll = el('button', 'icon-btn ghost', '清空');
    clearAll.type = 'button';
    clearAll.addEventListener('click', () => this.cb.onClearAll());
    headActions.append(this.modeBtn, clearAll);

    head.append(titleWrap, headActions);
    this.el.append(head);
    this.el.append(el('p', 'sidebar-hint', t('sidebar.hint')));

    const list = el('div', 'part-groups');
    for (const slot of SLOT_IDS) {
      const section = el('section', `slot-section slot-${slot}`);
      const sHead = el('div', 'slot-head');
      const icon = slotIcon(slot);
      const label = el('div', 'slot-label');
      label.append(
        el('span', 'slot-name', t(`slot.${slot}.full` as 'slot.body.full')),
        el('span', 'slot-key', slot.toUpperCase()),
      );
      const count = el('span', 'slot-count', slot === 'body' ? `0/${MAX_BODY_FUSION}` : '空');

      const tweakBtn = el('button', 'slot-tweak', '微调');
      tweakBtn.type = 'button';
      tweakBtn.title = '微调该部位 3D 位置/角度/大小（仅影响造型）';
      tweakBtn.addEventListener('click', () => this.cb.onTweakSlot(slot));

      const clear = el('button', 'slot-clear', '清空');
      clear.type = 'button';
      clear.addEventListener('click', () => this.cb.onClear(slot));

      sHead.append(icon, label, count, tweakBtn, clear);
      section.append(sHead);

      for (const def of PARTS_BY_SLOT[slot]) {
        this.rows.push(this.makeRow(def, section));
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

    const swatch = el('span', 'part-swatch');
    swatch.style.background = `linear-gradient(135deg, ${hexCss(def.art.color)}, ${hexCss(def.art.accentColor)})`;

    const main = el('div', 'part-main');
    const nameRow = el('div', 'part-name-row');
    const name = el('span', 'part-name', def.name.zh);
    const themeTag = el('span', `part-theme ${def.theme}`, def.theme === 'mech' ? '机械' : '动物');
    nameRow.append(name, themeTag);
    const meta = el('div', 'part-meta', def.role);
    main.append(nameRow, meta);

    const side = el('div', 'part-side');
    const badge = el('span', 'part-count', '—');
    const minus = el('button', 'part-minus', '−');
    minus.type = 'button';
    minus.title = t('sidebar.remove');
    minus.addEventListener('pointerdown', (e) => e.stopPropagation());
    minus.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cb.onRemove(def);
    });
    side.append(badge, minus);
    root.append(swatch, main, side);

    root.addEventListener('pointerdown', (e) => {
      if (this.disabled || root.classList.contains('locked')) return;
      const target = e.target as HTMLElement;
      if (target.closest('button')) return;
      if (e.button !== 0) return;
      this.lastPointerType = e.pointerType;
      if (e.pointerType !== 'mouse') return;
      e.preventDefault();
      this.cb.onPartPointerDown(def, e);
    });
    root.addEventListener('click', (e) => {
      if (this.disabled || root.classList.contains('locked')) return;
      const target = e.target as HTMLElement;
      if (target.closest('button')) return;
      if (this.lastPointerType === 'mouse') return;
      this.cb.onAdd(def);
    });
    root.addEventListener('keydown', (e) => {
      if (this.disabled || root.classList.contains('locked')) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.cb.onAdd(def);
      }
    });

    group.append(root);
    return { def, root, badge, minus, group };
  }

  setState(creature: Creature, ownedIds: ReadonlySet<string>, sandboxMode: boolean): void {
    this.sandboxMode = sandboxMode;
    this.ownedIds = new Set(ownedIds);

    this.modeBtn.textContent = sandboxMode ? '回肉鸽背包' : '全件试装';
    this.modeBtn.classList.toggle('active', sandboxMode);
    this.titleEl.textContent = sandboxMode
      ? '全件自由试装（36 件全开）'
      : `肉鸽背包（已获 ${this.ownedIds.size} / 36）`;

    const levelByDef = new Map<string, number>();
    for (const slot of SLOT_IDS) {
      for (const inst of creature.slots[slot]) {
        levelByDef.set(inst.defId, inst.level);
      }
    }

    for (const row of this.rows) {
      const lv = levelByDef.get(row.def.id) ?? 0;
      const unlocked = sandboxMode || this.ownedIds.has(row.def.id) || lv > 0;
      row.root.classList.toggle('locked', !unlocked);
      row.root.classList.toggle('installed', lv > 0);
      row.root.classList.toggle('lv2', lv === 2);
      row.root.classList.toggle('lv3', lv >= 3);

      if (!unlocked) {
        row.badge.textContent = '🔒';
        row.minus.style.visibility = 'hidden';
      } else if (lv > 0) {
        row.badge.textContent = `Lv.${lv}`;
        row.minus.style.visibility = 'visible';
        row.minus.disabled = false;
      } else {
        row.badge.textContent = '+';
        row.minus.style.visibility = 'hidden';
      }
    }

    for (const slot of SLOT_IDS) {
      const list = creature.slots[slot];
      const countEl = this.groupCounts.get(slot);
      if (countEl) {
        if (slot === 'body') {
          countEl.textContent = `${list.length}/${MAX_BODY_FUSION}`;
        } else {
          countEl.textContent = list[0] ? `Lv.${list[0].level}` : '空';
        }
      }
      const section = this.groups.get(slot);
      if (section) section.classList.toggle('has-parts', list.length > 0);
    }
  }

  setDisabled(disabled: boolean): void {
    this.disabled = disabled;
    this.el.classList.toggle('disabled', disabled);
  }
}
