/**
 * 悬停预览面板（B 负责，DOM + 小画布）。
 * ---------------------------------------------------------------
 * 由 App 用 previewEdit() + phenotype() + judge() 算好模型后传入；
 * 这里只负责把「四种碱基的幽灵结果」画出来：零件链、迷你生物、判定。
 * 面板 pointer-events:none，鼠标停在基因带上不会因为移到面板而丢失预览。
 */

import type { Base, Phenotype } from '../core';
import { buildCreature, drawCreature } from './creature';
import { t } from './i18n';
import { COLORS } from './theme';

export interface PreviewRow {
  base?: Base;
  phenotype: Phenotype | null;
  chain: string;
  status: string;
  tone: 'pass' | 'fail' | 'invalid';
  best?: boolean;
}

export interface PreviewModel {
  title: string;
  free: string;
  warning?: string;
  rows: PreviewRow[];
}

export class PreviewPanel {
  private readonly el: HTMLDivElement;

  constructor(host: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'preview-panel';
    this.el.hidden = true;
    this.el.setAttribute('aria-live', 'polite');
    this.el.setAttribute('aria-label', t('preview.aria'));
    host.appendChild(this.el);
  }

  hide(): void {
    this.el.hidden = true;
    this.el.innerHTML = '';
  }

  show(
    model: PreviewModel,
    options: {
      interactive?: boolean;
      onPick?: (base: Base) => void;
      onClose?: () => void;
    } = {},
  ): void {
    this.el.hidden = false;
    this.el.innerHTML = '';
    this.el.classList.toggle('single', model.rows.length <= 1);
    this.el.classList.toggle('interactive', options.interactive === true);
    this.el.setAttribute('aria-label', t('preview.aria'));

    const head = document.createElement('div');
    head.className = 'preview-head';
    const title = document.createElement('span');
    title.className = 'preview-title';
    title.textContent = model.title;
    const free = document.createElement('span');
    free.className = 'preview-free';
    free.textContent = model.free;
    head.append(title, free);
    if (options.interactive && options.onClose) {
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'preview-close';
      close.textContent = '×';
      close.setAttribute('aria-label', t('common.close'));
      close.addEventListener('click', () => options.onClose?.());
      head.appendChild(close);
    }
    if (model.warning) {
      const warning = document.createElement('span');
      warning.className = 'preview-warning';
      warning.textContent = model.warning;
      head.appendChild(warning);
    }
    this.el.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'preview-grid';
    const columns =
      model.rows.length <= 1
        ? 1
        : window.innerWidth < 1200
          ? Math.min(2, model.rows.length)
          : model.rows.length;
    grid.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    for (const row of model.rows) {
      const card = document.createElement('div');
      card.className = `preview-row tone-${row.tone}${row.best ? ' best' : ''}`;
      if (options.interactive && row.base) {
        card.classList.add('interactive');
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', row.status);
        card.addEventListener('click', () => options.onPick?.(row.base as Base));
        card.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            options.onPick?.(row.base as Base);
          }
        });
      }

      const base = document.createElement('span');
      base.className = 'preview-base';
      base.textContent = row.base ?? '−';
      base.style.color = row.base ? baseColor(row.base) : COLORS.dim;
      card.appendChild(base);

      const canvas = document.createElement('canvas');
      const w = 64;
      const h = 40;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.setAttribute('aria-hidden', 'true');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        paintPreviewCreature(ctx, w, h, row.phenotype);
      }
      card.appendChild(canvas);

      const main = document.createElement('div');
      main.className = 'preview-main';
      const chain = document.createElement('div');
      chain.className = 'preview-chain';
      chain.textContent = row.chain;
      chain.title = row.chain;
      const status = document.createElement('div');
      status.className = 'preview-status';
      status.textContent = row.status;
      main.append(chain, status);
      card.appendChild(main);
      grid.appendChild(card);
    }
    this.el.appendChild(grid);
  }
}

function baseColor(base: Base): string {
  switch (base) {
    case 'A':
      return '#f2b24b';
    case 'U':
      return '#46c8b2';
    case 'G':
      return '#a58bf0';
    case 'C':
      return '#ef7d9b';
    default: {
      const _never: never = base;
      void _never;
      return COLORS.ink;
    }
  }
}

function paintPreviewCreature(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  phen: Phenotype | null,
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(110, 160, 185, 0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(4, h - 3.5);
  ctx.lineTo(w - 4, h - 3.5);
  ctx.stroke();
  if (!phen || phen.parts.length === 0) {
    ctx.fillStyle = 'rgba(150, 180, 195, 0.16)';
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.arc(w / 2 + Math.sin(i * 2.1) * 9, h / 2 - 2 + Math.cos(i * 1.7) * 6, 5 + i * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  const layout = buildCreature(phen);
  const scale = Math.min((w - 10) / Math.max(1, layout.L), (h - 6) / (layout.H * 2.4), 1);
  drawCreature(ctx, layout, w / 2, h - 5, scale, {
    now: performance.now(),
    running: false,
    runPhase: 0.18,
    growth: () => 1,
    alpha: 1,
    tilt: 0,
    pointer: null,
  });
}
