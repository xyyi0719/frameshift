/**
 * 精简版部位内造型微调面板（P-006, P-015, P-028）
 * ---------------------------------------------------------------
 * 支持选中任意已装部位调节：位移 X/Y/Z、旋转角度、缩放大小、恢复默认。
 * 明确提示：首轮微调仅影响造型美观，不影响战斗数值与判定。
 */

import { defaultTweak, type SlotId, type SlotTweak } from '../core';
import { el } from './dom';
import { t } from './strings';

export interface TweakCallbacks {
  onChange: (slot: SlotId, tweak: SlotTweak) => void;
  onReset: (slot: SlotId) => void;
  onClose: () => void;
}

export class TweakPanel {
  readonly el: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private activeSlot: SlotId | null = null;
  private current: SlotTweak = defaultTweak();

  constructor(host: HTMLElement, private readonly cb: TweakCallbacks) {
    this.el = el('section', 'tweak-panel');
    this.el.hidden = true;

    const head = el('div', 'tweak-head');
    this.titleEl = el('span', 'tweak-title', '造型微调');
    const btns = el('div', 'tweak-head-actions');
    const resetBtn = el('button', 'tweak-reset', '恢复默认');
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', () => {
      if (!this.activeSlot) return;
      this.current = defaultTweak();
      this.renderSliders();
      this.cb.onReset(this.activeSlot);
    });
    const closeBtn = el('button', 'tweak-close', '×');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => {
      this.close();
      this.cb.onClose();
    });
    btns.append(resetBtn, closeBtn);
    head.append(this.titleEl, btns);

    const note = el('p', 'tweak-note', '仅调整 3D 造型美观，不影响战斗数值');
    this.bodyEl = el('div', 'tweak-sliders');

    this.el.append(head, note, this.bodyEl);
    host.appendChild(this.el);
  }

  open(slot: SlotId, tweak?: SlotTweak): void {
    this.activeSlot = slot;
    this.current = tweak
      ? {
          offset: [...tweak.offset] as [number, number, number],
          rotation: [...tweak.rotation] as [number, number, number],
          scale: tweak.scale,
        }
      : defaultTweak();
    const slotName = t(`slot.${slot}.full` as 'slot.body.full');
    this.titleEl.textContent = `微调 · ${slotName}`;
    this.renderSliders();
    this.el.hidden = false;
  }

  close(): void {
    this.activeSlot = null;
    this.el.hidden = true;
  }

  get slot(): SlotId | null {
    return this.activeSlot;
  }

  private renderSliders(): void {
    this.bodyEl.replaceChildren();
    const addSlider = (
      label: string,
      min: number,
      max: number,
      step: number,
      value: number,
      fmt: (v: number) => string,
      onInput: (v: number) => void,
    ): void => {
      const row = el('label', 'tweak-row');
      const top = el('div', 'tweak-row-top');
      const valEl = el('span', 'tweak-val', fmt(value));
      top.append(el('span', 'tweak-label', label), valEl);
      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'tweak-range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(value);
      input.addEventListener('input', () => {
        const num = Number(input.value);
        valEl.textContent = fmt(num);
        onInput(num);
        if (this.activeSlot) this.cb.onChange(this.activeSlot, this.current);
      });
      row.append(top, input);
      this.bodyEl.append(row);
    };

    addSlider('前后位置 X', -0.4, 0.4, 0.02, this.current.offset[0], (v) => `${v.toFixed(2)}`, (v) => {
      this.current.offset[0] = v;
    });
    addSlider('上下位置 Y', -0.4, 0.4, 0.02, this.current.offset[1], (v) => `${v.toFixed(2)}`, (v) => {
      this.current.offset[1] = v;
    });
    addSlider('左右展宽 Z', -0.35, 0.35, 0.02, this.current.offset[2], (v) => `${v.toFixed(2)}`, (v) => {
      this.current.offset[2] = v;
    });
    addSlider('仰俯角度', -40, 40, 2, this.current.rotation[2], (v) => `${Math.round(v)}°`, (v) => {
      this.current.rotation[2] = v;
    });
    addSlider('偏转朝向', -40, 40, 2, this.current.rotation[1], (v) => `${Math.round(v)}°`, (v) => {
      this.current.rotation[1] = v;
    });
    addSlider('缩放大小', 0.65, 1.4, 0.05, this.current.scale, (v) => `${v.toFixed(2)}×`, (v) => {
      this.current.scale = v;
    });
  }
}
