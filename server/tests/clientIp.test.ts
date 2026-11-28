import { describe, expect, it } from 'vitest';
import { clientIp, trustedHops } from '../src/clientIp.ts';

describe('clientIp', () => {
  it('TRUST_PROXY 가 없으면 X-Forwarded-For 를 무시한다', () => {
    expect(clientIp('10.0.0.2', '1.2.3.4', 0)).toBe('10.0.0.2');
  });

  it('프록시 1단이면 프록시가 붙인 맨 오른쪽 주소를 쓴다', () => {
    expect(clientIp('172.18.0.5', '203.0.113.7', 1)).toBe('203.0.113.7');
  });

  it('클라이언트가 앞에 넣은 가짜 주소는 무시된다', () => {
    expect(clientIp('172.18.0.5', '6.6.6.6, 203.0.113.7', 1)).toBe('203.0.113.7');
  });

  it('프록시 2단이면 오른쪽에서 두 번째 주소를 쓴다', () => {
    expect(clientIp('172.18.0.5', '6.6.6.6, 203.0.113.7, 10.0.0.1', 2)).toBe('203.0.113.7');
  });

  it('헤더가 없거나 주소 수가 모자라면 소켓 주소로 돌아간다', () => {
    expect(clientIp('172.18.0.5', undefined, 1)).toBe('172.18.0.5');
    expect(clientIp('172.18.0.5', '203.0.113.7', 2)).toBe('172.18.0.5');
    expect(clientIp(undefined, undefined, 1)).toBe('unknown');
  });

  it('헤더가 여러 줄이면 이어서 읽는다', () => {
    expect(clientIp('172.18.0.5', ['6.6.6.6', '203.0.113.7'], 1)).toBe('203.0.113.7');
  });
});

describe('trustedHops', () => {
  it('양의 정수만 받는다', () => {
    expect(trustedHops({})).toBe(0);
    expect(trustedHops({ TRUST_PROXY: '1' })).toBe(1);
    expect(trustedHops({ TRUST_PROXY: 'yes' })).toBe(0);
    expect(trustedHops({ TRUST_PROXY: '-1' })).toBe(0);
  });
});
