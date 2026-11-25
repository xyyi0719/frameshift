/**
 * 36 个跨动物 + 机械零件的程序化 3D 几何（零外部模型文件）
 * ---------------------------------------------------------------
 * 原点在锚点：口部 +x、腿 -y、侧肢 +z、尾 -x、头顶 +y。
 * 躯干保留 UV 属性以支持 1 / 1/2 / 1/3 表面分区拼色贴图（P-025）。
 */

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type SlotKey = 'body' | 'beak' | 'legs' | 'wings' | 'tail' | 'crest';
export type SideKey = 'R' | 'L';

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

function merge(parts: THREE.BufferGeometry[], keepUv = false): THREE.BufferGeometry {
  const cleaned = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    if (keepUv && !g.attributes.uv) {
      const count = g.attributes.position.count;
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    }
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && (!keepUv || name !== 'uv')) {
        g.deleteAttribute(name);
      }
    }
    return g;
  });
  const merged = mergeGeometries(cleaned, false);
  for (const p of parts) p.dispose();
  for (const g of cleaned) if (!parts.includes(g)) g.dispose();
  if (!merged) throw new Error('mergeGeometries failed');
  return merged;
}

function harden(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = geo.index ? geo.toNonIndexed() : geo;
  if (geo.index) geo.dispose();
  out.computeVertexNormals();
  return out;
}

function ensureSphericalUv(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // 沿前后 +x 到 -x 映射 u，确保 1/2 和 1/3 拼色从侧面 45° 一眼清晰分明！
    const u = Math.min(1, Math.max(0, (x + 0.9) / 1.8));
    const v = Math.min(1, Math.max(0, (y + 0.8) / 1.6 + z * 0.05));
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}

function hash01(i: number): number {
  let x = (i * 374761393 + 668265263) >>> 0;
  x = ((x ^ (x >>> 13)) * 1274126177) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

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

function cylX(rTop: number, rBottom: number, height: number, seg = 6): THREE.BufferGeometry {
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

function fan(verts: readonly number[], indices: readonly number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex([...indices]);
  geo.computeVertexNormals();
  return geo;
}

/* ==========================================================================
 * 1. body · 躯干（6 款：保留 UV 支持 1 / 1/2 / 1/3 表面拼色）
 * ========================================================================== */

function makeBody(key: string): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry;
  switch (key) {
    case 'body.turtle': {
      // 圆拱厚壳 + 外缘裙边
      const dome = sphere(12, 8, 0.78, 1.12, 0.84, 0.92);
      const p = dome.attributes.position;
      for (let i = 0; i < p.count; i += 1) {
        if (p.getY(i) < -0.15) p.setY(i, -0.22 + (p.getY(i) + 0.15) * 0.3);
      }
      p.needsUpdate = true;
      const rim = xform(new THREE.CylinderGeometry(0.84, 0.88, 0.14, 10), [0, -0.14, 0], [0, 0, 0], [1.05, 1, 0.88]);
      geo = merge([dome, rim], true);
      break;
    }
    case 'body.hedgehog': {
      // 圆球 + 一圈放射硬刺
      const core = sphere(11, 8, 0.68, 1.05, 0.92, 0.88);
      const spikes: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 14; i += 1) {
        const phi = ((i % 7) / 7) * Math.PI * 2;
        const elev = i < 7 ? 0.35 : 0.95;
        const dir = new THREE.Vector3(
          Math.cos(phi) * Math.cos(elev) - 0.15,
          Math.sin(elev),
          Math.sin(phi) * Math.cos(elev),
        ).normalize();
        const cone = new THREE.ConeGeometry(0.085, 0.34, 4);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        const m = new THREE.Matrix4().compose(
          dir.clone().multiplyScalar(0.68),
          q,
          new THREE.Vector3(1, 1, 1),
        );
        cone.applyMatrix4(m);
        spikes.push(cone);
      }
      geo = merge([core, ...spikes], true);
      break;
    }
    case 'body.puffer': {
      // 超圆鼓鼓河豚球 + 短小萌刺
      const core = sphere(12, 9, 0.82, 1.06, 0.98, 0.96);
      const spines: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2;
        const dir = new THREE.Vector3(Math.cos(a), (i % 2 ? 0.35 : -0.2), Math.sin(a)).normalize();
        const c = new THREE.ConeGeometry(0.055, 0.16, 4);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        c.applyMatrix4(new THREE.Matrix4().compose(dir.clone().multiplyScalar(0.82), q, new THREE.Vector3(1, 1, 1)));
        spines.push(c);
      }
      geo = merge([core, ...spines], true);
      break;
    }
    case 'body.swift': {
      // 流线雨燕修长机身
      geo = xform(sphere(10, 8, 0.56, 1.32, 0.78, 0.68), [0.05, 0.04, 0], [0, 0, -8 * DEG]);
      break;
    }
    case 'body.caterpillar': {
      // 三节嫩绿圆润毛毛虫体节
      const a = xform(sphere(10, 7, 0.56, 0.95, 0.92, 0.85), [0.16, 0.02, 0]);
      const b = xform(sphere(10, 7, 0.52, 0.95, 0.88, 0.82), [-0.32, -0.02, 0]);
      const c = xform(sphere(9, 6, 0.44, 0.95, 0.82, 0.78), [-0.72, -0.04, 0]);
      geo = merge([a, b, c], true);
      break;
    }
    case 'body.iron': {
      // 棱角分明的机械装甲躯干 + 顶背护板
      const hull = xform(new THREE.IcosahedronGeometry(0.78, 1), [0, 0, 0], [0, 0, 0], [1.08, 0.9, 0.86]);
      const plate = xform(box(0.85, 0.24, 0.74), [-0.04, 0.46, 0]);
      geo = merge([hull, plate], true);
      break;
    }
    default: {
      geo = fluff(sphere(11, 8, 0.72, 1, 0.92, 0.86), 0.03);
      break;
    }
  }
  return ensureSphericalUv(harden(geo));
}

/* ==========================================================================
 * 2. legs · 腿（6 款，原点在髋部，沿 -y 向下）
 * ========================================================================== */

function makeLeg(key: string): THREE.BufferGeometry {
  switch (key) {
    case 'legs.frog': {
      // 强壮 Z 字青蛙折腿 + 宽大青蛙蹼足
      const thigh = xform(cylY(0.085, 0.07, 0.34, 6), [-0.06, -0.02, 0], [0, 0, -36 * DEG]);
      const calf = xform(cylY(0.065, 0.045, 0.36, 6), [-0.16, -0.25, 0], [0, 0, 32 * DEG]);
      const web = xform(box(0.26, 0.04, 0.22), [0.06, -0.58, 0]);
      const t1 = xform(coneX(0.03, 0.14, 4), [0.16, -0.59, -0.09], [0, 16 * DEG, 0]);
      const t2 = xform(coneX(0.03, 0.16, 4), [0.18, -0.59, 0]);
      const t3 = xform(coneX(0.03, 0.14, 4), [0.16, -0.59, 0.09], [0, -16 * DEG, 0]);
      return merge([thigh, calf, web, t1, t2, t3]);
    }
    case 'legs.spring': {
      // 螺旋钢簧 + 金属减震底板
      const pts: THREE.Vector3[] = [];
      const turns = 4.5;
      for (let i = 0; i <= 34; i += 1) {
        const u = i / 34;
        const a = u * turns * Math.PI * 2;
        const r = 0.105 - 0.035 * u;
        pts.push(new THREE.Vector3(Math.cos(a) * r, -u * 0.56, Math.sin(a) * r));
      }
      const spring = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.032, 5, false);
      const foot = xform(box(0.2, 0.06, 0.15), [0.03, -0.58, 0]);
      return merge([spring, foot]);
    }
    case 'legs.ostrich': {
      // 超长纤细鸵鸟腿 + 双大脚趾
      const upper = cylY(0.055, 0.038, 0.42, 6);
      const knee = xform(sphere(6, 4, 0.055, 1, 1, 1), [0, -0.42, 0]);
      const lower = xform(cylY(0.038, 0.03, 0.42, 6), [0, -0.42, 0]);
      const foot = xform(box(0.22, 0.045, 0.12), [0.06, -0.84, 0]);
      const toeA = xform(coneX(0.028, 0.14, 4), [0.16, -0.85, -0.04]);
      const toeB = xform(coneX(0.028, 0.14, 4), [0.16, -0.85, 0.04]);
      return merge([upper, knee, lower, foot, toeA, toeB]);
    }
    case 'legs.elephant': {
      // 灰蓝粗壮大象柱腿 + 三颗圆脚趾
      const col = cylY(0.14, 0.16, 0.58, 8);
      const pad = xform(new THREE.CylinderGeometry(0.17, 0.19, 0.08, 8), [0.01, -0.58, 0]);
      const n1 = xform(box(0.06, 0.06, 0.06), [0.16, -0.59, -0.07]);
      const n2 = xform(box(0.06, 0.06, 0.06), [0.17, -0.59, 0]);
      const n3 = xform(box(0.06, 0.06, 0.06), [0.16, -0.59, 0.07]);
      return merge([col, pad, n1, n2, n3]);
    }
    case 'legs.eagle': {
      // 粗壮鹰腿 + 三根凶猛弯钩利爪
      const leg = cylY(0.065, 0.045, 0.52, 6);
      const base = xform(box(0.14, 0.05, 0.12), [0.02, -0.54, 0]);
      const claws: THREE.BufferGeometry[] = [];
      for (const [dz, yaw] of [
        [-0.08, 22 * DEG],
        [0, 0],
        [0.08, -22 * DEG],
      ] as const) {
        claws.push(xform(coneX(0.036, 0.22, 5), [0.08, -0.55, dz], [0, yaw, -18 * DEG]));
      }
      claws.push(xform(coneX(0.032, 0.16, 5), [-0.08, -0.55, 0], [0, Math.PI, -16 * DEG]));
      return merge([leg, base, ...claws]);
    }
    case 'legs.octopus': {
      // S 型卷曲章鱼触手 + 吸盘圆点
      const pts: THREE.Vector3[] = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-0.08, -0.2, 0.06),
        new THREE.Vector3(0.08, -0.42, 0.1),
        new THREE.Vector3(0.22, -0.56, 0.04),
        new THREE.Vector3(0.16, -0.62, -0.04),
      ];
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.065, 6, false);
      const suckers: THREE.BufferGeometry[] = [];
      for (let i = 1; i < pts.length; i += 1) {
        suckers.push(xform(sphere(5, 4, 0.032, 1, 1, 1), [pts[i].x, pts[i].y - 0.03, pts[i].z + 0.04]));
      }
      return merge([tube, ...suckers]);
    }
    default:
      return merge([cylY(0.045, 0.035, 0.58, 6), xform(box(0.16, 0.04, 0.1), [0.03, -0.6, 0])]);
  }
}

/* ==========================================================================
 * 3. wings · 侧肢（翼 / 臂，6 款，沿 +z 展开或向前伸出）
 * ========================================================================== */

function makeWing(key: string): THREE.BufferGeometry {
  switch (key) {
    case 'wings.dragonfly': {
      // 前后两片修长薄翼（蜻蜓经典双层翼）
      const root = xform(sphere(6, 4, 0.07, 1, 1, 1), [0, 0, 0.02]);
      const front = xform(box(0.22, 0.018, 1.05), [0.1, 0.05, 0.56], [0, 12 * DEG, 0]);
      const back = xform(box(0.18, 0.018, 0.92), [-0.14, -0.03, 0.48], [0, -14 * DEG, 0]);
      return merge([root, front, back]);
    }
    case 'wings.bat': {
      const verts = [
        0, 0, 0, 0, 0, 1.08, -0.5, -0.02, 0.72,
        0, 0, 0, -0.45, -0.02, 0.56, -0.42, -0.01, 0.36,
        0, 0, 0, -0.42, -0.01, 0.36, -0.18, 0, 0.08,
      ];
      const membrane = fan(verts, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
      const b1 = xform(cylZ(0.024, 0.024, 1.02, 4), [0, 0, 0]);
      const b2 = xform(cylZ(0.02, 0.02, 0.72, 4), [0, 0, 0.3], [0, 26 * DEG, 0]);
      return merge([membrane, b1, b2]);
    }
    case 'wings.crab': {
      // 鲜红粗壮臂 + 硕大 V 形大鳌钳（朝前 +x 伸出！）
      const arm = xform(cylX(0.07, 0.06, 0.42, 6), [0, 0, 0.14], [0, -24 * DEG, 0]);
      const palm = xform(sphere(8, 6, 0.18, 1.25, 0.85, 0.78), [0.44, 0.02, 0.24]);
      const upperJaw = xform(coneX(0.1, 0.36, 5), [0.54, 0.1, 0.24], [0, 0, 14 * DEG]);
      const lowerJaw = xform(coneX(0.08, 0.3, 5), [0.54, -0.09, 0.24], [0, 0, -22 * DEG]);
      return merge([arm, palm, upperJaw, lowerJaw]);
    }
    case 'wings.mantis': {
      // 折角翠绿双镰刀前肢
      const upper = xform(box(0.32, 0.08, 0.07), [0.16, 0.04, 0.16], [0, -18 * DEG, 12 * DEG]);
      const blade = xform(coneX(0.09, 0.56, 4), [0.3, -0.08, 0.2], [0, -10 * DEG, -38 * DEG]);
      const tooth1 = xform(coneX(0.03, 0.12, 3), [0.46, -0.22, 0.2], [0, 0, -90 * DEG]);
      const tooth2 = xform(coneX(0.03, 0.12, 3), [0.58, -0.32, 0.2], [0, 0, -90 * DEG]);
      return merge([upper, blade, tooth1, tooth2]);
    }
    case 'wings.jetpack': {
      // 机械推进翼 + 圆柱火箭喷口 + 尾焰锥
      const wing = xform(box(0.46, 0.06, 0.58), [-0.04, 0.04, 0.32], [-10 * DEG, -12 * DEG, 0]);
      const pod = xform(cylX(0.11, 0.13, 0.54, 8), [-0.36, 0.02, 0.26]);
      const nozzle = xform(cylX(0.14, 0.09, 0.16, 8), [-0.52, 0.02, 0.26]);
      return merge([wing, pod, nozzle]);
    }
    case 'wings.shield': {
      // 铆钉厚钢板双盾
      const door = xform(box(0.56, 0.62, 0.1), [0.18, 0, 0.28], [0, -16 * DEG, 0]);
      const bar = xform(box(0.6, 0.1, 0.13), [0.18, 0.14, 0.29], [0, -16 * DEG, 0]);
      const bar2 = xform(box(0.6, 0.1, 0.13), [0.18, -0.14, 0.29], [0, -16 * DEG, 0]);
      return merge([door, bar, bar2]);
    }
    default:
      return merge([xform(box(0.24, 0.03, 0.65), [0, 0, 0.34])]);
  }
}

/* ==========================================================================
 * 4. beak · 口部 / 嘴（6 款，沿 +x 向前）
 * ========================================================================== */

function makeBeak(key: string): THREE.BufferGeometry {
  switch (key) {
    case 'beak.woodpecker': {
      // 超长细尖啄木鸟钻喙
      return xform(coneX(0.085, 0.56, 6), [0.02, 0.01, 0]);
    }
    case 'beak.croc': {
      // 宽大锯齿鳄鱼上下颚
      const upper = xform(box(0.54, 0.13, 0.32), [0.24, 0.06, 0]);
      const lower = xform(box(0.48, 0.09, 0.28), [0.22, -0.08, 0], [0, 0, -10 * DEG]);
      const teeth: THREE.BufferGeometry[] = [];
      for (const x of [0.14, 0.28, 0.42]) {
        teeth.push(xform(new THREE.ConeGeometry(0.028, 0.09, 4), [x, -0.02, 0.13], [Math.PI, 0, 0]));
        teeth.push(xform(new THREE.ConeGeometry(0.028, 0.09, 4), [x, -0.02, -0.13], [Math.PI, 0, 0]));
      }
      return merge([upper, lower, ...teeth]);
    }
    case 'beak.chameleon': {
      // 粉红卷曲弹性变色龙长舌
      const pts: THREE.Vector3[] = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.22, -0.02, 0),
        new THREE.Vector3(0.4, 0.06, 0),
        new THREE.Vector3(0.44, -0.06, 0),
        new THREE.Vector3(0.32, -0.1, 0),
        new THREE.Vector3(0.34, -0.02, 0),
      ];
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 22, 0.045, 6, false);
      const tip = xform(sphere(6, 5, 0.07, 1, 1, 1), [0.35, -0.02, 0]);
      return merge([tube, tip]);
    }
    case 'beak.elephant': {
      // 魔性大象弯曲长鼻
      const pts: THREE.Vector3[] = [
        new THREE.Vector3(0, 0.04, 0),
        new THREE.Vector3(0.24, -0.04, 0),
        new THREE.Vector3(0.4, -0.26, 0),
        new THREE.Vector3(0.46, -0.46, 0),
        new THREE.Vector3(0.58, -0.4, 0),
      ];
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.09, 7, false);
    }
    case 'beak.chainsaw': {
      // 机械电锯：马达机箱 + 长锯板 + 一排金属锯齿
      const motor = xform(box(0.22, 0.22, 0.2), [0.1, 0, 0]);
      const bar = xform(box(0.46, 0.12, 0.05), [0.4, 0, 0]);
      const teeth: THREE.BufferGeometry[] = [];
      for (const x of [0.26, 0.36, 0.46, 0.56]) {
        teeth.push(xform(new THREE.ConeGeometry(0.032, 0.08, 3), [x, 0.09, 0]));
        teeth.push(xform(new THREE.ConeGeometry(0.032, 0.08, 3), [x, -0.09, 0], [Math.PI, 0, 0]));
      }
      return merge([motor, bar, ...teeth]);
    }
    case 'beak.cannon': {
      // 迷你小钢炮：粗炮管 + 炮口环
      const barrel = xform(cylX(0.11, 0.13, 0.44, 10), [0.02, 0, 0]);
      const muzzle = xform(cylX(0.15, 0.15, 0.08, 10), [0.42, 0, 0]);
      return merge([barrel, muzzle]);
    }
    default:
      return coneX(0.1, 0.28, 6);
  }
}

/* ==========================================================================
 * 5. tail · 尾部（6 款，原点在尾根，沿 -x 向后）
 * ========================================================================== */

function makeTail(key: string): THREE.BufferGeometry {
  switch (key) {
    case 'tail.scorpion': {
      // 高高翘起的经典蝎子弧形毒尾 + 弯钩毒针
      const pts: THREE.Vector3[] = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-0.34, 0.12, 0),
        new THREE.Vector3(-0.5, 0.52, 0),
        new THREE.Vector3(-0.26, 0.92, 0),
        new THREE.Vector3(0.08, 0.98, 0),
      ];
      const stem = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 22, 0.075, 6, false);
      const bulb = xform(sphere(7, 5, 0.11, 1.2, 0.9, 0.9), [0.14, 0.96, 0]);
      const stinger = xform(coneX(0.055, 0.24, 5), [0.22, 0.92, 0], [0, 0, -28 * DEG]);
      return merge([stem, bulb, stinger]);
    }
    case 'tail.ankylo': {
      // 粗壮骨锤大尾
      const shaft = xform(cylX(0.06, 0.1, 0.62, 6), [-0.62, 0, 0]);
      const club = xform(new THREE.IcosahedronGeometry(0.24, 0), [-0.72, 0.02, 0], [0, 0, 0], [1.2, 0.95, 1.1]);
      const s1 = xform(coneX(0.05, 0.16, 4), [-0.72, 0.2, 0], [0, 0, 90 * DEG]);
      const s2 = xform(coneX(0.05, 0.16, 4), [-0.72, 0, 0.22], [0, -90 * DEG, 0]);
      const s3 = xform(coneX(0.05, 0.16, 4), [-0.72, 0, -0.22], [0, 90 * DEG, 0]);
      return merge([shaft, club, s1, s2, s3]);
    }
    case 'tail.peacock': {
      // 华丽大孔雀开屏（7 片羽扇）
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 7; i += 1) {
        const ang = (-54 + i * 18) * DEG;
        const feather = xform(box(0.05, 0.78, 0.2), [-0.18, 0.36, 0], [ang, 0, 14 * DEG]);
        const eye = xform(sphere(6, 5, 0.09, 0.6, 1, 1), [-0.26, 0.68, 0], [ang, 0, 14 * DEG]);
        parts.push(feather, eye);
      }
      return merge(parts);
    }
    case 'tail.gecko': {
      const pts: THREE.Vector3[] = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-0.24, -0.02, 0.05),
        new THREE.Vector3(-0.5, 0.04, -0.04),
        new THREE.Vector3(-0.74, 0.08, 0.02),
      ];
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.085, 6, false);
    }
    case 'tail.propeller': {
      // 机械螺旋桨（绕 X 轴高速旋转）
      const hub = xform(cylX(0.08, 0.08, 0.26, 8), [-0.26, 0, 0]);
      const b1 = xform(box(0.04, 0.72, 0.14), [-0.28, 0, 0]);
      const b2 = xform(box(0.04, 0.14, 0.72), [-0.28, 0, 0]);
      return merge([hub, b1, b2]);
    }
    case 'tail.tesla': {
      // 特斯拉线圈电尾
      const rod = xform(cylY(0.05, 0.07, 0.56, 6), [-0.22, 0.56, 0]);
      const r1 = xform(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 10), [-0.22, 0.16, 0]);
      const r2 = xform(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 10), [-0.22, 0.32, 0]);
      const r3 = xform(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 10), [-0.22, 0.46, 0]);
      const orb = xform(sphere(8, 6, 0.13, 1, 1, 1), [-0.22, 0.62, 0]);
      return merge([rod, r1, r2, r3, orb]);
    }
    default:
      return xform(box(0.36, 0.06, 0.22), [-0.18, 0, 0]);
  }
}

/* ==========================================================================
 * 6. crest · 头顶器官 / 头饰（6 款，原点在头顶，沿 +y 向上）
 * ========================================================================== */

function makeCrest(key: string): THREE.BufferGeometry {
  switch (key) {
    case 'crest.rhino': {
      // 粗壮上弯犀牛独角（前移到额头位置！）
      const big = xform(new THREE.ConeGeometry(0.11, 0.48, 7), [0.22, 0.18, 0], [0, 0, -24 * DEG]);
      const small = xform(new THREE.ConeGeometry(0.065, 0.24, 6), [0.06, 0.1, 0], [0, 0, -14 * DEG]);
      return merge([big, small]);
    }
    case 'crest.deer': {
      // 对称树枝大鹿角
      const parts: THREE.BufferGeometry[] = [];
      for (const s of [-1, 1] as const) {
        parts.push(xform(cylY(0.036, 0.048, 0.46, 5), [0, 0.42, s * 0.18], [s * 24 * DEG, 0, -8 * DEG]));
        parts.push(xform(cylY(0.026, 0.034, 0.26, 5), [0.08, 0.42, s * 0.26], [s * 42 * DEG, 0, -28 * DEG]));
        parts.push(xform(cylY(0.024, 0.03, 0.24, 5), [-0.06, 0.5, s * 0.28], [s * 12 * DEG, 0, 24 * DEG]));
      }
      return merge(parts);
    }
    case 'crest.rabbit': {
      // 软萌一对大长兔耳
      const earL = xform(sphere(8, 6, 0.1, 0.72, 3.1, 0.46), [-0.02, 0.28, -0.14], [-14 * DEG, 0, 12 * DEG]);
      const earR = xform(sphere(8, 6, 0.1, 0.72, 3.1, 0.46), [-0.02, 0.28, 0.14], [14 * DEG, 0, 12 * DEG]);
      return merge([earL, earR]);
    }
    case 'crest.angler': {
      // 深海灯笼鱼弯钓竿 + 发光灯球垂在鸡眼前方
      const pts: THREE.Vector3[] = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.08, 0.34, 0),
        new THREE.Vector3(0.38, 0.42, 0),
        new THREE.Vector3(0.54, 0.18, 0),
      ];
      const rod = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.024, 5, false);
      const bulb = xform(sphere(8, 6, 0.11, 1, 1, 1), [0.54, 0.14, 0]);
      return merge([rod, bulb]);
    }
    case 'crest.crown': {
      const ring = new THREE.CylinderGeometry(0.2, 0.18, 0.13, 8, 1, false);
      ring.translate(0, 0.07, 0);
      const spikes: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2;
        spikes.push(
          xform(new THREE.ConeGeometry(0.045, 0.16, 4), [Math.cos(a) * 0.16, 0.2, Math.sin(a) * 0.16]),
        );
      }
      return merge([ring, ...spikes]);
    }
    case 'crest.radar': {
      // 迷你旋转雷达锅
      const base = xform(new THREE.CylinderGeometry(0.06, 0.08, 0.14, 6), [0, 0.07, 0]);
      const dish = xform(new THREE.ConeGeometry(0.26, 0.12, 10), [0.06, 0.26, 0], [0, 0, -58 * DEG]);
      const needle = xform(cylX(0.018, 0.018, 0.2, 5), [0.1, 0.28, 0], [0, 0, 30 * DEG]);
      return merge([base, dish, needle]);
    }
    default:
      return xform(new THREE.ConeGeometry(0.07, 0.26, 5), [0, 0.12, 0]);
  }
}

function buildRight(key: string): THREE.BufferGeometry {
  const slot = (key.split('.')[0] ?? '') as SlotKey;
  let geo: THREE.BufferGeometry;
  switch (slot) {
    case 'body':
      return makeBody(key);
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
      geo = new THREE.IcosahedronGeometry(0.2, 0);
      break;
  }
  return harden(geo);
}

function mirrorZ(base: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = base.clone();
  const pos = geo.attributes.position;
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

export function makeOutlineGeometry(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const clean = geo.clone();
  for (const name of Object.keys(clean.attributes)) {
    if (name !== 'position' && name !== 'normal') clean.deleteAttribute(name);
  }
  const welded = mergeVertices(clean, 1e-4);
  clean.dispose();
  welded.computeVertexNormals();
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const minRadius = bb
    ? Math.min(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) / 2
    : 0.1;
  const w = Math.min(0.022, Math.max(0.008, 0.25 * minRadius));
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

/* ==========================================================================
 * 裸鸡基础骨架几何（固定鸡头 + 眼睛作为视觉锚点，P-011）
 * ========================================================================== */

export function chickBodyGeometry(): THREE.BufferGeometry {
  const g = sphere(10, 7, 1, 1, 1, 1);
  xform(g, [0, 0, 0], [0, 0, 0], [0.46, 0.48, 0.42]);
  return harden(fluff(g, 0.05));
}

export function chickHeadGeometry(): THREE.BufferGeometry {
  return harden(sphere(12, 8, 1, 0.42, 0.4, 0.38));
}

export function chickEyeGeometry(): THREE.BufferGeometry {
  return new THREE.SphereGeometry(0.078, 8, 6);
}

export function chickGlintGeometry(): THREE.BufferGeometry {
  return new THREE.SphereGeometry(0.028, 4, 3);
}

export function chickNeckGeometry(): THREE.BufferGeometry {
  return harden(sphere(8, 6, 1, 0.24, 0.36, 0.22));
}

export function chickTailStumpGeometry(): THREE.BufferGeometry {
  return xform(new THREE.ConeGeometry(0.16, 0.14, 8), [0, 0, 0], [0, 0, Math.PI / 2]);
}

export function chickBaseLegGeometry(): THREE.BufferGeometry {
  return merge([
    cylY(0.036, 0.028, 0.56, 5),
    xform(box(0.14, 0.036, 0.09), [0.03, -0.57, 0]),
    xform(coneX(0.022, 0.07, 4), [0.1, -0.58, -0.04]),
    xform(coneX(0.022, 0.07, 4), [0.1, -0.58, 0.04]),
  ]);
}

export function chickBaseBeakGeometry(): THREE.BufferGeometry {
  return coneX(0.09, 0.19, 5);
}
