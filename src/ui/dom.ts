/** 小型 DOM 工具（B 负责）。 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function fmt(n: number, digits = 0): string {
  return n.toFixed(digits);
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export type SlotIcon = 'body' | 'beak' | 'legs' | 'wings' | 'tail' | 'crest';

const ICONS: Record<SlotIcon, string> = {
  body: '<ellipse cx="12" cy="13" rx="7.2" ry="5.8"/><path d="M6 11c2-4 10-5 13 0"/>',
  beak: '<path d="M4 12h10l6 4-9 1z"/><path d="M6 10h8"/>',
  legs: '<path d="M8 3v8l-3 6M12 4v7l3 6M16 5v5l-2 7"/><path d="M4 20h6M12 20h6"/>',
  wings: '<path d="M3 16c5 1 8-2 10-7 1-3 4-5 8-5-2 8-7 13-15 13"/><path d="M6 15c2-1 4-3 5-6"/>',
  tail: '<path d="M4 18c4-1 6-4 8-9M8 19c4-2 6-5 8-10M12 20c4-2 6-5 7-9M16 20l4-7"/>',
  crest: '<path d="M4 19l2-8 3 4 3-9 3 8 5-5-1 10z"/>',
};

export function slotIcon(slot: SlotIcon): HTMLElement {
  const span = el('span', `part-icon icon-${slot}`);
  span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">${ICONS[slot]}</svg>`;
  return span;
}
