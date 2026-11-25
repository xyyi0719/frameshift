/**
 * 第 1 关 · 电脑端键盘操控 3D 实时关卡战斗（P-008, P-009, P-031~P-034）
 * ---------------------------------------------------------------
 * 操作（PC HTML）：
 *   - A / D 或 ← / → ：左右移动
 *   - Space / W / ↑  ：3D 立体跳跃（装蜻蜓翼/喷气翼按住空格可滞空滑翔；重甲配生物翼提示太沉飞不动）
 *   - J 或 场景点击  ：攻击（普通近战区分地面/空中命中；长舌/炮口/电尾可对空）
 *   - K 或 Shift     ：特性招式（火箭头槌 / 喷气冲刺 / 铁门举盾 / 犀牛冲撞 / 灵巧翻滚）
 */

import * as THREE from 'three';
import type { CreatureStats, StageWaveDef } from '../core';
import type { ChickModel } from '../render3d/chick';
import type { SceneView } from '../render3d/scene';
import { el } from './dom';
import { t } from './strings';

interface FighterState {
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
  hitFlash: number;
  lunge: number;
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
  color: number;
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
  onWin: (wave: StageWaveDef, elapsedSec: number) => void;
  onLose: (wave: StageWaveDef, elapsedSec: number) => void;
  onExit: () => void;
  onRetry: () => void;
}

const ARENA_MIN_X = -4.6;
const ARENA_MAX_X = 4.6;
const GRAVITY = -22;

export class StageBattleArena {
  readonly el: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly floatLayer: HTMLElement;
  private readonly resultModal: HTMLElement;
  private readonly leftHpFill: HTMLElement;
  private readonly rightHpFill: HTMLElement;
  private readonly leftHpText: HTMLElement;
  private readonly rightHpText: HTMLElement;
  private readonly enemyNameEl: HTMLElement;
  private readonly waveTagEl: HTMLElement;
  private readonly timerEl: HTMLElement;
  private readonly guideCard: HTMLElement;
  private readonly guideList: HTMLElement;
  private readonly guideTip: HTMLElement;
  private readonly controlsBar: HTMLElement;
  private readonly specialPill: HTMLElement;
  private readonly resultTitle: HTMLElement;
  private readonly resultSub: HTMLElement;
  private readonly resultStats: HTMLElement;

  private active = false;
  private finished = false;
  private wave: StageWaveDef | null = null;
  private playerStats: CreatureStats | null = null;
  private enemyStats: CreatureStats | null = null;
  private p!: FighterState;
  private e!: FighterState;
  private startAt = 0;
  private elapsed = 0;
  private aiTimer = 0.8;
  private aiJumpTimer = 1.6;
  private aiShotTimer = 2.1;

  private readonly keys = new Set<string>();
  private tutorialDone = { move: false, jump: false, attack: false, special: false };
  private projectiles: Projectile3D[] = [];
  private beams: BeamFx3D[] = [];
  private floats: FloatingTag[] = [];
  private readonly tmpVec = new THREE.Vector3();
  private readonly projPt = { x: 0, y: 0, visible: false };

  constructor(
    host: HTMLElement,
    private readonly scene: SceneView,
    private readonly playerModel: ChickModel,
    private readonly enemyModel: ChickModel,
    private readonly cb: StageBattleCallbacks,
  ) {
    this.el = el('div', 'battle-layer');
    this.el.hidden = true;

    // 顶部血条 HUD
    this.hud = el('div', 'battle-hud');
    const left = this.sidePanel('left', t('battle.player'));
    const right = this.sidePanel('right', '关卡动物');
    this.enemyNameEl = right.nameEl;
    const mid = el('div', 'battle-mid');
    this.waveTagEl = el('span', 'battle-vs', 'STAGE 1');
    this.timerEl = el('span', 'battle-timer', '0.0s');
    mid.append(this.waveTagEl, this.timerEl);
    this.hud.append(left.panel, mid, right.panel);
    this.leftHpFill = left.fill;
    this.rightHpFill = right.fill;
    this.leftHpText = left.text;
    this.rightHpText = right.text;

    // 左上角教学指引卡（第 1 关实时打勾）
    this.guideCard = el('div', 'tutorial-guide');
    this.guideCard.append(el('div', 'tutorial-title', '第 1 关操作指引'));
    this.guideList = el('ul', 'tutorial-list');
    this.guideTip = el('p', 'tutorial-tip', '');
    this.guideCard.append(this.guideList, this.guideTip);

    // 底部键盘操控栏
    this.controlsBar = el('div', 'controls-bar');
    this.specialPill = el('span', 'key-pill special', 'K 特性冲刺 · 就绪');
    this.controlsBar.append(
      el('span', 'key-pill', 'A / D 移动'),
      el('span', 'key-pill', 'Space 跳跃 / 滞空'),
      el('span', 'key-pill', 'J / 点击 攻击'),
      this.specialPill,
    );
    const retreatBtn = el('button', 'btn ghost retreat-btn', '撤回装配');
    retreatBtn.type = 'button';
    retreatBtn.addEventListener('click', () => this.cb.onExit());
    this.controlsBar.append(retreatBtn);

    this.floatLayer = el('div', 'damage-layer');
    this.el.append(this.hud, this.guideCard, this.controlsBar, this.floatLayer);

    // 战败结算弹窗（胜利直接进肉鸽三选一！）
    this.resultModal = el('div', 'result-backdrop');
    this.resultModal.hidden = true;
    const card = el('div', 'result-card');
    card.append(el('div', 'eyebrow', t('battle.resultTitle')));
    this.resultTitle = el('h2', 'result-title', '');
    this.resultSub = el('p', 'result-sub', '');
    this.resultStats = el('div', 'result-stats');
    const actions = el('div', 'result-actions');
    const retry = el('button', 'btn primary', t('button.again'));
    retry.type = 'button';
    retry.addEventListener('click', () => this.cb.onRetry());
    const back = el('button', 'btn ghost', t('button.back'));
    back.type = 'button';
    back.addEventListener('click', () => this.cb.onExit());
    actions.append(retry, back);
    card.append(this.resultTitle, this.resultSub, this.resultStats, actions);
    this.resultModal.append(card);
    this.el.append(this.resultModal);

    host.appendChild(this.el);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    host.addEventListener('pointerdown', this.onArenaPointer);
  }

  private sidePanel(
    side: 'left' | 'right',
    name: string,
  ): { panel: HTMLElement; fill: HTMLElement; text: HTMLElement; nameEl: HTMLElement } {
    const panel = el('div', `battle-side battle-${side}`);
    const top = el('div', 'battle-side-top');
    const nameEl = el('span', 'battle-name', name);
    const text = el('span', 'battle-hp-text', '');
    top.append(nameEl, text);
    const track = el('div', 'battle-hp-track');
    const fill = el('i', 'battle-hp-fill');
    track.append(fill);
    panel.append(top, track);
    if (side === 'right') panel.classList.add('enemy');
    return { panel, fill, text, nameEl };
  }

  private onKeyDown = (ev: KeyboardEvent): void => {
    if (!this.active || this.finished) return;
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
  };

  private onArenaPointer = (ev: PointerEvent): void => {
    if (!this.active || this.finished) return;
    const target = ev.target as HTMLElement;
    if (target.closest('button') || target.closest('.result-backdrop') || target.closest('.reward-backdrop')) return;
    if (ev.button === 0) this.tryPlayerAttack();
  };

  start(wave: StageWaveDef, playerStats: CreatureStats, enemyStats: CreatureStats): void {
    this.cleanupFx();
    this.wave = wave;
    this.playerStats = playerStats;
    this.enemyStats = enemyStats;
    this.active = true;
    this.finished = false;
    this.keys.clear();
    this.startAt = performance.now();
    this.elapsed = 0;
    this.aiTimer = 0.7;
    this.aiJumpTimer = 1.5;
    this.aiShotTimer = 2.0;

    this.p = this.makeFighter(-2.4, 1, playerStats.hp);
    this.e = this.makeFighter(2.4, -1, wave.hp);

    this.enemyNameEl.textContent = wave.name;
    this.waveTagEl.textContent = `W${wave.waveNumber} / 3`;
    this.guideTip.textContent = wave.tip;
    this.renderTutorial();

    this.el.hidden = false;
    this.resultModal.hidden = true;
    this.enemyModel.root.visible = true;
    this.enemyModel.shadow.visible = true;
    this.playerModel.setDown(false);
    this.enemyModel.setDown(false);
    this.playerModel.setWorld(this.p.x, 0, 0);
    this.playerModel.setFacing(1);
    this.enemyModel.setWorld(this.e.x, 0, 0);
    this.enemyModel.setFacing(-1);
    this.updateBars();
  }

  private makeFighter(x: number, facing: 1 | -1, hp: number): FighterState {
    return {
      x,
      y: 0,
      vx: 0,
      vy: 0,
      facing,
      hp,
      maxHp: hp,
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
      hitFlash: 0,
      lunge: 0,
    };
  }

  private renderTutorial(): void {
    const items: Array<[boolean, string]> = [
      [this.tutorialDone.move, '按 A / D（或方向键）移动小鸡'],
      [this.tutorialDone.jump, '按 Space 3D 跳跃（离地可躲地面攻击！）'],
      [this.tutorialDone.attack, '按 J（或左键点击）发起攻击'],
      [this.tutorialDone.special, '按 K / Shift 发动特性冲刺或举盾'],
    ];
    this.guideList.replaceChildren();
    for (const [done, label] of items) {
      const li = el('li', done ? 'done' : '', `${done ? '✓' : '○'} ${label}`);
      this.guideList.append(li);
    }
  }

  private markTutorial(key: keyof typeof this.tutorialDone): void {
    if (!this.tutorialDone[key]) {
      this.tutorialDone[key] = true;
      this.renderTutorial();
    }
  }

  private tryPlayerJump(): void {
    if (!this.playerStats) return;
    const traits = this.playerStats.traits;
    const grounded = this.p.y <= 0.02;
    if (grounded) {
      let impulse = 6.6;
      if (traits.includes('super_jump')) impulse = 10.6;
      else if (traits.includes('jump')) impulse = 8.9;
      if (traits.includes('lightweight')) impulse += 1.0;
      this.p.vy = impulse;
      this.markTutorial('jump');
      if (traits.includes('jump')) {
        this.spawnCallout('player', traits.includes('super_jump') ? '弹簧高跳！' : '青蛙跃起！', 'accent');
      }
    } else if (this.playerStats.flags.grounded && this.playerStats.tags.includes('bio_wing')) {
      this.spawnCallout('player', '太沉啦飞不动！', 'bad');
    } else if (traits.includes('jet_boost') && this.p.specialCooldown <= 0.5) {
      this.p.vy = Math.max(this.p.vy, 7.6);
      this.spawnCallout('player', '喷气升空！', 'accent');
    }
  }

  private tryPlayerAttack(): void {
    if (!this.playerStats || this.p.atkCooldown > 0) return;
    const st = this.playerStats;
    const fast = st.traits.includes('fast_hit') || st.traits.includes('meat_grinder');
    const heavy = st.traits.includes('heavy_bite');
    this.p.atkCooldown = fast ? 0.28 : heavy ? 0.62 : 0.42;
    this.p.lunge = 0.32 * this.p.facing;
    this.markTutorial('attack');

    // 判断是否为远程 / 对空攻击
    const isCannon = st.traits.includes('cannon_shot');
    const isTongue = st.traits.includes('tongue_whip');
    const isAirMaster = st.flags.canHitAir;

    if (isCannon) {
      const dir = this.e.x >= this.p.x ? 1 : -1;
      this.p.facing = dir;
      const dx = this.e.x - this.p.x;
      const dy = (this.e.y + 1.2) - (this.p.y + 1.5);
      const dist = Math.max(0.5, Math.hypot(dx, dy));
      const speed = 9.5;
      this.spawnProjectile({
        side: 'player',
        x: this.p.x + dir * 0.9,
        y: this.p.y + 1.55,
        vx: (dx / dist) * speed,
        vy: (dy / dist) * speed,
        damage: Math.max(4, Math.round(st.atk * (st.traits.includes('sky_turret') && this.p.y > 0.4 ? 1.35 : 1.0))),
        canHitAir: true,
        color: 0xff6e4a,
        pierce: st.traits.includes('armor_pierce'),
        poison: st.traits.includes('poison'),
        slow: st.traits.includes('slow_on_hit'),
      });
      this.scene.shake(performance.now(), 0.04);
      return;
    }

    if (isTongue) {
      const dir = this.e.x >= this.p.x ? 1 : -1;
      this.p.facing = dir;
      const dist = Math.hypot(this.e.x - this.p.x, this.e.y - this.p.y);
      this.spawnBeam(this.p.x + dir * 0.8, this.p.y + 1.6, this.e.x, this.e.y + 1.2, 0xf26aa8, 0.18);
      if (dist <= 5.2) {
        const dmg = Math.max(4, Math.round(st.atk * (this.e.y > 0.45 ? 1.25 : 1.0)));
        this.applyHit('player', 'enemy', dmg, {
          canHitAir: true,
          melee: false,
          airCallout: this.e.y > 0.45,
        });
      } else {
        this.spawnCallout('player', '距离太远', 'dim');
      }
      return;
    }

    // 近战判定（严格执行 P-009：离地高度差影响命中！）
    const range = st.traits.includes('knockback') ? 2.55 : 2.15;
    const dx = Math.abs(this.e.x - this.p.x);
    const dy = Math.abs(this.e.y - this.p.y);
    if (dx <= range) {
      if (dy > 1.05 && !isAirMaster) {
        this.spawnCallout('enemy', '高空闪避！', 'accent');
        return;
      }
      let dmg = st.atk;
      if (st.traits.includes('claw_bonus')) dmg = Math.round(dmg * 1.18);
      if (st.traits.includes('air_strike') && this.p.y > 0.4) dmg = Math.round(dmg * 1.3);
      if (heavy) dmg = Math.round(dmg * 1.35);
      this.applyHit('player', 'enemy', dmg, {
        canHitAir: isAirMaster || this.p.y > 0.45,
        melee: true,
        airCallout: this.e.y > 0.45 && this.p.y > 0.45,
      });
    } else {
      this.spawnCallout('player', '扑空', 'dim');
    }
  }

  private tryPlayerSpecial(): void {
    if (!this.playerStats || this.p.specialCooldown > 0) return;
    const st = this.playerStats;
    this.markTutorial('special');

    if (st.traits.includes('rocket_headbutt')) {
      this.p.specialCooldown = 2.6;
      this.p.dashTime = 0.28;
      this.p.vx = this.p.facing * 14.5;
      this.spawnBeam(this.p.x - this.p.facing * 0.6, this.p.y + 1.2, this.p.x - this.p.facing * 2.2, this.p.y + 1.2, 0xff6a24, 0.26);
      this.spawnCallout('player', '🔥 火箭头槌！', 'combo');
      if (Math.abs(this.e.x - this.p.x) <= 3.8) {
        this.applyHit('player', 'enemy', Math.round(st.atk * 1.85), {
          canHitAir: true,
          melee: true,
          forcePierce: true,
          forceKnockback: 2.2,
        });
      }
    } else if (st.traits.includes('shield_block')) {
      this.p.specialCooldown = 3.0;
      this.p.guardTime = 1.6;
      this.spawnCallout('player', '🛡 举盾格挡！', 'accent');
    } else if (st.traits.includes('jet_boost')) {
      this.p.specialCooldown = 2.4;
      this.p.dashTime = 0.24;
      this.p.vx = this.p.facing * 12;
      this.p.vy = Math.max(this.p.vy, 6.2);
      this.spawnBeam(this.p.x, this.p.y + 1.1, this.p.x - this.p.facing * 1.6, this.p.y + 0.5, 0xff7828, 0.22);
      this.spawnCallout('player', '🚀 喷气爆发！', 'accent');
    } else if (st.traits.includes('charge_horn')) {
      this.p.specialCooldown = 2.5;
      this.p.dashTime = 0.22;
      this.p.vx = this.p.facing * 11.5;
      this.spawnCallout('player', '犀牛铁头撞！', 'accent');
      if (Math.abs(this.e.x - this.p.x) <= 3.0) {
        this.applyHit('player', 'enemy', Math.round(st.atk * 1.45), {
          canHitAir: false,
          melee: true,
          forcePierce: true,
          forceKnockback: 1.5,
        });
      }
    } else {
      // 默认小鸡灵巧冲刺
      this.p.specialCooldown = 1.8;
      this.p.dashTime = 0.18;
      this.p.vx = this.p.facing * 9.5;
      this.spawnCallout('player', '快速冲刺！', 'accent');
    }
  }

  private applyHit(
    attackerSide: 'player' | 'enemy',
    targetSide: 'player' | 'enemy',
    rawDamage: number,
    opts: {
      canHitAir: boolean;
      melee: boolean;
      airCallout?: boolean;
      forcePierce?: boolean;
      forceKnockback?: number;
    },
  ): void {
    const atkStats = attackerSide === 'player' ? this.playerStats : this.enemyStats;
    const defStats = targetSide === 'player' ? this.playerStats : this.enemyStats;
    const atkF = attackerSide === 'player' ? this.p : this.e;
    const defF = targetSide === 'player' ? this.p : this.e;
    if (!atkStats || !defStats) return;

    // 高度命中判定（P-009）
    if (defF.y > 0.75 && !opts.canHitAir && Math.abs(atkF.y - defF.y) > 0.9) {
      this.spawnCallout(targetSide, '跳起躲过！', 'accent');
      return;
    }

    // 闪避判定（兔子耳/孔雀尾，被雷达锁敌克制）
    const hasRadar = atkStats.traits.includes('radar_lock') || atkStats.traits.includes('guaranteed_lock');
    if (!hasRadar && defStats.traits.includes('dodge') && Math.random() < 0.22) {
      this.spawnCallout(targetSide, '灵巧闪避！', 'accent');
      return;
    }

    // 防御与破甲
    const pierce = opts.forcePierce || atkStats.traits.includes('armor_pierce');
    const effDef = pierce ? defStats.def * 0.45 : defStats.def;
    let dmg = rawDamage / (1 + effDef * 0.09);

    // 暴击
    const critChance = atkStats.traits.includes('guaranteed_lock')
      ? 0.45
      : atkStats.traits.includes('crit_boost')
        ? 0.3
        : 0.12;
    const crit = Math.random() < critChance;
    if (crit) dmg *= 1.5;

    // 举盾减伤
    if (defF.guardTime > 0) {
      dmg *= 0.3;
      this.spawnCallout(targetSide, '盾牌格挡！', 'accent');
    }

    const finalDmg = Math.max(1, Math.round(dmg));
    defF.hp = Math.max(0, defF.hp - finalDmg);
    defF.hitFlash = 0.22;

    const targetModel = targetSide === 'player' ? this.playerModel : this.enemyModel;
    targetModel.hit(performance.now() / 1000);
    this.scene.shake(performance.now(), crit ? 0.08 : 0.04);

    if (opts.airCallout) {
      this.spawnCallout(targetSide, `对空 -${finalDmg}`, 'combo');
    } else if (crit) {
      this.spawnCallout(targetSide, `暴击 -${finalDmg}!`, 'combo');
    } else {
      this.spawnCallout(targetSide, `-${finalDmg}`, targetSide === 'player' ? 'bad' : 'hit');
    }

    // 击退（大象腿/鹿角/移动铁桶堡垒抗击退）
    const kb =
      opts.forceKnockback ??
      (atkStats.traits.includes('knockback') ? 1.25 : 0.35);
    const immuneKb = defStats.traits.includes('iron_fortress');
    const resistKb = defStats.traits.includes('steady') ? 0.3 : 1;
    if (!immuneKb) {
      const dir = defF.x >= atkF.x ? 1 : -1;
      defF.x = Math.min(ARENA_MAX_X, Math.max(ARENA_MIN_X, defF.x + dir * kb * resistKb));
    }

    // 异常状态：施毒 / 章鱼减速
    if (atkStats.traits.includes('poison')) {
      defF.poisonTime = 4.0;
    }
    if (atkStats.traits.includes('slow_on_hit')) {
      defF.slowTime = 2.6;
    }

    // 近战反伤 & 河豚弹开（含「反甲铁龟」「带刺弹力球」拼色彩蛋！）
    if (opts.melee) {
      if (defStats.traits.includes('thorns') || defStats.traits.includes('thorn_turtle') || defStats.traits.includes('spiky_puffer')) {
        const mult = defStats.traits.includes('spiky_puffer') || defStats.traits.includes('thorn_turtle') ? 0.42 : 0.24;
        const reflect = Math.max(1, Math.round(finalDmg * mult));
        atkF.hp = Math.max(1, atkF.hp - reflect);
        this.spawnCallout(attackerSide, `反刺 -${reflect}`, 'bad');
      }
      if (defStats.traits.includes('bounce_knockback') || defStats.traits.includes('spiky_puffer')) {
        const pushDir = atkF.x >= defF.x ? 1 : -1;
        if (!atkStats.traits.includes('iron_fortress')) {
          atkF.x = Math.min(ARENA_MAX_X, Math.max(ARENA_MIN_X, atkF.x + pushDir * 1.4));
          this.spawnCallout(attackerSide, '弹飞！', 'accent');
        }
      }
    }

    // 壁虎断尾保命一次！
    if (defF.hp <= 0 && defStats.traits.includes('revive_tail') && !defF.reviveUsed) {
      defF.reviveUsed = true;
      defF.hp = Math.max(8, Math.round(defF.maxHp * 0.35));
      const escapeDir = defF.x <= atkF.x ? -1 : 1;
      defF.x = Math.min(ARENA_MAX_X, Math.max(ARENA_MIN_X, defF.x + escapeDir * 1.8));
      this.spawnCallout(targetSide, '🦎 断尾保命！', 'combo');
    }
  }

  update(dt: number, now: number): void {
    if (!this.active || !this.wave || !this.playerStats || !this.enemyStats) return;
    this.updateFloats(now);
    this.updateBeams(dt);
    if (this.finished) return;

    this.elapsed = (now - this.startAt) / 1000;
    this.timerEl.textContent = `${this.elapsed.toFixed(1)}s`;

    // ---- 1. 玩家键盘操控 ----
    const moveL = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const moveR = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    const holdJump = this.keys.has('Space') || this.keys.has('KeyW') || this.keys.has('ArrowUp');

    const pSpeedBase = 2.6 + (this.playerStats.spd / 100) * 2.2;
    const pSpeed = pSpeedBase * (this.p.slowTime > 0 ? 0.55 : 1) * (this.playerStats.traits.includes('propeller_boost') ? 1.18 : 1);

    if (this.p.dashTime <= 0) {
      if (moveL && !moveR) {
        this.p.vx = -pSpeed;
        this.p.facing = -1;
        this.markTutorial('move');
      } else if (moveR && !moveL) {
        this.p.vx = pSpeed;
        this.p.facing = 1;
        this.markTutorial('move');
      } else {
        this.p.vx = 0;
      }
    }

    // 物理更新（3D 高度 + 滑翔/滞空 + 弹簧落地冲击波）
    const prevPY = this.p.y;
    const gliding = holdJump && this.p.vy < 0 && this.p.y > 0.25 && this.playerStats.flags.canGlide;
    const grav = gliding ? GRAVITY * 0.22 : GRAVITY;
    this.p.vy += grav * dt;
    this.p.x = Math.min(ARENA_MAX_X, Math.max(ARENA_MIN_X, this.p.x + this.p.vx * dt));
    this.p.y += this.p.vy * dt;
    if (this.p.y <= 0) {
      if (prevPY > 0.9 && this.playerStats.traits.includes('land_shock') && Math.abs(this.e.x - this.p.x) <= 2.4 && this.e.y <= 0.4) {
        this.applyHit('player', 'enemy', Math.max(4, Math.round(this.playerStats.atk * 0.75)), {
          canHitAir: false,
          melee: false,
          forceKnockback: 1.0,
        });
        this.spawnCallout('player', '震荡落地！', 'accent');
      }
      this.p.y = 0;
      this.p.vy = 0;
    }

    // 自动被动：毛毛虫回血 / 特斯拉电尾自动闪电
    if (this.playerStats.traits.includes('regen')) {
      this.p.regenTick += dt;
      if (this.p.regenTick >= 2.0 && this.p.hp < this.p.maxHp) {
        this.p.regenTick = 0;
        const heal = Math.max(2, Math.round(this.p.maxHp * 0.06));
        this.p.hp = Math.min(this.p.maxHp, this.p.hp + heal);
        this.spawnCallout('player', `+${heal}`, 'heal');
      }
    }
    if (this.playerStats.traits.includes('tesla_zap')) {
      this.p.teslaTick -= dt;
      if (this.p.teslaTick <= 0 && Math.abs(this.e.x - this.p.x) <= 5.4) {
        this.p.teslaTick = 2.1;
        this.spawnBeam(this.p.x - this.p.facing * 0.5, this.p.y + 1.5, this.e.x, this.e.y + 1.3, 0x4cc9ff, 0.22);
        this.applyHit('player', 'enemy', Math.max(4, Math.round(this.playerStats.atk * 0.7)), {
          canHitAir: true,
          melee: false,
          airCallout: this.e.y > 0.5,
        });
      }
    }

    // ---- 2. 关卡动物 AI ----
    this.updateEnemyAI(dt);

    // ---- 3. 冷却、中毒、弹丸更新 ----
    this.tickStatus(this.p, 'player', dt);
    this.tickStatus(this.e, 'enemy', dt);
    this.updateProjectiles(dt);

    // ---- 4. 同步 3D 模型与 HUD ----
    this.p.lunge *= Math.max(0, 1 - dt * 14);
    this.e.lunge *= Math.max(0, 1 - dt * 14);
    this.playerModel.setWorld(this.p.x, this.p.y, 0);
    this.playerModel.setFacing(this.p.facing);
    this.playerModel.setMoving(Math.abs(this.p.vx) > 0.2);
    this.playerModel.setLunge(this.p.lunge);

    this.enemyModel.setWorld(this.e.x, this.e.y, 0);
    this.enemyModel.setFacing(this.e.facing);
    this.enemyModel.setMoving(Math.abs(this.e.vx) > 0.2);
    this.enemyModel.setLunge(this.e.lunge);

    this.updateBars();
    if (this.p.specialCooldown > 0) {
      this.specialPill.textContent = `K 特技 · ${this.p.specialCooldown.toFixed(1)}s`;
      this.specialPill.classList.add('cooling');
    } else {
      const label = this.playerStats.traits.includes('rocket_headbutt')
        ? 'K 火箭头槌 · 就绪'
        : this.playerStats.traits.includes('shield_block')
          ? 'K 举盾格挡 · 就绪'
          : 'K 特性冲刺 · 就绪';
      this.specialPill.textContent = label;
      this.specialPill.classList.remove('cooling');
    }

    // ---- 5. 胜负判定 ----
    if (this.e.hp <= 0) {
      this.finished = true;
      this.enemyModel.setDown(true);
      this.cleanupFx();
      this.cb.onWin(this.wave, this.elapsed);
    } else if (this.p.hp <= 0) {
      this.finished = true;
      this.playerModel.setDown(true);
      this.cleanupFx();
      this.showDefeat();
      this.cb.onLose(this.wave, this.elapsed);
    }
  }

  private updateEnemyAI(dt: number): void {
    if (!this.wave) return;
    const dx = this.p.x - this.e.x;
    const dist = Math.abs(dx);
    const dir: 1 | -1 = dx >= 0 ? 1 : -1;
    this.e.facing = dir;

    const baseSpd = 1.6 + (this.wave.spd / 100) * 1.5;
    const spd = baseSpd * (this.e.slowTime > 0 ? 0.55 : 1);

    if (dist > 1.75) {
      this.e.vx = dir * spd;
    } else {
      this.e.vx = 0;
    }

    this.aiJumpTimer -= dt;
    if (this.wave.aiStyle === 'hopper' && this.aiJumpTimer <= 0 && this.e.y <= 0.02) {
      this.e.vy = 8.4;
      this.e.vx = dir * (spd * 1.45);
      this.aiJumpTimer = 2.6;
      this.spawnCallout('enemy', '青蛙高跳！', 'dim');
    } else if (this.wave.aiStyle === 'boss_flyer' && this.aiJumpTimer <= 0 && this.e.y <= 0.02) {
      this.e.vy = 9.2;
      this.aiJumpTimer = 3.2;
      this.spawnCallout('enemy', '机械升空！', 'bad');
    }

    const prevEY = this.e.y;
    const bossHover = this.wave.aiStyle === 'boss_flyer' && this.e.vy < 0 && this.e.y > 0.7;
    this.e.vy += (bossHover ? GRAVITY * 0.28 : GRAVITY) * dt;
    this.e.x = Math.min(ARENA_MAX_X, Math.max(ARENA_MIN_X, this.e.x + this.e.vx * dt));
    this.e.y += this.e.vy * dt;
    if (this.e.y <= 0) {
      // 青蛙落地砸地冲击（玩家按 Space 离地就能躲过！）
      if (prevEY > 0.8 && dist <= 2.35) {
        this.applyHit('enemy', 'player', this.wave.atk, {
          canHitAir: false,
          melee: false,
          forceKnockback: 0.9,
        });
      }
      this.e.y = 0;
      this.e.vy = 0;
    }

    // 近战普攻
    this.aiTimer -= dt;
    if (this.aiTimer <= 0 && dist <= 1.95) {
      this.aiTimer = this.wave.aiStyle === 'armored' ? 1.25 : 1.1;
      this.e.lunge = 0.28 * dir;
      this.applyHit('enemy', 'player', this.wave.atk, {
        canHitAir: false,
        melee: true,
      });
    }

    // 头目空中发慢速炮弹
    if (this.wave.aiStyle === 'boss_flyer') {
      this.aiShotTimer -= dt;
      if (this.aiShotTimer <= 0) {
        this.aiShotTimer = 2.4;
        const speed = 5.6;
        const tx = this.p.x - this.e.x;
        const ty = (this.p.y + 1.2) - (this.e.y + 1.4);
        const len = Math.max(0.5, Math.hypot(tx, ty));
        this.spawnProjectile({
          side: 'enemy',
          x: this.e.x + dir * 0.8,
          y: this.e.y + 1.45,
          vx: (tx / len) * speed,
          vy: (ty / len) * speed,
          damage: Math.max(5, Math.round(this.wave.atk * 0.85)),
          canHitAir: true,
          color: 0xff4d6d,
          pierce: false,
          poison: false,
          slow: false,
        });
      }
    }
  }

  private tickStatus(f: FighterState, side: 'player' | 'enemy', dt: number): void {
    if (f.atkCooldown > 0) f.atkCooldown = Math.max(0, f.atkCooldown - dt);
    if (f.specialCooldown > 0) f.specialCooldown = Math.max(0, f.specialCooldown - dt);
    if (f.guardTime > 0) f.guardTime = Math.max(0, f.guardTime - dt);
    if (f.dashTime > 0) f.dashTime = Math.max(0, f.dashTime - dt);
    if (f.slowTime > 0) f.slowTime = Math.max(0, f.slowTime - dt);
    if (f.hitFlash > 0) f.hitFlash = Math.max(0, f.hitFlash - dt);
    if (f.poisonTime > 0) {
      f.poisonTime -= dt;
      f.poisonTick += dt;
      if (f.poisonTick >= 0.85) {
        f.poisonTick = 0;
        const tickDmg = Math.max(2, Math.round(f.maxHp * 0.04));
        f.hp = Math.max(0, f.hp - tickDmg);
        this.spawnCallout(side, `中毒 -${tickDmg}`, 'poison');
      }
    }
  }

  private spawnProjectile(init: Omit<Projectile3D, 'mesh' | 'life'>): void {
    const geo = new THREE.SphereGeometry(0.18, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color: init.color });
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

      const targetSide = pr.side === 'player' ? 'enemy' : 'player';
      const target = targetSide === 'player' ? this.p : this.e;
      const hitDist = Math.hypot(pr.x - target.x, pr.y - (target.y + 1.15));
      if (hitDist <= 0.95) {
        this.applyHit(pr.side, targetSide, pr.damage, {
          canHitAir: pr.canHitAir,
          melee: false,
          airCallout: target.y > 0.5,
          forcePierce: pr.pierce,
        });
        this.scene.detach(pr.mesh);
        pr.mesh.geometry.dispose();
        (pr.mesh.material as THREE.Material).dispose();
        continue;
      }

      if (pr.life <= 0 || pr.x < ARENA_MIN_X - 2 || pr.x > ARENA_MAX_X + 2 || pr.y < 0) {
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
    mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0.08);
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

  private updateBars(): void {
    const lp = Math.max(0, Math.min(100, (this.p.hp / Math.max(1, this.p.maxHp)) * 100));
    const rp = Math.max(0, Math.min(100, (this.e.hp / Math.max(1, this.e.maxHp)) * 100));
    this.leftHpFill.style.width = `${lp}%`;
    this.rightHpFill.style.width = `${rp}%`;
    this.leftHpText.textContent = `${Math.ceil(this.p.hp)} / ${this.p.maxHp}`;
    this.rightHpText.textContent = `${Math.ceil(this.e.hp)} / ${this.e.maxHp}`;
  }

  private spawnCallout(
    side: 'player' | 'enemy',
    text: string,
    tone: 'hit' | 'bad' | 'accent' | 'combo' | 'heal' | 'poison' | 'dim',
  ): void {
    const model = side === 'player' ? this.playerModel : this.enemyModel;
    model.getHeadWorld(this.tmpVec);
    this.scene.project(this.tmpVec, this.projPt);
    if (!this.projPt.visible) return;
    const node = el('div', `damage-number tone-${tone}`, text);
    const jitter = (Math.random() - 0.5) * 34;
    node.style.left = `${this.projPt.x + jitter}px`;
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

  private showDefeat(): void {
    if (!this.wave) return;
    this.resultTitle.textContent = t('battle.lose');
    this.resultTitle.className = 'result-title right';
    this.resultSub.textContent = `倒在了「${this.wave.name}」脚下！回去调整配装或再试一次吧（已获零件保留）`;
    this.resultStats.replaceChildren();
    const addStat = (label: string, val: string): void => {
      const box = el('div', 'result-stat');
      box.append(el('span', '', label), el('b', '', val));
      this.resultStats.append(box);
    };
    addStat('本波敌人', this.wave.name);
    addStat('敌方剩余', `${Math.ceil(this.e.hp)} HP`);
    addStat(t('battle.duration'), `${this.elapsed.toFixed(1)}s`);
    this.resultModal.hidden = false;
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
    this.finished = false;
    this.keys.clear();
    this.cleanupFx();
    this.el.hidden = true;
    this.resultModal.hidden = true;
    this.floatLayer.replaceChildren();
    this.floats = [];
    this.playerModel.setWorld(0, 0, 0);
    this.playerModel.setFacing(1);
    this.playerModel.setLunge(0);
    this.playerModel.setMoving(false);
    this.playerModel.setDown(false);
    this.enemyModel.setWorld(2.8, 0, 0);
    this.enemyModel.setFacing(-1);
    this.enemyModel.setLunge(0);
    this.enemyModel.setMoving(false);
    this.enemyModel.setDown(false);
    this.enemyModel.root.visible = false;
    this.enemyModel.shadow.visible = false;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.stop();
  }
}
