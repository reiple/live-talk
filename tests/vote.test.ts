import { describe, expect, it } from 'vitest';
import { parseVoteText, percent, winnerIndex } from '../src/vote/VotePanel';

describe('parseVoteText', () => {
  it('accepts 1, !1, 1번 (with spaces)', () => {
    expect(parseVoteText('1', 3)).toBe(0);
    expect(parseVoteText('!2', 3)).toBe(1);
    expect(parseVoteText(' 3번 ', 3)).toBe(2);
    expect(parseVoteText('! 1', 3)).toBe(0);
  });

  it('rejects out-of-range numbers and normal chat', () => {
    expect(parseVoteText('4', 3)).toBeNull();
    expect(parseVoteText('0', 3)).toBeNull();
    expect(parseVoteText('1등', 3)).toBeNull();
    expect(parseVoteText('나는 1', 3)).toBeNull();
    expect(parseVoteText('12', 3)).toBeNull();
    expect(parseVoteText('', 3)).toBeNull();
  });
});

describe('winnerIndex', () => {
  it('picks the most votes', () => {
    expect(winnerIndex([1, 5, 3])).toBe(1);
  });
  it('ties go to the earlier option, no votes → first', () => {
    expect(winnerIndex([2, 4, 4])).toBe(1);
    expect(winnerIndex([0, 0])).toBe(0);
  });
});

describe('percent', () => {
  it('rounds and handles zero total', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBe(0);
  });
});
