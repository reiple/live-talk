import { $, fmtNum, h, nameColor } from '../util';

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
  private stick = true;
  private sendHandlers: ((text: string) => void)[] = [];

  constructor(root: HTMLElement) {
    this.list = $('#chat-list', root);
    this.jump = $<HTMLButtonElement>('#chat-jump', root);
    this.input = $<HTMLInputElement>('#chat-input', root);
    this.input.maxLength = MAX_LEN;

    this.list.addEventListener('scroll', () => {
      const atBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 24;
      this.stick = atBottom;
      this.jump.hidden = atBottom;
    });
    this.jump.addEventListener('click', () => this.scrollToEnd());

    $<HTMLFormElement>('#chat-form', root).addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (!text) return;
      this.input.value = '';
      this.sendHandlers.forEach((f) => f(text));
    });
  }

  onSend(f: (text: string) => void) {
    this.sendHandlers.push(f);
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
      row.append(head, h('div', 'don-text', filterText(m.text)));
    } else {
      for (const b of m.badges ?? []) row.append(h('span', `badge badge-${b}`, BADGE_LABEL[b]));
      const nick = h('span', 'nick', m.user);
      nick.style.color = m.badges?.includes('me') ? 'var(--accent)' : nameColor(m.user);
      // textContent 로만 렌더링 → HTML 삽입(XSS) 불가
      row.append(nick, h('span', 'text', filterText(m.text)));
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
