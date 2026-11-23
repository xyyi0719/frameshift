/**
 * 提示求解（A 负责）。
 * ---------------------------------------------------------------
 * 给 UI 的「提示 / 再给一个提示」按钮用：从当前序列出发，找一步能让
 * judge() 判 pass 的编辑。纯函数、确定性、无副作用、绝不抛异常。
 *
 * 枚举顺序（固定）：
 *   1. insert：gap 下标 0..seq.length 升序；同一 gap 内 A < U < G < C；
 *   2. delete：下标 0..seq.length-1 升序；
 *   3. replace 不在提示范围内（前两关都没解锁）。
 *
 * 额度：签名里没有「已用编辑数」，所以这里只要求关卡 budget >= 1
 * （即这一步本身落在额度内）。B 决定是否展示提示时应先看 budgetLeft > 0。
 *
 * 契约缺口备注：冻结的 types.ts 里没有 LevelSpec / editBudget，
 * 因此参数用已有的 Level 类型、额度用 level.budget；不改 types.ts。
 */

import type { Base, EditRequest, Gene, Level } from './types';
import { BASE_ORDER, MAX_SEQUENCE_LENGTH } from './types';
import { applyEdit } from './edit';
import { decode } from './decode';
import { phenotype } from './phenotype';
import { judge } from './judge';

/** 插入候选的碱基顺序：A < U < G < C（SPEC 的 BASE_ORDER）。 */
const INSERT_BASES: readonly Base[] = BASE_ORDER;

const VALID_SEQUENCE = /^[AUGC]+$/;

function passes(level: Level, gene: Gene): boolean {
  if (gene.issue !== null) return false;
  return judge(level, gene, phenotype(gene)).outcome === 'pass';
}

/**
 * 在当前序列上按固定顺序收集至多 limit 个可行的第一步编辑。
 * 内部先做全部输入校验；任何异常都收敛成空数组。
 */
function collectHints(level: Level, seq: string, limit: number): EditRequest[] {
  const out: EditRequest[] = [];
  if (limit <= 0) return out;

  if (typeof seq !== 'string') return out;
  const s = seq.toUpperCase();
  if (!VALID_SEQUENCE.test(s)) return out;

  const current = decode(s);
  // 非法基因（empty / bad_char / no_start / no_stop）不给提示。
  if (current.issue !== null) return out;

  // 关卡数据至少要有一刀额度；修好的答案不值得再提示。
  if (typeof level.budget !== 'number' || !Number.isFinite(level.budget)) return out;
  if (level.budget < 1) return out;
  if (judge(level, current, phenotype(current)).outcome === 'pass') return out;

  if (!Array.isArray(level.ops)) return out;
  const canInsert = level.ops.includes('insert');
  const canDelete = level.ops.includes('delete');
  if (!canInsert && !canDelete) return out;

  const n = s.length;

  // ---- 1. 插入：gap 升序，gap 内 A/U/G/C ----
  if (canInsert && n + 1 <= MAX_SEQUENCE_LENGTH) {
    for (let gap = 0; gap <= n; gap += 1) {
      for (const base of INSERT_BASES) {
        const request: EditRequest = { op: 'insert', index: gap, base };
        let next: string;
        try {
          next = applyEdit(s, request);
        } catch {
          continue;
        }
        if (passes(level, decode(next))) {
          out.push(request);
          if (out.length >= limit) return out;
        }
      }
    }
  }

  // ---- 2. 删除：index 升序 ----
  if (canDelete) {
    for (let index = 0; index < n; index += 1) {
      const request: EditRequest = { op: 'delete', index };
      let next: string;
      try {
        next = applyEdit(s, request);
      } catch {
        continue;
      }
      if (passes(level, decode(next))) {
        out.push(request);
        if (out.length >= limit) return out;
      }
    }
  }

  return out;
}

/**
 * 给当前序列找一步「再走一步就能通关」的编辑。
 * 没有可行解、序列非法、关卡非法时返回 null；绝不抛异常。
 * 同样的输入永远返回同一个结果。
 */
export function hintFor(level: Level, seq: string): EditRequest | null {
  try {
    const hints = collectHints(level, seq, 1);
    return hints.length > 0 ? hints[0] : null;
  } catch {
    return null;
  }
}

/**
 * 至多 n 个可行的第一步编辑，顺序与 hintFor 一致，用于「再给一个提示」。
 * n 非法（负数 / NaN / 非数字）时返回空数组。
 */
export function hintsFor(level: Level, seq: string, n: number): EditRequest[] {
  try {
    if (typeof n !== 'number' || !Number.isFinite(n)) return [];
    const limit = Math.max(0, Math.floor(n));
    return collectHints(level, seq, limit);
  } catch {
    return [];
  }
}
