/**
 * 拼装小鸡 · M0 应用编排（B 负责）。
 * ---------------------------------------------------------------
 * core 是唯一逻辑源：装配/布局/属性/战斗全部来自 src/core。
 * 这里只做 DOM、3D view、输入与表现。
 */

import './../styles.css';
import {
  PART_BY_ID,
  PART_DEFS,
  SLOT_IDS,
  SYNERGIES,
  applyEdit,
  countParts,
  createCreature,
  deriveStats,
  layoutParts,
  synergyNotes,
  type Creature,
  type CreatureStats,
  type PartDef,
  type PartInstance,
  type SlotId,
  type SynergyNote,
} from '../core';
import { ChickModel } from '../render3d/chick';
import { SceneView } from '../render3d/scene';
import { BattleArena } from './battle';
import { el } from './dom';
import { PartDrag } from './drag';
import { PerfPanel } from './perf';
import { SlotRings } from './rings';
import { Sidebar } from './sidebar';
import { StatsBar } from './stats-bar';
import { t } from './strings';

const SLOT_ICON: Record<SlotId, string> = {
  body: '▣',
  beak: '◤',
  legs: '⋔',
  wings: '⌁',
  tail: '⌇',
  crest: '♠',
};

function allInstances(creature: Creature): PartInstance[] {
  const out: PartInstance[] = [];
  for (const slot of SLOT_IDS) out.push(...creature.slots[slot]);
  return out;
}

function errorText(code: string): string {
  switch (code) {
    case 'too_many':
      return t('toast.tooMany');
    default:
      return t('toast.error');
  }
}

export class App {
  private readonly root: HTMLElement;
  private readonly scene: SceneView;
  private readonly player: ChickModel;
  private readonly enemy: ChickModel;
  private readonly sidebar: Sidebar;
  private readonly rings: SlotRings;
  private readonly statsBar: StatsBar;
  private readonly perf: PerfPanel;
  private readonly battle: BattleArena;
  private readonly drag: PartDrag;
  private readonly toast: HTMLElement;
  private readonly fightBtn: HTMLButtonElement;
  private readonly perfBtn: HTMLButtonElement;
  private readonly notesEl: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly battleBadge: HTMLElement;
  private readonly stageInfo: HTMLElement;
  private readonly stageFooter: HTMLElement;

  private creature: Creature = createCreature('local-chick');
  private stats: CreatureStats;
  private phase: 'idle' | 'battle' | 'result' = 'idle';
  private lastFrame = performance.now();
  private toastTimer = 0;
  private raf = 0;
  private pendingToast: number | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    root.classList.add('build-a-chick');
    root.replaceChildren();

    // ---------- 顶栏 ----------
    const header = el('header', 'topbar');
    const brand = el('div', 'brand');
    const mark = el('div', 'brand-mark');
    mark.innerHTML = '<span></span><span></span><span></span>';
    const brandText = el('div', 'brand-text');
    brandText.append(
      el('h1', 'brand-title', t('app.title')),
      el('div', 'brand-sub', t('app.subtitle')),
    );
    brand.append(mark, brandText);

    const statsHost = el('div', 'stats-host');
    const actions = el('div', 'top-actions');

    this.perfBtn = el('button', 'btn ghost perf-toggle', t('button.perf'));
    this.perfBtn.type = 'button';
    this.perfBtn.setAttribute('aria-pressed', 'false');
    this.perfBtn.addEventListener('click', () => this.togglePerf());

    const clearAll = el('button', 'btn ghost', t('button.reset'));
    clearAll.type = 'button';
    clearAll.addEventListener('click', () => this.clearAll());

    this.fightBtn = el('button', 'btn primary fight-btn', t('button.fight'));
    this.fightBtn.type = 'button';
    this.fightBtn.addEventListener('click', () => this.startBattle());

    actions.append(this.perfBtn, clearAll, this.fightBtn);
    header.append(brand, statsHost, actions);
    root.append(header);

    // ---------- 工作区 ----------
    const workspace = el('main', 'workspace');
    const sidebarHost = el('div', 'sidebar-host');
    const viewport = el('section', 'viewport');
    viewport.setAttribute('aria-label', '装配与训练场');
    const sceneHost = el('div', 'scene-host');
    viewport.append(sceneHost);
    workspace.append(sidebarHost, viewport);
    root.append(workspace);

    // 3D
    this.scene = new SceneView(sceneHost);
    this.player = new ChickModel();
    this.enemy = new ChickModel({ variant: 'enemy' });
    this.scene.attach(this.player.root);
    this.scene.attach(this.player.shadow);
    this.scene.attach(this.enemy.root);
    this.scene.attach(this.enemy.shadow);
    this.enemy.root.visible = false;
    this.enemy.shadow.visible = false;

    // 侧栏 / 环 / 拖拽 / 属性 / 性能
    this.sidebar = new Sidebar(sidebarHost, {
      onPartPointerDown: (def, event) => this.drag.start(def, event),
      onAdd: (def) => this.addPart(def),
      onRemove: (def) => this.removeLast(def),
      onClear: (slot) => this.clearSlot(slot),
      onClearAll: () => this.clearAll(),
    });

    this.rings = new SlotRings(viewport);
    this.drag = new PartDrag(root, this.rings, {
      onTap: (def) => this.addPart(def),
      onDrop: (def, slot) => {
        if (slot === def.slot) this.addPart(def);
      },
      onWrongSlot: (def, slot) => {
        const name = slot ? t(`slot.${slot}.full` as 'slot.body.full') : '—';
        this.showToast(t('drag.wrong', { slot: name }), 'bad');
      },
    });

    this.statsBar = new StatsBar(statsHost);

    this.perf = new PerfPanel(viewport, {
      onAddLegs: () => this.stressLegs(),
      onAddWings: () => this.stressWings(),
      onClear: () => this.clearAll(),
    });

    // 场景内 HUD
    this.stageInfo = el('div', 'stage-info');
    const stageInfo = this.stageInfo;
    const stageLine = el('div', 'stage-line');
    stageLine.append(el('span', 'live-dot'), el('span', '', 'ASSEMBLY BAY 01'));
    const stageHint = el('div', 'stage-hint', '拖动零件到槽位环 / 点击卡片快速安装');
    stageInfo.append(stageLine, stageHint);
    viewport.append(stageInfo);

    this.stageFooter = el('div', 'stage-footer');
    const footer = this.stageFooter;
    const noteWrap = el('div', 'notes-wrap');
    noteWrap.append(el('span', 'notes-label', t('note.synergy')));
    this.notesEl = el('div', 'notes-list');
    noteWrap.append(this.notesEl);
    this.countEl = el('div', 'part-total', '0 PARTS');
    footer.append(noteWrap, this.countEl);
    viewport.append(footer);

    this.battleBadge = el('div', 'battle-badge', t('battle.auto'));
    this.battleBadge.hidden = true;
    viewport.append(this.battleBadge);

    // 战斗层
    this.battle = new BattleArena(viewport, this.scene, this.player, this.enemy, {
      onFinish: () => {
        this.phase = 'result';
        this.battleBadge.hidden = true;
      },
      onExit: () => this.endBattleToLab(),
      onAgain: () => {
        this.phase = 'battle';
        this.battleBadge.hidden = false;
        this.battle.start(this.stats, this.enemyStats());
      },
    });

    // 敌人预装（视觉小兵；战斗数值由 UI 适配生成）
    const dummy = this.makeDummyCreature();
    this.enemy.setLayout(layoutParts(allInstances(dummy)));
    this.enemy.setWorld(2.4);
    this.enemy.root.rotation.y = Math.PI;

    // toast
    this.toast = el('div', 'toast');
    root.append(this.toast);

    // 属性初值
    this.stats = deriveStats(this.creature, PART_DEFS, SYNERGIES);
    this.refresh();
    this.player.update(0.016, performance.now() / 1000, false);
    this.loop(performance.now());
  }

  /* ==========================================================================
   * 装配
   * ========================================================================== */

  private addPart(def: PartDef): void {
    if (this.phase !== 'idle') return;
    const result = applyEdit(this.creature, { type: 'addPart', slot: def.slot, defId: def.id });
    if (!result.ok) {
      this.showToast(errorText(result.code), 'bad');
      return;
    }
    this.creature = result.creature;
    this.refresh();
    this.rings.flash(def.slot);
    this.player.flashSlot(def.slot);
    this.showToast(t('toast.installed', { name: def.name.zh }), 'ok');
  }

  private removeLast(def: PartDef): void {
    if (this.phase !== 'idle') return;
    const list = this.creature.slots[def.slot];
    let index = -1;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i]?.defId === def.id) {
        index = i;
        break;
      }
    }
    if (index < 0) return;
    const result = applyEdit(this.creature, { type: 'removePart', slot: def.slot, index });
    if (!result.ok) {
      this.showToast(errorText(result.code), 'bad');
      return;
    }
    this.creature = result.creature;
    this.refresh();
    this.showToast(t('toast.removed', { name: def.name.zh }), 'info');
  }

  private clearSlot(slot: SlotId): void {
    if (this.phase !== 'idle') return;
    if (this.creature.slots[slot].length === 0) return;
    const result = applyEdit(this.creature, { type: 'clearSlot', slot });
    if (!result.ok) return;
    this.creature = result.creature;
    this.refresh();
    this.showToast(t('toast.cleared', { slot: t(`slot.${slot}.full` as 'slot.body.full') }), 'info');
  }

  private clearAll(): void {
    if (this.phase !== 'idle') return;
    this.creature = createCreature(this.creature.id);
    this.refresh();
    this.showToast(t('toast.clearAll'), 'info');
  }

  private stressLegs(): void {
    if (this.phase !== 'idle') return;
    this.addMany('legs', 'legs.spring', 10);
    this.showToast(t('toast.stressLegs'), 'ok');
  }

  private stressWings(): void {
    if (this.phase !== 'idle') return;
    this.addMany('wings', 'wings.feather', 10);
    this.showToast(t('toast.stressWings'), 'ok');
  }

  private addMany(slot: SlotId, defId: string, count: number): void {
    let next = this.creature;
    let added = 0;
    for (let i = 0; i < count; i += 1) {
      const result = applyEdit(next, { type: 'addPart', slot, defId });
      if (!result.ok) {
        this.showToast(errorText(result.code), 'bad');
        break;
      }
      next = result.creature;
      added += 1;
    }
    if (added > 0) {
      this.creature = next;
      this.refresh();
      this.rings.flash(slot);
      this.player.flashSlot(slot);
    }
  }

  private refresh(): void {
    const placements = layoutParts(allInstances(this.creature));
    this.player.setLayout(placements);
    this.sidebar.setCreature(this.creature);
    this.rings.setCounts(this.player.slotCounts);
    this.stats = deriveStats(this.creature, PART_DEFS, SYNERGIES);
    this.statsBar.setStats(this.stats);
    this.countEl.textContent = `${countParts(this.creature)} PARTS`;
    this.renderNotes(synergyNotes(this.creature, PART_DEFS, SYNERGIES));
  }

  private renderNotes(notes: readonly SynergyNote[]): void {
    this.notesEl.replaceChildren();
    if (notes.length === 0) {
      this.notesEl.append(el('span', 'note-empty', '还没有触发协同'));
      return;
    }
    for (const note of notes.slice(0, 4)) {
      const chip = el('span', `note-chip ${note.tone}`, note.text.zh);
      this.notesEl.append(chip);
    }
    if (notes.length > 4) this.notesEl.append(el('span', 'note-more', `+${notes.length - 4}`));
  }

  /* ==========================================================================
   * 战斗
   * ========================================================================== */

  private enemyStats(): CreatureStats {
    const stats = this.stats;
    const hp = Math.max(1, Math.round(stats.atk * 1.2 * 26));
    const atk = Math.max(1, Math.round((stats.hp / 26) * (1 + stats.def * 0.05) / 1.2));
    return {
      v: 1,
      hp,
      atk,
      def: 0,
      spd: 24,
      mass: 0,
      capacity: 8,
      tags: ['enemy'],
      abilities: [],
      flags: { grounded: true, canGlide: false, overloaded: false },
    };
  }

  private startBattle(): void {
    if (this.phase !== 'idle') return;
    if (this.stats.atk <= 0) {
      this.showToast(t('battle.needBeak'), 'bad');
      return;
    }
    this.phase = 'battle';
    this.rings.setVisible(false);
    this.sidebar.setDisabled(true);
    this.fightBtn.disabled = true;
    this.fightBtn.textContent = t('button.fighting');
    this.battleBadge.hidden = false;
    this.stageInfo.hidden = true;
    this.stageFooter.hidden = true;
    this.player.setMoving(false);
    this.battle.start(this.stats, this.enemyStats());
    this.showToast(t('battle.start'), 'ok');
  }

  private endBattleToLab(): void {
    this.battle.stop();
    this.phase = 'idle';
    this.rings.setVisible(true);
    this.sidebar.setDisabled(false);
    this.fightBtn.disabled = false;
    this.fightBtn.textContent = t('button.fight');
    this.battleBadge.hidden = true;
    this.stageInfo.hidden = false;
    this.stageFooter.hidden = false;
    this.player.setWorld(0);
  }

  private makeDummyCreature(): Creature {
    let c = createCreature('tin-soldier');
    const loadout: Array<[SlotId, string]> = [
      ['body', 'body.tough'],
      ['beak', 'beak.hammer'],
      ['legs', 'legs.stub'],
      ['legs', 'legs.stub'],
      ['wings', 'wings.armor'],
      ['wings', 'wings.armor'],
      ['tail', 'tail.spike'],
      ['crest', 'crest.horn'],
    ];
    for (const [slot, defId] of loadout) {
      const r = applyEdit(c, { type: 'addPart', slot, defId });
      if (r.ok) c = r.creature;
    }
    return c;
  }

  /* ==========================================================================
   * 性能 / toast / 主循环
   * ========================================================================== */

  private togglePerf(): void {
    const open = !this.perf.isOpen;
    this.perf.setOpen(open);
    this.perfBtn.classList.toggle('active', open);
    this.perfBtn.setAttribute('aria-pressed', open ? 'true' : 'false');
  }

  private showToast(text: string, tone: 'ok' | 'bad' | 'info' = 'info'): void {
    window.clearTimeout(this.pendingToast ?? undefined);
    this.toast.textContent = text;
    this.toast.className = `toast show ${tone}`;
    this.pendingToast = window.setTimeout(() => {
      this.toast.className = 'toast';
    }, 1700);
    void this.toastTimer;
  }

  private loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    const seconds = now / 1000;

    if (this.phase === 'battle' || this.phase === 'result') this.battle.update(now);
    this.player.update(dt, seconds, this.phase === 'battle');
    this.enemy.update(dt, seconds, this.phase === 'battle');
    this.scene.render(now);
    this.statsBar.update(dt);
    if (this.phase !== 'battle' && this.phase !== 'result') this.rings.position(this.player, this.scene);
    this.perf.update(this.scene.stats, countParts(this.creature), now);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.player.dispose();
    this.enemy.dispose();
    this.scene.dispose();
    this.root.replaceChildren();
  }
}
