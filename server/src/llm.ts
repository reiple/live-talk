import type { LlmConfig } from './config.ts';
import { REPLY_SCHEMA } from './reply.ts';

export class LlmError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const headers = (cfg: LlmConfig) => ({
  'content-type': 'application/json',
  ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
});

/** OpenAI 호환 /chat/completions 호출. JSON 스키마로 출력 형식을 강제한다. */
export async function complete(cfg: LlmConfig, messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
  const timeout = AbortSignal.timeout(cfg.timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: headers(cfg),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: 0.8,
        max_tokens: 400,
        response_format: { type: 'json_schema', json_schema: { name: 'reply', schema: REPLY_SCHEMA, strict: true } },
        ...cfg.extraBody,
      }),
    });
  } catch (e) {
    if (timeout.aborted) throw new LlmError(`LLM 응답 시간 초과 (${cfg.timeoutMs}ms)`, 504);
    throw new LlmError(`LLM 서버에 연결할 수 없습니다: ${(e as Error).message}`, 503);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new LlmError(`LLM 오류 ${res.status}: ${body.slice(0, 300)}`, 502);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new LlmError('LLM 응답이 비어 있습니다', 502);
  return content;
}

/** /models 로 서버 연결과 모델 준비 여부 확인 (Ollama, vLLM 공통) */
export async function health(cfg: LlmConfig): Promise<{ reachable: boolean; modelReady: boolean; error?: string }> {
  try {
    const res = await fetch(`${cfg.baseUrl}/models`, { headers: headers(cfg), signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { reachable: true, modelReady: false, error: `HTTP ${res.status}` };
    const json = (await res.json()) as { data?: { id: string }[] };
    return { reachable: true, modelReady: !!json.data?.some((m) => m.id === cfg.model) };
  } catch (e) {
    return { reachable: false, modelReady: false, error: (e as Error).message };
  }
}
