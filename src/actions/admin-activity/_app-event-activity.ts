// ============================================================================
// 관리자 활동 피드 — app_events 한 행 → 피드 항목(분류·제목·상세·상태·정리된 메타).
// 순수 모듈(prisma·서버 의존 0, "use server" 아님). _sources.ts fromAppEvents 가 쓴다.
//
// 왜 따로 있나(26-09-30):
//   · 예전 fromAppEvents 는 PAGE_VIEW·LOGIN 이 아니면 전부 「시험지 내보내기 (?)」로 보였다.
//     지문 삭제(PASSAGE_DELETE)가 「시험지 내보내기 (?)」로, 문항 내보내기가 시험지 내보내기로,
//     준비 실패로 print() 를 부르지도 못한 인쇄(outcome:'blocked')가 성공한 내보내기처럼 보였다.
//   · metadata 를 그대로 클라이언트로 보냈다. PASSAGE_DELETE 의 metadata 에는 떼어 보관한 지문
//     원문(sourcePassage.content, 한 편 최대 약 13KB)이 들어 있다 → 서버에서 본문을 글자 수로
//     바꿔 치우고, 긴 문자열·긴 배열은 자른다.
// 인쇄 원격 측정 계약: src/lib/exams/print-event-meta.ts · docs/EXAM-PRINT-PIPELINE.md §7.
// outcome 은 'printed' 만 성공으로 본다 — 모르는 값(계약이 늘어나도)은 성공으로 보이지 않는다.
// ============================================================================

import type {
  ActivityCategory,
  ActivityFilter,
  ActivityStatus,
} from "@/lib/admin-activity-types";
import { loginProviderLabel, pagePathLabel } from "@/lib/admin-activity-labels";

export const PASSAGE_DELETE_EVENT_TYPE = "PASSAGE_DELETE";
const EXPORT_EVENT_TYPES = ["EXAM_EXPORT", "QUESTION_EXPORT"];
const CONTENT_EVENT_TYPES = [PASSAGE_DELETE_EVENT_TYPE];

export interface AppEventView {
  category: ActivityCategory;
  title: string;
  detail: string | null;
  status: ActivityStatus;
  metadata: Record<string, unknown> | null;
}

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** 분류 필터 → app_events eventType 조건. 이 분류에 app_events 가 없으면 null(조회하지 않는다). */
export function appEventTypeWhere(category?: ActivityFilter): Rec | null {
  switch (category) {
    case undefined:
    case "all":
      return {};
    case "PAGE_VIEW":
      return { eventType: "PAGE_VIEW" };
    case "AUTH":
      return { eventType: "LOGIN" };
    case "EXPORT":
      return { eventType: { in: EXPORT_EVENT_TYPES } };
    case "CONTENT":
      return { eventType: { in: CONTENT_EVENT_TYPES } };
    default:
      return null;
  }
}

// ─── metadata 정리 ────────────────────────────────────────────────────────────

/** 본문이 들어가는 키 — 값(문자열)은 보내지 않고 `${key}Chars` 글자 수로 바꾼다. */
const BODY_KEYS = new Set(["content", "sourceContent", "passageContent"]);
const MAX_STRING = 300;
const MAX_ARRAY = 50;
const MAX_DEPTH = 4;

function sanitizeValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") {
    return value.length > MAX_STRING
      ? `${value.slice(0, MAX_STRING)}…(+${value.length - MAX_STRING}자)`
      : value;
  }
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return `[배열 ${value.length}개]`;
    const head = value.slice(0, MAX_ARRAY).map((v) => sanitizeValue(v, depth + 1));
    if (value.length > MAX_ARRAY) head.push(`…(+${value.length - MAX_ARRAY}개)`);
    return head;
  }
  if (isRec(value)) {
    if (depth >= MAX_DEPTH) return "[객체]";
    const out: Rec = {};
    for (const [key, v] of Object.entries(value)) {
      if (BODY_KEYS.has(key) && typeof v === "string") {
        out[`${key}Chars`] = v.length;
        continue;
      }
      out[key] = sanitizeValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** 클라이언트로 보낼 metadata — 본문 제거 · 긴 문자열/배열 자르기 · 깊이 제한. 객체가 아니면 null. */
export function sanitizeActivityMetadata(metadata: unknown): Rec | null {
  if (!isRec(metadata)) return null;
  return sanitizeValue(metadata, 0) as Rec;
}

// ─── 인쇄(EXAM_EXPORT format:'print') ─────────────────────────────────────────

const PRINT_ENTRY_LABELS: Record<string, string> = {
  detail: "상세",
  "quick-view": "빠른 보기",
  "card-dialog": "목록 카드",
  "deep-link": "새 탭 링크",
  builder: "빌더",
};

const PRINT_BLOCK_REASON_LABELS: Record<string, string> = {
  "no-root": "인쇄 영역 없음",
  "unmounted-pages": "그려지지 않은 쪽",
  "not-primary-root": "다른 인쇄 영역과 충돌",
};

function describePrint(meta: Rec): Pick<AppEventView, "title" | "detail" | "status"> {
  const outcome = str(meta.outcome);
  const parts: string[] = [];
  const docTitle = str(meta.title);
  if (docTitle) parts.push(docTitle);
  const entry = str(meta.entry);
  if (entry) parts.push(PRINT_ENTRY_LABELS[entry] ?? entry);
  if (meta.mode === "explanation") parts.push("해설");

  const pages = int(meta.pages);
  const mountedPages = int(meta.mountedPages);
  const blankPages =
    pages !== null && mountedPages !== null && mountedPages < pages ? pages - mountedPages : 0;

  const warnings: string[] = [];
  const overflow = int(meta.overflowColumns);
  if (meta.guard === "stuck" || (overflow !== null && overflow > 0)) {
    warnings.push(`넘친 칸 ${overflow ?? "?"}`);
  }
  if (meta.guard === "timeout") warnings.push("조판 대기 초과");
  if (meta.fonts === "error") warnings.push("시험지 글꼴 거부(대체 글꼴)");
  else if (meta.fonts === "timeout") warnings.push("글꼴 대기 초과");
  if (meta.images === "timeout") warnings.push("이미지 대기 초과");
  if (meta.prior === "needs-gesture") warnings.push("제스처 재시도");

  // outcome 이 없는 행은 원격 측정 이전 형태로 보고 종전 제목을 쓴다(현재 코드는 outcome 을 필수로 싣는다).
  if (outcome === "printed" || outcome === null) {
    if (blankPages > 0) {
      return {
        title: "시험지 인쇄 불완전 (PRINT)",
        detail: [...parts, `백지 쪽 ${blankPages}`, ...warnings].join(" · ") || null,
        status: "FAILED",
      };
    }
    // 인쇄 창까지 간 인쇄는 다른 내보내기(HWPX·DOCX)와 같은 INFO — 경고는 상세에 싣는다.
    return {
      title: "시험지 내보내기 (PRINT)",
      detail: [...parts, ...warnings].join(" · ") || null,
      status: "INFO",
    };
  }
  if (outcome === "blocked") {
    const reason = str(meta.blockReason);
    return {
      title: "시험지 인쇄 실패 (PRINT)",
      detail:
        [...parts, `차단: ${reason ? (PRINT_BLOCK_REASON_LABELS[reason] ?? reason) : "사유 미상"}`, ...warnings].join(" · "),
      status: "FAILED",
    };
  }
  return {
    title: "시험지 인쇄 미완료 (PRINT)",
    detail: [...parts, `결과: ${outcome}`, ...warnings].join(" · "),
    status: "FAILED",
  };
}

// ─── 지문 삭제(PASSAGE_DELETE) ────────────────────────────────────────────────

function describePassageDelete(meta: Rec): Pick<AppEventView, "title" | "detail" | "status"> {
  const title = str(meta.title) ?? "(제목 없음)";
  const live = int(meta.liveQuestionCount) ?? 0;
  const trashed = int(meta.trashedQuestionCount) ?? 0;
  const examCount = Array.isArray(meta.examIds) ? meta.examIds.length : 0;
  const questions =
    live + trashed > 0
      ? `문제 ${live + trashed}개${trashed > 0 ? `(휴지통 ${trashed})` : ""}${examCount > 0 ? ` · 시험지 ${examCount}개` : ""}`
      : null;
  const parts: string[] = [];
  if (meta.via === "m1-unpromote") parts.push("검수 취소");
  switch (meta.mode) {
    case "relinked":
      parts.push("동일 지문으로 옮겨 연결");
      break;
    case "detached":
      parts.push("원문 보관");
      break;
    default:
      if (live + trashed === 0) parts.push("연결 문제 없음");
  }
  if (questions) parts.push(questions);
  return { title: `지문 삭제 — ${title}`, detail: parts.join(" · ") || null, status: "INFO" };
}

// ─── 한 행 → 피드 항목 ────────────────────────────────────────────────────────

export function describeAppEvent(eventType: string, metadata: unknown): AppEventView {
  const meta: Rec = isRec(metadata) ? metadata : {};
  const clean = sanitizeActivityMetadata(metadata);
  const format = String(meta.format ?? "?").toUpperCase();

  if (eventType === "PAGE_VIEW") {
    const path = str(meta.path);
    return { category: "PAGE_VIEW", title: pagePathLabel(path), detail: path, status: "INFO", metadata: clean };
  }
  if (eventType === "LOGIN") {
    return {
      category: "AUTH",
      title: "로그인",
      detail: `방식: ${loginProviderLabel(String(meta.provider ?? ""))}`,
      status: "INFO",
      metadata: clean,
    };
  }
  if (eventType === "EXAM_EXPORT") {
    if (meta.format === "print") return { category: "EXPORT", ...describePrint(meta), metadata: clean };
    return {
      category: "EXPORT",
      title: `시험지 내보내기 (${format})`,
      detail: String(meta.title ?? ""),
      status: "INFO",
      metadata: clean,
    };
  }
  if (eventType === "QUESTION_EXPORT") {
    return {
      category: "EXPORT",
      title: `문항 내보내기 (${format})`,
      detail: meta.includeAnswers === true ? "정답 포함" : null,
      status: "INFO",
      metadata: clean,
    };
  }
  if (eventType === PASSAGE_DELETE_EVENT_TYPE) {
    return { category: "CONTENT", ...describePassageDelete(meta), metadata: clean };
  }
  // 모르는 이벤트형 — 원문 그대로(라벨 누락이 화면에 드러나게). *_EXPORT 만 내보내기로 분류한다.
  return {
    category: /_EXPORT$/.test(eventType) ? "EXPORT" : "CONTENT",
    title: eventType,
    detail: null,
    status: "INFO",
    metadata: clean,
  };
}
