import { $, h, fmtNum, reducedMotion } from '../util';

export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** 이미지 파일 없이 쓸 수 있는 CSS 배경 프리셋 */
const BG_PRESETS: Record<string, string> = {
  studio: [
    'radial-gradient(ellipse 30% 22% at 78% 22%, #ff6fc855 0, transparent 70%)',
    'radial-gradient(ellipse 26% 30% at 18% 28%, #3fe0c255 0, transparent 70%)',
    'repeating-linear-gradient(90deg, #ffffff06 0 2px, transparent 2px 160px)',
    'linear-gradient(180deg, #232a52 0%, #1a1f40 66%, #121530 66.2%, #0d1026 100%)',
  ].join(','),
  night: [
    'radial-gradient(circle at 80% 18%, #fff7c8 0 3%, #fff7c822 3.4%, transparent 12%)',
    'radial-gradient(1px 1px at 20% 30%, #fff 50%, transparent), radial-gradient(1px 1px at 60% 12%, #fff 50%, transparent)',
    'linear-gradient(180deg, #0a0f2c 0%, #1d2a5a 60%, #33245a 100%)',
  ].join(','),
  cafe: [
    'radial-gradient(ellipse 40% 30% at 50% 0%, #ffd9a055 0, transparent 70%)',
    'repeating-linear-gradient(90deg, #00000010 0 3px, transparent 3px 120px)',
    'linear-gradient(180deg, #6b4a36 0%, #57392a 64%, #3b261c 64.3%, #2c1c15 100%)',
  ].join(','),
};

export class Stage {
  readonly el: HTMLElement;
  private wrap: HTMLElement;
  private bgLayers: [HTMLElement, HTMLElement];
  private bgIdx = 0;
  private flash: HTMLElement;
  private cutin: HTMLElement;
  private alerts: HTMLElement;
  private screenMsg: HTMLElement;

  constructor(wrap: HTMLElement) {
    this.wrap = wrap;
    this.el = $('#stage', wrap);
    this.bgLayers = [$('#bg-a', wrap), $('#bg-b', wrap)];
    this.flash = $('#fx-flash', wrap);
    this.cutin = $('#fx-cutin', wrap);
    this.alerts = $('#alert-layer', wrap);
    this.screenMsg = $('#screen-msg', wrap);
    new ResizeObserver(() => this.fit()).observe(wrap);
    this.fit();
  }

  /** 1920×1080 스테이지를 컨테이너 크기에 맞춰 스케일 (letterbox) */
  fit() {
    const w = this.wrap.clientWidth;
    const hgt = this.wrap.clientHeight;
    const s = Math.min(w / STAGE_W, hgt / STAGE_H) || 0;
    const x = (w - STAGE_W * s) / 2;
    const y = (hgt - STAGE_H * s) / 2;
    this.el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  }

  setBackground(src: string, transition: 'cut' | 'fade' = 'fade') {
    const css = BG_PRESETS[src] ?? `center / cover no-repeat url("${encodeURI(src)}")`;
    const next = this.bgLayers[1 - this.bgIdx];
    const prev = this.bgLayers[this.bgIdx];
    next.style.background = css;
    next.style.transition = transition === 'cut' || reducedMotion() ? 'none' : '';
    prev.style.transition = next.style.transition;
    next.classList.add('on');
    prev.classList.remove('on');
    this.bgIdx = 1 - this.bgIdx;
  }

  effect(type: 'shake' | 'flash' | 'cutin', text?: string) {
    const rm = reducedMotion();
    if (type === 'shake') {
      if (rm) return;
      this.el.classList.remove('shake');
      void this.el.offsetWidth;
      this.el.classList.add('shake');
      setTimeout(() => this.el.classList.remove('shake'), 500);
    } else if (type === 'flash') {
      if (rm) return;
      this.flash.classList.remove('on');
      void this.flash.offsetWidth;
      this.flash.classList.add('on');
    } else if (type === 'cutin') {
      this.cutin.querySelector('span')!.textContent = text ?? '잠깐!';
      this.cutin.classList.remove('on');
      void this.cutin.offsetWidth;
      this.cutin.classList.add('on');
      setTimeout(() => this.cutin.classList.remove('on'), 1300);
    }
  }

  /** 후원 알림 팝업 */
  donationAlert(user: string, amount: number, text: string) {
    const card = h('div', 'alert-card');
    const head = h('div', 'alert-head');
    head.append(h('b', '', user), document.createTextNode(` 님이 `), h('em', '', `${fmtNum(amount)}코인`), document.createTextNode(' 후원!'));
    card.append(h('div', 'alert-icon', '★'), head, h('div', 'alert-msg', text));
    this.alerts.append(card);
    setTimeout(() => card.classList.add('out'), 4200);
    setTimeout(() => card.remove(), 4800);
  }

  showScreen(msg: string | null) {
    this.screenMsg.textContent = msg ?? '';
    this.screenMsg.classList.toggle('on', !!msg);
  }
}
