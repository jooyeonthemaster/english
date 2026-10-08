// 신청함 쪽 나누기 — 파기 기한이 지난 신청은 어느 쪽에서나 맨 위(오래된 순)에 모으고, 나머지는 접수 최신순으로 쪽을 나눈다.
// 예전에는 최신 60건만 읽어 6개월 지난(= 가장 오래된) 신청이 화면에서 빠졌다.

export const FF_ADMIN_PAGE_SIZE = 30;

export interface FfAdminSlice<T> {
  /** 파기 기한 지남 — 오래된 순 */
  overdue: T[];
  /** 이번 쪽 — 접수 최신순 */
  rows: T[];
  page: number;
  pages: number;
  /** 기한 전 신청 수(쪽 나눔 대상) */
  rest: number;
}

/** all 은 접수 최신순이어야 한다. rawPage 는 ?page= 값 그대로(없거나 이상하면 1쪽, 넘치면 마지막 쪽). */
export function ffAdminSlice<T>(all: T[], isOverdue: (r: T) => boolean, rawPage: string | undefined, size = FF_ADMIN_PAGE_SIZE): FfAdminSlice<T> {
  const overdue = all.filter(isOverdue).reverse();
  const rest = all.filter((r) => !isOverdue(r));
  const pages = Math.max(1, Math.ceil(rest.length / size));
  const asked = Math.floor(Number(rawPage));
  const page = Number.isFinite(asked) ? Math.min(pages, Math.max(1, asked)) : 1;
  return { overdue, rows: rest.slice((page - 1) * size, page * size), page, pages, rest: rest.length };
}
