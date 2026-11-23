/**
 * 生物几何护栏（B 负责）。
 * 只测纯函数：IK 不 NaN、脚长满足、剖面端点、脊柱端点。
 */

import { describe, expect, it } from 'vitest';
import { buildCreature, profileAt, solveLeg, spineAt } from './creature-geometry';
import { phenotype } from '../core';
import { decode } from '../core';

describe('creature geometry', () => {
  it('two-bone IK keeps shin length and never NaN', () => {
    const a = 16;
    const b = 17;
    for (const [fx, fy] of [
      [10.2, 24.8],
      [0, 0],
      [0, a + b - 1],
      [200, -200],
      [-40, 30],
    ]) {
      const sol = solveLeg(a, b, fx, fy);
      expect(Number.isFinite(sol.kneeX)).toBe(true);
      expect(Number.isFinite(sol.kneeY)).toBe(true);
      expect(Number.isFinite(sol.flex)).toBe(true);
      const shin = Math.hypot(sol.footX - sol.kneeX, sol.footY - sol.kneeY);
      expect(shin).toBeCloseTo(b, 0);
    }
  });

  it('body profile endpoints and spine ends', () => {
    expect(profileAt(0)).toBeCloseTo(0.1, 5);
    expect(profileAt(1)).toBeCloseTo(0.34, 5);
    const L = 209;
    const H = 44.8;
    expect(spineAt(0, L, H).x).toBeCloseTo(-L / 2, 5);
    expect(spineAt(1, L, H).x).toBeCloseTo(L / 2, 5);
  });

  it('buildCreature handles empty/small/large part counts', () => {
    const empty = phenotype(decode(''));
    expect(buildCreature(empty).n).toBe(0);
    const l1 = phenotype(decode('AUGCGUCGUCAGGGCCGACCUGAAUAG'));
    const layout = buildCreature(l1);
    expect(layout.L).toBeGreaterThan(100);
    expect(layout.segX.length).toBeGreaterThan(4);
    expect(layout.anchors.length).toBe(l1.parts.length);
    expect(layout.limbs.length).toBe(0);
    for (const v of layout.segX) expect(Number.isFinite(v)).toBe(true);
  });
});
