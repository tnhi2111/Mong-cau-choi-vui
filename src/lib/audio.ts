/**
 * Sound: optional background music + tiny synthesized chimes.
 * Nothing plays until the viewer turns sound on (browsers block autoplay anyway).
 * No audio files are fetched until then either.
 */

import { birthdayConfig } from '../config/birthday';

type Listener = (on: boolean) => void;

class SoundSystem {
  private enabled = false;
  private ctx: AudioContext | null = null;
  private music: HTMLAudioElement | null = null;
  private listeners = new Set<Listener>();
  musicAvailable: boolean | null = null;

  constructor(private musicSrc: string, private volume: number) {}

  get on(): boolean {
    return this.enabled;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Checks (once) whether the configured music file actually exists. */
  async probeMusic(): Promise<boolean> {
    if (this.musicAvailable !== null) return this.musicAvailable;
    try {
      const res = await fetch(this.musicSrc, { method: 'HEAD' });
      const type = res.headers.get('content-type') ?? '';
      this.musicAvailable = res.ok && /audio|octet-stream/.test(type);
    } catch {
      this.musicAvailable = false;
    }
    return this.musicAvailable;
  }

  async toggle(): Promise<void> {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.ensureContext();
      if (await this.probeMusic()) {
        if (!this.music) {
          this.music = new Audio(this.musicSrc);
          this.music.loop = true;
          this.music.volume = 0;
          this.music.preload = 'auto';
        }
        this.music.play().then(() => this.fade(this.music!, this.volume, 1200)).catch(() => {});
      }
    } else if (this.music) {
      const m = this.music;
      this.fade(m, 0, 500, () => m.pause());
    }
    this.listeners.forEach((fn) => fn(this.enabled));
  }

  private fade(el: HTMLAudioElement, to: number, ms: number, done?: () => void) {
    const from = el.volume;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      el.volume = from + (to - from) * t;
      if (t < 1) requestAnimationFrame(step);
      else done?.();
    };
    requestAnimationFrame(step);
  }

  private ensureContext() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    } catch {
      this.ctx = null;
    }
  }

  /** A soft glassy bell. `pitch` 0..n walks up a pentatonic scale. */
  chime(pitch = 0, gain = 0.08): void {
    if (!this.enabled) return;
    this.ensureContext();
    const ctx = this.ctx;
    if (!ctx) return;
    const scale = [0, 3, 5, 7, 10, 12, 15, 17];
    const base = 659.25; // E5
    const freq = base * Math.pow(2, scale[pitch % scale.length] / 12);
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(gain, now + 0.015);
    out.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
    out.connect(ctx.destination);
    for (const [mult, g] of [
      [1, 1],
      [2.01, 0.25],
      [3.02, 0.08],
    ] as const) {
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      og.gain.value = g;
      osc.connect(og).connect(out);
      osc.start(now);
      osc.stop(now + 2.3);
    }
  }

  /** A short rising arpeggio for big moments. */
  flourish(): void {
    [0, 2, 4, 5].forEach((p, i) => setTimeout(() => this.chime(p, 0.06), i * 110));
  }
}

export const sound = new SoundSystem(birthdayConfig.music.src, birthdayConfig.music.volume);
