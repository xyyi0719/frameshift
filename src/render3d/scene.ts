/**
 * 3D 场景：固定斜视相机、跑道、灯光、渲染统计（B 负责）。
 * ---------------------------------------------------------------
 * 关键数值照 docs/RIG3D.md §1 / §6：fov35、(3.8,5.3,6.6)、NoToneMapping、无 shadow map。
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ACCENT, toonMaterial } from './materials';

export interface RenderStats {
  fps: number;
  calls: number;
  triangles: number;
}

function gradientBackground(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#D7EEF8');
    g.addColorStop(1, '#BFE0EE');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class SceneView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly host: HTMLElement;
  private readonly bgTexture: THREE.CanvasTexture;
  private cameraShake = 0;
  private shakeAt = 0;
  private lastFrame = performance.now();
  private fpsAvg = 60;
  private readonly basePos = new THREE.Vector3(3.8, 5.3, 6.6);
  private readonly lookAt = new THREE.Vector3(0, 1.15, 0);
  private readonly baseRatio = Math.min(window.devicePixelRatio || 1, 2);
  private renderScale = 1;
  private lastAdjust = 0;
  private readonly forcedScale: number | null;
  private readonly software: boolean;

  constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor('#CFE9F5', 1);
    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    this.software = /swiftshader|llvmpipe|software/i.test(rendererName);
    const query = new URLSearchParams(window.location.search).get('scale');
    const forced = query === null ? Number.NaN : Number(query);
    this.forcedScale = Number.isFinite(forced) && forced > 0.2 && forced <= 1 ? forced : null;
    if (this.forcedScale !== null) this.renderScale = this.forcedScale;
    else if (this.software) this.renderScale = 0.45;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'webgl-canvas';
    this.canvas.setAttribute('aria-label', '拼装小鸡 3D 场景');
    host.appendChild(this.canvas);

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.5, 40);
    this.camera.position.copy(this.basePos);
    this.camera.lookAt(this.lookAt);

    this.bgTexture = gradientBackground();
    this.scene.background = this.bgTexture;
    this.scene.fog = new THREE.Fog('#CFE9F5', 12, 26);

    this.buildLights();
    this.buildGround();

    this.resize();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(host);
    this.resizeObserver = ro;
  }

  private resizeObserver: ResizeObserver;

  private buildLights(): void {
    const key = new THREE.DirectionalLight('#FFF2DC', 1.05);
    key.position.set(4.5, 7.0, 5.5);
    key.target.position.set(0, 1, 0);
    key.castShadow = false;
    this.scene.add(key, key.target);

    const fill = new THREE.DirectionalLight('#AFC9FF', 0.3);
    fill.position.set(-5, 3, -4);
    fill.target.position.set(0, 1, 0);
    fill.castShadow = false;
    this.scene.add(fill, fill.target);

    const hemi = new THREE.HemisphereLight('#DFF3FF', '#C9B07A', 0.4);
    this.scene.add(hemi);
  }

  private buildGround(): void {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(14, 48),
      toonMaterial({ color: 0xe7d9b4 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    this.scene.add(ground);

    // 跑道：中央沙色条 + 冷色边线 + 虚线，给纵深。所有标线合并成一次 draw call。
    const positions: number[] = [];
    const colors: number[] = [];
    const c = new THREE.Color();
    const pushRect = (x: number, z: number, w: number, d: number, color: number, y = 0.008): void => {
      c.setHex(color);
      const x0 = x - w / 2;
      const x1 = x + w / 2;
      const z0 = z - d / 2;
      const z1 = z + d / 2;
      positions.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1);
      for (let i = 0; i < 6; i += 1) colors.push(c.r, c.g, c.b);
    };
    for (const z of [-1.72, 1.72]) pushRect(0, z, 19, 0.035, 0x2f8d83);
    for (let x = -8; x <= 8; x += 1.6) pushRect(x, 0, 0.7, 0.035, 0xfaf3dc, 0.009);
    for (const x of [-8, -5, -2.5, 2.5, 5, 8]) pushRect(x, 0, 0.035, 3.6, 0x8d7c58, 0.01);
    const markGeo = new THREE.BufferGeometry();
    markGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    markGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const marks = new THREE.Mesh(
      markGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    );
    this.scene.add(marks);

    // 护栏合并成一个 mesh
    const railGeos: THREE.BufferGeometry[] = [];
    for (const z of [-2.25, 2.25]) {
      const g = new THREE.BoxGeometry(19, 0.12, 0.09);
      g.translate(0, 0.06, z);
      railGeos.push(g);
    }
    const rails = new THREE.Mesh(
      mergeGeometries(railGeos, false) ?? new THREE.BufferGeometry(),
      toonMaterial({ color: 0xb9c9c8 }),
    );
    this.scene.add(rails);

    // 远处的实验室立牌 / 灯柱，合并成 2 个 draw call。
    const panelGeos: THREE.BufferGeometry[] = [];
    const stripGeos: THREE.BufferGeometry[] = [];
    for (const [x, z, h] of [
      [-7.5, -5.2, 1.5],
      [7.2, -5.0, 1.8],
      [-4.2, -6.4, 1.0],
      [4.0, -6.0, 1.2],
    ] as const) {
      const panel = new THREE.BoxGeometry(0.5, h, 0.16);
      panel.translate(x, h / 2, z);
      panelGeos.push(panel);
      const strip = new THREE.BoxGeometry(0.34, 0.05, 0.18);
      strip.translate(x, h * 0.78, z + 0.08);
      stripGeos.push(strip);
    }
    const panels = new THREE.Mesh(
      mergeGeometries(panelGeos, false) ?? new THREE.BufferGeometry(),
      toonMaterial({ color: 0xbfd8df }),
    );
    this.scene.add(panels);
    const strips = new THREE.Mesh(
      mergeGeometries(stripGeos, false) ?? new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.55 }),
    );
    this.scene.add(strips);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(9.7, 9.76, 64),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.013;
    this.scene.add(ring);
  }

  attach(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  detach(object: THREE.Object3D): void {
    this.scene.remove(object);
  }

  shake(now: number, strength = 0.06): void {
    this.cameraShake = strength;
    this.shakeAt = now;
  }

  private applyRatio(): void {
    this.renderer.setPixelRatio(this.baseRatio * this.renderScale);
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
  }

  resize(): void {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.applyRatio();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(now: number): void {
    const dt = Math.max(0.001, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const inst = 1 / dt;
    this.fpsAvg += (inst - this.fpsAvg) * 0.08;

    if (this.forcedScale === null && !this.software && now - this.lastAdjust > 1200 && now > 2200) {
      this.lastAdjust = now;
      if (this.fpsAvg < 56 && this.renderScale > 0.55) {
        this.renderScale = Math.max(0.55, this.renderScale - 0.1);
        this.applyRatio();
      } else if (this.fpsAvg > 59 && this.renderScale < 1) {
        this.renderScale = Math.min(1, this.renderScale + 0.05);
        this.applyRatio();
      }
    }

    const age = now / 1000 - this.shakeAt / 1000;
    const shake = age >= 0 && age < 0.35 ? Math.sin(age * 78) * this.cameraShake * Math.exp(-8 * age) : 0;
    this.camera.position.set(this.basePos.x + shake, this.basePos.y + shake * 0.4, this.basePos.z);
    this.camera.lookAt(this.lookAt);
    this.renderer.render(this.scene, this.camera);
  }

  get stats(): RenderStats {
    const info = this.renderer.info.render;
    return { fps: this.fpsAvg, calls: info.calls, triangles: info.triangles };
  }

  /** NDC 投影；返回 CSS 像素。 */
  project(world: THREE.Vector3, out: { x: number; y: number; visible: boolean }): void {
    const p = world.clone().project(this.camera);
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    out.x = (p.x * 0.5 + 0.5) * w;
    out.y = (-p.y * 0.5 + 0.5) * h;
    out.visible = p.z > -1 && p.z < 1 && out.x > -80 && out.x < w + 80 && out.y > -80 && out.y < h + 80;
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.scene.background = null;
    this.bgTexture.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
