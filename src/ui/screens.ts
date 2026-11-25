/**
 * 多页面视图与画面转场系统（P-035）
 * ---------------------------------------------------------------
 * 1. TitleScreen       ：主页面（全屏 3D 展示台 + 开始装配 / 直接选关）
 * 2. LevelSelectScreen ：关卡目录页（1~6 关目录卡片 + 锁定预告 + 返回装配）
 * 3. ScreenTransition  ：统一的斜切幕布淡入淡出 + 关卡标题卡转场
 */

import { LEVEL_DIRECTORY, PART_BY_ID, type LevelDirectoryItem } from '../core';
import { el } from './dom';

/* ==========================================================================
 * 1. 画面切换转场层
 * ========================================================================== */

export class ScreenTransition {
  readonly el: HTMLElement;
  private readonly labelEl: HTMLElement;
  private readonly subEl: HTMLElement;
  private busy = false;

  constructor(host: HTMLElement) {
    this.el = el('div', 'screen-transition');
    const card = el('div', 'transition-card');
    this.labelEl = el('div', 'transition-title', '');
    this.subEl = el('div', 'transition-sub', '');
    card.append(this.labelEl, this.subEl);
    this.el.append(card);
    host.appendChild(this.el);
  }

  run(
    onMidpoint: () => void,
    banner?: { title: string; subtitle: string; holdMs?: number },
  ): void {
    if (this.busy) {
      onMidpoint();
      return;
    }
    this.busy = true;
    this.labelEl.textContent = banner?.title ?? '';
    this.subEl.textContent = banner?.subtitle ?? '';
    this.el.classList.toggle('with-banner', Boolean(banner));
    this.el.classList.add('active');

    window.setTimeout(() => {
      onMidpoint();
      const hold = banner?.holdMs ?? 120;
      window.setTimeout(() => {
        this.el.classList.remove('active');
        window.setTimeout(() => {
          this.busy = false;
        }, 280);
      }, hold);
    }, 240);
  }
}

/* ==========================================================================
 * 2. 主页面（Title Screen）
 * ========================================================================== */

export interface TitleCallbacks {
  onStartAssembly: () => void;
  onGoLevelSelect: () => void;
  onResetRun: () => void;
}

export class TitleScreen {
  readonly el: HTMLElement;
  private readonly statusEl: HTMLElement;

  constructor(host: HTMLElement, cb: TitleCallbacks) {
    this.el = el('section', 'title-screen');

    const topBadge = el('div', 'title-pill', '3D 跨物种拼装 · 单机肉鸽闯关 DEMO');
    const hero = el('div', 'title-hero');
    const heading = el('h1', 'title-logo', '拼装小鸡');
    const eng = el('div', 'title-eng', 'BUILD-A-CHICK');
    const sub = el(
      'p',
      'title-tagline',
      '从单细胞生物到机械改造怪——装上其他动物与机械的零件，用键盘跃入 2.5D 立体战场！',
    );
    hero.append(topBadge, heading, eng, sub);

    const actions = el('div', 'title-actions');
    const startBtn = el('button', 'btn primary title-start-btn', '开始游戏 · 进入装配');
    startBtn.type = 'button';
    startBtn.addEventListener('click', () => cb.onStartAssembly());

    const selectBtn = el('button', 'btn ghost title-sec-btn', '选择关卡（1 ~ 6）');
    selectBtn.type = 'button';
    selectBtn.addEventListener('click', () => cb.onGoLevelSelect());

    const resetBtn = el('button', 'btn ghost title-sec-btn', '重置肉鸽存档');
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', () => cb.onResetRun());

    actions.append(startBtn, selectBtn, resetBtn);

    this.statusEl = el('div', 'title-status', '按 F3 可随时查看性能 · 电脑端键盘游玩');
    this.el.append(hero, actions, this.statusEl);
    host.appendChild(this.el);
  }

  setSummary(ownedCount: number, stage1Cleared: boolean): void {
    this.statusEl.textContent = stage1Cleared
      ? `已通关第 1 关 · 当前已收集 ${ownedCount} / 36 件动物与机械零件 · 按 F3 查看性能`
      : `肉鸽新局已就绪 · 已收集 ${ownedCount} / 36 件零件 · 路线：主页面 → 装配 → 选关 → 闯关`;
  }

  setVisible(visible: boolean): void {
    this.el.hidden = !visible;
  }
}

/* ==========================================================================
 * 3. 关卡目录选择页（1 ~ 6 关）
 * ========================================================================== */

export interface LevelSelectCallbacks {
  onBackToAssembly: () => void;
  onBackToTitle: () => void;
  onEnterLevel: (level: LevelDirectoryItem) => void;
}

export class LevelSelectScreen {
  readonly el: HTMLElement;
  private readonly gridEl: HTMLElement;
  private readonly chickBriefEl: HTMLElement;

  constructor(host: HTMLElement, private readonly cb: LevelSelectCallbacks) {
    this.el = el('section', 'level-select-screen');
    this.el.hidden = true;

    const header = el('div', 'level-select-head');
    const navLeft = el('div', 'level-select-nav');
    const backAsm = el('button', 'btn ghost', '← 返回装配车间');
    backAsm.type = 'button';
    backAsm.addEventListener('click', () => cb.onBackToAssembly());
    const backHome = el('button', 'btn ghost', '主页面');
    backHome.type = 'button';
    backHome.addEventListener('click', () => cb.onBackToTitle());
    navLeft.append(backAsm, backHome);

    const titleBox = el('div', 'level-select-title-box');
    titleBox.append(
      el('div', 'eyebrow', 'STAGE DIRECTORY · 选择闯关地图'),
      el('h2', 'level-select-title', '演化闯关目录（1 ~ 6）'),
    );

    this.chickBriefEl = el('div', 'level-chick-brief', '当前出战小鸡已就绪');
    header.append(navLeft, titleBox, this.chickBriefEl);

    this.gridEl = el('div', 'level-grid');
    this.el.append(header, this.gridEl);
    host.appendChild(this.el);
  }

  render(briefText: string, stage1Cleared: boolean): void {
    this.chickBriefEl.textContent = briefText;
    this.gridEl.replaceChildren();

    for (const item of LEVEL_DIRECTORY) {
      const card = el('div', `level-card ${item.unlocked ? 'unlocked' : 'locked'}`);
      const stripe = el('div', 'level-card-stripe');
      stripe.style.background = item.themeColor;

      const top = el('div', 'level-card-top');
      const num = el('span', 'level-num', String(item.number).padStart(2, '0'));
      const badgeText = item.number === 1 && stage1Cleared ? '✓ 已通关 · 可重刷' : item.badge;
      const badge = el('span', `level-badge ${item.unlocked ? 'open' : 'lock'}`, badgeText);
      top.append(num, badge);

      const name = el('h3', 'level-name', item.name);
      const sub = el('div', 'level-sub', item.subtitle);

      const enemies = el('div', 'level-meta-row');
      enemies.append(el('span', 'level-meta-label', '遭遇'));
      for (const en of item.enemiesPreview) {
        enemies.append(el('span', 'level-chip enemy', en));
      }

      const drops = el('div', 'level-meta-row');
      drops.append(el('span', 'level-meta-label', '掉落'));
      for (const id of item.dropsPreview) {
        const def = PART_BY_ID[id];
        if (def) drops.append(el('span', 'level-chip drop', def.name.zh));
      }

      const foot = el('div', 'level-card-foot');
      const enterBtn = el(
        'button',
        item.unlocked ? 'btn primary level-enter-btn' : 'btn ghost level-enter-btn',
        item.unlocked ? `进入第 ${item.number} 关 →` : '🔒 敬请期待',
      );
      enterBtn.type = 'button';
      enterBtn.disabled = !item.unlocked;
      enterBtn.addEventListener('click', () => this.cb.onEnterLevel(item));
      foot.append(enterBtn);

      card.append(stripe, top, name, sub, enemies, drops, foot);
      this.gridEl.append(card);
    }
  }

  setVisible(visible: boolean): void {
    this.el.hidden = !visible;
  }
}
