import { DEFAULT_RADIO_TRACKS } from './rules.ts';
import type { MyPCVolumeState, RadioTrack } from './types.ts';

export class SolaraAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private tracks: RadioTrack[] = [...DEFAULT_RADIO_TRACKS];
  private stationIndex = 0;
  private inCar = false;
  private isPaused = false;
  private stepCount = 0;
  private tickAccum = 0;
  private htmlAudio: HTMLAudioElement | null = null;
  private volumes: Required<MyPCVolumeState> = {
    master: 0.85,
    music: 0.7,
    sfx: 0.85,
    muted: false,
  };

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.musicGain.connect(this.masterGain);
        this.sfxGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
        this.applyGainNodes();
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended' && !this.isPaused) {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private applyGainNodes(): void {
    if (!this.masterGain || !this.musicGain || !this.sfxGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    const masterVal = this.volumes.muted ? 0 : this.volumes.master;
    const radioBoost = this.inCar ? 1.0 : 0.32;
    this.masterGain.gain.setTargetAtTime(masterVal, now, 0.03);
    this.musicGain.gain.setTargetAtTime(this.volumes.music * radioBoost * 0.25, now, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.volumes.sfx * 0.35, now, 0.03);
    if (this.htmlAudio) {
      this.htmlAudio.muted = this.volumes.muted;
      this.htmlAudio.volume = Math.max(
        0,
        Math.min(1, masterVal * this.volumes.music * radioBoost)
      );
    }
  }

  public start(vol?: MyPCVolumeState): void {
    if (vol) {
      this.setVolumes(vol);
    }
    this.isPaused = false;
    this.ensureContext();
    this.syncCustomAudioElement();
  }

  public setVolumes(vol?: MyPCVolumeState): void {
    if (!vol) return;
    if (typeof vol.master === 'number') this.volumes.master = vol.master;
    if (typeof vol.music === 'number') this.volumes.music = vol.music;
    if (typeof vol.sfx === 'number') this.volumes.sfx = vol.sfx;
    if (typeof vol.muted === 'boolean') this.volumes.muted = vol.muted;
    this.applyGainNodes();
  }

  public setInCar(inCar: boolean): void {
    this.inCar = inCar;
    this.applyGainNodes();
  }

  public getTracks(): RadioTrack[] {
    return this.tracks;
  }

  public getCurrentStationIndex(): number {
    return this.stationIndex;
  }

  public setStationIndex(idx: number): void {
    if (this.tracks.length === 0) return;
    this.stationIndex = ((idx % this.tracks.length) + this.tracks.length) % this.tracks.length;
    this.stepCount = 0;
    this.syncCustomAudioElement();
  }

  public nextStation(): RadioTrack {
    this.setStationIndex(this.stationIndex + 1);
    this.playSfx('menuMove');
    return this.tracks[this.stationIndex];
  }

  public addCustomTrack(title: string, artist: string, url: string): number {
    const newTrack: RadioTrack = {
      id: `custom-${Date.now()}-${this.tracks.length}`,
      title,
      artist,
      station: 'USER TAPE DECK',
      bpm: 120,
      style: 'custom',
      customUrl: url,
    };
    this.tracks.push(newTrack);
    this.setStationIndex(this.tracks.length - 1);
    return this.stationIndex;
  }

  private syncCustomAudioElement(): void {
    const active = this.tracks[this.stationIndex];
    if (this.htmlAudio) {
      this.htmlAudio.pause();
      this.htmlAudio = null;
    }
    if (active && active.customUrl && typeof Audio !== 'undefined') {
      try {
        const audio = new Audio(active.customUrl);
        audio.loop = true;
        this.htmlAudio = audio;
        this.applyGainNodes();
        if (!this.isPaused) {
          audio.play().catch(() => {});
        }
      } catch {
        this.htmlAudio = null;
      }
    }
  }

  public tickRadio(): void {
    if (this.isPaused || this.volumes.muted) return;
    const track = this.tracks[this.stationIndex];
    if (!track || track.customUrl) return;

    this.tickAccum += 1 / 60;
    const stepDuration = 60 / track.bpm / 2;
    if (this.tickAccum < stepDuration) return;
    this.tickAccum -= stepDuration;

    const ctx = this.ensureContext();
    if (!ctx || !this.musicGain) return;

    const bassNotes =
      track.style === 'synthwave'
        ? [110, 110, 130.81, 146.83, 164.81, 146.83, 130.81, 98]
        : track.style === 'electro'
          ? [82.41, 164.81, 98, 196, 110, 220, 73.42, 146.83]
          : track.style === 'freestyle'
            ? [130.81, 164.81, 196, 164.81, 146.83, 174.61, 220, 196]
            : track.style === 'rock'
              ? [110, 110, 146.83, 164.81, 196, 164.81, 146.83, 110]
              : [196, 0, 220, 0, 164.81, 0, 146.83, 0];

    const freq = bassNotes[this.stepCount % bassNotes.length];
    this.stepCount++;
    if (!freq) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = track.style === 'rock' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + stepDuration * 0.9);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(now);
      osc.stop(now + stepDuration * 0.95);
    } catch {
      // Ignore WebAudio scheduling exceptions
    }
  }

  public playSfx(type: string): void {
    if (this.isPaused || this.volumes.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === 'menuMove') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.05);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.065);
      } else if (type === 'menuSelect' || type === 'cash') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880, now + 0.06);
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.19);
      } else if (type === 'horn' || type === 'siren') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(660, now + 0.16);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.26);
      } else {
        osc.type = 'square';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(55, now + 0.12);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch {
      // Ignore
    }
  }

  public pause(): void {
    this.isPaused = true;
    if (this.htmlAudio) {
      this.htmlAudio.pause();
    }
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
  }

  public resume(): void {
    this.isPaused = false;
    if (this.htmlAudio) {
      this.htmlAudio.play().catch(() => {});
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public destroy(): void {
    if (this.htmlAudio) {
      this.htmlAudio.pause();
      this.htmlAudio = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
