/**
 * 密码表（A 负责）。
 * ---------------------------------------------------------------
 * 规律见 docs/SPEC.md 2.1：
 *   第 1 位 = 家族，第 3 位 = 变体，第 2 位 = 沉默位（不决定零件）。
 *   三个终止密码子 UAA / UAG / UGA 覆盖 U 家族。
 * 64 个键全部由 BASE_ORDER 三重循环生成，避免手抄出错。
 */

import { BASE_ORDER, STOP_CODONS } from './types';
import type { Codon, PartDefinition, PartId } from './types';
import { PART_BY_ID, PART_DEFS } from '../data/parts';

/** codon → 零件定义；终止密码子的值是字符串 'stop'。恰好 64 个键。 */
export const CODON_TABLE: Readonly<Record<Codon, PartDefinition | 'stop'>> =
  (() => {
    const table: Record<Codon, PartDefinition | 'stop'> = {};

    // 家族 + 变体 → 零件定义（16 个组合，全部来自 PART_DEFS）。
    const byShape = new Map<string, PartDefinition>();
    for (const def of PART_DEFS) {
      byShape.set(`${def.family}${def.variant}`, def);
    }

    const stops = new Set<string>(STOP_CODONS);

    for (const family of BASE_ORDER) {
      for (const silent of BASE_ORDER) {
        for (const variant of BASE_ORDER) {
          const codon = `${family}${silent}${variant}`;
          if (stops.has(codon)) {
            table[codon] = 'stop';
            continue;
          }
          const def = byShape.get(`${family}${variant}`);
          if (!def) {
            // 数据错误（PART_DEFS 不完整）。这里在模块加载期就炸，避免静默出错。
            throw new RangeError(`no part definition for codon ${codon}`);
          }
          table[codon] = def;
        }
      }
    }

    return table;
  })();

const CODON_PATTERN = /^[AUGC]{3}$/;

/**
 * 查表。输入不是 3 个合法字母时抛 RangeError。
 * （内部用；decode 只会传合法大写密码子。）
 */
export function codonToPart(codon: Codon): PartDefinition | 'stop' {
  const key = codon.toUpperCase();
  if (!CODON_PATTERN.test(key)) {
    throw new RangeError(`invalid codon: ${JSON.stringify(codon)}`);
  }
  return CODON_TABLE[key];
}

/** 取零件定义。id 非法（理论上不会发生）时抛 RangeError。 */
export function partDef(id: PartId): PartDefinition {
  const def = PART_BY_ID[id];
  if (!def) {
    throw new RangeError(`unknown part id: ${JSON.stringify(id)}`);
  }
  return def;
}
