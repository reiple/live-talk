import type { SoundManager } from '../audio/SoundManager';
import { Gate, h, reducedMotion, sleep } from '../util';
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

  private state: 'idle' | 'typing' | 'waiting' = 'idle';
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
    else if (this.state === 'waiting') this.finishWait();
  }

  /** 진행 중인 대사를 즉시 종료 (재시작 등) */
  abort() {
    this.aborted = true;
    this.skip = true;
    this.finishWait();
  }

  clear() {
    this.textEl.textContent = '';
    this.plate.hidden = true;
    this.next.classList.remove('on');
    this.root.classList.add('empty');
  }

  async say(o: SayOptions, onTalk: (on: boolean) => void): Promise<void> {
    this.aborted = false;
    this.skip = false;
    this.root.classList.remove('empty');

    // 이름표
    this.plate.hidden = !o.name;
    this.plateText.textContent = o.name ?? '';
    if (o.nameColor) this.plate.style.setProperty('--name-color', o.nameColor);
    else this.plate.style.removeProperty('--name-color');

    // 전체 문장을 미리 배치한 뒤 글자 노출만 제어 → 출력 도중 줄바꿈 위치가 바뀌지 않는다
    const tokens = parseLine(o.text);
    const steps = this.build(tokens);
    const plain = plainText(tokens);

    const entry = { name: o.name, text: plain };
    this.history.push(entry);
    if (this.history.length > 300) this.history.shift();
    this.onLine?.(entry);
    this.live.textContent = o.name ? `${o.name}: ${plain}` : plain;

    this.state = 'typing';
    this.next.classList.remove('on');
    onTalk(true);

    const base = reducedMotion() ? 0 : this.settings().charMs;
    let factor = o.speed ?? 1;
    let n = 0;
    for (const s of steps) {
      if (this.aborted) break;
      if (this.skip || base === 0) break;
      if ('wait' in s) {
        await this.delay(s.wait);
        continue;
      }
      if ('speed' in s) {
        factor = s.speed;
        continue;
      }
      s.span.classList.add('on');
      const ch = s.span.textContent ?? '';
      if (ch.trim() && n++ % 2 === 0) this.sound.blip(o.voice);
      let d = base / factor;
      if (/[,，、]/.test(ch)) d += base * 4;
      else if (/[.!?。…~]/.test(ch)) d += base * 7;
      await this.delay(d);
    }
    this.textEl.querySelectorAll('.ch').forEach((c) => c.classList.add('on'));
    onTalk(false);
    if (this.aborted) {
      this.state = 'idle';
      return;
    }

    this.state = 'waiting';
    this.next.classList.add('on');
    await this.waitAdvance(plain.length);
    this.next.classList.remove('on');
    this.state = 'idle';
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

  private waitAdvance(len: number) {
    return new Promise<void>((resolve) => {
      this.resolveWait = resolve;
      let elapsed = 0;
      const tick = () => {
        if (this.resolveWait !== resolve) return;
        const st = this.settings();
        if (st.auto && !this.gate.isPaused) {
          elapsed += 100;
          if (elapsed >= st.autoDelay + len * 45) {
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
