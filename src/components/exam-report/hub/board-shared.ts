// ============================================================================
// 학생 시험 리포트 — 분석 현황 보드 공용 모듈 (허브·라이브러리 단일 소스)
//
// 기존에 recent-analyses.tsx 와 library-list.tsx 에 복붙돼 있던 상태 뱃지·시험
// 종류 라벨·고아 DRAFT 판별과, 허브/라이브러리가 서로 다르게 계산하던 베이스
// 경로(hubBase)를 여기로 단일화한다. 분석 시작 fire-and-forget 헬퍼도 공용.
// ============================================================================

import { toast } from "sonner";
import type {
  ExamAnalysisProgress,
  ExamAnalysisStatus,
  ExamType,
} from "@/lib/exam-report/types";
import {
  EXAM_REPORT_REFRESH_EVENT,
  type ExamReportSummaryRow,
} from "@/hooks/use-exam-report-activity";

// ── 베이스 경로 ──────────────────────────────────────────────────────────────

const BASE_MARKER = "/workbench/exam-report";
const BASE_FALLBACK = "/director/workbench/exam-report";

/**
 * 현재 pathname 에서 exam-report 베이스 경로를 계산한다(허브 방식으로 통일).
 * /director|/teacher 프리픽스를 보존하고, 마커가 없으면 director 로 폴백.
 */
export function resolveExamReportBase(
  pathname: string | null | undefined,
): string {
  if (!pathname) return BASE_FALLBACK;
  const idx = pathname.indexOf(BASE_MARKER);
  return idx >= 0 ? pathname.slice(0, idx + BASE_MARKER.length) : BASE_FALLBACK;
}

// ── 표시 메타 ────────────────────────────────────────────────────────────────

export const STATUS_BADGE: Record<
  ExamAnalysisStatus,
  { label: string; className: string; pulse?: boolean }
> = {
  DRAFT: {
    label: "임시저장",
    className: "border border-slate-200 bg-slate-50 text-slate-600",
  },
  ANALYZING: {
    label: "분석 중",
    className: "border border-blue-200 bg-blue-50 text-blue-700",
    pulse: true,
  },
  ANALYZED: {
    label: "분석 완료",
    className: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  FAILED: {
    label: "실패",
    className: "border border-rose-200 bg-rose-50 text-rose-700",
  },
};

export const EXAM_TYPE_LABEL: Record<ExamType, string> = {
  MIDTERM: "중간고사",
  FINAL: "기말고사",
  MOCK: "모의고사",
  OTHER: "기타",
};

// 고아 DRAFT: 등록 도중 실패해 sourceFiles 가 없는 DRAFT(학생 0명). 목록에서
// 숨기지 않고 "등록 미완료" 로 표시해 이어서 등록/삭제로 유도한다(D5).
/**
 * 분석 상태 칩 — 상태는 **둘뿐**이다: 「분석 전」 / 「분석 완료」 (26-09-04 확정).
 *
 * 계보. 처음엔 셋이었다(후보 slate 「분석 전」 / SHALLOW amber 「심층 분석 전」 /
 * DEEP emerald 「심층 분석 완료」). 사용자 지적 1차 — "둘 다 심층 분석 전인데 왜
 * 생긴 게 다르지?" — 로 후보의 상태 문자열을 칩으로 올려 표기 문법을 통일했고,
 * 2차 — "분석 전이랑 심층 분석 전이라는 태그 구분도 이상하잖아. 그냥 분석 전으로
 * 통일하는 게 맞지 않을까?" — 로 **자구 자체를 합쳤다**. 근거:
 *  · 후보(행 없음)와 SHALLOW(행 있고 examLevel 만 없음)의 차이는 ExamAnalysis 행
 *    유무 하나이고, 그 행은 출제 해설을 옮겨 적는 AI 0콜·크레딧 0 작업으로 생긴다
 *    (analysis-pane 이 후보를 열 때 즉시 만든다 — 후보는 이제 과도 상태다).
 *  · SHALLOW 의 「기본 분석」은 우리가 AI 로 분석한 결과가 아니라 **출제할 때 이미
 *    저장해 둔 해설**이다. 그걸 "분석했다"고 부르면 AI 분석을 산 사람과 안 산
 *    사람이 같은 말을 듣는다.
 * 그래서 **AI 분석 전이면 전부 「분석 전」 amber**(다음 행동 있음), 돌렸으면
 * 「분석 완료」 emerald. none 과 SHALLOW 는 자구·색이 같다 — 의도적이다(사용자에게
 * 그 둘은 같은 상태다). 아이콘 색·힌트 줄도 이 신호등 어휘(§4)에 맞춘다.
 */
export const BOARD_CHIP_CLASS =
  "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset";

const PRE_ANALYSIS_CHIP = {
  label: "분석 전",
  className: "bg-amber-50 text-amber-700 ring-amber-200/60",
} as const;

export const ANALYSIS_STATE_CHIP = {
  /** 후보(분석 행 없음) — SHALLOW 와 **같은 칩**(사용자에겐 같은 상태). */
  none: PRE_ANALYSIS_CHIP,
  SHALLOW: PRE_ANALYSIS_CHIP,
  DEEP: {
    label: "분석 완료",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
  },
} as const;

export function isOrphanDraft(row: ExamReportSummaryRow): boolean {
  return (
    row.status === "DRAFT" &&
    row.hasSourceFiles === false &&
    row.studentCount === 0
  );
}

// ── 분석 시작(fire-and-forget) ────────────────────────────────────────────────

/** fire 헬퍼의 결과 — 호출부는 무시해도 된다(fire-and-forget). status 0 = 네트워크 실패. */
export interface FireRequestOutcome {
  ok: boolean;
  status: number;
}

const GENERIC_REQUEST_ERROR = "요청에 실패했습니다";
const NETWORK_ERROR = "요청을 보내지 못했습니다. 네트워크를 확인해 주세요.";

/** 요약 폴을 즉시 1회 돌리라는 신호(use-exam-report-activity 가 듣는다). */
function requestSummaryRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EXAM_REPORT_REFRESH_EVENT));
}

/** 실패 응답 본문 `{ error, code }` 의 error 자구(파스 실패·비문자열은 null). */
async function readErrorMessage(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: unknown } | null;
    return body && typeof body.error === "string" && body.error.length > 0
      ? body.error
      : null;
  } catch {
    return null;
  }
}

/**
 * POST 발사 공용부. **완주를 기다리지 않는다** — 반환 Promise 는 「응답 헤더가
 * 돌아온 시점」에 settle 하며 호출부는 무시해도 된다(void 관례 유지).
 *
 * 무음 삼킴 금지(결함수리 계보): 402 만 토스트하던 시절 재시작 버튼이 거짓 성공처럼
 * 보인 뒤 폴로도 아무 변화가 없어 무한 재클릭 루프에 빠졌다. 이제 402/409 는 전용
 * 자구, 그 외 !ok 는 서버 `{ error }` 자구(E1a EXTRACT_FAILED·NO_QUESTIONS·
 * PROBE_LIMIT·boost 400/403/404/500/502), 네트워크 실패는 별도 자구로 전부 드러낸다.
 * ok(boost 완주 후 200 포함)는 무음 — 폴이 상태를 그린다.
 *
 * 폴 즉시 재조회(exam-report:refresh)는 **2회** 쏜다: ① 발사 직후(서버가 RUNNING/
 * ANALYZING 게이트를 곧 쓰므로 그 폴이 못 보더라도 다음 폴은 activeMs 뒤 — 유휴
 * 30초 백오프를 건너뛴다) ② 응답 직후(analyze 는 202 즉시, boost 는 완주 시점 =
 * DONE/FAILED 를 폴 주기 기다리지 않고 바로 반영).
 */
function fireExamReportPost(
  url: string,
  body: string,
  onStatus: (status: number) => boolean,
): Promise<FireRequestOutcome> {
  const promise = fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body,
  })
    .then(async (res) => {
      requestSummaryRefresh();
      if (!res.ok && !onStatus(res.status)) {
        toast.error((await readErrorMessage(res)) ?? GENERIC_REQUEST_ERROR);
      }
      return { ok: res.ok, status: res.status };
    })
    .catch((): FireRequestOutcome => {
      toast.error(NETWORK_ERROR);
      return { ok: false, status: 0 };
    });
  // ① 발사 직후 — fetch 가 큐에 들어간 뒤 같은 틱에 신호(폴 nonce 재실행).
  requestSummaryRefresh();
  return promise;
}

/**
 * E1 분석 시작/재개 요청을 발사한다. **await 금지** — 서버 자가연쇄(W1)가
 * 완주하므로 클라이언트는 폴링으로만 상태를 본다.
 * (중복 발사는 서버 펜스가 202 로 무해 처리)
 *
 * 반환값은 응답 헤더 시점의 { ok, status } — 호출부가 원하면 결과를 알 수 있다
 * (후보 CTA 의 잠금 해제 등). 무시해도 fire-and-forget 의미는 그대로다.
 */
export function fireAnalyzeRequest(analysisId: string): Promise<FireRequestOutcome> {
  return fireExamReportPost(
    `/api/exam-report/analyses/${analysisId}/analyze`,
    "{}",
    (status) => {
      if (status === 402) {
        toast.error("크레딧이 부족해 분석을 시작하지 못했습니다");
        return true;
      }
      if (status === 409) {
        toast.info("이미 분석이 진행 중입니다");
        return true;
      }
      return false;
    },
  );
}

/**
 * 자체 시험지 AI 분석(analysis-boost, v4 — docs/exam-analysis-v4-spec.md §2.4)
 * 발사. **await 금지** — 라우트가 완주까지 동기 실행(maxDuration 300)하지만 클라는
 * 응답을 기다리지 않고 요약 폴(funnel.boost)로만 진행을 본다. 402(크레딧 부족)와
 * 409(이미 진행 중)는 전용 토스트, 그 외 실패는 서버 자구 토스트(fireAnalyzeRequest
 * 와 같은 공용부). 요청은 라우트가 INTERNAL 분석 행을 스스로 보장하므로 후보(분석
 * 행 없음)에도 유효.
 *
 * `opts.synthOnly` — boost DONE + synthFailed(문항 분석은 저장됨, 총평만 실패) 상태의
 * 「총평 다시 생성」(무과금) 요청. 본문 `{ synthOnly: true }` 로 보낸다(레일은
 * deriveExamNextStep().synthOnly 를 그대로 넘긴다).
 */
export function fireBoostRequest(
  examId: string,
  opts?: { synthOnly?: boolean },
): Promise<FireRequestOutcome> {
  return fireExamReportPost(
    `/api/exams/${examId}/analysis-boost`,
    JSON.stringify(opts?.synthOnly ? { synthOnly: true } : {}),
    (status) => {
      if (status === 402) {
        toast.error("크레딧이 부족해 AI 분석을 시작하지 못했습니다");
        return true;
      }
      if (status === 409) {
        toast.info("이미 AI 분석이 진행 중입니다");
        return true;
      }
      return false;
    },
  );
}

// ── 진행률 표시 ──────────────────────────────────────────────────────────────

/** ETA 라벨 — msPerQuestion 실측이 있을 때만 "약 N분 남음"(최소 1분). */
export function formatAnalysisEta(
  progress: ExamAnalysisProgress | null | undefined,
): string | null {
  if (!progress) return null;
  const { completed, total, msPerQuestion } = progress;
  if (!msPerQuestion || msPerQuestion <= 0) return null;
  const remaining = total - completed;
  if (remaining <= 0) return null;
  const minutes = Math.max(1, Math.ceil((remaining * msPerQuestion) / 60_000));
  return `약 ${minutes}분 남음`;
}

/** 진행률 % (0~100). total 0/음수 방어. */
export function progressPercent(
  progress: ExamAnalysisProgress | null | undefined,
): number {
  if (!progress || progress.total <= 0) return 0;
  return Math.round(
    Math.min(1, Math.max(0, progress.completed / progress.total)) * 100,
  );
}
