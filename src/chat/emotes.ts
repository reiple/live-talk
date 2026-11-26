/**
 * 오리지널 채팅 이모티콘 (CHT-05)
 * 채팅에서 `:이름:` 으로 입력하면 이미지로 바뀐다. 모두 코드로 그린 SVG.
 * SVG 이미지 안에서는 웹폰트를 쓸 수 없으므로 글자도 path 로 그린다.
 */

const FACE = (inner: string) => `
  <circle cx="32" cy="35" r="25" fill="#f7dccb"/>
  <path d="M8 34 C5 8 59 8 56 34 L51 22 L45 30 L39 17 L32 28 L25 17 L19 30 L13 22 Z" fill="#45d6b5"/>
  ${inner}`;

const BLUSH = '<ellipse cx="17" cy="44" rx="5" ry="3" fill="#ff8fa3" opacity=".6"/><ellipse cx="47" cy="44" rx="5" ry="3" fill="#ff8fa3" opacity=".6"/>';
const INK = '#1d2238';
const MOUTH = '#8a3846';

const SVGS: Record<string, string> = {
  하루웃음: FACE(`
    <path d="M17 38 Q22 31 27 38 M37 38 Q42 31 47 38" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <path d="M24 46 Q32 57 40 46 Z" fill="${MOUTH}"/>${BLUSH}`),
  하루놀람: FACE(`
    <circle cx="22" cy="38" r="4.5" fill="${INK}"/><circle cx="42" cy="38" r="4.5" fill="${INK}"/>
    <circle cx="20.5" cy="36.5" r="1.5" fill="#fff"/><circle cx="40.5" cy="36.5" r="1.5" fill="#fff"/>
    <ellipse cx="32" cy="50" rx="5" ry="6" fill="${MOUTH}"/>
    <path d="M52 16 Q57 24 54 28 Q49 30 49 25 Q49 21 52 16Z" fill="#a8dcff"/>`),
  하루눈물: FACE(`
    <path d="M16 40 L27 37 M37 37 L48 40" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <path d="M20 42 Q17 52 21 56 Q25 52 22 42Z M44 42 Q41 52 45 56 Q49 52 46 42Z" fill="#7cc8ff"/>
    <path d="M25 52 Q32 46 39 52" fill="none" stroke="${MOUTH}" stroke-width="3" stroke-linecap="round"/>`),
  하루화남: FACE(`
    <path d="M16 31 L27 35 M48 31 L37 35" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="22" cy="40" r="3.5" fill="${INK}"/><circle cx="42" cy="40" r="3.5" fill="${INK}"/>
    <path d="M25 52 Q32 47 39 52" fill="none" stroke="${MOUTH}" stroke-width="3" stroke-linecap="round"/>
    <path d="M47 12 l4 4 m0 -4 l-4 4 M52 9 l3 3" stroke="#ff5d5d" stroke-width="3" stroke-linecap="round"/>`),
  하트: `
    <path d="M32 56 C10 41 4 28 11 18 C18 9 29 12 32 21 C35 12 46 9 53 18 C60 28 54 41 32 56Z" fill="#ff5c8a"/>
    <ellipse cx="20" cy="22" rx="5" ry="3" fill="#fff" opacity=".55" transform="rotate(-35 20 22)"/>`,
  케이크: `
    <path d="M6 40 L58 40 L58 56 L6 56Z" fill="#f3d3a4"/>
    <path d="M6 46 L58 46 L58 49 L6 49Z" fill="#ff9fb2"/>
    <path d="M6 40 L46 20 L58 40Z" fill="#fffaf2"/>
    <path d="M6 40 Q12 44 18 40 Q24 44 30 40 Q36 44 42 40 Q48 44 58 40" fill="none" stroke="#fffaf2" stroke-width="4"/>
    <circle cx="46" cy="18" r="8" fill="#ff4d5e"/>
    <path d="M42 11 L46 14 L50 11" fill="none" stroke="#3fbf6a" stroke-width="3" stroke-linecap="round"/>`,
  ㅋㅋ: `
    <rect x="4" y="12" width="56" height="40" rx="12" fill="#ffd84d"/>
    <path d="M18 52 L14 60 L26 52Z" fill="#ffd84d"/>
    <path d="M13 22 H28 V43 M15 32.5 H28 M36 22 H51 V43 M38 32.5 H51" fill="none" stroke="#3b2a00" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  박수: `
    <circle cx="32" cy="32" r="26" fill="#33e0a8"/>
    <path d="M20 40 L28 22 Q31 18 33 22 L31 30 L40 20 Q43 17 45 20 L38 32 L44 28 Q47 27 47 30 L38 44 Q32 50 24 46Z" fill="#fff"/>
    <path d="M14 18 l-4 -4 M18 12 l-1 -5 M50 46 l5 3" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
};

export const EMOTE_NAMES = Object.keys(SVGS);

const cache = new Map<string, string>();
export function emoteUrl(name: string): string | undefined {
  const svg = SVGS[name];
  if (!svg) return undefined;
  let url = cache.get(name);
  if (!url) {
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${svg}</svg>`,
    )}`;
    cache.set(name, url);
  }
  return url;
}

export type Segment = { type: 'text'; text: string } | { type: 'emote'; name: string };

/** 채팅 문자열을 텍스트/이모티콘 조각으로 나눈다. 모르는 :코드: 는 텍스트 그대로. */
export function splitEmotes(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /:([^\s:]{1,12}):/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (!(m[1] in SVGS)) {
      re.lastIndex = m.index + 1; // ':a:하트:' 처럼 겹치는 경우를 위해 한 글자만 전진
      continue;
    }
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    out.push({ type: 'emote', name: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

/** 세그먼트를 DOM 으로. 텍스트는 textContent 로만 넣는다 (XSS 방지). */
export function renderSegments(target: HTMLElement, segs: Segment[]) {
  const onlyEmotes = segs.length > 0 && segs.every((s) => s.type === 'emote' || !s.text.trim());
  for (const s of segs) {
    if (s.type === 'text') target.append(document.createTextNode(s.text));
    else {
      const img = document.createElement('img');
      img.className = onlyEmotes ? 'emote big' : 'emote';
      img.src = emoteUrl(s.name)!;
      img.alt = `:${s.name}:`;
      img.title = s.name;
      img.draggable = false;
      target.append(img);
    }
  }
}
