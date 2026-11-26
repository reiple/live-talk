import { Gate, pick, sleep } from '../util';
import type { AiClient, AiReply } from './AiClient';

/**
 * 자유 대화 (SCR-06): 정해진 시간 동안 채팅을 골라 AI 로 대답한다.
 *  - 모든 채팅에 답하지 않고, 우선순위가 가장 높은 채팅 하나씩
 *  - 대답을 기다리는 동안 캐릭터는 고민하는 표정
 *  - 실패하면 준비된 대사, 채팅이 조용하면 잡담 대사
 */

export interface Candidate {
  user: string;
  text: string;
  at: number;
  me?: boolean;
  donation?: number;
  /** 팔로우/구독 같은 이벤트를 채팅처럼 넘긴 것 */
  event?: boolean;
}

const MAX_AGE = 20_000;
const LOW_VALUE = /^[\sㅋㅎㄷㅠㅜㄱㅇ!?.,~^ㄴ]+$/;
const VOTE = /^\s*!?\s*\d+\s*번?\s*$/;
const EMOTE_ONLY = /^(\s*:[^\s:]+:\s*)+$/;

/** 답할 가치가 있는 채팅인가 → 점수. null 이면 건너뜀. */
export function scoreCandidate(c: Candidate, now: number, hostName: string): number | null {
  const age = now - c.at;
  if (age > MAX_AGE) return null;
  const t = c.text.trim();
  if (!c.event && (t.length < 2 || LOW_VALUE.test(t) || VOTE.test(t) || EMOTE_ONLY.test(t))) return null;
  let s = 10;
  if (c.me) s += 100;
  if (c.donation) s += 50;
  if (c.event) s += 40;
  if (t.includes(hostName) || /[?？]\s*$/.test(t)) s += 20;
  if (t.length >= 6) s += 5;
  return s - age / 1000;
}

export function pickCandidate(list: Candidate[], now: number, hostName: string): Candidate | undefined {
  let best: Candidate | undefined;
  let bestScore = -Infinity;
  for (const c of list) {
    const s = scoreCandidate(c, now, hostName);
    if (s != null && s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return best;
}

export interface FreeTalkDeps {
  ai: AiClient;
  gate: Gate;
  hostId: string;
  hostName: string;
  fallback: string[];
  idle: string[];
  say(text: string, expr: string): Promise<void>;
  setExpr(expr: string): void;
  /** 대답 기다리는 동안 대사창 표시 */
  thinking(): void;
  /** 지금 답하는 채팅 표시 (null 이면 숨김) */
  quote(c: Candidate | null): void;
  /** 최근 방송 대사 (분위기 파악용) */
  context(): string[];
  status(msg: string): void;
}

export class FreeTalk {
  active = false;
  private pool: Candidate[] = [];
  private history: { user?: string; text: string; role: 'viewer' | 'host' }[] = [];
  private stopped = false;
  private abortCtl?: AbortController;

  constructor(private d: FreeTalkDeps) {}

  /** 채팅 후보 추가 (자유 대화 중에만 받는다) */
  offer(c: Omit<Candidate, 'at'>) {
    if (!this.active) return;
    this.pool.push({ ...c, at: Date.now() });
    if (this.pool.length > 40) this.pool.splice(0, this.pool.length - 40);
  }

  /** 자유 대화를 바로 끝낸다 (진행 중인 AI 요청도 취소) */
  stop() {
    this.stopped = true;
    this.abortCtl?.abort();
  }

  async run(seconds: number, alive: () => boolean): Promise<void> {
    const h = await this.d.ai.health();
    if (!h.ok) {
      this.d.status('AI 서버에 연결되지 않아 자유 대화를 건너뜁니다.');
      return;
    }
    this.active = true;
    this.stopped = false;
    this.pool = [];
    this.d.status(`자유 대화 시작 (${seconds}초) — 채팅으로 말을 걸어 보세요!`);

    let left = seconds * 1000;
    let quiet = 0;
    const live = () => alive() && !this.stopped;
    try {
      while (left > 0 && live()) {
        const now = Date.now();
        const c = pickCandidate(this.pool, now, this.d.hostName);
        this.pool = this.pool.filter((p) => p !== c && now - p.at <= 20_000);

        if (!c) {
          await sleep(200);
          await this.d.gate.wait();
          left -= 200;
          quiet += 200;
          if (quiet >= 12_000 && this.d.idle.length && live()) {
            quiet = 0;
            const t0 = Date.now();
            await this.d.say(pick(this.d.idle), 'smile');
            left -= Date.now() - t0;
          }
          continue;
        }

        quiet = 0;
        const t0 = Date.now();
        this.d.quote(c);
        this.d.setExpr('thinking');
        this.d.thinking();
        const line = (await this.ask(c)) ?? { expr: 'normal', text: pick(this.d.fallback.length ? this.d.fallback : ['앗, 잠깐 놓쳤어!']) };
        if (!live()) break;
        await this.d.say(line.text, line.expr);
        this.d.quote(null);
        this.history.push({ user: c.user, text: c.text, role: 'viewer' }, { text: line.text, role: 'host' });
        if (this.history.length > 10) this.history.splice(0, this.history.length - 10);
        left -= Date.now() - t0;
      }
    } finally {
      this.active = false;
      this.pool = [];
      this.abortCtl = undefined;
      this.d.quote(null);
    }
  }

  private async ask(c: Candidate): Promise<AiReply | null> {
    this.abortCtl = new AbortController();
    const text = c.event ? `(이벤트) ${c.text}` : c.donation ? `(${c.donation}코인 후원) ${c.text}` : c.text;
    try {
      return await this.d.ai.reply(
        { who: this.d.hostId, chat: { user: c.user, text }, history: this.history, context: this.d.context() },
        this.abortCtl.signal,
      );
    } catch (e) {
      if (!this.stopped) console.warn('[freetalk] AI 대답 실패, 준비된 대사 사용:', (e as Error).message);
      return null;
    }
  }
}
