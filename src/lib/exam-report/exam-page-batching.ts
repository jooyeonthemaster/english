// ============================================================================
// 시험 직접분석 v4 — 페이지 청크·페이지 국소 배치 계획 (순수 함수, 테스트 대상)
// 정본: docs/exam-analysis-v4-spec.md §1-5 · §3 U1-4
//
// 왜 이 모듈이 있는가: Gemini 경로에서 프롬프트 캐시 플래그는 no-op 이라(llm.ts
// cacheSystem/cacheImages 는 anthropic 전용 게이트) 배치마다 시험지 전 페이지를
// 재전송했다 — 20장 시험지면 6문항 배치 4개가 각각 20장을 실었다. v4 는
// 「콜당 이미지를 줄이는 것」이 유일한 지렛대이므로,
//   E1a: 사진을 ≤6장 청크로 나눠 호출하고(청크가 문항의 발문 시작 장 page 를 낸다),
//   E1b: 대상 문항을 page 오름차순으로 정렬해 ≤6문항·페이지 폭 ≤3장 단위로 자르고,
//        그 배치의 페이지 ±1 인접장(최대 6장)만 첨부한다.
// page 가 없는 문항(구 지도·INTERNAL 지도)은 전 페이지 폴백으로 종전과 같이 돈다
// (무회귀 계약 §3 U1-7).
//
// 이 파일은 DB·네트워크·zod 무의존 — tests/unit/exam-analysis-page-batching.test.mjs
// 가 tsx 하네스로 직접 실행한다.
// ============================================================================

/** E1a 청크당 최대 장수 — llm-images DEFAULT_PAGES_PER_CALL 과 같은 값이어야 한다. */
export const EXAM_MAP_CHUNK_PAGES = 6;
/** E1a 청크 동시 호출 수 */
export const EXAM_MAP_CHUNK_CONCURRENCY = 2;
/** E1b 배치당 최대 문항 수(정답 도출 포함 출력 예산 대비 — 종전 BATCH_SIZE 6 계승) */
export const PAGE_BATCH_MAX_ENTRIES = 6;
/** 한 배치가 걸치는 페이지 폭 상한(장) — 넘으면 거기서 끊는다 */
export const PAGE_BATCH_MAX_PAGE_SPAN = 3;
/** 배치에 첨부하는 이미지 상한(장) — 페이지 폭 3 + 인접 ±1 = 5 ≤ 6 */
export const PAGE_BATCH_MAX_IMAGES = 6;
/** 배치 페이지 범위 앞뒤로 덧붙이는 인접 장수(지문이 앞 장에서 시작하는 문항 대비) */
export const PAGE_BATCH_ADJACENT_PAGES = 1;

function numberKey(value: string): string {
  return value.replace(/\s+/g, "");
}

/** 1-based 전역 장 번호로 유효한가(정수·1 이상·pageCount 이하). */
export function isValidPage(page: number | undefined, pageCount: number): page is number {
  return (
    typeof page === "number" &&
    Number.isInteger(page) &&
    page >= 1 &&
    page <= pageCount
  );
}

/**
 * 배치 페이지 범위 [minPage, maxPage] 에 인접 ±1 을 더한 연속 창을 고른다(전역 1-based,
 * pageCount 로 클램프, 최대 PAGE_BATCH_MAX_IMAGES 장). 상한을 넘으면 대상 범위를 먼저
 * 보존하고 남는 여유를 앞뒤로 나눈다 — 현재 상수(폭 3 + ±1 = 5)로는 상한에 걸리지
 * 않지만 상수를 바꿔도 대상 페이지가 잘리지 않도록 일반형으로 둔다.
 */
export function selectImageWindow(minPage: number, maxPage: number, pageCount: number): number[] {
  if (pageCount <= 0) return [];
  const lo = Math.max(1, Math.min(minPage, maxPage));
  const hi = Math.min(pageCount, Math.max(minPage, maxPage));
  let start = Math.max(1, lo - PAGE_BATCH_ADJACENT_PAGES);
  let end = Math.min(pageCount, hi + PAGE_BATCH_ADJACENT_PAGES);
  if (end - start + 1 > PAGE_BATCH_MAX_IMAGES) {
    const need = hi - lo + 1;
    if (need >= PAGE_BATCH_MAX_IMAGES) {
      start = lo;
      end = Math.min(pageCount, lo + PAGE_BATCH_MAX_IMAGES - 1);
    } else {
      const before = Math.floor((PAGE_BATCH_MAX_IMAGES - need) / 2);
      start = Math.max(1, lo - before);
      end = start + PAGE_BATCH_MAX_IMAGES - 1;
      if (end > pageCount) {
        end = pageCount;
        start = Math.max(1, end - PAGE_BATCH_MAX_IMAGES + 1);
      }
    }
  }
  const pages: number[] = [];
  for (let p = start; p <= end; p += 1) pages.push(p);
  return pages;
}

export interface PageLocalBatch<T> {
  entries: T[];
  /**
   * 첨부할 전역 장 번호(1-based, 오름차순·연속). null = 전 페이지 폴백(page 없는
   * 문항 배치 — 구 지도 무회귀).
   */
  pages: number[] | null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

/**
 * E1b 배치 계획. page 가 유효한 문항은 page 오름차순(같은 page 는 입력 순 유지)으로
 * 정렬해 ①문항 수 ≤ PAGE_BATCH_MAX_ENTRIES ②페이지 폭 ≤ PAGE_BATCH_MAX_PAGE_SPAN
 * 두 조건 중 먼저 깨지는 지점에서 끊고, 각 배치에 selectImageWindow 창을 붙인다.
 * page 없는(또는 pageCount 밖) 문항은 입력 순으로 6개씩 잘라 pages:null(전 페이지)로
 * 뒤에 붙인다. 입력 배열은 변경하지 않는다.
 *
 * forceUnpaged(선택): true 를 돌려주는 문항은 page 가 유효해도 pages:null 그룹으로
 * 보낸다 — 국소 창(±1)에 발문이 없어 FAILED 로 떨어진 문항의 재시도 사다리
 * (exam-analyze-direct: 국소 미스 → 전 페이지 폴백 재분석). 이게 없으면 저장된 page
 * 로 결정론적으로 같은 잘못된 창을 다시 짜서 MAX_QUESTION_ATTEMPTS 를 헛되이 소진한다.
 */
export function planPageLocalBatches<T extends { page?: number }>(
  entries: T[],
  pageCount: number,
  forceUnpaged?: (entry: T) => boolean,
): PageLocalBatch<T>[] {
  const paged: T[] = [];
  const unpaged: T[] = [];
  for (const entry of entries) {
    if (isValidPage(entry.page, pageCount) && !(forceUnpaged?.(entry) ?? false)) paged.push(entry);
    else unpaged.push(entry);
  }
  // Array.prototype.sort 는 안정 정렬(ES2019) — 같은 page 의 입력 순서를 유지한다.
  paged.sort((a, b) => (a.page as number) - (b.page as number));

  const batches: PageLocalBatch<T>[] = [];
  let current: T[] = [];
  let currentMin = 0;
  const flush = () => {
    if (current.length === 0) return;
    const pagesOf = current.map((e) => e.page as number);
    batches.push({
      entries: current,
      pages: selectImageWindow(Math.min(...pagesOf), Math.max(...pagesOf), pageCount),
    });
    current = [];
  };
  for (const entry of paged) {
    const page = entry.page as number;
    const overflow =
      current.length >= PAGE_BATCH_MAX_ENTRIES ||
      (current.length > 0 && page - currentMin + 1 > PAGE_BATCH_MAX_PAGE_SPAN);
    if (overflow) flush();
    if (current.length === 0) currentMin = page;
    current.push(entry);
  }
  flush();

  for (const group of chunk(unpaged, PAGE_BATCH_MAX_ENTRIES)) {
    batches.push({ entries: group, pages: null });
  }
  return batches;
}

// ── E1a 청크 병합 ────────────────────────────────────────────────────────────

export interface ExamMapChunkResult<T> {
  /** 이 청크 첫 장의 전역 인덱스(0-based) */
  offset: number;
  /** 이 청크에 첨부된 장수 */
  pageCount: number;
  /** LLM 이 낸 문항(page 는 청크 내 상대 순번 1-based, order 는 청크 내 논리 순서) */
  questions: T[];
  totalPoints: number | null;
}

/**
 * 청크별 E1a 결과를 하나의 지도로 병합한다.
 * - 중복 번호(공백 제거 키)는 먼저 온 청크가 이긴다(앞 장에서 시작한 문항이 뒷 청크에
 *   지문만 보여 다시 잡히는 경우 — 프롬프트가 금지하지만 드리프트 방어).
 * - page = 청크 offset + 상대 순번(상대 순번이 1..청크 장수 밖이면 undefined → E1b
 *   전 페이지 폴백).
 * - order 는 (청크 순, 청크 내 order) 로 재부여 — 청크 내 순서는 LLM 이 인쇄 페이지
 *   번호로 매긴 논리 순서를 그대로 믿고(prompts.ts E1a 규칙 4), 청크 간은 첨부 순서다.
 * - totalPoints 는 청크 순으로 처음 나온 non-null 값.
 */
export function mergeExamMapChunks<
  T extends { number: string; order: number; page?: number },
>(chunks: ExamMapChunkResult<T>[]): { questions: T[]; totalPoints: number | null } {
  const seen = new Set<string>();
  const merged: { entry: T; chunkIndex: number; localOrder: number }[] = [];
  let totalPoints: number | null = null;
  chunks.forEach((chunkResult, chunkIndex) => {
    if (totalPoints === null && chunkResult.totalPoints != null) {
      totalPoints = chunkResult.totalPoints;
    }
    const sorted = [...chunkResult.questions].sort((a, b) => a.order - b.order);
    for (const q of sorted) {
      const key = numberKey(q.number);
      if (key.length === 0 || seen.has(key)) continue;
      seen.add(key);
      const page = isValidPage(q.page, chunkResult.pageCount)
        ? chunkResult.offset + q.page
        : undefined;
      merged.push({
        entry: page != null ? { ...q, page } : { ...q, page: undefined },
        chunkIndex,
        localOrder: q.order,
      });
    }
  });
  merged.sort((a, b) =>
    a.chunkIndex !== b.chunkIndex ? a.chunkIndex - b.chunkIndex : a.localOrder - b.localOrder,
  );
  const questions = merged.map((m, index) => ({ ...m.entry, order: index + 1 }));
  return { questions, totalPoints };
}
