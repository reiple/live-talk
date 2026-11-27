/**
 * TTS: OpenAI 호환 음성 API(/v1/audio/speech)로 프록시한다.
 * 엔진(MeloTTS 등)은 tts 컨테이너가 감싸므로 여기서는 몰라도 된다.
 */

export interface TtsConfig {
  /** 비어 있으면 TTS 끔 */
  baseUrl: string;
  model: string;
  voice: string;
  timeoutMs: number;
}

export function loadTtsConfig(env: Record<string, string | undefined> = process.env): TtsConfig {
  const base = env.TTS_BASE_URL ?? 'http://localhost:8880/v1';
  return {
    baseUrl: base.replace(/\/+$/, ''),
    model: env.TTS_MODEL || 'melotts-kr',
    voice: env.TTS_VOICE || 'KR',
    timeoutMs: Number(env.TTS_TIMEOUT_MS) || 15000,
  };
}

export const MAX_TTS_TEXT = 200;

/**
 * 읽을 문장 정리: 대사 태그/이모지/제어문자 제거, 공백 정리, 길이 제한.
 * 읽을 글자(한글/영문/숫자)가 없으면 null.
 */
export function cleanTtsText(raw: unknown): string | null {
  const t = String(raw ?? '')
    .replace(/\{[^}]*\}/g, '') // {red} {wait:300} 같은 대사 태그
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TTS_TEXT);
  return /[\p{L}\p{N}]/u.test(t) ? t : null;
}

/** 캐릭터별 목소리 설정 (스크립트 characters[who].tts) */
export function voiceFor(
  characters: Record<string, { tts?: { voice?: string; speed?: number } }> | undefined,
  who: string,
  cfg: TtsConfig,
): { voice: string; speed: number } {
  const t = characters?.[who]?.tts ?? {};
  const speed = typeof t.speed === 'number' && t.speed >= 0.5 && t.speed <= 2 ? t.speed : 1;
  return { voice: typeof t.voice === 'string' && t.voice ? t.voice : cfg.voice, speed };
}

export async function synthesize(cfg: TtsConfig, text: string, voice: string, speed: number, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(cfg.timeoutMs);
  return fetch(`${cfg.baseUrl}/audio/speech`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    body: JSON.stringify({ model: cfg.model, input: text, voice, speed, response_format: 'wav' }),
  });
}

export async function ttsHealth(cfg: TtsConfig): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.baseUrl) return { ok: false, error: 'TTS 꺼짐 (TTS_BASE_URL 비어 있음)' };
  try {
    const res = await fetch(`${cfg.baseUrl}/models`, { signal: AbortSignal.timeout(3000) });
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
