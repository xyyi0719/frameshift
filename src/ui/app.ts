/**
 * 拼装小鸡 · 第 1 关肉鸽可玩 Demo 主编排
 * ---------------------------------------------------------------
 * 集成：
 *   - 36 项动物 + 机械零件库（同件叠 3 阶变色发光出粒子 + 躯干 3 种分区拼色融合）
 *   - 8 组特殊组合彩蛋与物理冲突实时提示与战斗生效
 *   - 精简版部位造型微调（位移/旋转/缩放/重置，仅影响造型）
 *   - 撤销（Ctrl+Z / 按钮）+ 3 套方案保存与切换（localStorage）
 *   - 第 1 关可遇动物图鉴 + 3 波递进键盘操控关卡 + 战后「随机三选一」肉鸽掉落！
 */

import './../styles.css';
import {
  PART_BY_ID,
  PART_DEFS,
  SLOT_IDS,
  STAGE1_CATALOG,
  STAGE1_WAVES,
  SYNERGIES,
  applyEdit,
  cloneCreature,
  countParts,
  createCreature,
  deriveStats,
  rollThreeRewards,
  synergyNotes,
  type Creature,
  type CreatureStats,
  type PartDef,
  type SlotId,
  type SlotTweak,
  type StageWaveDef,
  type SynergyNote,
} from '../core';
import { ChickModel } from '../render3d/chick';
import { SceneView } from '../render3d/scene';
import { el } from './dom';
import { PartDrag } from './drag';
import { PerfPanel } from './perf';
import { RewardModal } from './reward-modal';
import { SlotRings } from './rings';
import { Sidebar } from './sidebar';
import { StageBattleArena } from './stage-battle';
import { StatsBar } from './stats-bar';
import { t } from './strings';
import { TweakPanel } from './tweak-panel';

const PRESET_STORAGE_KEY = 'build-a-chick.presets.v1';

interface SavedPreset {
  name: string;
  creature: Creature;
  savedAt: number;
}

function loadPresets(): Record<string, SavedPreset> {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, SavedPreset>;
  } catch {
    return {};
  }
}

function savePresets(data: Record<string, SavedPreset>): void {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 忽略隐私模式存储受限
  }
}

function buildCreatureFromLoadout(id: string, loadout: Partial<Record<SlotId, string[]>>): Creature {
  let c = createCreature(id);
  for (const slot of SLOT_IDS) {
    for (const defId of loadout[slot] ?? []) {
      const r = applyEdit(c, { type: 'equipOrUpgrade', slot, defId });
      if (r.ok) c = r.creature;
    }
  }
  return c;
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
  private readonly tweakPanel: TweakPanel;
  private readonly rewardModal: RewardModal;
  private readonly battle: StageBattleArena;
  private readonly drag: PartDrag;
  private readonly toast: HTMLElement;
  private readonly fightBtn: HTMLButtonElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly perfBtn: HTMLButtonElement;
  private readonly catalogBtn: HTMLButtonElement;
  private readonly catalogDrawer: HTMLElement;
  private readonly presetBar: HTMLElement;
  private readonly notesEl: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly battleBadge: HTMLElement;
  private readonly stageInfo: HTMLElement;
  private readonly stageLineText: HTMLElement;
  private readonly stageHintEl: HTMLElement;
  private readonly stageFooter: HTMLElement;

  private creature: Creature = createCreature('local-chick');
  private history: Creature[] = [];
  private ownedIds = new Set<string>();
  private sandboxMode = false;
  private currentWaveIdx = 0;
  private stageCleared = false;
  private stats: CreatureStats;
  private phase: 'idle' | 'battle' | 'reward' = 'idle';
  private lastFrame = performance.now();
  private raf = 0;
  private pendingToast: number | null = null;
  private presets: Record<string, SavedPreset> = loadPresets();

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

    this.undoBtn = el('button', 'btn ghost', t('button.undo'));
    this.undoBtn.type = 'button';
    this.undoBtn.title = '撤销上一步装配或微调（Ctrl+Z）';
    this.undoBtn.disabled = true;
    this.undoBtn.addEventListener('click', () => this.undo());

    this.catalogBtn = el('button', 'btn ghost active', t('button.catalog'));
    this.catalogBtn.type = 'button';
    this.catalogBtn.addEventListener('click', () => this.toggleCatalog());

    this.perfBtn = el('button', 'btn ghost perf-toggle', t('button.perf'));
    this.perfBtn.type = 'button';
    this.perfBtn.addEventListener('click', () => this.togglePerf());

    const newRunBtn = el('button', 'btn ghost', '重开肉鸽');
    newRunBtn.type = 'button';
    newRunBtn.title = '从光鸡 + 第 1 波重新开始一局肉鸽';
    newRunBtn.addEventListener('click', () => this.resetRoguelikeRun());

    this.fightBtn = el('button', 'btn primary fight-btn', '出战第 1 关 · W1');
    this.fightBtn.type = 'button';
    this.fightBtn.addEventListener('click', () => this.startCurrentWave());

    actions.append(this.undoBtn, this.catalogBtn, newRunBtn, this.perfBtn, this.fightBtn);
    header.append(brand, statsHost, actions);
    root.append(header);

    // ---------- 工作区 ----------
    const workspace = el('main', 'workspace');
    const sidebarHost = el('div', 'sidebar-host');
    const viewport = el('section', 'viewport');
    viewport.setAttribute('aria-label', '装配与第 1 关战场');
    const sceneHost = el('div', 'scene-host');
    viewport.append(sceneHost);
    workspace.append(sidebarHost, viewport);
    root.append(workspace);

    // 3D 场景与双鸡模型
    this.scene = new SceneView(sceneHost);
    this.player = new ChickModel({ variant: 'player' });
    this.enemy = new ChickModel({ variant: 'enemy', headColor: 0x6fd152 });
    this.scene.attach(this.player.root);
    this.scene.attach(this.player.shadow);
    this.scene.attach(this.enemy.root);
    this.scene.attach(this.enemy.shadow);
    this.enemy.root.visible = false;
    this.enemy.shadow.visible = false;

    // 侧栏
    this.sidebar = new Sidebar(sidebarHost, {
      onPartPointerDown: (def, event) => this.drag.start(def, event),
      onAdd: (def) => this.equipPart(def),
      onRemove: (def) => this.downgradePart(def),
      onClear: (slot) => this.clearSlot(slot),
      onClearAll: () => this.clearAll(),
      onTweakSlot: (slot) => this.openTweak(slot),
      onToggleSandbox: (sandbox) => {
        this.sandboxMode = sandbox;
        this.refresh();
        this.showToast(
          sandbox ? '已开启全件自由试装（36 件全开，可自由测试拼色与彩蛋）' : '已切回第 1 关肉鸽掉落背包',
          'info',
        );
      },
    });

    // 3D 槽位环（点击打开造型微调，拖入完成装配）
    this.rings = new SlotRings(viewport, (slot) => this.openTweak(slot));
    this.drag = new PartDrag(root, this.rings, {
      onTap: (def) => this.equipPart(def),
      onDrop: (def, slot) => {
        if (slot === def.slot) this.equipPart(def);
      },
      onWrongSlot: (_def, slot) => {
        const name = slot ? t(`slot.${slot}.full` as 'slot.body.full') : '—';
        this.showToast(t('drag.wrong', { slot: name }), 'bad');
      },
    });

    this.statsBar = new StatsBar(statsHost);
    this.perf = new PerfPanel(viewport, {
      onAddLegs: () => this.loadDemoCombo('thorn_turtle'),
      onAddWings: () => this.loadDemoCombo('rocket_headbutt'),
      onClear: () => this.clearAll(),
    });

    this.tweakPanel = new TweakPanel(viewport, {
      onChange: (slot, tweak) => this.applyTweak(slot, tweak),
      onReset: (slot) => this.resetTweak(slot),
      onClose: () => this.rings.setSelected(null),
    });

    this.rewardModal = new RewardModal(viewport);

    // 左上角第 1 关进度 + 方案保存快捷条
    this.stageInfo = el('div', 'stage-info');
    const stageLine = el('div', 'stage-line');
    this.stageLineText = el('span', '', 'STAGE 1 · 菜园初遇（第 1 / 3 波）');
    stageLine.append(el('span', 'live-dot'), this.stageLineText);
    this.stageHintEl = el(
      'div',
      'stage-hint',
      '点「出战第 1 关」直接用键盘试玩教学关！击败动物即可随机三选一拿零件。',
    );
    this.presetBar = el('div', 'preset-bar');
    this.renderPresets();
    this.stageInfo.append(stageLine, this.stageHintEl, this.presetBar);
    viewport.append(this.stageInfo);

    // 右上角可折叠「第 1 关可遇动物图鉴」（默认展开让新玩家一眼看到能获得哪些动物！）
    this.catalogDrawer = this.buildCatalogDrawer();
    viewport.append(this.catalogDrawer);

    // 底部彩蛋组合提示栏
    this.stageFooter = el('div', 'stage-footer');
    const noteWrap = el('div', 'notes-wrap');
    noteWrap.append(el('span', 'notes-label', t('note.synergy')));
    this.notesEl = el('div', 'notes-list');
    noteWrap.append(this.notesEl);
    this.countEl = el('div', 'part-total', '0 PARTS');
    this.stageFooter.append(noteWrap, this.countEl);
    viewport.append(this.stageFooter);

    this.battleBadge = el('div', 'battle-badge', t('battle.auto'));
    this.battleBadge.hidden = true;
    viewport.append(this.battleBadge);

    // 键盘实时战斗场
    this.battle = new StageBattleArena(viewport, this.scene, this.player, this.enemy, {
      onWin: (wave) => this.handleWaveWin(wave),
      onLose: () => {
        // 战败弹窗由 StageBattleArena 呈现
      },
      onExit: () => this.endBattleToLab(),
      onRetry: () => this.startCurrentWave(),
    });

    this.toast = el('div', 'toast');
    root.append(this.toast);

    window.addEventListener('keydown', this.onGlobalKey);

    this.stats = deriveStats(this.creature, PART_DEFS, SYNERGIES);
    this.refresh();
    this.player.update(0.016, performance.now() / 1000, false);
    this.loop(performance.now());
  }

  private onGlobalKey = (ev: KeyboardEvent): void => {
    if (this.phase !== 'idle') return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      this.undo();
    }
  };

  private buildCatalogDrawer(): HTMLElement {
    const box = el('aside', 'catalog-drawer');
    const head = el('div', 'catalog-head');
    head.append(el('span', 'catalog-title', '🐾 第 1 关可遭遇动物 & 随机掉落'));
    const close = el('button', 'catalog-close', '收起');
    close.type = 'button';
    close.addEventListener('click', () => this.toggleCatalog());
    head.append(close);

    const list = el('div', 'catalog-list');
    for (const entry of STAGE1_CATALOG) {
      const row = el('div', 'catalog-item');
      const top = el('div', 'catalog-item-top');
      const dot = el('span', 'catalog-dot');
      dot.style.background = entry.iconColor;
      top.append(
        dot,
        el('b', 'catalog-name', entry.name),
        el('span', 'catalog-wave', `第 ${entry.wave} 波`),
      );
      const blurb = el('p', 'catalog-blurb', entry.blurb);
      const drops = el('div', 'catalog-drops');
      for (const id of entry.sampleDrops) {
        const def = PART_BY_ID[id];
        if (def) drops.append(el('span', 'catalog-drop-chip', def.name.zh));
      }
      row.append(top, blurb, drops);
      list.append(row);
    }

    box.append(head, list);
    return box;
  }

  private toggleCatalog(): void {
    const nextHidden = !this.catalogDrawer.hidden;
    this.catalogDrawer.hidden = nextHidden;
    this.catalogBtn.classList.toggle('active', !nextHidden);
  }

  /* ==========================================================================
   * 装配、叠阶、微调、撤销与方案保存
   * ========================================================================== */

  private pushHistory(): void {
    this.history.push(cloneCreature(this.creature));
    if (this.history.length > 25) this.history.shift();
    this.undoBtn.disabled = this.history.length === 0;
  }

  private undo(): void {
    if (this.phase !== 'idle' || this.history.length === 0) return;
    const prev = this.history.pop();
    if (!prev) return;
    this.creature = prev;
    this.undoBtn.disabled = this.history.length === 0;
    this.refresh();
    this.showToast(t('toast.undo'), 'info');
  }

  private equipPart(def: PartDef): void {
    if (this.phase !== 'idle') return;
    const res = applyEdit(this.creature, { type: 'equipOrUpgrade', slot: def.slot, defId: def.id });
    if (!res.ok) {
      if (res.code === 'max_level') this.showToast(t('toast.maxLevel', { name: def.name.zh }), 'info');
      else if (res.code === 'fusion_full') this.showToast(t('toast.fusionFull'), 'bad');
      else this.showToast(t('toast.error'), 'bad');
      return;
    }
    this.pushHistory();
    this.creature = res.creature;
    this.ownedIds.add(def.id);
    this.refresh();
    this.rings.flash(def.slot);
    this.player.flashSlot(def.slot);

    const curInst = this.creature.slots[def.slot].find((p) => p.defId === def.id);
    if (res.action === 'upgraded' && curInst) {
      this.showToast(t('toast.upgraded', { name: def.name.zh, lv: curInst.level }), 'ok');
    } else if (res.action === 'fused') {
      this.showToast(t('toast.fused', { name: def.name.zh, n: this.creature.slots.body.length }), 'ok');
    } else if (res.action === 'replaced') {
      this.showToast(t('toast.replaced', { name: def.name.zh }), 'ok');
    } else {
      this.showToast(t('toast.installed', { name: def.name.zh }), 'ok');
    }
  }

  private downgradePart(def: PartDef): void {
    if (this.phase !== 'idle') return;
    const res = applyEdit(this.creature, { type: 'downgradePart', slot: def.slot, defId: def.id });
    if (!res.ok) return;
    this.pushHistory();
    this.creature = res.creature;
    this.refresh();
    const curInst = this.creature.slots[def.slot].find((p) => p.defId === def.id);
    if (res.action === 'downgraded' && curInst) {
      this.showToast(t('toast.downgraded', { name: def.name.zh, lv: curInst.level }), 'info');
    } else {
      this.showToast(t('toast.removed', { name: def.name.zh }), 'info');
    }
  }

  private clearSlot(slot: SlotId): void {
    if (this.phase !== 'idle' || this.creature.slots[slot].length === 0) return;
    const res = applyEdit(this.creature, { type: 'clearSlot', slot });
    if (!res.ok) return;
    this.pushHistory();
    this.creature = res.creature;
    if (this.tweakPanel.slot === slot) this.tweakPanel.close();
    this.refresh();
    this.showToast(t('toast.cleared', { slot: t(`slot.${slot}.full` as 'slot.body.full') }), 'info');
  }

  private clearAll(): void {
    if (this.phase !== 'idle') return;
    this.pushHistory();
    this.creature = createCreature(this.creature.id);
    this.tweakPanel.close();
    this.rings.setSelected(null);
    this.refresh();
    this.showToast(t('toast.clearAll'), 'info');
  }

  private openTweak(slot: SlotId): void {
    if (this.phase !== 'idle') return;
    if (this.creature.slots[slot].length === 0) {
      this.showToast(`「${t(`slot.${slot}` as 'slot.body')}」还没装零件，装上后即可微调造型`, 'info');
      return;
    }
    this.rings.setSelected(slot);
    this.tweakPanel.open(slot, this.creature.tweaks?.[slot]);
  }

  private applyTweak(slot: SlotId, tweak: SlotTweak): void {
    const res = applyEdit(this.creature, { type: 'setTweak', slot, tweak });
    if (!res.ok) return;
    this.creature = res.creature;
    this.player.setCreature(this.creature);
  }

  private resetTweak(slot: SlotId): void {
    const res = applyEdit(this.creature, { type: 'resetTweak', slot });
    if (!res.ok) return;
    this.pushHistory();
    this.creature = res.creature;
    this.refresh();
    this.showToast(`已恢复「${t(`slot.${slot}` as 'slot.body')}」默认造型`, 'info');
  }

  private renderPresets(): void {
    this.presetBar.replaceChildren();
    this.presetBar.append(el('span', 'preset-label', '方案保存'));
    for (const key of ['1', '2', '3']) {
      const saved = this.presets[key];
      const wrap = el('div', 'preset-slot');
      const loadBtn = el('button', `preset-btn ${saved ? 'filled' : ''}`, saved ? `读取 #${key}` : `空槽 #${key}`);
      loadBtn.type = 'button';
      loadBtn.addEventListener('click', () => {
        if (!saved) {
          this.savePreset(key);
          return;
        }
        this.pushHistory();
        this.creature = cloneCreature(saved.creature);
        for (const s of SLOT_IDS) {
          for (const inst of this.creature.slots[s]) this.ownedIds.add(inst.defId);
        }
        this.refresh();
        this.showToast(`已切换至已保存方案 #${key}`, 'ok');
      });
      const saveBtn = el('button', 'preset-save', '存');
      saveBtn.type = 'button';
      saveBtn.title = `保存当前造型到方案 #${key}`;
      saveBtn.addEventListener('click', () => this.savePreset(key));
      wrap.append(loadBtn, saveBtn);
      this.presetBar.append(wrap);
    }
  }

  private savePreset(key: string): void {
    this.presets[key] = {
      name: `方案 #${key}`,
      creature: cloneCreature(this.creature),
      savedAt: Date.now(),
    };
    savePresets(this.presets);
    this.renderPresets();
    this.showToast(`已保存当前小鸡方案到 #${key}`, 'ok');
  }

  private loadDemoCombo(kind: 'thorn_turtle' | 'rocket_headbutt'): void {
    if (this.phase !== 'idle') return;
    this.pushHistory();
    this.sandboxMode = true;
    const loadout: Partial<Record<SlotId, string[]>> =
      kind === 'thorn_turtle'
        ? {
            body: ['body.turtle', 'body.hedgehog', 'body.puffer'],
            legs: ['legs.elephant', 'legs.elephant'],
            wings: ['wings.shield', 'wings.shield', 'wings.shield'],
            beak: ['beak.croc', 'beak.croc'],
            tail: ['tail.scorpion', 'tail.scorpion'],
            crest: ['crest.crown', 'crest.crown', 'crest.crown'],
          }
        : {
            body: ['body.swift', 'body.iron'],
            legs: ['legs.spring', 'legs.spring', 'legs.spring'],
            wings: ['wings.jetpack', 'wings.jetpack', 'wings.jetpack'],
            beak: ['beak.cannon', 'beak.cannon'],
            tail: ['tail.tesla', 'tail.tesla'],
            crest: ['crest.rhino', 'crest.rhino', 'crest.rhino'],
          };
    this.creature = buildCreatureFromLoadout(this.creature.id, loadout);
    for (const s of SLOT_IDS) {
      for (const inst of this.creature.slots[s]) this.ownedIds.add(inst.defId);
    }
    this.refresh();
    this.showToast(
      kind === 'thorn_turtle'
        ? '已一键试装：3 拼色「反甲铁龟 + 带刺弹力球 + 移动铁桶堡垒」'
        : '已一键试装：满 3 阶粒子「火箭头槌 + 高空制空炮台」',
      'ok',
    );
  }

  private resetRoguelikeRun(): void {
    if (this.phase !== 'idle') return;
    this.pushHistory();
    this.creature = createCreature(this.creature.id);
    this.ownedIds.clear();
    this.sandboxMode = false;
    this.currentWaveIdx = 0;
    this.stageCleared = false;
    this.tweakPanel.close();
    this.rings.setSelected(null);
    this.refresh();
    this.showToast('已重开第 1 关肉鸽闯关，光鸡起步！', 'info');
  }

  private refresh(): void {
    this.player.setCreature(this.creature);
    this.sidebar.setState(this.creature, this.ownedIds, this.sandboxMode);
    this.rings.setCreature(this.creature);
    this.stats = deriveStats(this.creature, PART_DEFS, SYNERGIES);
    this.statsBar.setStats(this.stats);

    const bodyCount = this.creature.slots.body.length;
    this.countEl.textContent = `已装 ${countParts(this.creature)} 项 · 躯干拼色 ${bodyCount}/3`;
    this.renderNotes(synergyNotes(this.creature, PART_DEFS, SYNERGIES));

    const wave = STAGE1_WAVES[this.currentWaveIdx] ?? STAGE1_WAVES[0];
    this.stageLineText.textContent = this.stageCleared
      ? 'STAGE 1 已通关！可继续刷第 1 关叠 3 阶或自由试装'
      : `STAGE 1 · 菜园初遇（第 ${wave.waveNumber} / ${STAGE1_WAVES.length} 波：${wave.name}）`;
    this.stageHintEl.textContent = this.stageCleared
      ? '已解锁第 1 关循环挑战！点左侧「全件试装」也可直接体验全部 36 件与 8 组彩蛋。'
      : `下波对手：${wave.name}（${wave.animalTag}）· 点击槽位环可微调 3D 造型。`;
    this.fightBtn.textContent = this.stageCleared
      ? `再刷第 1 关 · W${wave.waveNumber}`
      : `出战第 1 关 · W${wave.waveNumber}`;
  }

  private renderNotes(notes: readonly SynergyNote[]): void {
    this.notesEl.replaceChildren();
    if (notes.length === 0) {
      this.notesEl.append(
        el('span', 'note-empty', '暂未触发彩蛋（试试乌龟壳+刺猬身、喷气翼+犀牛角、蜻蜓翼+炮口！）'),
      );
      return;
    }
    for (const note of notes.slice(0, 4)) {
      this.notesEl.append(el('span', `note-chip ${note.tone}`, note.text.zh));
    }
    if (notes.length > 4) this.notesEl.append(el('span', 'note-more', `+${notes.length - 4}`));
  }

  /* ==========================================================================
   * 第 1 关闯关 & 战后肉鸽三选一
   * ========================================================================== */

  private startCurrentWave(): void {
    if (this.phase === 'battle') return;
    const wave = STAGE1_WAVES[this.currentWaveIdx] ?? STAGE1_WAVES[0];

    this.phase = 'battle';
    this.tweakPanel.close();
    this.rings.setSelected(null);
    this.rings.setVisible(false);
    this.sidebar.setDisabled(true);
    this.fightBtn.disabled = true;
    this.fightBtn.textContent = t('button.fighting');
    this.battleBadge.hidden = false;
    this.stageInfo.hidden = true;
    this.stageFooter.hidden = true;
    this.catalogDrawer.hidden = true;
    this.catalogBtn.classList.remove('active');

    const enemyCreature = buildCreatureFromLoadout(`enemy-${wave.id}`, wave.loadout);
    this.enemy.setCreature(enemyCreature);
    const enemyDerived = deriveStats(enemyCreature, PART_DEFS, SYNERGIES);

    this.battle.start(wave, this.stats, enemyDerived);
    this.showToast(`第 ${wave.waveNumber} 波开始：迎战「${wave.name}」！`, 'ok');
  }

  private handleWaveWin(wave: StageWaveDef): void {
    this.phase = 'reward';
    const seed = (Date.now() ^ (wave.waveNumber * 2654435761)) >>> 0;
    const options = rollThreeRewards(wave, this.creature, seed);
    this.rewardModal.open(wave.name, wave.waveNumber, options, (pickedDef) => {
      this.ownedIds.add(pickedDef.id);
      this.endBattleToLab();
      this.equipPart(pickedDef);
      if (this.currentWaveIdx + 1 < STAGE1_WAVES.length) {
        this.currentWaveIdx += 1;
      } else {
        this.stageCleared = true;
        this.currentWaveIdx = 0;
        this.showToast('🎉 第 1 关通关！已保留所有掉落零件，可继续刷关冲 3 阶或试装全图鉴！', 'ok');
      }
      this.refresh();
    });
  }

  private endBattleToLab(): void {
    this.battle.stop();
    this.rewardModal.close();
    this.phase = 'idle';
    this.rings.setVisible(true);
    this.sidebar.setDisabled(false);
    this.fightBtn.disabled = false;
    this.battleBadge.hidden = true;
    this.stageInfo.hidden = false;
    this.stageFooter.hidden = false;
    this.refresh();
  }

  /* ==========================================================================
   * 性能 / toast / 主循环
   * ========================================================================== */

  private togglePerf(): void {
    const open = !this.perf.isOpen;
    this.perf.setOpen(open);
    this.perfBtn.classList.toggle('active', open);
  }

  private showToast(text: string, tone: 'ok' | 'bad' | 'info' = 'info'): void {
    window.clearTimeout(this.pendingToast ?? undefined);
    this.toast.textContent = text;
    this.toast.className = `toast show ${tone}`;
    this.pendingToast = window.setTimeout(() => {
      this.toast.className = 'toast';
    }, 2200);
  }

  private loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    const seconds = now / 1000;

    if (this.phase === 'battle') {
      this.battle.update(dt, now);
    }
    this.player.update(dt, seconds, this.phase === 'battle');
    this.enemy.update(dt, seconds, this.phase === 'battle');
    this.scene.render(now);
    this.statsBar.update(dt);
    if (this.phase === 'idle') {
      this.rings.position(this.player, this.scene);
    }
    this.perf.update(this.scene.stats, countParts(this.creature), now);
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onGlobalKey);
    cancelAnimationFrame(this.raf);
    this.battle.dispose();
    this.player.dispose();
    this.enemy.dispose();
    this.scene.dispose();
    this.root.replaceChildren();
  }
}
