/**
 * 요청 제한에 쓸 접속자 IP.
 *
 * 웹 컨테이너(nginx) 같은 프록시 뒤에서는 소켓 주소가 모두 프록시 IP 하나로 보이므로,
 * 믿을 수 있는 프록시 수(TRUST_PROXY)만큼 X-Forwarded-For 를 오른쪽에서 읽는다.
 * 각 프록시는 자기가 본 주소를 맨 뒤에 붙이므로, 클라이언트가 앞쪽에 넣은 가짜 값은 무시된다.
 * TRUST_PROXY=0(기본)이면 헤더를 보지 않는다 (api 를 직접 열어 둘 때 IP 위조 방지).
 */
export function trustedHops(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.TRUST_PROXY);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export function clientIp(
  socketAddr: string | undefined,
  forwardedFor: string | string[] | undefined,
  hops: number,
): string {
  const fallback = socketAddr ?? 'unknown';
  if (hops <= 0 || !forwardedFor) return fallback;
  const list = (Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list[list.length - hops] ?? fallback;
}
