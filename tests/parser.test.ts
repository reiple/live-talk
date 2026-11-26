import { describe, expect, it } from 'vitest';
import { parseLine, plainText } from '../src/dialogue/parser';
import { filterText } from '../src/chat/ChatPanel';

describe('parseLine', () => {
  it('plain text → char tokens', () => {
    const t = parseLine('안녕!');
    expect(t).toHaveLength(3);
    expect(plainText(t)).toBe('안녕!');
  });

  it('color tags apply and close', () => {
    const t = parseLine('a{red}b{/red}c');
    expect(plainText(t)).toBe('abc');
    const [a, b, c] = t as { type: 'char'; style: { color?: string } }[];
    expect(a.style.color).toBeUndefined();
    expect(b.style.color).toBe('#ff5d5d');
    expect(c.style.color).toBeUndefined();
  });

  it('nested styles merge', () => {
    const t = parseLine('{red}{shake}x{/shake}{/red}');
    expect(t[0]).toMatchObject({ type: 'char', ch: 'x', style: { color: '#ff5d5d', shake: true } });
  });

  it('wait and speed tokens', () => {
    const t = parseLine('a{wait:300}{speed:0.5}b');
    expect(t.map((x) => x.type)).toEqual(['char', 'wait', 'speed', 'char']);
    expect(t[1]).toEqual({ type: 'wait', ms: 300 });
    expect(t[2]).toEqual({ type: 'speed', factor: 0.5 });
  });

  it('unknown / malformed tags are printed literally', () => {
    expect(plainText(parseLine('{user} {wait:abc} {color:red}'))).toBe('{user} {wait:abc} {color:red}');
  });

  it('html is never interpreted (tokens are plain chars)', () => {
    expect(plainText(parseLine('<img onerror=x>'))).toBe('<img onerror=x>');
  });

  it('{{ escapes a brace', () => {
    expect(plainText(parseLine('{{red}'))).toBe('{red}');
  });

  it('emoji is one token', () => {
    expect(parseLine('🍰')).toHaveLength(1);
  });
});

describe('filterText', () => {
  it('masks banned words and caps length', () => {
    expect(filterText('이 시발')).toBe('이 **');
    expect(filterText('a'.repeat(150))).toHaveLength(100);
  });
});
