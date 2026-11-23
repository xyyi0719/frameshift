/**
 * 小鸡 base rig + 零件实例（B 负责）。
 * ---------------------------------------------------------------
 * 节点与比例按 docs/RIG3D.md §2；零件布局只消费 core 的 PlacedPart[]。
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PartDef, PlacedPart, SlotId } from '../core';
import { PART_BY_ID } from '../core';
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

const DEG = Math.PI / 180;


/** 槽位环锚点（base rig 局部坐标；UI 投影到屏幕）。 */
export const SLOT_ANCHORS: Record<SlotId, readonly [number, number, number]> = {
  body: [0, 1.12, 0],
  beak: [1.5, 1.68, 0],
  legs: [0.05, 0.6, 0.72],
  wings: [-0.05, 1.42, -0.82],
  tail: [-1.55, 1.18, 0],
  crest: [0.74, 2.12, 0],
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
}

/**
 * 一只鸡。root 放在世界地面 (x,0,z)，内部 base rig 抬到 y=1.02。
 */
export class ChickModel {
  readonly root = new THREE.Group();
  readonly rig = new THREE.Group();
  readonly shadow: THREE.Mesh;
  private readonly bodyMesh: THREE.Mesh;
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
  private worldZ = 0;
  private lunge = 0;
  private moving = false;
  private downTarget = 0;
  private down = 0;
  private hitAt = -10;
  private now = 0;
  private clock = 0;
  private lastBatchTick = -1;

  constructor(opts: ChickOptions = {}) {
    const enemy = opts.variant === 'enemy';
    const feather = enemy ? 0xe58e6d : 0xffd24a;
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

    this.head.position.set(0.8, 1.70, 0);
    this.rig.add(this.head);
    outlined(this.head, chickHeadGeometry(), headMat);

    const eyeA = chickEyeGeometry().translate(0.34, 0.06, -0.215);
    const eyeB = chickEyeGeometry().translate(0.34, 0.06, 0.215);
    const eyeGeo = mergeGeometries([eyeA, eyeB], false) ?? eyeA;
    eyeA.dispose(); eyeB.dispose();
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    this.head.add(eye);
    this.eyes.push(eye);
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const gA = chickGlintGeometry().translate(0.375, 0.078, -0.013);
    const gB = chickGlintGeometry().translate(0.375, 0.078, 0.013);
    const glintGeo = mergeGeometries([gA, gB], false) ?? gA;
    gA.dispose(); gB.dispose();
    const glint = new THREE.Mesh(glintGeo, glintMat);
    this.head.add(glint);
    this.eyeGlints.push(glint);

    // 尾桩
    const stump = outlined(this.rig, chickTailStumpGeometry(), bodyMat);
    stump.mesh.position.set(-0.58, 1.12, 0);
    stump.hull.position.copy(stump.mesh.position);

    // 默认小喙/小脚：有对应零件时隐藏，保证裸鸡也像鸡
    const beakGeo = chickBaseBeakGeometry();
    this.baseBeak = new THREE.Mesh(beakGeo, materialForKind('bone'));
    this.baseBeak.position.set(1.14, 1.68, 0);
    this.baseBeakHull = new THREE.Mesh(makeOutlineGeometry(beakGeo), outlineMaterial());
    this.baseBeakHull.position.copy(this.baseBeak.position);
    this.rig.add(this.baseBeak, this.baseBeakHull);

    const legA = chickBaseLegGeometry().translate(0.05, 0.68, -0.24);
    const legB = chickBaseLegGeometry().translate(0.05, 0.68, 0.24);
    const legGeo = mergeGeometries([legA, legB], false) ?? legA;
    legA.dispose(); legB.dispose();
    this.baseLeg = new THREE.Mesh(legGeo, legMat);
    this.baseLegHull = new THREE.Mesh(makeOutlineGeometry(legGeo), outlineMaterial());
    this.rig.add(this.baseLeg, this.baseLegHull);

    this.rig.add(this.batches.group);

    for (const slot of Object.keys(SLOT_ANCHORS) as SlotId[]) {
      const mat = new THREE.SpriteMaterial({
        map: getGlowSpriteTexture(),
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(mat);
      const a = SLOT_ANCHORS[slot];
      sprite.position.set(a[0], a[1], a[2]);
      sprite.scale.set(0.8, 0.8, 0.8);
      sprite.visible = false;
      this.rig.add(sprite);
      this.flashes.set(slot, { sprite, at: -10 });
    }
    this.shadow = createBlobShadow(1.55);
  }

  setWorld(x: number, z = 0): void {
    this.worldX = x;
    this.worldZ = z;
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

  setLayout(placements: readonly PlacedPart[], byId: Readonly<Record<string, PartDef>> = PART_BY_ID): void {
    for (const slot of Object.keys(this.counts) as SlotId[]) this.counts[slot] = 0;
    for (const p of placements) {
      const def = byId[p.defId];
      if (def) this.counts[def.slot] += 1;
    }
    this.batches.sync(placements, byId, this.now);
    const hasBeak = this.counts.beak > 0;
    this.baseBeak.visible = !hasBeak;
    this.baseBeakHull.visible = !hasBeak;
    const hasLegs = this.counts.legs > 0;
    this.baseLeg.visible = !hasLegs;
    this.baseLegHull.visible = !hasLegs;
  }

  update(dt: number, now: number, battle: boolean): void {
    this.now = now;
    this.clock = now;
    void dt;
    const t = now;
    const breath = Math.sin((Math.PI * 2 * t) / 2.8);
    this.head.position.y = 1.70 + 0.012 * Math.sin((Math.PI * 2 * t) / 2.8 + 0.6);
    this.bodyMesh.scale.set(1 + 0.006 * breath, 1 + 0.012 * breath, 1 + 0.006 * breath);

    // 眨眼
    const bp = t % 4.2;
    const blink = bp > 4.05 ? Math.sin(((bp - 4.05) / 0.15) * Math.PI) : 0;
    for (const eye of this.eyes) eye.scale.y = 1 - 0.92 * blink;
    for (const glint of this.eyeGlints) glint.scale.y = 1 - 0.92 * blink;

    // 呼吸缩放 + 受击 punch
    const age = t - this.hitAt;
    const punch = age >= 0 && age < 0.5 ? 1 + 0.08 * Math.exp(-14 * age) : 1;
    this.rig.scale.set(
      (1 - 0.008 * breath) * punch,
      (1 + 0.016 * breath) * punch,
      (1 - 0.008 * breath) * punch,
    );

    // 受击抖动
    let shake = 0;
    if (age >= 0 && age < 0.5) shake = 0.06 * Math.exp(-9 * age) * Math.sin(52 * age);
    const bob = this.moving ? 0.022 * Math.sin((4 * Math.PI * t) / 0.7 + 0.4) : 0;
    this.down += (this.downTarget - this.down) * Math.min(1, dt * 8);
    this.root.position.set(this.worldX + this.lunge + shake, 0, this.worldZ + shake * 0.5);
    this.root.rotation.z = -1.2 * this.down;
    this.rig.position.y = bob;

    this.batches.update(t, battle, this.moving);
    for (const f of this.flashes.values()) {
      const a = t - f.at;
      if (a >= 0 && a < 0.5) {
        f.sprite.visible = true;
        const k = 1 - a / 0.5;
        (f.sprite.material as THREE.SpriteMaterial).opacity = 0.9 * k;
        f.sprite.scale.setScalar(0.65 + (1 - k) * 0.5);
      } else if (f.sprite.visible) {
        f.sprite.visible = false;
      }
    }
    this.shadow.position.set(this.worldX + this.lunge, 0.012, this.worldZ);
    const shadowMat = this.shadow.material as THREE.MeshBasicMaterial;
    shadowMat.opacity = 0.38 * Math.max(0.25, 1 - Math.max(0, bob) / 1.2);
    const s = 1 + Math.abs(this.lunge) * 0.08;
    this.shadow.scale.set(s, 1, s);
  }

  /** 槽位环锚点（世界坐标），UI 用 camera 投影。 */
  getSlotWorld(slot: SlotId, out: THREE.Vector3): THREE.Vector3 {
    const a = SLOT_ANCHORS[slot];
    return out.set(
      this.worldX + this.lunge + a[0],
      this.rig.position.y + a[1],
      this.worldZ + a[2],
    );
  }

  getHeadWorld(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.worldX + this.lunge + 0.8, this.rig.position.y + 1.72, this.worldZ);
  }

  get slotCounts(): Readonly<Record<SlotId, number>> {
    return this.counts;
  }

  get totalParts(): number {
    return Object.values(this.counts).reduce((a, b) => a + b, 0);
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

/** 临时向量，避免 UI 每帧 new Vector3。 */
export function projectWorld(world: THREE.Vector3, camera: THREE.Camera, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(world).project(camera);
}

export function slotWorldOf(model: ChickModel, slot: SlotId): THREE.Vector3 {
  const out = new THREE.Vector3();
  model.getSlotWorld(slot, out);
  return out;
}

export function headWorldOf(model: ChickModel): THREE.Vector3 {
  const out = new THREE.Vector3();
  model.getHeadWorld(out);
  return out;
}

/** 内部临时量（避免每次调用分配）。 */
export { tmpWorld };
void DEG;
