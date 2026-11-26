/** 대사창 최대 줄 수 (DLG-03) */
export const MAX_LINES = 3;

/**
 * 글자들의 세로 위치(offsetTop)로 줄 번호를 매기고, maxLines 줄씩 묶은 페이지 번호를 돌려준다.
 * 같은 줄의 글자는 offsetTop 이 같거나 거의 같다 (반 줄 미만 차이는 같은 줄로 본다).
 */
export function pageIndexes(tops: number[], lineHeight: number, maxLines = MAX_LINES): number[] {
  if (!(lineHeight > 0)) return tops.map(() => 0);
  let line = 0;
  let lineTop = tops[0] ?? 0;
  return tops.map((t) => {
    if (t > lineTop + lineHeight / 2) {
      line += Math.round((t - lineTop) / lineHeight) || 1;
      lineTop = t;
    }
    return Math.floor(line / maxLines);
  });
}
