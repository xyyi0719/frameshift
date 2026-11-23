/**
 * 简化自动战斗表现（B 负责）。
 * ---------------------------------------------------------------
 * 逻辑完全由 core.simulate() 预计算；这里只按 tick 回放：
 * 前进、接触、攻击、飘血、受击抖动、胜负。30Hz 逻辑。
 */

import * as THREE from 'three';
import type { BattleConfig, BattleEvent, BattleResult, CreatureStats, Side } from '../core';
import { battleSides, simulate } from '../core';
import type { ChickModel } from '../render3d/chick';
import type { SceneView } from '../render3d/scene';
import { el } from './dom';
import { t } from './strings';

interface Timeline {
  leftX: Float32Array;
  rightX: Float32Array;
  leftHp: Float32Array;
  rightHp: Float32Array;
  events: Map<number, BattleEvent[]>;
}

interface Floating {
  node: HTMLElement;
  born: number;
}

const TICK = 1 / 30;

function makeTimeline(cfg: BattleConfig, result: BattleResult): Timeline {
  const n = result.ticks + 1;
  const leftX = new Float32Array(n);
  const rightX = new Float32Array(n);
  const leftHp = new Float32Array(n);
  const rightHp = new Float32Array(n);
  let lx = cfg.left.spawnX;
  let rx = cfg.right.spawnX;
  let lhp = cfg.left.stats.hp * 1000;
  let rhp = cfg.right.stats.hp * 1000;
  const events = new Map<number, BattleEvent[]>();
  for (const e of result.events) {
    const list = events.get(e.tick) ?? [];
    list.push(e);
    events.set(e.tick, list);
  }
  for (let tick = 0; tick < n; tick += 1) {
    for (const e of events.get(tick) ?? []) {
      if (e.type === 'move') {
        if (e.side === 'left') lx = e.x;
        else rx = e.x;
      } else if (e.type === 'attack') {
        if (e.target === 'left') lhp = Math.max(0, lhp - e.damage);
        else rhp = Math.max(0, rhp - e.damage);
      }
    }
    leftX[tick] = lx;
    rightX[tick] = rx;
    leftHp[tick] = lhp;
    rightHp[tick] = rhp;
  }
  return { leftX, rightX, leftHp, rightHp, events };
}

export interface BattleCallbacks {
  onFinish: (result: BattleResult, enemyName: string) => void;
  onExit: () => void;
  onAgain: () => void;
}

export class BattleArena {
  readonly el: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly floatLayer: HTMLElement;
  private readonly resultModal: HTMLElement;
  private readonly leftHpFill: HTMLElement;
  private readonly rightHpFill: HTMLElement;
  private readonly leftHpText: HTMLElement;
  private readonly rightHpText: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly abilityBanner: HTMLElement;
  private readonly resultTitle: HTMLElement;
  private readonly resultSub: HTMLElement;
  private readonly resultStats: HTMLElement;

  private result: BattleResult | null = null;
  private cfg: BattleConfig | null = null;
  private timeline: Timeline | null = null;
  private startAt = 0;
  private timeScale = 1;
  private lastTick = -1;
  private lastFloat = 0;
  private pending = { left: 0, right: 0 };
  private endAt = 0;
  private finished = false;
  private resultShown = false;
  private abilityTimer = 0;
  private lungeAt = { left: -10, right: -10 };
  private lastShake = 0;
  private floats: Floating[] = [];
  private active = false;
  private readonly tmp = new THREE.Vector3();
  private readonly project = { x: 0, y: 0, visible: false };

  constructor(
    host: HTMLElement,
    private readonly scene: SceneView,
    private readonly player: ChickModel,
    private readonly enemy: ChickModel,
    private readonly cb: BattleCallbacks,
  ) {
    this.el = el('div', 'battle-layer');
    this.el.hidden = true;
    this.hud = el('div', 'battle-hud');

    const left = this.sidePanel('left', t('battle.player'));
    const right = this.sidePanel('right', t('battle.enemy'));
    const mid = el('div', 'battle-mid');
    this.timer = el('span', 'battle-timer', '0.0s');
    mid.append(el('span', 'battle-vs', 'VS'), this.timer);
    this.hud.append(left.panel, mid, right.panel);
    this.leftHpFill = left.fill;
    this.rightHpFill = right.fill;
    this.leftHpText = left.text;
    this.rightHpText = right.text;

    this.abilityBanner = el('div', 'battle-ability');
    this.abilityBanner.hidden = true;
    this.hud.append(this.abilityBanner);

    this.floatLayer = el('div', 'damage-layer');
    this.el.append(this.hud, this.floatLayer);

    this.resultModal = el('div', 'result-backdrop');
    this.resultModal.hidden = true;
    const card = el('div', 'result-card');
    const eyebrow = el('div', 'eyebrow', t('battle.resultTitle'));
    this.resultTitle = el('h2', 'result-title', '');
    this.resultSub = el('p', 'result-sub', '');
    this.resultStats = el('div', 'result-stats');
    const actions = el('div', 'result-actions');
    const again = el('button', 'btn primary', t('button.again'));
    again.type = 'button';
    again.addEventListener('click', () => this.cb.onAgain());
    const back = el('button', 'btn ghost', t('button.back'));
    back.type = 'button';
    back.addEventListener('click', () => this.cb.onExit());
    actions.append(again, back);
    card.append(eyebrow, this.resultTitle, this.resultSub, this.resultStats, actions);
    this.resultModal.append(card);
    this.el.append(this.resultModal);
    host.appendChild(this.el);
    this.enemy.setWorld(2.4);
    this.enemy.root.rotation.y = Math.PI;
  }

  private sidePanel(side: 'left' | 'right', name: string): { panel: HTMLElement; fill: HTMLElement; text: HTMLElement } {
    const panel = el('div', `battle-side battle-${side}`);
    const top = el('div', 'battle-side-top');
    top.append(el('span', 'battle-name', name));
    const text = el('span', 'battle-hp-text', '');
    top.append(text);
    const track = el('div', 'battle-hp-track');
    const fill = el('i', 'battle-hp-fill');
    track.append(fill);
    panel.append(top, track);
    if (side === 'right') panel.classList.add('enemy');
    return { panel, fill, text };
  }

  start(playerStats: CreatureStats, enemyStats: CreatureStats): void {
    const enemy: CreatureStats = enemyStats;
    const sides = battleSides(playerStats, enemy, 220, 780);
    const cfg: BattleConfig = {
      v: 1,
      seed: 0x51c4b1,
      tickRate: 30,
      maxTicks: 1800,
      arena: { width: 1000 },
      ...sides,
    };
    const result = simulate(cfg, []);
    this.cfg = cfg;
    this.result = result;
    this.timeline = makeTimeline(cfg, result);
    const simSeconds = result.ticks / 30;
    this.timeScale = simSeconds < 20 ? 20 / Math.max(1, simSeconds) : simSeconds > 40 ? simSeconds / 40 : 1;
    this.startAt = performance.now();
    this.lastTick = -1;
    this.lastFloat = 0;
    this.pending = { left: 0, right: 0 };
    this.finished = false;
    this.resultShown = false;
    this.endAt = 0;
    this.active = true;
    this.enemy.root.visible = true;
    this.enemy.shadow.visible = true;
    this.el.hidden = false;
    this.resultModal.hidden = true;
    this.hud.hidden = false;
    this.player.setWorld(-1.55);
    this.player.setDown(false);
    this.player.setLunge(0);
    this.enemy.setWorld(1.55);
    this.enemy.setDown(false);
    this.enemy.setLunge(0);
    this.enemy.root.rotation.y = Math.PI;
    this.updateBars(0);
    this.timer.textContent = '0.0s';
    this.player.hit(-10);
    this.enemy.hit(-10);
    this.player.setMoving(false);
    this.enemy.setMoving(false);
  }

  update(now: number): void {
    if (!this.active || !this.result || !this.timeline) return;
    if (this.finished && now < this.endAt) return;
    if (this.finished && !this.resultShown) {
      this.showResult();
      return;
    }
    if (this.finished) return;

    const wall = (now - this.startAt) / 1000;
    const sim = Math.min(this.result.ticks, Math.floor(wall / this.timeScale * 30));
    for (let tick = this.lastTick + 1; tick <= sim; tick += 1) {
      this.processTick(tick, now);
    }
    if (sim > this.lastTick) this.lastTick = sim;

    const timeline = this.timeline;
    const tick = Math.max(0, Math.min(sim, this.result.ticks));
    const leftX = timeline.leftX[tick] ?? 220;
    const rightX = timeline.rightX[tick] ?? 780;
    let leftWorld = (leftX / 1000) * 5.6 - 2.8;
    let rightWorld = (rightX / 1000) * 5.6 - 2.8;
    // 逻辑接触距离 100 → 世界坐标只有 0.56，鸡身会重叠。只做战斗站位的视觉最小间距，
    // 不改逻辑位置/事件。2.45 ≈ 两只鸡的半身宽 + 一点空气。
    const minSep = 2.45;
    if (rightWorld - leftWorld < minSep) {
      const mid = (leftWorld + rightWorld) / 2;
      leftWorld = mid - minSep / 2;
      rightWorld = mid + minSep / 2;
    }
    this.player.setWorld(leftWorld);
    this.enemy.setWorld(rightWorld);
    const moving = tick < this.result.ticks - 2 && rightX - leftX > 102;
    this.player.setMoving(moving);
    this.enemy.setMoving(moving);

    this.player.setLunge(0.1 * Math.max(0, 1 - (now - this.lungeAt.left) / 140));
    this.enemy.setLunge(-0.1 * Math.max(0, 1 - (now - this.lungeAt.right) / 140));

    const age = now - this.lastFloat;
    if (age > 160 && (this.pending.left > 0 || this.pending.right > 0)) {
      if (this.pending.left > 0) this.spawnDamage('left', this.pending.left);
      if (this.pending.right > 0) this.spawnDamage('right', this.pending.right);
      this.pending.left = 0;
      this.pending.right = 0;
      this.lastFloat = now;
    }

    this.updateBars(tick / 30);
    this.timer.textContent = `${(tick / 30).toFixed(1)}s`;
    if (this.abilityTimer > 0 && now > this.abilityTimer) {
      this.abilityBanner.hidden = true;
      this.abilityTimer = 0;
    }
    this.updateFloats(now);

    if (tick >= this.result.ticks) {
      this.finished = true;
      this.endAt = now + 750;
      const winner = this.result.winner;
      if (winner === 'left') this.enemy.setDown(true);
      else if (winner === 'right') this.player.setDown(true);
      else {
        this.player.setDown(true);
        this.enemy.setDown(true);
      }
      this.cb.onFinish(this.result, t('battle.enemy'));
    }
  }

  private processTick(tick: number, now: number): void {
    const events = this.timeline?.events.get(tick);
    if (!events) return;
    for (const e of events) {
      if (e.type === 'attack') {
        if (e.target === 'left') {
          this.pending.left += e.damage;
          this.player.hit(now);
          this.lungeAt.right = now;
          if (now - this.lastShake > 120) {
            this.scene.shake(now, e.crit ? 0.08 : 0.035);
            this.lastShake = now;
          }
        } else {
          this.pending.right += e.damage;
          this.enemy.hit(now);
          this.lungeAt.left = now;
          if (now - this.lastShake > 120) {
            this.scene.shake(now, e.crit ? 0.06 : 0.03);
            this.lastShake = now;
          }
        }
      } else if (e.type === 'ability') {
        this.abilityBanner.textContent = `技能 · ${e.ability}`;
        this.abilityBanner.hidden = false;
        this.abilityTimer = now + 1400;
      } else if (e.type === 'die') {
        if (e.side === 'left') this.player.setDown(true);
        else this.enemy.setDown(true);
      }
    }
  }

  private updateBars(seconds: number): void {
    void seconds;
    if (!this.timeline || !this.cfg || !this.result) return;
    const tick = Math.max(0, Math.min(this.lastTick, this.result.ticks));
    const lHp = this.timeline.leftHp[tick] ?? 0;
    const rHp = this.timeline.rightHp[tick] ?? 0;
    const lMax = Math.max(1, this.cfg.left.stats.hp * 1000);
    const rMax = Math.max(1, this.cfg.right.stats.hp * 1000);
    this.leftHpFill.style.width = `${Math.max(0, Math.min(100, (lHp / lMax) * 100))}%`;
    this.rightHpFill.style.width = `${Math.max(0, Math.min(100, (rHp / rMax) * 100))}%`;
    this.leftHpText.textContent = `${(lHp / 1000).toFixed(0)} / ${(lMax / 1000).toFixed(0)}`;
    this.rightHpText.textContent = `${(rHp / 1000).toFixed(0)} / ${(rMax / 1000).toFixed(0)}`;
  }

  private spawnDamage(side: 'left' | 'right', milli: number): void {
    const target = side === 'left' ? this.player : this.enemy;
    target.getHeadWorld(this.tmp);
    this.scene.project(this.tmp, this.project);
    if (!this.project.visible) return;
    const node = el('div', 'damage-number');
    node.textContent = `-${(milli / 1000).toFixed(1)}`;
    node.style.left = `${this.project.x}px`;
    node.style.top = `${this.project.y}px`;
    this.floatLayer.append(node);
    this.floats.push({ node, born: performance.now() });
  }

  private updateFloats(now: number): void {
    this.floats = this.floats.filter((f) => {
      if (now - f.born > 900) {
        f.node.remove();
        return false;
      }
      return true;
    });
  }

  private showResult(): void {
    if (!this.result || !this.cfg) return;
    this.resultShown = true;
    const winner = this.result.winner;
    const title = winner === 'left' ? t('battle.win') : winner === 'right' ? t('battle.lose') : t('battle.draw');
    this.resultTitle.textContent = title;
    this.resultTitle.className = `result-title ${winner}`;
    this.resultSub.textContent =
      winner === 'left'
        ? t('battle.winner', { name: t('battle.player') })
        : winner === 'right'
          ? t('battle.winner', { name: t('battle.enemy') })
          : t('battle.resultTitle');
    const lHp = this.result.remainingHp.left / 1000;
    const rHp = this.result.remainingHp.right / 1000;
    this.resultStats.replaceChildren();
    const stat = (label: string, value: string): void => {
      const box = el('div', 'result-stat');
      box.append(el('span', '', label), el('b', '', value));
      this.resultStats.append(box);
    };
    stat(t('battle.player'), `${lHp.toFixed(0)} HP`);
    stat(t('battle.enemy'), `${rHp.toFixed(0)} HP`);
    stat(t('battle.duration'), `${(this.result.ticks / 30).toFixed(1)}s`);
    this.resultModal.hidden = false;
  }

  stop(): void {
    this.active = false;
    this.el.hidden = true;
    this.hud.hidden = false;
    this.resultModal.hidden = true;
    this.floatLayer.replaceChildren();
    this.floats = [];
    this.player.setWorld(0);
    this.player.setLunge(0);
    this.player.setMoving(false);
    this.player.setDown(false);
    this.player.root.rotation.y = 0;
    this.enemy.setWorld(2.4);
    this.enemy.setLunge(0);
    this.enemy.setMoving(false);
    this.enemy.setDown(false);
    this.enemy.root.rotation.y = Math.PI;
    this.enemy.root.visible = false;
    this.enemy.shadow.visible = false;
  }

  get isActive(): boolean {
    return this.active;
  }
}
