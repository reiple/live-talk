import type { SoundManager } from './SoundManager';

/**
 * 캐릭터 음성 (SCR-07) + 음성 볼륨 립싱크 (CHR-05)
 *  - /api/tts 에서 wav 를 받아 Web Audio 로 재생
 *  - 재생 중 볼륨(RMS)을 매 프레임 측정해 입을 움직인다
 *  - 같은 대사는 다시 받지 않도록 캐시, 다음 대사는 미리 받아 둔다
 */

export interface Speech {
  /** 음성 길이 (초) */
  duration: number;
  /** 재생이 끝나거나 멈추면 */
  done: Promise<void>;
  stop(): void;
}

/** 소리 내어 읽을 문장: 이모지 제거, 공백 정리. 읽을 글자가 없으면 null */
export function speechText(plain: string): string | null {
  const t = plain
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return /[\p{L}\p{N}]/u.test(t) ? t : null;
}

/** 시간 영역 샘플의 RMS (0~1) */
export function rms(data: Float32Array) {
  let s = 0;
  for (let i = 0; i < data.length; i++) s += data[i] * data[i];
  return Math.sqrt(s / (data.length || 1));
}

const CACHE_MAX = 40;

export class VoicePlayer {
  /** 사용자 설정 (캐릭터 음성 켜기/끄기) */
  enabled = true;
  /** TTS 서버 사용 가능 여부 */
  available = false;
  model = '';
  private cache = new Map<string, Promise<AudioBuffer | null>>();
  private sound: SoundManager;
  private script: string;
  private base: string;

  constructor(sound: SoundManager, script: string, base = `${import.meta.env.BASE_URL}api`) {
    this.sound = sound;
    this.script = script;
    this.base = base;
  }

  async check(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.base}/tts/health`, { signal: AbortSignal.timeout(4000) });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; model?: string; error?: string };
      this.available = res.ok && !!json.ok;
      this.model = json.model ?? '';
      return { ok: this.available, error: json.error };
    } catch (e) {
      this.available = false;
      return { ok: false, error: (e as Error).message };
    }
  }

  get active() {
    return this.enabled && this.available;
  }

  /** 미리 받아 디코딩해 둔다 (실패하면 null) */
  prepare(plain: string, who: string): Promise<AudioBuffer | null> {
    const text = speechText(plain);
    if (!this.active || !text) return Promise.resolve(null);
    const key = `${who}\n${text}`;
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const p = this.fetchBuffer(text, who);
    this.cache.set(key, p);
    p.then((b) => {
      if (!b) this.cache.delete(key); // 실패는 캐시하지 않는다
    });
    while (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
    return p;
  }

  private async fetchBuffer(text: string, who: string): Promise<AudioBuffer | null> {
    try {
      const res = await fetch(`${this.base}/tts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ script: this.script, who, text }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.status !== 200) return null;
      const ctx = this.sound.context;
      if (!ctx) return null;
      return await ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  /**
   * 재생을 시작한다. waitMs 안에 음성이 준비되지 않으면 null (목소리 없이 진행).
   * onLevel: 재생 중 매 프레임 볼륨(0~1), 끝나면 0.
   */
  async speak(plain: string, who: string, onLevel: (level: number) => void, waitMs = 2500): Promise<Speech | null> {
    if (!this.active) return null;
    const buf = await Promise.race([this.prepare(plain, who), new Promise<null>((r) => setTimeout(() => r(null), waitMs))]);
    const ctx = this.sound.context;
    const out = this.sound.output;
    if (!buf || !ctx || !out) return null;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    // 분석기는 볼륨 노드 앞: 음소거해도 입은 움직인다
    src.connect(analyser);
    analyser.connect(out);
    const data = new Float32Array(analyser.fftSize);
    let raf = 0;
    let ended = false;
    const tick = () => {
      if (ended) return;
      analyser.getFloatTimeDomainData(data);
      onLevel(Math.min(1, rms(data) * 3));
      raf = requestAnimationFrame(tick);
    };
    const done = new Promise<void>((resolve) => {
      src.onended = () => {
        ended = true;
        cancelAnimationFrame(raf);
        onLevel(0);
        src.disconnect();
        analyser.disconnect();
        resolve();
      };
    });
    src.start();
    tick();
    return {
      duration: buf.duration,
      done,
      stop: () => {
        try {
          src.stop();
        } catch {
          /* 이미 끝남 */
        }
      },
    };
  }
}
