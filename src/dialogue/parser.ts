/**
 * 대사 인라인 태그 파서 (허용 목록 기반)
 *
 *   {red}강조{/red}  {blue} {green} {yellow}  {color:#ff8800}..{/color}
 *   {b}굵게{/b}      {shake}떨림{/shake}
 *   {wait:500}       해당 위치에서 500ms 멈춤
 *   {speed:0.5}      이후 출력 속도 배율 (0.5 = 절반 속도)
 *   {{               리터럴 '{'
 *
 * 알 수 없는 태그는 그대로 글자로 출력한다.
 */
export type Style = { color?: string; bold?: boolean; shake?: boolean };

export type Token =
  | { type: 'char'; ch: string; style: Style }
  | { type: 'wait'; ms: number }
  | { type: 'speed'; factor: number };

const NAMED_COLORS: Record<string, string> = {
  red: '#ff5d5d',
  blue: '#5cb6ff',
  green: '#5fe39a',
  yellow: '#ffd84d',
};

const TAG_RE = /^(\/?)([a-z]+)(?::([^}]*))?$/;

export function parseLine(src: string): Token[] {
  const out: Token[] = [];
  const stack: Style[] = [{}];
  const cur = () => stack[stack.length - 1];
  const chars = Array.from(src); // 서로게이트/이모지 안전

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === '{') {
      if (chars[i + 1] === '{') {
        out.push({ type: 'char', ch: '{', style: cur() });
        i++;
        continue;
      }
      const end = chars.indexOf('}', i);
      if (end > i) {
        const body = chars.slice(i + 1, end).join('');
        if (applyTag(body, stack, out)) {
          i = end;
          continue;
        }
      }
    }
    out.push({ type: 'char', ch: c, style: cur() });
  }
  return out;
}

function applyTag(body: string, stack: Style[], out: Token[]): boolean {
  const m = TAG_RE.exec(body);
  if (!m) return false;
  const [, close, name, arg] = m;
  const top = stack[stack.length - 1];

  if (close) {
    if (!(name in NAMED_COLORS) && !['color', 'b', 'shake'].includes(name)) return false;
    if (stack.length > 1) stack.pop();
    return true;
  }
  if (name in NAMED_COLORS) {
    stack.push({ ...top, color: NAMED_COLORS[name] });
    return true;
  }
  switch (name) {
    case 'color':
      if (!arg || !/^#[0-9a-f]{3,8}$/i.test(arg)) return false;
      stack.push({ ...top, color: arg });
      return true;
    case 'b':
      stack.push({ ...top, bold: true });
      return true;
    case 'shake':
      stack.push({ ...top, shake: true });
      return true;
    case 'wait': {
      const ms = Number(arg);
      if (!Number.isFinite(ms) || ms < 0) return false;
      out.push({ type: 'wait', ms: Math.min(ms, 10000) });
      return true;
    }
    case 'speed': {
      const f = Number(arg);
      if (!Number.isFinite(f) || f <= 0) return false;
      out.push({ type: 'speed', factor: f });
      return true;
    }
  }
  return false;
}

/** 태그를 제거한 순수 텍스트 (로그, 스크린리더용) */
export function plainText(tokens: Token[]) {
  return tokens.map((t) => (t.type === 'char' ? t.ch : '')).join('');
}
