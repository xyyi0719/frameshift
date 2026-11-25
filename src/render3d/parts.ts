/**
 * 零件 3D 渲染与视觉进阶系统（P-022, P-025, P-026）
 * ---------------------------------------------------------------
 * - 躯干 `body`：1~3 种融合件共用单一轮廓，实时绘制 1 / 1/2 / 1/3 拼色纹样贴图；
 * - 其余部位：鲜明独立主色 + 清晰描边壳；
 * - 2 阶 / 3 阶：体量微涨 + 亮度/强调色进阶 + 专属 3D 环绕/升腾粒子光效；
 * - 专属动画：螺旋桨尾旋转、雷达锅扫描、腿部迈步、翅膀扇动、铁门举盾。
 */

import * as THREE from 'three';
import type { PartDef, PartInstance, PlacedPart } from '../core';
import { partGeometry } from './geometry';
import {
  createBodyFusionTexture,
  getGlowSpriteTexture,
  getGradientMap,
  levelTintHex,
  outlineMaterial,
  toonMaterial,
} from './materials';

const DEG = Math.PI / 180;

interface PartVisual {
  readonly placement: PlacedPart;
  readonly def: PartDef;
  readonly index: number;
  readonly holder: THREE.Group;
  readonly mesh: THREE.Mesh;
  readonly hull: THREE.Mesh;
  readonly ownedMaterial?: THREE.Material;
  readonly ownedTexture?: THREE.Texture;
  readonly particles: THREE.Sprite[];
}

function indexOfInstance(instanceKey: string): number {
  const m = /#(\d+)$/.exec(instanceKey);
  return m ? Number(m[1]) : 0;
}

export class PartBatches {
  readonly group = new THREE.Group();
  private visuals: PartVisual[] = [];
  private readonly spawnAt = new Map<string, number>();

  constructor() {
    this.group.name = 'part-visuals';
  }

  sync(
    placements: readonly PlacedPart[],
    byId: Readonly<Record<string, PartDef>>,
    now: number,
    bodyInstances: readonly PartInstance[] = [],
  ): void {
    this.clearVisuals();
    const alive = new Set<string>();

    for (const placement of placements) {
      const def = byId[placement.defId];
      if (!def) continue;
      alive.add(placement.instanceKey);
      if (!this.spawnAt.has(placement.instanceKey)) {
        this.spawnAt.set(placement.instanceKey, now);
      }

      const entry = partGeometry(def.art.geometry, placement.side);
      const holder = new THREE.Group();
      let mat: THREE.Material;
      let ownedMaterial: THREE.Material | undefined;
      let ownedTexture: THREE.Texture | undefined;

      if (placement.slot === 'body') {
        const defs = bodyInstances
          .map((inst) => byId[inst.defId])
          .filter((d): d is PartDef => Boolean(d));
        const levels = bodyInstances.map((inst) => inst.level);
        const tex = createBodyFusionTexture(defs.length > 0 ? defs : [def], levels.length > 0 ? levels : [placement.level]);
        const bodyMat = new THREE.MeshToonMaterial({
          color: 0xffffff,
          map: tex,
          gradientMap: getGradientMap(),
          side: THREE.FrontSide,
        });
        mat = bodyMat;
        ownedMaterial = bodyMat;
        ownedTexture = tex;
      } else {
        const tinted = levelTintHex(def.art.color, def.art.accentColor, placement.level);
        const doubleSide = placement.slot === 'wings' || placement.slot === 'tail';
        mat = toonMaterial({
          color: tinted,
          side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
        });
      }

      const mesh = new THREE.Mesh(entry.geo, mat);
      const hull = new THREE.Mesh(entry.outline, outlineMaterial());
      hull.renderOrder = 1;
      holder.add(mesh, hull);

      // 2 阶 / 3 阶视觉粒子特效（P-022, P-025, P-026）
      const particles: THREE.Sprite[] = [];
      const particleCount = placement.level >= 3 ? 6 : placement.level === 2 ? 3 : 0;
      if (particleCount > 0) {
        const pColor = placement.level >= 3 ? 0xffe875 : def.art.accentColor;
        for (let p = 0; p < particleCount; p += 1) {
          const smat = new THREE.SpriteMaterial({
            map: getGlowSpriteTexture(),
            color: p % 2 === 0 ? pColor : def.art.accentColor,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            opacity: placement.level >= 3 ? 0.9 : 0.65,
          });
          const sprite = new THREE.Sprite(smat);
          const sz = placement.level >= 3 ? 0.24 : 0.16;
          sprite.scale.set(sz, sz, sz);
          holder.add(sprite);
          particles.push(sprite);
        }
      }

      this.group.add(holder);
      this.visuals.push({
        placement,
        def,
        index: indexOfInstance(placement.instanceKey),
        holder,
        mesh,
        hull,
        ownedMaterial,
        ownedTexture,
        particles,
      });
    }

    for (const key of [...this.spawnAt.keys()]) {
      if (!alive.has(key)) this.spawnAt.delete(key);
    }
    this.update(now, false, false, false);
  }

  update(t: number, battle: boolean, moving: boolean, airborne = false): void {
    for (const vis of this.visuals) {
      const { placement, def, index, holder, particles } = vis;
      const born = this.spawnAt.get(placement.instanceKey) ?? -10;
      const age = Math.max(0, t - born);
      const spawnU = Math.min(1, age / 0.18);
      const spawnEase = 1 - Math.pow(1 - spawnU, 3);

      const [rx, ry, rz] = placement.rotation;
      holder.rotation.set(rx * DEG, ry * DEG, rz * DEG);

      let lx = 0;
      let ly = 0;
      let lz = 0;

      if (def.slot === 'legs') {
        const phase = 0.5 * index;
        const amp = airborne ? 8 : moving ? (battle ? 26 : 22) : 4;
        lz = amp * DEG * Math.sin(Math.PI * 2 * (t / 0.55 - phase));
      } else if (def.slot === 'wings') {
        const isArm = def.tags.includes('arm') || def.tags.includes('shield');
        if (isArm) {
          lz = (moving || battle ? 14 : 5) * DEG * Math.sin(t * 5.5 + index * Math.PI);
        } else {
          const tw = airborne ? 0.18 : battle ? 0.28 : 0.52;
          const amp = airborne ? 34 : battle ? 24 : moving ? 16 : 9;
          const flap = -(8 + amp * Math.sin((Math.PI * 2 * t) / tw)) * DEG;
          lx = placement.side === 'L' ? -flap : flap;
        }
      } else if (def.slot === 'tail') {
        if (def.id === 'tail.propeller') {
          lx = (t * (battle || moving ? 22 : 10)) % (Math.PI * 2);
        } else {
          ly = 7 * DEG * Math.sin((Math.PI * 2 * t) / 2.2 + index * 0.3);
        }
      } else if (def.slot === 'crest') {
        if (def.id === 'crest.radar') {
          ly = (t * 3.2) % (Math.PI * 2);
        } else if (def.id === 'crest.rabbit') {
          lz = 6 * DEG * Math.sin((Math.PI * 2 * t) / 1.4);
        } else {
          lz = 2 * DEG * Math.sin((Math.PI * 2 * t) / 2.2);
        }
      } else if (def.slot === 'beak') {
        lz = (battle ? 4 : 1.5) * DEG * Math.sin((Math.PI * 2 * t) / 2.8);
      }

      if (spawnU < 1) {
        lz += -0.65 * (1 - spawnEase);
      }

      holder.rotation.x += lx;
      holder.rotation.y += ly;
      holder.rotation.z += lz;

      const pop = spawnU < 1 ? 0.55 + 0.45 * spawnEase : 1;
      const pulse = placement.level >= 3 ? 1 + 0.03 * Math.sin(t * 6) : 1;
      holder.scale.setScalar(placement.scale * pop * pulse);

      const away = 1 - spawnEase;
      const sy = spawnU < 1 ? 0.35 * away : 0;
      holder.position.set(
        placement.position[0],
        placement.position[1] + sy,
        placement.position[2],
      );

      // 更新 2 阶 / 3 阶环绕与升腾粒子
      if (particles.length > 0) {
        const radius = placement.slot === 'body' ? 0.85 : 0.36;
        for (let i = 0; i < particles.length; i += 1) {
          const sp = particles[i];
          const ang = t * (placement.level >= 3 ? 3.2 : 2.1) + (i / particles.length) * Math.PI * 2;
          const rise = placement.level >= 3 ? ((t * 0.7 + i * 0.25) % 1) * 0.55 - 0.15 : Math.sin(ang * 2) * 0.12;
          sp.position.set(Math.cos(ang) * radius, rise, Math.sin(ang) * radius);
          const smat = sp.material as THREE.SpriteMaterial;
          smat.opacity = placement.level >= 3 ? 0.45 + 0.5 * Math.abs(Math.sin(t * 5 + i)) : 0.4 + 0.3 * Math.sin(t * 3 + i);
        }
      }
    }
  }

  private clearVisuals(): void {
    for (const vis of this.visuals) {
      this.group.remove(vis.holder);
      vis.ownedMaterial?.dispose();
      vis.ownedTexture?.dispose();
      for (const sp of vis.particles) {
        (sp.material as THREE.Material).dispose();
      }
    }
    this.visuals = [];
  }

  dispose(): void {
    this.clearVisuals();
    this.spawnAt.clear();
  }
}
