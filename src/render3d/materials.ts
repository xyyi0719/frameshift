/**
 * 卡通材质与反向法线描边（B 负责）。
 * ---------------------------------------------------------------
 * 色板 / 三阶色阶 / 灯光的数值来自 docs/RIG3D.md §5–§6。
 */

import * as THREE from 'three';

export type MaterialKind = 'skin' | 'metal' | 'feather' | 'bone';

export const PALETTE: Record<MaterialKind, number> = {
  feather: 0xffd24a,
  bone: 0xf1dcb0,
  metal: 0xa9bccd,
  skin: 0xf2b9a0,
};

export const OUTLINE = 0x2e2119;
export const ACCENT = 0x5fe3c8;

let gradientTexture: THREE.DataTexture | null = null;

function getGradientMap(): THREE.DataTexture {
  if (gradientTexture) return gradientTexture;
  const bands = new Uint8Array([
    128, 128, 128, 255,
    192, 192, 192, 255,
    255, 255, 255, 255,
  ]);
  const tex = new THREE.DataTexture(bands, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  gradientTexture = tex;
  return tex;
}

const toonCache = new Map<string, THREE.MeshToonMaterial>();

export interface ToonOptions {
  color: number;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
}

export function toonMaterial(opts: ToonOptions): THREE.MeshToonMaterial {
  const key = `${opts.color}:${opts.side ?? THREE.FrontSide}:${opts.transparent ? 1 : 0}:${opts.opacity ?? 1}`;
  const hit = toonCache.get(key);
  if (hit) return hit;
  const mat = new THREE.MeshToonMaterial({
    color: opts.color,
    gradientMap: getGradientMap(),
    side: opts.side ?? THREE.FrontSide,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
  toonCache.set(key, mat);
  return mat;
}

export function materialForKind(kind: MaterialKind, opts?: { doubleSide?: boolean; tint?: number }): THREE.MeshToonMaterial {
  return toonMaterial({
    color: opts?.tint ?? PALETTE[kind],
    side: opts?.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
}

let outlineMat: THREE.MeshBasicMaterial | null = null;
export function outlineMaterial(): THREE.MeshBasicMaterial {
  if (!outlineMat) {
    outlineMat = new THREE.MeshBasicMaterial({
      color: OUTLINE,
      side: THREE.BackSide,
      depthWrite: true,
    });
  }
  return outlineMat;
}

/** 贴地 blob 阴影贴图（64×64 径向渐变，RIG §6.3）。 */
let blobTexture: THREE.CanvasTexture | null = null;
export function getBlobShadowTexture(): THREE.CanvasTexture {
  if (blobTexture) return blobTexture;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.65, 'rgba(0,0,0,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  blobTexture = tex;
  return tex;
}

export function createBlobShadow(size = 1.55): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    map: getBlobShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.38,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.78), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012;
  mesh.renderOrder = 1;
  return mesh;
}

let glowTexture: THREE.CanvasTexture | null = null;
export function getGlowSpriteTexture(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.22, 'rgba(95,227,200,0.9)');
    g.addColorStop(0.6, 'rgba(95,227,200,0.25)');
    g.addColorStop(1, 'rgba(95,227,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  glowTexture = tex;
  return tex;
}

export function disposeMaterialCache(): void {
  for (const mat of toonCache.values()) mat.dispose();
  toonCache.clear();
  outlineMat?.dispose();
  outlineMat = null;
  gradientTexture?.dispose();
  gradientTexture = null;
  blobTexture?.dispose();
  blobTexture = null;
  glowTexture?.dispose();
  glowTexture = null;
}
