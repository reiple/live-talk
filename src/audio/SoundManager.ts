/**
 * Web Audio로 효과음을 합성한다 (음원 파일 불필요).
 *  - blip: 대사 타이핑 효과음 (화자별 음색)
 *  - sfx : hit / flash / chime / pop / whoosh
 *  - bgm : 선택적으로 오디오 파일 반복 재생
 */
type Voice = { freq: number; type: OscillatorType };

const VOICES: Record<string, Voice> = {
  blip_high: { freq: 880, type: 'square' },
  blip_mid: { freq: 560, type: 'square' },
  blip_low: { freq: 300, type: 'triangle' },
  blip_soft: { freq: 660, type: 'sine' },
};

export class SoundManager {
  private ctx?: AudioContext;
  private master?: GainNode;
  private bgmEl?: HTMLAudioElement;
  private _volume = 0.6;
  private _muted = false;

  get volume() {
    return this._volume;
  }
  get muted() {
    return this._muted;
  }

  /** 사용자 제스처 안에서 호출해야 한다 (브라우저 자동재생 정책). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyGain();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    this.applyGain();
  }
  setMuted(m: boolean) {
    this._muted = m;
    this.applyGain();
  }

  private applyGain() {
    const g = this._muted ? 0 : this._volume;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(g, this.ctx.currentTime, 0.01);
    if (this.bgmEl) this.bgmEl.volume = g * 0.5;
  }

  blip(voice = 'blip_mid') {
    const ctx = this.ctx;
    if (!ctx || !this.master || this._muted) return;
    const v = VOICES[voice] ?? VOICES.blip_mid;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = v.type;
    osc.frequency.value = v.freq * (1 + (Math.random() - 0.5) * 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  sfx(name: string) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this._muted) return;
    const t = ctx.currentTime;
    const out = this.master;
    const tone = (type: OscillatorType, f0: number, f1: number, dur: number, vol: number, at = 0) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + at);
      o.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
      g.gain.setValueAtTime(vol, t + at);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g).connect(out);
      o.start(t + at);
      o.stop(t + at + dur + 0.02);
    };
    const noise = (dur: number, vol: number, freq: number) => {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(out);
      src.start(t);
    };
    switch (name) {
      case 'hit':
        tone('sine', 180, 40, 0.35, 0.6);
        noise(0.25, 0.5, 900);
        break;
      case 'flash':
        tone('sawtooth', 1200, 300, 0.2, 0.12);
        noise(0.15, 0.3, 3000);
        break;
      case 'chime':
        tone('sine', 880, 880, 0.5, 0.2);
        tone('sine', 1320, 1320, 0.6, 0.15, 0.12);
        break;
      case 'pop':
        tone('sine', 400, 900, 0.08, 0.25);
        break;
      case 'whoosh':
        noise(0.4, 0.4, 1500);
        break;
    }
  }

  bgm(src?: string, volume = 1) {
    if (this.bgmEl) {
      this.bgmEl.pause();
      this.bgmEl = undefined;
    }
    if (!src) return;
    const a = new Audio(src);
    a.loop = true;
    a.volume = (this._muted ? 0 : this._volume) * 0.5 * volume;
    this.bgmEl = a;
    void a.play().catch(() => undefined);
  }
}
