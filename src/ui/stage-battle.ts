/**
 * 第 1 关 · 全屏 2.5D 横版 3D 推进关卡（P-035 ~ P-038）
 * ---------------------------------------------------------------
 * 核心体验：
 *   1. 聚焦式分步教学 + 实体 3D 立体机械键帽（按下实时下陷高亮）：
 *        Step 0: [A][D] 移动 → Step 1: [Space] 跳过木桩 → Step 2: [J] 击败单细胞变形虫 → Step 3: [K] 特性冲刺
 *   2. 敌人层次：先单细胞生物小怪（变形虫/草履虫）→ 再菜园小动物（小刺猬/小青蛙）→ 关底大怪 BOSS（巨型弹跳青蛙王）
 *   3. 右上角实时终点小地图：清晰显示玩家位置、每个小怪点、BOSS 图标与终点旗帜距离！
 *   4. 击败阶段小怪群与关底 BOSS 时弹出「随机三选一」盲盒零件，选完原地发光变身继续推进！
 */

import * as THREE from 'three';
import {
  STAGE1_ENCOUNTERS,
  STAGE1_HURDLE_X,
  STAGE1_LENGTH,
  type CreatureStats,
  type StageEncounter,
} from '../core';
import type { ChickModel } from '../render3d/chick';
import { EnemyModel3D } from '../render3d/enemies';
import type { SceneView } from '../render3d/scene';
import { el } from './dom';
import { t } from './strings';

type TutorialStep = 'move' | 'jump' | 'attack' | 'special' | 'done';

interface ActiveEnemy {
  readonly def: StageEncounter;
  readonly model: EnemyModel3D;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  alive: boolean;
  awake: boolean;
  atkTimer: number;
  jumpTimer: number;
  shotTimer: number;
  poisonTime: number;
  poisonTick: number;
  slowTime: number;
  lunge: number;
  dotEl: HTMLElement;
}

interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  atkCooldown: number;
  specialCooldown: number;
  guardTime: number;
  dashTime: number;
  poisonTime: number;
  poisonTick: number;
  slowTime: number;
  regenTick: number;
  teslaTick: number;
  reviveUsed: boolean;
  lunge: number;
  jumpedInStep: boolean;
}

interface Projectile3D {
  mesh: THREE.Mesh;
  side: 'player' | 'enemy';
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  canHitAir: boolean;
  life: number;
  pierce: boolean;
  poison: boolean;
  slow: boolean;
}

interface BeamFx3D {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

interface FloatingTag {
  node: HTMLElement;
  born: number;
}

export interface StageBattleCallbacks {
  onRequestLoot: (
    encounter: StageEncounter,
    onPicked: (nextStats: CreatureStats) => void,
  ) => void;
  onStageClear: (elapsedSec: number) => void;
  onGoAssembly: () => void;
  onGoLevelSelect: () => void;
  onRetry: () => void;
}

const ARENA_MIN_X = -1.5;
const ARENA_MAX_X = STAGE1_LENGTH + 1.5;
const GRAVITY = -22;

function makeKeycap(label: string, sub?: string, wide = false): HTMLElement {
  const cap = el('kbd', `keycap${wide ? ' wide' : ''}`);
  cap.append(el('span', 'keycap-top', label));
  if (sub) cap.append(el('span', 'keycap-sub', sub));
  return cap;
}

export class StageBattleArena {
  readonly el: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly playerHpFill: HTMLElement;
  private readonly playerHpText: HTMLElement;
  private readonly targetPanel: HTMLElement;
  private readonly targetNameEl: HTMLElement;
  private readonly targetBioEl: HTMLElement;
  private readonly targetHpFill: HTMLElement;
  private readonly targetHpText: HTMLElement;

  // 右上角实时终点小地图
  private readonly minimapEl: HTMLElement;
  private readonly minimapTrack: HTMLElement;
  private readonly minimapPlayerDot: HTMLElement;
  private readonly minimapStatus: HTMLElement;

  // 聚焦式分步教学层（带聚光灯压暗 + 实体立体键帽）
  private readonly spotlightMask: HTMLElement;
  private readonly focusCard: HTMLElement;
  private readonly focusStepBadge: HTMLElement;
  private readonly focusTitle: HTMLElement;
  private readonly focusKeysWrap: HTMLElement;
  private readonly focusDesc: HTMLElement;

  // 生物进化科普条
  private readonly bioBanner: HTMLElement;
  private readonly bioBannerTag: HTMLElement;
  private readonly bioBannerText: HTMLElement;

  // 底部实时联动实体键盘条
  private readonly keyStrip: HTMLElement;
  private readonly hudCaps = new Map<string, HTMLElement>();
  private readonly specialCapLabel: HTMLElement;

  private readonly floatLayer: HTMLElement;
  private readonly resultModal: HTMLElement;
  private readonly resultTitle: HTMLElement;
  private readonly resultSub: HTMLElement;
  private readonly resultStats: HTMLElement;

  private active = false;
  private paused = false;
  private finished = false;
  private playerStats!: CreatureStats;
  private p!: PlayerState;
  private enemies: ActiveEnemy[] = [];
  private tutorialStep: TutorialStep = 'move';
  private tutorialDoneOnce = false;
  private startAt = 0;
  private elapsed = 0;
  private bioBannerTimer = 0;

  private readonly keys = new Set<string>();
  private projectiles: Projectile3D[] = [];
  private beams: BeamFx3D[] = [];
  private floats: FloatingTag[] = [];
  private readonly tmpVec = new THREE.Vector3();
  private readonly projPt = { x: 0, y: 0, visible: false };

  constructor(
    host: HTMLElement,
    private readonly scene: SceneView,
    private readonly playerModel: ChickModel,
    private readonly cb: StageBattleCallbacks,
  ) {
    this.el = el('div', 'level-hud-layer');
    this.el.hidden = true;

    // 1. 顶部左上玩家血条 + 中央目标/BOSS血条
    this.hud = el('div', 'level-top-bar');

    const pBox = el('div', 'level-hp-card player');
    const pTop = el('div', 'battle-side-top');
    pTop.append(el('span', 'battle-name', '🐤 你的小鸡'));
    this.playerHpText = el('span', 'battle-hp-text', '30 / 30');
    pTop.append(this.playerHpText);
    const pTrack = el('div', 'battle-hp-track');
    this.playerHpFill = el('i', 'battle-hp-fill');
    pTrack.append(this.playerHpFill);
    pBox.append(pTop, pTrack);

    this.targetPanel = el('div', 'level-hp-card enemy');
    this.targetPanel.hidden = true;
    const tTop = el('div', 'battle-side-top');
    this.targetNameEl = el('span', 'battle-name', '敌人');
    this.targetHpText = el('span', 'battle-hp-text', '');
    tTop.append(this.targetNameEl, this.targetHpText);
    const tTrack = el('div', 'battle-hp-track');
    this.targetHpFill = el('i', 'battle-hp-fill');
    tTrack.append(this.targetHpFill);
    this.targetBioEl = el('div', 'target-bio-tag', '');
    this.targetPanel.append(tTop, tTrack, this.targetBioEl);

    // 2. 右上角实时终点小地图（P-037）
    this.minimapEl = el('div', 'minimap-card');
    const mmHead = el('div', 'minimap-head');
    mmHead.append(el('span', 'minimap-title', '🗺 第 1 关小地图'), el('span', 'minimap-flag-label', '🏁 终点 36m'));
    this.minimapTrack = el('div', 'minimap-track');
    const line = el('div', 'minimap-rail');
    const finishMark = el('span', 'minimap-finish', '🏁');
    this.minimapPlayerDot = el('span', 'minimap-player', '🐤');
    this.minimapTrack.append(line, finishMark, this.minimapPlayerDot);
    this.minimapStatus = el('div', 'minimap-status', '距离终点 36m · 起点教学区');
    this.minimapEl.append(mmHead, this.minimapTrack, this.minimapStatus);

    this.hud.append(pBox, this.targetPanel, this.minimapEl);

    // 3. 生物学习科普提示条（遇新生物时顶部柔和弹出）
    this.bioBanner = el('div', 'bio-banner');
    this.bioBanner.hidden = true;
    this.bioBannerTag = el('span', 'bio-banner-tag', '');
    this.bioBannerText = el('span', 'bio-banner-text', '');
    this.bioBanner.append(this.bioBannerTag, this.bioBannerText);

    // 4. 聚焦式分步教学层（聚光灯遮罩 + 屏幕中下大号立体按键卡片，P-036）
    this.spotlightMask = el('div', 'tutorial-spotlight');
    this.spotlightMask.hidden = true;
    this.focusCard = el('div', 'focus-tutorial-card');
    this.focusCard.hidden = true;
    const fHead = el('div', 'focus-head');
    this.focusStepBadge = el('span', 'focus-step', '教学 1 / 4');
    const skipBtn = el('button', 'focus-skip', '跳过教学');
    skipBtn.type = 'button';
    skipBtn.addEventListener('click', () => this.finishTutorial());
    fHead.append(this.focusStepBadge, skipBtn);
    this.focusTitle = el('h3', 'focus-title', '');
    this.focusKeysWrap = el('div', 'focus-keys');
    this.focusDesc = el('p', 'focus-desc', '');
    this.focusCard.append(fHead, this.focusTitle, this.focusKeysWrap, this.focusDesc);

    // 5. 底部常驻实体立体键帽栏 + 撤退按钮
    this.keyStrip = el('div', 'keycap-hud-bar');
    const addHudKey = (codes: string[], label: string, actionText: string, wide = false): HTMLElement => {
      const group = el('div', 'hud-key-group');
      const cap = makeKeycap(label, undefined, wide);
      for (const c of codes) this.hudCaps.set(c, cap);
      const txt = el('span', 'hud-key-action', actionText);
      group.append(cap, txt);
      this.keyStrip.append(group);
      return txt;
    };
    addHudKey(['KeyA', 'ArrowLeft'], 'A', '左移');
    addHudKey(['KeyD', 'ArrowRight'], 'D', '右移');
    addHudKey(['Space', 'KeyW', 'ArrowUp'], 'Space', '3D 跳跃', true);
    addHudKey(['KeyJ'], 'J', '攻击');
    this.specialCapLabel = addHudKey(['KeyK', 'ShiftLeft', 'ShiftRight'], 'K', '特性冲刺');

    const backWrap = el('div', 'hud-back-actions');
    const asmBtn = el('button', 'btn ghost retreat-btn', '回装配');
    asmBtn.type = 'button';
    asmBtn.addEventListener('click', () => this.cb.onGoAssembly());
    const mapBtn = el('button', 'btn ghost retreat-btn', '选关');
    mapBtn.type = 'button';
    mapBtn.addEventListener('click', () => this.cb.onGoLevelSelect());
    backWrap.append(asmBtn, mapBtn);
    this.keyStrip.append(backWrap);

    this.floatLayer = el('div', 'damage-layer');

    // 6. 通关 / 战败结算弹窗
    this.resultModal = el('div', 'result-backdrop');
    this.resultModal.hidden = true;
    const card = el('div', 'result-card');
    card.append(el('div', 'eyebrow', 'STAGE 01 · 关卡结算'));
    this.resultTitle = el('h2', 'result-title', '');
    this.resultSub = el('p', 'result-sub', '');
    this.resultStats = el('div', 'result-stats');
    const actions = el('div', 'result-actions');
    const toAsm = el('button', 'btn primary', '回装配车间改装');
    toAsm.type = 'button';
    toAsm.addEventListener('click', () => this.cb.onGoAssembly());
    const toDir = el('button', 'btn ghost', '返回关卡目录');
    toDir.type = 'button';
    toDir.addEventListener('click', () => this.cb.onGoLevelSelect());
    const retryBtn = el('button', 'btn ghost', '再玩第 1 关');
    retryBtn.type = 'button';
    retryBtn.addEventListener('click', () => this.cb.onRetry());
    actions.append(toAsm, toDir, retryBtn);
    card.append(this.resultTitle, this.resultSub, this.resultStats, actions);
    this.resultModal.append(card);

    this.el.append(
      this.spotlightMask,
      this.hud,
      this.bioBanner,
      this.focusCard,
      this.keyStrip,
      this.floatLayer,
      this.resultModal,
    );
    host.appendChild(this.el);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    host.addEventListener('pointerdown', this.onArenaPointer);
  }

  start(playerStats: CreatureStats, showTutorial: boolean): void {
    this.stop();
    this.playerStats = playerStats;
    this.active = true;
    this.paused = false;
    this.finished = false;
    this.startAt = performance.now();
    this.elapsed = 0;

    this.p = {
      x: 0.5,
      y: 0,
      vx: 0,
      vy: 0,
      facing: 1,
      hp: playerStats.hp,
      maxHp: playerStats.hp,
      atkCooldown: 0,
      specialCooldown: 0,
      guardTime: 0,
      dashTime: 0,
      poisonTime: 0,
      poisonTick: 0,
      slowTime: 0,
      regenTick: 0,
      teslaTick: 1.5,
      reviveUsed: false,
      lunge: 0,
      jumpedInStep: false,
    };

    // 在 36m 跑道上生成所有单细胞小怪、小动物小怪与关底 BOSS！
    this.enemies = STAGE1_ENCOUNTERS.map((def) => {
      const model = new EnemyModel3D(def.kind);
      model.setWorld(def.spawnX, 0, 0);
      model.setFacing(-1);
      this.scene.attach(model.root);
      this.scene.attach(model.shadow);

      const dotEl = el('span', `minimap-dot ${def.isBoss ? 'boss' : 'mob'}`, def.isBoss ? '👑' : '');
      dotEl.style.left = `${(def.spawnX / STAGE1_LENGTH) * 100}%`;
      dotEl.title = def.name;
      this.minimapTrack.append(dotEl);

      return {
        def,
        model,
        x: def.spawnX,
        y: 0,
        vx: 0,
        vy: 0,
        facing: -1,
        hp: def.hp,
        maxHp: def.hp,
        alive: true,
        awake: false,
        atkTimer: 0.9,
        jumpTimer: 1.4,
        shotTimer: 2.0,
        poisonTime: 0,
        poisonTick: 0,
        slowTime: 0,
        lunge: 0,
        dotEl,
      };
    });

    this.playerModel.setDown(false);
    this.playerModel.setWorld(this.p.x, 0, 0);
    this.playerModel.setFacing(1);
    this.scene.setFollowX(this.p.x);

    this.el.hidden = false;
    this.resultModal.hidden = true;
    this.targetPanel.hidden = true;

    if (showTutorial && !this.tutorialDoneOnce) {
      this.setTutorialStep('move');
    } else {
      this.finishTutorial();
    }
    this.updatePlayerBar();
    this.updateMinimap();
  }

  private setTutorialStep(step: TutorialStep): void {
    this.tutorialStep = step;
    if (step === 'done') {
      this.spotlightMask.hidden = true;
      this.focusCard.hidden = true;
      this.tutorialDoneOnce = true;
      return;
    }

    this.spotlightMask.hidden = false;
    this.focusCard.hidden = false;
    this.focusKeysWrap.replaceChildren();

    if (step === 'move') {
      this.focusStepBadge.textContent = '聚焦教学 1 / 4 · 移动';
      this.focusTitle.textContent = '先让小鸡跑起来！';
      this.focusKeysWrap.append(
        makeKeycap('A', '左移'),
        makeKeycap('D', '右移'),
      );
      this.focusDesc.textContent = '按住键盘 D 键（或右方向键 →）向右前进，迈出进化的第一步！';
    } else if (step === 'jump') {
      this.focusStepBadge.textContent = '聚焦教学 2 / 4 · 3D 跳跃';
      this.focusTitle.textContent = '跳过前方的木桩！';
      this.focusKeysWrap.append(makeKeycap('Space', '空格跳跃', true));
      this.focusDesc.textContent = '按下空格键跃向半空跳过木桩！战斗时跳到空中还可以躲开地面攻击。';
    } else if (step === 'attack') {
      this.focusStepBadge.textContent = '聚焦教学 3 / 4 · 战斗攻击';
      this.focusTitle.textContent = '击败前方的单细胞变形虫！';
      this.focusKeysWrap.append(makeKeycap('J', '攻击'));
      this.focusDesc.textContent = '靠近绿藻变形虫，按 J 键（或左键点击画面）啄击它，开启进化之路！';
    } else if (step === 'special') {
      this.focusStepBadge.textContent = '聚焦教学 4 / 4 · 特性冲刺';
      this.focusTitle.textContent = '试试你的特性冲刺！';
      this.focusKeysWrap.append(makeKeycap('K', '特性 / 冲刺'));
      this.focusDesc.textContent = '按一下 K 键（或 Shift）发动冲刺/护盾/火箭头槌！随后一路向右击败小怪和关底 BOSS！';
    }
  }

  private finishTutorial(): void {
    this.setTutorialStep('done');
  }

  private showBioFact(tag: string, fact: string): void {
    this.bioBannerTag.textContent = `🧬 ${tag}`;
    this.bioBannerText.textContent = fact;
    this.bioBanner.hidden = false;
    this.bioBannerTimer = 5.5;
  }

  private onKeyDown = (ev: KeyboardEvent): void => {
    if (!this.active || this.paused || this.finished) return;
    const tag = (ev.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const code = ev.code;
    if (
      code === 'Space' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight' ||
      code === 'ArrowUp' ||
      code === 'KeyA' ||
      code === 'KeyD' ||
      code === 'KeyW' ||
      code === 'KeyJ' ||
      code === 'KeyK' ||
      code === 'ShiftLeft' ||
      code === 'ShiftRight'
    ) {
      ev.preventDefault();
    }

    const fresh = !this.keys.has(code);
    this.keys.add(code);
    this.syncKeycapVisual(code, true);

    if (fresh && (code === 'Space' || code === 'KeyW' || code === 'ArrowUp')) {
      this.tryPlayerJump();
    }
    if (fresh && code === 'KeyJ') {
      this.tryPlayerAttack();
    }
    if (fresh && (code === 'KeyK' || code === 'ShiftLeft' || code === 'ShiftRight')) {
      this.tryPlayerSpecial();
    }
  };

  private onKeyUp = (ev: KeyboardEvent): void => {
    this.keys.delete(ev.code);
    this.syncKeycapVisual(ev.code, false);
  };

  private syncKeycapVisual(code: string, pressed: boolean): void {
    const cap = this.hudCaps.get(code);
    if (cap) cap.classList.toggle('pressed', pressed);

    // 同步高亮聚焦教学卡片中的对应实体键帽！
    if (!this.focusCard.hidden) {
      const labelMap: Record<string, string> = {
        KeyA: 'A',
        ArrowLeft: 'A',
        KeyD: 'D',
        ArrowRight: 'D',
        Space: 'Space',
        KeyW: 'Space',
        ArrowUp: 'Space',
        KeyJ: 'J',
        KeyK: 'K',
        ShiftLeft: 'K',
        ShiftRight: 'K',
      };
      const targetLabel = labelMap[code];
      if (targetLabel) {
        const caps = this.focusKeysWrap.querySelectorAll<HTMLElement>('.keycap');
        caps.forEach((elCap) => {
          if (elCap.querySelector('.keycap-top')?.textContent === targetLabel) {
            elCap.classList.toggle('pressed', pressed);
          }
        });
      }
    }
  }

  private onArenaPointer = (ev: PointerEvent): void => {
    if (!this.active || this.paused || this.finished) return;
    const target = ev.target as HTMLElement;
    if (target.closest('button') || target.closest('.result-backdrop') || target.closest('.reward-backdrop')) return;
    if (ev.button === 0) this.tryPlayerAttack();
  };

  private nearestAliveEnemy(): ActiveEnemy | null {
    let best: ActiveEnemy | null = null;
    let bestDist = Infinity;
    for (const en of this.enemies) {
      if (!en.alive) continue;
      const d = Math.abs(en.x - this.p.x);
      if (d < bestDist) {
        bestDist = d;
        best = en;
      }
    }
    return best;
  }

  private tryPlayerJump(): void {
    const traits = this.playerStats.traits;
    const grounded = this.p.y <= 0.02;
    if (grounded) {
      let impulse = 7.2;
      if (traits.includes('super_jump')) impulse = 10.8;
      else if (traits.includes('jump')) impulse = 9.2;
      if (traits.includes('lightweight')) impulse += 1.0;
      this.p.vy = impulse;
      this.p.jumpedInStep = true;
      if (traits.includes('jump')) {
        this.spawnCallout(this.playerModel, traits.includes('super_jump') ? '弹簧高跳！' : '青蛙高跳！', 'accent');
      }
    } else if (this.playerStats.flags.grounded && this.playerStats.tags.includes('bio_wing')) {
      this.spawnCallout(this.playerModel, '太沉啦飞不动！', 'bad');
    } else if (traits.includes('jet_boost') && this.p.specialCooldown <= 0.5) {
      this.p.vy = Math.max(this.p.vy, 7.8);
      this.spawnCallout(this.playerModel, '喷气升空！', 'accent');
    }
  }

  private tryPlayerAttack(): void {
    if (this.p.atkCooldown > 0) return;
    const st = this.playerStats;
    const fast = st.traits.includes('fast_hit') || st.traits.includes('meat_grinder');
    const heavy = st.traits.includes('heavy_bite');
    this.p.atkCooldown = fast ? 0.25 : heavy ? 0.56 : 0.36;
    this.p.lunge = 0.32 * this.p.facing;

    const target = this.nearestAliveEnemy();
    const isCannon = st.traits.includes('cannon_shot');
    const isTongue = st.traits.includes('tongue_whip');

    if (isCannon) {
      const dir = target ? (target.x >= this.p.x ? 1 : -1) : this.p.facing;
      this.p.facing = dir;
      const dx = target ? target.x - this.p.x : dir * 6;
      const dy = target ? target.y + 1.0 - (this.p.y + 1.4) : 0;
      const len = Math.max(0.5, Math.hypot(dx, dy));
      this.spawnProjectile({
        side: 'player',
        x: this.p.x + dir * 0.85,
        y: this.p.y + 1.45,
        vx: (dx / len) * 10.5,
        vy: (dy / len) * 10.5,
        damage: Math.max(5, Math.round(st.atk * (st.traits.includes('sky_turret') && this.p.y > 0.4 ? 1.35 : 1.0))),
        canHitAir: true,
        pierce: st.traits.includes('armor_pierce'),
        poison: st.traits.includes('poison'),
        slow: st.traits.includes('slow_on_hit'),
      });
      this.scene.shake(performance.now(), 0.04);
      return;
    }

    if (isTongue && target && Math.abs(target.x - this.p.x) <= 5.6) {
      this.p.facing = target.x >= this.p.x ? 1 : -1;
      this.spawnBeam(this.p.x + this.p.facing * 0.8, this.p.y + 1.5, target.x, target.y + 1.0, 0xf26aa8, 0.18);
      this.damageEnemy(target, Math.max(5, Math.round(st.atk * (target.y > 0.45 ? 1.25 : 1.0))), {
        canHitAir: true,
        melee: false,
      });
      return;
    }

    // 近战范围命中（可同时扫中面前距离内的敌怪）
    const range = st.traits.includes('knockback') ? 2.65 : 2.3;
    let hitAny = false;
    for (const en of this.enemies) {
      if (!en.alive) continue;
      const dx = Math.abs(en.x - this.p.x);
      if (dx <= range) {
        const dy = Math.abs(en.y - this.p.y);
        if (dy > 1.05 && !st.flags.canHitAir) {
          this.spawnCallout(en.model, '空中闪避！', 'accent');
          hitAny = true;
          continue;
        }
        let dmg = st.atk;
        if (st.traits.includes('claw_bonus')) dmg = Math.round(dmg * 1.18);
        if (st.traits.includes('air_strike') && this.p.y > 0.4) dmg = Math.round(dmg * 1.3);
        if (heavy) dmg = Math.round(dmg * 1.35);
        this.damageEnemy(en, dmg, { canHitAir: st.flags.canHitAir || this.p.y > 0.45, melee: true });
        hitAny = true;
      }
    }
    if (!hitAny && target && Math.abs(target.x - this.p.x) < 4.5) {
      this.spawnCallout(this.playerModel, '再靠近一点！', 'dim');
    }
  }

  private tryPlayerSpecial(): void {
    if (this.p.specialCooldown > 0) return;
    const st = this.playerStats;
    if (this.tutorialStep === 'special') {
      this.spawnCallout(this.playerModel, '✓ 教学全部完成！冲向终点！', 'combo');
      this.finishTutorial();
    }

    if (st.traits.includes('rocket_headbutt')) {
      this.p.specialCooldown = 2.5;
      this.p.dashTime = 0.28;
      this.p.vx = this.p.facing * 14.5;
      this.spawnBeam(this.p.x, this.p.y + 1.1, this.p.x - this.p.facing * 2.2, this.p.y + 1.1, 0xff6a24, 0.26);
      this.spawnCallout(this.playerModel, '🔥 火箭头槌！', 'combo');
      for (const en of this.enemies) {
        if (en.alive && Math.abs(en.x - this.p.x) <= 3.6) {
          this.damageEnemy(en, Math.round(st.atk * 1.85), { canHitAir: true, melee: true, forcePierce: true, knockback: 2.2 });
        }
      }
    } else if (st.traits.includes('shield_block')) {
      this.p.specialCooldown = 2.8;
      this.p.guardTime = 1.6;
      this.spawnCallout(this.playerModel, '🛡 举盾格挡！', 'accent');
    } else if (st.traits.includes('jet_boost')) {
      this.p.specialCooldown = 2.2;
      this.p.dashTime = 0.24;
      this.p.vx = this.p.facing * 12;
      this.p.vy = Math.max(this.p.vy, 6.4);
      this.spawnCallout(this.playerModel, '🚀 喷气爆发！', 'accent');
    } else if (st.traits.includes('charge_horn')) {
      this.p.specialCooldown = 2.4;
      this.p.dashTime = 0.22;
      this.p.vx = this.p.facing * 11.5;
      this.spawnCallout(this.playerModel, '犀牛铁头撞！', 'accent');
      for (const en of this.enemies) {
        if (en.alive && Math.abs(en.x - this.p.x) <= 3.0) {
          this.damageEnemy(en, Math.round(st.atk * 1.45), { canHitAir: false, melee: true, forcePierce: true, knockback: 1.5 });
        }
      }
    } else {
      this.p.specialCooldown = 1.6;
      this.p.dashTime = 0.2;
      this.p.vx = this.p.facing * 10;
      this.spawnCallout(this.playerModel, '灵巧冲刺！', 'accent');
    }
  }

  private damageEnemy(
    en: ActiveEnemy,
    rawDmg: number,
    opts: { canHitAir: boolean; melee: boolean; forcePierce?: boolean; knockback?: number },
  ): void {
    const st = this.playerStats;
    const pierce = opts.forcePierce || st.traits.includes('armor_pierce');
    const effDef = pierce ? en.def.def * 0.45 : en.def.def;
    let dmg = rawDmg / (1 + effDef * 0.1);
    const critChance = st.traits.includes('guaranteed_lock')
      ? 0.45
      : st.traits.includes('crit_boost')
        ? 0.3
        : 0.14;
    const crit = Math.random() < critChance;
    if (crit) dmg *= 1.5;

    const finalDmg = Math.max(2, Math.round(dmg));
    en.hp = Math.max(0, en.hp - finalDmg);
    en.model.hit(performance.now() / 1000);
    this.scene.shake(performance.now(), crit ? 0.08 : 0.04);

    this.spawnCallout(en.model, crit ? `暴击 -${finalDmg}!` : `-${finalDmg}`, crit ? 'combo' : 'hit');

    const kb = opts.knockback ?? (st.traits.includes('knockback') ? 1.2 : 0.4);
    const dir = en.x >= this.p.x ? 1 : -1;
    en.x = Math.min(ARENA_MAX_X, Math.max(ARENA_MIN_X, en.x + dir * (en.def.isBoss ? kb * 0.45 : kb)));

    if (st.traits.includes('poison')) en.poisonTime = 4.0;
    if (st.traits.includes('slow_on_hit')) en.slowTime = 2.6;

    // 菜园小刺猬近战反刺科普体验
    if (opts.melee && en.def.kind === 'hedgehog_mob') {
      const thorn = Math.max(1, Math.round(finalDmg * 0.18));
      this.p.hp = Math.max(1, this.p.hp - thorn);
      this.spawnCallout(this.playerModel, `被刺扎 -${thorn}`, 'bad');
    }

    if (en.hp <= 0) {
      this.onEnemyDefeated(en);
    }
  }

  private damagePlayer(rawDmg: number, fromEnemy: ActiveEnemy, opts: { canHitAir: boolean; melee: boolean }): void {
    const st = this.playerStats;
    if (this.p.y > 0.72 && !opts.canHitAir) {
      this.spawnCallout(this.playerModel, '跳起躲过！', 'accent');
      return;
    }
    if (st.traits.includes('dodge') && Math.random() < 0.24) {
      this.spawnCallout(this.playerModel, '灵巧闪避！', 'accent');
      return;
    }

    let dmg = rawDmg / (1 + st.def * 0.1);
    if (this.p.guardTime > 0) {
      dmg *= 0.3;
      this.spawnCallout(this.playerModel, '铁盾格挡！', 'accent');
    }
    const finalDmg = Math.max(1, Math.round(dmg));
    this.p.hp = Math.max(0, this.p.hp - finalDmg);
    this.playerModel.hit(performance.now() / 1000);
    this.scene.shake(performance.now(), 0.06);
    this.spawnCallout(this.playerModel, `-${finalDmg}`, 'bad');

    // 玩家反伤 / 河豚弹开
    if (opts.melee && fromEnemy.alive) {
      if (st.traits.includes('thorns') || st.traits.includes('thorn_turtle') || st.traits.includes('spiky_puffer')) {
        const mult = st.traits.includes('thorn_turtle') || st.traits.includes('spiky_puffer') ? 0.5 : 0.28;
        const ref = Math.max(2, Math.round(finalDmg * mult));
        fromEnemy.hp = Math.max(0, fromEnemy.hp - ref);
        this.spawnCallout(fromEnemy.model, `反刺 -${ref}`, 'accent');
        if (fromEnemy.hp <= 0) this.onEnemyDefeated(fromEnemy);
      }
      if (st.traits.includes('bounce_knockback') || st.traits.includes('spiky_puffer')) {
        const pushDir = fromEnemy.x >= this.p.x ? 1 : -1;
        fromEnemy.x = Math.min(ARENA_MAX_X, Math.max(ARENA_MIN_X, fromEnemy.x + pushDir * 1.4));
        this.spawnCallout(fromEnemy.model, '弹飞！', 'accent');
      }
    }

    // 壁虎断尾保命
    if (this.p.hp <= 0 && st.traits.includes('revive_tail') && !this.p.reviveUsed) {
      this.p.reviveUsed = true;
      this.p.hp = Math.max(10, Math.round(this.p.maxHp * 0.4));
      this.spawnCallout(this.playerModel, '🦎 断尾保命！', 'combo');
    }
  }

  private onEnemyDefeated(en: ActiveEnemy): void {
    en.alive = false;
    en.model.setDown(true);
    en.dotEl.classList.add('dead');
    this.spawnCallout(en.model, en.def.isBoss ? '👑 BOSS 击倒！' : '击败！', 'combo');

    // 延迟淡出隐藏倒地小怪
    window.setTimeout(() => {
      if (!en.alive) {
        en.model.root.visible = false;
        en.model.shadow.visible = false;
      }
    }, 650);

    // 第 3 步教学：打倒第一只单细胞变形虫 → 自动切入第 4 步特性冲刺教学！
    if (this.tutorialStep === 'attack' && en.def.id === 'mob-amoeba-1') {
      this.setTutorialStep('special');
    }

    // 触发阶段性肉鸽三选一（小怪群 / 关底 BOSS 掉落招牌技能！）
    if (en.def.triggersLoot && en.def.dropPool && en.def.dropPool.length > 0) {
      this.paused = true;
      this.keys.clear();
      this.cb.onRequestLoot(en.def, (nextStats) => {
        const hpDelta = Math.max(0, nextStats.hp - this.p.maxHp);
        this.playerStats = nextStats;
        this.p.maxHp = nextStats.hp;
        // 升级进化时顺带回一小口血保持闯关爽感
        this.p.hp = Math.min(this.p.maxHp, this.p.hp + hpDelta + Math.round(this.p.maxHp * 0.25));
        this.paused = false;
        this.spawnCallout(this.playerModel, '✨ 进化变身！', 'combo');
        this.updatePlayerBar();

        if (en.def.isBoss) {
          this.showBioFact('BOSS 击倒！', '终点旗帜就在前方！冲过终点拱门完成第 1 关！');
        }
      });
    }
  }

  update(dt: number, now: number): void {
    if (!this.active) return;
    this.updateFloats(now);
    this.updateBeams(dt);

    for (const en of this.enemies) {
      en.model.update(dt, now / 1000);
    }

    if (this.paused || this.finished) return;

    this.elapsed = (now - this.startAt) / 1000;
    if (this.bioBannerTimer > 0) {
      this.bioBannerTimer -= dt;
      if (this.bioBannerTimer <= 0) this.bioBanner.hidden = true;
    }

    // ---- 1. 玩家水平移动 & 矮木桩障碍碰撞 ----
    const moveL = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const moveR = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    const holdJump = this.keys.has('Space') || this.keys.has('KeyW') || this.keys.has('ArrowUp');

    const baseSpd = 3.2 + (this.playerStats.spd / 100) * 2.2;
    const spd = baseSpd * (this.p.slowTime > 0 ? 0.55 : 1) * (this.playerStats.traits.includes('propeller_boost') ? 1.18 : 1);

    if (this.p.dashTime <= 0) {
      if (moveL && !moveR) {
        this.p.vx = -spd;
        this.p.facing = -1;
      } else if (moveR && !moveL) {
        this.p.vx = spd;
        this.p.facing = 1;
      } else {
        this.p.vx = 0;
      }
    }

    const prevX = this.p.x;
    const prevY = this.p.y;
    let nextX = Math.min(ARENA_MAX_X, Math.max(ARENA_MIN_X, this.p.x + this.p.vx * dt));

    // 教学矮木桩（高度 0.55）：必须按 Space 跳起才能越过！
    if (this.p.y < 0.45 && Math.abs(nextX - STAGE1_HURDLE_X) < 0.55) {
      if (prevX < STAGE1_HURDLE_X && nextX > STAGE1_HURDLE_X - 0.55) {
        nextX = STAGE1_HURDLE_X - 0.55;
      } else if (prevX > STAGE1_HURDLE_X && nextX < STAGE1_HURDLE_X + 0.55) {
        nextX = STAGE1_HURDLE_X + 0.55;
      }
    }

    // 还没击败关底 BOSS 时，终点拱门暂时挡路
    const boss = this.enemies.find((e) => e.def.isBoss);
    if (boss && boss.alive && nextX > STAGE1_LENGTH - 1.2) {
      nextX = STAGE1_LENGTH - 1.2;
    }

    this.p.x = nextX;

    // 垂直物理与滞空滑翔
    const gliding = holdJump && this.p.vy < 0 && this.p.y > 0.25 && this.playerStats.flags.canGlide;
    this.p.vy += (gliding ? GRAVITY * 0.22 : GRAVITY) * dt;
    this.p.y += this.p.vy * dt;
    if (this.p.y <= 0) {
      if (prevY > 0.9 && this.playerStats.traits.includes('land_shock')) {
        for (const en of this.enemies) {
          if (en.alive && Math.abs(en.x - this.p.x) <= 2.6 && en.y <= 0.4) {
            this.damageEnemy(en, Math.max(4, Math.round(this.playerStats.atk * 0.75)), { canHitAir: false, melee: false, knockback: 1.0 });
          }
        }
        this.spawnCallout(this.playerModel, '震荡落地！', 'accent');
      }
      this.p.y = 0;
      this.p.vy = 0;
    }

    // ---- 2. 聚焦教学进度推进（一步完自动切下一步！） ----
    if (this.tutorialStep === 'move' && this.p.x >= 3.2) {
      this.spawnCallout(this.playerModel, '✓ 移动掌握！', 'accent');
      this.p.jumpedInStep = false;
      this.setTutorialStep('jump');
    } else if (this.tutorialStep === 'jump' && this.p.x >= STAGE1_HURDLE_X + 0.8 && this.p.jumpedInStep) {
      this.spawnCallout(this.playerModel, '✓ 漂亮的一跳！', 'accent');
      this.setTutorialStep('attack');
    }

    // ---- 3. 玩家被动（回血、特斯拉电尾）与状态冷却 ----
    if (this.p.atkCooldown > 0) this.p.atkCooldown = Math.max(0, this.p.atkCooldown - dt);
    if (this.p.specialCooldown > 0) this.p.specialCooldown = Math.max(0, this.p.specialCooldown - dt);
    if (this.p.guardTime > 0) this.p.guardTime = Math.max(0, this.p.guardTime - dt);
    if (this.p.dashTime > 0) this.p.dashTime = Math.max(0, this.p.dashTime - dt);
    if (this.p.slowTime > 0) this.p.slowTime = Math.max(0, this.p.slowTime - dt);

    if (this.playerStats.traits.includes('regen')) {
      this.p.regenTick += dt;
      if (this.p.regenTick >= 2.0 && this.p.hp < this.p.maxHp) {
        this.p.regenTick = 0;
        const heal = Math.max(2, Math.round(this.p.maxHp * 0.06));
        this.p.hp = Math.min(this.p.maxHp, this.p.hp + heal);
        this.spawnCallout(this.playerModel, `+${heal}`, 'heal');
      }
    }
    if (this.playerStats.traits.includes('tesla_zap')) {
      this.p.teslaTick -= dt;
      const tEn = this.nearestAliveEnemy();
      if (this.p.teslaTick <= 0 && tEn && Math.abs(tEn.x - this.p.x) <= 5.5) {
        this.p.teslaTick = 2.0;
        this.spawnBeam(this.p.x - this.p.facing * 0.4, this.p.y + 1.5, tEn.x, tEn.y + 1.0, 0x4cc9ff, 0.22);
        this.damageEnemy(tEn, Math.max(4, Math.round(this.playerStats.atk * 0.7)), { canHitAir: true, melee: false });
      }
    }

    // ---- 4. 沿途小怪 & 关底 BOSS AI ----
    this.updateEnemies(dt);
    this.updateProjectiles(dt);

    // ---- 5. 同步 3D 玩家与 2.5D 跟随镜头 ----
    this.p.lunge *= Math.max(0, 1 - dt * 14);
    this.playerModel.setWorld(this.p.x, this.p.y, 0);
    this.playerModel.setFacing(this.p.facing);
    this.playerModel.setMoving(Math.abs(this.p.vx) > 0.2);
    this.playerModel.setLunge(this.p.lunge);
    this.scene.setFollowX(this.p.x);

    this.updatePlayerBar();
    this.updateTargetBar();
    this.updateMinimap();

    if (this.p.specialCooldown > 0) {
      this.specialCapLabel.textContent = `冷却 ${this.p.specialCooldown.toFixed(1)}s`;
    } else {
      this.specialCapLabel.textContent = this.playerStats.traits.includes('rocket_headbutt')
        ? '火箭头槌'
        : this.playerStats.traits.includes('shield_block')
          ? '举盾格挡'
          : '特性冲刺';
    }

    // ---- 6. 抵达终点旗帜（且 BOSS 已倒）→ 第 1 关通关！ ----
    if ((!boss || !boss.alive) && this.p.x >= STAGE1_LENGTH - 0.8) {
      this.finished = true;
      this.cleanupFx();
      this.showVictory();
      this.cb.onStageClear(this.elapsed);
    } else if (this.p.hp <= 0) {
      this.finished = true;
      this.playerModel.setDown(true);
      this.cleanupFx();
      this.showDefeat();
    }
  }

  private updateEnemies(dt: number): void {
    for (const en of this.enemies) {
      if (!en.alive) continue;

      const dx = this.p.x - en.x;
      const dist = Math.abs(dx);

      // 靠近 8.5m 时唤醒该遭遇，并弹出生物科普条！
      if (!en.awake && dist <= 8.5) {
        en.awake = true;
        this.showBioFact(en.def.bioTag, en.def.bioFact);
      }
      if (!en.awake) continue;

      const dir: 1 | -1 = dx >= 0 ? 1 : -1;
      en.facing = dir;

      const baseSpd = 1.2 + (en.def.spd / 100) * 1.5;
      const spd = baseSpd * (en.slowTime > 0 ? 0.55 : 1);
      const stopDist = en.def.isBoss ? 2.2 : 1.65;
      en.vx = dist > stopDist ? dir * spd : 0;

      // 跳跃型青蛙 / 青蛙王 BOSS
      if (en.def.aiStyle === 'hopper' || en.def.aiStyle === 'boss_king') {
        en.jumpTimer -= dt;
        if (en.jumpTimer <= 0 && en.y <= 0.02) {
          en.vy = en.def.isBoss ? 9.4 : 7.8;
          en.vx = dir * spd * 1.4;
          en.jumpTimer = en.def.isBoss ? 2.9 : 2.6;
          this.spawnCallout(en.model, en.def.isBoss ? '👑 蛙王高跳砸地！' : '跳起！', 'dim');
        }
      }

      const prevY = en.y;
      en.vy += GRAVITY * dt;
      en.x = Math.min(ARENA_MAX_X, Math.max(STAGE1_HURDLE_X + 1.2, en.x + en.vx * dt));
      en.y += en.vy * dt;
      if (en.y <= 0) {
        if (prevY > 0.85 && dist <= (en.def.isBoss ? 3.0 : 2.1)) {
          this.damagePlayer(en.def.atk, en, { canHitAir: false, melee: false });
        }
        en.y = 0;
        en.vy = 0;
      }

      // 近战攻击
      en.atkTimer -= dt;
      if (en.atkTimer <= 0 && dist <= stopDist + 0.35) {
        en.atkTimer = en.def.isBoss ? 1.15 : 1.25;
        en.lunge = 0.25 * dir;
        this.damagePlayer(en.def.atk, en, { canHitAir: false, melee: true });
      }

      // BOSS 远程黏液泡泡弹
      if (en.def.isBoss) {
        en.shotTimer -= dt;
        if (en.shotTimer <= 0 && dist <= 9.5) {
          en.shotTimer = 2.6;
          const speed = 5.4;
          const tx = this.p.x - en.x;
          const ty = this.p.y + 1.1 - (en.y + 1.5);
          const len = Math.max(0.5, Math.hypot(tx, ty));
          this.spawnProjectile({
            side: 'enemy',
            x: en.x + dir * 1.0,
            y: en.y + 1.5,
            vx: (tx / len) * speed,
            vy: (ty / len) * speed,
            damage: Math.max(5, Math.round(en.def.atk * 0.8)),
            canHitAir: true,
            pierce: false,
            poison: false,
            slow: false,
          });
        }
      }

      // 中毒与减速
      if (en.slowTime > 0) en.slowTime = Math.max(0, en.slowTime - dt);
      if (en.poisonTime > 0) {
        en.poisonTime -= dt;
        en.poisonTick += dt;
        if (en.poisonTick >= 0.85) {
          en.poisonTick = 0;
          const d = Math.max(2, Math.round(en.maxHp * 0.04));
          en.hp = Math.max(0, en.hp - d);
          this.spawnCallout(en.model, `中毒 -${d}`, 'poison');
          if (en.hp <= 0) this.onEnemyDefeated(en);
        }
      }

      en.lunge *= Math.max(0, 1 - dt * 14);
      en.model.setWorld(en.x, en.y, 0);
      en.model.setFacing(en.facing);
      en.model.setMoving(Math.abs(en.vx) > 0.15);
      en.model.setLunge(en.lunge);
    }
  }

  private spawnProjectile(init: Omit<Projectile3D, 'mesh' | 'life'>): void {
    const geo = new THREE.SphereGeometry(init.side === 'enemy' ? 0.24 : 0.18, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color: init.side === 'enemy' ? 0x9bff59 : 0xff6e4a });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(init.x, init.y, 0);
    this.scene.attach(mesh);
    this.projectiles.push({ ...init, mesh, life: 2.2 });
  }

  private updateProjectiles(dt: number): void {
    const alive: Projectile3D[] = [];
    for (const pr of this.projectiles) {
      pr.life -= dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.mesh.position.set(pr.x, pr.y, 0);

      let hit = false;
      if (pr.side === 'player') {
        for (const en of this.enemies) {
          if (!en.alive) continue;
          if (Math.hypot(pr.x - en.x, pr.y - (en.y + 1.0)) <= (en.def.isBoss ? 1.35 : 0.95)) {
            this.damageEnemy(en, pr.damage, { canHitAir: pr.canHitAir, melee: false, forcePierce: pr.pierce });
            hit = true;
            break;
          }
        }
      } else if (Math.hypot(pr.x - this.p.x, pr.y - (this.p.y + 1.1)) <= 0.9) {
        const boss = this.enemies.find((e) => e.def.isBoss) ?? this.enemies[0];
        if (boss) this.damagePlayer(pr.damage, boss, { canHitAir: pr.canHitAir, melee: false });
        hit = true;
      }

      if (hit || pr.life <= 0 || pr.y < 0) {
        this.scene.detach(pr.mesh);
        pr.mesh.geometry.dispose();
        (pr.mesh.material as THREE.Material).dispose();
        continue;
      }
      alive.push(pr);
    }
    this.projectiles = alive;
  }

  private spawnBeam(x1: number, y1: number, x2: number, y2: number, color: number, duration: number): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.max(0.2, Math.hypot(dx, dy));
    const geo = new THREE.CylinderGeometry(0.06, 0.06, len, 6);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0.1);
    mesh.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
    this.scene.attach(mesh);
    this.beams.push({ mesh, life: duration, maxLife: duration });
  }

  private updateBeams(dt: number): void {
    const alive: BeamFx3D[] = [];
    for (const b of this.beams) {
      b.life -= dt;
      if (b.life <= 0) {
        this.scene.detach(b.mesh);
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
        continue;
      }
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, b.life / b.maxLife);
      alive.push(b);
    }
    this.beams = alive;
  }

  private updatePlayerBar(): void {
    const pct = Math.max(0, Math.min(100, (this.p.hp / Math.max(1, this.p.maxHp)) * 100));
    this.playerHpFill.style.width = `${pct}%`;
    this.playerHpText.textContent = `${Math.ceil(this.p.hp)} / ${this.p.maxHp}`;
  }

  private updateTargetBar(): void {
    const target = this.nearestAliveEnemy();
    if (!target || Math.abs(target.x - this.p.x) > 10.5) {
      this.targetPanel.hidden = true;
      return;
    }
    this.targetPanel.hidden = false;
    this.targetPanel.classList.toggle('boss', target.def.isBoss);
    this.targetNameEl.textContent = target.def.isBoss ? `👑 BOSS · ${target.def.name}` : target.def.name;
    this.targetBioEl.textContent = target.def.bioTag;
    const pct = Math.max(0, Math.min(100, (target.hp / Math.max(1, target.maxHp)) * 100));
    this.targetHpFill.style.width = `${pct}%`;
    this.targetHpText.textContent = `${Math.ceil(target.hp)} / ${target.maxHp}`;
  }

  private updateMinimap(): void {
    const pct = Math.max(0, Math.min(100, (this.p.x / STAGE1_LENGTH) * 100));
    this.minimapPlayerDot.style.left = `${pct}%`;
    const remain = Math.max(0, Math.round(STAGE1_LENGTH - this.p.x));
    const nextEn = this.enemies.find((e) => e.alive && e.x >= this.p.x - 1);
    if (!nextEn) {
      this.minimapStatus.textContent = `距离终点 ${remain}m · 🏁 冲向终点旗帜！`;
    } else if (nextEn.def.isBoss) {
      this.minimapStatus.textContent = `距离终点 ${remain}m · 👑 前方 BOSS：${nextEn.def.name}`;
    } else {
      this.minimapStatus.textContent = `距离终点 ${remain}m · 前方：${nextEn.def.name}`;
    }
  }

  private spawnCallout(
    model: { getHeadWorld: (out: THREE.Vector3) => THREE.Vector3 },
    text: string,
    tone: 'hit' | 'bad' | 'accent' | 'combo' | 'heal' | 'poison' | 'dim',
  ): void {
    model.getHeadWorld(this.tmpVec);
    this.scene.project(this.tmpVec, this.projPt);
    if (!this.projPt.visible) return;
    const node = el('div', `damage-number tone-${tone}`, text);
    node.style.left = `${this.projPt.x + (Math.random() - 0.5) * 28}px`;
    node.style.top = `${this.projPt.y - 16}px`;
    this.floatLayer.append(node);
    this.floats.push({ node, born: performance.now() });
  }

  private updateFloats(now: number): void {
    this.floats = this.floats.filter((f) => {
      if (now - f.born > 920) {
        f.node.remove();
        return false;
      }
      return true;
    });
  }

  private showVictory(): void {
    this.resultTitle.textContent = '🎉 第 1 关通关！';
    this.resultTitle.className = 'result-title left';
    this.resultSub.textContent = '你从单细胞一路进化，击败了巨型弹跳青蛙王并抵达终点！';
    this.resultStats.replaceChildren();
    this.addStat('通关用时', `${this.elapsed.toFixed(1)}s`);
    this.addStat('剩余生命', `${Math.ceil(this.p.hp)} HP`);
    this.addStat('击败敌人', `${this.enemies.length} / ${this.enemies.length}`);
    this.resultModal.hidden = false;
  }

  private showDefeat(): void {
    this.resultTitle.textContent = t('battle.lose');
    this.resultTitle.className = 'result-title right';
    this.resultSub.textContent = '挑战失败！已获得的进化零件都保留在背包里，回去改装后再战！';
    this.resultStats.replaceChildren();
    const defeated = this.enemies.filter((e) => !e.alive).length;
    this.addStat('已推进距离', `${Math.round(this.p.x)} / ${STAGE1_LENGTH}m`);
    this.addStat('已击败敌人', `${defeated} / ${this.enemies.length}`);
    this.addStat('坚持用时', `${this.elapsed.toFixed(1)}s`);
    this.resultModal.hidden = false;
  }

  private addStat(label: string, value: string): void {
    const box = el('div', 'result-stat');
    box.append(el('span', '', label), el('b', '', value));
    this.resultStats.append(box);
  }

  private cleanupFx(): void {
    for (const pr of this.projectiles) {
      this.scene.detach(pr.mesh);
      pr.mesh.geometry.dispose();
      (pr.mesh.material as THREE.Material).dispose();
    }
    this.projectiles = [];
    for (const b of this.beams) {
      this.scene.detach(b.mesh);
      b.mesh.geometry.dispose();
      (b.mesh.material as THREE.Material).dispose();
    }
    this.beams = [];
  }

  stop(): void {
    this.active = false;
    this.paused = false;
    this.finished = false;
    this.keys.clear();
    this.cleanupFx();
    for (const en of this.enemies) {
      this.scene.detach(en.model.root);
      this.scene.detach(en.model.shadow);
      en.model.dispose();
      en.dotEl.remove();
    }
    this.enemies = [];
    this.el.hidden = true;
    this.resultModal.hidden = true;
    this.spotlightMask.hidden = true;
    this.focusCard.hidden = true;
    this.bioBanner.hidden = true;
    this.floatLayer.replaceChildren();
    this.floats = [];
    this.playerModel.setWorld(0, 0, 0);
    this.playerModel.setFacing(1);
    this.playerModel.setLunge(0);
    this.playerModel.setMoving(false);
    this.playerModel.setDown(false);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.stop();
  }
}
