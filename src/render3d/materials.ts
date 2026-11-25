/**
 * 卡通材质、反向法线描边、躯干 1 / 1/2 / 1/3 动态拼色贴图与升阶调色（P-022, P-025）
 */

import * as THREE from 'three';
import type { PartDef, PatternKind } from '../core';

export type MaterialKind = 'skin' | 'metal' | 'feather' | 'bone';

export const PALETTE: Record<MaterialKind, number> = {
  feather: 0xffd24a,
  bone: 0xf1dcb0,
  metal: 0xa9bccd,
  skin: 0xf2b9a0,
};

export const OUTLINE = 0x2a1d16;
export const ACCENT = 0x5fe3c8;

let gradientTexture: THREE.DataTexture | null = null;

export function getGradientMap(): THREE.DataTexture {
  if (gradientTexture) return gradientTexture;
  const bands = new Uint8Array([
    132, 132, 132, 255,
    200, 200, 200, 255,
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

/** 1→2→3 阶视觉调色（P-022）：2 阶更亮更鲜艳，3 阶融入亮金/强调色呈现觉醒质感。 */
export function levelTintHex(baseHex: number, accentHex: number, level: 1 | 2 | 3): number {
  if (level <= 1) return baseHex;
  const c = new THREE.Color(baseHex);
  const acc = new THREE.Color(accentHex);
  if (level === 2) {
    c.lerp(acc, 0.22);
    c.offsetHSL(0, 0.08, 0.06);
  } else {
    c.lerp(acc, 0.35);
    c.lerp(new THREE.Color(0xfff1a8), 0.16);
    c.offsetHSL(0, 0.12, 0.08);
  }
  return c.getHex();
}

function hexCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function drawPattern(
  ctx: CanvasRenderingContext2D,
  pattern: PatternKind,
  x0: number,
  w: number,
  h: number,
  baseHex: number,
  accentHex: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 0, w, h);
  ctx.clip();

  ctx.fillStyle = hexCss(baseHex);
  ctx.fillRect(x0, 0, w, h);

  const acc = hexCss(accentHex);
  if (pattern === 'turtle') {
    // 乌龟六边形甲壳纹
    ctx.strokeStyle = acc;
    ctx.lineWidth = 3;
    const step = 28;
    for (let y = -step; y < h + step; y += step * 0.85) {
      const row = Math.round(y / (step * 0.85));
      for (let x = x0 - step; x < x0 + w + step; x += step) {
        const cx = x + (row % 2 ? step / 2 : 0);
        const cy = y;
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
          const px = cx + Math.cos(a) * 13;
          const py = cy + Math.sin(a) * 13;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
  } else if (pattern === 'hedgehog') {
    // 刺猬斜排针刺纹
    ctx.fillStyle = acc;
    for (let y = 10; y < h; y += 18) {
      for (let x = x0 + 6; x < x0 + w; x += 18) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 9, y - 4);
        ctx.lineTo(x + 4, y + 6);
        ctx.closePath();
        ctx.fill();
      }
    }
  } else if (pattern === 'puffer') {
    // 河豚活泼圆斑点
    ctx.fillStyle = acc;
    for (let y = 14; y < h; y += 26) {
      const shift = (Math.floor(y / 26) % 2) * 14;
      for (let x = x0 + 10 + shift; x < x0 + w + 14; x += 28) {
        ctx.beginPath();
        ctx.arc(x, y, 6.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (pattern === 'swift') {
    // 雨燕流线羽翼折纹
    ctx.strokeStyle = acc;
    ctx.lineWidth = 3;
    for (let y = 12; y < h; y += 22) {
      ctx.beginPath();
      for (let x = x0 - 10; x < x0 + w + 20; x += 24) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + 12, y - 7);
        ctx.lineTo(x + 24, y);
      }
      ctx.stroke();
    }
  } else if (pattern === 'caterpillar') {
    // 毛毛虫鲜明环纹
    ctx.fillStyle = acc;
    for (let x = x0 + 8; x < x0 + w; x += 26) {
      ctx.fillRect(x, 0, 8, h);
    }
  } else if (pattern === 'iron') {
    // 机械钢板铆钉 + 警示条纹
    ctx.strokeStyle = 'rgba(25, 36, 48, 0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x0 + 4, 4, w - 8, h - 8);
    ctx.fillStyle = acc;
    for (let x = x0 + 12; x < x0 + w - 8; x += 24) {
      ctx.beginPath();
      ctx.arc(x, 16, 3.5, 0, Math.PI * 2);
      ctx.arc(x, h - 16, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.65;
    ctx.fillRect(x0, h * 0.45, w, 10);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/**
 * 动态生成躯干 1 / 1/2 / 1/3 表面分区拼色 + 纹样贴图（P-025, P-026）。
 * 1 件：全色 + 专属图案；2 件：1/2 左右拼色；3 件：1/3 三色拼接。
 */
export function createBodyFusionTexture(
  bodyDefs: readonly PartDef[],
  levels: readonly (1 | 2 | 3)[],
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx && bodyDefs.length > 0) {
    const count = Math.min(3, bodyDefs.length);
    const sliceW = c.width / count;
    for (let i = 0; i < count; i += 1) {
      const def = bodyDefs[i];
      const lv = levels[i] ?? 1;
      const mainColor = levelTintHex(def.art.color, def.art.accentColor, lv);
      drawPattern(
        ctx,
        def.art.pattern ?? 'solid',
        Math.floor(i * sliceW),
        Math.ceil(sliceW),
        c.height,
        mainColor,
        def.art.accentColor,
      );
      if (i > 0) {
        ctx.fillStyle = '#2a1d16';
        ctx.fillRect(Math.floor(i * sliceW) - 2, 0, 4, c.height);
      }
    }
    // 满 3 阶顶部加一条微金流光边
    const maxLv = Math.max(...levels, 1);
    if (maxLv >= 3) {
      const g = ctx.createLinearGradient(0, 0, 0, 24);
      g.addColorStop(0, 'rgba(255, 240, 150, 0.55)');
      g.addColorStop(1, 'rgba(255, 240, 150, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, 24);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
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
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.2)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
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
