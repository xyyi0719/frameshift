/**
 * 零件实例批处理（B 负责）。
 * ---------------------------------------------------------------
 * 所有零件用 BatchedMesh 合并成 3 个 draw call：
 *   - 正面/双面 toon 各一个（per-instance color 区分材质色）
 *   - 反向法线描边一个
 * 布局完全来自 core 的 PlacedPart（已是地面世界坐标）；这里只做动画/飞入。
 */

import * as THREE from 'three';
import type { PartDef, PlacedPart, SlotId } from '../core';
import { partGeometry } from './geometry';
import { PALETTE, outlineMaterial, toonMaterial } from './materials';

const DEG = Math.PI / 180;
const MAX_INSTANCES = 64;
const MAX_VERTS = 120000;
const MAX_INDICES = 240000;

/** layoutParts() 已是地面世界坐标；这里不需要再补槽位偏移。 */
export const SLOT_ADAPTER: Record<SlotId, readonly [number, number, number]> = {
  body: [0, 0, 0],
  beak: [0, 0, 0],
  legs: [0, 0, 0],
  wings: [0, 0, 0],
  tail: [0, 0, 0],
  crest: [0, 0, 0],
};

function indexOfInstance(instanceKey: string): number {
  const m = /#(\d+)$/.exec(instanceKey);
  return m ? Number(m[1]) : 0;
}

function sideOf(placement: PlacedPart): 'R' | 'L' {
  return placement.position[2] < -1e-4 ? 'L' : 'R';
}

interface PartRecord {
  readonly placement: PlacedPart;
  readonly def: PartDef;
  readonly side: 'R' | 'L';
  readonly index: number;
  readonly front: boolean;
  readonly frontId: number;
  readonly outlineId: number;
}

export class PartBatches {
  readonly group = new THREE.Group();
  private partMesh: THREE.BatchedMesh | null = null;
  private outlineMesh: THREE.BatchedMesh | null = null;
  private records: PartRecord[] = [];
  private readonly spawnAt = new Map<string, number>();
  private readonly matrix = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly qLocal = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly pos = new THREE.Vector3();
  private readonly scl = new THREE.Vector3();
  private readonly color = new THREE.Color();

  constructor() {
    this.group.name = 'part-batches';
  }

  sync(placements: readonly PlacedPart[], byId: Readonly<globalThis.Record<string, PartDef>>, now: number): void {
    this.disposeMeshes();
    const partMat = toonMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    this.partMesh = new THREE.BatchedMesh(MAX_INSTANCES, MAX_VERTS, MAX_INDICES, partMat);
    this.outlineMesh = new THREE.BatchedMesh(MAX_INSTANCES, MAX_VERTS, MAX_INDICES, outlineMaterial());
    for (const mesh of [this.partMesh, this.outlineMesh]) {
      mesh.frustumCulled = false;
      mesh.perObjectFrustumCulled = false;
      mesh.sortObjects = false;
    }
    this.partMesh.name = 'parts-all';
    this.outlineMesh.name = 'parts-outline';
    this.outlineMesh.renderOrder = 1;
    this.group.add(this.partMesh, this.outlineMesh);

    const frontGeo = new Map<string, number>();
    const outlineGeo = new Map<string, number>();
    const alive = new Set<string>();
    const records: PartRecord[] = [];

    for (const placement of placements) {
      const def = byId[placement.defId];
      if (!def) continue;
      alive.add(placement.instanceKey);
      if (!this.spawnAt.has(placement.instanceKey)) this.spawnAt.set(placement.instanceKey, now);
      const side = sideOf(placement);
      const key = `${def.art.geometry}|${side}`;
      const entry = partGeometry(def.art.geometry, side);
      const batch = this.partMesh;
      const geoMap = frontGeo;
      let geoId = geoMap.get(key);
      if (geoId === undefined) {
        entry.geo.computeBoundingBox();
        entry.geo.computeBoundingSphere();
        geoId = batch.addGeometry(entry.geo);
        geoMap.set(key, geoId);
      }
      const frontId = batch.addInstance(geoId);
      this.color.setHex(PALETTE[def.art.material]);
      batch.setColorAt(frontId, this.color);

      let outGeoId = outlineGeo.get(key);
      if (outGeoId === undefined) {
        entry.outline.computeBoundingBox();
        entry.outline.computeBoundingSphere();
        outGeoId = this.outlineMesh.addGeometry(entry.outline);
        outlineGeo.set(key, outGeoId);
      }
      const outlineId = this.outlineMesh.addInstance(outGeoId);
      records.push({
        placement,
        def,
        side,
        index: indexOfInstance(placement.instanceKey),
        front: false,
        frontId,
        outlineId,
      });
    }
    for (const key of [...this.spawnAt.keys()]) if (!alive.has(key)) this.spawnAt.delete(key);
    this.records = records;
    this.update(now, false, false);
  }

  update(t: number, battle: boolean, moving: boolean): void {
    if (this.outlineMesh) this.outlineMesh.visible = this.records.length <= 8;
    for (const rec of this.records) {
      const { placement, def, side, index } = rec;
      const born = this.spawnAt.get(placement.instanceKey) ?? -10;
      const age = Math.max(0, t - born);
      const spawnU = Math.min(1, age / 0.18);
      const spawnEase = 1 - Math.pow(1 - spawnU, 3);

      const [rx, ry, rz] = placement.rotation;
      this.e.set(rx * DEG, ry * DEG, rz * DEG);
      this.q.setFromEuler(this.e);

      let lx = 0;
      let ly = 0;
      let lz = 0;
      if (def.slot === 'legs') {
        const phase = (0.5 * index + 0.08 * Math.floor(index / 2)) % 1;
        const amp = battle || moving ? (battle ? 24 : 20) : 5;
        lz = amp * DEG * Math.sin(Math.PI * 2 * (t / 0.7 - phase));
      } else if (def.slot === 'wings') {
        const q = Math.floor(index / 2);
        const tw = battle ? 0.3 : 0.55;
        const amp = battle ? 26 : moving ? 16 : 8;
        const flap = -(8 + amp * Math.sin((Math.PI * 2 * (t - 0.05 * q)) / tw)) * DEG;
        lx = side === 'L' ? -flap : flap;
      } else if (def.slot === 'tail') {
        ly = 4 * DEG * Math.sin((Math.PI * 2 * t) / 3.1 + index * 0.3);
      } else if (def.slot === 'crest') {
        lz = 1.5 * DEG * Math.sin((Math.PI * 2 * t) / 2.2 + index * 0.5);
      } else if (def.slot === 'beak') {
        lz = 1.2 * DEG * Math.sin((Math.PI * 2 * t) / 5);
      }
      if (spawnU < 1) lz += -0.9 * (1 - spawnEase);
      if (lx !== 0 || ly !== 0 || lz !== 0) {
        this.e.set(lx, ly, lz);
        this.qLocal.setFromEuler(this.e);
        this.q.multiply(this.qLocal);
      }

      let sx = 0;
      let sy = 0;
      let sz = 0;
      if (spawnU < 1) {
        const away = 1 - spawnEase;
        if (def.slot === 'legs') {
          sy = 0.4 * away;
          sz = (side === 'L' ? -1 : 1) * 0.12 * away;
        } else if (def.slot === 'wings') {
          sy = 0.3 * away;
          sz = (side === 'L' ? -1 : 1) * 0.45 * away;
        } else if (def.slot === 'beak') {
          sx = 0.5 * away;
          sy = 0.18 * away;
        } else if (def.slot === 'tail') {
          sx = -0.45 * away;
          sy = 0.18 * away;
        } else if (def.slot === 'crest') {
          sy = 0.4 * away;
        } else {
          sy = 0.35 * away;
        }
      }

      this.pos.set(
        placement.position[0] + SLOT_ADAPTER[def.slot][0] + sx,
        placement.position[1] + SLOT_ADAPTER[def.slot][1] + sy,
        placement.position[2] + SLOT_ADAPTER[def.slot][2] + sz,
      );
      this.scl.setScalar(placement.scale);
      this.matrix.compose(this.pos, this.q, this.scl);
      this.partMesh?.setMatrixAt(rec.frontId, this.matrix);
      this.outlineMesh?.setMatrixAt(rec.outlineId, this.matrix);
    }
  }

  private disposeMeshes(): void {
    for (const mesh of [this.partMesh, this.outlineMesh]) {
      if (!mesh) continue;
      this.group.remove(mesh);
      mesh.dispose();
    }
    this.partMesh = null;
    this.outlineMesh = null;
  }

  get batchCount(): number {
    return 2;
  }

  dispose(): void {
    this.disposeMeshes();
    this.records = [];
    this.spawnAt.clear();
  }
}
