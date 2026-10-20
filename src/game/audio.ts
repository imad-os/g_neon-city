import { DEFAULT_RADIO_TRACKS } from './rules.ts';
import type { RadioTrack } from './types.ts';

const SCALE_FREQS: Record<RadioTrack['style'], number[]> = {
  synthwave: [110, 130.81, 146.83, 164.81, 196.0, 220.0, 261.63, 329.63],
  electro: [98.0, 116.54, 130.81, 146.83, 174.61, 196.0, 233.08, 293.66],
  freestyle: [130.81, 146.83, 164.81, 196.0, 220.0, 246.94, 293.66, 329.63],
  rock: [82.41, 98.0, 110.0, 123.47, 146.83, 164.81, 196.0, 220.0],
  talk: [160.0, 180.0, 140.0, 200.0, 155.0, 175.0, 190.0, 150.0],
  custom: [110, 146.83, 164.81, 220.0, 261.63, 329.63, 392.0, 440.0],
};

export class SolaraAudioEngine {
  private ctx: AudioContext | null = null;
  private musicVolume = 0.7;
  private sfxVolume = 0.8;
  private isPaused = false;
  private isDestroyed = false;
  private inCar = false;
  private radioStep = 0;
  private nextNoteTime = 0;
  private currentStationIdx = 0;
  private tracks: RadioTrack[] = [...DEFAULT_RADIO_TRACKS];
  private customAudioEl: HTMLAudioElement | null = null;

  public start(volume?: { music: number; sfx: number }): void {
    if (this.isDestroyed) return;
    if (volume) {
      this.musicVolume = volume.music;
      this.sfxVolume = volume.sfx;
    }
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
          this.nextNoteTime = this.ctx.currentTime + 0.1;
        } catch {
          this.ctx = null;
        }
      }
    }
  }

  public setVolumes(v: { music: number; sfx: number }): void {
    this.musicVolume = Math.max(0, Math.min(1, v.music));
    this.sfxVolume = Math.max(0, Math.min(1, v.sfx));
    if (this.customAudioEl) {
      this.customAudioEl.volume = this.musicVolume * (this.inCar && !this.isPaused ? 0.85 : 0);
    }
  }

  public pause(): void {
    this.isPaused = true;
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
    if (this.customAudioEl) {
      this.customAudioEl.pause();
    }
  }

  public resume(): void {
    if (this.isDestroyed) return;
    this.isPaused = false;
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
      this.nextNoteTime = this.ctx.currentTime + 0.08;
    }
    this.syncCustomAudioPlayback();
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.isPaused = true;
    if (this.customAudioEl) {
      this.customAudioEl.pause();
      this.customAudioEl.src = '';
      this.customAudioEl = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }

  public getTracks(): RadioTrack[] {
    return this.tracks;
  }

  public addCustomTrack(title: string, artist: string, url: string): number {
    const newTrack: RadioTrack = {
      id: 'custom-' + Date.now() + '-' + this.tracks.length,
      title,
      artist,
      station: 'SOLARA CUSTOM TAPE DECK',
      bpm: 120,
      style: 'custom',
      customUrl: url,
    };
    this.tracks.push(newTrack);
    this.currentStationIdx = this.tracks.length - 1;
    this.syncCustomAudioPlayback();
    return this.currentStationIdx;
  }

  public getCurrentTrack(): RadioTrack {
    return this.tracks[this.currentStationIdx] || this.tracks[0];
  }

  public getCurrentStationIndex(): number {
    return this.currentStationIdx;
  }

  public setStationIndex(idx: number): RadioTrack {
    if (this.tracks.length === 0) return DEFAULT_RADIO_TRACKS[0];
    this.currentStationIdx = ((idx % this.tracks.length) + this.tracks.length) % this.tracks.length;
    this.radioStep = 0;
    this.playSfx('radioTune');
    this.syncCustomAudioPlayback();
    return this.getCurrentTrack();
  }

  public nextStation(): RadioTrack {
    return this.setStationIndex(this.currentStationIdx + 1);
  }

  public setInCar(inCar: boolean): void {
    if (this.inCar === inCar) return;
    this.inCar = inCar;
    this.syncCustomAudioPlayback();
  }

  private syncCustomAudioPlayback(): void {
    const track = this.getCurrentTrack();
    if (track.customUrl && this.inCar && !this.isPaused && !this.isDestroyed) {
      if (!this.customAudioEl) {
        this.customAudioEl = new Audio();
        this.customAudioEl.loop = true;
      }
      if (this.customAudioEl.src !== track.customUrl) {
        this.customAudioEl.src = track.customUrl;
      }
      this.customAudioEl.volume = this.musicVolume * 0.85;
      this.customAudioEl.play().catch(() => {});
    } else if (this.customAudioEl) {
      this.customAudioEl.pause();
    }
  }

  /**
   * Called inside the fixed 60Hz loop; schedules 1988 synthwave/electro radio notes
   * when the player is driving a car and no external URL audio is overriding.
   */
  public tickRadio(): void {
    if (this.isPaused || this.isDestroyed || !this.inCar || !this.ctx || this.musicVolume <= 0.01) {
      return;
    }
    if (this.ctx.state === 'suspended') {
      return;
    }
    const track = this.getCurrentTrack();
    if (track.customUrl) {
      return;
    }

    const now = this.ctx.currentTime;
    if (this.nextNoteTime < now) {
      this.nextNoteTime = now + 0.04;
    }

    const stepDuration = 60 / track.bpm / 2; // 8th notes
    while (this.nextNoteTime < now + 0.12) {
      this.scheduleRadioStep(track, this.radioStep, this.nextNoteTime, stepDuration);
      this.nextNoteTime += stepDuration;
      this.radioStep = (this.radioStep + 1) % 16;
    }
  }

  private scheduleRadioStep(track: RadioTrack, step: number, time: number, dur: number): void {
    if (!this.ctx) return;
    const scale = SCALE_FREQS[track.style] || SCALE_FREQS.synthwave;
    const bassFreq = scale[step % 4 === 0 ? 0 : (step * 3) % 4];
    const leadFreq = scale[(step * 5 + 2) % scale.length] * 2;

    // Bass synth pulse
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = track.style === 'rock' ? 'sawtooth' : track.style === 'electro' ? 'square' : 'triangle';
    osc.frequency.setValueAtTime(bassFreq, time);

    const vol = this.musicVolume * 0.11;
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur * 0.88);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + dur * 0.9);

    // Arpeggio / melody on off-beats
    if (step % 2 === 1 || track.style === 'synthwave') {
      const lead = this.ctx.createOscillator();
      const lGain = this.ctx.createGain();
      lead.type = 'sine';
      lead.frequency.setValueAtTime(leadFreq, time);
      lGain.gain.setValueAtTime(this.musicVolume * 0.06, time);
      lGain.gain.exponentialRampToValueAtTime(0.001, time + dur * 0.75);
      lead.connect(lGain);
      lGain.connect(this.ctx.destination);
      lead.start(time);
      lead.stop(time + dur * 0.8);
    }
  }

  public playSfx(
    kind:
      | 'carDoor'
      | 'horn'
      | 'siren'
      | 'cash'
      | 'missionPass'
      | 'hit'
      | 'radioTune'
      | 'menuMove'
      | 'menuSelect'
  ): void {
    if (this.isPaused || this.isDestroyed || !this.ctx || this.sfxVolume <= 0.01) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    const vol = this.sfxVolume * 0.18;
    if (kind === 'menuMove') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      gain.gain.setValueAtTime(vol * 0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.055);
    } else if (kind === 'menuSelect' || kind === 'radioTune') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(990, now + 0.09);
      gain.gain.setValueAtTime(vol * 0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.11);
    } else if (kind === 'carDoor') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.14);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.16);
    } else if (kind === 'horn') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(340, now);
      gain.gain.setValueAtTime(vol * 0.85, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (kind === 'siren') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.linearRampToValueAtTime(920, now + 0.18);
      osc.frequency.linearRampToValueAtTime(640, now + 0.35);
      gain.gain.setValueAtTime(vol * 0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      osc.start(now);
      osc.stop(now + 0.37);
    } else if (kind === 'cash') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1318.5, now + 0.07);
      gain.gain.setValueAtTime(vol * 0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.23);
    } else if (kind === 'missionPass') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(554.37, now + 0.12);
      osc.frequency.setValueAtTime(659.25, now + 0.24);
      osc.frequency.setValueAtTime(880, now + 0.36);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc.start(now);
      osc.stop(now + 0.66);
    } else {
      osc.type = 'square';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.11);
      gain.gain.setValueAtTime(vol * 0.85, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.13);
    }
  }
}
