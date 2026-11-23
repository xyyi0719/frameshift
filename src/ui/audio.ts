/**
 * WebAudio 现场合成音效（B 负责，可静音）。
 * ---------------------------------------------------------------
 * 不加载任何音频文件。第一次用户手势后才创建 AudioContext。
 */

export type SoundName =
  | 'click'
  | 'insert'
  | 'delete'
  | 'flip'
  | 'success'
  | 'fail'
  | 'error'
  | 'undo';

const MUTE_KEY = 'frameshift.muted.v1';

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* 忽略隐私模式下的存储失败 */
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.02);
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    if (!this.muted) this.play('click');
    return this.muted;
  }

  /** 用户手势时调用，解锁 AudioContext。 */
  unlock(): void {
    this.ensure();
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  play(name: SoundName, pitchOffset = 0): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + 0.001;

    switch (name) {
      case 'click':
        this.tone(520 + pitchOffset * 40, 720 + pitchOffset * 40, 'square', 0.035, 0.045, t);
        break;
      case 'insert':
        this.tone(440 + pitchOffset * 60, 660 + pitchOffset * 60, 'square', 0.055, 0.07, t);
        this.noise(0.03, 0.02, t, 2400);
        break;
      case 'delete':
        this.tone(660 + pitchOffset * 40, 330 + pitchOffset * 20, 'square', 0.055, 0.075, t);
        this.noise(0.035, 0.025, t, 1400);
        break;
      case 'flip':
        this.noise(0.028, 0.016, t, 3600 + pitchOffset * 140);
        break;
      case 'success':
        this.tone(523.25, 523.25, 'triangle', 0.09, 0.10, t);
        this.tone(659.25, 659.25, 'triangle', 0.09, 0.10, t + 0.11);
        this.tone(783.99, 783.99, 'triangle', 0.1, 0.16, t + 0.22);
        this.tone(1046.5, 1046.5, 'sine', 0.06, 0.22, t + 0.34);
        break;
      case 'fail':
        this.tone(240, 90, 'sawtooth', 0.1, 0.45, t);
        this.tone(160, 60, 'triangle', 0.08, 0.5, t + 0.03);
        break;
      case 'error':
        this.tone(190, 150, 'square', 0.05, 0.09, t);
        this.tone(150, 120, 'square', 0.04, 0.10, t + 0.08);
        break;
      case 'undo':
        this.tone(540, 300, 'triangle', 0.05, 0.10, t);
        break;
      default: {
        const _never: never = name;
        void _never;
      }
    }
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(
    freqFrom: number,
    freqTo: number,
    type: OscillatorType,
    gain: number,
    duration: number,
    at: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqTo), at + duration);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  private noise(duration: number, gain: number, at: number, cutoff: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(at);
  }
}
