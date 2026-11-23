/**
 * 缓动与时间轴工具（B 负责）。
 * ---------------------------------------------------------------
 * 所有动画都用「开始时间 + 时间戳插值」计算，不用 setTimeout 串。
 * prefers-reduced-motion 时调用方直接取终点值。
 */

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 0..1 进度。 */
export function progress(now: number, start: number, duration: number): number {
  if (duration <= 0) return 1;
  return clamp((now - start) / duration, 0, 1);
}

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number): number => t * t * t;
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeInOutQuint = (t: number): number =>
  t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
export const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t);

/** 带 6% 过冲的弹簧曲线，用于生物身体重排。 */
export function easeOutBack(t: number, overshoot = 1.06): number {
  const c = (overshoot - 1) * 4;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

/** 弹性缓动：零件「长出来」。 */
export function easeOutElastic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c = (2 * Math.PI) / 3;
  return Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * c) + 1;
}

export const smoothstep = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/** 相对时间窗口 [start, start+dur] 内的 0..1。 */
export function window01(now: number, start: number, dur: number): number {
  return progress(now, start, dur);
}

/** 周期性呼吸值 -1..1。 */
export function breathe(now: number, periodMs = 1200): number {
  return Math.sin((now / periodMs) * Math.PI * 2);
}

/** 确定性伪随机（同一个 seed 永远同一结果，用于装饰噪点）。 */
export function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 用户是否要求减少动态效果。 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** 一次性动画记录。 */
export interface Anim {
  start: number;
  duration: number;
}

export function makeAnim(now: number, duration: number, reduced = false): Anim {
  return { start: now, duration: reduced ? 0 : duration };
}

export function animT(now: number, a: Anim): number {
  return progress(now, a.start, a.duration);
}

export function animDone(now: number, a: Anim): boolean {
  return now >= a.start + a.duration;
}
