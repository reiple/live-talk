import { $, h, fmtNum, reducedMotion } from '../util';

export type AlertKind = 'donation' | 'follow' | 'subscribe';
const ALERT_ICON: Record<AlertKind, string> = { donation: '★', follow: '♥', subscribe: '♛' };

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
  private bannerEl: HTMLElement;
  private bannerTimer = 0;
  /** 스테이지 배율 (화면 px = 스테이지 px × scale) */
  scale = 1;

  constructor(wrap: HTMLElement) {
    this.wrap = wrap;
    this.el = $('#stage', wrap);
    this.bgLayers = [$('#bg-a', wrap), $('#bg-b', wrap)];
    this.flash = $('#fx-flash', wrap);
    this.cutin = $('#fx-cutin', wrap);
    this.alerts = $('#alert-layer', wrap);
    this.screenMsg = $('#screen-msg', wrap);
    this.bannerEl = $('#banner', wrap);
    new ResizeObserver(() => this.fit()).observe(wrap);
    this.fit();
  }

  onFit?: (scale: number) => void;

  /** 1920×1080 스테이지를 컨테이너 크기에 맞춰 스케일 (letterbox) */
  fit() {
    const w = this.wrap.clientWidth;
    const hgt = this.wrap.clientHeight;
    const s = Math.min(w / STAGE_W, hgt / STAGE_H) || 0;
    const x = (w - STAGE_W * s) / 2;
    const y = (hgt - STAGE_H * s) / 2;
    this.el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    this.scale = s;
    this.onFit?.(s);
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

  /** 후원 / 팔로우 / 구독 알림 팝업 */
  alert(kind: AlertKind, user: string, opts: { amount?: number; text?: string } = {}) {
    const card = h('div', `alert-card alert-${kind}`);
    const head = h('div', 'alert-head');
    head.append(h('b', '', user), document.createTextNode(' 님이 '));
    if (kind === 'donation') {
      head.append(h('em', '', `${fmtNum(opts.amount ?? 0)}코인`), document.createTextNode(' 후원!'));
    } else if (kind === 'follow') {
      head.append(document.createTextNode('팔로우했어요!'));
    } else {
      head.append(h('em', '', '구독'), document.createTextNode('했어요!'));
    }
    card.append(h('div', 'alert-icon', ALERT_ICON[kind]), head);
    if (opts.text) card.append(h('div', 'alert-msg', opts.text));
    // 같은 자리(상단)를 쓰는 제목 배너는 알림이 오면 먼저 들어간다
    this.bannerEl.classList.remove('on');
    // 알림이 너무 많이 쌓이지 않게 오래된 것부터 제거
    while (this.alerts.childElementCount >= 3) this.alerts.firstElementChild?.remove();
    this.alerts.append(card);
    const ms = kind === 'donation' ? 4200 : 3000;
    setTimeout(() => card.classList.add('out'), ms);
    setTimeout(() => card.remove(), ms + 600);
  }

  /** 방송 제목 배너 (좌상단에서 슬라이드 인) */
  banner(title: string, sub: string, ms = 6000) {
    this.bannerEl.querySelector('.banner-sub')!.textContent = sub;
    this.bannerEl.querySelector('.banner-title')!.textContent = title;
    this.bannerEl.classList.remove('on');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('on');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.bannerEl.classList.remove('on'), ms);
  }

  showScreen(msg: string | null) {
    this.screenMsg.textContent = msg ?? '';
    this.screenMsg.classList.toggle('on', !!msg);
  }
}
