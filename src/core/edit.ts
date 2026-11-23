/**
 * 编辑与预览（A 负责）。
 * ---------------------------------------------------------------
 * 纯函数：applyEdit 只负责拼字符串，不做额度/解锁检查（那是 Session 的事）。
 * 编程错误（越界 / 坏字母）抛 RangeError；previewEdit 把这类错误收敛成 null。
 */

import type { Base, EditRequest, Gene, Phenotype } from './types';
import { BASES, MAX_SEQUENCE_LENGTH } from './types';
import { decode } from './decode';
import { phenotype } from './phenotype';

const BASE_SET: ReadonlySet<string> = new Set(BASES);

function normalizeBase(value: unknown): Base {
  if (typeof value !== 'string') {
    throw new RangeError(`missing base: ${JSON.stringify(value)}`);
  }
  const base = value.toUpperCase();
  if (!BASE_SET.has(base)) {
    throw new RangeError(`invalid base: ${JSON.stringify(value)}`);
  }
  return base as Base;
}

function assertIndex(index: number, min: number, max: number, op: string): void {
  if (!Number.isInteger(index) || index < min || index > max) {
    throw new RangeError(
      `index ${JSON.stringify(index)} out of range for ${op}: ${min}..${max}`,
    );
  }
}

/** 纯函数：返回编辑后的字符串。越界或非法 base 抛 RangeError。 */
export function applyEdit(seq: string, req: EditRequest): string {
  switch (req.op) {
    case 'insert': {
      assertIndex(req.index, 0, seq.length, 'insert');
      const base = normalizeBase(req.base);
      if (seq.length + 1 > MAX_SEQUENCE_LENGTH) {
        throw new RangeError(
          `sequence would exceed ${MAX_SEQUENCE_LENGTH} bases`,
        );
      }
      return seq.slice(0, req.index) + base + seq.slice(req.index);
    }
    case 'delete': {
      assertIndex(req.index, 0, seq.length - 1, 'delete');
      return seq.slice(0, req.index) + seq.slice(req.index + 1);
    }
    case 'replace': {
      assertIndex(req.index, 0, seq.length - 1, 'replace');
      const base = normalizeBase(req.base);
      if (seq[req.index] === base) {
        throw new RangeError(`replace at ${req.index} would not change the base`);
      }
      return seq.slice(0, req.index) + base + seq.slice(req.index + 1);
    }
    default: {
      const never: never = req.op;
      throw new RangeError(`unknown edit op: ${JSON.stringify(never)}`);
    }
  }
}

/**
 * 预览（鼠标悬停画幽灵碱基用）：不修改任何状态。
 * 请求非法（越界 / 坏字母 / same-base 的 replace / 超长）时返回 null，绝不抛。
 */
export function previewEdit(
  seq: string,
  req: EditRequest,
): { seq: string; gene: Gene; phenotype: Phenotype } | null {
  let next: string;
  try {
    next = applyEdit(seq, req);
  } catch {
    return null;
  }
  const gene = decode(next);
  return { seq: next, gene, phenotype: phenotype(gene) };
}
