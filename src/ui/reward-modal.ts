/**
 * 肉鸽战利品「随机三选一」弹窗（P-031, P-033）
 * ---------------------------------------------------------------
 * 击败每波关卡动物后弹出 3 张随机盲盒零件卡片，标注来源动物、颜色块、
 * 一句话核心作用，以及智能高亮「叠阶强化 / 躯干拼色融合 / 彩蛋组合」。
 */

import type { PartDef, RewardOption } from '../core';
import { el } from './dom';
import { t } from './strings';

function hexStr(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function statsBrief(def: PartDef): string {
  const out: string[] = [];
  if (def.stats.hp) out.push(`HP +${def.stats.hp}`);
  if (def.stats.atk) out.push(`ATK +${def.stats.atk}`);
  if (def.stats.def) out.push(`DEF +${def.stats.def}`);
  if (def.stats.spd) out.push(`SPD ${def.stats.spd > 0 ? '+' : ''}${def.stats.spd}`);
  return out.join(' · ') || '特性强化';
}

export class RewardModal {
  readonly el: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly subEl: HTMLElement;
  private readonly gridEl: HTMLElement;
  private onPick: ((def: PartDef) => void) | null = null;

  constructor(host: HTMLElement) {
    this.el = el('div', 'reward-backdrop');
    this.el.hidden = true;

    const box = el('div', 'reward-modal');
    const eyebrow = el('div', 'eyebrow', 'STAGE 1 LOOT · 随机三选一');
    this.titleEl = el('h2', 'reward-title', '击败了对手！挑一件零件装上吧');
    this.subEl = el('p', 'reward-sub', '选中的零件会立刻装到你的小鸡身上（同件自动叠阶变强，躯干自动分区拼色）');
    this.gridEl = el('div', 'reward-grid');

    box.append(eyebrow, this.titleEl, this.subEl, this.gridEl);
    this.el.append(box);
    host.appendChild(this.el);
  }

  open(
    enemyName: string,
    waveNum: number,
    options: readonly RewardOption[],
    onPick: (def: PartDef) => void,
  ): void {
    this.onPick = onPick;
    this.titleEl.textContent = `击败了「${enemyName}」！选 1 件随机掉落零件`;
    this.subEl.textContent =
      waveNum >= 3
        ? '第 1 关头目已攻克！挑走这件终极掉落，继续微调造型或重刷第 1 关冲满 3 阶！'
        : '点选任意卡片立即装上小鸡，查看 3D 变色/拼色/特效后即可迎战下一波！';

    this.gridEl.replaceChildren();
    for (const opt of options) {
      const def = opt.def;
      const card = el('button', `reward-card tone-${opt.badgeTone}`);
      card.type = 'button';

      const top = el('div', 'reward-card-top');
      const swatch = el('span', 'reward-swatch');
      swatch.style.background = `linear-gradient(135deg, ${hexStr(def.art.color)}, ${hexStr(def.art.accentColor)})`;
      const slotPill = el('span', 'reward-slot', t(`slot.${def.slot}` as 'slot.body'));
      const badge = el('span', `reward-badge ${opt.badgeTone}`, opt.badge);
      top.append(swatch, slotPill, badge);

      const name = el('h3', 'reward-name', def.name.zh);
      const source = el('div', 'reward-source', `来源：${def.source} · ${def.theme === 'mech' ? '机械件' : '动物部位'}`);
      const role = el('p', 'reward-role', def.role);
      const stats = el('div', 'reward-stats', statsBrief(def));

      card.append(top, name, source, role, stats);
      if (opt.comboHint) {
        card.append(el('div', 'reward-combo-hint', opt.comboHint));
      }

      card.addEventListener('click', () => {
        const cb = this.onPick;
        this.close();
        cb?.(def);
      });
      this.gridEl.append(card);
    }

    this.el.hidden = false;
  }

  close(): void {
    this.el.hidden = true;
    this.onPick = null;
  }
}
