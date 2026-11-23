/** 右上角性能面板：FPS / draw calls / 三角面 / 零件数 + 压力按钮。 */

import { el } from './dom';
import type { RenderStats } from '../render3d/scene';
import { t } from './strings';

export interface PerfCallbacks {
  onAddLegs: () => void;
  onAddWings: () => void;
  onClear: () => void;
}

export class PerfPanel {
  readonly el: HTMLElement;
  private readonly fpsEl: HTMLElement;
  private readonly callsEl: HTMLElement;
  private readonly trisEl: HTMLElement;
  private readonly partsEl: HTMLElement;
  private readonly worstFpsEl: HTMLElement;
  private readonly peakCallsEl: HTMLElement;
  private readonly peakTrisEl: HTMLElement;
  private open = false;
  private openedAt = 0;
  private worstFps = Infinity;
  private peakCalls = 0;
  private peakTris = 0;
  private lastPaint = 0;

  constructor(host: HTMLElement, private readonly cb: PerfCallbacks) {
    this.el = el('section', 'perf-panel');
    this.el.hidden = true;
    const head = el('div', 'perf-head');
    head.append(el('span', 'perf-title', t('perf.title')));
    const reset = el('button', 'perf-reset', t('button.worstReset'));
    reset.type = 'button';
    reset.addEventListener('click', () => this.resetWorst());
    head.append(reset);
    this.el.append(head);

    const grid = el('div', 'perf-grid');
    this.fpsEl = this.metric(grid, t('perf.fps'), '0');
    this.callsEl = this.metric(grid, t('perf.calls'), '0');
    this.trisEl = this.metric(grid, t('perf.tris'), '0');
    this.partsEl = this.metric(grid, t('perf.parts'), '0');
    this.el.append(grid);

    const worst = el('div', 'perf-worst');
    worst.append(el('div', 'perf-sub', t('perf.worst')));
    this.worstFpsEl = this.metric(worst, t('perf.minFps'), '—');
    this.peakCallsEl = this.metric(worst, t('perf.peakCalls'), '—');
    this.peakTrisEl = this.metric(worst, t('perf.peakTris'), '—');
    this.el.append(worst);

    const stress = el('div', 'perf-stress');
    stress.append(el('div', 'perf-sub', t('perf.stress')));
    const row = el('div', 'perf-buttons');
    const legs = el('button', 'perf-btn accent', t('perf.legs10'));
    legs.type = 'button';
    legs.addEventListener('click', () => this.cb.onAddLegs());
    const wings = el('button', 'perf-btn accent', t('perf.wings5'));
    wings.type = 'button';
    wings.addEventListener('click', () => this.cb.onAddWings());
    const clear = el('button', 'perf-btn', t('perf.clear'));
    clear.type = 'button';
    clear.addEventListener('click', () => this.cb.onClear());
    row.append(legs, wings, clear);
    stress.append(row);
    this.el.append(stress);
    this.el.append(el('p', 'perf-hint', t('perf.hint')));
    host.appendChild(this.el);
  }

  private metric(parent: HTMLElement, label: string, value: string): HTMLElement {
    const box = el('div', 'perf-metric');
    box.append(el('span', 'perf-label', label));
    const v = el('b', 'perf-value', value);
    box.append(v);
    parent.append(box);
    return v;
  }

  toggle(now: number): void {
    this.setOpen(!this.open, now);
  }

  setOpen(open: boolean, now = performance.now()): void {
    this.open = open;
    this.el.hidden = !open;
    if (open) {
      this.openedAt = now;
      this.resetWorst();
      this.el.classList.add('on');
    } else {
      this.el.classList.remove('on');
    }
  }

  get isOpen(): boolean {
    return this.open;
  }

  resetWorst(): void {
    this.worstFps = Infinity;
    this.peakCalls = 0;
    this.peakTris = 0;
  }

  update(stats: RenderStats, parts: number, now: number): void {
    if (!this.open) return;
    if (now - this.openedAt > 700) {
      if (stats.fps > 0.1) this.worstFps = Math.min(this.worstFps, stats.fps);
      this.peakCalls = Math.max(this.peakCalls, stats.calls);
      this.peakTris = Math.max(this.peakTris, stats.triangles);
    }
    if (now - this.lastPaint < 220) return;
    this.lastPaint = now;
    this.fpsEl.textContent = stats.fps.toFixed(0);
    this.callsEl.textContent = String(stats.calls);
    this.trisEl.textContent = stats.triangles > 999 ? `${(stats.triangles / 1000).toFixed(1)}k` : String(stats.triangles);
    this.partsEl.textContent = String(parts);
    this.worstFpsEl.textContent = Number.isFinite(this.worstFps) ? this.worstFps.toFixed(0) : '—';
    this.peakCallsEl.textContent = this.peakCalls > 0 ? String(this.peakCalls) : '—';
    this.peakTrisEl.textContent = this.peakTris > 0 ? (this.peakTris > 999 ? `${(this.peakTris / 1000).toFixed(1)}k` : String(this.peakTris)) : '—';
  }
}
