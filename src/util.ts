export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 일시정지 게이트: paused 상태면 wait()가 resume()까지 대기한다. */
export class Gate {
  private paused = false;
  private waiters: (() => void)[] = [];
  private listeners: ((p: boolean) => void)[] = [];

  get isPaused() {
    return this.paused;
  }
  pause() {
    this.paused = true;
    this.listeners.forEach((f) => f(true));
  }
  resume() {
    this.paused = false;
    this.waiters.splice(0).forEach((f) => f());
    this.listeners.forEach((f) => f(false));
  }
  toggle() {
    if (this.paused) this.resume();
    else this.pause();
  }
  onChange(f: (p: boolean) => void) {
    this.listeners.push(f);
  }
  wait(): Promise<void> {
    return this.paused ? new Promise((r) => this.waiters.push(r)) : Promise.resolve();
  }
}

export const store = {
  get<T>(key: string, def: T): T {
    try {
      const v = localStorage.getItem(key);
      return v == null ? def : { ...def, ...JSON.parse(v) };
    } catch {
      return def;
    }
  },
  getRaw<T>(key: string, def: T): T {
    try {
      const v = localStorage.getItem(key);
      return v == null ? def : (JSON.parse(v) as T);
    } catch {
      return def;
    }
  },
  set(key: string, v: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* 저장 불가 환경은 무시 */
    }
  },
};

export function $<T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T {
  const e = root.querySelector<T>(sel);
  if (!e) throw new Error(`element not found: ${sel}`);
  return e;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const fmtNum = (n: number) => n.toLocaleString('ko-KR');

export function fmtTime(sec: number) {
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  const ss = Math.floor(sec % 60);
  return [hh, mm, ss].map((v) => String(v).padStart(2, '0')).join(':');
}

/** 이름 문자열 → 고정된 채팅 닉네임 색상 */
export function nameColor(name: string) {
  let x = 0;
  for (const c of name) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${x % 360} 70% 68%)`;
}
