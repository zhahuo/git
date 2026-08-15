/*
 * Procedural weapon audio for 小小CSGO.
 * Inspired by community Web Audio FPS sound engines researched on GitHub:
 * - Web Audio API samples: procedurally generated gunshot sounds.
 * - dailydoom: distinct procedural sounds per weapon via pure synthesis.
 * - tiks: runtime-synthesized sound effects, no audio files shipped.
 */

export type WeaponAudioProfile = { burstMs: number; noiseGain: number; filterHz: number; thumpHz: number; thumpGain: number; bodyMs: number };

export const WEAPON_AUDIO: Record<string, WeaponAudioProfile> = {
  'VX-9': { burstMs: 90, noiseGain: 0.55, filterHz: 2400, thumpHz: 180, thumpGain: 0.28, bodyMs: 60 },
  'RAPTOR': { burstMs: 120, noiseGain: 0.7, filterHz: 1500, thumpHz: 120, thumpGain: 0.4, bodyMs: 80 },
  'HAMMER': { burstMs: 190, noiseGain: 0.95, filterHz: 700, thumpHz: 90, thumpGain: 0.7, bodyMs: 140 },
  'SABER': { burstMs: 70, noiseGain: 0.5, filterHz: 3200, thumpHz: 240, thumpGain: 0.22, bodyMs: 45 },
  'TITAN': { burstMs: 260, noiseGain: 1.0, filterHz: 420, thumpHz: 60, thumpGain: 0.9, bodyMs: 200 },
};

export type SpatialKind = 'pickup' | 'elimination' | 'flagDrop' | 'shot';
export type SpatialProfile = { refDistance: number; maxDistance: number; rolloff: number; noiseGain: number; filterHz: number; toneHz: number; toneGain: number; durationMs: number };
export type SpatialSample = { kind: SpatialKind; x: number; z: number; distance: number; gain: number };

export const SPATIAL_PROFILES: Record<SpatialKind, SpatialProfile> = {
  pickup: { refDistance: 2, maxDistance: 24, rolloff: 1.2, noiseGain: 0.28, filterHz: 3200, toneHz: 880, toneGain: 0.22, durationMs: 180 },
  elimination: { refDistance: 3, maxDistance: 36, rolloff: 1, noiseGain: 0.7, filterHz: 900, toneHz: 130, toneGain: 0.5, durationMs: 320 },
  flagDrop: { refDistance: 3, maxDistance: 40, rolloff: 1, noiseGain: 0.6, filterHz: 700, toneHz: 170, toneGain: 0.45, durationMs: 260 },
  shot: { refDistance: 3, maxDistance: 48, rolloff: 1.1, noiseGain: 0.75, filterHz: 1100, toneHz: 110, toneGain: 0.4, durationMs: 150 },
};

export function distance2d(ax: number, az: number, bx: number, bz: number) {
  return Math.hypot(ax - bx, az - bz);
}

export function spatialGain(distance: number, profile: SpatialProfile) {
  if (distance <= profile.refDistance) return 1;
  if (distance >= profile.maxDistance) return 0;
  const fraction = (distance - profile.refDistance) / (profile.maxDistance - profile.refDistance);
  return Math.max(0, 1 - fraction * profile.rolloff);
}

export type FeedbackKind = 'hit' | 'damaged' | 'kill' | 'killstreak';
export type FeedbackProfile = { toneHz: number; toneGain: number; noiseGain: number; durationMs: number; blips: number };
export type FeedbackSample = { kind: FeedbackKind; blips: number };

export const FEEDBACK_AUDIO: Record<FeedbackKind, FeedbackProfile> = {
  hit: { toneHz: 1250, toneGain: 0.3, noiseGain: 0.12, durationMs: 70, blips: 1 },
  damaged: { toneHz: 170, toneGain: 0.5, noiseGain: 0.45, durationMs: 220, blips: 1 },
  kill: { toneHz: 950, toneGain: 0.38, noiseGain: 0.15, durationMs: 90, blips: 2 },
  killstreak: { toneHz: 700, toneGain: 0.35, noiseGain: 0.12, durationMs: 120, blips: 3 },
};

export type UiKind = 'footstep' | 'respawn' | 'matchStart' | 'matchEnd';
export type UiProfile = { toneHz: number; toneGain: number; noiseGain: number; durationMs: number; blips: number; cooldownMs?: number };
export type UiSample = { kind: UiKind; blips: number };

export const UI_AUDIO: Record<UiKind, UiProfile> = {
  footstep: { toneHz: 240, toneGain: 0.16, noiseGain: 0.28, durationMs: 60, blips: 1, cooldownMs: 180 },
  respawn: { toneHz: 520, toneGain: 0.3, noiseGain: 0.1, durationMs: 160, blips: 2 },
  matchStart: { toneHz: 660, toneGain: 0.32, noiseGain: 0.08, durationMs: 200, blips: 3 },
  matchEnd: { toneHz: 330, toneGain: 0.34, noiseGain: 0.1, durationMs: 260, blips: 3 },
};

export function uiThrottleDue(lastAt: number, now: number, cooldownMs: number) {
  return lastAt <= 0 || now - lastAt >= cooldownMs;
}

const AUDIO_STORAGE_KEY = 'strikezone.audio';

export type AudioStats = { enabled: boolean; attempts: number; plays: number; failed: number };
export type SpatialState = { listener: { x: number; z: number; yaw: number }; last: SpatialSample | null; samples: SpatialSample[]; played: number };
export type FeedbackState = { played: number; last: FeedbackSample | null };
export type UiState = { played: number; throttled: number; last: UiSample | null };

declare global {
  interface Window {
    __strikeZoneAudio?: { isEnabled: () => boolean; setEnabled: (value: boolean) => void; stats: () => AudioStats; unlock: () => void; playWeaponFire: (weaponName: string) => void; setListenerPosition: (x: number, z: number, yaw: number) => void; playPositional: (kind: SpatialKind, x: number, z: number) => void; spatial: () => SpatialState; playFeedback: (kind: FeedbackKind) => void; feedback: () => FeedbackState; playUi: (kind: UiKind) => void; ui: () => UiState };
  }
}

class GameAudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabledValue: boolean;
  attempts = 0;
  plays = 0;
  failed = 0;
  private listenerState = { x: 0, z: 0, yaw: 0 };
  private lastSpatial: SpatialSample | null = null;
  private spatialSamples: SpatialSample[] = [];
  private spatialPlayed = 0;
  private feedbackPlayed = 0;
  private lastFeedback: FeedbackSample | null = null;
  private uiPlayed = 0;
  private uiThrottled = 0;
  private lastUiAt = new Map<UiKind, number>();
  private lastUi: UiSample | null = null;

  constructor() {
    this.enabledValue = typeof localStorage === 'undefined' ? true : localStorage.getItem(AUDIO_STORAGE_KEY) !== 'off';
  }

  isEnabled() { return this.enabledValue; }

  setEnabled(value: boolean) {
    this.enabledValue = value;
    try { localStorage.setItem(AUDIO_STORAGE_KEY, value ? 'on' : 'off'); } catch { /* storage unavailable */ }
    if (value) void this.resume();
    else void this.suspend();
  }

  stats(): AudioStats { return { enabled: this.enabledValue, attempts: this.attempts, plays: this.plays, failed: this.failed }; }

  spatial(): SpatialState { return { listener: { ...this.listenerState }, last: this.lastSpatial ? { ...this.lastSpatial } : null, samples: this.spatialSamples.map((sample) => ({ ...sample })), played: this.spatialPlayed }; }

  feedback(): FeedbackState { return { played: this.feedbackPlayed, last: this.lastFeedback ? { ...this.lastFeedback } : null }; }

  ui(): UiState { return { played: this.uiPlayed, throttled: this.uiThrottled, last: this.lastUi ? { ...this.lastUi } : null }; }

  private async suspend() { if (this.context && this.context.state === 'running') await this.context.suspend(); }

  private async resume() { if (this.context && this.context.state === 'suspended') await this.context.resume(); }

  setListenerPosition(x: number, z: number, yaw: number) {
    this.listenerState = { x, z, yaw };
    const listener = this.context?.listener;
    if (!listener) return;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    if (typeof listener.positionX !== 'undefined') {
      listener.positionX.value = x;
      listener.positionZ.value = z;
      listener.forwardX.value = forwardX;
      listener.forwardZ.value = forwardZ;
      listener.upX.value = 0;
      listener.upZ.value = 0;
    } else {
      listener.setPosition(x, 0, z);
      listener.setOrientation(forwardX, 0, forwardZ, 0, 1, 0);
    }
  }

  unlock() { this.ensureContext(); }

  private ensureContext(): AudioContext | null {
    if (!this.enabledValue) return null;
    if (!this.context) {
      const ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!ctor) return null;
      this.context = new ctor();
      this.master = this.context.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.context.destination);
      const seconds = 1;
      const buffer = this.context.createBuffer(1, Math.floor(this.context.sampleRate * seconds), this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
    }
    if (this.context.state === 'suspended') void this.context.resume();
    return this.context;
  }

  playWeaponFire(weaponName: string) {
    const profile = WEAPON_AUDIO[weaponName] ?? WEAPON_AUDIO['VX-9'];
    const ctx = this.ensureContext();
    this.attempts += 1;
    if (!ctx || !this.master || !this.noise) return;
    try {
      const now = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = profile.filterHz;
      const crackGain = ctx.createGain();
      crackGain.gain.setValueAtTime(profile.noiseGain, now);
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + profile.burstMs / 1000);
      source.connect(filter).connect(crackGain).connect(this.master);
      source.start(now);
      source.stop(now + profile.burstMs / 1000 + 0.02);
      const thump = ctx.createOscillator();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(profile.thumpHz, now);
      const thumpGain = ctx.createGain();
      thumpGain.gain.setValueAtTime(profile.thumpGain, now);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, now + profile.bodyMs / 1000);
      thump.connect(thumpGain).connect(this.master);
      thump.start(now);
      thump.stop(now + profile.bodyMs / 1000 + 0.02);
      this.plays += 1;
    } catch {
      this.failed += 1;
    }
  }

  playPositional(kind: SpatialKind, x: number, z: number) {
    const profile = SPATIAL_PROFILES[kind] ?? SPATIAL_PROFILES.pickup;
    const distance = distance2d(this.listenerState.x, this.listenerState.z, x, z);
    const gain = spatialGain(distance, profile);
    this.lastSpatial = { kind, x, z, distance, gain };
    this.spatialSamples = [...this.spatialSamples, { kind, x, z, distance, gain }].slice(-8);
    this.attempts += 1;
    if (!this.enabledValue || gain <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master || !this.noise) return;
    try {
      const now = ctx.currentTime;
      const panner = ctx.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'linear';
      panner.refDistance = profile.refDistance;
      panner.maxDistance = profile.maxDistance;
      panner.rolloffFactor = profile.rolloff;
      if (typeof panner.positionX !== 'undefined') {
        panner.positionX.value = x;
        panner.positionZ.value = z;
      } else {
        panner.setPosition(x, 0, z);
      }
      panner.connect(this.master);
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = profile.filterHz;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(profile.noiseGain * gain, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + profile.durationMs / 1000);
      source.connect(filter).connect(noiseGain).connect(panner);
      source.start(now);
      source.stop(now + profile.durationMs / 1000 + 0.02);
      const tone = ctx.createOscillator();
      tone.type = 'sine';
      tone.frequency.setValueAtTime(profile.toneHz, now);
      const toneGain = ctx.createGain();
      toneGain.gain.setValueAtTime(profile.toneGain * gain, now);
      toneGain.gain.exponentialRampToValueAtTime(0.001, now + profile.durationMs / 1000);
      tone.connect(toneGain).connect(panner);
      tone.start(now);
      tone.stop(now + profile.durationMs / 1000 + 0.02);
      this.spatialPlayed += 1;
      this.plays += 1;
    } catch {
      this.failed += 1;
    }
  }

  playFeedback(kind: FeedbackKind) {
    const profile = FEEDBACK_AUDIO[kind] ?? FEEDBACK_AUDIO.hit;
    this.lastFeedback = { kind, blips: profile.blips };
    this.attempts += 1;
    if (!this.enabledValue) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    try {
      const now = ctx.currentTime;
      for (let blip = 0; blip < profile.blips; blip += 1) {
        const start = now + blip * (profile.durationMs / 1000 + 0.03);
        const oscillator = ctx.createOscillator();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(profile.toneHz * (1 + blip * 0.3), start);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(profile.toneGain, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + profile.durationMs / 1000);
        oscillator.connect(gain).connect(this.master);
        oscillator.start(start);
        oscillator.stop(start + profile.durationMs / 1000 + 0.02);
      }
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(profile.noiseGain, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + profile.durationMs / 1000);
      const source = ctx.createBufferSource();
      if (this.noise) {
        source.buffer = this.noise;
        source.connect(noiseGain).connect(this.master);
        source.start(now);
        source.stop(now + profile.durationMs / 1000 + 0.02);
      }
      this.feedbackPlayed += 1;
      this.plays += 1;
    } catch {
      this.failed += 1;
    }
  }

  playUi(kind: UiKind) {
    const profile = UI_AUDIO[kind] ?? UI_AUDIO.footstep;
    this.lastUi = { kind, blips: profile.blips };
    const now = performance.now();
    const cooldown = profile.cooldownMs ?? 0;
    const lastAt = this.lastUiAt.get(kind) ?? 0;
    if (cooldown > 0 && !uiThrottleDue(lastAt, now, cooldown)) {
      this.uiThrottled += 1;
      return;
    }
    this.lastUiAt.set(kind, now);
    this.attempts += 1;
    if (!this.enabledValue) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    try {
      const start = ctx.currentTime;
      for (let blip = 0; blip < profile.blips; blip += 1) {
        const blipAt = start + blip * (profile.durationMs / 1000 + 0.03);
        const oscillator = ctx.createOscillator();
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(profile.toneHz * (1 + blip * 0.25), blipAt);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(profile.toneGain, blipAt);
        gain.gain.exponentialRampToValueAtTime(0.001, blipAt + profile.durationMs / 1000);
        oscillator.connect(gain).connect(this.master);
        oscillator.start(blipAt);
        oscillator.stop(blipAt + profile.durationMs / 1000 + 0.02);
      }
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(profile.noiseGain, start);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, start + profile.durationMs / 1000);
      const source = ctx.createBufferSource();
      if (this.noise) {
        source.buffer = this.noise;
        source.connect(noiseGain).connect(this.master);
        source.start(start);
        source.stop(start + profile.durationMs / 1000 + 0.02);
      }
      this.uiPlayed += 1;
      this.plays += 1;
    } catch {
      this.failed += 1;
    }
  }
}

export const gameAudio = new GameAudioEngine();

if (typeof window !== 'undefined') window.__strikeZoneAudio = gameAudio;
