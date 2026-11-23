/**
 * 闸门判定（A 负责）。
 * ---------------------------------------------------------------
 * 纯函数，语义见 docs/SPEC.md 2.6：
 *  - 基因非法 → outcome 'invalid'，reason 归一到 no_start / no_stop，不跑闸门。
 *  - 否则按 level.gates 顺序逐个判；每个闸门产出一条 GateCheck。
 *  - 第一个失败闸门决定 failedGateIndex / failAtX；全过则 failAtX = 1。
 * 判定只看表型，永远不看序列字符串。
 */

import type {
  GateCheck,
  Gene,
  Judgement,
  Level,
  Phenotype,
} from './types';

function checkGate(level: Level, phenotype: Phenotype, index: number): GateCheck {
  const gate = level.gates[index];
  const checks = gate.requires.map((requirement) => {
    const actual = phenotype.stats[requirement.stat];
    return {
      stat: requirement.stat,
      actual,
      min: requirement.min,
      met: actual >= requirement.min,
    };
  });

  const passed =
    gate.mode === 'all'
      ? checks.every((check) => check.met)
      : checks.some((check) => check.met);

  return { gateId: gate.id, passed, checks };
}

/** 纯函数。绝不抛异常。 */
export function judge(level: Level, gene: Gene, phenotype: Phenotype): Judgement {
  if (gene.issue !== null) {
    return {
      outcome: 'invalid',
      reason: gene.issue === 'no_stop' ? 'no_stop' : 'no_start',
      gates: [],
      failedGateIndex: null,
      failAtX: 0,
      phenotype,
    };
  }

  const gates: GateCheck[] = [];
  for (let index = 0; index < level.gates.length; index += 1) {
    const check = checkGate(level, phenotype, index);
    gates.push(check);
    if (!check.passed) {
      return {
        outcome: 'fail',
        reason: 'gate_failed',
        gates,
        failedGateIndex: index,
        failAtX: level.gates[index].at,
        phenotype,
      };
    }
  }

  return {
    outcome: 'pass',
    reason: 'passed',
    gates,
    failedGateIndex: null,
    failAtX: 1,
    phenotype,
  };
}
