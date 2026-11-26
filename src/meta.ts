/** 운영 패널의 방송 정보 입력 정리 (ADM-04). 제목이 비면 null. */
export function parseMetaInput(title: string, category: string, tags: string) {
  const t = title.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!t) return null;
  const tagList = [
    ...new Set(
      tags
        .split(/[,，#]/)
        .map((x) => x.replace(/\s+/g, ' ').trim().slice(0, 12))
        .filter(Boolean),
    ),
  ].slice(0, 5);
  return { title: t, category: category.replace(/\s+/g, ' ').trim().slice(0, 20), tags: tagList };
}
