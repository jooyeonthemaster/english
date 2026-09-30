// ============================================================================
// 시험지 브라우저 인쇄 원격 측정 메타 — 검증기(순수 함수, 의존 0).
//
// 왜 있나: 브라우저 인쇄(window.print)는 석 달 동안 행위자·결과 기록 없이 백지로 나갔다(26-09-29
// RCA). 인쇄 컨트롤러(components/exams/paper-builder/print/)가 print() 직전 상태를 이 형태로 보내고,
// 서버 액션 incrementExamPrintCount(actions/exams/crud.ts)가 검증해 app_events 에
// EXAM_EXPORT {format:'print', ...meta} 로 남긴다. 운영 감시(읽기 전용 SQL):
//   · metadata->>'format'='print' AND (metadata->>'mountedPages')::int < (metadata->>'pages')::int → 항상 0 이어야 한다
//   · outcome='blocked' · fonts/guard/images='timeout' · fonts='error' · prior='needs-gesture' 분포
//   · guard='stuck'(overflowColumns>0) — 고칠 수 없어 넘친 채 인쇄된 칸(한 칸보다 긴 해설 블록 등, 종이에서 잘림)
//
// 서버 액션 인자는 신뢰할 수 없는 입력이다 — 열거값·정수 범위를 벗어나면 통째로 null(기록 안 함).
// 순수 모듈이라 클라이언트가 타입·열거값을 import 해도 된다(prisma·서버 의존 없음).
// ============================================================================

export const PRINT_EVENT_ENTRIES = [
  "detail",
  "quick-view",
  "card-dialog",
  "deep-link",
  "builder",
] as const;
export const PRINT_EVENT_MODES = ["plain", "explanation"] as const;
/** error = 글꼴 파일 404 · 차단(기다려도 오지 않는다) — 상한 초과(timeout)와 구분한다 */
export const PRINT_EVENT_FONTS = ["loaded", "timeout", "error"] as const;
/** stuck = 가드는 수렴했지만 인쇄 순간 넘친 칸이 남았다(overflowColumns 에 개수) */
export const PRINT_EVENT_GUARD = ["settled", "timeout", "stuck"] as const;
export const PRINT_EVENT_OUTCOMES = ["printed", "blocked"] as const;
/** 선택 필드 — 준비 경로 · 이미지 대기 결과 · 직전 상태(재시도 원인) · 차단 사유 */
export const PRINT_EVENT_PATHS = ["fast", "prepare"] as const;
export const PRINT_EVENT_IMAGES = ["loaded", "timeout"] as const;
export const PRINT_EVENT_PRIORS = ["needs-gesture", "blocked"] as const;
export const PRINT_EVENT_BLOCK_REASONS = ["no-root", "unmounted-pages", "not-primary-root"] as const;

export type ExamPrintEntry = (typeof PRINT_EVENT_ENTRIES)[number];
export type ExamPrintMode = (typeof PRINT_EVENT_MODES)[number];
export type ExamPrintFontsOutcome = (typeof PRINT_EVENT_FONTS)[number];
export type ExamPrintGuardOutcome = (typeof PRINT_EVENT_GUARD)[number];
export type ExamPrintOutcome = (typeof PRINT_EVENT_OUTCOMES)[number];
export type ExamPrintPath = (typeof PRINT_EVENT_PATHS)[number];
export type ExamPrintImagesOutcome = (typeof PRINT_EVENT_IMAGES)[number];
export type ExamPrintPrior = (typeof PRINT_EVENT_PRIORS)[number];
export type ExamPrintBlockReason = (typeof PRINT_EVENT_BLOCK_REASONS)[number];

export interface ExamPrintEventMeta {
  entry: ExamPrintEntry;
  mode: ExamPrintMode;
  /** 인쇄 루트 안 쪽 프레임 수(표지 · 본문 · 정답표) */
  pages: number;
  /** 그중 실제 `.exam-a4-page` 를 가진 프레임 수 — pages 보다 작으면 백지 쪽이 있다 */
  mountedPages: number;
  /** 인쇄 요청부터 print() 호출(또는 차단)까지 ms */
  prepareMs: number;
  fonts: ExamPrintFontsOutcome;
  guard: ExamPrintGuardOutcome;
  outcome: ExamPrintOutcome;
  path?: ExamPrintPath;
  images?: ExamPrintImagesOutcome;
  prior?: ExamPrintPrior;
  blockReason?: ExamPrintBlockReason;
  /** 인쇄(또는 차단) 순간 실측한 넘친 칸 수 — 0 이면 생략한다 */
  overflowColumns?: number;
}

const MAX_PAGES = 5000;
const MAX_PREPARE_MS = 600000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function intInRange(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

/**
 * 원격 측정 메타 검증. 필수 필드 중 하나라도 어긋나면 null. 선택 필드는 값이 있을 때 열거값이
 * 아니면 null(조용히 버리지 않는다 — 잘못된 클라이언트를 드러내기 위해). 알 수 없는 키는 버린다.
 */
export function parsePrintEventMeta(input: unknown): ExamPrintEventMeta | null {
  if (!isRecord(input)) return null;
  const { entry, mode, pages, mountedPages, prepareMs, fonts, guard, outcome } = input;
  if (!oneOf(PRINT_EVENT_ENTRIES, entry)) return null;
  if (!oneOf(PRINT_EVENT_MODES, mode)) return null;
  if (!intInRange(pages, MAX_PAGES) || !intInRange(mountedPages, MAX_PAGES)) return null;
  if (!intInRange(prepareMs, MAX_PREPARE_MS)) return null;
  if (!oneOf(PRINT_EVENT_FONTS, fonts)) return null;
  if (!oneOf(PRINT_EVENT_GUARD, guard)) return null;
  if (!oneOf(PRINT_EVENT_OUTCOMES, outcome)) return null;

  const meta: ExamPrintEventMeta = {
    entry,
    mode,
    pages,
    mountedPages,
    prepareMs,
    fonts,
    guard,
    outcome,
  };
  const optional: Array<[keyof ExamPrintEventMeta, readonly string[]]> = [
    ["path", PRINT_EVENT_PATHS],
    ["images", PRINT_EVENT_IMAGES],
    ["prior", PRINT_EVENT_PRIORS],
    ["blockReason", PRINT_EVENT_BLOCK_REASONS],
  ];
  for (const [key, values] of optional) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    if (!oneOf(values, value)) return null;
    (meta as unknown as Record<string, unknown>)[key] = value;
  }
  const { overflowColumns } = input;
  if (overflowColumns !== undefined && overflowColumns !== null) {
    if (!intInRange(overflowColumns, MAX_PAGES * 4)) return null;
    meta.overflowColumns = overflowColumns;
  }
  return meta;
}

/**
 * 이 인쇄 요청이 인쇄 횟수(printCount)에 들어가는가. 차단(blocked)은 print() 를 부르지 않았으므로
 * 빼고, 메타가 없거나 검증에 실패한 종전 호출은 종전처럼 센다(하위 호환).
 */
export function printEventCountsAsPrint(input: unknown): boolean {
  return !(isRecord(input) && input.outcome === "blocked");
}
