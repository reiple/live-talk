import type { SoundManager } from '../audio/SoundManager';
import type { Speech } from '../audio/Voice';
import { Gate, h, reducedMotion, sleep } from '../util';
import { pageIndexes } from './paginate';
import { parseLine, plainText, type Token } from './parser';

export interface DialogueSettings {
  /** 글자당 출력 간격(ms). 0 = 즉시 */
  charMs: number;
  auto: boolean;
  /** 자동 진행 기본 대기(ms) */
  autoDelay: number;
}

export interface SayOptions {
  name?: string;
  nameColor?: string;
  text: string;
  voice?: string;
  speed?: number;
}

export interface LogEntry {
  name?: string;
  text: string;
}

type Step = { span: HTMLElement } | { wait: number } | { speed: number };

export class DialogueBox {
  readonly history: LogEntry[] = [];
  onLine?: (e: LogEntry) => void;

  private root: HTMLElement;
  private plate: HTMLElement;
  private plateText: HTMLElement;
  private textEl: HTMLElement;
  private next: HTMLElement;
  private live: HTMLElement;

  private state: 'idle' | 'typing' | 'voicing' | 'waiting' = 'idle';
  private speech?: Speech;
  private skip = false;
  private aborted = false;
  private resolveWait?: () => void;

  constructor(
    root: HTMLElement,
    live: HTMLElement,
    private sound: SoundManager,
    private gate: Gate,
    private settings: () => DialogueSettings,
  ) {
    this.root = root;
    this.plate = root.querySelector('.nameplate')!;
    this.plateText = this.plate.querySelector('span')!;
    this.textEl = root.querySelector('.dlg-text')!;
    this.next = root.querySelector('.dlg-next')!;
    this.live = live;
  }

  get busy() {
    return this.state !== 'idle';
  }

  /** 클릭/Space: 출력 중이면 전체 표시, 대기 중이면 다음 대사 */
  advance() {
    if (this.state === 'typing') this.skip = true;
    else if (this.state === 'voicing') this.speech?.stop();
    else if (this.state === 'waiting') this.finishWait();
  }

  /** 진행 중인 대사를 즉시 종료 (재시작 등) */
  abort() {
    this.aborted = true;
    this.skip = true;
    this.speech?.stop();
    this.finishWait();
  }

  clear() {
    this.textEl.textContent = '';
    this.plate.hidden = true;
    this.next.classList.remove('on');
    this.root.classList.add('empty');
  }

  private setName(name?: string, color?: string) {
    this.plate.hidden = !name;
    this.plateText.textContent = name ?? '';
    if (color) this.plate.style.setProperty('--name-color', color);
    else this.plate.style.removeProperty('--name-color');
  }

  /** 대답을 기다리는 동안: 직전 대사 대신 '생각 중' 점 애니메이션 */
  showThinking(name?: string, color?: string) {
    if (this.state !== 'idle') return;
    this.root.classList.remove('empty');
    this.setName(name, color);
    this.next.classList.remove('on');
    this.textEl.textContent = '';
    const dots = h('span', 'thinking-dots');
    dots.setAttribute('role', 'img');
    dots.setAttribute('aria-label', '생각 중');
    dots.append(h('i'), h('i'), h('i'));
    this.textEl.append(dots);
  }

  /**
   * speech 가 있으면 (캐릭터 음성 재생 중):
   *  - 글자 출력 속도를 음성 길이에 맞춘다 (대사 태그의 속도/멈춤은 무시, 효과음 끔)
   *  - 출력이 끝나도 음성이 끝날 때까지 기다린다 (클릭하면 음성을 멈추고 넘어감)
   */
  async say(o: SayOptions, onTalk: (on: boolean) => void, speech?: Speech): Promise<void> {
    this.aborted = false;
    this.skip = false;
    this.speech = speech;
    this.root.classList.remove('empty');

    this.setName(o.name, o.nameColor);

    // 전체 문장을 미리 배치한 뒤 글자 노출만 제어 → 출력 도중 줄바꿈 위치가 바뀌지 않는다
    const tokens = parseLine(o.text);
    const steps = this.build(tokens);
    const plain = plainText(tokens);

    const entry = { name: o.name, text: plain };
    this.history.push(entry);
    if (this.history.length > 300) this.history.shift();
    this.onLine?.(entry);
    this.live.textContent = o.name ? `${o.name}: ${plain}` : plain;

    // 최대 줄 수를 넘으면 페이지로 나눠 출력 (DLG-03)
    const pages = this.paginate(steps);
    const chars = steps.filter((s) => 'span' in s && s.span.textContent?.trim()).length;
    const userMs = this.settings().charMs;
    // '즉시' 설정과 움직임 줄이기는 음성이 있어도 글자를 바로 보여 준다
    const base =
      reducedMotion() || userMs === 0
        ? 0
        : speech
          ? Math.min(400, Math.max(12, (speech.duration * 1000 * 0.92) / Math.max(1, chars)))
          : userMs;
    let factor = o.speed ?? 1;
    let n = 0;

    for (let p = 0; p < pages.length && !this.aborted; p++) {
      this.showPage(pages, p);
      this.skip = false;
      this.state = 'typing';
      this.next.classList.remove('on');
      onTalk(true);

      for (const s of pages[p]) {
        if (this.aborted || this.skip || base === 0) break;
        if ('wait' in s) {
          if (!speech) await this.delay(s.wait);
          continue;
        }
        if ('speed' in s) {
          if (!speech) factor = s.speed;
          continue;
        }
        s.span.classList.add('on');
        const ch = s.span.textContent ?? '';
        if (!speech && ch.trim() && n++ % 2 === 0) this.sound.blip(o.voice);
        let d = base / factor;
        if (!speech && /[,，、]/.test(ch)) d += base * 4;
        else if (!speech && /[.!?。…~]/.test(ch)) d += base * 7;
        // 음성이 있으면 공백은 바로 넘긴다 (글자 수 기준으로 속도를 맞췄으므로)
        await this.delay(speech && !ch.trim() ? 0 : d);
      }
      // 일시 속도 변경이 건너뛰어진 경우에도 다음 페이지에 반영
      for (const s of pages[p]) if ('speed' in s) factor = s.speed;
      for (const s of pages[p]) if ('span' in s) s.span.classList.add('on');
      const last = p === pages.length - 1;
      if (speech && last && !this.aborted) {
        // 음성이 끝날 때까지 (클릭하면 음성을 멈추고 넘어감)
        this.state = 'voicing';
        await speech.done;
      }
      onTalk(false);
      if (this.aborted) break;

      this.state = 'waiting';
      this.next.classList.add('on');
      this.root.dataset.page = `${p + 1}/${pages.length}`;
      const len = pages[p].filter((s) => 'span' in s).length;
      // 음성이 이어지는 중간 페이지는 짧게, 음성이 끝난 마지막 페이지는 기본 대기만
      await this.waitAdvance(speech ? 0 : len, speech && !last ? 250 : undefined);
      this.next.classList.remove('on');
    }
    speech?.stop();
    this.speech = undefined;
    this.state = 'idle';
  }

  /** 글자 위치를 측정해 MAX_LINES 줄 단위 페이지로 나눈다. */
  private paginate(steps: Step[]): Step[][] {
    const spans = steps.filter((s): s is { span: HTMLElement } => 'span' in s);
    const cs = getComputedStyle(this.textEl);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
    const idx = pageIndexes(
      spans.map((s) => s.span.offsetTop),
      lh,
    );
    const pageOf = new Map(spans.map((s, i) => [s.span, idx[i]]));
    const pages: Step[][] = [[]];
    let cur = 0;
    for (const s of steps) {
      if ('span' in s) cur = pageOf.get(s.span) ?? cur;
      (pages[cur] ??= []).push(s);
    }
    return pages.filter((p) => p.length);
  }

  private showPage(pages: Step[][], p: number) {
    pages.forEach((page, i) => {
      for (const s of page) if ('span' in s) s.span.classList.toggle('off-page', i !== p);
    });
  }

  private build(tokens: Token[]): Step[] {
    this.textEl.textContent = '';
    const steps: Step[] = [];
    for (const t of tokens) {
      if (t.type === 'wait') steps.push({ wait: t.ms });
      else if (t.type === 'speed') steps.push({ speed: t.factor });
      else {
        const span = h('span', 'ch', t.ch);
        if (t.style.color) span.style.color = t.style.color;
        if (t.style.bold) span.classList.add('b');
        if (t.style.shake && t.ch.trim()) span.classList.add('shk');
        this.textEl.append(span);
        steps.push({ span });
      }
    }
    return steps;
  }

  /** 일시정지를 존중하고, skip 시 빠르게 탈출하는 지연 */
  private async delay(ms: number) {
    let left = ms;
    while (left > 0 && !this.skip) {
      const step = Math.min(left, 50);
      await sleep(step);
      left -= step;
      await this.gate.wait();
    }
  }

  private finishWait() {
    const r = this.resolveWait;
    this.resolveWait = undefined;
    r?.();
  }

  private waitAdvance(len: number, fixedMs?: number) {
    return new Promise<void>((resolve) => {
      this.resolveWait = resolve;
      let elapsed = 0;
      const tick = () => {
        if (this.resolveWait !== resolve) return;
        const st = this.settings();
        if (st.auto && !this.gate.isPaused) {
          elapsed += 100;
          if (elapsed >= (fixedMs ?? st.autoDelay + len * 45)) {
            this.finishWait();
            return;
          }
        }
        setTimeout(tick, 100);
      };
      setTimeout(tick, 100);
    });
  }
}
