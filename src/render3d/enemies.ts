/**
 * 第 1 关 3D 敌人模型工厂：单细胞生物（变形虫 / 草履虫）+ 小动物（小刺猬 / 小青蛙）+ 大怪 BOSS（巨型青蛙王）
 * ---------------------------------------------------------------
 * 纯程序化低多边形 3D 造型，每类怪物都有鲜活独立的轮廓、材质和生态运动动画（P-038）。
 */

import * as THREE from 'three';
import type { EnemyKind } from '../core';
import { makeOutlineGeometry } from './geometry';
import { createBlobShadow, outlineMaterial, toonMaterial } from './materials';

function addOutlined(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  pos: [number, number, number] = [0, 0, 0],
  rot: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  const hull = new THREE.Mesh(makeOutlineGeometry(geo), outlineMaterial());
  hull.position.copy(mesh.position);
  hull.rotation.copy(mesh.rotation);
  hull.renderOrder = 1;
  parent.add(mesh, hull);
  return mesh;
}

export class EnemyModel3D {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly shadow: THREE.Mesh;
  readonly kind: EnemyKind;
  readonly isBoss: boolean;

  private readonly animParts: THREE.Object3D[] = [];
  private auraRing: THREE.Mesh | null = null;
  private worldX = 0;
  private worldY = 0;
  private worldZ = 0;
  private facing: 1 | -1 = -1;
  private currentYaw = Math.PI;
  private lunge = 0;
  private moving = false;
  private down = 0;
  private downTarget = 0;
  private hitAt = -10;

  constructor(kind: EnemyKind) {
    this.kind = kind;
    this.isBoss = kind === 'boss_frog_king';
    this.root.add(this.body);

    const shadowSize = this.isBoss ? 2.6 : kind === 'amoeba' || kind === 'paramecium' ? 1.35 : 1.5;
    this.shadow = createBlobShadow(shadowSize);

    if (kind === 'amoeba') this.buildAmoeba();
    else if (kind === 'paramecium') this.buildParamecium();
    else if (kind === 'hedgehog_mob') this.buildHedgehog();
    else if (kind === 'frog_mob') this.buildFrog(1.0, false);
    else this.buildFrog(1.62, true);
  }

  /** 单细胞 · 绿藻变形虫：半透明果冻伪足 + 内部悬浮深绿细胞核 */
  private buildAmoeba(): void {
    const gelMat = toonMaterial({ color: 0x56e8a8, transparent: true, opacity: 0.78 });
    const coreGeo = new THREE.IcosahedronGeometry(0.56, 1);
    const core = new THREE.Mesh(coreGeo, gelMat);
    core.scale.set(1.2, 0.75, 1.0);
    core.position.set(0, 0.56, 0);
    this.body.add(core);
    this.animParts.push(core);

    // 4 根蠕动伪足
    const pseudoOffsets: Array<[number, number, number]> = [
      [0.52, 0.32, 0.24],
      [0.44, 0.3, -0.3],
      [-0.5, 0.34, 0.22],
      [-0.42, 0.32, -0.26],
    ];
    for (const [px, py, pz] of pseudoOffsets) {
      const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), gelMat);
      lobe.position.set(px, py, pz);
      lobe.userData.baseX = px;
      lobe.userData.baseZ = pz;
      this.body.add(lobe);
      this.animParts.push(lobe);
    }

    // 内部深绿细胞核 + 小液泡
    const nucleus = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 6),
      toonMaterial({ color: 0x177049 }),
    );
    nucleus.position.set(0.05, 0.58, 0);
    const vac = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xd9fff0 }),
    );
    vac.position.set(-0.22, 0.64, 0.14);
    this.body.add(nucleus, vac);
  }

  /** 单细胞 · 纤毛草履虫：淡蓝草鞋形透明体 + 紫核 + 一圈晃动纤毛 */
  private buildParamecium(): void {
    const cellMat = toonMaterial({ color: 0x62d8f5, transparent: true, opacity: 0.82 });
    const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.72, 6, 10), cellMat);
    shoe.rotation.z = Math.PI / 2;
    shoe.position.set(0, 0.68, 0);
    this.body.add(shoe);

    const nucleus = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      toonMaterial({ color: 0x8c4fd6 }),
    );
    nucleus.position.set(0.1, 0.68, 0);
    const star = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.1, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    star.position.set(-0.28, 0.72, 0.08);
    this.body.add(nucleus, star);

    // 周边一圈小纤毛
    const ciliaMat = new THREE.MeshBasicMaterial({ color: 0xe6fbff });
    const ciliaGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.2, 4);
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      const c = new THREE.Mesh(ciliaGeo, ciliaMat);
      c.position.set(Math.cos(a) * 0.58, 0.68 + Math.sin(a) * 0.34, (i % 2 ? 0.12 : -0.12));
      c.rotation.z = a - Math.PI / 2;
      this.body.add(c);
      this.animParts.push(c);
    }
  }

  /** 小动物 · 菜园小刺猬：圆棕身躯 + 尖鼻 + 满背浅色锥刺 */
  private buildHedgehog(): void {
    const bodyMat = toonMaterial({ color: 0x8b5a3c });
    const faceMat = toonMaterial({ color: 0xebd1b0 });
    const spineMat = toonMaterial({ color: 0xf4e3be });

    const torsoGeo = new THREE.SphereGeometry(0.54, 10, 8);
    torsoGeo.scale(1.18, 0.88, 0.92);
    addOutlined(this.body, torsoGeo, bodyMat, [0, 0.54, 0]);

    const snoutGeo = new THREE.ConeGeometry(0.22, 0.42, 6);
    snoutGeo.rotateZ(-Math.PI / 2);
    addOutlined(this.body, snoutGeo, faceMat, [0.64, 0.42, 0]);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: 0x241b16 }));
    nose.position.set(0.84, 0.42, 0);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x241b16 });
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), eyeMat);
    e1.position.set(0.54, 0.56, 0.22);
    const e2 = e1.clone();
    e2.position.z = -0.22;
    this.body.add(nose, e1, e2);

    // 放射硬刺
    const spikeGeo = new THREE.ConeGeometry(0.075, 0.34, 4);
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      const elev = i % 2 === 0 ? 0.45 : 1.05;
      const dir = new THREE.Vector3(
        Math.cos(a) * Math.cos(elev) - 0.2,
        Math.sin(elev),
        Math.sin(a) * Math.cos(elev),
      ).normalize();
      const s = new THREE.Mesh(spikeGeo, spineMat);
      s.position.set(dir.x * 0.58 - 0.08, 0.54 + dir.y * 0.52, dir.z * 0.5);
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this.body.add(s);
    }
  }

  /** 小动物/BOSS · 弹跳小青蛙 & 巨型弹跳青蛙王（BOSS 戴黄金王冠 + 气场环！） */
  private buildFrog(scale: number, isBoss: boolean): void {
    const frogMat = toonMaterial({ color: isBoss ? 0x2d9c52 : 0x45c45e });
    const bellyMat = toonMaterial({ color: isBoss ? 0xe8f59d : 0xd5ffad });

    const torsoGeo = new THREE.SphereGeometry(0.58, 12, 8);
    torsoGeo.scale(1.18, 0.78, 1.02);
    addOutlined(this.body, torsoGeo, frogMat, [0, 0.58, 0]);

    const bellyGeo = new THREE.SphereGeometry(0.46, 10, 6);
    bellyGeo.scale(1.05, 0.65, 0.9);
    const belly = new THREE.Mesh(bellyGeo, bellyMat);
    belly.position.set(0.14, 0.44, 0);
    this.body.add(belly);

    // 头顶一对标志大凸眼
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: isBoss ? 0xc92626 : 0x1a1a1a });
    for (const sz of [-0.26, 0.26]) {
      const bulge = addOutlined(this.body, new THREE.SphereGeometry(0.18, 8, 6), frogMat, [0.34, 0.98, sz]);
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), eyeWhiteMat);
      white.position.set(0.43, 1.0, sz);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), pupilMat);
      pupil.position.set(0.52, 1.0, sz);
      this.body.add(white, pupil);
      void bulge;
    }

    // 折叠强壮后腿
    const legGeo = new THREE.BoxGeometry(0.46, 0.2, 0.24);
    for (const sz of [-0.52, 0.52]) {
      const leg = addOutlined(this.body, legGeo, frogMat, [-0.14, 0.26, sz], [0, 0, -0.22]);
      this.animParts.push(leg);
    }

    // BOSS 专属黄金王冠 + 脚底金色威压光环
    if (isBoss) {
      const crownMat = toonMaterial({ color: 0xffd038 });
      const ring = new THREE.CylinderGeometry(0.24, 0.2, 0.16, 8);
      addOutlined(this.body, ring, crownMat, [0.1, 1.24, 0]);
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2;
        addOutlined(
          this.body,
          new THREE.ConeGeometry(0.06, 0.2, 4),
          crownMat,
          [0.1 + Math.cos(a) * 0.18, 1.4, Math.sin(a) * 0.18],
        );
      }
      const aura = new THREE.Mesh(
        new THREE.RingGeometry(1.1, 1.35, 32),
        new THREE.MeshBasicMaterial({ color: 0xffc83d, side: THREE.DoubleSide, transparent: true, opacity: 0.72 }),
      );
      aura.rotation.x = -Math.PI / 2;
      aura.position.y = 0.03;
      this.auraRing = aura;
      this.root.add(aura);
    }

    this.body.scale.setScalar(scale);
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

  getHeadWorld(out: THREE.Vector3): THREE.Vector3 {
    const h = this.isBoss ? 2.4 : this.kind === 'amoeba' || this.kind === 'paramecium' ? 1.2 : 1.45;
    return out.set(this.worldX + this.lunge, this.worldY + h, this.worldZ);
  }

  update(dt: number, now: number): void {
    const age = now - this.hitAt;
    const punch = age >= 0 && age < 0.4 ? 1 + 0.14 * Math.exp(-12 * age) : 1;
    const shake = age >= 0 && age < 0.4 ? 0.08 * Math.exp(-9 * age) * Math.sin(54 * age) : 0;

    this.down += (this.downTarget - this.down) * Math.min(1, dt * 8);
    const targetYaw = this.facing === 1 ? 0 : Math.PI;
    let diff = targetYaw - this.currentYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.currentYaw += diff * Math.min(1, dt * 14);

    if (this.kind === 'amoeba') {
      const pulse = 1 + 0.1 * Math.sin(now * 4.5);
      this.body.scale.set(pulse * punch, (2 - pulse) * punch, pulse * punch);
      for (let i = 1; i < this.animParts.length; i += 1) {
        const lobe = this.animParts[i];
        lobe.position.x = (lobe.userData.baseX as number) + Math.sin(now * 5 + i * 1.5) * 0.1;
      }
    } else if (this.kind === 'paramecium') {
      this.body.position.y = 0.08 * Math.sin(now * 5.2);
      this.body.scale.setScalar(punch);
      for (let i = 0; i < this.animParts.length; i += 1) {
        this.animParts[i].rotation.x = Math.sin(now * 14 + i) * 0.4;
      }
    } else if (this.kind === 'hedgehog_mob') {
      const bob = this.moving ? Math.abs(Math.sin(now * 10)) * 0.1 : 0;
      this.body.position.y = bob;
      this.body.scale.setScalar(punch);
    } else {
      const base = this.isBoss ? 1.62 : 1.0;
      const breath = 1 + 0.04 * Math.sin(now * 3.4);
      this.body.scale.set(base * punch, base * breath * punch, base * punch);
    }

    this.root.position.set(this.worldX + this.lunge + shake, this.worldY, this.worldZ);
    this.root.rotation.y = this.currentYaw;
    this.root.rotation.z = -1.3 * this.down;

    if (this.auraRing) {
      this.auraRing.position.y = 0.03 - this.worldY;
      this.auraRing.rotation.z = now * 1.4;
    }

    this.shadow.position.set(this.worldX + this.lunge, 0.014, this.worldZ);
    const hFactor = Math.max(0.28, 1 - this.worldY / 3.5);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.42 * hFactor;
    this.shadow.scale.set(hFactor, 1, hFactor);
  }

  dispose(): void {
    this.shadow.geometry.dispose();
    (this.shadow.material as THREE.Material).dispose();
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
  }
}
