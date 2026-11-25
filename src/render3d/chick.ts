/**
 * 小鸡 3D 模型（固定呆萌小鸡头 + 可组装动物/机械六部位 + 3D 立体跳跃与朝向）
 * ---------------------------------------------------------------
 * - 保留固定鸡头与眼睛作为辨识锚点（P-011）；
 * - 装上躯干零件后隐藏裸鸡圆球，展示 1 / 1/2 / 1/3 拼色融合躯干（P-025）；
 * - 支持 3D 高度 worldY、左右翻转朝向 facing、受击抖动与攻击前冲！
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Creature, PartDef, PartInstance, PlacedPart, SlotId } from '../core';
import { PART_BY_ID, layoutCreature } from '../core';
import {
  chickBaseBeakGeometry,
  chickBaseLegGeometry,
  chickBodyGeometry,
  chickEyeGeometry,
  chickGlintGeometry,
  chickHeadGeometry,
  chickNeckGeometry,
  chickTailStumpGeometry,
  makeOutlineGeometry,
} from './geometry';
import { createBlobShadow, getGlowSpriteTexture, materialForKind, outlineMaterial, toonMaterial } from './materials';
import { PartBatches } from './parts';

export const SLOT_ANCHORS: Record<SlotId, readonly [number, number, number]> = {
  body: [0, 1.12, 0],
  beak: [1.5, 1.68, 0],
  legs: [0.05, 0.56, 0.72],
  wings: [-0.05, 1.42, -0.82],
  tail: [-1.45, 1.18, 0],
  crest: [0.74, 2.22, 0],
};

const tmpWorld = new THREE.Vector3();

function outlined(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
): { mesh: THREE.Mesh; hull: THREE.Mesh } {
  const mesh = new THREE.Mesh(geo, mat);
  const hull = new THREE.Mesh(makeOutlineGeometry(geo), outlineMaterial());
  hull.renderOrder = 1;
  parent.add(mesh, hull);
  return { mesh, hull };
}

export interface ChickOptions {
  variant?: 'player' | 'enemy';
  headColor?: number;
}

export class ChickModel {
  readonly root = new THREE.Group();
  readonly rig = new THREE.Group();
  readonly shadow: THREE.Mesh;
  private readonly bodyMesh: THREE.Mesh;
  private readonly bodyHull: THREE.Mesh;
  private readonly tailStumpMesh: THREE.Mesh;
  private readonly tailStumpHull: THREE.Mesh;
  private readonly head = new THREE.Group();
  private readonly eyes: THREE.Mesh[] = [];
  private readonly eyeGlints: THREE.Mesh[] = [];
  private readonly baseBeak: THREE.Mesh;
  private readonly baseBeakHull: THREE.Mesh;
  private readonly baseLeg: THREE.Mesh;
  private readonly baseLegHull: THREE.Mesh;
  private readonly batches = new PartBatches();
  private readonly flashes = new Map<SlotId, { sprite: THREE.Sprite; at: number }>();
  private readonly counts: Record<SlotId, number> = {
    body: 0,
    beak: 0,
    legs: 0,
    wings: 0,
    tail: 0,
    crest: 0,
  };

  private worldX = 0;
  private worldY = 0;
  private worldZ = 0;
  private facing: 1 | -1 = 1;
  private currentYaw = 0;
  private lunge = 0;
  private moving = false;
  private downTarget = 0;
  private down = 0;
  private hitAt = -10;
  private now = 0;

  constructor(opts: ChickOptions = {}) {
    const enemy = opts.variant === 'enemy';
    const feather = opts.headColor ?? (enemy ? 0xeb926e : 0xffd24a);
    const bodyMat = toonMaterial({ color: feather });
    const headMat = toonMaterial({ color: feather });
    const legMat = materialForKind('bone');
    const eyeMat = new THREE.MeshBasicMaterial({ color: enemy ? 0x5b1717 : 0x241b16 });

    this.root.name = enemy ? 'enemy-chick' : 'player-chick';
    this.root.add(this.rig);

    const bodyGeo = chickBodyGeometry();
    bodyGeo.translate(0, 1.02, 0);
    const neckGeo = chickNeckGeometry();
    neckGeo.translate(0.57, 1.36, 0);
    const bodyCombined = mergeGeometries([bodyGeo, neckGeo], false) ?? bodyGeo;
    bodyGeo.dispose();
    neckGeo.dispose();
    const body = outlined(this.rig, bodyCombined, bodyMat);
    this.bodyMesh = body.mesh;
    this.bodyHull = body.hull;

    // 固定小鸡头 + 呆萌眼睛（P-011 永远保留）
    this.head.position.set(0.8, 1.7, 0);
    this.rig.add(this.head);
    outlined(this.head, chickHeadGeometry(), headMat);

    const eyeA = chickEyeGeometry().translate(0.35, 0.06, -0.22);
    const eyeB = chickEyeGeometry().translate(0.35, 0.06, 0.22);
    const eyeGeo = mergeGeometries([eyeA, eyeB], false) ?? eyeA;
    eyeA.dispose();
    eyeB.dispose();
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    this.head.add(eye);
    this.eyes.push(eye);

    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const gA = chickGlintGeometry().translate(0.39, 0.08, -0.205);
    const gB = chickGlintGeometry().translate(0.39, 0.08, 0.205);
    const glintGeo = mergeGeometries([gA, gB], false) ?? gA;
    gA.dispose();
    gB.dispose();
    const glint = new THREE.Mesh(glintGeo, glintMat);
    this.head.add(glint);
    this.eyeGlints.push(glint);

    // 尾桩（装了尾巴零件后隐藏）
    const stump = outlined(this.rig, chickTailStumpGeometry(), bodyMat);
    stump.mesh.position.set(-0.58, 1.12, 0);
    stump.hull.position.copy(stump.mesh.position);
    this.tailStumpMesh = stump.mesh;
    this.tailStumpHull = stump.hull;

    // 默认小喙/小脚（有对应零件时隐藏）
    const beakGeo = chickBaseBeakGeometry();
    this.baseBeak = new THREE.Mesh(beakGeo, materialForKind('bone'));
    this.baseBeak.position.set(1.14, 1.66, 0);
    this.baseBeakHull = new THREE.Mesh(makeOutlineGeometry(beakGeo), outlineMaterial());
    this.baseBeakHull.position.copy(this.baseBeak.position);
    this.rig.add(this.baseBeak, this.baseBeakHull);

    const legA = chickBaseLegGeometry().translate(0.05, 0.68, -0.24);
    const legB = chickBaseLegGeometry().translate(0.05, 0.68, 0.24);
    const legGeo = mergeGeometries([legA, legB], false) ?? legA;
    legA.dispose();
    legB.dispose();
    this.baseLeg = new THREE.Mesh(legGeo, legMat);
    this.baseLegHull = new THREE.Mesh(makeOutlineGeometry(legGeo), outlineMaterial());
    this.rig.add(this.baseLeg, this.baseLegHull);

    this.rig.add(this.batches.group);

    for (const slot of Object.keys(SLOT_ANCHORS) as SlotId[]) {
      const mat = new THREE.SpriteMaterial({
        map: getGlowSpriteTexture(),
        color: 0x7bffdf,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(mat);
      const a = SLOT_ANCHORS[slot];
      sprite.position.set(a[0], a[1], a[2]);
      sprite.scale.set(0.85, 0.85, 0.85);
      sprite.visible = false;
      this.rig.add(sprite);
      this.flashes.set(slot, { sprite, at: -10 });
    }
    this.shadow = createBlobShadow(1.65);
  }

  setWorld(x: number, y = 0, z = 0): void {
    this.worldX = x;
    this.worldY = Math.max(0, y);
    this.worldZ = z;
  }

  setFacing(dir: 1 | -1): void {
    this.facing = dir;
  }

  setLunge(dx: number): void {
    this.lunge = dx;
  }

  setMoving(moving: boolean): void {
    this.moving = moving;
  }

  setDown(down: boolean): void {
    this.downTarget = down ? 1 : 0;
  }

  hit(now: number): void {
    this.hitAt = now;
  }

  flashSlot(slot: SlotId): void {
    const f = this.flashes.get(slot);
    if (!f) return;
    f.at = this.now;
    f.sprite.visible = true;
  }

  setCreature(creature: Creature, byId: Readonly<Record<string, PartDef>> = PART_BY_ID): void {
    const placements = layoutCreature(creature);
    this.setLayout(placements, byId, creature.slots.body);
  }

  setLayout(
    placements: readonly PlacedPart[],
    byId: Readonly<Record<string, PartDef>> = PART_BY_ID,
    bodyInstances: readonly PartInstance[] = [],
  ): void {
    for (const slot of Object.keys(this.counts) as SlotId[]) this.counts[slot] = 0;
    for (const p of placements) {
      const def = byId[p.defId];
      if (def) this.counts[def.slot] += 1;
    }
    if (bodyInstances.length > 0) this.counts.body = bodyInstances.length;

    this.batches.sync(placements, byId, this.now, bodyInstances);

    const hasBody = this.counts.body > 0;
    this.bodyMesh.visible = !hasBody;
    this.bodyHull.visible = !hasBody;

    const hasBeak = this.counts.beak > 0;
    this.baseBeak.visible = !hasBeak;
    this.baseBeakHull.visible = !hasBeak;

    const hasLegs = this.counts.legs > 0;
    this.baseLeg.visible = !hasLegs;
    this.baseLegHull.visible = !hasLegs;

    const hasTail = this.counts.tail > 0;
    this.tailStumpMesh.visible = !hasTail;
    this.tailStumpHull.visible = !hasTail;
  }

  update(dt: number, now: number, battle: boolean): void {
    this.now = now;
    const t = now;
    const airborne = this.worldY > 0.12;
    const breath = Math.sin((Math.PI * 2 * t) / 2.8);

    this.head.position.y = 1.7 + 0.015 * Math.sin((Math.PI * 2 * t) / 2.8 + 0.6);
    this.bodyMesh.scale.set(1 + 0.006 * breath, 1 + 0.012 * breath, 1 + 0.006 * breath);

    // 眨眼
    const bp = t % 4.2;
    const blink = bp > 4.05 ? Math.sin(((bp - 4.05) / 0.15) * Math.PI) : 0;
    for (const eye of this.eyes) eye.scale.y = 1 - 0.92 * blink;
    for (const glint of this.eyeGlints) glint.scale.y = 1 - 0.92 * blink;

    // 受击弹性缩放 + 抖动
    const age = t - this.hitAt;
    const punch = age >= 0 && age < 0.45 ? 1 + 0.1 * Math.exp(-13 * age) : 1;
    this.rig.scale.set(
      (1 - 0.008 * breath) * punch,
      (1 + 0.016 * breath) * punch,
      (1 - 0.008 * breath) * punch,
    );

    let shake = 0;
    if (age >= 0 && age < 0.45) shake = 0.075 * Math.exp(-9 * age) * Math.sin(54 * age);

    const bob = this.moving && !airborne ? 0.03 * Math.sin((4 * Math.PI * t) / 0.55 + 0.4) : 0;
    this.down += (this.downTarget - this.down) * Math.min(1, dt * 8);

    // 平滑转向
    const targetYaw = this.facing === 1 ? 0 : Math.PI;
    let diff = targetYaw - this.currentYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.currentYaw += diff * Math.min(1, dt * 16);

    this.root.position.set(
      this.worldX + this.lunge + shake,
      this.worldY,
      this.worldZ + shake * 0.4,
    );
    this.root.rotation.y = this.currentYaw;
    // 空中微微仰起增强 3D 跳跃立体感
    const airTilt = airborne ? 0.14 : 0;
    this.root.rotation.z = -1.2 * this.down + airTilt;
    this.rig.position.y = bob;

    this.batches.update(t, battle, this.moving, airborne);

    for (const f of this.flashes.values()) {
      const a = t - f.at;
      if (a >= 0 && a < 0.5) {
        f.sprite.visible = true;
        const k = 1 - a / 0.5;
        (f.sprite.material as THREE.SpriteMaterial).opacity = 0.92 * k;
        f.sprite.scale.setScalar(0.75 + (1 - k) * 0.6);
      } else if (f.sprite.visible) {
        f.sprite.visible = false;
      }
    }

    // 贴地阴影随 3D 跳跃高度缩小变淡，立体感一目了然（P-008）
    this.shadow.position.set(this.worldX + this.lunge, 0.012, this.worldZ);
    const shadowMat = this.shadow.material as THREE.MeshBasicMaterial;
    const hFactor = Math.max(0.28, 1 - this.worldY / 3.2);
    shadowMat.opacity = 0.42 * hFactor;
    const s = hFactor * (1 + Math.abs(this.lunge) * 0.08);
    this.shadow.scale.set(s, 1, s);
  }

  getSlotWorld(slot: SlotId, out: THREE.Vector3): THREE.Vector3 {
    const a = SLOT_ANCHORS[slot];
    return out.set(
      this.worldX + this.lunge + a[0] * this.facing,
      this.worldY + this.rig.position.y + a[1],
      this.worldZ + a[2],
    );
  }

  getHeadWorld(out: THREE.Vector3): THREE.Vector3 {
    return out.set(
      this.worldX + this.lunge + 0.8 * this.facing,
      this.worldY + this.rig.position.y + 1.85,
      this.worldZ,
    );
  }

  get slotCounts(): Readonly<Record<SlotId, number>> {
    return this.counts;
  }

  dispose(): void {
    this.batches.dispose();
    this.shadow.geometry.dispose();
    (this.shadow.material as THREE.Material).dispose();
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (!obj.userData.sharedGeometry) obj.geometry.dispose();
      }
    });
  }
}

export { tmpWorld };
