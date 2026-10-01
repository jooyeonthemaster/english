// 인쇄 URL 용 문항 번호 목록 압축 — sortOrder 정수 목록 ↔ 「1-5,9,12-14」(순서 보존, 연속 구간만 접는다)

export function encodeOrderList(orders: number[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < orders.length) {
    let j = i;
    while (j + 1 < orders.length && orders[j + 1] === orders[j] + 1) j += 1;
    out.push(j > i ? `${orders[i]}-${orders[j]}` : String(orders[i]));
    i = j + 1;
  }
  return out.join(",");
}

export function decodeOrderList(s: string | null | undefined): number[] {
  if (!s) return [];
  const out: number[] = [];
  for (const part of s.split(",")) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let k = a; a <= b ? k <= b : k >= b; k += a <= b ? 1 : -1) {
      out.push(k);
      if (out.length >= 2000) return out;
    }
  }
  return out;
}
