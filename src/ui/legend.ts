/**
 * 密码表图例（B 负责，DOM）。
 * ---------------------------------------------------------------
 * 常驻右栏。16 个零件按 PART_DEFS 的固定顺序分组，密码子从 CODON_TABLE 反查，
 * 不自己推算家族/变体。所有文案走 i18n，语言切换时 refresh() 原地重建。
 */

import type { Codon, Family, Gene, PartDefinition, PartId, StatKey } from '../core';
import { BASE_ORDER, CODON_TABLE, PART_DEFS } from '../core';
import { drawPart } from './parts-art';
import { COLORS, FAMILY_COLORS } from './theme';
import { familyLabel, partBlurb, partLabel, statLabel, t } from './i18n';

const STOP_DISPLAY = ['UAA', 'UAG', 'UGA'] as const;

export class Legend {
  private readonly root: HTMLElement;
  private codonChips: Map<string, HTMLSpanElement[]> = new Map();
  private partRows: Map<PartId, HTMLElement> = new Map();
  private familySections: Map<Family, HTMLElement> = new Map();
  private jarGrid!: HTMLElement;
  private jarEmpty!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private noResults!: HTMLElement;
  private stopSection!: HTMLElement;
  private currentGene: Gene | null = null;
  private showAllBtn: HTMLButtonElement | null = null;
  private query = '';
  private version = 0;
  private autoExpanded = new Set<Family>();
  private userExpanded = false;
  private collapsedChips = new Map<string, HTMLElement>();
  private onCodonPreview: (partId: PartId | null) => void = () => {};

  constructor(root: HTMLElement, onCodonPreview: (partId: PartId | null) => void = () => {}) {
    this.root = root;
    this.onCodonPreview = onCodonPreview;
    this.build();
  }

  /** 设置某关默认展开的家族（渐进披露）。 */
  setAutoExpand(families: readonly Family[]): void {
    this.autoExpanded = new Set(families);
    this.userExpanded = false;
    for (const [family, section] of this.familySections) {
      section.classList.toggle('collapsed', !this.isOpen(family));
    }
    this.renderShowAll();
  }

  private isOpen(family: Family): boolean {
    if (this.userExpanded || this.query.trim() !== '') return true;
    return this.autoExpanded.has(family);
  }

  private renderShowAll(): void {
    if (!this.showAllBtn) return;
    const allOpen =
      this.userExpanded ||
      [...this.familySections.keys()].every((f) => this.autoExpanded.has(f));
    this.showAllBtn.hidden = allOpen;
    this.showAllBtn.textContent = t('legend.showAll');
  }

  /** 语言切换后重建整栏；保留搜索词与当前基因高亮。 */
  refresh(): void {
    const query = this.searchInput?.value ?? this.query;
    const scrollTop = this.root.scrollTop;
    const auto = new Set(this.autoExpanded);
    const expanded = this.userExpanded;
    this.query = query;
    this.build();
    this.searchInput.value = query;
    this.autoExpanded = auto;
    this.userExpanded = expanded;
    for (const [family, section] of this.familySections) {
      section.classList.toggle('collapsed', !this.isOpen(family));
    }
    this.renderShowAll();
    this.applyFilter();
    if (this.currentGene) this.setGene(this.currentGene);
    this.root.scrollTop = scrollTop;
  }

  private build(): void {
    this.codonChips = new Map();
    this.partRows = new Map();
    this.familySections = new Map();
    this.collapsedChips = new Map();
    this.version += 1;
    this.root.innerHTML = '';
    this.root.setAttribute('aria-label', t('legend.title'));

    const head = document.createElement('div');
    head.className = 'legend-head';
    const headText = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'legend-title';
    title.textContent = t('legend.title');
    const sub = document.createElement('div');
    sub.className = 'legend-sub';
    sub.textContent = t('legend.subtitle');
    headText.append(title, sub);
    const count = document.createElement('div');
    count.className = 'legend-count';
    count.textContent = t('legend.parts', { n: PART_DEFS.length });
    head.append(headText, count);
    this.root.appendChild(head);

    const searchWrap = document.createElement('div');
    searchWrap.className = 'legend-search';
    this.searchInput = document.createElement('input');
    this.searchInput.type = 'search';
    this.searchInput.className = 'legend-search-input';
    this.searchInput.placeholder = t('legend.searchPlaceholder');
    this.searchInput.setAttribute('aria-label', t('legend.searchAria'));
    this.searchInput.value = this.query;
    this.searchInput.addEventListener('input', () => {
      this.query = this.searchInput.value;
      this.applyFilter();
    });
    searchWrap.appendChild(this.searchInput);
    this.root.appendChild(searchWrap);

    const inspect = document.createElement('p');
    inspect.className = 'legend-inspect';
    inspect.textContent = t('legend.inspectHint');
    this.root.appendChild(inspect);

    const showAll = document.createElement('button');
    showAll.type = 'button';
    showAll.className = 'legend-show-all';
    showAll.textContent = t('legend.showAll');
    showAll.addEventListener('click', () => {
      this.userExpanded = true;
      for (const section of this.familySections.values()) section.classList.remove('collapsed');
      this.renderShowAll();
      this.applyFilter();
    });
    this.showAllBtn = showAll;
    this.root.appendChild(showAll);

    const body = document.createElement('div');
    body.className = 'legend-body';

    const byFamily = new Map<Family, PartDefinition[]>();
    for (const def of PART_DEFS) {
      const list = byFamily.get(def.family) ?? [];
      list.push(def);
      byFamily.set(def.family, list);
    }

    for (const family of BASE_ORDER) {
      const defs = byFamily.get(family) ?? [];
      const section = document.createElement('section');
      section.className = 'legend-family';
      section.dataset.family = family;
      section.style.setProperty('--family-color', FAMILY_COLORS[family]);
      const heading = document.createElement('div');
      heading.className = 'family-head';
      const letter = document.createElement('span');
      letter.className = 'family-letter';
      letter.textContent = family;
      const name = document.createElement('span');
      name.className = 'family-name';
      name.textContent = familyLabel(family);
      const line = document.createElement('span');
      line.className = 'family-line';
      const n = document.createElement('span');
      n.className = 'family-n';
      n.textContent = String(defs.length);
      heading.append(letter, name, line, n);
      section.appendChild(heading);

      for (const def of defs) {
        section.appendChild(this.buildRow(def));
      }
      body.appendChild(section);
      this.familySections.set(family, section);
    }

    // STOP 区
    this.stopSection = document.createElement('section');
    this.stopSection.className = 'legend-family legend-stops';
    this.stopSection.style.setProperty('--family-color', COLORS.bad);
    const stopHead = document.createElement('div');
    stopHead.className = 'family-head';
    const stopLetter = document.createElement('span');
    stopLetter.className = 'family-letter';
    stopLetter.textContent = '■';
    const stopName = document.createElement('span');
    stopName.className = 'family-name';
    stopName.textContent = t('legend.stop');
    const stopLine = document.createElement('span');
    stopLine.className = 'family-line';
    const stopN = document.createElement('span');
    stopN.className = 'family-n';
    stopN.textContent = String(STOP_DISPLAY.length);
    stopHead.append(stopLetter, stopName, stopLine, stopN);
    this.stopSection.appendChild(stopHead);

    const stopRow = document.createElement('div');
    stopRow.className = 'stop-row';
    for (const codon of STOP_DISPLAY) {
      const chip = document.createElement('span');
      chip.className = 'codon-chip stop';
      chip.textContent = codon;
      chip.dataset.codon = codon;
      this.codonChips.set(codon, [...(this.codonChips.get(codon) ?? []), chip]);
      stopRow.appendChild(chip);
    }
    this.stopSection.appendChild(stopRow);
    const stopNote = document.createElement('p');
    stopNote.className = 'stop-note';
    stopNote.textContent = t('legend.stopNote');
    this.stopSection.appendChild(stopNote);
    body.appendChild(this.stopSection);

    const footer = document.createElement('p');
    footer.className = 'legend-footnote';
    footer.textContent = t('legend.footnote');
    body.appendChild(footer);
    this.root.appendChild(body);

    this.noResults = document.createElement('p');
    this.noResults.className = 'legend-no-results';
    this.noResults.textContent = t('legend.noResults');
    this.noResults.hidden = true;
    this.root.appendChild(this.noResults);

    // 标本罐
    const jar = document.createElement('section');
    jar.className = 'legend-jar';
    jar.setAttribute('aria-label', t('legend.jarAria'));
    const jarHead = document.createElement('div');
    jarHead.className = 'jar-head';
    const jarTitle = document.createElement('span');
    jarTitle.textContent = t('legend.jarTitle');
    const jarCount = document.createElement('span');
    jarCount.className = 'jar-count';
    jarCount.textContent = '0';
    jarHead.append(jarTitle, jarCount);
    jar.appendChild(jarHead);
    this.jarGrid = document.createElement('div');
    this.jarGrid.className = 'jar-grid';
    this.jarEmpty = document.createElement('p');
    this.jarEmpty.className = 'jar-empty';
    this.jarEmpty.textContent = t('legend.jarEmpty');
    jar.append(this.jarEmpty, this.jarGrid);
    this.root.appendChild(jar);
  }

  private buildRow(def: PartDefinition): HTMLElement {
    const row = document.createElement('article');
    row.className = 'part-row';
    row.dataset.part = def.id;
    row.style.setProperty('--family-color', FAMILY_COLORS[def.family]);

    const iconWrap = document.createElement('div');
    iconWrap.className = 'part-icon';
    const canvas = document.createElement('canvas');
    const size = 30;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    iconWrap.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPart(ctx, def.id, size / 2, size / 2, 26, def.family);
    }
    row.appendChild(iconWrap);

    const main = document.createElement('div');
    main.className = 'part-main';
    const label = document.createElement('div');
    label.className = 'part-label';
    label.textContent = partLabel(def.id);
    main.appendChild(label);

    const codons = document.createElement('div');
    codons.className = 'codon-row';
    const entries = codonEntriesFor(def.id);
    for (const entry of entries) {
      const chip = this.makeChip(entry.codon, def.id, false);
      codons.appendChild(chip);
    }
    main.appendChild(codons);

    const stats = document.createElement('div');
    stats.className = 'part-stats';
    const statEntries = Object.entries(def.stats) as [StatKey, number][];
    stats.textContent = statEntries.length
      ? statEntries.map(([k, v]) => `+${v} ${statLabel(k)}`).join('  ')
      : '';
    main.appendChild(stats);
    row.appendChild(main);
    row.title = partBlurb(def.id);
    row.dataset.search = `${partLabel(def.id)} ${def.id} ${entries.map((e) => e.codon).join(' ')}`.toLowerCase();

    this.partRows.set(def.id, row);
    return row;
  }

  private makeChip(codon: string, partId: PartId | null, hiddenVariant: boolean): HTMLSpanElement {
    const chip = document.createElement('span');
    chip.className = hiddenVariant ? 'codon-chip more' : 'codon-chip';
    if (!hiddenVariant) chip.textContent = codon;
    chip.dataset.codon = codon;
    if (hiddenVariant) chip.dataset.variant = String(this.version);
    if (!hiddenVariant) {
      chip.tabIndex = 0;
      chip.setAttribute('role', 'button');
      chip.setAttribute('aria-label', t('legend.codonAria', { codon }));
      chip.addEventListener('mouseenter', () => this.onCodonPreview(partId));
      chip.addEventListener('mouseleave', () => this.onCodonPreview(null));
      chip.addEventListener('click', () => this.onCodonPreview(partId));
    }
    const list = this.codonChips.get(codon) ?? [];
    list.push(chip);
    this.codonChips.set(codon, list);
    if (hiddenVariant) this.collapsedChips.set(chip.dataset.variant ?? codon, chip);
    return chip;
  }

  private applyFilter(): void {
    const q = this.query.trim().toLowerCase();
    let visible = 0;
    for (const [family, section] of this.familySections) {
      section.classList.toggle('collapsed', !this.isOpen(family));
    }
    for (const row of this.partRows.values()) {
      const search = row.dataset.search ?? '';
      const show = q === '' || search.includes(q);
      row.hidden = !show;
      if (show) visible += 1;
    }
    for (const section of this.familySections.values()) {
      const rows = [...section.querySelectorAll<HTMLElement>('.part-row')];
      section.hidden = rows.length > 0 && rows.every((r) => r.hidden);
    }
    this.stopSection.hidden = q !== '' && visible === 0;
    this.noResults.hidden = visible > 0 || q === '';
    if (this.showAllBtn) this.showAllBtn.hidden = q !== '' || this.userExpanded;
  }

  /** 高亮当前序列里出现的密码子与当前生物的零件。 */
  setGene(gene: Gene): void {
    this.currentGene = gene;
    const present = new Set<string>();
    for (const slot of gene.codons) {
      if (slot.role === 'start' || slot.role === 'part' || slot.role === 'stop') {
        present.add(slot.text);
      }
    }
    for (const [codon, chips] of this.codonChips) {
      const on = present.has(codon);
      for (const chip of chips) chip.classList.toggle('present', on);
    }
    const activeParts = new Set(gene.parts.map((p) => p.id));
    for (const [id, row] of this.partRows) {
      row.classList.toggle('present', activeParts.has(id));
    }

    // 渐进披露只由关卡需求决定；当前生物只负责高亮。
  }

  clearSpecimens(): void {
    this.jarGrid.innerHTML = '';
    this.jarEmpty.hidden = false;
    const count = this.root.querySelector('.jar-count');
    if (count) count.textContent = '0';
  }

  addSpecimen(
    species: string,
    levelLabel: string,
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  ): void {
    this.jarEmpty.hidden = true;
    const tile = document.createElement('figure');
    tile.className = 'jar-tile';
    const canvas = document.createElement('canvas');
    const w = 86;
    const h = 52;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, w, h);
    }
    const cap = document.createElement('figcaption');
    const sp = document.createElement('span');
    sp.className = 'jar-species';
    sp.textContent = species;
    const lv = document.createElement('span');
    lv.className = 'jar-lv';
    lv.textContent = levelLabel;
    cap.append(sp, lv);
    tile.append(canvas, cap);
    this.jarGrid.appendChild(tile);
    const count = this.root.querySelector('.jar-count');
    if (count) count.textContent = String(this.jarGrid.children.length);
  }
}

function codonEntriesFor(id: PartId): { codon: Codon }[] {
  const entries: { codon: Codon }[] = [];
  for (const [codon, def] of Object.entries(CODON_TABLE) as [Codon, PartDefinition | 'stop'][]) {
    if (def !== 'stop' && def.id === id) entries.push({ codon });
  }
  entries.sort((a, b) => a.codon.localeCompare(b.codon));
  return entries;
}
