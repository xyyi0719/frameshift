/**
 * 常驻碱基托盘（B 负责）。
 * ---------------------------------------------------------------
 * 四个可拖动的碱基圆片。拖拽逻辑由 DragController 处理，这里只负责
 * DOM、无障碍标签和 pointerdown 起点。
 */

import type { Base } from '../core';
import { BASE_ORDER } from '../core';
import { BASE_COLORS } from './theme';
import { t } from './i18n';

export class BaseTray {
  readonly el: HTMLDivElement;
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly labelEl: HTMLSpanElement;

  constructor(host: HTMLElement, onStart: (base: Base, event: PointerEvent) => void) {
    this.el = document.createElement('div');
    this.el.className = 'base-tray';
    this.el.setAttribute('role', 'toolbar');
    this.el.setAttribute('aria-label', t('tray.aria'));
    const label = document.createElement('span');
    label.className = 'tray-label';
    label.textContent = t('tray.label');
    this.labelEl = label;
    this.el.appendChild(label);

    BASE_ORDER.forEach((base) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tray-base';
      btn.dataset.base = base;
      btn.textContent = base;
      btn.style.setProperty('--base-color', BASE_COLORS[base]);
      btn.setAttribute('aria-label', t('tray.baseAria', { base }));
      btn.title = t('tray.baseAria', { base });
      btn.draggable = false;
      btn.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        onStart(base, event);
      });
      this.el.appendChild(btn);
      this.buttons.push(btn);
    });
    host.appendChild(this.el);
  }

  setEnabled(enabled: boolean): void {
    this.el.classList.toggle('disabled', !enabled);
    for (const btn of this.buttons) btn.disabled = !enabled;
  }

  refreshLanguage(): void {
    this.el.setAttribute('aria-label', t('tray.aria'));
    this.labelEl.textContent = t('tray.label');
    for (const btn of this.buttons) {
      const base = btn.dataset.base ?? '';
      const label = t('tray.baseAria', { base });
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }
  }
}
