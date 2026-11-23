/**
 * 24 个零件的程序化几何（B 负责）。
 * ---------------------------------------------------------------
 * 全部按 docs/RIG3D.md §3 的造型提示，1 件 = 1 个合并后的 BufferGeometry。
 * 原点在零件锚点：喙 +x、腿 -y、翼 +z、尾 -x、冠 +y。
 * 左右镜像在构建期做（顶点 z 取反 + 三角形绕序反转），不建两套参数。
 */

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type SlotKey = 'body' | 'beak' | 'legs' | 'wings' | 'tail' | 'crest';
export type SideKey = 'R' | 'L';

/* ==========================================================================
 * 基础工具
 * ========================================================================== */

const DEG = Math.PI / 180;

function xform(
  geo: THREE.BufferGeometry,
  pos: [number, number, number] = [0, 0, 0],
  rot: [number, number, number] = [0, 0, 0],
  scl: [number, number, number] = [1, 1, 1],
): THREE.BufferGeometry {
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
    new THREE.Vector3(...scl),
  );
  geo.applyMatrix4(m);
  return geo;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // 统一非索引 + 只保留 position/normal，避免不同原语的 uv/index 组合导致合并失败。
  const cleaned = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    }
    return g;
  });
  const merged = mergeGeometries(cleaned, false);
  for (const p of parts) p.dispose();
  for (const g of cleaned) if (!parts.includes(g)) g.dispose();
  if (!merged) throw new Error('mergeGeometries failed');
  return merged;
}

/** RIG 要求：硬边走非索引 + 重算法线。 */
function harden(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = geo.index ? geo.toNonIndexed() : geo;
  if (geo.index) geo.dispose();
  out.computeVertexNormals();
  return out;
}

function hash01(i: number): number {
  let x = (i * 374761393 + 668265263) >>> 0;
  x = ((x ^ (x >>> 13)) * 1274126177) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** 只扰动 bodyCore/身体绒球，不改变剪影。 */
function fluff(geo: THREE.BufferGeometry, amp: number): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i += 1) {
    const k = amp * (hash01(i * 7 + 1) - 0.5);
    pos.setXYZ(
      i,
      pos.getX(i) + nor.getX(i) * k,
      pos.getY(i) + nor.getY(i) * k,
      pos.getZ(i) + nor.getZ(i) * k,
    );
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function sphere(w: number, h: number, r: number, sx: number, sy: number, sz: number): THREE.BufferGeometry {
  return xform(new THREE.SphereGeometry(r, w, h), [0, 0, 0], [0, 0, 0], [sx, sy, sz]);
}

function coneX(radius: number, height: number, seg = 6): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(radius, height, seg, 1);
  xform(geo, [0, 0, 0], [0, 0, -Math.PI / 2]);
  return xform(geo, [height / 2, 0, 0]);
}

function cylX(rTop: number, rBottom: number, height: number, seg = 5): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, height, seg, 1);
  xform(geo, [0, 0, 0], [0, 0, -Math.PI / 2]);
  return xform(geo, [height / 2, 0, 0]);
}

function cylY(rTop: number, rBottom: number, height: number, seg = 6): THREE.BufferGeometry {
  return xform(new THREE.CylinderGeometry(rTop, rBottom, height, seg, 1), [0, -height / 2, 0]);
}

function cylZ(rTop: number, rBottom: number, height: number, seg = 5): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, height, seg, 1);
  xform(geo, [0, 0, 0], [Math.PI / 2, 0, 0]);
  return xform(geo, [0, 0, height / 2]);
}

function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d);
}

function plane(w: number, h: number): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(w, h, 1, 1);
}

/** 薄片扇：顶点数组 + 三角索引，法线默认朝上（y+）。 */
function fan(verts: readonly number[], indices: readonly number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex([...indices]);
  geo.computeVertexNormals();
  return geo;
}

/* ==========================================================================
 * 24 个零件
 * ========================================================================== */

function makeBody(key: string): THREE.BufferGeometry {
  switch (key) {
    case 'body.basic': {
      const g = sphere(12, 9, 0.72, 1, 1, 1);
      xform(g, [0, 0.02, 0], [0, 0, 0], [1, 0.66 / 0.72, 0.62 / 0.72]);
      return fluff(g, 0.04);
    }
    case 'body.plump': {
      const g = sphere(12, 9, 0.84, 1, 1, 1);
      xform(g, [0, 0.02, 0], [0, 0, 0], [1, 0.78 / 0.84, 0.76 / 0.84]);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i += 1) if (p.getY(i) < 0) p.setY(i, p.getY(i) * 1.12 - 0.04);
      p.needsUpdate = true;
      return fluff(g, 0.025);
    }
    case 'body.slim':
      return xform(sphere(10, 8, 0.5, 1, 1, 1), [0, 0, 0], [0, 0, -6 * DEG], [1, 0.82 / 0.5, 0.46 / 0.5]);
    case 'body.tough':
      return xform(new THREE.IcosahedronGeometry(1, 1), [0, 0, 0], [0, 0, 0], [0.8, 0.72, 0.68]);
    default: {
      const g = sphere(10, 8, 0.7, 1, 0.9, 0.65);
      return fluff(g, 0.03);
    }
  }
}

function makeBeak(key: string): THREE.BufferGeometry {
  switch (key) {
    case 'beak.short': {
      const c = coneX(0.13, 0.2, 6);
      const pouch = xform(sphere(8, 5, 0.09, 1, 0.8, 0.9), [0.1, -0.06, 0]);
      return merge([c, pouch]);
    }
    case 'beak.sharp':
      return xform(coneX(0.085, 0.34, 6), [0.02, 0, 0]);
    case 'beak.long': {
      const a = coneX(0.085, 0.26, 6);
      const b = xform(coneX(0.055, 0.22, 6), [0.24, -0.02, 0], [0, 0, -28 * DEG]);
      return merge([a, b]);
    }
    case 'beak.hammer': {
      const c = coneX(0.09, 0.16, 6);
      const hammer = xform(box(0.26, 0.18, 0.16), [0.2, 0, 0]);
      return merge([c, hammer]);
    }
    default:
      return coneX(0.1, 0.24, 6);
  }
}

function makeFoot(kind: 'runner' | 'stub' | 'spring' | 'claw', atY: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  if (kind === 'spring') {
    parts.push(xform(box(0.13, 0.04, 0.09), [0.02, atY, 0]));
  } else if (kind === 'stub') {
    parts.push(xform(box(0.18, 0.05, 0.14), [0.04, atY, 0]));
    parts.push(xform(coneX(0.025, 0.08, 4), [0.12, atY - 0.01, -0.05]));
    parts.push(xform(coneX(0.025, 0.08, 4), [0.12, atY - 0.01, 0.05]));
  } else if (kind === 'claw') {
    parts.push(xform(box(0.1, 0.035, 0.08), [0.01, atY, 0]));
    for (const [dz, ang] of [
      [0, 0],
      [-0.09, -32 * DEG],
      [0.09, 32 * DEG],
    ] as const) {
      parts.push(xform(coneX(0.03, 0.16, 5), [0.08, atY - 0.01, dz], [0, 0, ang]));
    }
  } else {
    parts.push(xform(box(0.14, 0.04, 0.1), [0.03, atY, 0]));
    for (const dz of [-0.07, 0, 0.07]) {
      parts.push(xform(coneX(0.02, 0.07, 4), [0.1, atY - 0.01, dz]));
    }
  }
  return merge(parts);
}

function makeLeg(key: string): THREE.BufferGeometry {
  const kind = (key.split('.')[1] ?? 'runner') as 'runner' | 'stub' | 'spring' | 'claw';
  if (kind === 'spring') {
    const pts: THREE.Vector3[] = [];
    const turns = 4;
    for (let i = 0; i <= 32; i += 1) {
      const u = i / 32;
      const a = u * turns * Math.PI * 2;
      const r = 0.09 - 0.04 * u;
      pts.push(new THREE.Vector3(Math.cos(a) * r, -u * 0.52, Math.sin(a) * r));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const spring = new THREE.TubeGeometry(curve, 28, 0.028, 4, false);
    return harden(merge([spring, makeFoot('spring', -0.54)]));
  }
  if (kind === 'claw') {
    const upper = cylY(0.05, 0.04, 0.2, 6);
    const lower = xform(cylY(0.04, 0.03, 0.4, 6), [0, -0.2, 0]);
    const knee = xform(sphere(6, 4, 0.05, 1, 1, 1), [0, -0.2, 0]);
    return merge([upper, lower, knee, makeFoot('claw', -0.61)]);
  }
  if (kind === 'stub') {
    const upper = cylY(0.09, 0.075, 0.24, 6);
    const lower = xform(cylY(0.075, 0.06, 0.22, 6), [0, -0.24, 0]);
    const knee = xform(sphere(6, 4, 0.075, 1, 1, 1), [0, -0.24, 0]);
    return merge([upper, lower, knee, makeFoot('stub', -0.47)]);
  }
  const upper = cylY(0.045, 0.035, 0.34, 6);
  const lower = xform(cylY(0.035, 0.03, 0.3, 6), [0, -0.34, 0]);
  const knee = xform(sphere(6, 4, 0.05, 1, 1, 1), [0, -0.34, 0]);
  return merge([upper, lower, knee, makeFoot('runner', -0.65)]);
}

function makeWing(key: string): THREE.BufferGeometry {
  switch (key) {
    case 'wings.feather': {
      const root = xform(sphere(8, 5, 0.09, 1, 1, 1), [0, 0, 0.02]);
      const feathers: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 3; i += 1) {
        const f = xform(box(0.07, 0.02, 0.46), [0, 0, 0.24 + i * 0.2], [-12 * DEG * i, 0, 0]);
        feathers.push(f);
      }
      return merge([root, ...feathers]);
    }
    case 'wings.glide': {
      const verts = [
        0, 0, 0.05,
        0, 0, 1.05,
        -0.30, -0.02, 0.78,
        0, 0, 0.05,
        -0.30, -0.02, 0.78,
        -0.34, -0.05, 0.46,
        0, 0, 0.05,
        -0.34, -0.05, 0.46,
        -0.2, 0, 0.18,
      ];
      const membrane = fan(verts, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
      const leading = cylZ(0.025, 0.025, 1.0, 4);
      xform(leading, [0, 0, 0.05]);
      return merge([membrane, leading]);
    }
    case 'wings.bat': {
      const verts = [
        0, 0, 0,
        0, 0, 1.02,
        -0.48, -0.02, 0.7,
        0, 0, 0,
        -0.42, -0.02, 0.55,
        -0.4, -0.01, 0.38,
        0, 0, 0,
        -0.4, -0.01, 0.38,
        -0.18, 0, 0.08,
      ];
      const membrane = fan(verts, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
      const bones: THREE.BufferGeometry[] = [];
      for (const [z, len, yaw] of [
        [0.5, 0.5, 0.1],
        [0.72, 0.62, 0.22],
        [0.38, 0.58, 0.05],
      ] as const) {
        const b = cylZ(0.022, 0.022, len, 4);
        xform(b, [0, 0, z], [0, yaw, 0]);
        bones.push(b);
      }
      const elbow = xform(sphere(6, 4, 0.05, 1, 1, 1), [0, 0, 0.46]);
      return merge([membrane, ...bones, elbow]);
    }
    case 'wings.armor': {
      const plates: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 3; i += 1) {
        const p = xform(box(0.38, 0.04, 0.3), [0, 0, 0.24 + i * 0.26], [-8 * DEG * i, 0, 0]);
        plates.push(p);
      }
      return merge(plates);
    }
    default: {
      const root = xform(sphere(6, 4, 0.08, 1, 1, 1), [0, 0, 0]);
      return merge([root, xform(box(0.2, 0.03, 0.5), [0, 0, 0.28])]);
    }
  }
}

function makeTail(key: string): THREE.BufferGeometry {
  switch (key) {
    case 'tail.fan': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 5; i += 1) {
        const ang = (-35 + i * 17.5) * DEG;
        const p = xform(box(0.52, 0.02, 0.3), [-0.3, 0, 0], [ang, 0, 0]);
        parts.push(p);
      }
      return merge(parts);
    }
    case 'tail.spike': {
      const handle = xform(cylX(0.05, 0.07, 0.48, 6), [-0.48, 0, 0]);
      const ball = xform(new THREE.IcosahedronGeometry(0.16, 0), [-0.52, 0, 0]);
      const spikes: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        const s = xform(coneX(0.025, 0.14, 4), [-0.52, Math.cos(a) * 0.12, Math.sin(a) * 0.12], [0, 0, -Math.PI / 2]);
        spikes.push(s);
      }
      return merge([handle, ball, ...spikes]);
    }
    case 'tail.whip': {
      const a = xform(cylX(0.05, 0.045, 0.22, 5), [-0.22, 0, 0]);
      const b = xform(cylX(0.04, 0.03, 0.22, 5), [-0.48, -0.02, 0], [0, 0, 20 * DEG]);
      const c = xform(cylX(0.03, 0.01, 0.18, 5), [-0.66, -0.1, 0], [0, 0, 30 * DEG]);
      return merge([a, b, c]);
    }
    case 'tail.balance': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i += 1) {
        const ang = (-28 + i * 18.7) * DEG;
        parts.push(xform(box(0.16, 0.02, 0.42), [-0.3, 0, 0], [ang, 0, 0]));
      }
      return merge(parts);
    }
    default:
      return xform(box(0.3, 0.04, 0.2), [-0.15, 0, 0]);
  }
}

function makeCrest(key: string): THREE.BufferGeometry {
  switch (key) {
    case 'crest.spike': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i += 1) {
        const c = xform(new THREE.ConeGeometry(0.06, 0.22, 3), [i * 0.08 - 0.12, 0.1, 0], [0, 0, -14 * DEG]);
        parts.push(c);
      }
      return merge(parts);
    }
    case 'crest.crown': {
      const ring = new THREE.CylinderGeometry(0.16, 0.16, 0.1, 8, 1, true);
      ring.translate(0, 0.05, 0);
      const spikes: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2;
        spikes.push(
          xform(new THREE.ConeGeometry(0.035, 0.12, 4), [Math.cos(a) * 0.13, 0.16, Math.sin(a) * 0.13]),
        );
      }
      return merge([ring, ...spikes]);
    }
    case 'crest.plume': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 3; i += 1) {
        parts.push(
          xform(box(0.06, 0.34, 0.02), [i * 0.05 - 0.05, 0.16, 0], [0, 0, (-15 + i * 15) * DEG]),
        );
      }
      return merge(parts);
    }
    case 'crest.horn': {
      const parts: THREE.BufferGeometry[] = [];
      for (const z of [-0.07, 0.07]) {
        parts.push(
          xform(new THREE.ConeGeometry(0.05, 0.34, 6), [0, 0.16, z], [0, 0, (z < 0 ? 1 : -1) * 15 * DEG]),
        );
      }
      return merge(parts);
    }
    default:
      return xform(new THREE.ConeGeometry(0.07, 0.26, 5), [0, 0.12, 0]);
  }
}

function makeFallback(key: string, slot: string): THREE.BufferGeometry {
  switch (slot) {
    case 'body':
      return makeBody('body.basic');
    case 'beak':
      return makeBeak('beak.short');
    case 'legs':
      return makeLeg('legs.runner');
    case 'wings':
      return makeWing('wings.feather');
    case 'tail':
      return makeTail('tail.fan');
    case 'crest':
      return makeCrest('crest.spike');
    default:
      return xform(new THREE.IcosahedronGeometry(0.2, 0), [0, 0, 0]);
  }
}

function buildRight(key: string): THREE.BufferGeometry {
  const slot = (key.split('.')[0] ?? '') as SlotKey;
  let geo: THREE.BufferGeometry;
  switch (slot) {
    case 'body':
      geo = makeBody(key);
      break;
    case 'beak':
      geo = makeBeak(key);
      break;
    case 'legs':
      geo = makeLeg(key);
      break;
    case 'wings':
      geo = makeWing(key);
      break;
    case 'tail':
      geo = makeTail(key);
      break;
    case 'crest':
      geo = makeCrest(key);
      break;
    default:
      geo = makeFallback(key, slot);
      break;
  }
  return harden(geo);
}

/* ==========================================================================
 * 镜像 / 描边壳 / 缓存
 * ========================================================================== */

function mirrorZ(base: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = base.clone();
  const pos = geo.attributes.position;
  // 非索引：每三个顶点一组，交换后两个顶点恢复正确绕序。
  for (let i = 0; i + 2 < pos.count; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const a = pos.getComponent(i + 1, axis);
      const b = pos.getComponent(i + 2, axis);
      pos.setComponent(i + 1, axis, b);
      pos.setComponent(i + 2, axis, a);
    }
  }
  for (let i = 0; i < pos.count; i += 1) pos.setZ(i, -pos.getZ(i));
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** 反向法线壳：焊接 → 平滑法线 → 沿法线外扩。 */
export function makeOutlineGeometry(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const welded = mergeVertices(geo.clone(), 1e-4);
  welded.computeVertexNormals();
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const minRadius = bb
    ? Math.min(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) / 2
    : 0.1;
  const w = Math.min(0.02, Math.max(0.006, 0.28 * minRadius));
  const pos = welded.attributes.position;
  const nor = welded.attributes.normal;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setXYZ(
      i,
      pos.getX(i) + nor.getX(i) * w,
      pos.getY(i) + nor.getY(i) * w,
      pos.getZ(i) + nor.getZ(i) * w,
    );
  }
  pos.needsUpdate = true;
  welded.computeBoundingSphere();
  return welded;
}

export interface PartGeometry {
  readonly geo: THREE.BufferGeometry;
  readonly outline: THREE.BufferGeometry;
  readonly triangles: number;
}

const cache = new Map<string, PartGeometry>();

export function partGeometry(key: string, side: SideKey): PartGeometry {
  const cacheKey = `${key}|${side}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const right = buildRight(key);
  const geo = side === 'L' ? mirrorZ(right) : right;
  if (side === 'L') right.dispose();
  // BatchedMesh 要求所有几何属性集合一致；只需要 position/normal。
  for (const name of Object.keys(geo.attributes)) {
    if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
  }
  const outline = makeOutlineGeometry(geo);
  const triangles = geo.attributes.position.count / 3;
  const entry = { geo, outline, triangles };
  cache.set(cacheKey, entry);
  return entry;
}

export function geometryTriangleCount(): number {
  let n = 0;
  for (const entry of cache.values()) n += entry.triangles;
  return n;
}

export function disposePartGeometryCache(): void {
  for (const entry of cache.values()) {
    entry.geo.dispose();
    entry.outline.dispose();
  }
  cache.clear();
}

/** 鸡身基础几何：与 RIG3D §2 对齐，供 ChickModel 使用。 */
export function chickBodyGeometry(): THREE.BufferGeometry {
  const g = sphere(10, 7, 1, 1, 1, 1);
  xform(g, [0, 0, 0], [0, 0, 0], [0.42, 0.46, 0.38]);
  return harden(fluff(g, 0.06));
}

export function chickHeadGeometry(): THREE.BufferGeometry {
  return harden(sphere(12, 8, 1, 0.4, 0.38, 0.36));
}

export function chickEyeGeometry(): THREE.BufferGeometry {
  return new THREE.SphereGeometry(0.075, 8, 6);
}

export function chickGlintGeometry(): THREE.BufferGeometry {
  return new THREE.SphereGeometry(0.026, 4, 3);
}

export function chickNeckGeometry(): THREE.BufferGeometry {
  return harden(sphere(8, 6, 1, 0.24, 0.36, 0.22));
}

export function chickTailStumpGeometry(): THREE.BufferGeometry {
  return xform(new THREE.ConeGeometry(0.16, 0.14, 8), [0, 0, 0], [0, 0, Math.PI / 2]);
}

export function chickBaseLegGeometry(): THREE.BufferGeometry {
  return merge([
    cylY(0.035, 0.026, 0.56, 5),
    xform(box(0.13, 0.035, 0.09), [0.03, -0.57, 0]),
    xform(coneX(0.02, 0.07, 4), [0.1, -0.58, -0.04]),
    xform(coneX(0.02, 0.07, 4), [0.1, -0.58, 0.04]),
  ]);
}

export function chickBaseBeakGeometry(): THREE.BufferGeometry {
  return coneX(0.09, 0.18, 5);
}
