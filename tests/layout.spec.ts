import { describe, expect, it } from 'vitest';
import { layoutParts } from '../src/core';
import type { PartInstance } from '../src/core';

function repeated(defId: string, count: number): PartInstance[] {
  return Array.from({ length: count }, () => ({ defId, level: 1 as const }));
}

function positionKey(p: { position: [number, number, number] }): string {
  return p.position.map((n) => n.toFixed(4)).join(',');
}

describe('layoutParts（RIG3D §4）', () => {
  it('空输入返回空数组', () => {
    expect(layoutParts([])).toEqual([]);
  });

  it('10 条腿：5 个 x 位置 × 左右 × 2 层，无穿地、无重合', () => {
    const placed = layoutParts(repeated('legs.spring', 10));
    expect(placed).toHaveLength(10);
    expect(placed.every((p) => p.defId === 'legs.spring')).toBe(true);

    // RIG3D 实算：r=0..4 的 x 从 +0.60 递减到 −0.50。
    const pairX = [0, 2, 4, 6, 8].map((i) => placed[i].position[0]);
    const expected = [0.6, 0.325, 0.05, -0.225, -0.5];
    pairX.forEach((x, i) => expect(x).toBeCloseTo(expected[i], 6));

    for (let i = 0; i < 10; i += 1) {
      expect(placed[i].position[0]).toBeCloseTo(pairX[Math.floor(i / 2)], 6);
      expect(Math.sign(placed[i].position[2])).toBe(i % 2 === 0 ? 1 : -1);
      expect(placed[i].position[1]).toBeGreaterThan(0); // 不穿地
      expect(placed[i].scale).toBeGreaterThanOrEqual(0.55);
    }

    // 前 3 对 layer 0，后 2 对 layer 1。
    for (let i = 0; i < 6; i += 1) expect(placed[i].position[1]).toBeCloseTo(0.68, 6);
    for (let i = 6; i < 10; i += 1) expect(placed[i].position[1]).toBeCloseTo(0.51, 6);

    // 同层相邻对的 x 间距 ≥ 0.12（RIG3D 验收线）。
    for (let i = 2; i < 5; i += 1) {
      expect(pairX[i - 1] - pairX[i]).toBeGreaterThanOrEqual(0.12);
    }

    expect(new Set(placed.map(positionKey)).size).toBe(10);

    // instanceKey 是实例唯一键：B 用 `#序号` 解析动画下标。
    expect(placed[0].instanceKey).toBe('legs.spring#0');
    expect(placed[1].instanceKey).toBe('legs.spring#1');
    expect(new Set(placed.map((p) => p.instanceKey)).size).toBe(10);
  });

  it('64 条腿：数量、确定性、坐标范围都稳定', () => {
    const parts = repeated('legs.runner', 64);
    const a = layoutParts(parts);
    const b = layoutParts(parts);

    expect(a).toHaveLength(64);
    expect(a).toEqual(b);
    for (const p of a) {
      expect(Number.isFinite(p.position[0])).toBe(true);
      expect(Number.isFinite(p.position[1])).toBe(true);
      expect(Math.abs(p.position[2])).toBeLessThanOrEqual(1.2);
      expect(p.scale).toBeGreaterThanOrEqual(0.55);
    }
    expect(new Set(a.map(positionKey)).size).toBeGreaterThan(50);
  });

  it('六个槽位混合 64 件：固定槽位顺序输出且全部有挂点', () => {
    const parts: PartInstance[] = [
      ...repeated('crest.spike', 12),
      ...repeated('legs.claw', 16),
      ...repeated('wings.feather', 16),
      ...repeated('tail.fan', 12),
      ...repeated('body.basic', 4),
      ...repeated('beak.sharp', 4),
    ];
    const placed = layoutParts(parts);
    expect(placed).toHaveLength(64);

    const groups = ['body', 'beak', 'legs', 'wings', 'tail', 'crest'];
    const indices = groups.map((slot) => placed.findIndex((p) => p.defId.startsWith(`${slot}.`)));
    expect(indices).toEqual([0, 4, 8, 24, 40, 52]);
    expect(placed.slice(0, 4).every((p) => p.defId.startsWith('body.'))).toBe(true);
    expect(placed.slice(4, 8).every((p) => p.defId.startsWith('beak.'))).toBe(true);

    for (const p of placed) {
      for (const n of p.position) expect(Number.isFinite(n)).toBe(true);
      expect(p.rotation.every((n) => Number.isFinite(n))).toBe(true);
      expect(p.scale).toBeGreaterThanOrEqual(0.55);
    }
  });

  it('翅膀左右对称，层数越高越外扩、越向上、略缩小', () => {
    const placed = layoutParts(repeated('wings.glide', 4));
    expect(placed).toHaveLength(4);

    expect(placed[0].position[2]).toBeCloseTo(0.3, 6);
    expect(placed[1].position[2]).toBeCloseTo(-0.3, 6);
    expect(placed[0].position[1]).toBeCloseTo(1.38, 6);
    expect(placed[0].position[0]).toBeCloseTo(-0.02, 6);

    expect(placed[2].position[2]).toBeCloseTo(0.41, 6);
    expect(placed[3].position[2]).toBeCloseTo(-0.41, 6);
    expect(placed[2].position[1]).toBeCloseTo(1.51, 6);
    expect(placed[2].position[0]).toBeCloseTo(-0.09, 6);
    expect(placed[2].scale).toBeLessThan(placed[0].scale);
  });

  it('喙 / 尾 / 冠多件时错开，不重叠', () => {
    for (const defId of ['beak.long', 'tail.spike', 'crest.horn']) {
      const placed = layoutParts(repeated(defId, 5));
      expect(placed).toHaveLength(5);
      expect(new Set(placed.map(positionKey)).size).toBe(5);
      placed.forEach((p) => {
        expect(placed.filter((other) => positionKey(other) === positionKey(p))).toHaveLength(1);
      });
    }
  });

  it('躯干向 −x 堆叠、逐件变小', () => {
    const placed = layoutParts(repeated('body.basic', 3));
    expect(placed.map((p) => p.position[0])).toEqual([
      expect.closeTo(-0.12, 6),
      expect.closeTo(-0.64, 6),
      expect.closeTo(-1.16, 6),
    ]);
    expect(placed[1].scale).toBeLessThan(placed[0].scale);
    expect(placed[2].scale).toBeLessThan(placed[1].scale);
  });

  it('未知 defId 被跳过；输出按槽位分组，与输入穿插顺序无关', () => {
    const parts: PartInstance[] = [
      { defId: 'legs.spring', level: 1 },
      { defId: 'not-a-part', level: 1 },
      { defId: 'beak.short', level: 1 },
      { defId: 'body.basic', level: 1 },
    ];
    const placed = layoutParts(parts);
    expect(placed.map((p) => p.defId)).toEqual(['body.basic', 'beak.short', 'legs.spring']);
  });

  it('girth 由第一件躯干推导：胖身让腿的左右间距变大', () => {
    const withPlump = layoutParts([
      { defId: 'body.plump', level: 1 },
      { defId: 'legs.spring', level: 1 },
    ]);
    const noBody = layoutParts([{ defId: 'legs.spring', level: 1 }]);
    const legPlump = withPlump.find((p) => p.defId === 'legs.spring');
    const legNoBody = noBody.find((p) => p.defId === 'legs.spring');
    expect(legPlump).toBeDefined();
    expect(legNoBody).toBeDefined();
    if (!legPlump || !legNoBody) return;
    // girth = 1 + 0.45*(1.15-1) = 1.0675，z 从 0.24 → 0.2562。
    expect(legPlump.position[2]).toBeCloseTo(0.24 * 1.0675, 6);
    expect(legNoBody.position[2]).toBeCloseTo(0.24, 6);
  });
});
