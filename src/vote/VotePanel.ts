import { $, Gate, h, sleep } from '../util';

/**
 * 시청자 투표 선택지 (DLG-14)
 *  - 채팅에 번호(1, !1, 1번)를 입력하거나 선택지를 클릭해서 투표
 *  - 한 사람당 한 표 (처음 투표만 인정)
 *  - 시간이 끝나거나 운영자가 마감하면 최다 득표 선택지를 돌려준다
 */

export interface VoteOption {
  text: string;
  /** 이 선택지가 이기면 이동할 label */
  jump?: string;
  /** 가상 시청자가 고를 상대적 확률 (기본 1, 0 이면 봇이 고르지 않음) */
  weight?: number;
}

export interface VoteResult {
  index: number;
  counts: number[];
  total: number;
}

export const ME = '시청자(나)';

/** 채팅 문자열 → 선택지 번호(0부터). 투표가 아니면 null */
export function parseVoteText(text: string, optionCount: number): number | null {
  const m = /^\s*!?\s*([1-9])\s*(번)?\s*$/.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= optionCount ? n - 1 : null;
}

/** 최다 득표 선택지. 동점이면 앞 번호가 이긴다. */
export function winnerIndex(counts: number[]): number {
  let best = 0;
  counts.forEach((c, i) => {
    if (c > counts[best]) best = i;
  });
  return best;
}

export const percent = (count: number, total: number) => (total ? Math.round((count / total) * 100) : 0);

export interface VoteHooks {
  onStart?(question: string, options: VoteOption[]): void;
  onEnd?(question: string, options: VoteOption[], result: VoteResult): void;
}

export class VotePanel {
  private root: HTMLElement;
  private qEl: HTMLElement;
  private timeEl: HTMLElement;
  private list: HTMLElement;
  private timerBar: HTMLElement;

  private options: VoteOption[] = [];
  private counts: number[] = [];
  private voters = new Map<string, number>();
  private rows: HTMLElement[] = [];
  private finish?: (closed: 'time' | 'closed' | 'abort') => void;

  constructor(
    stage: HTMLElement,
    private gate: Gate,
    private hooks: VoteHooks = {},
  ) {
    this.root = $('#vote', stage);
    this.qEl = $('.vote-q', this.root);
    this.timeEl = $('.vote-time', this.root);
    this.list = $('.vote-opts', this.root);
    this.timerBar = $('.vote-timer i', this.root);
    // 투표 영역 클릭이 대사 진행으로 이어지지 않게
    this.root.addEventListener('click', (e) => e.stopPropagation());
  }

  get active() {
    return !!this.finish;
  }

  get optionCount() {
    return this.options.length;
  }

  /** 봇 투표용: 현재 선택지 가중치 */
  get weights() {
    return this.options.map((o) => Math.max(0, o.weight ?? 1));
  }

  hasVoted(user: string) {
    return this.voters.has(user);
  }

  /** 한 표 행사. 이미 투표했거나 번호가 잘못되면 false */
  cast(user: string, index: number): boolean {
    if (!this.active || index < 0 || index >= this.options.length || this.voters.has(user)) return false;
    this.voters.set(user, index);
    this.counts[index]++;
    if (user === ME) this.rows[index]?.classList.add('mine');
    this.render();
    return true;
  }

  /** 운영자 마감 */
  close() {
    this.finish?.('closed');
  }

  /** 방송 재시작 등으로 투표 취소 */
  abort() {
    this.finish?.('abort');
  }

  async run(question: string, options: VoteOption[], seconds: number): Promise<VoteResult | null> {
    this.abort();
    this.options = options.slice(0, 4);
    this.counts = this.options.map(() => 0);
    this.voters.clear();
    this.qEl.textContent = question;
    this.list.textContent = '';
    this.rows = this.options.map((o, i) => {
      const li = h('li', 'vote-opt');
      const btn = h('button', 'vote-btn');
      btn.type = 'button';
      btn.setAttribute('aria-label', `${i + 1}번 ${o.text}에 투표`);
      btn.append(h('span', 'vote-num', String(i + 1)), h('span', 'vote-text', o.text), h('span', 'vote-pct', '0%'));
      btn.addEventListener('click', () => this.cast(ME, i));
      li.append(h('i', 'vote-bar'), btn, h('span', 'vote-cnt', '0표'));
      this.list.append(li);
      return li;
    });
    this.root.classList.remove('done');
    this.root.hidden = false;
    requestAnimationFrame(() => this.root.classList.add('on'));
    this.render();
    this.hooks.onStart?.(question, this.options);

    // 타이머: 일시정지 중에는 흐르지 않는다
    const total = Math.max(1, seconds) * 1000;
    let left = total;
    const reason = await new Promise<'time' | 'closed' | 'abort'>((resolve) => {
      this.finish = resolve;
      const tick = async () => {
        while (this.finish === resolve && left > 0) {
          await sleep(100);
          await this.gate.wait();
          left -= 100;
          this.timerBar.style.width = `${(Math.max(0, left) / total) * 100}%`;
          this.timeEl.textContent = `${Math.ceil(Math.max(0, left) / 1000)}초`;
        }
        if (this.finish === resolve) resolve('time');
      };
      this.timeEl.textContent = `${Math.ceil(left / 1000)}초`;
      this.timerBar.style.width = '100%';
      void tick();
    });
    this.finish = undefined;

    if (reason === 'abort') {
      this.hide();
      return null;
    }

    const result: VoteResult = {
      index: winnerIndex(this.counts),
      counts: [...this.counts],
      total: this.counts.reduce((a, b) => a + b, 0),
    };
    this.root.classList.add('done');
    this.rows[result.index]?.classList.add('win');
    this.timeEl.textContent = '마감';
    this.hooks.onEnd?.(question, this.options, result);
    await sleep(2200);
    await this.gate.wait();
    this.hide();
    return result;
  }

  private hide() {
    this.root.classList.remove('on');
    setTimeout(() => {
      if (!this.active) this.root.hidden = true;
    }, 300);
  }

  private render() {
    const total = this.counts.reduce((a, b) => a + b, 0);
    const lead = total ? winnerIndex(this.counts) : -1;
    this.rows.forEach((li, i) => {
      const p = percent(this.counts[i], total);
      (li.querySelector('.vote-bar') as HTMLElement).style.width = `${p}%`;
      li.querySelector('.vote-pct')!.textContent = `${p}%`;
      li.querySelector('.vote-cnt')!.textContent = `${this.counts[i]}표`;
      li.classList.toggle('lead', i === lead);
    });
  }
}
