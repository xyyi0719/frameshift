/**
 * HUD（B 负责，DOM）。
 * ---------------------------------------------------------------
 * 关卡名 / 目标 / 剩余额度 / 工具栏 / 关键属性 / 静音 / 图例 / 语言。
 * 所有可见文字都走 i18n，切换语言时由 refreshLanguage() 原地重绘。
 */

import type { EditOp, Level, Phenotype, StatKey } from '../core';
import { COLORS } from './theme';
import type { Lang } from './i18n';
import {
  getLanguage,
  levelName,
  levelObjective,
  levelSpecies,
  levelTarget,
  statLabel,
  t,
} from './i18n';

export interface HudCallbacks {
  onMode: (mode: EditOp) => void;
  onUndo: () => void;
  onReset: () => void;
  onRun: () => void;
  onToggleMute: () => void;
  onToggleLegend: () => void;
  onHelp: () => void;
  onHint: () => void;
  onLanguage: (lang: Lang) => void;
}

export type RunUiState = 'ready' | 'invalid' | 'running' | 'failed' | 'passed';

export class Hud {
  private readonly root: HTMLElement;
  private readonly callbacks: HudCallbacks;
  private readonly logoEl: HTMLElement;
  private readonly levelEl: HTMLElement;
  private readonly nameEl: HTMLElement;
  private readonly speciesEl: HTMLElement;
  private readonly targetLabelEl: HTMLElement;
  private readonly objectiveEl: HTMLElement;
  private readonly targetEl: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly modesEl: HTMLElement;
  private readonly budgetEl: HTMLElement;
  private readonly budgetLabelEl: HTMLElement;
  private readonly modeButtons: Map<EditOp, HTMLButtonElement> = new Map();
  private readonly undoBtn: HTMLButtonElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly runBtn: HTMLButtonElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly legendBtn: HTMLButtonElement;
  private readonly helpBtn: HTMLButtonElement;
  private readonly hintBtn: HTMLButtonElement;
  private readonly langSwitch: HTMLElement;
  private readonly langButtons: HTMLButtonElement[];

  private level: Level | null = null;
  private mode: EditOp = 'insert';
  private runState: RunUiState = 'ready';
  private phenotype: Phenotype | null = null;
  private statKeys: readonly StatKey[] = [];
  private editsUsed = 0;
  private par = 0;
  private overPar = false;
  private muted = false;
  private undoEnabled = false;
  private legendOpen = true;
  private hintAttention = false;

  constructor(root: HTMLElement, callbacks: HudCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.innerHTML = `
      <div class="hud-brand">
        <div class="hud-logo"></div>
        <div class="hud-title"><span class="hud-level">L01</span><span class="hud-name">—</span></div>
        <div class="hud-species">—</div>
      </div>
      <div class="hud-target">
        <div class="hud-target-line"><span class="hud-target-label"></span><p class="hud-objective">—</p></div>
        <p class="hud-target-text">—</p>
        <div class="hud-stats" aria-live="polite"></div>
      </div>
      <div class="hud-tools">
        <div class="hud-budget"><span class="budget-label"></span></div>
        <div class="hud-modes" role="group">
          <button type="button" data-mode="insert"></button>
          <button type="button" data-mode="delete"></button>
          <button type="button" data-mode="replace"></button>
        </div>
        <div class="hud-actions">
          <button type="button" class="hud-undo"></button>
          <button type="button" class="hud-reset"></button>
        </div>
        <button type="button" class="hud-run"></button>
        <button type="button" class="hud-hint"></button>
        <button type="button" class="hud-icon hud-help" aria-label="">?</button>
        <button type="button" class="hud-icon hud-mute"></button>
        <button type="button" class="hud-icon hud-legend-toggle">▤</button>
        <div class="lang-switch" role="group">
          <button type="button" data-lang="en">EN</button>
          <span class="lang-sep">|</span>
          <button type="button" data-lang="zh">中文</button>
        </div>
      </div>
    `;
    this.logoEl = root.querySelector('.hud-logo') as HTMLElement;
    this.levelEl = root.querySelector('.hud-level') as HTMLElement;
    this.nameEl = root.querySelector('.hud-name') as HTMLElement;
    this.speciesEl = root.querySelector('.hud-species') as HTMLElement;
    this.targetLabelEl = root.querySelector('.hud-target-label') as HTMLElement;
    this.objectiveEl = root.querySelector('.hud-objective') as HTMLElement;
    this.targetEl = root.querySelector('.hud-target-text') as HTMLElement;
    this.statsEl = root.querySelector('.hud-stats') as HTMLElement;
    this.modesEl = root.querySelector('.hud-modes') as HTMLElement;
    this.budgetEl = root.querySelector('.hud-budget') as HTMLElement;
    this.budgetLabelEl = root.querySelector('.budget-label') as HTMLElement;

    root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
      const mode = btn.dataset.mode as EditOp;
      this.modeButtons.set(mode, btn);
      btn.addEventListener('click', () => this.callbacks.onMode(mode));
    });
    this.undoBtn = root.querySelector('.hud-undo') as HTMLButtonElement;
    this.resetBtn = root.querySelector('.hud-reset') as HTMLButtonElement;
    this.runBtn = root.querySelector('.hud-run') as HTMLButtonElement;
    this.muteBtn = root.querySelector('.hud-mute') as HTMLButtonElement;
    this.legendBtn = root.querySelector('.hud-legend-toggle') as HTMLButtonElement;
    this.helpBtn = root.querySelector('.hud-help') as HTMLButtonElement;
    this.hintBtn = root.querySelector('.hud-hint') as HTMLButtonElement;
    this.langSwitch = root.querySelector('.lang-switch') as HTMLElement;
    this.langButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-lang]')];

    this.undoBtn.addEventListener('click', () => this.callbacks.onUndo());
    this.resetBtn.addEventListener('click', () => this.callbacks.onReset());
    this.runBtn.addEventListener('click', () => this.callbacks.onRun());
    this.muteBtn.addEventListener('click', () => this.callbacks.onToggleMute());
    this.legendBtn.addEventListener('click', () => this.callbacks.onToggleLegend());
    this.helpBtn.addEventListener('click', () => this.callbacks.onHelp());
    this.hintBtn.addEventListener('click', () => this.callbacks.onHint());
    this.langButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const lang = btn.dataset.lang;
        if (lang === 'en' || lang === 'zh') this.callbacks.onLanguage(lang);
      });
    });

    document.documentElement.style.setProperty('--accent', COLORS.accent);
    this.refreshLanguage();
  }

  /** 语言切换后重新套用所有静态/缓存文案。 */
  refreshLanguage(): void {
    const lang = getLanguage();
    document.documentElement.dataset.uiLang = lang;
    this.logoEl.textContent = t('app.brand');
    this.targetLabelEl.textContent = t('hud.target');
    this.modesEl.setAttribute('aria-label', t('hud.toolsAria'));
    this.statsEl.setAttribute('aria-label', t('hud.statsAria'));
    this.budgetEl.title = t('hud.editsTitle');
    this.budgetLabelEl.title = t('hud.editsTitle');
    this.undoBtn.title = t('hud.undoTitle');
    this.resetBtn.title = t('hud.resetTitle');
    this.undoBtn.textContent = t('common.undo');
    this.resetBtn.textContent = t('common.reset');
    this.helpBtn.setAttribute('aria-label', t('hud.help'));
    this.helpBtn.title = t('hud.help');
    this.hintBtn.textContent = t('hud.hint');
    this.hintBtn.title = t('hud.hintTitle');
    this.hintBtn.setAttribute('aria-label', t('hud.hintTitle'));
    this.legendBtn.setAttribute('aria-label', t('hud.legendAria'));
    this.legendBtn.title = t('hud.legendToggle');
    this.langSwitch.setAttribute('aria-label', t('app.chooseLanguage'));
    this.langButtons.forEach((btn) => {
      const active = btn.dataset.lang === lang;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
      btn.setAttribute('aria-label', `${t('app.language')}: ${btn.textContent ?? ''}`);
    });
    this.renderMute();
    for (const [mode, btn] of this.modeButtons) {
      btn.textContent = t(`hud.${mode}`);
      if (this.level) {
        const allowed = this.level.ops.includes(mode);
        const titleKey =
          mode === 'insert'
            ? 'hud.modeInsertTitle'
            : mode === 'delete'
              ? 'hud.modeDeleteTitle'
              : 'hud.modeReplaceTitle';
        btn.title = allowed ? t(titleKey) : `${t(titleKey)} · ${t('hud.modeLockedLater')}`;
      }
    }
    this.renderLevel();
    this.renderStats();
    this.renderRun();
    this.renderUndo();
    this.renderLegend();
    this.renderEdits();
  }

  setLevel(level: Level): void {
    this.level = level;
    this.levelEl.textContent = `L${String(level.number).padStart(2, '0')}`;
    this.renderLevel();
    for (const [mode, btn] of this.modeButtons) {
      const allowed = level.ops.includes(mode);
      btn.disabled = !allowed;
      btn.classList.toggle('locked', !allowed);
      const titleKey =
        mode === 'insert'
          ? 'hud.modeInsertTitle'
          : mode === 'delete'
            ? 'hud.modeDeleteTitle'
            : 'hud.modeReplaceTitle';
      btn.title = allowed ? t(titleKey) : `${t(titleKey)} · ${t('hud.modeLockedLater')}`;
    }
  }

  private renderLevel(): void {
    if (!this.level) return;
    this.nameEl.textContent = levelName(this.level);
    this.speciesEl.textContent = levelSpecies(this.level);
    this.objectiveEl.textContent = levelObjective(this.level);
    const target = levelTarget(this.level);
    this.targetEl.textContent = target;
    this.targetEl.title = target;
    this.levelEl.title = `${levelName(this.level)} · ${levelSpecies(this.level)}`;
  }

  setEdits(used: number, par: number, overPar: boolean): void {
    this.editsUsed = used;
    this.par = par;
    this.overPar = overPar;
    this.renderEdits();
  }

  private renderEdits(): void {
    this.budgetLabelEl.innerHTML = '';
    const editsWord = document.createElement('span');
    editsWord.className = 'budget-word';
    editsWord.textContent = t('hud.edits');
    const used = document.createElement('b');
    used.className = 'budget-used';
    used.textContent = String(this.editsUsed);
    const sep = document.createElement('span');
    sep.className = 'budget-sep';
    sep.textContent = '·';
    const parWord = document.createElement('span');
    parWord.className = 'budget-word';
    parWord.textContent = t('hud.par');
    const parValue = document.createElement('b');
    parValue.className = 'budget-par';
    parValue.textContent = String(this.par);
    this.budgetLabelEl.append(editsWord, used, sep, parWord, parValue);
    if (this.overPar) {
      const over = document.createElement('span');
      over.className = 'over-par-tag';
      over.textContent = t('hud.overPar');
      this.budgetLabelEl.appendChild(over);
    }
    this.root.dataset.overPar = this.overPar ? 'true' : 'false';
    this.budgetEl.title = this.overPar ? t('hud.overPar') : t('hud.editsTitle');
    this.budgetLabelEl.classList.toggle('over', this.overPar);
  }

  setMode(mode: EditOp): void {
    this.mode = mode;
    for (const [m, btn] of this.modeButtons) {
      btn.classList.toggle('active', m === mode);
      btn.setAttribute('aria-pressed', String(m === mode));
    }
  }

  setUndoEnabled(enabled: boolean): void {
    this.undoEnabled = enabled;
    this.renderUndo();
  }

  private renderUndo(): void {
    this.undoBtn.disabled = !this.undoEnabled;
    this.undoBtn.classList.toggle('is-disabled', !this.undoEnabled);
  }

  /** 删除后让 UNDO 发一下光，提醒「撤销免费」。 */
  flashUndo(): void {
    this.undoBtn.classList.remove('flash');
    void this.undoBtn.offsetWidth;
    this.undoBtn.classList.add('flash');
    window.setTimeout(() => this.undoBtn.classList.remove('flash'), 1000);
  }

  setStats(phenotype: Phenotype, keys: readonly StatKey[]): void {
    this.phenotype = phenotype;
    this.statKeys = keys;
    this.renderStats();
  }

  private renderStats(): void {
    this.statsEl.innerHTML = '';
    if (!this.phenotype) return;
    for (const key of this.statKeys) {
      const value = this.phenotype.stats[key];
      const chip = document.createElement('span');
      chip.className = 'stat-chip' + (value === 0 ? ' zero' : '');
      const keyEl = document.createElement('span');
      keyEl.className = 'stat-key';
      keyEl.textContent = statLabel(key);
      const valEl = document.createElement('span');
      valEl.className = 'stat-val';
      valEl.textContent = String(value);
      chip.append(keyEl, valEl);
      this.statsEl.appendChild(chip);
    }
  }

  setRunState(state: RunUiState): void {
    this.runState = state;
    this.root.dataset.runState = state;
    this.renderRun();
  }

  private renderRun(): void {
    this.runBtn.classList.remove('running', 'failed', 'passed');
    switch (this.runState) {
      case 'ready':
        this.runBtn.textContent = t('common.run');
        this.runBtn.disabled = false;
        break;
      case 'invalid':
        this.runBtn.textContent = t('common.run');
        this.runBtn.disabled = true;
        break;
      case 'running':
        this.runBtn.textContent = t('common.running');
        this.runBtn.disabled = true;
        this.runBtn.classList.add('running');
        break;
      case 'failed':
        this.runBtn.textContent = t('common.retry');
        this.runBtn.disabled = false;
        this.runBtn.classList.add('failed');
        break;
      case 'passed':
        this.runBtn.textContent = t('common.cleared');
        this.runBtn.disabled = true;
        this.runBtn.classList.add('passed');
        break;
      default: {
        const _never: never = this.runState;
        void _never;
      }
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.renderMute();
  }

  private renderMute(): void {
    this.muteBtn.textContent = this.muted ? '×' : '♪';
    this.muteBtn.classList.toggle('muted', this.muted);
    const label = this.muted ? t('hud.unmute') : t('hud.mute');
    this.muteBtn.setAttribute('aria-label', label);
    this.muteBtn.title = label;
  }

  setHintAttention(on: boolean): void {
    this.hintAttention = on;
    this.hintBtn.classList.toggle('attention', on);
  }

  setLegendOpen(open: boolean): void {
    this.legendOpen = open;
    this.renderLegend();
  }

  private renderLegend(): void {
    this.legendBtn.classList.toggle('active', this.legendOpen);
    this.legendBtn.setAttribute('aria-pressed', String(this.legendOpen));
  }

  getMode(): EditOp {
    return this.mode;
  }

  getRunState(): RunUiState {
    return this.runState;
  }

  getLevel(): Level | null {
    return this.level;
  }
}
