/**
 * 3D 场景：支持 4 种画面镜头模式（主页面 / 装配特写 / 关卡目录 / 2.5D 横版跟随）
 * ---------------------------------------------------------------
 * - 装配台场景（workshopGroup）：阳光草地圆台
 * - 第 1 关 2.5D 横版 3D 场景（levelGroup）：36m 立体池畔跑道、低多边形树/山/栅栏/教学木桩/终点旗帜拱门
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STAGE1_HURDLE_X, STAGE1_LENGTH } from '../core';
import { ACCENT, outlineMaterial, toonMaterial } from './materials';
import { makeOutlineGeometry } from './geometry';

export type CameraMode = 'title' | 'assembly' | 'select' | 'level';

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
    g.addColorStop(0, '#c2e9fb');
    g.addColorStop(0.55, '#dff4fd');
    g.addColorStop(1, '#cbead8');
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

  private readonly workshopGroup = new THREE.Group();
  private readonly levelGroup = new THREE.Group();
  private flagMesh: THREE.Mesh | null = null;
  private readonly sporeOrbs: THREE.Mesh[] = [];

  private mode: CameraMode = 'title';
  private followX = 0;
  private cameraShake = 0;
  private shakeAt = 0;
  private lastFrame = performance.now();
  private fpsAvg = 60;

  private readonly camPos = new THREE.Vector3(3.6, 4.4, 7.6);
  private readonly camTarget = new THREE.Vector3(0, 1.25, 0);
  private readonly desiredPos = new THREE.Vector3(3.6, 4.4, 7.6);
  private readonly desiredTarget = new THREE.Vector3(0, 1.25, 0);

  private readonly baseRatio = Math.min(window.devicePixelRatio || 1, 2);
  private renderScale = 1;
  private lastAdjust = 0;
  private readonly forcedScale: number | null;
  private readonly software: boolean;
  private resizeObserver: ResizeObserver;

  constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor('#d6eef8', 1);

    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    this.software = /swiftshader|llvmpipe|software/i.test(rendererName);
    const query = new URLSearchParams(window.location.search).get('scale');
    const forced = query === null ? Number.NaN : Number(query);
    this.forcedScale = Number.isFinite(forced) && forced > 0.2 && forced <= 1 ? forced : null;
    if (this.forcedScale !== null) this.renderScale = this.forcedScale;
    else if (this.software) this.renderScale = 0.55;

    this.canvas = this.renderer.domElement;
    this.canvas.className = 'webgl-canvas';
    this.canvas.setAttribute('aria-label', '拼装小鸡 3D 场景');
    host.appendChild(this.canvas);

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.5, 80);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);

    this.bgTexture = gradientBackground();
    this.scene.background = this.bgTexture;
    this.scene.fog = new THREE.Fog('#d6eef8', 22, 58);

    this.buildLights();
    this.buildWorkshopEnv();
    this.buildLevelEnv();
    this.scene.add(this.workshopGroup, this.levelGroup);
    this.levelGroup.visible = false;

    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
  }

  private buildLights(): void {
    const key = new THREE.DirectionalLight('#fff5e4', 1.1);
    key.position.set(12, 18, 14);
    key.castShadow = false;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight('#b2d4ff', 0.36);
    fill.position.set(-10, 6, -8);
    fill.castShadow = false;
    this.scene.add(fill);

    const hemi = new THREE.HemisphereLight('#e5f7ff', '#9ec288', 0.48);
    this.scene.add(hemi);
  }

  /** 主页面 & 装配车间环境：圆台草地 + 实验室光环 */
  private buildWorkshopEnv(): void {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(15, 48),
      toonMaterial({ color: 0xdce8b6 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    this.workshopGroup.add(ground);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(2.35, 2.6, 0.14, 32),
      toonMaterial({ color: 0xf0e4be }),
    );
    pedestal.position.y = -0.05;
    this.workshopGroup.add(pedestal);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.42, 2.54, 48),
      new THREE.MeshBasicMaterial({ color: ACCENT, side: THREE.DoubleSide, transparent: true, opacity: 0.72 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    this.workshopGroup.add(ring);

    // 远处装饰小树
    for (const [x, z, s] of [
      [-6.5, -5.5, 1.15],
      [-3.8, -7.2, 0.9],
      [5.8, -6.2, 1.25],
      [8.2, -4.4, 0.85],
    ] as const) {
      this.workshopGroup.add(this.makeTree(x, z, s));
    }
  }

  /** 第 1 关 2.5D 横版 3D 立体场景：36m 池畔跑道、栅栏、树木、远山、教学木桩、终点旗帜拱门 */
  private buildLevelEnv(): void {
    const totalLen = STAGE1_LENGTH + 18;
    const centerX = STAGE1_LENGTH / 2;

    // 主草地大底面
    const lawn = new THREE.Mesh(
      new THREE.PlaneGeometry(totalLen + 20, 34),
      toonMaterial({ color: 0x9ad47e }),
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(centerX, -0.02, -4);
    this.levelGroup.add(lawn);

    // 浅蓝微光池畔水域带（后景 z = -5.5，呼应单细胞池畔主题）
    const pond = new THREE.Mesh(
      new THREE.PlaneGeometry(totalLen + 10, 4.8),
      new THREE.MeshBasicMaterial({ color: 0x73d2e6, transparent: true, opacity: 0.8 }),
    );
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(centerX, 0.005, -5.6);
    this.levelGroup.add(pond);

    // 主跑道沙土路（x: -4 ~ 42, z: -2 ~ +2）
    const track = new THREE.Mesh(
      new THREE.BoxGeometry(totalLen, 0.08, 4.2),
      toonMaterial({ color: 0xebd9ae }),
    );
    track.position.set(centerX, -0.03, 0);
    this.levelGroup.add(track);

    // 跑道中心虚线与每 5m 距离刻度
    const markGeos: THREE.BufferGeometry[] = [];
    for (let x = -2; x <= STAGE1_LENGTH + 2; x += 2) {
      const dash = new THREE.BoxGeometry(0.85, 0.02, 0.09);
      dash.translate(x, 0.015, 0);
      markGeos.push(dash);
    }
    const marks = new THREE.Mesh(
      mergeGeometries(markGeos, false) ?? new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ color: 0xfff7e2 }),
    );
    this.levelGroup.add(marks);

    // 后排木栅栏（合并为一个 draw call）
    const fenceGeos: THREE.BufferGeometry[] = [];
    for (let x = -3; x <= STAGE1_LENGTH + 4; x += 2.2) {
      const post = new THREE.BoxGeometry(0.14, 0.72, 0.14);
      post.translate(x, 0.36, -2.25);
      fenceGeos.push(post);
    }
    const railTop = new THREE.BoxGeometry(totalLen - 2, 0.09, 0.08);
    railTop.translate(centerX, 0.56, -2.25);
    const railBot = new THREE.BoxGeometry(totalLen - 2, 0.09, 0.08);
    railBot.translate(centerX, 0.26, -2.25);
    fenceGeos.push(railTop, railBot);
    const fence = new THREE.Mesh(
      mergeGeometries(fenceGeos, false) ?? new THREE.BufferGeometry(),
      toonMaterial({ color: 0xb88652 }),
    );
    this.levelGroup.add(fence);

    // 教学跳跃矮木桩（放在 STAGE1_HURDLE_X，带亮黄警示顶条！）
    const hurdleGroup = new THREE.Group();
    const logGeo = new THREE.CylinderGeometry(0.24, 0.26, 2.8, 8);
    logGeo.rotateX(Math.PI / 2);
    const log = new THREE.Mesh(logGeo, toonMaterial({ color: 0x9c6538 }));
    log.position.set(STAGE1_HURDLE_X, 0.26, 0);
    const logHull = new THREE.Mesh(makeOutlineGeometry(logGeo), outlineMaterial());
    logHull.position.copy(log.position);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.08, 2.82),
      new THREE.MeshBasicMaterial({ color: 0xffe04d }),
    );
    stripe.position.set(STAGE1_HURDLE_X, 0.5, 0);
    hurdleGroup.add(log, logHull, stripe);
    this.levelGroup.add(hurdleGroup);

    // 沿途低多边形小树、远山与微光池畔发光孢子泡泡
    for (let x = -2; x <= STAGE1_LENGTH + 6; x += 5.2) {
      const z = -3.4 - ((x * 7) % 3) * 1.4;
      const scale = 0.85 + ((Math.abs(x) * 13) % 5) * 0.14;
      this.levelGroup.add(this.makeTree(x, z, scale));
    }

    // 远景山丘
    for (let x = -4; x <= STAGE1_LENGTH + 12; x += 9.5) {
      const h = 4.2 + ((Math.abs(x) * 3) % 4) * 1.1;
      const hill = new THREE.Mesh(
        new THREE.ConeGeometry(5.8, h, 7),
        toonMaterial({ color: 0x8cc9b8 }),
      );
      hill.position.set(x, h / 2 - 0.2, -13.5);
      this.levelGroup.add(hill);
    }

    // 飘浮发光微生物孢子球（在池畔上方漂浮，营造生命起源感）
    const orbGeo = new THREE.SphereGeometry(0.2, 8, 6);
    const orbMat = new THREE.MeshBasicMaterial({ color: 0x7effdf, transparent: true, opacity: 0.7 });
    for (let i = 0; i < 8; i += 1) {
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.position.set(8 + i * 3.6, 1.3 + (i % 3) * 0.55, -3.5 - (i % 2) * 1.2);
      orb.userData.baseY = orb.position.y;
      orb.userData.phase = i * 1.1;
      this.levelGroup.add(orb);
      this.sporeOrbs.push(orb);
    }

    // 终点拱门 + 飘扬红旗（位于 x = STAGE1_LENGTH）
    const finishGroup = new THREE.Group();
    finishGroup.position.set(STAGE1_LENGTH, 0, 0);

    const poleMat = toonMaterial({ color: 0xf5f5f0 });
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 3.6, 8), poleMat);
    p1.position.set(0, 1.8, -1.75);
    const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 3.6, 8), poleMat);
    p2.position.set(0, 1.8, 1.75);
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.52, 3.9),
      toonMaterial({ color: 0xff5a4e }),
    );
    banner.position.set(0, 3.45, 0);
    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.72, 0.08),
      toonMaterial({ color: 0xffd038 }),
    );
    flag.position.set(0.7, 3.9, -1.75);
    this.flagMesh = flag;

    // 终点地面棋盘线
    const finishStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.03, 4.1),
      new THREE.MeshBasicMaterial({ color: 0xffd038 }),
    );
    finishStrip.position.set(0, 0.025, 0);

    finishGroup.add(p1, p2, banner, flag, finishStrip);
    this.levelGroup.add(finishGroup);
  }

  private makeTree(x: number, z: number, scale: number): THREE.Group {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.2, 1.0, 6),
      toonMaterial({ color: 0x8a5b36 }),
    );
    trunk.position.y = 0.5;
    const crown1 = new THREE.Mesh(
      new THREE.ConeGeometry(0.95, 1.55, 7),
      toonMaterial({ color: 0x4ca663 }),
    );
    crown1.position.y = 1.55;
    const crown2 = new THREE.Mesh(
      new THREE.ConeGeometry(0.72, 1.25, 7),
      toonMaterial({ color: 0x62bd74 }),
    );
    crown2.position.y = 2.35;
    g.add(trunk, crown1, crown2);
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    return g;
  }

  setMode(mode: CameraMode, instant = false): void {
    this.mode = mode;
    const isLevel = mode === 'level';
    this.workshopGroup.visible = !isLevel;
    this.levelGroup.visible = isLevel;
    if (instant) {
      this.computeDesiredCamera(performance.now() / 1000);
      this.camPos.copy(this.desiredPos);
      this.camTarget.copy(this.desiredTarget);
    }
  }

  setFollowX(x: number): void {
    this.followX = Math.max(0, Math.min(STAGE1_LENGTH - 1.5, x));
  }

  private computeDesiredCamera(t: number): void {
    if (this.mode === 'title') {
      this.desiredPos.set(3.2 + Math.sin(t * 0.45) * 0.7, 3.3, 6.8);
      this.desiredTarget.set(0.15, 1.25, 0);
    } else if (this.mode === 'assembly') {
      this.desiredPos.set(3.1, 3.8, 5.9);
      this.desiredTarget.set(0.1, 1.18, 0);
    } else if (this.mode === 'select') {
      this.desiredPos.set(4.5, 4.8, 8.6);
      this.desiredTarget.set(0, 1.2, 0);
    } else {
      // 经典 2.5D 横版微俯角跟随视角（P-037）：一眼看清高度差、跳跃与前路敌人！
      const lookX = this.followX + 1.8;
      this.desiredPos.set(lookX, 3.7, 11.4);
      this.desiredTarget.set(lookX, 1.3, 0);
    }
  }

  attach(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  detach(object: THREE.Object3D): void {
    this.scene.remove(object);
  }

  shake(now: number, strength = 0.08): void {
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
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    const inst = 1 / dt;
    this.fpsAvg += (inst - this.fpsAvg) * 0.08;

    if (this.forcedScale === null && !this.software && now - this.lastAdjust > 1200 && now > 2200) {
      this.lastAdjust = now;
      if (this.fpsAvg < 54 && this.renderScale > 0.6) {
        this.renderScale = Math.max(0.6, this.renderScale - 0.1);
        this.applyRatio();
      } else if (this.fpsAvg > 59 && this.renderScale < 1) {
        this.renderScale = Math.min(1, this.renderScale + 0.05);
        this.applyRatio();
      }
    }

    const t = now / 1000;
    this.computeDesiredCamera(t);
    const smooth = Math.min(1, dt * (this.mode === 'level' ? 7 : 5));
    this.camPos.lerp(this.desiredPos, smooth);
    this.camTarget.lerp(this.desiredTarget, smooth);

    if (this.flagMesh) {
      this.flagMesh.rotation.y = Math.sin(t * 4.5) * 0.24;
    }
    for (const orb of this.sporeOrbs) {
      orb.position.y = (orb.userData.baseY as number) + Math.sin(t * 1.8 + (orb.userData.phase as number)) * 0.22;
    }

    const age = t - this.shakeAt / 1000;
    const shake = age >= 0 && age < 0.35 ? Math.sin(age * 78) * this.cameraShake * Math.exp(-8 * age) : 0;
    this.camera.position.set(this.camPos.x + shake, this.camPos.y + shake * 0.4, this.camPos.z);
    this.camera.lookAt(this.camTarget);
    this.renderer.render(this.scene, this.camera);
  }

  get stats(): RenderStats {
    const info = this.renderer.info.render;
    return { fps: this.fpsAvg, calls: info.calls, triangles: info.triangles };
  }

  project(world: THREE.Vector3, out: { x: number; y: number; visible: boolean }): void {
    const p = world.clone().project(this.camera);
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    out.x = (p.x * 0.5 + 0.5) * w;
    out.y = (-p.y * 0.5 + 0.5) * h;
    out.visible = p.z > -1 && p.z < 1 && out.x > -120 && out.x < w + 120 && out.y > -120 && out.y < h + 120;
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.scene.background = null;
    this.bgTexture.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
