/**
 * 编辑前后差异（A 负责）。
 * ---------------------------------------------------------------
 * 纯函数，是 B 的动画数据源。按零件序号对齐 before/after：
 *   kept（同一零件）/ flipped（同位置换了零件）/ appeared / vanished。
 * seam / shiftBy 直接由 edit 推出，不靠字符串 diff。
 *
 * 注意：替换沉默位（密码子第 2 个字母）时零件链完全不变，
 * partChanges 全是 kept、firstChange = -1；B 用
 *   edit.op === 'replace' && firstChange === -1
 * 来播「翻一下再翻回来 + THE MIDDLE BASE IS SILENT」。
 */

import type {
  Edit,
  Gene,
  GeneDiff,
  Part,
  PartChange,
  PartChangeKind,
} from './types';

function kindOf(before: Part | null, after: Part | null): PartChangeKind {
  if (before && after) {
    return before.id === after.id ? 'kept' : 'flipped';
  }
  if (before) return 'vanished';
  if (after) return 'appeared';
  return 'kept';
}

function shiftOf(op: Edit['op']): -1 | 0 | 1 {
  switch (op) {
    case 'insert':
      return 1;
    case 'delete':
      return -1;
    case 'replace':
      return 0;
    default: {
      const never: never = op;
      throw new RangeError(`unknown edit op: ${JSON.stringify(never)}`);
    }
  }
}

/** 纯函数。 */
export function diffGenes(before: Gene, after: Gene, edit: Edit): GeneDiff {
  const length = Math.max(before.parts.length, after.parts.length);
  const partChanges: PartChange[] = [];

  for (let index = 0; index < length; index += 1) {
    const oldPart = before.parts[index] ?? null;
    const newPart = after.parts[index] ?? null;
    partChanges.push({
      index,
      kind: kindOf(oldPart, newPart),
      before: oldPart,
      after: newPart,
    });
  }

  const firstChange = partChanges.findIndex((change) => change.kind !== 'kept');

  return {
    edit,
    seam: edit.index,
    shiftBy: shiftOf(edit.op),
    partChanges,
    firstChange,
    validityChanged: before.issue !== after.issue,
    before,
    after,
  };
}
