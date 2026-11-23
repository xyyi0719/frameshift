/**
 * 贴画布的三步引导（B 负责）。
 * ---------------------------------------------------------------
 * 不做遮罩、不挡画面：只在锚点旁放一个小气泡 + 一个聚焦框。
 * 只对第一关首次进入显示，可跳过；完成后写入 localStorage。
 */

import { t } from './i18n';

export interface AnchorRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CoachStep {
  /** 聚焦框（视口坐标）。 */
  target: AnchorRect;
  title: string;
  body: string;
}

export class Coach {
  private readonly host: HTMLElement;
  private readonly ring: HTMLDivElement;
  private readonly bubble: HTMLDivElement;
  private steps: CoachStep[] = [];
  private index = 0;
  private onDone: () => void = () => {};
  private onStep: (index: number) => void = () => {};

  constructor(host: HTMLElement) {
    this.host = host;
    this.ring = document.createElement('div');
    this.ring.className = 'coach-ring';
    this.ring.hidden = true;
    this.bubble = document.createElement('div');
    this.bubble.className = 'coach-bubble';
    this.bubble.hidden = true;
    this.bubble.setAttribute('role', 'dialog');
    this.bubble.setAttribute('aria-label', t('coach.aria'));
    host.append(this.ring, this.bubble);
  }

  get active(): boolean {
    return !this.bubble.hidden;
  }

  start(
    steps: CoachStep[],
    onDone: () => void,
    onStep: (index: number) => void,
    startIndex = 0,
  ): void {
    this.steps = steps;
    this.index = Math.min(startIndex, Math.max(0, steps.length - 1));
    this.onDone = onDone;
    this.onStep = onStep;
    this.render();
    this.onStep(this.index);
  }

  /** 锚点因滚动/缩放变化时重新对齐。 */
  realign(target: AnchorRect): void {
    if (!this.steps[this.index]) return;
    this.steps[this.index] = { ...this.steps[this.index], target };
    this.render();
  }

  stop(): void {
    this.bubble.hidden = true;
    this.ring.hidden = true;
    this.bubble.innerHTML = '';
  }

  private finish(): void {
    this.stop();
    this.onDone();
  }

  private render(): void {
    const step = this.steps[this.index];
    if (!step) {
      this.stop();
      return;
    }
    const { target } = step;
    this.ring.hidden = false;
    this.ring.style.left = `${target.x - 10}px`;
    this.ring.style.top = `${target.y - 10}px`;
    this.ring.style.width = `${target.w + 20}px`;
    this.ring.style.height = `${target.h + 20}px`;

    this.bubble.hidden = false;
    this.bubble.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'coach-head';
    const stepLabel = document.createElement('span');
    stepLabel.className = 'coach-step';
    stepLabel.textContent = t('coach.step', { n: this.index + 1 });
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'coach-skip';
    skip.textContent = t('coach.skip');
    skip.addEventListener('click', () => this.finish());
    head.append(stepLabel, skip);

    const title = document.createElement('div');
    title.className = 'coach-title';
    title.textContent = step.title;
    const body = document.createElement('p');
    body.className = 'coach-body';
    body.textContent = step.body;
    const actions = document.createElement('div');
    actions.className = 'coach-actions';
    if (this.index > 0) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'coach-back';
      back.textContent = '‹';
      back.setAttribute('aria-label', t('coach.skip'));
      back.addEventListener('click', () => {
        this.index -= 1;
        this.render();
        this.onStep(this.index);
      });
      actions.appendChild(back);
    }
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'coach-next';
    next.textContent = this.index === this.steps.length - 1 ? t('coach.done') : t('coach.next');
    next.addEventListener('click', () => {
      if (this.index >= this.steps.length - 1) {
        this.finish();
        return;
      }
      this.index += 1;
      this.render();
      this.onStep(this.index);
    });
    actions.appendChild(next);
    this.bubble.append(head, title, body, actions);

    this.position(target);
  }

  private position(target: AnchorRect): void {
    const pad = 14;
    const bw = this.bubble.offsetWidth || 260;
    const bh = this.bubble.offsetHeight || 120;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = target.x + target.w / 2 - bw / 2;
    left = Math.max(pad, Math.min(vw - bw - pad, left));
    let top = target.y + target.h + 18;
    if (top + bh > vh - pad) top = Math.max(pad, target.y - bh - 14);
    this.bubble.style.left = `${left}px`;
    this.bubble.style.top = `${top}px`;
    this.bubble.dataset.placement = top > target.y ? 'below' : 'above';
  }
}

/** 文案键 → 步骤（锚点在外部算）。 */
export function coachStepTexts(): { title: string; body: string }[] {
  return [1, 2, 3].map((n) => ({
    title: t(`coach.step${n}.title` as 'coach.step1.title'),
    body: t(`coach.step${n}.body` as 'coach.step1.body'),
  }));
}
