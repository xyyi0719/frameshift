/**
 * 会话状态机（A 负责）。
 * ---------------------------------------------------------------
 * 全局唯一可变状态：当前序列、编辑历史、监听器。
 * 约定（docs/SPEC.md 2.4 / 6.2，已按线上反馈改为 PAR 语义）：
 *  - level.budget 是「标准杆」，不是硬上限：编辑永远不因额度被拒绝，
 *    budgetUsed 可以超过 level.budget；UI 用 overBudget / par 做展示。
 *  - 编辑失败不抛异常，返回 { ok:false, reason }；运行期不再产生 'no_budget'
 *    （类型里保留该错误码只是为了兼容冻结的 types.ts）。
 *  - undo 免费且不限次数；budgetUsed = history.length，撤销自然退还。
 *  - 事件在状态更新之后同步派发；派发期间再次调用 Session 方法是被禁止的
 *    （B 不要这么干，这里也不为它做队列）。
 *  - 每次 emit 携带的都是新生成的不可变快照对象（Gene/Phenotype/Edit）。
 */

import type {
  Base,
  Edit,
  EditRejection,
  EditRequest,
  EditResult,
  Gene,
  Judgement,
  Level,
  Phenotype,
  SessionEvent,
  Unsubscribe,
} from './types';
import { BASES, MAX_SEQUENCE_LENGTH } from './types';
import { applyEdit } from './edit';
import { decode } from './decode';
import { phenotype } from './phenotype';
import { diffGenes } from './diff';
import { judge as judgeRun } from './judge';

const BASE_SET: ReadonlySet<string> = new Set(BASES);

function isBase(value: unknown): value is Base {
  return typeof value === 'string' && BASE_SET.has(value.toUpperCase());
}

function normalizeBase(value: string): Base {
  return value.toUpperCase() as Base;
}

export class Session {
  /** 构造函数传进来的关卡（只读）。 */
  readonly level: Level;

  private currentSeq: string;
  private currentGene: Gene;
  private currentPhenotype: Phenotype;
  private readonly edits: Edit[] = [];
  private readonly listeners = new Set<(event: SessionEvent) => void>();

  constructor(level: Level) {
    this.level = level;
    this.currentSeq = level.sequence.toUpperCase();
    this.currentGene = decode(this.currentSeq);
    this.currentPhenotype = phenotype(this.currentGene);
  }

  /** 当前序列（永远是合法大写 A/U/G/C）。 */
  get seq(): string {
    return this.currentSeq;
  }

  /** 当前解码结果，编辑后同步更新。 */
  get gene(): Gene {
    return this.currentGene;
  }

  /** 当前表型。 */
  get phenotype(): Phenotype {
    return this.currentPhenotype;
  }

  /**
   * 相对标准杆的余量 = level.budget - budgetUsed。
   * PAR 语义下它不是「还允许几刀」，可以是负数（说明已经超杆）。
   */
  get budgetLeft(): number {
    return this.level.budget - this.edits.length;
  }

  get budgetUsed(): number {
    return this.edits.length;
  }

  /** 本局标准杆（= level.budget）。给 HUD 的 "3 edits · par 1" 用。 */
  get par(): number {
    return this.level.budget;
  }

  /** 是否已经超过标准杆（budgetUsed > level.budget）。正好等于 par 时是 false。 */
  get overBudget(): boolean {
    return this.budgetUsed > this.level.budget;
  }

  /** 撤销栈非空。 */
  get canUndo(): boolean {
    return this.edits.length > 0;
  }

  /** 已发生的编辑（时间顺序，只读）。 */
  get history(): readonly Edit[] {
    return this.edits;
  }

  /**
   * 试探：不会改变状态。返回 null 表示可以执行，否则返回拒绝原因。
   * 顺序固定：locked_op → index_out_of_range → invalid_base
   *          → no_change → too_long。
   * 额度不再是拒绝理由（PAR 只是展示用的标准杆）。
   */
  canEdit(req: EditRequest): EditRejection | null {
    if (!this.level.ops.includes(req.op)) {
      return 'locked_op';
    }

    const n = this.currentSeq.length;
    const indexOk =
      Number.isInteger(req.index) &&
      req.index >= 0 &&
      (req.op === 'insert' ? req.index <= n : req.index <= n - 1);
    if (!indexOk) {
      return 'index_out_of_range';
    }

    if (req.op !== 'delete') {
      if (!isBase(req.base)) {
        return 'invalid_base';
      }
      const base = normalizeBase(req.base);
      if (req.op === 'replace' && this.currentSeq[req.index] === base) {
        return 'no_change';
      }
    }

    if (req.op === 'insert' && n + 1 > MAX_SEQUENCE_LENGTH) {
      return 'too_long';
    }

    return null;
  }

  /** 执行编辑。永不抛异常；额度耗尽后依然成功，budgetUsed 继续累加。 */
  edit(req: EditRequest): EditResult {
    const rejection = this.canEdit(req);
    if (rejection !== null) {
      return { ok: false, reason: rejection };
    }

    const beforeGene = this.currentGene;
    const nextSeq = applyEdit(this.currentSeq, req);

    let edit: Edit;
    switch (req.op) {
      case 'insert':
        edit = { op: 'insert', index: req.index, base: normalizeBase(req.base as string) };
        break;
      case 'delete':
        edit = {
          op: 'delete',
          index: req.index,
          removed: this.currentSeq[req.index] as Base,
        };
        break;
      case 'replace':
        edit = {
          op: 'replace',
          index: req.index,
          base: normalizeBase(req.base as string),
          removed: this.currentSeq[req.index] as Base,
        };
        break;
    }

    this.currentSeq = nextSeq;
    this.currentGene = decode(nextSeq);
    this.currentPhenotype = phenotype(this.currentGene);
    this.edits.push(edit);

    const diff = diffGenes(beforeGene, this.currentGene, edit);
    this.emit({
      type: 'edit',
      edit,
      diff,
      gene: this.currentGene,
      phenotype: this.currentPhenotype,
      budgetUsed: this.budgetUsed,
    });

    return {
      ok: true,
      edit,
      gene: this.currentGene,
      phenotype: this.currentPhenotype,
      budgetUsed: this.budgetUsed,
    };
  }

  insert(index: number, base: Base): EditResult {
    return this.edit({ op: 'insert', index, base });
  }

  remove(index: number): EditResult {
    return this.edit({ op: 'delete', index });
  }

  replace(index: number, base: Base): EditResult {
    return this.edit({ op: 'replace', index, base });
  }

  /** 撤销一步。没有可撤销时返回 false。 */
  undo(): boolean {
    const edit = this.edits.pop();
    if (!edit) return false;

    switch (edit.op) {
      case 'insert':
        this.currentSeq =
          this.currentSeq.slice(0, edit.index) +
          this.currentSeq.slice(edit.index + 1);
        break;
      case 'delete':
        this.currentSeq =
          this.currentSeq.slice(0, edit.index) +
          (edit.removed ?? '') +
          this.currentSeq.slice(edit.index);
        break;
      case 'replace':
        this.currentSeq =
          this.currentSeq.slice(0, edit.index) +
          (edit.removed ?? '') +
          this.currentSeq.slice(edit.index + 1);
        break;
    }

    this.currentGene = decode(this.currentSeq);
    this.currentPhenotype = phenotype(this.currentGene);
    this.emit({
      type: 'undo',
      edit,
      gene: this.currentGene,
      phenotype: this.currentPhenotype,
      budgetUsed: this.budgetUsed,
    });
    return true;
  }

  /** 回到关卡初始状态。 */
  reset(): void {
    this.edits.length = 0;
    this.currentSeq = this.level.sequence.toUpperCase();
    this.currentGene = decode(this.currentSeq);
    this.currentPhenotype = phenotype(this.currentGene);
    this.emit({
      type: 'reset',
      gene: this.currentGene,
      phenotype: this.currentPhenotype,
      budgetUsed: 0,
    });
  }

  /** 用当前状态判定是否过关。 */
  judge(): Judgement {
    return judgeRun(this.level, this.currentGene, this.currentPhenotype);
  }

  /** 订阅状态变化；同一监听器重复订阅会被忽略。 */
  subscribe(listener: (event: SessionEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: SessionEvent): void {
    // 监听器抛错不能破坏状态机；逐个派发，互不影响。
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // 故意吞掉：Session 的方法契约是「永不抛异常」。
      }
    }
  }
}
