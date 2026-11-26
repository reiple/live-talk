import type { CharacterDef, Position } from '../script/types';
import { h, rand } from '../util';

export interface CharView {
  el: HTMLElement;
  setExpr(expr: string): void;
  setTalking(on: boolean): void;
  /** 시선 방향. x, y 는 -1(왼쪽/위) ~ 1(오른쪽/아래) */
  lookAt?(x: number, y: number): void;
  destroy(): void;
}

/* ------------------------------------------------------------------ */
/* 플레이스홀더 캐릭터 (SVG) — 오리지널 임시 캐릭터                     */
/* ------------------------------------------------------------------ */

type Expr = {
  brow: [l: number, r: number, dy: number];
  mouth: [closed: string, open: string];
  eyeY: number;
  look: [number, number];
  tilt: number;
  blush?: boolean;
  sweat?: boolean;
  arm?: boolean;
};

const EXPRS: Record<string, Expr> = {
  normal: {
    brow: [0, 0, 0],
    mouth: ['M282 462 Q300 470 318 462', 'M284 458 Q300 454 316 458 Q314 478 300 480 Q286 478 284 458 Z'],
    eyeY: 1,
    look: [0, 0],
    tilt: 0,
  },
  smile: {
    brow: [-5, 5, -4],
    mouth: ['M272 452 Q300 484 328 452', 'M272 450 Q300 446 328 450 Q322 492 300 494 Q278 492 272 450 Z'],
    eyeY: 0.5,
    look: [0, 2],
    tilt: 2,
    blush: true,
  },
  angry: {
    brow: [16, -16, 6],
    mouth: ['M282 470 Q300 460 318 470', 'M280 462 Q300 454 320 462 L318 482 Q300 476 282 482 Z'],
    eyeY: 0.85,
    look: [0, 2],
    tilt: 0,
  },
  surprised: {
    brow: [-8, 8, -16],
    mouth: ['M292 466 a8 10 0 1 0 16 0 a8 10 0 1 0 -16 0', 'M284 464 a16 20 0 1 0 32 0 a16 20 0 1 0 -32 0'],
    eyeY: 1.12,
    look: [0, 0],
    tilt: 0,
    sweat: true,
  },
  thinking: {
    brow: [-10, 6, -4],
    mouth: ['M286 468 Q302 468 316 458', 'M286 462 Q302 460 316 456 Q314 476 300 478 Q288 476 286 462 Z'],
    eyeY: 0.9,
    look: [-7, -9],
    tilt: -5,
  },
  point: {
    brow: [12, -12, 2],
    mouth: ['M284 466 L316 466', 'M282 460 Q300 456 318 460 Q316 484 300 486 Q284 484 282 460 Z'],
    eyeY: 0.95,
    look: [7, 0],
    tilt: 0,
    arm: true,
  },
  sad: {
    brow: [-14, 14, 0],
    mouth: ['M284 470 Q300 460 316 470', 'M286 464 Q300 458 314 464 Q312 480 300 482 Q288 480 286 464 Z'],
    eyeY: 0.8,
    look: [0, 5],
    tilt: 3,
    sweat: true,
  },
};

export const EXPRESSION_NAMES = Object.keys(EXPRS);

function placeholderSvg(p: Required<NonNullable<CharacterDef['palette']>>) {
  return `
<svg class="pc" viewBox="0 0 600 800" aria-hidden="true">
  <g class="pc-body">
    <path fill="${p.hair}" d="M150 360 C140 210 220 165 300 165 C380 165 460 210 450 360 L464 560 L410 520 L300 545 L190 520 L136 560 Z"/>
    <rect class="skin" x="266" y="480" width="68" height="110" rx="24"/>
    <path fill="${p.outfit}" d="M104 800 C104 650 178 572 300 572 C422 572 496 650 496 800 Z"/>
    <path class="skin" d="M258 574 L300 628 L342 574 Z"/>
    <path fill="none" stroke="#f4f6ff" stroke-width="6" stroke-linecap="round" d="M272 640 L266 724 M328 640 L334 724"/>
    <circle cx="266" cy="730" r="7" fill="#f4f6ff"/><circle cx="334" cy="730" r="7" fill="#f4f6ff"/>
    <g class="pc-arm">
      <path fill="none" stroke="${p.outfit}" stroke-width="78" stroke-linecap="round" d="M430 660 L540 520"/>
      <circle class="skin" cx="556" cy="498" r="34"/>
      <rect class="skin" x="560" y="470" width="40" height="20" rx="10" transform="rotate(-48 560 480)"/>
    </g>
    <g class="pc-head">
      <ellipse class="skin" cx="300" cy="370" rx="140" ry="155"/>
      <ellipse class="blush" cx="222" cy="428" rx="26" ry="12"/>
      <ellipse class="blush" cx="378" cy="428" rx="26" ry="12"/>
      ${[245, 355]
        .map(
          (x) => `
      <g transform="translate(${x} 388)">
        <g class="eye-shape"><g class="eye-blink">
          <ellipse rx="25" ry="31" fill="#fff"/>
          <g class="iris">
            <ellipse rx="18" ry="24" fill="${p.eyes}"/>
            <ellipse rx="8" ry="11" cy="2" fill="#141a30"/>
            <circle cx="-6" cy="-9" r="5.5" fill="#fff"/>
          </g>
        </g></g>
        <path class="lash" d="M-30 -22 Q0 -40 30 -22"/>
      </g>`,
        )
        .join('')}
      <path class="nose" d="M299 418 Q304 428 296 432"/>
      <path class="mouth"/>
      <path class="sweat" d="M432 300 Q446 324 440 336 Q430 346 422 334 Q418 322 432 300 Z"/>
      <path fill="${p.hair}" d="M162 334 C150 205 230 186 300 186 C370 186 450 205 438 334 L415 270 L392 306 L360 254 L330 302 L300 248 L268 304 L238 254 L208 306 L185 270 Z"/>
      <path class="brow brow-l" stroke="${p.hair}" d="M214 334 Q244 320 276 330"/>
      <path class="brow brow-r" stroke="${p.hair}" d="M324 330 Q356 320 386 334"/>
      <path fill="none" stroke="${p.accent}" stroke-width="16" stroke-linecap="round" d="M150 360 C140 150 460 150 450 360"/>
      <rect x="126" y="330" width="44" height="88" rx="18" fill="#232842"/>
      <rect x="430" y="330" width="44" height="88" rx="18" fill="#232842"/>
      <rect x="134" y="346" width="10" height="56" rx="5" fill="${p.accent}"/>
      <rect x="456" y="346" width="10" height="56" rx="5" fill="${p.accent}"/>
      <path fill="none" stroke="#232842" stroke-width="7" stroke-linecap="round" d="M152 412 Q166 486 232 486"/>
      <circle cx="238" cy="486" r="11" fill="#232842"/>
    </g>
  </g>
</svg>`;
}

class PlaceholderCharacter implements CharView {
  el: HTMLElement;
  private svg: SVGSVGElement;
  private mouth: SVGPathElement;
  private expr: Expr = EXPRS.normal;
  private gaze: [number, number] = [0, 0];
  private open = false;
  private talkTimer = 0;
  private blinkTimer = 0;
  private dead = false;

  constructor(def: CharacterDef) {
    this.el = h('div', 'char');
    this.el.innerHTML = placeholderSvg({
      hair: '#45d6b5',
      eyes: '#2e7fb8',
      outfit: '#2c3566',
      accent: '#ff7ab8',
      ...def.palette,
    });
    this.svg = this.el.querySelector('svg')!;
    this.mouth = this.svg.querySelector('.mouth')!;
    this.setExpr('normal');
    this.scheduleBlink();
  }

  private q<T extends Element>(sel: string) {
    return Array.from(this.svg.querySelectorAll<T & SVGElement>(sel));
  }

  setExpr(name: string) {
    const e = EXPRS[name] ?? EXPRS.normal;
    this.expr = e;
    const [l, r, dy] = e.brow;
    this.q('.brow-l')[0].style.transform = `translateY(${dy}px) rotate(${l}deg)`;
    this.q('.brow-r')[0].style.transform = `translateY(${dy}px) rotate(${r}deg)`;
    this.q('.eye-shape').forEach((g) => (g.style.transform = `scaleY(${e.eyeY})`));
    this.applyPose();
    this.svg.classList.toggle('has-blush', !!e.blush);
    this.svg.classList.toggle('has-sweat', !!e.sweat);
    this.svg.classList.toggle('has-arm', !!e.arm);
    this.drawMouth();
  }

  lookAt(x: number, y: number) {
    this.gaze = [Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y))];
    this.applyPose();
  }

  /** 표정의 기본 시선/기울기 + 마우스 시선을 합성 */
  private applyPose() {
    const e = this.expr;
    const [gx, gy] = this.gaze;
    const ix = e.look[0] + gx * 7;
    const iy = e.look[1] + gy * 6;
    this.q('.iris').forEach((g) => (g.style.transform = `translate(${ix}px, ${iy}px)`));
    this.q('.pc-head')[0].style.transform = `translate(${gx * 8}px, ${gy * 5}px) rotate(${e.tilt + gx * 3}deg)`;
  }

  private drawMouth() {
    this.mouth.setAttribute('d', this.expr.mouth[this.open ? 1 : 0]);
    this.mouth.classList.toggle('open', this.open);
  }

  setTalking(on: boolean) {
    clearInterval(this.talkTimer);
    this.el.classList.toggle('talking', on);
    if (on) {
      this.talkTimer = window.setInterval(() => {
        this.open = !this.open || Math.random() < 0.25;
        this.drawMouth();
      }, 95);
    } else {
      this.open = false;
      this.drawMouth();
    }
  }

  private scheduleBlink() {
    this.blinkTimer = window.setTimeout(() => {
      if (this.dead) return;
      this.svg.classList.add('blink');
      setTimeout(() => this.svg.classList.remove('blink'), 130);
      // 가끔 두 번 깜빡임
      if (Math.random() < 0.2) {
        setTimeout(() => {
          this.svg.classList.add('blink');
          setTimeout(() => this.svg.classList.remove('blink'), 110);
        }, 260);
      }
      this.scheduleBlink();
    }, rand(2200, 5500));
  }

  destroy() {
    this.dead = true;
    clearInterval(this.talkTimer);
    clearTimeout(this.blinkTimer);
    this.el.remove();
  }
}

/* ------------------------------------------------------------------ */
/* 스프라이트 캐릭터 — 표정별 [입닫힘, 입열림] PNG 교체                  */
/* ------------------------------------------------------------------ */

class SpriteCharacter implements CharView {
  el: HTMLElement;
  private img: HTMLImageElement;
  private expr = 'normal';
  private open = false;
  private talkTimer = 0;

  constructor(private def: CharacterDef) {
    this.el = h('div', 'char sprite');
    this.img = h('img');
    this.img.alt = '';
    this.el.append(this.img);
    // 프리로드
    Object.values(def.sprites ?? {})
      .flat()
      .forEach((src) => (new Image().src = src));
    this.setExpr('normal');
  }

  private render() {
    const set = this.def.sprites?.[this.expr] ?? Object.values(this.def.sprites ?? {})[0];
    if (set) this.img.src = set[this.open ? 1 : 0];
  }
  setExpr(expr: string) {
    this.expr = expr;
    this.render();
  }
  setTalking(on: boolean) {
    clearInterval(this.talkTimer);
    this.el.classList.toggle('talking', on);
    if (on) {
      this.talkTimer = window.setInterval(() => {
        this.open = !this.open;
        this.render();
      }, 100);
    } else {
      this.open = false;
      this.render();
    }
  }
  destroy() {
    clearInterval(this.talkTimer);
    this.el.remove();
  }
}

/* ------------------------------------------------------------------ */

const POS_X: Record<Position, string> = { left: '26%', center: '50%', right: '74%' };

export class CharacterLayer {
  private views = new Map<string, CharView>();

  constructor(
    private root: HTMLElement,
    private defs: Record<string, CharacterDef>,
  ) {}

  has(id: string) {
    return this.views.has(id);
  }

  show(id: string, pos: Position = 'center', expr?: string) {
    const def = this.defs[id];
    if (!def) return;
    let v = this.views.get(id);
    if (!v) {
      v = def.sprites ? new SpriteCharacter(def) : new PlaceholderCharacter(def);
      v.el.classList.add('entering');
      this.root.append(v.el);
      this.views.set(id, v);
      const el = v.el;
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('entering')));
    }
    v.el.style.left = POS_X[pos];
    if (expr) v.setExpr(expr);
  }

  hide(id: string) {
    const v = this.views.get(id);
    if (!v) return;
    this.views.delete(id);
    v.el.classList.add('entering');
    setTimeout(() => v.destroy(), 400);
  }

  clear() {
    this.views.forEach((v) => v.destroy());
    this.views.clear();
  }

  setExpr(id: string, expr: string) {
    this.views.get(id)?.setExpr(expr);
  }

  /** 모든 캐릭터의 시선을 화면상의 한 점으로 (스테이지 기준 -1 ~ 1) */
  lookAt(x: number, y: number) {
    this.views.forEach((v) => {
      if (!v.lookAt) return;
      // 캐릭터 위치 기준으로 보정: 왼쪽 캐릭터는 같은 점을 더 오른쪽으로 본다
      const cx = (parseFloat(v.el.style.left) || 50) / 50 - 1;
      v.lookAt(x - cx, y);
    });
  }

  talk(id: string | undefined, on: boolean) {
    if (id) this.views.get(id)?.setTalking(on);
  }

  /** 말하는 캐릭터 외에는 살짝 어둡게 */
  focus(id: string | undefined) {
    this.views.forEach((v, k) => v.el.classList.toggle('dim', !!id && k !== id && this.views.size > 1));
  }
}
