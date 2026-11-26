import { describe, expect, it } from 'vitest';
import { EMOTE_NAMES, emoteUrl, splitEmotes } from '../src/chat/emotes';

describe('splitEmotes', () => {
  it('splits known codes into emote segments', () => {
    expect(splitEmotes('하루 :하트: 귀여워')).toEqual([
      { type: 'text', text: '하루 ' },
      { type: 'emote', name: '하트' },
      { type: 'text', text: ' 귀여워' },
    ]);
  });

  it('keeps unknown codes as text', () => {
    expect(splitEmotes(':없는거: 안녕')).toEqual([{ type: 'text', text: ':없는거: 안녕' }]);
  });

  it('handles adjacent and overlapping colons', () => {
    expect(splitEmotes(':하트::케이크:')).toEqual([
      { type: 'emote', name: '하트' },
      { type: 'emote', name: '케이크' },
    ]);
    expect(splitEmotes('a:b:하트:')).toEqual([
      { type: 'text', text: 'a:b' },
      { type: 'emote', name: '하트' },
    ]);
  });

  it('plain text stays a single segment', () => {
    expect(splitEmotes('그냥 채팅')).toEqual([{ type: 'text', text: '그냥 채팅' }]);
    expect(splitEmotes('')).toEqual([]);
  });
});

describe('emoteUrl', () => {
  it('returns an SVG data URL for every emote, without <text> (web fonts are unavailable in SVG images)', () => {
    for (const name of EMOTE_NAMES) {
      const url = emoteUrl(name)!;
      expect(url.startsWith('data:image/svg+xml')).toBe(true);
      expect(decodeURIComponent(url)).not.toContain('<text');
    }
    expect(emoteUrl('없음')).toBeUndefined();
  });
});
