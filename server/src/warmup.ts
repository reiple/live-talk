/**
 * 모델 미리 올리기.
 *
 * 서버를 켠 직후 첫 요청은 모델을 GPU 에 올리느라 수십 초가 걸려(qwen3:8b 약 20~70초)
 * 요청 시간 제한을 넘긴다. 서버 시작 시 LLM 과 모델이 준비될 때까지 기다렸다가
 * 아주 작은 요청을 한 번 보내 모델을 올려 둔다. 그동안 상태는 "불러오는 중".
 */

export type WarmState = 'waiting' | 'loading' | 'ready';

export interface WarmerDeps {
  /** LLM 서버 연결 + 모델 준비 여부 */
  check(): Promise<{ reachable: boolean; modelReady: boolean }>;
  /** 모델을 올리는 작은 요청 */
  load(): Promise<void>;
  sleep(ms: number): Promise<void>;
  log(msg: string): void;
  now(): number;
}

export class Warmer {
  state: WarmState = 'waiting';
  error?: string;
  private stopped = false;
  private d: WarmerDeps;
  private retryMs: number;

  // 매개변수 프로퍼티(private d: ...)는 Node 의 타입 제거 실행에서 쓸 수 없어 필드로 둔다
  constructor(d: WarmerDeps, retryMs = 3000) {
    this.d = d;
    this.retryMs = retryMs;
  }

  get ready() {
    return this.state === 'ready';
  }

  /** 상태를 사람이 읽을 문장으로 */
  get message() {
    if (this.state === 'ready') return '준비됨';
    if (this.state === 'loading') return '모델을 GPU 에 불러오는 중';
    return this.error ? `LLM 서버를 기다리는 중 (${this.error})` : 'LLM 서버를 기다리는 중';
  }

  stop() {
    this.stopped = true;
  }

  /** 준비될 때까지 재시도. 준비되면 끝난다. */
  async run(): Promise<void> {
    let lastLog = 0;
    while (!this.stopped) {
      const h = await this.d.check().catch((e: Error) => ({ reachable: false, modelReady: false, err: e.message }));
      if (!h.reachable || !h.modelReady) {
        this.state = 'waiting';
        this.error = !h.reachable ? '연결 안 됨' : '모델 없음 (다운로드 중일 수 있음)';
        if (this.d.now() - lastLog > 30_000) {
          this.d.log(`[warmup] ${this.message}`);
          lastLog = this.d.now();
        }
        await this.d.sleep(this.retryMs);
        continue;
      }
      this.state = 'loading';
      this.error = undefined;
      const t0 = this.d.now();
      this.d.log('[warmup] 모델을 불러오는 중…');
      try {
        await this.d.load();
        this.state = 'ready';
        this.d.log(`[warmup] 준비 완료 (${this.d.now() - t0}ms)`);
        return;
      } catch (e) {
        this.state = 'waiting';
        this.error = (e as Error).message;
        this.d.log(`[warmup] 실패, 다시 시도: ${this.error}`);
        await this.d.sleep(this.retryMs);
      }
    }
  }
}
