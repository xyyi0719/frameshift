/**
 * 挂点求解（纯函数、确定性、无渲染依赖）
 * ---------------------------------------------------------------
 * 支持：
 *   - 躯干融合为单一清晰主躯干（表面通过动态贴图展示 1 / 1/2 / 1/3 拼色，P-025）；
 *   - 腿与侧肢按 1 对左右对称输出（P-012, P-016）；
 *   - 同件 1~3 阶体量微涨（1.0x / 1.1x / 1.22x，P-022）；
 *   - 部位内精简版造型微调（offset / rotation / scale，P-028）。
 */

import type { Creature, PartDef, PartInstance, PlacedPart, SlotId, SlotTweak } from './types';
import { SLOT_IDS } from './types';
import { PART_BY_ID } from '../data/parts';

export const BODY_HALF_LENGTH = 1.05;

const DEG = Math.PI / 180;
const LEVEL_VISUAL_SCALE = [1, 1.1, 1.22] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rotateOffset(
  offset: readonly [number, number, number],
  degrees: readonly [number, number, number],
): [number, number, number] {
  const [rx, ry, rz] = degrees.map((d) => d * DEG) as [number, number, number];
  const [x, y, z] = offset;
  const y1 = y * Math.cos(rx) - z * Math.sin(rx);
  const z1 = y * Math.sin(rx) + z * Math.cos(rx);
  const x2 = x * Math.cos(ry) + z1 * Math.sin(ry);
  const z2 = -x * Math.sin(ry) + z1 * Math.cos(ry);
  const x3 = x2 * Math.cos(rz) - y1 * Math.sin(rz);
  const y3 = x2 * Math.sin(rz) + y1 * Math.cos(rz);
  return [x3, y3, z2];
}

function applyTweak(
  pos: [number, number, number],
  rot: [number, number, number],
  scale: number,
  side: 'R' | 'L',
  tweak?: SlotTweak,
): { position: [number, number, number]; rotation: [number, number, number]; scale: number } {
  if (!tweak) return { position: pos, rotation: rot, scale };
  const s = side === 'L' ? -1 : 1;
  return {
    position: [
      pos[0] + tweak.offset[0],
      pos[1] + tweak.offset[1],
      clamp(pos[2] + tweak.offset[2] * s, -1.4, 1.4),
    ],
    rotation: [
      rot[0] + tweak.rotation[0] * s,
      rot[1] + tweak.rotation[1] * s,
      rot[2] + tweak.rotation[2],
    ],
    scale: Math.max(0.45, scale * tweak.scale),
  };
}

/**
 * 纯函数：把生物的部位零件与微调参数求解成 3D 挂点。
 * - `body` 多件融合时输出 1 个主躯干挂点（等级取最高阶，表面拼色由渲染层按 body 列表绘制）；
 * - `legs` / `wings` 成对输出左右两侧（R/L）；
 * - `beak` / `tail` / `crest` 居中输出清晰单轮廓。
 */
export function layoutCreature(creature: Creature): PlacedPart[] {
  const bodyList = creature.slots.body ?? [];
  const firstBodyDef = bodyList[0] ? PART_BY_ID[bodyList[0].defId] : undefined;
  const girth = firstBodyDef
    ? clamp(1 + 0.55 * (firstBodyDef.art.scale - 1) + (bodyList.length - 1) * 0.04, 0.82, 1.4)
    : 1;

  const placed: PlacedPart[] = [];
  const tweaks = creature.tweaks;

  // 1. body（1~3 种融合成 1 个清晰主躯干实体，表面按 1 / 1/2 / 1/3 分区拼色）
  if (firstBodyDef) {
    const maxLvl = Math.min(
      3,
      Math.max(...bodyList.map((p) => p.level)),
    ) as 1 | 2 | 3;
    const fusionBoost = 1 + (bodyList.length - 1) * 0.04;
    const basePos: [number, number, number] = [0, 1.02, 0];
    const baseRot: [number, number, number] = [0, 0, 0];
    const baseScale = firstBodyDef.art.scale * LEVEL_VISUAL_SCALE[maxLvl - 1] * fusionBoost;
    const t = applyTweak(basePos, baseRot, baseScale, 'R', tweaks?.body);
    placed.push({
      defId: firstBodyDef.id,
      slot: 'body',
      level: maxLvl,
      position: t.position,
      rotation: t.rotation,
      scale: t.scale,
      side: 'R',
      instanceKey: `${firstBodyDef.id}#0`,
    });
  }

  // 2. beak（固定鸡头正前方）
  const beakInst = creature.slots.beak?.[0];
  if (beakInst && PART_BY_ID[beakInst.defId]) {
    const def = PART_BY_ID[beakInst.defId];
    const basePos: [number, number, number] = [1.14, 1.66, 0];
    const baseRot: [number, number, number] = [0, 0, 0];
    const baseScale = def.art.scale * LEVEL_VISUAL_SCALE[beakInst.level - 1];
    const t = applyTweak(basePos, baseRot, baseScale, 'R', tweaks?.beak);
    placed.push({
      defId: def.id,
      slot: 'beak',
      level: beakInst.level,
      position: t.position,
      rotation: t.rotation,
      scale: t.scale,
      side: 'R',
      instanceKey: `${def.id}#0`,
    });
  }

  // 3. legs（1 对左右对称实体）
  const legInst = creature.slots.legs?.[0];
  if (legInst && PART_BY_ID[legInst.defId]) {
    const def = PART_BY_ID[legInst.defId];
    const baseScale = def.art.scale * LEVEL_VISUAL_SCALE[legInst.level - 1];
    const hipY = def.id === 'legs.ostrich' ? 0.78 : 0.68;
    for (let i = 0; i < 2; i += 1) {
      const sideSign = i === 0 ? 1 : -1;
      const side: 'R' | 'L' = sideSign === 1 ? 'R' : 'L';
      const basePos: [number, number, number] = [0.04, hipY, sideSign * 0.27 * girth];
      const baseRot: [number, number, number] = [-sideSign * 4, 0, 0];
      const t = applyTweak(basePos, baseRot, baseScale, side, tweaks?.legs);
      placed.push({
        defId: def.id,
        slot: 'legs',
        level: legInst.level,
        position: t.position,
        rotation: t.rotation,
        scale: t.scale,
        side,
        instanceKey: `${def.id}#${i}`,
      });
    }
  }

  // 4. wings（侧肢：1 对左右对称）
  const wingInst = creature.slots.wings?.[0];
  if (wingInst && PART_BY_ID[wingInst.defId]) {
    const def = PART_BY_ID[wingInst.defId];
    const isArm = def.tags.includes('arm') || def.tags.includes('shield');
    const baseScale = def.art.scale * LEVEL_VISUAL_SCALE[wingInst.level - 1];
    for (let i = 0; i < 2; i += 1) {
      const sideSign = i === 0 ? 1 : -1;
      const side: 'R' | 'L' = sideSign === 1 ? 'R' : 'L';
      const basePos: [number, number, number] = isArm
        ? [0.22, 1.18, sideSign * 0.42 * girth]
        : [-0.04, 1.36, sideSign * 0.34 * girth];
      const baseRot: [number, number, number] = isArm
        ? [0, sideSign * 8, 0]
        : [-sideSign * 14, sideSign * -6, 0];
      const t = applyTweak(basePos, baseRot, baseScale, side, tweaks?.wings);
      placed.push({
        defId: def.id,
        slot: 'wings',
        level: wingInst.level,
        position: t.position,
        rotation: t.rotation,
        scale: t.scale,
        side,
        instanceKey: `${def.id}#${i}`,
      });
    }
  }

  // 5. tail
  const tailInst = creature.slots.tail?.[0];
  if (tailInst && PART_BY_ID[tailInst.defId]) {
    const def = PART_BY_ID[tailInst.defId];
    const basePos: [number, number, number] = [-0.62 * girth, 1.12, 0];
    const baseRot: [number, number, number] = [0, 0, 0];
    const baseScale = def.art.scale * LEVEL_VISUAL_SCALE[tailInst.level - 1];
    const t = applyTweak(basePos, baseRot, baseScale, 'R', tweaks?.tail);
    placed.push({
      defId: def.id,
      slot: 'tail',
      level: tailInst.level,
      position: t.position,
      rotation: t.rotation,
      scale: t.scale,
      side: 'R',
      instanceKey: `${def.id}#0`,
    });
  }

  // 6. crest（固定鸡头顶）
  const crestInst = creature.slots.crest?.[0];
  if (crestInst && PART_BY_ID[crestInst.defId]) {
    const def = PART_BY_ID[crestInst.defId];
    const basePos: [number, number, number] = [0.78, 2.04, 0];
    const baseRot: [number, number, number] = [0, 0, 0];
    const baseScale = def.art.scale * LEVEL_VISUAL_SCALE[crestInst.level - 1];
    const t = applyTweak(basePos, baseRot, baseScale, 'R', tweaks?.crest);
    placed.push({
      defId: def.id,
      slot: 'crest',
      level: crestInst.level,
      position: t.position,
      rotation: t.rotation,
      scale: t.scale,
      side: 'R',
      instanceKey: `${def.id}#0`,
    });
  }

  return placed;
}

/** 兼容入口：从扁平 PartInstance[] 生成挂点（用于测试与旧调用方）。 */
export function layoutParts(parts: PartInstance[]): PlacedPart[] {
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
  const creature: Creature = {
    v: 1,
    id: 'layout-tmp',
    stage: 3,
    slots: {
      body: groups.body.map((g) => g.instance),
      beak: groups.beak.map((g) => g.instance),
      legs: groups.legs.map((g) => g.instance),
      wings: groups.wings.map((g) => g.instance),
      tail: groups.tail.map((g) => g.instance),
      crest: groups.crest.map((g) => g.instance),
    },
  };
  const result = layoutCreature(creature);
  // 若传入 offset 非零则应用一次旋转偏移，保持工具函数引用
  for (const p of result) {
    const def = PART_BY_ID[p.defId];
    if (def && (def.art.offset[0] !== 0 || def.art.offset[1] !== 0 || def.art.offset[2] !== 0)) {
      const off = rotateOffset(def.art.offset, p.rotation);
      p.position = [p.position[0] + off[0], p.position[1] + off[1], p.position[2] + off[2]];
    }
  }
  return result;
}

export const LAYOUT_SLOT_ORDER: readonly SlotId[] = SLOT_IDS;
