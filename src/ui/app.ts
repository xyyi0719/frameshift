/**
 * 拼装小鸡 · 四页面多屏架构主编排（P-035 ~ P-038）
 * ---------------------------------------------------------------
 * 路线 A 完整画面流（配流畅幕布转场 + 3D 镜头切换）：
 *   1. 'title'    ：全屏 3D 游戏主页面
 *   2. 'assembly' ：专属装配车间（左侧 36 件动物+机械零件库、躯干 3 拼色、3 阶粒子、微调、撤销、3 方案保存）
 *   3. 'select'   ：关卡目录页（1 ~ 6 关目录卡片）
 *   4. 'level'    ：全屏 2.5D 横版 3D 推图关卡（聚焦式实体键帽教学 + 单细胞/小动物小怪 + 关底 BOSS + 右上角终点小地图 + 三选一）
 */

import './../styles.css';
import {
  PART_BY_ID,
  PART_DEFS,
  SLOT_IDS,
  STAGE1_CATALOG,
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
  type StageEncounter,
  type SynergyNote,
} from '../core';
import { ChickModel } from '../render3d/chick';
import { SceneView } from '../render3d/scene';
import { el } from './dom';
import { PartDrag } from './drag';
import { PerfPanel } from './perf';
import { RewardModal } from './reward-modal';
import { SlotRings } from './rings';
import { LevelSelectScreen, ScreenTransition, TitleScreen } from './screens';
import { Sidebar } from './sidebar';
import { StageBattleArena } from './stage-battle';
import { StatsBar } from './stats-bar';
import { t } from './strings';
import { TweakPanel } from './tweak-panel';

type AppScreen = 'title' | 'assembly' | 'select' | 'level';

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
    // ignore storage quota errors
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

  private readonly transition: ScreenTransition;
  private readonly titleScreen: TitleScreen;
  private readonly levelSelectScreen: LevelSelectScreen;

  // 装配车间专属 UI 层
  private readonly topbar: HTMLElement;
  private readonly sidebarHost: HTMLElement;
  private readonly sidebar: Sidebar;
  private readonly rings: SlotRings;
  private readonly statsBar: StatsBar;
  private readonly perf: PerfPanel;
  private readonly tweakPanel: TweakPanel;
  private readonly rewardModal: RewardModal;
  private readonly battle: StageBattleArena;
  private readonly drag: PartDrag;
  private readonly toast: HTMLElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly catalogBtn: HTMLButtonElement;
  private readonly catalogDrawer: HTMLElement;
  private readonly presetBar: HTMLElement;
  private readonly notesEl: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly stageInfo: HTMLElement;
  private readonly stageFooter: HTMLElement;

  private screen: AppScreen = 'title';
  private creature: Creature = createCreature('local-chick');
  private history: Creature[] = [];
  private ownedIds = new Set<string>();
  private sandboxMode = false;
  private stage1Cleared = false;
  private stats: CreatureStats;
  private lastFrame = performance.now();
  private raf = 0;
  private pendingToast: number | null = null;
  private presets: Record<string, SavedPreset> = loadPresets();

  constructor(root: HTMLElement) {
    this.root = root;
    root.classList.add('build-a-chick', 'screen-title');
    root.replaceChildren();

    // ---------- 1. 全屏底层 3D 画布（四页面共享，切换时平滑运镜） ----------
    const stageRoot = el('div', 'app-stage-root');
    const sceneHost = el('div', 'scene-host');
    stageRoot.append(sceneHost);
    root.append(stageRoot);

    this.scene = new SceneView(sceneHost);
    this.player = new ChickModel({ variant: 'player' });
    this.scene.attach(this.player.root);
    this.scene.attach(this.player.shadow);

    // ---------- 2. 装配车间 UI（仅在 screen === 'assembly' 时显示） ----------
    this.topbar = el('header', 'topbar assembly-only');
    const brand = el('div', 'brand');
    const backHome = el('button', 'btn ghost home-back-btn', '← 主页');
    backHome.type = 'button';
    backHome.addEventListener('click', () => this.goScreen('title'));
    const brandText = el('div', 'brand-text');
    brandText.append(
      el('h1', 'brand-title', '装配车间'),
      el('div', 'brand-sub', 'ASSEMBLY WORKSHOP'),
    );
    brand.append(backHome, brandText);

    const statsHost = el('div', 'stats-host');
    const actions = el('div', 'top-actions');

    this.undoBtn = el('button', 'btn ghost', t('button.undo'));
    this.undoBtn.type = 'button';
    this.undoBtn.disabled = true;
    this.undoBtn.addEventListener('click', () => this.undo());

    this.catalogBtn = el('button', 'btn ghost', '生物图鉴');
    this.catalogBtn.type = 'button';
    this.catalogBtn.addEventListener('click', () => this.toggleCatalog());

    const toSelectBtn = el('button', 'btn primary fight-btn', '选择关卡 →');
    toSelectBtn.type = 'button';
    toSelectBtn.addEventListener('click', () => this.goScreen('select'));

    actions.append(this.undoBtn, this.catalogBtn, toSelectBtn);
    this.topbar.append(brand, statsHost, actions);
    root.append(this.topbar);

    const assemblyShell = el('div', 'assembly-shell assembly-only');
    this.sidebarHost = el('div', 'sidebar-host');
    const assemblyOverlay = el('div', 'assembly-overlay');
    assemblyShell.append(this.sidebarHost, assemblyOverlay);
    root.append(assemblyShell);

    this.sidebar = new Sidebar(this.sidebarHost, {
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
          sandbox ? '已开启全件试装（36 件全开，可自由体验 3 拼色与 3 阶粒子）' : '已切回肉鸽背包模式',
          'info',
        );
      },
    });

    this.rings = new SlotRings(assemblyOverlay, (slot) => this.openTweak(slot));
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

    this.tweakPanel = new TweakPanel(assemblyOverlay, {
      onChange: (slot, tweak) => this.applyTweak(slot, tweak),
      onReset: (slot) => this.resetTweak(slot),
      onClose: () => this.rings.setSelected(null),
    });

    // 装配台左上角方案保存栏
    this.stageInfo = el('div', 'stage-info');
    const stageLine = el('div', 'stage-line');
    stageLine.append(el('span', 'live-dot'), el('span', '', '点击槽位环可微调 3D 造型 · 躯干支持 3 拼色融合'));
    this.presetBar = el('div', 'preset-bar');
    this.renderPresets();
    this.stageInfo.append(stageLine, this.presetBar);
    assemblyOverlay.append(this.stageInfo);

    // 装配台可折叠生物图鉴（默认收起，点顶栏按钮展开，画面更干净）
    this.catalogDrawer = this.buildCatalogDrawer();
    this.catalogDrawer.hidden = true;
    assemblyOverlay.append(this.catalogDrawer);

    // 装配台底部彩蛋组合提示
    this.stageFooter = el('div', 'stage-footer');
    const noteWrap = el('div', 'notes-wrap');
    noteWrap.append(el('span', 'notes-label', t('note.synergy')));
    this.notesEl = el('div', 'notes-list');
    noteWrap.append(this.notesEl);
    this.countEl = el('div', 'part-total', '0 PARTS');
    this.stageFooter.append(noteWrap, this.countEl);
    assemblyOverlay.append(this.stageFooter);

    // ---------- 3. 页面 1：主页面 ----------
    this.titleScreen = new TitleScreen(root, {
      onStartAssembly: () => this.goScreen('assembly'),
      onGoLevelSelect: () => this.goScreen('select'),
      onResetRun: () => this.resetRoguelikeRun(),
    });

    // ---------- 4. 页面 3：关卡目录页（1 ~ 6 关） ----------
    this.levelSelectScreen = new LevelSelectScreen(root, {
      onBackToAssembly: () => this.goScreen('assembly'),
      onBackToTitle: () => this.goScreen('title'),
      onEnterLevel: (item) => {
        if (item.unlocked) this.enterStage1();
      },
    });

    // ---------- 5. 页面 4：全屏 2.5D/3D 推图关卡 ----------
    this.battle = new StageBattleArena(root, this.scene, this.player, {
      onRequestLoot: (encounter, onPicked) => this.openLootModal(encounter, onPicked),
      onStageClear: () => {
        this.stage1Cleared = true;
        this.titleScreen.setSummary(this.ownedIds.size, this.stage1Cleared);
      },
      onGoAssembly: () => this.goScreen('assembly'),
      onGoLevelSelect: () => this.goScreen('select'),
      onRetry: () => this.enterStage1(false),
    });

    // 战后随机三选一弹窗 + F3 性能面板 + 转场层 + Toast
    this.rewardModal = new RewardModal(root);
    this.perf = new PerfPanel(root, {
      onAddLegs: () => this.loadDemoCombo('thorn_turtle'),
      onAddWings: () => this.loadDemoCombo('rocket_headbutt'),
      onClear: () => this.clearAll(),
    });
    this.transition = new ScreenTransition(root);
    this.toast = el('div', 'toast');
    root.append(this.toast);

    window.addEventListener('keydown', this.onGlobalKey);

    this.stats = deriveStats(this.creature, PART_DEFS, SYNERGIES);
    this.refresh();
    this.applyScreenImmediate('title');
    this.player.update(0.016, performance.now() / 1000, false);
    this.loop(performance.now());
  }

  /* ==========================================================================
   * 四页面切换 + 转场运镜（路线 A）
   * ========================================================================== */

  private goScreen(next: AppScreen): void {
    const banners: Partial<Record<AppScreen, { title: string; subtitle: string; holdMs: number }>> = {
      assembly: { title: '装配车间', subtitle: '给小鸡装上动物与机械零件', holdMs: 180 },
      select: { title: '关卡目录', subtitle: '选择要挑战的演化地图', holdMs: 180 },
    };
    this.transition.run(() => this.applyScreenImmediate(next), banners[next]);
  }

  private enterStage1(withBanner = true): void {
    const banner = withBanner
      ? { title: 'STAGE 01 · 微光池畔', subtitle: '从单细胞开始进化 · 击败关底 BOSS 夺取技能', holdMs: 650 }
      : undefined;
    this.transition.run(() => {
      this.applyScreenImmediate('level');
      this.battle.start(this.stats, true);
    }, banner);
  }

  private applyScreenImmediate(next: AppScreen): void {
    if (this.screen === 'level' && next !== 'level') {
      this.battle.stop();
      this.rewardModal.close();
    }
    this.screen = next;
    this.root.classList.remove('screen-title', 'screen-assembly', 'screen-select', 'screen-level');
    this.root.classList.add(`screen-${next}`);

    this.titleScreen.setVisible(next === 'title');
    this.levelSelectScreen.setVisible(next === 'select');
    this.rings.setVisible(next === 'assembly');
    if (next !== 'assembly') {
      this.tweakPanel.close();
      this.rings.setSelected(null);
    }

    this.scene.setMode(next, next === 'level');
    if (next !== 'level') {
      this.player.setWorld(0, 0, 0);
      this.player.setFacing(1);
      this.player.setDown(false);
    }

    if (next === 'select') {
      this.levelSelectScreen.render(
        `出战小鸡：HP ${this.stats.hp} · ATK ${this.stats.atk} · DEF ${this.stats.def} · 已装 ${countParts(this.creature)} 项`,
        this.stage1Cleared,
      );
    }
    this.titleScreen.setSummary(this.ownedIds.size, this.stage1Cleared);
    this.refresh();
  }

  private openLootModal(
    encounter: StageEncounter,
    onPicked: (nextStats: CreatureStats) => void,
  ): void {
    const pool = encounter.dropPool ?? [];
    const seed = (Date.now() ^ (encounter.spawnX * 2654435)) >>> 0;
    const options = rollThreeRewards(pool, this.creature, seed, encounter.isBoss);
    this.rewardModal.open(encounter.name, encounter.isBoss ? 3 : 1, options, (pickedDef) => {
      this.ownedIds.add(pickedDef.id);
      const res = applyEdit(this.creature, {
        type: 'equipOrUpgrade',
        slot: pickedDef.slot,
        defId: pickedDef.id,
      });
      if (res.ok) {
        this.creature = res.creature;
        this.stats = res.stats;
        this.player.setCreature(this.creature);
        this.player.flashSlot(pickedDef.slot);
        this.showToast(`获得并装备：${pickedDef.name.zh}！`, 'ok');
      } else {
        this.showToast(`「${pickedDef.name.zh}」已收入零件背包！`, 'info');
      }
      this.refresh();
      onPicked(this.stats);
    });
  }

  /* ==========================================================================
   * 快捷键 / 图鉴 / 装配 / 撤销 / 方案保存
   * ========================================================================== */

  private onGlobalKey = (ev: KeyboardEvent): void => {
    if (ev.code === 'F3') {
      ev.preventDefault();
      this.perf.setOpen(!this.perf.isOpen);
      return;
    }
    if (this.screen === 'assembly' && (ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      this.undo();
    }
  };

  private buildCatalogDrawer(): HTMLElement {
    const box = el('aside', 'catalog-drawer');
    const head = el('div', 'catalog-head');
    head.append(el('span', 'catalog-title', '🧬 第 1 关生物演化与掉落图鉴'));
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
      top.append(dot, el('b', 'catalog-name', entry.name));
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

  private pushHistory(): void {
    this.history.push(cloneCreature(this.creature));
    if (this.history.length > 25) this.history.shift();
    this.undoBtn.disabled = this.history.length === 0;
  }

  private undo(): void {
    if (this.screen !== 'assembly' || this.history.length === 0) return;
    const prev = this.history.pop();
    if (!prev) return;
    this.creature = prev;
    this.undoBtn.disabled = this.history.length === 0;
    this.refresh();
    this.showToast(t('toast.undo'), 'info');
  }

  private equipPart(def: PartDef): void {
    if (this.screen !== 'assembly') return;
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
    if (this.screen !== 'assembly') return;
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
    if (this.screen !== 'assembly' || this.creature.slots[slot].length === 0) return;
    const res = applyEdit(this.creature, { type: 'clearSlot', slot });
    if (!res.ok) return;
    this.pushHistory();
    this.creature = res.creature;
    if (this.tweakPanel.slot === slot) this.tweakPanel.close();
    this.refresh();
    this.showToast(t('toast.cleared', { slot: t(`slot.${slot}.full` as 'slot.body.full') }), 'info');
  }

  private clearAll(): void {
    if (this.screen !== 'assembly') return;
    this.pushHistory();
    this.creature = createCreature(this.creature.id);
    this.tweakPanel.close();
    this.rings.setSelected(null);
    this.refresh();
    this.showToast(t('toast.clearAll'), 'info');
  }

  private openTweak(slot: SlotId): void {
    if (this.screen !== 'assembly') return;
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
        this.showToast(`已切换至方案 #${key}`, 'ok');
      });
      const saveBtn = el('button', 'preset-save', '存');
      saveBtn.type = 'button';
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
    this.showToast(`已保存当前小鸡造型到方案 #${key}`, 'ok');
  }

  private loadDemoCombo(kind: 'thorn_turtle' | 'rocket_headbutt'): void {
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
    this.showToast('已加载演示预设！', 'ok');
  }

  private resetRoguelikeRun(): void {
    this.creature = createCreature(this.creature.id);
    this.history = [];
    this.ownedIds.clear();
    this.sandboxMode = false;
    this.stage1Cleared = false;
    this.undoBtn.disabled = true;
    this.refresh();
    this.titleScreen.setSummary(0, false);
    this.showToast('已重置肉鸽存档，光鸡重新出发！', 'info');
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

    if (this.screen === 'level') {
      this.battle.update(dt, now);
    }
    this.player.update(dt, seconds, this.screen === 'level');
    this.scene.render(now);
    this.statsBar.update(dt);
    if (this.screen === 'assembly') {
      this.rings.position(this.player, this.scene);
    }
    this.perf.update(this.scene.stats, countParts(this.creature), now);
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onGlobalKey);
    cancelAnimationFrame(this.raf);
    this.battle.dispose();
    this.player.dispose();
    this.scene.dispose();
    this.root.replaceChildren();
  }
}
