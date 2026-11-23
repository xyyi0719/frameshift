/**
 * 序列解码（A 负责）。
 * ---------------------------------------------------------------
 * 精确语义见 docs/SPEC.md 2.2。纯函数、永不抛异常、无副作用。
 *
 * 关键约定：
 *  - 起始密码子 AUG 之前 = 'junk'，终止之后 = 'trailer'，末尾残片 = 'partial'；
 *    junk / trailer / partial 都仍然可编辑，只是不翻译。
 *  - 链内出现第二个 AUG 不重启翻译（它只是一个 head 零件）。
 *  - codons 覆盖整条序列：每个碱基恰好属于一个槽位，按 start 升序、不重叠。
 */

import type {
  Base,
  Codon,
  CodonSlot,
  Gene,
  GeneIssue,
  Part,
  PartId,
} from './types';
import { START_CODON, STOP_CODONS } from './types';
import { codonToPart, partDef } from './codons';

const VALID_SEQUENCE = /^[AUGC]*$/;
const STOP_SET: ReadonlySet<string> = new Set(STOP_CODONS);

/** 构造一个空解码结果（bad_char / empty 用）。 */
function emptyGene(seq: string, issue: GeneIssue): Gene {
  return {
    seq,
    bases: [],
    issue,
    frameStart: 0,
    startIndex: -1,
    stopIndex: -1,
    stopCodon: null,
    codons: [],
    parts: [],
    trailerStart: 0,
  };
}

function slot(
  index: number,
  start: number,
  text: string,
  role: CodonSlot['role'],
  partId: PartId | null,
): CodonSlot {
  return {
    index,
    start,
    bases: text.split('') as Base[],
    text,
    role,
    partId,
  };
}

/** 由单个密码子造零件实例；终止密码子返回 null（调用方已排除）。 */
function makePart(
  codon: Codon,
  start: number,
  index: number,
): Part | null {
  const def = codonToPart(codon);
  if (def === 'stop') return null;
  return {
    index,
    id: def.id,
    family: def.family,
    variant: def.variant,
    codon,
    start,
    definition: def,
  };
}

/**
 * 把 [from, to) 区间按 3 个一组切成不翻译槽位（junk / trailer）。
 * 规则：
 *  - 起始之前的 junk 短组仍标 'junk'（它不在序列末尾）；
 *  - 整条序列都没有起点时，末尾不足 3 个的 junk 残片标 'partial'（SPEC 2.2 第 3 步）；
 *  - 终止之后的 trailer 一律标 'trailer'，即使最后一组只有 1~2 个碱基
 *    （SPEC 3.1：AUAG 整段都是 trailer；有效基因不该被画成 DANGLING）。
 * 两种角色都保证覆盖每一个碱基。
 */
function pushUntranslated(
  codons: CodonSlot[],
  seq: string,
  from: number,
  to: number,
  role: 'junk' | 'trailer',
): void {
  for (let j = from; j < to; j += 3) {
    const end = Math.min(j + 3, to);
    const text = seq.slice(j, end);
    const isPartial =
      text.length < 3 && role === 'junk' && end === seq.length;
    codons.push(
      slot(
        codons.length,
        j,
        text,
        isPartial ? 'partial' : role,
        null,
      ),
    );
  }
}

/** 纯函数。语义见 2.2。 */
export function decode(seq: string): Gene {
  const raw = seq.toUpperCase();

  if (raw.length === 0) {
    return emptyGene('', 'empty');
  }
  if (!VALID_SEQUENCE.test(raw)) {
    // seq 原样（大写）保留，方便 UI 定位非法字符；其余字段按 SPEC 清空。
    return emptyGene(raw, 'bad_char');
  }

  const bases = raw.split('') as Base[];
  const codons: CodonSlot[] = [];
  const parts: Part[] = [];

  const startIndex = raw.indexOf(START_CODON);

  // ---- 没有起点：整条序列按 0 起每 3 个一组，全部 junk/partial ----
  if (startIndex < 0) {
    pushUntranslated(codons, raw, 0, raw.length, 'junk');
    return {
      seq: raw,
      bases,
      issue: 'no_start',
      frameStart: 0,
      startIndex: -1,
      stopIndex: -1,
      stopCodon: null,
      codons,
      parts,
      trailerStart: raw.length,
    };
  }

  // ---- 起点之前的 junk ----
  pushUntranslated(codons, raw, 0, startIndex, 'junk');

  // ---- 从起点开始翻译 ----
  let stopIndex = -1;
  let stopCodon: Codon | null = null;
  let trailerStart = raw.length;
  let cursor = startIndex;

  while (cursor + 3 <= raw.length) {
    const codon = raw.slice(cursor, cursor + 3);
    const isStart = cursor === startIndex;
    const part = makePart(codon, cursor, parts.length);

    if (isStart) {
      // 起始密码子一定是 AUG，且 codonToPart('AUG') 是 head。
      const head = part ?? {
        index: parts.length,
        id: 'head' as const,
        family: 'A' as const,
        variant: 'G' as const,
        codon,
        start: cursor,
        definition: partDef('head'),
      };
      parts.push(head);
      codons.push(slot(codons.length, cursor, codon, 'start', head.id));
      cursor += 3;
      continue;
    }

    if (STOP_SET.has(codon)) {
      codons.push(slot(codons.length, cursor, codon, 'stop', null));
      stopIndex = cursor;
      stopCodon = codon;
      trailerStart = cursor + 3;
      cursor += 3;
      break;
    }

    if (part) {
      parts.push(part);
      codons.push(slot(codons.length, cursor, codon, 'part', part.id));
    }
    cursor += 3;
  }

  // ---- 终止之后的 trailer；无终止时 trailerStart = seq.length ----
  if (stopIndex >= 0) {
    pushUntranslated(codons, raw, trailerStart, raw.length, 'trailer');
  } else {
    // 剩余不足 3 个的残片（如果有）。
    if (cursor < raw.length) {
      const text = raw.slice(cursor);
      codons.push(slot(codons.length, cursor, text, 'partial', null));
    }
    trailerStart = raw.length;
  }

  // ---- 读框起点永远等于第一个 AUG 的下标 ----
  const frameStart = startIndex;

  // ---- 翻译到末尾仍未遇终止 → no_stop（parts 照常给出）----
  const issue: GeneIssue | null = stopIndex >= 0 ? null : 'no_stop';

  return {
    seq: raw,
    bases,
    issue,
    frameStart,
    startIndex,
    stopIndex,
    stopCodon,
    codons,
    parts,
    trailerStart,
  };
}
