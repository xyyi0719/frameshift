/** 顶栏属性条（数字滚动，不做平衡）。 */

import type { CreatureStats } from '../core';
import { el } from './dom';
import { t } from './strings';

const KEYS = ['hp', 'atk', 'def', 'spd'] as const;
type Key = (typeof KEYS)[number];

const LABEL: Record<Key, 'stats.hp' | 'stats.atk' | 'stats.def' | 'stats.spd'> = {
  hp: 'stats.hp',
  atk: 'stats.atk',
  def: 'stats.def',
  spd: 'stats.spd',
};

export class StatsBar {
  readonly el: HTMLElement;
  private readonly values = new Map<Key, HTMLElement>();
  private readonly fills = new Map<Key, HTMLElement>();
  private readonly shown: Record<Key, number> = { hp: 20, atk: 0, def: 0, spd: 100 };
  private readonly target: Record<Key, number> = { hp: 20, atk: 0, def: 0, spd: 100 };
  private readonly massEl: HTMLElement;
  private mass = 0;
  private capacity = 8;

  constructor(host: HTMLElement) {
    this.el = el('div', 'stats-bar');
    for (const key of KEYS) {
      const chip = el('div', `stat-chip stat-${key}`);
      const top = el('div', 'stat-top');
      top.append(el('span', 'stat-label', t(LABEL[key])));
      const value = el('b', 'stat-value', '0');
      top.append(value);
      const track = el('div', 'stat-track');
      const fill = el('i', 'stat-fill');
      track.append(fill);
      chip.append(top, track);
      this.values.set(key, value);
      this.fills.set(key, fill);
      this.el.append(chip);
    }
    const mass = el('div', 'mass-chip');
    mass.append(el('span', 'mass-label', t('stats.mass')));
    this.massEl = el('b', 'mass-value', '0 / 8');
    mass.append(this.massEl);
    this.el.append(mass);
    host.appendChild(this.el);
  }

  setStats(stats: CreatureStats): void {
    this.target.hp = stats.hp;
    this.target.atk = stats.atk;
    this.target.def = stats.def;
    this.target.spd = stats.spd;
    this.mass = stats.mass;
    this.capacity = stats.capacity;
    this.renderMass();
  }

  private renderMass(): void {
    this.massEl.textContent = `${this.mass} / ${this.capacity}`;
    this.massEl.classList.toggle('over', this.mass > this.capacity);
  }

  update(dt: number): void {
    const k = Math.min(1, dt * 9);
    for (const key of KEYS) {
      const diff = this.target[key] - this.shown[key];
      this.shown[key] = Math.abs(diff) < 0.05 ? this.target[key] : this.shown[key] + diff * k;
      const value = this.values.get(key);
      if (value) value.textContent = String(Math.round(this.shown[key]));
      const fill = this.fills.get(key);
      if (fill) {
        const max = key === 'hp' ? Math.max(40, this.target.hp) : key === 'atk' ? 24 : key === 'def' ? 16 : 220;
        fill.style.width = `${Math.max(3, Math.min(100, (this.shown[key] / max) * 100))}%`;
      }
    }
  }

  refreshLanguage(): void {
    const labels = this.el.querySelectorAll<HTMLElement>('.stat-label');
    labels.forEach((label, i) => {
      const key = KEYS[i];
      if (key) label.textContent = t(LABEL[key]);
    });
    const massLabel = this.el.querySelector<HTMLElement>('.mass-label');
    if (massLabel) massLabel.textContent = t('stats.mass');
  }
}
