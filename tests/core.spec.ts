/**
 * A 的核心单元测试。
 * ---------------------------------------------------------------
 * 覆盖 docs/SPEC.md 附录 B 的全部用例，外加若干边界：
 * 空串 / 超长 / 非法碱基 / 撤销到底 / 额度为 0 / 沉默位替换 / 事件。
 * 所有期望数值来自 SPEC（已逐位核对），不要为了让测试变绿而改关卡数据。
 */

import { describe, expect, it } from 'vitest';
import {
  CODON_TABLE,
  MAX_SEQUENCE_LENGTH,
  Session,
  PART_DEFS,
  applyEdit,
  codonToPart,
  decode,
  diffGenes,
  judge,
  partDef,
  phenotype,
  previewEdit,
} from '../src/core';
import type {
  Base,
  EditRequest,
  Family,
  Gene,
  GeneDiff,
  Level,
  SessionEvent,
  StatKey,
} from '../src/core';
import { LEVELS, levelAt, levelById } from '../src/levels';

const BASES: readonly Base[] = ['A', 'U', 'G', 'C'];

const L1 = LEVELS[0];
const L2 = LEVELS[1];

/** 引用契约：槽位必须覆盖整条序列、start 升序、区间不重叠、index 连续。 */
function expectCoverage(gene: Gene): void {
  let cursor = 0;
  gene.codons.forEach((slot, i) => {
    expect(slot.index).toBe(i);
    expect(slot.start).toBe(cursor);
    expect(slot.bases.length).toBeGreaterThanOrEqual(1);
    expect(slot.bases.length).toBeLessThanOrEqual(3);
    expect(slot.text).toBe(gene.seq.slice(slot.start, slot.start + slot.bases.length));
    expect(slot.text).toBe(slot.bases.join(''));
    cursor += slot.bases.length;
  });
  expect(cursor).toBe(gene.seq.length);
}

/** 零件定义里的 stats 是 Partial，这里按 0 补齐方便断言。 */
function statOf(gene: Gene, key: StatKey): number {
  return phenotype(gene).stats[key];
}

function deleteAt(seq: string, index: number): string {
  return seq.slice(0, index) + seq.slice(index + 1);
}

/* ==========================================================================
 * 1. 基础解码
 * ========================================================================== */

describe('decode — 基础语义（附录 B）', () => {
  it("decode('') → issue 'empty'", () => {
    const g = decode('');
    expect(g.issue).toBe('empty');
    expect(g.seq).toBe('');
    expect(g.bases).toEqual([]);
    expect(g.codons).toEqual([]);
    expect(g.parts).toEqual([]);
    expect(g.frameStart).toBe(0);
    expect(g.startIndex).toBe(-1);
    expect(g.stopIndex).toBe(-1);
    expect(g.stopCodon).toBeNull();
    expect(g.trailerStart).toBe(0);
  });

  it("decode('XYZ') → issue 'bad_char'", () => {
    const g = decode('XYZ');
    expect(g.issue).toBe('bad_char');
    expect(g.seq).toBe('XYZ');
    expect(g.bases).toEqual([]);
    expect(g.codons).toEqual([]);
    expect(g.parts).toEqual([]);
    expect(g.startIndex).toBe(-1);
    expect(g.stopIndex).toBe(-1);
    expect(g.stopCodon).toBeNull();
    expect(g.trailerStart).toBe(0);
  });

  it("decode('AUG') → no_stop，parts = [head]", () => {
    const g = decode('AUG');
    expect(g.issue).toBe('no_stop');
    expect(g.parts.map((p) => p.id)).toEqual(['head']);
    expect(g.startIndex).toBe(0);
    expect(g.frameStart).toBe(0);
    expect(g.stopIndex).toBe(-1);
    expect(g.stopCodon).toBeNull();
    expect(g.trailerStart).toBe(3);
    expect(g.codons.map((c) => c.role)).toEqual(['start']);
    expectCoverage(g);
  });

  it("decode('AUGUAA') → issue null，stopCodon UAA / stopIndex 3", () => {
    const g = decode('AUGUAA');
    expect(g.issue).toBeNull();
    expect(g.parts.map((p) => p.id)).toEqual(['head']);
    expect(g.stopCodon).toBe('UAA');
    expect(g.stopIndex).toBe(3);
    expect(g.trailerStart).toBe(6);
    expect(g.codons.map((c) => c.role)).toEqual(['start', 'stop']);
    expectCoverage(g);
  });

  it("decode('CCC') → no_start，codons 全是 junk", () => {
    const g = decode('CCC');
    expect(g.issue).toBe('no_start');
    expect(g.parts).toEqual([]);
    expect(g.startIndex).toBe(-1);
    expect(g.frameStart).toBe(0);
    expect(g.trailerStart).toBe(3);
    expect(g.codons.map((c) => c.role)).toEqual(['junk']);
    expect(g.codons[0].partId).toBeNull();
    expectCoverage(g);
  });

  it('沉默位：UUG / UCG / UGG 都是 leg', () => {
    expect(decode('UUGUCGUGG').issue).toBe('no_start');
    for (const codon of ['UUG', 'UCG', 'UGG']) {
      expect(codonToPart(codon)).not.toBe('stop');
      const def = codonToPart(codon);
      expect(def === 'stop' ? null : def.id).toBe('leg');
    }
  });

  it('CODON_TABLE 恰好 64 个键，且没有 undefined', () => {
    const keys = Object.keys(CODON_TABLE);
    expect(keys).toHaveLength(64);
    expect(new Set(keys).size).toBe(64);
    for (const key of keys) {
      expect(key).toMatch(/^[AUGC]{3}$/);
      expect(CODON_TABLE[key]).toBeDefined();
    }
  });

  it("codonToPart('UAG') === 'stop'，codonToPart('UCA').id === 'longleg'", () => {
    expect(codonToPart('UAG')).toBe('stop');
    const uca = codonToPart('UCA');
    expect(uca === 'stop' ? null : uca.id).toBe('longleg');
  });

  it('codonToPart / partDef 对编程错误抛 RangeError', () => {
    expect(() => codonToPart('AU')).toThrow(RangeError);
    expect(() => codonToPart('AUGX')).toThrow(RangeError);
    expect(() => partDef('dragon' as never)).toThrow(RangeError);
  });

  it('小写输入会被规范化；非法字符保留在 seq 里', () => {
    const lower = decode('auguaa');
    expect(lower.issue).toBeNull();
    expect(lower.seq).toBe('AUGUAA');
    const bad = decode('AUG-N');
    expect(bad.issue).toBe('bad_char');
    expect(bad.seq).toBe('AUG-N');
  });

  it('残片：无终止时末尾 1~2 个碱基是 partial', () => {
    const g = decode('AUGAA');
    expect(g.issue).toBe('no_stop');
    expect(g.parts.map((p) => p.id)).toEqual(['head']);
    expect(g.codons.map((c) => c.role)).toEqual(['start', 'partial']);
    expect(g.codons[1].text).toBe('AA');
    expect(g.trailerStart).toBe(5);
    expectCoverage(g);
  });

  it('终止之后的碱基全部是 trailer（即使最后一组不足 3 个）', () => {
    const g = decode('AUGUAAAU');
    expect(g.issue).toBeNull();
    expect(g.codons.map((c) => c.role)).toEqual(['start', 'stop', 'trailer']);
    expect(g.codons[2].text).toBe('AU');
    expect(g.trailerStart).toBe(6);
    expect(g.seq.slice(g.trailerStart)).toBe('AU');
    expectCoverage(g);
  });

  it('设计解末尾的 AUAG 整段都是 trailer', () => {
    const g = decode('AUGUCGUCGUCAGGGCCGACCUGAAUAG');
    const trailerSlots = g.codons.filter(
      (c) => c.start >= g.trailerStart,
    );
    expect(trailerSlots.map((c) => c.text)).toEqual(['AUA', 'G']);
    expect(trailerSlots.every((c) => c.role === 'trailer')).toBe(true);
  });

  it('startIndex 之前的 junk 也覆盖，起始不在 0 位时读框 = startIndex', () => {
    const g = decode('AAUGUAA');
    expect(g.issue).toBeNull();
    expect(g.startIndex).toBe(1);
    expect(g.frameStart).toBe(1);
    expect(g.codons[0].role).toBe('junk');
    expect(g.codons[0].text).toBe('A');
    expect(g.codons[1].role).toBe('start');
    expect(g.parts.map((p) => p.id)).toEqual(['head']);
    expectCoverage(g);
  });

  it('长度为 1–2 的序列：no_start，末尾短组是 partial', () => {
    for (const [seq, len] of [
      ['A', 1],
      ['AU', 2],
    ] as const) {
      const g = decode(seq);
      expect(g.issue).toBe('no_start');
      expect(g.parts).toEqual([]);
      expect(g.codons).toHaveLength(1);
      expect(g.codons[0].role).toBe('partial');
      expect(g.codons[0].text).toBe(seq);
      expect(g.trailerStart).toBe(len);
      expectCoverage(g);
    }
  });

  it('长度非 3 倍数：末尾 partial 槽位被丢弃但仍覆盖序列', () => {
    const g = decode('AUGUA');
    expect(g.issue).toBe('no_stop');
    expect(g.parts.map((p) => p.id)).toEqual(['head']);
    expect(g.codons.map((c) => c.role)).toEqual(['start', 'partial']);
    expect(g.codons[1].text).toBe('UA');
    expect(g.trailerStart).toBe(5);
    expectCoverage(g);

    const g2 = decode('AUGGGGA');
    expect(g2.issue).toBe('no_stop');
    expect(g2.parts.map((p) => p.id)).toEqual(['head', 'shell']);
    expect(g2.codons.map((c) => c.role)).toEqual(['start', 'part', 'partial']);
    expect(g2.trailerStart).toBe(7);
    expectCoverage(g2);
  });

  it('链内第二个 AUG 不重启翻译（多头）', () => {
    const g = decode('AUGUUGAUGUAA');
    expect(g.issue).toBeNull();
    expect(g.parts.map((p) => p.id)).toEqual(['head', 'leg', 'head']);
    expect(g.parts[2].index).toBe(2);
    expect(g.stopIndex).toBe(9);
    expect(g.codons.filter((c) => c.role === 'start')).toHaveLength(1);
    expectCoverage(g);
  });
});

/* ==========================================================================
 * 2. 表型
 * ========================================================================== */

describe('phenotype', () => {
  it('九项 stats 全部存在且初值 0；no_start 全 0', () => {
    const g = decode('CCC');
    const p = phenotype(g);
    expect(Object.keys(p.stats).sort()).toEqual(
      ['armor', 'bite', 'flight', 'glow', 'grip', 'sight', 'spikes', 'stride', 'swim'],
    );
    for (const key of Object.keys(p.stats) as StatKey[]) {
      expect(p.stats[key]).toBe(0);
    }
    expect(p.size).toBe(0);
    expect(p.locomotion).toBe('none');
    expect(p.families).toEqual({ A: 0, U: 0, G: 0, C: 0 });
  });

  it('no_stop 仍照常累加（身体长了一半）', () => {
    const p = phenotype(decode('AUGGGC'));
    expect(p.size).toBe(2);
    expect(p.stats.sight).toBe(1);
    expect(p.stats.spikes).toBe(2);
    expect(p.locomotion).toBe('none');
  });

  it('locomotion：flight+stride = mixed，单翼 = fly，腿 = walk，鳃 = swim', () => {
    expect(phenotype(decode('AUGGGUUUGUAA')).locomotion).toBe('mixed');
    expect(phenotype(decode('AUGGGUUAA')).locomotion).toBe('fly');
    expect(phenotype(decode('AUGUUGUAA')).locomotion).toBe('walk');
    expect(phenotype(decode('AUGCCUUAA')).locomotion).toBe('swim');
  });
});

/* ==========================================================================
 * 3. 关卡 1
 * ========================================================================== */

describe('Level 1 · One Base Short', () => {
  it('关卡元数据与初始序列逐字正确', () => {
    expect(L1.id).toBe('l01');
    expect(L1.number).toBe(1);
    expect(L1.name).toBe('One Base Short');
    expect(L1.species).toBe('Gill Blob');
    expect(L1.budget).toBe(2);
    expect(L1.ops).toEqual(['insert', 'delete']);
    expect(L1.parEdits).toBe(1);
    expect(L1.hudStats).toEqual(['stride', 'swim', 'spikes']);
    expect(L1.sequence).toBe('AUGCGUCGUCAGGGCCGACCUGAAUAG');
    expect(L1.gates.map((g) => [g.id, g.kind, g.at, g.mode])).toEqual([
      ['crack', 'chasm', 0.55, 'all'],
    ]);
    expect(L1.gates[0].requires).toEqual([{ stat: 'stride', min: 4 }]);
    expectCoverage(decode(L1.sequence));
  });

  it('初始解码与属性', () => {
    const g = decode(L1.sequence);
    expect(g.issue).toBeNull();
    expect(g.stopCodon).toBe('UAG');
    expect(g.stopIndex).toBe(24);
    expect(g.trailerStart).toBe(27);
    expect(g.parts.map((p) => p.id)).toEqual([
      'head',
      'gill',
      'gill',
      'glow',
      'spike',
      'sac',
      'gill',
      'crest',
    ]);
    const p = phenotype(g);
    expect(p.stats.stride).toBe(0);
    expect(p.stats.swim).toBe(7);
    expect(p.stats.armor).toBe(2);
    expect(p.stats.spikes).toBe(2);
    expect(p.stats.glow).toBe(2);
    expect(p.stats.sight).toBe(1);
    expect(p.stats.flight).toBe(0);
    expect(p.size).toBe(8);

    const j = judge(L1, g, p);
    expect(j.outcome).toBe('fail');
    expect(j.reason).toBe('gate_failed');
    expect(j.failedGateIndex).toBe(0);
    expect(j.failAtX).toBe(0.55);
    expect(j.gates).toHaveLength(1);
    expect(j.gates[0].checks).toEqual([
      { stat: 'stride', actual: 0, min: 4, met: false },
    ]);
  });

  it('设计解：insert(3, U) → stride 7 通过', () => {
    const s = new Session(L1);
    const result = s.insert(3, 'U');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(s.seq).toBe('AUGUCGUCGUCAGGGCCGACCUGAAUAG');
    expect(s.gene.stopCodon).toBe('UGA');
    expect(s.gene.stopIndex).toBe(21);
    expect(s.gene.trailerStart).toBe(24);
    expect(s.gene.seq.slice(s.gene.trailerStart)).toBe('AUAG');
    expect(s.gene.parts.map((p) => p.id)).toEqual([
      'head',
      'leg',
      'leg',
      'longleg',
      'shell',
      'glow',
      'eye',
    ]);
    expect(s.phenotype.stats.stride).toBe(7);
    expect(s.phenotype.stats.sight).toBe(3);
    expect(s.phenotype.stats.armor).toBe(2);
    expect(s.phenotype.stats.glow).toBe(2);

    const j = s.judge();
    expect(j.outcome).toBe('pass');
    expect(j.reason).toBe('passed');
    expect(j.failedGateIndex).toBeNull();
    expect(j.failAtX).toBe(1);
    expect(result.budgetUsed).toBe(1);
    expect(s.budgetLeft).toBe(1);
    expectCoverage(s.gene);
  });

  it('全解枚举：14 个插入解，其中 INS@3+U 属性最好（stride 7）', () => {
    const wins: string[] = [];
    for (let i = 0; i <= L1.sequence.length; i += 1) {
      for (const base of BASES) {
        const s = new Session(L1);
        const r = s.insert(i, base);
        if (r.ok && s.judge().outcome === 'pass') wins.push(`INS@${i}+${base}`);
      }
    }
    expect(wins).toHaveLength(14);
    expect(wins).toContain('INS@3+U');
    expect(wins).toEqual([
      'INS@2+G',
      'INS@3+A',
      'INS@3+U',
      'INS@3+G',
      'INS@3+C',
      'INS@4+A',
      'INS@4+U',
      'INS@4+G',
      'INS@4+C',
      'INS@5+A',
      'INS@5+U',
      'INS@5+G',
      'INS@5+C',
      'INS@6+U',
    ]);
  });

  it('死路：27 种删除全部 no_start 或 no_stop，且 judge 判 invalid', () => {
    const issues = new Set<string>();
    for (let i = 0; i < L1.sequence.length; i += 1) {
      const s = new Session(L1);
      const r = s.remove(i);
      expect(r.ok).toBe(true);
      expect(['no_start', 'no_stop']).toContain(s.gene.issue);
      issues.add(s.gene.issue ?? 'null');
      expect(s.judge().outcome).toBe('invalid');
    }
    expect([...issues].sort()).toEqual(['no_start', 'no_stop']);
  });
});

/* ==========================================================================
 * 4. 关卡 2
 * ========================================================================== */

describe('Level 2 · The Long Way Down', () => {
  it('关卡元数据与初始序列逐字正确', () => {
    expect(L2.id).toBe('l02');
    expect(L2.number).toBe(2);
    expect(L2.name).toBe('The Long Way Down');
    expect(L2.species).toBe('Bramble Fin');
    expect(L2.budget).toBe(1);
    expect(L2.ops).toEqual(['insert', 'delete']);
    expect(L2.parEdits).toBe(1);
    expect(L2.hudStats).toEqual(['flight', 'armor', 'swim']);
    expect(L2.sequence).toBe('AUGGGCGAGUCUGGGUCUGUGACAUAA');
    expect(L2.gates.map((g) => [g.id, g.kind, g.at, g.mode])).toEqual([
      ['ravine', 'chasm', 0.6, 'all'],
    ]);
    expect(L2.gates[0].requires).toEqual([{ stat: 'flight', min: 4 }]);
    expectCoverage(decode(L2.sequence));
  });

  it('初始解码与属性', () => {
    const g = decode(L2.sequence);
    expect(g.issue).toBeNull();
    expect(g.stopCodon).toBe('UAA');
    expect(g.stopIndex).toBe(24);
    expect(g.trailerStart).toBe(27);
    expect(g.parts.map((p) => p.id)).toEqual([
      'head',
      'spike',
      'shell',
      'fin',
      'shell',
      'fin',
      'shell',
      'horn',
    ]);
    const p = phenotype(g);
    expect(p.stats.flight).toBe(0);
    expect(p.stats.armor).toBe(6);
    expect(p.stats.spikes).toBe(4);
    expect(p.stats.swim).toBe(4);
    expect(judge(L2, g, p).outcome).toBe('fail');
    expect(judge(L2, g, p).failAtX).toBe(0.6);
  });

  it('设计解 DEL@7：下游重新断句，stop 也跟着移码', () => {
    const s = new Session(L2);
    const r = s.remove(7);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(s.seq).toBe('AUGGGCGGUCUGGGUCUGUGACAUAA');
    expect(s.gene.stopCodon).toBe('UGA');
    expect(s.gene.stopIndex).toBe(18);
    expect(s.gene.trailerStart).toBe(21);
    expect(s.gene.parts.map((p) => p.id)).toEqual([
      'head',
      'spike',
      'wing',
      'glow',
      'wing',
      'glow',
    ]);
    expect(s.phenotype.stats.flight).toBe(4);
    expect(s.phenotype.stats.spikes).toBe(2);
    expect(s.phenotype.stats.glow).toBe(4);
    expect(s.judge().outcome).toBe('pass');
    expect(s.budgetLeft).toBe(0);
    expectCoverage(s.gene);
  });

  it('第二解 DEL@8 也通过，表型一致', () => {
    const s = new Session(L2);
    expect(s.remove(8).ok).toBe(true);
    expect(s.gene.parts.map((p) => p.id)).toEqual([
      'head',
      'spike',
      'wing',
      'glow',
      'wing',
      'glow',
    ]);
    expect(s.phenotype.stats.flight).toBe(4);
    expect(s.judge().outcome).toBe('pass');
  });

  it('死路：112 种单碱基插入没有任何一种能过关', () => {
    const wins: string[] = [];
    for (let i = 0; i <= L2.sequence.length; i += 1) {
      for (const base of BASES) {
        const s = new Session(L2);
        const r = s.insert(i, base);
        expect(r.ok).toBe(true);
        if (s.judge().outcome === 'pass') wins.push(`INS@${i}+${base}`);
      }
    }
    expect(wins).toEqual([]);
  });

  it('死路：下标 19–26 的 8 种删除全部 no_stop', () => {
    for (let i = 19; i <= 26; i += 1) {
      const g = decode(deleteAt(L2.sequence, i));
      expect(g.issue).toBe('no_stop');
      expect(g.stopIndex).toBe(-1);
    }
  });
});

/* ==========================================================================
 * 5. judge 细节
 * ========================================================================== */

describe('judge', () => {
  it('invalid：no_start / no_stop 分别映射，gates 为空', () => {
    const empty = decode('');
    const jEmpty = judge(L1, empty, phenotype(empty));
    expect(jEmpty.outcome).toBe('invalid');
    expect(jEmpty.reason).toBe('no_start');
    expect(jEmpty.gates).toEqual([]);
    expect(jEmpty.failedGateIndex).toBeNull();
    expect(jEmpty.failAtX).toBe(0);

    const noStop = decode('AUGGGC');
    const jNoStop = judge(L1, noStop, phenotype(noStop));
    expect(jNoStop.outcome).toBe('invalid');
    expect(jNoStop.reason).toBe('no_stop');
    expect(jNoStop.failAtX).toBe(0);
  });

  it('any 模式：满足任意一条即过', () => {
    const anyLevel: Level = {
      ...L1,
      gates: [
        {
          id: 'either',
          kind: 'thorn',
          label: 'Either',
          hint: 'Fly or walk.',
          at: 0.5,
          mode: 'any',
          requires: [
            { stat: 'flight', min: 4 },
            { stat: 'stride', min: 4 },
          ],
        },
      ],
    };
    const initial = decode(L1.sequence);
    expect(judge(anyLevel, initial, phenotype(initial)).outcome).toBe('fail');

    const solved = decode('AUGUCGUCGUCAGGGCCGACCUGAAUAG');
    expect(judge(anyLevel, solved, phenotype(solved)).outcome).toBe('pass');
  });

  it('多闸门按数组顺序，停在第一个失败的闸门', () => {
    const multi: Level = {
      ...L2,
      gates: [
        L2.gates[0],
        {
          id: 'spikes',
          kind: 'thorn',
          label: 'Thorns',
          hint: 'Spikes.',
          at: 0.9,
          mode: 'all',
          requires: [{ stat: 'spikes', min: 99 }],
        },
      ],
    };
    const solved = decode('AUGGGCGGUCUGGGUCUGUGACAUAA');
    const j = judge(multi, solved, phenotype(solved));
    expect(j.outcome).toBe('fail');
    expect(j.failedGateIndex).toBe(1);
    expect(j.failAtX).toBe(0.9);
    expect(j.gates).toHaveLength(2);
  });

  it('判定只看表型：同一表型的不同写法都算通', () => {
    // 在 INS@3+U 的结果上再替换沉默位，表型不变、仍然通过（replace 已解锁的克隆关卡）。
    const replaceLevel: Level = { ...L1, ops: ['insert', 'delete', 'replace'] };
    const s = new Session(replaceLevel);
    expect(s.insert(3, 'U').ok).toBe(true);
    expect(s.judge().outcome).toBe('pass');
    // index 4 是第一个密码子的沉默位（UCG 的 C）。
    expect(s.seq[4]).toBe('C');
    expect(s.replace(4, 'U').ok).toBe(true);
    expect(s.phenotype.stats.stride).toBe(7);
    expect(s.judge().outcome).toBe('pass');
  });
});

/* ==========================================================================
 * 6. 编辑语义 / 额度 / 撤销
 * ========================================================================== */

describe('Session — 编辑语义（附录 B）', () => {
  it('replace 同一个字母 → no_change', () => {
    const level: Level = { ...L1, ops: ['insert', 'delete', 'replace'] };
    const s = new Session(level);
    const same = s.seq[4] as Base;
    expect(s.replace(4, same)).toEqual({ ok: false, reason: 'no_change' });
    expect(s.canEdit({ op: 'replace', index: 4, base: same })).toBe('no_change');
  });

  it('额度用完后再 insert → no_budget；撤销后额度退还', () => {
    const s = new Session(L1);
    expect(s.insert(3, 'U').ok).toBe(true);
    expect(s.budgetUsed).toBe(1);
    expect(s.insert(10, 'A').ok).toBe(true);
    expect(s.budgetUsed).toBe(2);
    expect(s.budgetLeft).toBe(0);
    expect(s.insert(0, 'A')).toEqual({ ok: false, reason: 'no_budget' });

    expect(s.undo()).toBe(true);
    expect(s.budgetUsed).toBe(1);
    expect(s.budgetLeft).toBe(1);
    expect(s.insert(0, 'A').ok).toBe(true);
  });

  it('undo 之后 budgetUsed 回 0、seq 回到初始', () => {
    const s = new Session(L1);
    expect(s.insert(3, 'U').ok).toBe(true);
    expect(s.undo()).toBe(true);
    expect(s.budgetUsed).toBe(0);
    expect(s.seq).toBe(L1.sequence);
    expect(s.history).toHaveLength(0);
    expect(s.canUndo).toBe(false);
    expect(s.undo()).toBe(false);
    expect(s.gene.issue).toBeNull();
  });

  it('insert 到 index === seq.length 合法；index > seq.length → index_out_of_range', () => {
    const s = new Session(L1);
    expect(s.insert(s.seq.length, 'A').ok).toBe(true);
    expect(s.undo()).toBe(true);
    expect(s.insert(s.seq.length - 1, 'A').ok).toBe(true);
    expect(s.undo()).toBe(true);
    expect(s.insert(s.seq.length + 1, 'A')).toEqual({
      ok: false,
      reason: 'index_out_of_range',
    });
    expect(s.remove(s.seq.length)).toEqual({ ok: false, reason: 'index_out_of_range' });
    expect(s.remove(-1)).toEqual({ ok: false, reason: 'index_out_of_range' });
  });

  it("解锁列表里没有 'replace' 的关卡调用 replace → locked_op（优先于 no_budget）", () => {
    const s = new Session(L1);
    const base = s.seq[6] as Base;
    expect(s.replace(6, base === 'A' ? 'U' : 'A')).toEqual({
      ok: false,
      reason: 'locked_op',
    });
    const lockedLevel: Level = { ...L1, budget: 0, ops: ['delete'] };
    const lockedS = new Session(lockedLevel);
    // locked_op 必须优先于 no_budget。
    expect(lockedS.insert(0, 'A')).toEqual({ ok: false, reason: 'locked_op' });
  });

  it('拒绝顺序：index_out_of_range 先于 invalid_base，invalid_base 先于 too_long', () => {
    const s = new Session(L1);
    expect(s.canEdit({ op: 'insert', index: -1, base: 'X' as unknown as Base })).toBe(
      'index_out_of_range',
    );
    expect(s.canEdit({ op: 'insert', index: 0, base: 'X' as unknown as Base })).toBe(
      'invalid_base',
    );
    expect(s.canEdit({ op: 'insert', index: 0 })).toBe('invalid_base');
    expect(s.canEdit({ op: 'delete', index: 0, base: 'X' as unknown as Base })).toBeNull();
  });

  it('delete 记录 removed，replace 记录旧碱基', () => {
    const level: Level = { ...L1, ops: ['insert', 'delete', 'replace'] };
    const s = new Session(level);
    const old = s.seq[6] as Base;
    const d = s.remove(6);
    expect(d.ok && d.edit).toEqual({ op: 'delete', index: 6, removed: old });
    expect(s.undo()).toBe(true);
    const replacement: Base = old === 'A' ? 'U' : 'A';
    const r = s.replace(6, replacement);
    expect(r.ok && r.edit).toEqual({
      op: 'replace',
      index: 6,
      base: replacement,
      removed: old,
    });
  });

  it('reset 回初始序列、清空 history、额度回满', () => {
    const s = new Session(L1);
    expect(s.insert(3, 'U').ok).toBe(true);
    expect(s.insert(10, 'A').ok).toBe(true);
    s.reset();
    expect(s.seq).toBe(L1.sequence);
    expect(s.budgetUsed).toBe(0);
    expect(s.budgetLeft).toBe(2);
    expect(s.history).toEqual([]);
    expect(s.canUndo).toBe(false);
  });
});

describe('Session — 边界', () => {
  it('budget 为 0：任何编辑都 no_budget，但仍可 reset / undo=false', () => {
    const zero: Level = { ...L1, budget: 0 };
    const s = new Session(zero);
    expect(s.canEdit({ op: 'insert', index: 0, base: 'A' })).toBe('no_budget');
    expect(s.insert(0, 'A')).toEqual({ ok: false, reason: 'no_budget' });
    expect(s.budgetLeft).toBe(0);
    expect(s.undo()).toBe(false);
    s.reset();
    expect(s.seq).toBe(L1.sequence);
    expect(s.insert(0, 'A')).toEqual({ ok: false, reason: 'no_budget' });
  });

  it('非法碱基：返回 invalid_base，不改变状态', () => {
    const s = new Session(L1);
    const before = s.seq;
    const r = s.edit({ op: 'insert', index: 0, base: 'T' as unknown as Base });
    expect(r).toEqual({ ok: false, reason: 'invalid_base' });
    expect(s.seq).toBe(before);
    expect(s.budgetUsed).toBe(0);
    const noBase: EditRequest = { op: 'insert', index: 0 };
    expect(s.edit(noBase)).toEqual({ ok: false, reason: 'invalid_base' });
  });

  it('超长：64 碱基后 insert → too_long，preview 返回 null', () => {
    const longSeq = 'AUG' + 'G'.repeat(MAX_SEQUENCE_LENGTH - 3);
    expect(longSeq).toHaveLength(MAX_SEQUENCE_LENGTH);
    const level: Level = { ...L1, sequence: longSeq, budget: 5 };
    const s = new Session(level);
    expect(s.canEdit({ op: 'insert', index: 0, base: 'A' })).toBe('too_long');
    expect(s.insert(0, 'A')).toEqual({ ok: false, reason: 'too_long' });
    expect(previewEdit(longSeq, { op: 'insert', index: 0, base: 'A' })).toBeNull();
    expect(() => applyEdit(longSeq, { op: 'insert', index: 0, base: 'A' })).toThrow(
      RangeError,
    );
  });

  it('超长序列 decode 不抛：200 个合法碱基照常翻译', () => {
    const huge = 'AUG' + 'G'.repeat(197);
    expect(() => decode(huge)).not.toThrow();
    expect(decode(huge).issue).toBe('no_stop');
  });

  it('撤销到底：连续 undo 到底返回 false，状态稳定', () => {
    const s = new Session(L1);
    s.insert(3, 'U');
    s.remove(0);
    expect(s.undo()).toBe(true);
    expect(s.undo()).toBe(true);
    expect(s.undo()).toBe(false);
    expect(s.seq).toBe(L1.sequence);
    expect(s.budgetUsed).toBe(0);
  });
});

/* ==========================================================================
 * 7. 编辑原语 / 预览
 * ========================================================================== */

describe('applyEdit / previewEdit', () => {
  it('applyEdit 对越界 / 坏字母 / same-base 抛 RangeError', () => {
    expect(() => applyEdit('AUG', { op: 'insert', index: 4, base: 'A' })).toThrow(
      RangeError,
    );
    expect(() => applyEdit('AUG', { op: 'delete', index: 3 })).toThrow(RangeError);
    expect(() => applyEdit('AUG', { op: 'replace', index: 0 })).toThrow(RangeError);
    expect(() =>
      applyEdit('AUG', { op: 'insert', index: 0, base: 'T' as unknown as Base }),
    ).toThrow(RangeError);
    expect(() => applyEdit('AUG', { op: 'replace', index: 1, base: 'U' })).toThrow(
      RangeError,
    );
  });

  it('applyEdit 的三种手术结果与 SPEC 2.3 一致', () => {
    expect(applyEdit('AUG', { op: 'insert', index: 0, base: 'C' })).toBe('CAUG');
    expect(applyEdit('AUG', { op: 'insert', index: 3, base: 'C' })).toBe('AUGC');
    expect(applyEdit('AUG', { op: 'delete', index: 1 })).toBe('AG');
    expect(applyEdit('AUG', { op: 'replace', index: 2, base: 'A' })).toBe('AUA');
  });

  it('previewEdit 成功返回解码/表型，非法返回 null，且不改变原串', () => {
    const seq = L1.sequence;
    const preview = previewEdit(seq, { op: 'insert', index: 3, base: 'U' });
    expect(preview).not.toBeNull();
    expect(preview?.seq).toBe('AUGUCGUCGUCAGGGCCGACCUGAAUAG');
    expect(preview?.gene.parts.map((p) => p.id)).toContain('leg');
    expect(preview?.phenotype.stats.stride).toBe(7);
    expect(seq).toBe(L1.sequence);

    expect(previewEdit(seq, { op: 'insert', index: 99, base: 'U' })).toBeNull();
    expect(previewEdit(seq, { op: 'delete', index: -1 })).toBeNull();
    expect(
      previewEdit(seq, { op: 'replace', index: 3, base: seq[3] as Base }),
    ).toBeNull();
  });
});

/* ==========================================================================
 * 8. diff（B 的动画数据）
 * ========================================================================== */

describe('diffGenes', () => {
  it('append B：L1 insert(3,U) 的 seam / shiftBy / firstChange', () => {
    const before = decode(L1.sequence);
    const s = new Session(L1);
    const r = s.insert(3, 'U');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.edit).toEqual({ op: 'insert', index: 3, base: 'U' });

    const diff: GeneDiff = diffGenes(before, s.gene, r.edit);
    expect(diff.seam).toBe(3);
    expect(diff.shiftBy).toBe(1);
    expect(diff.firstChange).toBe(1);
    expect(diff.partChanges[0].kind).toBe('kept');
    expect(diff.partChanges[0].before?.id).toBe('head');
    expect(diff.partChanges[0].after?.id).toBe('head');
    expect(diff.partChanges[1].kind).toBe('flipped');
    expect(diff.partChanges[1].before?.id).toBe('gill');
    expect(diff.partChanges[1].after?.id).toBe('leg');
    expect(diff.partChanges).toHaveLength(8);
    expect(diff.partChanges[7].kind).toBe('vanished');
    expect(diff.before).toBe(before);
    expect(diff.after).toBe(s.gene);
    expect(diff.validityChanged).toBe(false);
  });

  it('删除：seam = 被删下标，shiftBy = -1，尾部零件会 vanished', () => {
    const before = decode(L2.sequence);
    const s = new Session(L2);
    const r = s.remove(7);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const diff = diffGenes(before, s.gene, r.edit);
    expect(diff.seam).toBe(7);
    expect(diff.shiftBy).toBe(-1);
    expect(diff.partChanges).toHaveLength(8);
    expect(diff.partChanges.some((c) => c.kind === 'vanished')).toBe(true);
    expect(diff.partChanges[diff.partChanges.length - 1].after).toBeNull();
  });

  it('替换沉默位：零件全 kept、firstChange = -1、validity 不变', () => {
    const level: Level = { ...L1, ops: ['insert', 'delete', 'replace'] };
    const s = new Session(level);
    const before = s.gene;
    // index 4 是第一个 CGU 的沉默位：C?U → C A U 仍是 gill。
    const r = s.replace(4, 'A');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const diff = diffGenes(before, s.gene, r.edit);
    expect(diff.seam).toBe(4);
    expect(diff.shiftBy).toBe(0);
    expect(diff.firstChange).toBe(-1);
    expect(diff.partChanges.every((c) => c.kind === 'kept')).toBe(true);
    expect(diff.validityChanged).toBe(false);
    // B 判「静默替换」的配方：
    expect(r.edit.op).toBe('replace');
    expect(diff.firstChange).toBe(-1);
    expect(s.phenotype.stats.stride).toBe(0);
  });

  it('替换真变：同位置 kind=flipped、firstChange 指向它', () => {
    const level: Level = { ...L1, ops: ['insert', 'delete', 'replace'] };
    const s = new Session(level);
    const before = s.gene;
    const r = s.replace(3, 'A'); // CGU(gill) → AGU(antenna)
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const diff = diffGenes(before, s.gene, r.edit);
    expect(diff.shiftBy).toBe(0);
    expect(diff.partChanges[1].kind).toBe('flipped');
    expect(diff.partChanges[1].before?.id).toBe('gill');
    expect(diff.partChanges[1].after?.id).toBe('antenna');
    expect(diff.firstChange).toBe(1);
    expect(diff.validityChanged).toBe(false);
  });

  it('在起点前插入：零件全 kept、firstChange -1，但 shiftBy 仍为 +1', () => {
    const before = decode(L1.sequence);
    const s = new Session(L1);
    const r = s.insert(0, 'C');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const diff = diffGenes(before, s.gene, r.edit);
    expect(diff.seam).toBe(0);
    expect(diff.shiftBy).toBe(1);
    expect(diff.partChanges.every((c) => c.kind === 'kept')).toBe(true);
    expect(diff.firstChange).toBe(-1);
    expect(diff.validityChanged).toBe(false);
    // B 不能把 firstChange === -1 当成「整条带子不动」：碱基仍然整体右移一格。
    expect(s.gene.startIndex).toBe(1);
  });

  it('删掉起点：validityChanged = true，after 的零件消失', () => {
    const before = decode(L1.sequence);
    const s = new Session(L1);
    const r = s.remove(0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const diff = diffGenes(before, s.gene, r.edit);
    expect(diff.validityChanged).toBe(true);
    expect(diff.partChanges.every((c) => c.kind === 'vanished')).toBe(true);
    expect(diff.partChanges[0].after).toBeNull();
    expect(diff.firstChange).toBe(0);
  });
});

/* ==========================================================================
 * 9. 订阅事件
 * ========================================================================== */

describe('Session.subscribe', () => {
  it('edit / undo / reset 同步派发，快照带 diff 与额度', () => {
    const s = new Session(L1);
    const events: SessionEvent[] = [];
    const unsubscribe = s.subscribe((event) => events.push(event));

    expect(s.insert(3, 'U').ok).toBe(true);
    expect(events).toHaveLength(1);
    const editEvent = events[0];
    expect(editEvent.type).toBe('edit');
    if (editEvent.type === 'edit') {
      expect(editEvent.edit.index).toBe(3);
      expect(editEvent.diff.seam).toBe(3);
      expect(editEvent.diff.shiftBy).toBe(1);
      expect(editEvent.budgetUsed).toBe(1);
      expect(editEvent.gene).toBe(s.gene);
      expect(editEvent.phenotype).toBe(s.phenotype);
    }

    expect(s.undo()).toBe(true);
    expect(events[1].type).toBe('undo');
    if (events[1].type === 'undo') {
      expect(events[1].edit.op).toBe('insert');
      expect(events[1].budgetUsed).toBe(0);
    }

    s.reset();
    expect(events[2].type).toBe('reset');
    if (events[2].type === 'reset') {
      expect(events[2].budgetUsed).toBe(0);
      expect(events[2].gene.seq).toBe(L1.sequence);
    }

    unsubscribe();
    s.insert(3, 'U');
    expect(events).toHaveLength(3);
  });

  it('同一监听器重复订阅只派发一次', () => {
    const s = new Session(L1);
    let calls = 0;
    const listener = (): void => {
      calls += 1;
    };
    s.subscribe(listener);
    s.subscribe(listener);
    s.insert(3, 'U');
    expect(calls).toBe(1);
  });

  it('监听器抛错不会破坏 Session（编辑仍然成功并提交）', () => {
    const s = new Session(L1);
    s.subscribe(() => {
      throw new Error('listener boom');
    });
    const r = s.insert(3, 'U');
    expect(r.ok).toBe(true);
    expect(s.budgetUsed).toBe(1);
    expect(s.seq.startsWith('AUGU')).toBe(true);
  });
});

/* ==========================================================================
 * 10. 关卡注册表
 * ========================================================================== */

describe('levels registry', () => {
  it('LEVELS 按 number 升序、id 唯一，levelById / levelAt 正常', () => {
    expect(LEVELS).toHaveLength(2);
    expect(LEVELS.map((l) => l.number)).toEqual([1, 2]);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(2);
    expect(levelById('l01')).toBe(L1);
    expect(levelById('l02')).toBe(L2);
    expect(levelById('nope')).toBeUndefined();
    expect(levelAt(0)).toBe(L1);
    expect(levelAt(1)).toBe(L2);
    expect(levelAt(2)).toBeUndefined();
    expect(levelAt(-1)).toBeUndefined();
    expect(levelAt(1.5)).toBeUndefined();
  });

  it('关卡数据不可变：Session 的编辑不会修改 Level.sequence', () => {
    const s = new Session(L1);
    s.insert(3, 'U');
    expect(L1.sequence).toBe('AUGCGUCGUCAGGGCCGACCUGAAUAG');
    expect(s.seq).not.toBe(L1.sequence);
  });

  it('families 计数与零件家族一致', () => {
    const p = phenotype(decode(L1.sequence));
    const expected: Record<Family, number> = { A: 1, U: 0, G: 2, C: 5 };
    expect(p.families).toEqual(expected);
    expect(Object.values(p.families).reduce((a, b) => a + b, 0)).toBe(p.size);
    expect(statOf(decode(L1.sequence), 'stride')).toBe(0);
  });
});

/* ==========================================================================
 * 11. 不变量（穷举短序列，锁住 codons 覆盖契约）
 * ========================================================================== */

describe('decode 不变量', () => {
  it('长度 0–5 的所有合法序列都满足槽位覆盖 / 单起点 / 单终止契约', () => {
    const bases: readonly string[] = BASES;
    const strings: string[] = [''];
    let frontier: string[] = [''];
    for (let length = 1; length <= 5; length += 1) {
      const next: string[] = [];
      for (const prefix of frontier) {
        for (const base of bases) {
          const s = prefix + base;
          next.push(s);
          strings.push(s);
        }
      }
      frontier = next;
    }

    for (const seq of strings) {
      const g = decode(seq);
      expect(g.seq).toBe(seq);
      expect(g.bases.join('')).toBe(seq);
      expectCoverage(g);
      expect(g.codons.filter((c) => c.role === 'start').length).toBeLessThanOrEqual(1);
      expect(g.codons.filter((c) => c.role === 'stop').length).toBeLessThanOrEqual(1);
      expect(g.frameStart).toBe(g.startIndex >= 0 ? g.startIndex : 0);
      if (g.issue === null) {
        expect(g.parts.length).toBeGreaterThanOrEqual(1);
        expect(g.parts[0].id).toBe('head');
        expect(g.stopCodon).not.toBeNull();
        expect(g.stopIndex).toBeGreaterThanOrEqual(0);
        expect(g.trailerStart).toBe(g.stopIndex + 3);
      }
      if (g.startIndex < 0) {
        expect(['empty', 'no_start']).toContain(g.issue);
        expect(g.parts).toEqual([]);
      }
      g.parts.forEach((part, i) => {
        expect(part.index).toBe(i);
        expect(part.definition.id).toBe(part.id);
        expect(part.start).toBeGreaterThanOrEqual(g.startIndex);
        expect(g.seq.slice(part.start, part.start + 3)).toBe(part.codon);
      });
    }
  });

  it('64 个密码子与 16 个零件的映射完全自洽（沉默位任意）', () => {
    for (const def of PART_DEFS) {
      for (const silent of BASES) {
        const codon = `${def.family}${silent}${def.variant}`;
        const entry = codonToPart(codon);
        if (entry === 'stop') {
          expect(['UAA', 'UAG', 'UGA']).toContain(codon);
        } else {
          expect(entry.id).toBe(def.id);
          expect(entry.family).toBe(def.family);
          expect(entry.variant).toBe(def.variant);
        }
      }
    }
  });
});
