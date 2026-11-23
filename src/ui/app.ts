/**
 * 应用装配（B 负责）。
 * ---------------------------------------------------------------
 * 唯一可变状态是 A 的 Session。这里只做：
 *   Session 事件 → 动画/音效/DOM 更新；
 *   用户操作 → Session 方法。
 * 不重算解码、分组、零件、表型或判定。
 */

import {
  MAX_SEQUENCE_LENGTH,
  Session,
  decode,
  diffGenes,
  judge,
  phenotype as derivePhenotype,
  type Base,
  type Edit,
  type EditOp,
  type EditRejection,
  type EditRequest,
  type Gene,
  type GeneDiff,
  type GeneIssue,
  type Judgement,
  type Level,
  type Phenotype,
  type SessionEvent,
} from '../core';
import { LEVELS } from '../levels';
import { GeneRibbon } from './ribbon';
import { Stage } from './stage';
import { Hud } from './hud';
import { Legend } from './legend';
import { Sound } from './audio';
import { buildCreature, drawCreature } from './creature';
import { BASE_COLORS, COLORS } from './theme';
import { prefersReducedMotion } from './anim';
import {
  getLanguage,
  initLanguage,
  levelHint,
  levelIntro,
  levelName,
  levelSpecies,
  levelTarget,
  partLabel,
  setLanguage,
  statLabel,
  t,
  type Lang,
} from './i18n';

interface BestiaryEntry {
  levelId: string;
  seq: string;
  species: string;
  at: number;
}

const BESTIARY_KEY = 'frameshift.bestiary.v1';
const GUIDE_KEY = 'frameshift.guided.v1';

export class App {
  private readonly root: HTMLElement;
  private session: Session;
  private level: Level;
  private levelIndex = 0;
  private currentGene: Gene;
  private currentPhenotype: Phenotype;
  private currentJudgement: Judgement;

  private readonly hud: Hud;
  private readonly ribbon: GeneRibbon;
  private readonly stage: Stage;
  private readonly legend: Legend;
  private readonly sound = new Sound();

  private readonly toastEl: HTMLElement;
  private readonly noteEl: HTMLElement;
  private readonly briefEl: HTMLElement;
  private readonly modalEl: HTMLElement;
  private readonly guideEl: HTMLElement;

  private unsubscribe: (() => void) | null = null;
  private toastTimer = 0;
  private noteTimer = 0;
  private noteToken = 0;
  private briefToken = 0;
  private briefTimer = 0;
  private raf = 0;
  private legendOpen = true;
  private guideStep = 0;
  private reduced = prefersReducedMotion();
  private failHintToken = 0;
  private bestiary: BestiaryEntry[] = [];
  private debugEl: HTMLPreElement | null = null;
  private lastResult: Judgement | null = null;

  constructor(root: HTMLElement) {
    initLanguage();
    this.root = root;
    installFavicon();
    root.classList.add('app-shell');
    root.innerHTML = `
      <header id="hud" class="hud"></header>
      <section id="gene-ribbon" class="ribbon"></section>
      <main id="stage" class="stage">
        <div class="stage-top">
          <div id="stage-brief" class="stage-brief" hidden></div>
        </div>
        <div class="stage-bottom">
          <div id="stage-note" class="stage-note" hidden><span class="note-mark"></span><span class="note-text"></span></div>
        </div>
      </main>
      <aside id="legend" class="legend"></aside>
      <div id="toast" class="toast" role="status" aria-live="polite"></div>
      <div id="modal-root" class="modal-root" hidden></div>
      <div id="guide" class="guide" hidden></div>
    `;

    const hudHost = root.querySelector('#hud') as HTMLElement;
    const ribbonHost = root.querySelector('#gene-ribbon') as HTMLElement;
    const stageHost = root.querySelector('#stage') as HTMLElement;
    const legendHost = root.querySelector('#legend') as HTMLElement;
    this.toastEl = root.querySelector('#toast') as HTMLElement;
    this.noteEl = root.querySelector('#stage-note') as HTMLElement;
    this.briefEl = root.querySelector('#stage-brief') as HTMLElement;
    this.modalEl = root.querySelector('#modal-root') as HTMLElement;
    this.guideEl = root.querySelector('#guide') as HTMLElement;

    this.level = LEVELS[0];
    this.session = new Session(this.level);
    this.currentGene = this.session.gene;
    this.currentPhenotype = this.session.phenotype;
    this.currentJudgement = this.session.judge();

    this.hud = new Hud(hudHost, {
      onMode: (mode) => this.setMode(mode),
      onUndo: () => this.undo(),
      onReset: () => this.reset(),
      onRun: () => this.run(),
      onToggleMute: () => this.toggleMute(),
      onToggleLegend: () => this.toggleLegend(),
      onHelp: () => this.openGuide(),
      onLanguage: (lang) => this.changeLanguage(lang),
    });

    this.legend = new Legend(legendHost);
    this.loadBestiary();

    this.ribbon = new GeneRibbon(ribbonHost, this.level, this.currentGene, {
      onEdit: (req) => this.performEdit(req),
      onUndo: () => this.undo(),
      onReset: () => this.reset(),
      onRun: () => this.run(),
      onModeChange: (mode) => this.hud.setMode(mode),
      onHoverPart: (index) => this.stage.setHighlightPart(index),
      onEscape: () => this.closeGuide(),
    });

    this.stage = new Stage(stageHost, this.level, this.currentPhenotype, {
      onPass: (j) => this.handlePass(j),
      onFail: (j) => this.handleFail(j),
    });

    this.hud.setMuted(this.sound.isMuted());
    this.hud.setLegendOpen(true);
    this.ribbon.setReducedMotion(this.reduced);
    this.stage.setReducedMotion(this.reduced);
    this.applyLevelUi();
    this.subscribe();
    this.applyDocumentLanguage();
    this.renderBestiary();
    this.showBrief();
    this.maybeShowGuide();
    this.updateDebug();

    this.raf = requestAnimationFrame(this.frame);
    this.bindGlobal();
  }

  /* ==========================================================================
   * 语言
   * ========================================================================== */

  private applyDocumentLanguage(): void {
    const lang = getLanguage();
    document.documentElement.lang = lang;
    document.documentElement.dataset.uiLang = lang;
    document.title = t('app.title');
    const ribbonHost = this.root.querySelector('#gene-ribbon');
    if (ribbonHost) ribbonHost.setAttribute('aria-label', t('ribbon.aria'));
    const legendHost = this.root.querySelector('#legend');
    if (legendHost) legendHost.setAttribute('aria-label', t('legend.title'));
  }

  private changeLanguage(lang: Lang): void {
    if (lang === getLanguage()) {
      this.hud.refreshLanguage();
      return;
    }
    setLanguage(lang);
    this.applyDocumentLanguage();
    this.hud.refreshLanguage();
    this.legend.refresh();
    this.legend.setGene(this.currentGene);
    this.renderBestiary();
    this.ribbon.refreshLanguage();
    this.stage.refreshLanguage();
    if (!this.modalEl.hidden && this.lastResult) this.showResultCard(this.lastResult);
    if (!this.guideEl.hidden) this.renderGuide();
    this.refreshNoteForLanguage();
    this.hideToast();
    this.updateDebug();
    this.sound.play('click');
  }

  /** 切换语言后，把当前可见的行内提示按新语言重画。 */
  private refreshNoteForLanguage(): void {
    if (!this.briefEl.hidden) this.showBrief();
    if (this.noteEl.hidden) return;
    const kind = this.noteEl.dataset.kind;
    if (kind === 'bad') {
      this.syncIssueNote(this.currentGene);
    } else if (kind === 'hint') {
      this.showNote(t('state.hint', { hint: levelHint(this.level) }), 'hint', true);
    } else if (kind === 'info') {
      this.clearNote();
    }
  }

  openGuide(): void {
    this.guideStep = 0;
    this.guideEl.hidden = false;
    this.renderGuide();
    this.sound.play('click');
  }

  /* ==========================================================================
   * 帧循环
   * ========================================================================== */

  private readonly frame = (now: number): void => {
    this.ribbon.render(now);
    this.stage.render(now);
    this.raf = requestAnimationFrame(this.frame);
  };

  private bindGlobal(): void {
    window.addEventListener('resize', () => {
      // canvas 各自用 ResizeObserver；这里只处理图例抽屉的极端尺寸。
      if (window.innerWidth < 720 && this.legendOpen) {
        // 小屏默认保持展开（需求），不自动收起。
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!this.guideEl.hidden) {
          this.closeGuide();
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'Enter' && !this.guideEl.hidden) {
        const target = e.target as HTMLElement | null;
        // 焦点在按钮上时交给按钮原生 click，避免一次 Enter 跳两步。
        if (target?.tagName === 'BUTTON') return;
        this.advanceGuide();
        e.preventDefault();
      }
    });

    const unlock = (): void => {
      this.sound.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (): void => {
      this.reduced = mq.matches;
      this.ribbon.setReducedMotion(this.reduced);
      this.stage.setReducedMotion(this.reduced);
    };
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
  }

  /* ==========================================================================
   * 关卡
   * ========================================================================== */

  private applyLevelUi(): void {
    const level = this.level;
    this.hud.setLevel(level);
    this.hud.setBudget(this.session.budgetLeft, level.budget);
    this.hud.setStats(this.currentPhenotype, level.hudStats);
    this.hud.setMode(this.ribbon.getMode());
    this.hud.setUndoEnabled(this.session.canUndo);
    this.hud.setRunState(this.currentGene.issue ? 'invalid' : 'ready');
    this.legend.setGene(this.currentGene);
    this.stage.setJudgement(this.currentJudgement);
    this.stage.setIssue(this.currentGene.issue);
    this.ribbon.setLocked(false);
    document.body.dataset.level = level.id;
  }

  private loadLevel(index: number): void {
    const level = LEVELS[index];
    if (!level) return;
    this.unsubscribe?.();
    this.levelIndex = index;
    this.level = level;
    this.session = new Session(level);
    this.currentGene = this.session.gene;
    this.currentPhenotype = this.session.phenotype;
    this.currentJudgement = this.session.judge();

    this.ribbon.setLevel(level, this.currentGene);
    this.stage.setLevel(level, this.currentPhenotype);
    if (!level.ops.includes(this.ribbon.getMode())) this.ribbon.setMode('insert');
    this.hideCard();
    this.clearNote();
    this.applyLevelUi();
    this.subscribe();
    this.legend.setGene(this.currentGene);
    this.showBrief();
    this.updateDebug();
  }

  private subscribe(): void {
    this.unsubscribe = this.session.subscribe((event) => this.onSessionEvent(event));
  }

  private onSessionEvent(event: SessionEvent): void {
    switch (event.type) {
      case 'edit':
        this.handleEditEvent(event);
        break;
      case 'undo':
        this.handleUndoEvent(event);
        break;
      case 'reset':
        this.handleResetEvent(event);
        break;
      default: {
        const _never: never = event;
        void _never;
      }
    }
  }

  private handleEditEvent(event: Extract<SessionEvent, { type: 'edit' }>): void {
    const diff = event.diff;
    this.currentGene = event.gene;
    this.currentPhenotype = event.phenotype;
    this.currentJudgement = judge(this.level, event.gene, event.phenotype);

    this.ribbon.playEdit(diff);
    this.stage.clearRun();
    this.stage.setPhenotype(event.phenotype, diff);
    this.stage.setIssue(event.gene.issue);
    this.stage.setJudgement(this.currentJudgement);
    this.legend.setGene(event.gene);
    this.hud.setBudget(this.level.budget - event.budgetUsed, this.level.budget);
    this.hud.setStats(event.phenotype, this.level.hudStats);
    this.hud.setUndoEnabled(event.budgetUsed > 0);
    this.hud.setRunState(event.gene.issue ? 'invalid' : 'ready');
    this.failHintToken += 1;
    this.clearNote();
    this.syncIssueNote(event.gene);
    this.updateDebug();

    this.sound.play(diff.edit.op === 'insert' ? 'insert' : diff.edit.op === 'delete' ? 'delete' : 'click');
    if (diff.edit.op === 'delete') this.hud.flashUndo();
    const changes = diff.partChanges.filter((c) => c.kind !== 'kept').slice(0, 12);
    const first = Math.max(0, diff.firstChange);
    changes.forEach((change, k) => {
      const delay = 220 + Math.max(0, change.index - first) * 55 + k * 4;
      window.setTimeout(() => this.sound.play('flip', k), delay);
    });

    if (diff.edit.op === 'replace' && diff.firstChange === -1) {
      window.setTimeout(() => this.showToast(t('toast.silent'), 'info'), 340);
    } else if (diff.firstChange === -1 && event.gene.issue === null) {
      const region = event.gene.parts.length === 0 ? t('toast.noReadingFrame') : t('toast.untranslated');
      window.setTimeout(() => this.showToast(region, 'info'), 280);
    }
  }

  private handleUndoEvent(event: Extract<SessionEvent, { type: 'undo' }>): void {
    const before = this.currentGene;
    const after = event.gene;
    this.currentGene = after;
    this.currentPhenotype = event.phenotype;
    this.currentJudgement = judge(this.level, after, event.phenotype);

    const inverse = invertEdit(event.edit);
    let diff: GeneDiff | null = null;
    try {
      diff = diffGenes(before, after, inverse);
    } catch {
      diff = null;
    }

    if (diff) this.ribbon.playEdit(diff);
    else this.ribbon.resetGene(after);
    this.stage.clearRun();
    this.stage.setPhenotype(event.phenotype, diff ?? undefined);
    this.stage.setIssue(after.issue);
    this.stage.setJudgement(this.currentJudgement);
    this.legend.setGene(after);
    this.hud.setBudget(this.level.budget - event.budgetUsed, this.level.budget);
    this.hud.setStats(event.phenotype, this.level.hudStats);
    this.hud.setUndoEnabled(event.budgetUsed > 0);
    this.hud.setRunState(after.issue ? 'invalid' : 'ready');
    this.failHintToken += 1;
    this.clearNote();
    this.syncIssueNote(after);
    this.updateDebug();
    this.sound.play('undo');
    this.showToast(t('toast.undone'), 'ok');
  }

  private handleResetEvent(event: Extract<SessionEvent, { type: 'reset' }>): void {
    this.currentGene = event.gene;
    this.currentPhenotype = event.phenotype;
    this.currentJudgement = judge(this.level, event.gene, event.phenotype);
    this.ribbon.resetGene(event.gene);
    this.stage.resetRun();
    this.stage.setPhenotype(event.phenotype);
    this.stage.setIssue(event.gene.issue);
    this.stage.setJudgement(this.currentJudgement);
    this.legend.setGene(event.gene);
    this.hud.setBudget(this.level.budget - event.budgetUsed, this.level.budget);
    this.hud.setStats(event.phenotype, this.level.hudStats);
    this.hud.setUndoEnabled(false);
    this.hud.setRunState(event.gene.issue ? 'invalid' : 'ready');
    this.failHintToken += 1;
    this.hideCard();
    this.clearNote();
    this.syncIssueNote(event.gene);
    this.updateDebug();
    this.sound.play('click');
    this.showToast(t('toast.specimenReset'), 'info');
    this.showBrief();
  }

  private syncIssueNote(gene: Gene): void {
    const text = issueExplanation(gene.issue);
    if (text) {
      this.showNote(text, 'bad', true);
    } else if (this.noteEl.dataset.kind === 'bad') {
      this.clearNote();
    }
  }

  /* ==========================================================================
   * 用户操作
   * ========================================================================== */

  private setMode(mode: EditOp): void {
    this.sound.unlock();
    this.ribbon.setMode(mode);
    this.hud.setMode(mode);
    this.sound.play('click');
  }

  private performEdit(req: EditRequest): void {
    this.sound.unlock();
    if (this.stage.isRunning()) return;
    if (this.hud.getRunState() === 'passed') {
      this.showToast(t('toast.alreadyCleared'), 'info');
      return;
    }
    const result = this.session.edit(req);
    if (!result.ok) {
      this.sound.play('error');
      this.showToast(rejectionText(result.reason), 'bad');
    }
  }

  private undo(): void {
    this.sound.unlock();
    if (this.stage.isRunning()) {
      this.showToast(t('toast.noUndoRunning'), 'warn');
      return;
    }
    if (this.hud.getRunState() === 'passed') {
      this.showToast(t('toast.clearedUseNext'), 'info');
      return;
    }
    const ok = this.session.undo();
    if (!ok) this.showToast(t('toast.nothingUndo'), 'warn');
  }

  private reset(): void {
    this.sound.unlock();
    if (this.stage.isRunning()) {
      this.showToast(t('toast.noResetRunning'), 'warn');
      return;
    }
    this.session.reset();
  }

  private run(): void {
    this.sound.unlock();
    if (this.stage.isRunning()) return;
    if (this.hud.getRunState() === 'passed') return;
    const judgement = this.session.judge();
    if (judgement.outcome === 'invalid') {
      this.syncIssueNote(this.currentGene);
      this.showToast(t('toast.cannotDevelop'), 'bad');
      this.sound.play('error');
      return;
    }
    this.failHintToken += 1;
    this.hideCard();
    this.clearNote();
    this.hud.setRunState('running');
    this.hud.setUndoEnabled(false);
    this.ribbon.setLocked(true);
    this.stage.setJudgement(judgement);
    this.sound.play('click');
    const started = this.stage.run(judgement);
    if (!started) {
      this.hud.setRunState('ready');
      this.hud.setUndoEnabled(this.session.canUndo);
      this.ribbon.setLocked(false);
    }
  }

  private handlePass(judgement: Judgement): void {
    this.hud.setRunState('passed');
    this.hud.setUndoEnabled(false);
    this.ribbon.setLocked(true);
    this.clearNote();
    this.failHintToken += 1;
    this.sound.play('success');
    this.logSpecimen();
    this.showResultCard(judgement);
    this.updateDebug(judgement);
  }

  private handleFail(judgement: Judgement): void {
    this.hud.setRunState('failed');
    this.hud.setUndoEnabled(this.session.canUndo);
    this.ribbon.setLocked(false);
    this.sound.play('fail');
    this.updateDebug(judgement);
    const token = ++this.failHintToken;
    window.setTimeout(() => {
      if (token !== this.failHintToken) return;
      if (this.stage.getPhase() !== 'failed') return;
      this.showNote(t('state.hint', { hint: levelHint(this.level) }), 'hint', true);
    }, 620);
  }

  private toggleMute(): void {
    const muted = this.sound.toggleMuted();
    this.hud.setMuted(muted);
    this.showToast(muted ? t('toast.soundOff') : t('toast.soundOn'), 'info');
  }

  private toggleLegend(): void {
    this.legendOpen = !this.legendOpen;
    this.root.classList.toggle('legend-closed', !this.legendOpen);
    this.hud.setLegendOpen(this.legendOpen);
  }

  /* ==========================================================================
   * 提示 / Toast
   * ========================================================================== */

  private showToast(text: string, tone: 'info' | 'ok' | 'warn' | 'bad' = 'info'): void {
    window.clearTimeout(this.toastTimer);
    this.toastEl.textContent = text;
    this.toastEl.className = `toast show tone-${tone}`;
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.className = `toast tone-${tone}`;
    }, 2400);
  }

  private showNote(text: string, tone: 'bad' | 'hint' | 'brief' | 'info', sticky: boolean): void {
    window.clearTimeout(this.noteTimer);
    const token = ++this.noteToken;
    this.noteEl.hidden = false;
    this.noteEl.dataset.kind = tone;
    this.noteEl.className = `stage-note note-${tone}`;
    const mark = this.noteEl.querySelector('.note-mark');
    const textEl = this.noteEl.querySelector('.note-text');
    if (mark) mark.textContent = tone === 'bad' ? '✕' : tone === 'hint' ? '!' : '·';
    if (textEl) textEl.textContent = text;
    if (!sticky) {
      this.noteTimer = window.setTimeout(() => {
        if (token === this.noteToken) this.clearNote();
      }, 6200);
    }
  }

  private clearNote(): void {
    this.noteToken += 1;
    window.clearTimeout(this.noteTimer);
    this.noteEl.hidden = true;
    delete this.noteEl.dataset.kind;
  }

  private showBrief(): void {
    window.clearTimeout(this.briefTimer);
    this.briefEl.hidden = false;
    this.briefEl.innerHTML = `<span class="brief-kicker"></span><span class="brief-text"></span>`;
    const intro = levelIntro(this.level);
    const specimen = intro.match(/\d{3}/)?.[0] ?? String(this.level.number).padStart(3, '0');
    const kicker = this.briefEl.querySelector('.brief-kicker') as HTMLElement;
    kicker.textContent = t('state.brief', { n: specimen });
    const text = this.briefEl.querySelector('.brief-text') as HTMLElement;
    text.textContent = intro;
    const token = ++this.briefToken;
    this.briefTimer = window.setTimeout(() => {
      if (token === this.briefToken) this.briefEl.hidden = true;
    }, 5200);
  }

  /* ==========================================================================
   * 结算卡片
   * ========================================================================== */

  private createLangSwitch(extraClass = ''): HTMLElement {
    const lang = getLanguage();
    const wrap = document.createElement('div');
    wrap.className = `lang-switch ${extraClass}`.trim();
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', t('app.chooseLanguage'));
    const items: { code: Lang; label: string }[] = [
      { code: 'en', label: 'EN' },
      { code: 'zh', label: '中文' },
    ];
    items.forEach((item, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'lang-sep';
        sep.textContent = '|';
        wrap.appendChild(sep);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.lang = item.code;
      btn.textContent = item.label;
      btn.classList.toggle('active', lang === item.code);
      btn.setAttribute('aria-pressed', String(lang === item.code));
      btn.setAttribute('aria-label', `${t('app.language')}: ${item.label}`);
      btn.addEventListener('click', () => this.changeLanguage(item.code));
      wrap.appendChild(btn);
    });
    return wrap;
  }

  private showResultCard(judgement: Judgement): void {
    const level = this.level;
    const gene = this.currentGene;
    const next = LEVELS[this.levelIndex + 1];
    const used = this.session.history.length;
    const parts = gene.parts;
    this.lastResult = judgement;

    this.modalEl.hidden = false;
    this.modalEl.innerHTML = '';
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    this.modalEl.appendChild(backdrop);

    const card = document.createElement('div');
    card.className = 'result-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', t('result.dialogAria'));

    const kicker = document.createElement('div');
    kicker.className = 'result-kicker';
    kicker.textContent = t('result.kicker');
    card.appendChild(kicker);
    card.appendChild(this.createLangSwitch('result-lang'));

    const top = document.createElement('div');
    top.className = 'result-top';

    const canvas = document.createElement('canvas');
    const cw = 220;
    const ch = 104;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.paintSpecimen(ctx, cw, ch, this.currentPhenotype);
    }
    top.appendChild(canvas);

    const info = document.createElement('div');
    info.className = 'result-info';
    const species = document.createElement('h2');
    species.className = 'result-species';
    species.textContent = levelSpecies(level);
    info.appendChild(species);
    const sub = document.createElement('div');
    sub.className = 'result-sub';
    sub.textContent = t('result.levelLine', { n: String(level.number).padStart(2, '0'), name: levelName(level) });
    info.appendChild(sub);

    const score = document.createElement('div');
    score.className = 'result-score';
    const editsChip = document.createElement('span');
    editsChip.className = 'result-chip';
    editsChip.textContent = t('result.edits', { used, par: level.parEdits });
    score.appendChild(editsChip);
    for (const key of level.hudStats) {
      const chip = document.createElement('span');
      chip.className = 'result-chip';
      chip.textContent = t('result.statChip', {
        value: judgement.phenotype.stats[key],
        stat: statLabel(key),
      });
      score.appendChild(chip);
    }
    info.appendChild(score);
    top.appendChild(info);
    card.appendChild(top);

    const seq = document.createElement('div');
    seq.className = 'result-seq';
    seq.textContent = groupedSequence(gene);
    card.appendChild(seq);

    const chain = document.createElement('div');
    chain.className = 'result-chain';
    const chipsWrap = document.createElement('div');
    chipsWrap.className = 'chain-parts';
    parts.forEach((part, i) => {
      const chip = document.createElement('span');
      chip.className = 'chain-chip';
      chip.textContent = partLabel(part.id);
      if (i > 0) {
        const arrow = document.createElement('span');
        arrow.className = 'chain-arrow';
        arrow.textContent = '→';
        chipsWrap.appendChild(arrow);
      }
      chipsWrap.appendChild(chip);
    });
    if (gene.stopCodon) {
      const arrow = document.createElement('span');
      arrow.className = 'chain-arrow';
      arrow.textContent = '→';
      chipsWrap.appendChild(arrow);
      const stop = document.createElement('span');
      stop.className = 'chain-chip stop';
      stop.textContent = t('result.chainStop', { codon: gene.stopCodon });
      chipsWrap.appendChild(stop);
    }
    chain.appendChild(chipsWrap);
    card.appendChild(chain);

    const actions = document.createElement('div');
    actions.className = 'result-actions';
    const note = document.createElement('span');
    note.className = 'result-hint';
    note.textContent = next ? t('result.next', { name: levelName(next) }) : t('result.allLogged');
    actions.appendChild(note);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'result-next';
    btn.textContent = next ? t('common.next') : t('result.reset');
    btn.addEventListener('click', () => {
      this.sound.play('click');
      if (next) {
        this.loadLevel(this.levelIndex + 1);
        this.showToast(t('toast.level', { n: String(next.number).padStart(2, '0'), name: levelName(next) }), 'info');
      } else {
        this.hideCard();
        this.reset();
      }
    });
    actions.appendChild(btn);
    card.appendChild(actions);

    this.modalEl.appendChild(card);
    window.setTimeout(() => btn.focus({ preventScroll: true }), 60);
  }

  private hideCard(): void {
    this.modalEl.hidden = true;
    this.modalEl.innerHTML = '';
    this.lastResult = null;
  }

  private hideToast(): void {
    window.clearTimeout(this.toastTimer);
    this.toastEl.className = 'toast';
    this.toastEl.textContent = '';
  }

  /* ==========================================================================
   * 标本罐
   * ========================================================================== */

  private loadBestiary(): void {
    try {
      const raw = localStorage.getItem(BESTIARY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      this.bestiary = parsed.filter((entry): entry is BestiaryEntry => {
        if (typeof entry !== 'object' || entry === null) return false;
        const e = entry as Partial<BestiaryEntry>;
        return typeof e.levelId === 'string' && typeof e.seq === 'string' && typeof e.species === 'string';
      });
    } catch {
      this.bestiary = [];
    }
  }

  private saveBestiary(): void {
    try {
      localStorage.setItem(BESTIARY_KEY, JSON.stringify(this.bestiary.slice(0, 16)));
    } catch {
      /* 隐私模式忽略 */
    }
  }

  private logSpecimen(): void {
    const entry: BestiaryEntry = {
      levelId: this.level.id,
      seq: this.currentGene.seq,
      species: this.level.species,
      at: Date.now(),
    };
    const exists = this.bestiary.some((e) => e.levelId === entry.levelId && e.seq === entry.seq);
    if (!exists) {
      this.bestiary.unshift(entry);
      this.bestiary = this.bestiary.slice(0, 16);
      this.saveBestiary();
      this.renderBestiary();
    }
  }

  private renderBestiary(): void {
    this.legend.clearSpecimens();
    for (const entry of this.bestiary) {
      const gene = decode(entry.seq);
      if (gene.issue) continue;
      const phen = derivePhenotype(gene);
      const level = LEVELS.find((l) => l.id === entry.levelId);
      const label = level ? `L${String(level.number).padStart(2, '0')}` : '—';
      const species = level ? levelSpecies(level) : entry.species;
      this.legend.addSpecimen(species, label, (ctx, w, h) => {
        this.paintSpecimen(ctx, w, h, phen);
      });
    }
  }

  private paintSpecimen(ctx: CanvasRenderingContext2D, w: number, h: number, phen: Phenotype): void {
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0b1a26');
    bg.addColorStop(1, '#071019');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(95, 227, 200, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, h - 8.5);
    ctx.lineTo(w - 8, h - 8.5);
    ctx.stroke();

    const layout = buildCreature(phen);
    if (layout.slots.length === 0) return;
    const scale = Math.min((w - 30) / layout.length, (h - 24) / 96, 0.95);
    drawCreature(ctx, layout, w / 2, h - 9, scale, {
      now: performance.now(),
      running: false,
      runPhase: 0.18,
      growth: () => 1,
      alpha: 1,
      tilt: 0,
      pointer: null,
    });
  }

  /* ==========================================================================
   * 引导
   * ========================================================================== */

  private maybeShowGuide(): void {
    let seen = false;
    try {
      seen = localStorage.getItem(GUIDE_KEY) === '1';
    } catch {
      seen = false;
    }
    if (seen) return;
    window.setTimeout(() => {
      if (!this.guideEl.hidden) return;
      this.guideStep = 0;
      this.guideEl.hidden = false;
      this.renderGuide();
      this.sound.play('click');
    }, 420);
  }

  private renderGuide(): void {
    const firstPart = this.currentPhenotype.parts[0];
    const codon = this.currentGene.codons.find((c) => c.role === 'start')?.text ??
      this.currentGene.seq.slice(0, 3);
    const bases = (codon || 'AUG').split('');
    const steps = [
      {
        n: '01',
        title: t('guide.step1.title'),
        body: t('guide.step1.body'),
        extra: `<span class="guide-codon">${bases
          .map((b) => `<b style="color:${BASE_COLORS[b as Base] ?? COLORS.ink}">${b}</b>`)
          .join('')}</span><span class="guide-arrow">→</span><span class="guide-part">${
          firstPart ? partLabel(firstPart.id) : t('common.partFallback')
        }</span>`,
      },
      {
        n: '02',
        title: t('guide.step2.title'),
        body: t('guide.step2.body'),
        extra: `<span class="guide-shift"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>`,
      },
      {
        n: '03',
        title: t('guide.step3.title'),
        body: t('guide.step3.body'),
        extra: `<span class="guide-run">${t('guide.runPill')}</span>`,
      },
    ];
    const step = steps[this.guideStep] ?? steps[0];
    const last = this.guideStep === steps.length - 1;
    this.guideEl.innerHTML = `
      <div class="guide-backdrop"></div>
      <div class="guide-card" role="dialog" aria-modal="true" aria-label="${t('guide.dialogAria')}">
        <button type="button" class="guide-close" aria-label="${t('guide.closeAria')}">×</button>
        <div class="guide-step">${t('guide.step', { n: step.n })}</div>
        <h2 class="guide-title">${step.title}</h2>
        <p class="guide-body">${step.body}</p>
        <div class="guide-extra">${step.extra}</div>
        <div class="guide-actions">
          <div class="guide-dots">${steps.map((_, i) => `<span class="${i === this.guideStep ? 'on' : ''}"></span>`).join('')}</div>
          <button type="button" class="guide-next">${last ? t('guide.done') : t('guide.next')}</button>
        </div>
      </div>
    `;
    const guideCard = this.guideEl.querySelector('.guide-card');
    if (guideCard) guideCard.appendChild(this.createLangSwitch('guide-lang'));
    const nextBtn = this.guideEl.querySelector('.guide-next') as HTMLButtonElement;
    nextBtn.addEventListener('click', () => this.advanceGuide());
    const closeBtn = this.guideEl.querySelector('.guide-close') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => this.closeGuide());
    window.setTimeout(() => nextBtn.focus({ preventScroll: true }), 40);
  }

  private advanceGuide(): void {
    this.guideStep += 1;
    if (this.guideStep >= 3) {
      this.closeGuide();
      return;
    }
    this.renderGuide();
    this.sound.play('click');
  }

  private closeGuide(): void {
    if (this.guideEl.hidden) return;
    this.guideEl.hidden = true;
    this.guideEl.innerHTML = '';
    try {
      localStorage.setItem(GUIDE_KEY, '1');
    } catch {
      /* 忽略 */
    }
  }

  /* ==========================================================================
   * 调试
   * ========================================================================== */

  private updateDebug(judgement?: Judgement): void {
    const debug = new URLSearchParams(window.location.search).get('debug') === '1';
    if (!debug) return;
    if (!this.debugEl) {
      this.debugEl = document.createElement('pre');
      this.debugEl.className = 'debug-panel';
      this.root.appendChild(this.debugEl);
    }
    const j = judgement ?? this.currentJudgement;
    this.debugEl.textContent = [
      `${t('debug.level')}     ${this.level.id} · ${levelName(this.level)}`,
      `${t('debug.history')}   ${this.session.history.length} / ${this.level.budget}`,
      `${t('debug.issue')}     ${this.currentGene.issue ?? 'none'}`,
      `${t('debug.stats')}     ${JSON.stringify(this.currentPhenotype.stats)}`,
      `${t('debug.judge')}     ${j.outcome} · ${j.reason}`,
      `${t('debug.solution')}  ${this.level.solutionNote}`,
    ].join('\n');
  }
}

/* ==========================================================================
 * 工具
 * ========================================================================== */

function invertEdit(edit: Edit): Edit {
  switch (edit.op) {
    case 'insert':
      return { op: 'delete', index: edit.index, removed: edit.base };
    case 'delete':
      return { op: 'insert', index: edit.index, base: edit.removed };
    case 'replace':
      return { op: 'replace', index: edit.index, base: edit.removed };
    default: {
      const _never: never = edit.op;
      void _never;
      return edit;
    }
  }
}

function rejectionText(reason: EditRejection): string {
  switch (reason) {
    case 'locked_op':
      return t('toast.lockedOp');
    case 'no_budget':
      return t('toast.noBudget');
    case 'index_out_of_range':
      return t('toast.outOfRange');
    case 'invalid_base':
      return t('toast.invalidBase');
    case 'too_long':
      return t('toast.tooLong', { n: MAX_SEQUENCE_LENGTH });
    case 'no_change':
      return t('toast.noChange');
    default: {
      const _never: never = reason;
      void _never;
      return t('toast.editRejected');
    }
  }
}

function issueExplanation(issue: GeneIssue | null): string | null {
  switch (issue) {
    case 'no_start':
      return t('state.noStartExplain');
    case 'no_stop':
      return t('state.noStopExplain');
    case 'empty':
      return t('state.emptyExplain');
    case 'bad_char':
      return t('state.badCharExplain');
    case null:
      return null;
    default: {
      const _never: never = issue;
      void _never;
      return null;
    }
  }
}


function installFavicon(): void {
  if (document.querySelector('link[rel="icon"]')) return;
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  link.href = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAYklEQVR42mNgwAK4RWT/0wIz4AO0spQox9DbcgxHjGwHDJTlcEeMOoCQgvjHJ0jGow4Y3g4Y8EQ4aHPBqANGjgNGcwEh9Z82eWPFow4Yug4gFY86YEi1jEc7JoOnczqQ3XMAEdDYCCfX0qUAAAAASUVORK5CYII=';
  document.head.appendChild(link);
}


/** 结果卡片用：连续的非翻译区合并成一个 token，避免 "AUA G" 这种断字。 */
function groupedSequence(gene: Gene): string {
  const tokens: string[] = [];
  let run = '';
  for (const slot of gene.codons) {
    if (slot.role === 'junk' || slot.role === 'trailer' || slot.role === 'partial') {
      run += slot.text;
      continue;
    }
    if (run) {
      tokens.push(run);
      run = '';
    }
    tokens.push(slot.text);
  }
  if (run) tokens.push(run);
  return tokens.join(' ');
}
