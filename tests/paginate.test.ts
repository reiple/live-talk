import { describe, expect, it } from 'vitest';
import { pageIndexes } from '../src/dialogue/paginate';

describe('pageIndexes', () => {
  const LH = 80;
  const lines = (...counts: number[]) => counts.flatMap((c, line) => Array(c).fill(line * LH));

  it('fits in one page when ≤ 3 lines', () => {
    expect(new Set(pageIndexes(lines(5, 5, 5), LH))).toEqual(new Set([0]));
  });

  it('splits every 3 lines', () => {
    const idx = pageIndexes(lines(2, 2, 2, 2, 2, 2, 2), LH);
    expect(idx).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2]);
  });

  it('treats sub-pixel jitter (inline-block, bold) as the same line', () => {
    expect(pageIndexes([0, 2, -1, 3, 80, 81], LH)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('respects custom maxLines', () => {
    expect(pageIndexes(lines(1, 1, 1), LH, 1)).toEqual([0, 1, 2]);
  });

  it('falls back to a single page when layout is unavailable', () => {
    expect(pageIndexes([0, 0, 0], NaN)).toEqual([0, 0, 0]);
    expect(pageIndexes([], LH)).toEqual([]);
  });
});
