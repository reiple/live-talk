import { parseLine } from '../dialogue/parser';
import { $, fmtNum, h, nameColor } from '../util';
import { EMOTE_NAMES, emoteUrl, renderSegments, splitEmotes } from './emotes';

export interface ChatMessage {
  user: string;
  text: string;
  badges?: ('streamer' | 'manager' | 'sub' | 'me')[];
  donation?: number;
  system?: boolean;
}

const MAX_MESSAGES = 200;
const MAX_LEN = 100;
const BANNED = ['시발', '씨발', '병신', '개새끼', '좆'];

export function filterText(text: string) {
  let t = text.slice(0, MAX_LEN);
  for (const w of BANNED) t = t.split(w).join('*'.repeat(w.length));
  return t;
}

const BADGE_LABEL: Record<string, string> = { streamer: '방장', manager: '매니저', sub: '구독', me: '나' };

export class ChatPanel {
  private list: HTMLElement;
  private jump: HTMLButtonElement;
  private input: HTMLInputElement;
  private notice: HTMLElement;
  private noticeText: HTMLElement;
  private picker: HTMLElement;
  private stick = true;
  private sendHandlers: ((text: string) => void)[] = [];

  constructor(root: HTMLElement) {
    this.list = $('#chat-list', root);
    this.jump = $<HTMLButtonElement>('#chat-jump', root);
    this.input = $<HTMLInputElement>('#chat-input', root);
    this.notice = $('#chat-notice', root);
    this.noticeText = $('.notice-text', this.notice);
    this.picker = $('#emote-picker', root);
    this.input.maxLength = MAX_LEN;

    this.list.addEventListener('scroll', () => {
      const atBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 24;
      this.stick = atBottom;
      this.jump.hidden = atBottom;
    });
    // 레이아웃 변화(화면 회전, 공지 열고 닫기)로 높이가 바뀌어도 바닥에 붙어 있게
    new ResizeObserver(() => {
      if (this.stick) this.list.scrollTop = this.list.scrollHeight;
    }).observe(this.list);
    this.jump.addEventListener('click', () => this.scrollToEnd());

    $<HTMLFormElement>('#chat-form', root).addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (!text) return;
      this.input.value = '';
      this.picker.hidden = true;
      this.sendHandlers.forEach((f) => f(text));
    });

    $('.notice-close', this.notice).addEventListener('click', () => (this.notice.hidden = true));
    this.setupPicker(root);
  }

  private setupPicker(root: HTMLElement) {
    const btn = $<HTMLButtonElement>('#emote-btn', root);
    btn.querySelector('img')!.src = emoteUrl('하루웃음')!;
    for (const name of EMOTE_NAMES) {
      const b = h('button', 'emote-pick');
      b.type = 'button';
      b.title = name;
      b.setAttribute('aria-label', `이모티콘 ${name}`);
      const img = h('img');
      img.src = emoteUrl(name)!;
      img.alt = '';
      b.append(img);
      b.addEventListener('click', () => this.insert(`:${name}:`));
      this.picker.append(b);
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.picker.hidden = !this.picker.hidden;
      btn.setAttribute('aria-expanded', String(!this.picker.hidden));
    });
    document.addEventListener('click', (e) => {
      if (!(e.target as Element).closest('#emote-picker, #emote-btn')) this.picker.hidden = true;
    });
  }

  /** 커서 위치에 이모티콘 코드 삽입 */
  private insert(code: string) {
    const el = this.input;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const pad = start > 0 && el.value[start - 1] !== ' ' ? ' ' : '';
    const next = el.value.slice(0, start) + pad + code + ' ' + el.value.slice(end);
    if (next.length > MAX_LEN) return;
    el.value = next;
    const pos = start + pad.length + code.length + 1;
    el.focus();
    el.setSelectionRange(pos, pos);
  }

  onSend(f: (text: string) => void) {
    this.sendHandlers.push(f);
  }

  /** 고정 공지 (CHT-07). 대사 태그({green} 등)로 색상 강조 가능. 비우면 공지를 내린다. */
  setNotice(text?: string) {
    this.noticeText.textContent = '';
    if (!text?.trim()) {
      this.notice.hidden = true;
      return;
    }
    for (const t of parseLine(text)) {
      if (t.type !== 'char') continue;
      const last = this.noticeText.lastElementChild as HTMLElement | null;
      const color = t.style.color ?? '';
      const bold = !!t.style.bold;
      if (last && last.dataset.c === color && last.dataset.b === String(bold)) last.textContent += t.ch;
      else {
        const span = h('span', '', t.ch);
        span.dataset.c = color;
        span.dataset.b = String(bold);
        if (color) span.style.color = color;
        if (bold || color) span.style.fontWeight = '700';
        this.noticeText.append(span);
      }
    }
    this.notice.hidden = false;
  }

  add(m: ChatMessage) {
    const row = h('div', 'msg');
    if (m.system) {
      row.classList.add('sys');
      row.textContent = m.text;
    } else if (m.donation) {
      row.classList.add('donation');
      const head = h('div', 'don-head');
      head.append(h('span', 'nick', m.user), h('span', 'don-amt', `${fmtNum(m.donation)}코인`));
      const body = h('div', 'don-text');
      renderSegments(body, splitEmotes(filterText(m.text)));
      row.append(head, body);
    } else {
      for (const b of m.badges ?? []) row.append(h('span', `badge badge-${b}`, BADGE_LABEL[b]));
      const nick = h('span', 'nick', m.user);
      nick.style.color = m.badges?.includes('me') ? 'var(--accent)' : nameColor(m.user);
      const body = h('span', 'text');
      // 텍스트는 textContent 로만 렌더링 → HTML 삽입(XSS) 불가
      renderSegments(body, splitEmotes(filterText(m.text)));
      row.append(nick, body);
    }
    this.list.append(row);
    while (this.list.childElementCount > MAX_MESSAGES) this.list.firstElementChild?.remove();
    if (this.stick || m.badges?.includes('me')) this.scrollToEnd();
  }

  private scrollToEnd() {
    this.list.scrollTop = this.list.scrollHeight;
    this.stick = true;
    this.jump.hidden = true;
  }
}
