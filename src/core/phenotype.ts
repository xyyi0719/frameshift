/**
 * 表型推导（A 负责）。
 * ---------------------------------------------------------------
 * 纯函数。语义见 docs/SPEC.md 2.5：
 * 九项 stats 全部存在（初值 0），size = 零件数，families 逐家族计数，
 * locomotion 按固定优先级判定。judge 只看这里，不看序列。
 */

import type { Family, Gene, Phenotype, StatKey } from './types';
import { STAT_ORDER } from './types';

const FAMILIES: readonly Family[] = ['A', 'U', 'G', 'C'];

/** 纯函数。 */
export function phenotype(gene: Gene): Phenotype {
  const stats = {} as Record<StatKey, number>;
  for (const key of STAT_ORDER) {
    stats[key] = 0;
  }

  const families = {} as Record<Family, number>;
  for (const family of FAMILIES) {
    families[family] = 0;
  }

  for (const part of gene.parts) {
    families[part.family] += 1;
    for (const key of STAT_ORDER) {
      const value = part.definition.stats[key];
      if (typeof value === 'number') {
        stats[key] += value;
      }
    }
  }

  return {
    stats,
    size: gene.parts.length,
    parts: gene.parts,
    families,
    locomotion: locomotionOf(stats),
  };
}

function locomotionOf(stats: Readonly<Record<StatKey, number>>): Phenotype['locomotion'] {
  if (stats.flight > 0 && stats.stride > 0) return 'mixed';
  if (stats.flight > 0) return 'fly';
  if (stats.stride > 0) return 'walk';
  if (stats.swim > 0) return 'swim';
  return 'none';
}
