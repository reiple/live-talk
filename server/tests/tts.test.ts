import { describe, expect, it } from 'vitest';
import { cleanTtsText, loadTtsConfig, voiceFor } from '../src/tts.ts';

describe('cleanTtsText', () => {
  it('대사 태그, 이모지, 제어문자를 지우고 공백을 정리한다', () => {
    expect(cleanTtsText('어째서 {red}그걸{/red}\n알고 {wait:300}있죠? 😏')).toBe('어째서 그걸 알고 있죠?');
  });
  it('읽을 글자가 없으면 null', () => {
    expect(cleanTtsText('…!!! 😂')).toBeNull();
    expect(cleanTtsText('   ')).toBeNull();
    expect(cleanTtsText(undefined)).toBeNull();
  });
  it('200자로 자른다', () => {
    expect(cleanTtsText('가'.repeat(500))).toHaveLength(200);
  });
});

describe('voiceFor', () => {
  const cfg = loadTtsConfig({});
  it('캐릭터 설정이 있으면 그 목소리/속도, 없으면 기본값', () => {
    const chars = { host: { tts: { voice: 'KR2', speed: 1.2 } }, guest: {} };
    expect(voiceFor(chars, 'host', cfg)).toEqual({ voice: 'KR2', speed: 1.2 });
    expect(voiceFor(chars, 'guest', cfg)).toEqual({ voice: 'KR', speed: 1 });
    expect(voiceFor(undefined, 'x', cfg)).toEqual({ voice: 'KR', speed: 1 });
  });
  it('속도는 0.5~2 범위만 받는다', () => {
    expect(voiceFor({ a: { tts: { speed: 9 } } }, 'a', cfg).speed).toBe(1);
  });
});

describe('loadTtsConfig', () => {
  it('기본값과 끄기', () => {
    expect(loadTtsConfig({}).baseUrl).toBe('http://localhost:8880/v1');
    expect(loadTtsConfig({ TTS_BASE_URL: '' }).baseUrl).toBe('');
    expect(loadTtsConfig({ TTS_BASE_URL: 'http://tts:8880/v1/' }).baseUrl).toBe('http://tts:8880/v1');
  });
});
