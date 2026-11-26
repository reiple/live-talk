import type { SoundManager } from '../audio/SoundManager';
import type { DialogueBox } from '../dialogue/DialogueBox';
import type { CharacterLayer } from '../stage/characters';
import type { Stage } from '../stage/Stage';
import { Gate, sleep } from '../util';
import { percent, type VotePanel } from '../vote/VotePanel';
import type { Command, ScriptFile } from './types';

export interface RunnerDeps {
  stage: Stage;
  chars: CharacterLayer;
  dialogue: DialogueBox;
  sound: SoundManager;
  gate: Gate;
  vote: VotePanel;
  /** 스크립트의 chat 명령 */
  chat(user: string, text: string, donation?: number): void;
  /** say 의 reactions → 봇 채팅 반응 */
  react(lines: string[]): void;
  notice(text?: string): void;
  onEnd(): void;
}

/**
 * 명령 큐 기반 스크립트 실행기.
 *  - 순차 실행 / 일시정지(gate) / 처음부터
 *  - inject(): 다음 명령 전에 끼워넣기 (운영자 즉석 대사)
 *  - callLabel(): 서브루틴 호출 (채팅 트리거)
 */
export class ScriptRunner {
  state: 'idle' | 'running' | 'ended' = 'idle';
  private pc = 0;
  private stack: number[] = [];
  private injected: Command[] = [];
  private labels = new Map<string, number>();
  private epoch = 0;
  private vars: Record<string, string> = {};

  constructor(
    readonly file: ScriptFile,
    private d: RunnerDeps,
  ) {
    file.script.forEach((c, i) => {
      if (c.cmd === 'label') this.labels.set(c.name, i);
    });
  }

  start() {
    const ep = ++this.epoch;
    this.pc = 0;
    this.stack = [];
    this.injected = [];
    this.d.vote.abort();
    this.d.dialogue.abort();
    this.d.dialogue.clear();
    this.d.chars.clear();
    this.d.stage.showScreen(null);
    this.d.gate.resume();
    void this.loop(ep);
  }

  stop() {
    this.epoch++;
    this.d.vote.abort();
    this.d.dialogue.abort();
    this.state = 'ended';
  }

  /** 다음 명령 전에 끼워넣는다. 실행 중이 아니면(종료 후) 끼워넣은 명령만 바로 실행한다. */
  inject(...cmds: Command[]) {
    this.injected.push(...cmds);
    if (this.state !== 'running') void this.drain(this.epoch);
  }

  private async drain(ep: number) {
    this.state = 'running';
    while (ep === this.epoch && this.injected.length) {
      await this.d.gate.wait();
      const c = this.injected.shift()!;
      try {
        await this.exec(c, ep);
      } catch (e) {
        console.error('[script] 명령 실행 실패', c, e);
      }
    }
    if (ep === this.epoch) this.state = 'ended';
  }

  hasLabel(name: string) {
    return this.labels.has(name);
  }

  callLabel(name: string, vars: Record<string, string> = {}) {
    if (!this.labels.has(name) || this.state !== 'running') return false;
    // 반응 대사가 줄줄이 쌓이지 않도록, 대기 중인 호출이 있으면 무시
    if (this.injected.some((c) => c.cmd === 'call')) return false;
    this.injected.push({ cmd: 'call', to: name });
    this.vars = vars;
    return true;
  }

  private async loop(ep: number) {
    this.state = 'running';
    const script = this.file.script;
    while (ep === this.epoch) {
      await this.d.gate.wait();
      if (ep !== this.epoch) return;

      let cmd = this.injected.shift();
      if (!cmd) {
        if (this.pc >= script.length) {
          if (this.file.meta.loop) {
            this.pc = 0;
            this.stack = [];
            continue;
          }
          break;
        }
        cmd = script[this.pc++];
      }
      try {
        if ((await this.exec(cmd, ep)) === 'end') break;
      } catch (e) {
        console.error('[script] 명령 실행 실패', cmd, e);
      }
    }
    if (ep === this.epoch) {
      this.state = 'ended';
      this.d.onEnd();
    }
  }

  private sub(text: string) {
    return text.replace(/\$(\w+)/g, (m, k: string) => this.vars[k] ?? m);
  }

  private async exec(c: Command, ep: number): Promise<void | 'end'> {
    const { stage, chars, dialogue, sound } = this.d;
    switch (c.cmd) {
      case 'say': {
        const def = c.who ? this.file.characters[c.who] : undefined;
        if (c.who && def && !chars.has(c.who)) chars.show(c.who, 'center');
        if (c.who && c.expr) chars.setExpr(c.who, c.expr);
        chars.focus(c.who);
        if (c.reactions?.length) this.d.react(c.reactions);
        await dialogue.say(
          {
            name: def?.name ?? (c.who && !def ? c.who : undefined),
            nameColor: def?.nameColor,
            text: this.sub(c.text),
            voice: def?.voice,
            speed: c.speed,
          },
          (on) => chars.talk(c.who, on),
        );
        return;
      }
      case 'expr':
        chars.setExpr(c.who, c.expr);
        return;
      case 'show':
        chars.show(c.who, c.pos ?? 'center', c.expr);
        return;
      case 'hide':
        chars.hide(c.who);
        return;
      case 'bg':
        stage.setBackground(c.src, c.transition);
        return;
      case 'effect':
        stage.effect(c.type, c.text);
        return;
      case 'sfx':
        sound.sfx(c.src);
        return;
      case 'bgm':
        sound.bgm(c.src, c.volume);
        return;
      case 'chat':
        this.d.chat(c.user, this.sub(c.text), c.donation);
        return;
      case 'banner':
        stage.banner(c.text ?? this.file.meta.title, c.sub ?? this.file.meta.channel, c.ms);
        return;
      case 'notice':
        this.d.notice(c.text);
        return;
      case 'vote': {
        if (!c.options || c.options.length < 2) return;
        const r = await this.d.vote.run(c.question, c.options, c.seconds ?? 20);
        if (!r || ep !== this.epoch) return;
        const win = c.options[r.index];
        this.vars = { ...this.vars, winner: win.text, winnerPct: String(percent(r.counts[r.index], r.total)) };
        const i = win.jump ? this.labels.get(win.jump) : undefined;
        if (i != null) this.pc = i + 1;
        return;
      }
      case 'wait': {
        let left = c.ms;
        while (left > 0 && ep === this.epoch) {
          await sleep(Math.min(50, left));
          left -= 50;
          await this.d.gate.wait();
        }
        return;
      }
      case 'label':
        return;
      case 'jump': {
        const i = this.labels.get(c.to);
        if (i != null) this.pc = i + 1;
        return;
      }
      case 'call': {
        const i = this.labels.get(c.to);
        if (i != null) {
          this.stack.push(this.pc);
          this.pc = i + 1;
        }
        return;
      }
      case 'return':
        this.pc = this.stack.pop() ?? this.pc;
        return;
      case 'end':
        // 서브루틴 안에서의 end 는 무시하지 않고 방송 종료로 처리
        return 'end';
    }
  }
}
