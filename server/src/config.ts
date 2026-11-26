/**
 * LLM 공급자 설정.
 *
 * 서버는 OpenAI 호환 API(/v1/chat/completions)만 쓰므로 Ollama, vLLM 어느 쪽이든 동작한다.
 * LLM_PROVIDER 하나만 바꾸면 주소/모델/생각 모드 끄는 옵션이 공급자에 맞게 바뀌고,
 * 각 값은 환경 변수로 개별 지정할 수도 있다.
 */

export type Provider = 'ollama' | 'vllm';

export interface LlmConfig {
  provider: Provider;
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  /** 요청 본문에 그대로 합쳐 넣는 공급자별 옵션 (예: 생각 모드 끄기) */
  extraBody: Record<string, unknown>;
}

const DEFAULTS: Record<Provider, Omit<LlmConfig, 'provider' | 'apiKey' | 'timeoutMs'>> = {
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen3:8b',
    // Qwen3 등 생각 모드가 있는 모델: 끄면 응답이 약 10배 빨라진다 (방송용 짧은 대답에 충분)
    extraBody: { reasoning_effort: 'none' },
  },
  vllm: {
    baseUrl: 'http://localhost:8000/v1',
    model: 'Qwen/Qwen3-4B-AWQ',
    extraBody: { chat_template_kwargs: { enable_thinking: false } },
  },
};

export function loadConfig(env: Record<string, string | undefined> = process.env): LlmConfig {
  const provider: Provider = env.LLM_PROVIDER === 'vllm' ? 'vllm' : 'ollama';
  const d = DEFAULTS[provider];
  let extraBody = d.extraBody;
  if (env.LLM_EXTRA_BODY) {
    try {
      extraBody = JSON.parse(env.LLM_EXTRA_BODY);
    } catch {
      throw new Error('LLM_EXTRA_BODY 는 JSON 이어야 합니다');
    }
  }
  return {
    provider,
    baseUrl: (env.LLM_BASE_URL || (provider === 'vllm' ? env.VLLM_BASE_URL : env.OLLAMA_BASE_URL) || d.baseUrl).replace(/\/+$/, ''),
    model: env.LLM_MODEL || (provider === 'vllm' ? env.VLLM_MODEL : env.OLLAMA_MODEL) || d.model,
    apiKey: env.LLM_API_KEY ?? '',
    timeoutMs: Number(env.LLM_TIMEOUT_MS) || 20000,
    extraBody,
  };
}
