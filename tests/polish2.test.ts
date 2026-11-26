import { describe, expect, it } from 'vitest';
import { isBridgeMessage } from '../src/chat/ChatBridge';
import { fmtClock } from '../src/chat/ChatPanel';
import { parseMetaInput } from '../src/meta';

describe('parseMetaInput (ADM-04)', () => {
  it('공백 정리, 길이 제한, 태그 중복 제거·최대 5개', () => {
    const r = parseMetaInput('  새   제목  ', ' 게임 ', '토크, 추리,토크, #버튜버, a,b,c,d');
    expect(r).toEqual({ title: '새 제목', category: '게임', tags: ['토크', '추리', '버튜버', 'a', 'b'] });
    expect(parseMetaInput('가'.repeat(100), '', '')!.title).toHaveLength(80);
  });
  it('제목이 비면 null', () => {
    expect(parseMetaInput('   ', '게임', '')).toBeNull();
  });
});

describe('fmtClock', () => {
  it('HH:MM', () => {
    expect(fmtClock(new Date(2026, 0, 1, 9, 5).getTime())).toBe('09:05');
    expect(fmtClock(new Date(2026, 0, 1, 21, 30).getTime())).toBe('21:30');
  });
});

describe('isBridgeMessage', () => {
  it('정상 메시지만 통과', () => {
    expect(isBridgeMessage({ type: 'hello' })).toBe(true);
    expect(isBridgeMessage({ type: 'send', text: '안녕' })).toBe(true);
    expect(isBridgeMessage({ type: 'msg', m: { user: 'a', text: 'b' } })).toBe(true);
    expect(isBridgeMessage({ type: 'snapshot', log: [{ user: 'a', text: 'b' }], notice: 'n' })).toBe(true);
    expect(isBridgeMessage({ type: 'notice' })).toBe(true);
  });
  it('형식이 깨진 메시지는 거부', () => {
    expect(isBridgeMessage(null)).toBe(false);
    expect(isBridgeMessage({ type: 'send', text: 1 })).toBe(false);
    expect(isBridgeMessage({ type: 'msg', m: { user: 'a' } })).toBe(false);
    expect(isBridgeMessage({ type: 'snapshot', log: [{}] })).toBe(false);
    expect(isBridgeMessage({ type: 'eval', code: 'x' })).toBe(false);
  });
});
