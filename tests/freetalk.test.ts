import { describe, expect, it } from 'vitest';
import { sanitizeAiReply } from '../src/ai/AiClient';
import { pickCandidate, scoreCandidate, type Candidate } from '../src/ai/FreeTalk';

const NOW = 1_000_000;
const c = (text: string, extra: Partial<Candidate> = {}): Candidate => ({ user: 'u', text, at: NOW, ...extra });

describe('scoreCandidate', () => {
  it('답할 가치가 없는 채팅은 건너뛴다', () => {
    for (const t of ['ㅋㅋㅋㅋ', 'ㅎㅇㅎㅇ', '!!', '1', '!2', '3번', ':하트: :하트:', 'a']) {
      expect(scoreCandidate(c(t), NOW, '하루'), t).toBeNull();
    }
  });

  it('20초가 지난 채팅은 건너뛴다', () => {
    expect(scoreCandidate(c('오늘 뭐 했어?', { at: NOW - 21_000 }), NOW, '하루')).toBeNull();
  });

  it('이벤트는 짧아도 대답 대상', () => {
    expect(scoreCandidate(c('팔', { event: true }), NOW, '하루')).not.toBeNull();
  });
});

describe('pickCandidate 우선순위', () => {
  it('내 채팅 > 후원 > 이벤트 > 이름 부르기/질문 > 일반, 같으면 최신', () => {
    const plain = c('오늘 날씨 좋다');
    const question = c('저녁 뭐 먹었어?');
    const named = c('하루 화이팅', {});
    const event = c('방금 팔로우했어요', { event: true });
    const donation = c('응원해요', { donation: 1000 });
    const me = c('나도 질문', { me: true });
    expect(pickCandidate([plain, question], NOW, '하루')).toBe(question);
    expect(pickCandidate([plain, named], NOW, '하루')).toBe(named);
    expect(pickCandidate([question, event], NOW, '하루')).toBe(event);
    expect(pickCandidate([event, donation], NOW, '하루')).toBe(donation);
    expect(pickCandidate([donation, me], NOW, '하루')).toBe(me);
    const older = c('오늘 날씨 좋다', { at: NOW - 5000 });
    expect(pickCandidate([older, plain], NOW, '하루')).toBe(plain);
    expect(pickCandidate([c('ㅋㅋㅋ')], NOW, '하루')).toBeUndefined();
  });
});

describe('sanitizeAiReply', () => {
  it('모르는 표정은 normal, 대사 태그 문자 제거, 길이 제한', () => {
    expect(sanitizeAiReply({ expr: 'x', text: '{wait:9999}안녕' })).toEqual({ expr: 'normal', text: 'wait:9999안녕' });
    expect(sanitizeAiReply({ expr: 'smile', text: '가'.repeat(300) }).text).toHaveLength(120);
    expect(() => sanitizeAiReply({ expr: 'smile', text: ' ' })).toThrow();
  });
});
