import { EXPRESSION_NAMES } from '../stage/characters';

export interface AiReply {
  expr: string;
  text: string;
}

export interface AiReplyRequest {
  who?: string;
  chat: { user: string; text: string };
  history: { user?: string; text: string; role: 'viewer' | 'host' }[];
  context: string[];
}

export interface AiHealth {
  ok: boolean;
  provider?: string;
  model?: string;
  error?: string;
}

/** AI 대화 서버(/api) 클라이언트. 서버 주소는 Vite 프록시로 연결된다. */
export class AiClient {
  constructor(
    private script: string,
    private base = `${import.meta.env.BASE_URL}api`,
  ) {}

  async health(): Promise<AiHealth> {
    try {
      const res = await fetch(`${this.base}/health`, { signal: AbortSignal.timeout(4000) });
      const json = (await res.json().catch(() => ({}))) as AiHealth;
      return { ...json, ok: res.ok && !!json.ok };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async reply(req: AiReplyRequest, signal?: AbortSignal): Promise<AiReply> {
    const timeout = AbortSignal.timeout(25000);
    const res = await fetch(`${this.base}/reply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ script: this.script, ...req }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const json = (await res.json().catch(() => ({}))) as Partial<AiReply> & { error?: string };
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    return sanitizeAiReply(json);
  }
}

/** 서버가 어떤 모델/구현이든 화면에 넣기 전에 한 번 더 정리한다. */
export function sanitizeAiReply(r: Partial<AiReply>): AiReply {
  const text = String(r.text ?? '')
    .replace(/[{}]/g, '') // 대사 태그로 해석되지 않게
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  if (!text) throw new Error('빈 대답');
  return { expr: EXPRESSION_NAMES.includes(String(r.expr)) ? String(r.expr) : 'normal', text };
}
