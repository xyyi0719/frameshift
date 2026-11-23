/**
 * 挂点求解（A 负责）
 * ---------------------------------------------------------------
 * 纯函数、确定性、无渲染依赖。输入零件实例，输出 PlacedPart。
 * 公式与 docs/RIG3D.md §4 保持一致；单位：1 = 1 分米，+x 前、+y 上、+z 右。
 *
 * 输出顺序固定为 body → beak → legs → wings → tail → crest，
 * 槽内保持输入数组顺序；输出下标就是渲染层的稳定动画下标。
 */

import type { PartDef, PartInstance, PlacedPart, SlotId } from './types';
import { SLOT_IDS } from './types';
import { PART_BY_ID } from '../data/parts';

/** 身体基准半长（布局坐标，供 UI 画选中框 / 单测用）。 */
export const BODY_HALF_LENGTH = 1.05;

const DEG = Math.PI / 180;

/** 整数哈希 → [0,1)，与 RIG3D §2.2 完全一致。 */
function hash01(i: number): number {
  let x = (i * 374761393 + 668265263) >>> 0;
  x = ((x ^ (x >>> 13)) * 1274126177) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 绕 X→Y→Z（度）旋转一个局部偏移。当前 24 件的 offset 都是 0，保留通用性。 */
function rotateOffset(
  offset: readonly [number, number, number],
  degrees: readonly [number, number, number],
): [number, number, number] {
  const [rx, ry, rz] = degrees.map((d) => d * DEG) as [number, number, number];
  const [x, y, z] = offset;

  // Rx
  const y1 = y * Math.cos(rx) - z * Math.sin(rx);
  const z1 = y * Math.sin(rx) + z * Math.cos(rx);
  // Ry
  const x2 = x * Math.cos(ry) + z1 * Math.sin(ry);
  const z2 = -x * Math.sin(ry) + z1 * Math.cos(ry);
  // Rz
  const x3 = x2 * Math.cos(rz) - y1 * Math.sin(rz);
  const y3 = x2 * Math.sin(rz) + y1 * Math.cos(rz);
  return [x3, y3, z2];
}

interface BaseTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  /** 左半身（腿/翼的奇数列）→ instanceKey 的 L。 */
  side: 'R' | 'L';
}

function bodyBase(i: number): BaseTransform {
  return {
    position: [-0.12 - 0.52 * i, 1.02 + 0.015 * i, 0],
    rotation: [0, 0, 0],
    scale: Math.max(0.55, 1 - 0.12 * i),
    side: 'R',
  };
}

function beakBase(i: number, n: number): BaseTransform {
  const dy = n <= 3 ? 0.115 : Math.max(0.055, 0.3 / (n - 1));
  const yaw = (i - (n - 1) / 2) * 4;
  return {
    position: [1.14 + 0.03 * i, 1.68 - i * dy, (i % 2 ? 1 : -1) * 0.02],
    rotation: [0, yaw, 0],
    scale: Math.max(0.6, 1 - 0.08 * i),
    side: 'R',
  };
}

function legBase(i: number, n: number, girth: number): BaseTransform {
  const pair = Math.floor(i / 2);
  const sideSign = i % 2 ? -1 : 1;
  const pairs = Math.ceil(n / 2);
  const dx = Math.min(0.34, 1.1 / Math.max(1, pairs - 1));
  const x = 0.05 + ((pairs - 1) / 2 - pair) * dx;
  const layer = Math.floor(pair / 3);
  return {
    position: [x, 0.68 - 0.17 * layer, sideSign * (0.24 + 0.06 * layer) * girth],
    rotation: [-sideSign * (4 + 2 * layer), 0, 0],
    scale: Math.max(0.54, Math.max(0.72, 1 - 0.03 * (n - 2)) * (1 - 0.05 * layer)),
    side: sideSign === 1 ? 'R' : 'L',
  };
}

function wingBase(i: number): BaseTransform {
  const pair = Math.floor(i / 2);
  const sideSign = i % 2 ? -1 : 1;
  return {
    position: [
      -0.02 - 0.07 * pair,
      1.38 + 0.13 * pair,
      sideSign * (0.3 + 0.11 * pair),
    ],
    rotation: [-sideSign * (14 + 7 * pair), sideSign * (-6 - 3 * pair), 0],
    scale: Math.max(0.55, 1 - 0.1 * pair),
    side: sideSign === 1 ? 'R' : 'L',
  };
}

function tailBase(i: number, n: number): BaseTransform {
  const spread = Math.min(16, 64 / Math.max(1, n - 1));
  const ang = (i - (n - 1) / 2) * spread;
  return {
    position: [-0.58 - 0.02 * i, 1.12 + 0.03 * i, 0],
    rotation: [0, 0, ang],
    scale: Math.max(0.7, 1 - 0.06 * i),
    side: 'R',
  };
}

function crestBase(i: number): BaseTransform {
  const h = hash01(i * 17 + 3);
  return {
    position: [0.78 - 0.11 * i, 2.04 + 0.03 * h, 0],
    rotation: [0, 0, (h - 0.5) * 10],
    scale: (0.92 + 0.16 * h) * Math.max(0.7, 1 - 0.05 * i),
    side: 'R',
  };
}

function baseFor(def: PartDef, i: number, n: number, girth: number): BaseTransform {
  switch (def.slot) {
    case 'body':
      return bodyBase(i);
    case 'beak':
      return beakBase(i, n);
    case 'legs':
      return legBase(i, n, girth);
    case 'wings':
      return wingBase(i);
    case 'tail':
      return tailBase(i, n);
    case 'crest':
      return crestBase(i);
  }
}

/**
 * 纯函数：把零件实例布局成渲染挂点。
 * 未知 defId 会被跳过（配置错误不应让整个装配崩掉）。
 */
export function layoutParts(parts: PartInstance[]): PlacedPart[] {
  // 按槽位分组，保留槽内输入顺序；N 用 cap(64) 与装配硬上限对齐。
  const groups: Record<SlotId, { def: PartDef; instance: PartInstance }[]> = {
    body: [],
    beak: [],
    legs: [],
    wings: [],
    tail: [],
    crest: [],
  };

  for (const instance of parts) {
    const def = PART_BY_ID[instance.defId];
    if (!def) continue;
    groups[def.slot].push({ def, instance });
  }

  // girth：由第一件躯干的 art.scale 推导；无躯干 = 1。
  const firstBody = groups.body[0]?.def;
  const girth = firstBody
    ? clamp(1 + 0.45 * (firstBody.art.scale - 1), 0.75, 1.45)
    : 1;

  const placed: PlacedPart[] = [];

  for (const slot of SLOT_IDS) {
    const list = groups[slot];
    const n = Math.min(list.length, 64);
    for (let i = 0; i < n; i += 1) {
      const { def } = list[i];
      const base = baseFor(def, i, n, girth);

      const art = def.art;
      // 1) offset 在零件局部系解释：先乘 baseScale，再按 base 旋转。
      const rotatedOffset = rotateOffset(art.offset, base.rotation);
      const position: [number, number, number] = [
        base.position[0] + rotatedOffset[0] * base.scale,
        base.position[1] + rotatedOffset[1] * base.scale,
        clamp(base.position[2] + rotatedOffset[2] * base.scale, -1.2, 1.2),
      ];

      // 2) rotation：度，逐分量相加（M0 的 art.rotation 全 0）。
      const rotation: [number, number, number] = [
        base.rotation[0] + art.rotation[0],
        base.rotation[1] + art.rotation[1],
        base.rotation[2] + art.rotation[2],
      ];

      // 3) scale：base × art.scale，兜底 ≥ 0.55。
      const scale = Math.max(0.55, base.scale * art.scale);

      placed.push({
        defId: def.id,
        position,
        rotation,
        scale,
        // B 的 PartBatches 用 `#序号` 解析动画下标，并把它当作实例唯一键；
        // 分组批处理由 B 用 geometry + 左右自行完成，所以这里保持全局唯一。
        instanceKey: `${def.id}#${i}`,
      });
    }
  }

  return placed;
}

/** 槽位固定顺序，B 的装配面板/序列化可直接用。 */
export const LAYOUT_SLOT_ORDER: readonly SlotId[] = SLOT_IDS;
