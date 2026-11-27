import { describe, expect, it } from 'vitest';
import { rms, speechText } from '../src/audio/Voice';

describe('speechText', () => {
  it('이모지 제거, 공백 정리', () => {
    expect(speechText('안녕  하세요 🍰\n반가워')).toBe('안녕 하세요 반가워');
  });
  it('읽을 글자가 없으면 null', () => {
    expect(speechText('…!!')).toBeNull();
  });
});

describe('rms', () => {
  it('무음은 0, 진폭 a 의 사각파는 a', () => {
    expect(rms(new Float32Array(100))).toBe(0);
    expect(rms(Float32Array.from({ length: 100 }, (_, i) => (i % 2 ? 0.5 : -0.5)))).toBeCloseTo(0.5);
    expect(rms(new Float32Array(0))).toBe(0);
  });
});
